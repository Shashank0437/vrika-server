"""Signed server-to-server synchronization of Vrika permissions into Cloud Security."""

import hashlib
import hmac
import json
import logging
import time

import httpx
from fastapi import HTTPException

from app.services.access import effective_bindings

logger = logging.getLogger(__name__)


async def _bridge_post(settings, path, payload):
    secret = (
        settings.prowler_bridge_secret.strip() or settings.vrika_bridge_secret.strip()
    )
    if not secret:
        raise HTTPException(503, "Cloud Security bridge is not configured")
    body = json.dumps(payload, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    url = settings.prowler_api_base_url.rstrip("/") + path
    headers = {
        "Content-Type": "application/vnd.api+json",
        "X-Vrika-Timestamp": timestamp,
        "X-Vrika-Signature": signature,
    }
    if "host.docker.internal" in url:
        headers["Host"] = "127.0.0.1"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, content=body, headers=headers)
        response.raise_for_status()
    attributes = response.json()["data"]["attributes"]
    if not isinstance(attributes, dict):
        raise ValueError("Invalid Cloud bridge response")
    return attributes


async def get_provider_project_ids(db, settings, org_id, provider_id):
    link = await db.prowler_tenant_links.find_one({"vrika_organization_id": org_id})
    tenant_id = link.get("prowler_tenant_id") if link else None
    if not tenant_id:
        tenants = await db.prowler_user_links.distinct(
            "prowler_tenant_id", {"vrika_organization_id": org_id}
        )
        if len(tenants) == 1:
            tenant_id = tenants[0]
    if not tenant_id:
        logger.warning("Blocked provider project lookup: no unique Cloud tenant (org=%s)", org_id)
        raise HTTPException(409, "No unique Cloud tenant is linked to this organization")
    try:
        attributes = await _bridge_post(settings, "/internal/vrika-provider-projects", {
            "data": {"type": "vrika-provider-projects", "attributes": {
                "tenant_id": str(tenant_id), "provider_id": provider_id,
            }},
        })
        project_ids = attributes["project_ids"]
        if (
            attributes["tenant_id"] != str(tenant_id)
            or attributes["provider_id"] != provider_id
            or not isinstance(project_ids, list)
            or any(not isinstance(pid, str) or not pid for pid in project_ids)
        ):
            raise ValueError("Invalid provider project lookup response")
        return project_ids
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.error(
            "Cloud provider project lookup failed (org=%s provider=%s error=%s)",
            org_id, provider_id, type(exc).__name__,
        )
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 404:
            raise HTTPException(409, "Provider not found in the linked Cloud tenant") from exc
        raise HTTPException(503, "Could not verify the provider's Cloud project; email was not sent") from exc


async def sync_cloud_access(
    db,
    settings,
    user,
    *,
    issue_tokens=False,
    project_id=None,
    provision=None,
    provision_link=None,
    provider_assignment=None,
    list_providers=False,
):
    link = provision_link or await db.prowler_user_links.find_one(
        {"vrika_user_id": user["_id"]}
    )
    if not link:
        return None
    projects = await db.projects.find(
        {"organization_id": user["organization_id"]}
    ).to_list(length=None)
    payload = {
        "data": {
            "type": "vrika-access",
            "attributes": {
                "vrika_user_id": str(user["_id"]),
                "email": link["prowler_email"],
                "tenant_id": str(link["prowler_tenant_id"]),
                "bindings": effective_bindings(user),
                "access_version": user.get("access_version", 0),
                "projects": [str(p["_id"]) for p in projects],
                "issue_tokens": issue_tokens,
                "project_id": project_id,
                "provision": provision,
                "provider_assignment": provider_assignment,
                "list_providers": list_providers,
            },
        }
    }
    try:
        attributes = await _bridge_post(settings, "/internal/vrika-access", payload)
        if not attributes.get("synced"):
            raise ValueError("Synchronization was not acknowledged")
        return attributes
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.error(
            "Cloud permission sync failed org=%s user=%s: %s",
            user["organization_id"],
            user["_id"],
            type(exc).__name__,
        )
        raise HTTPException(
            503,
            "Could not synchronize Cloud Security permissions; access change was not saved",
        ) from exc
