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
    secret = (
        settings.prowler_bridge_secret.strip() or settings.vrika_bridge_secret.strip()
    )
    if not secret:
        raise HTTPException(
            503, "Cloud Security permission synchronization is not configured"
        )
    projects = await db.projects.find(
        {"organization_id": user["organization_id"]}
    ).to_list(length=None)
    body = json.dumps(
        {
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
        },
        separators=(",", ":"),
    ).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    url = settings.prowler_api_base_url.rstrip("/") + "/internal/vrika-access"
    headers = {
        "Content-Type": "application/vnd.api+json",
        "X-Vrika-Timestamp": timestamp,
        "X-Vrika-Signature": signature,
    }
    if "host.docker.internal" in url:
        headers["Host"] = "127.0.0.1"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, content=body, headers=headers)
            response.raise_for_status()
        attributes = response.json()["data"]["attributes"]
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
