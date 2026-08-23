"""HTTP client for the Prowler API (JSON:API)."""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx
from jose import jwt

from app.config import Settings

_JSON_HEADERS = {
    "Content-Type": "application/vnd.api+json",
    "Accept": "application/vnd.api+json",
}


class ProwlerApiError(Exception):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.message = message
        self.status = status


def _api_root(settings: Settings) -> str:
    base = settings.prowler_api_base_url.strip().rstrip("/")
    if not base:
        raise ProwlerApiError("PROWLER_API_BASE_URL is not configured")
    return base


def parse_json_api_attrs(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        attrs = data.get("attributes")
        if isinstance(attrs, dict):
            return attrs
    raise ProwlerApiError("Unexpected Prowler API response shape")


async def _request(
    settings: Settings,
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    bearer: str | None = None,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    url = urljoin(f"{_api_root(settings)}/", path.lstrip("/"))
    headers = dict(_JSON_HEADERS)
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    timeout = httpx.Timeout(settings.prowler_timeout_seconds)
    # When proxied via host.docker.internal, Django rejects unknown Host headers.
    if "host.docker.internal" in url:
        headers["Host"] = "127.0.0.1"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method,
                url,
                headers=headers,
                json=json_body,
                params=params,
            )
    except httpx.RequestError as exc:
        raise ProwlerApiError(f"Cannot reach Prowler API: {exc}") from exc

    text = response.text
    if response.status_code >= 400:
        detail = text[:500] if text else response.reason_phrase
        raise ProwlerApiError(
            f"Prowler API {method} {path} returned HTTP {response.status_code}: {detail}",
            status=response.status_code,
        )

    if not text:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise ProwlerApiError("Prowler API returned non-JSON response") from exc


async def obtain_tokens(
    settings: Settings,
    *,
    email: str,
    password: str,
    tenant_id: str | None = None,
) -> tuple[str, str, str | None]:
    attrs: dict[str, Any] = {"email": email, "password": password}
    if tenant_id:
        attrs["tenant_id"] = tenant_id
    payload = await _request(
        settings,
        "POST",
        "tokens",
        json_body={"data": {"type": "tokens", "attributes": attrs}},
    )
    out = parse_json_api_attrs(payload)
    access = out.get("access")
    refresh = out.get("refresh")
    if not isinstance(access, str) or not isinstance(refresh, str):
        raise ProwlerApiError("Prowler token response missing access/refresh")
    resolved_tenant = tenant_id
    if not resolved_tenant and isinstance(out.get("tenant_id"), str):
        resolved_tenant = out["tenant_id"]
    return access, refresh, resolved_tenant


async def create_user(
    settings: Settings,
    *,
    email: str,
    password: str,
    name: str,
    company_name: str | None = None,
    invitation_token: str | None = None,
) -> dict[str, Any]:
    attrs: dict[str, Any] = {
        "email": email,
        "password": password,
        "name": name,
    }
    if company_name:
        attrs["company_name"] = company_name
    params = {"invitation_token": invitation_token} if invitation_token else None
    return await _request(
        settings,
        "POST",
        "users",
        json_body={"data": {"type": "users", "attributes": attrs}},
        params=params,
    )


async def list_roles(
    settings: Settings,
    *,
    access_token: str,
) -> list[dict[str, Any]]:
    payload = await _request(
        settings,
        "GET",
        "roles",
        bearer=access_token,
        params={"page[size]": "100"},
    )
    data = payload.get("data")
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


async def create_role(
    settings: Settings,
    *,
    access_token: str,
    name: str,
    permissions: dict[str, bool],
) -> dict[str, Any]:
    return await _request(
        settings,
        "POST",
        "roles",
        bearer=access_token,
        json_body={
            "data": {
                "type": "roles",
                "attributes": {"name": name, **permissions},
            }
        },
    )


async def create_invitation(
    settings: Settings,
    *,
    access_token: str,
    email: str,
    role_ids: list[str],
) -> dict[str, Any]:
    if not role_ids:
        raise ProwlerApiError("Cannot create a Prowler invitation without a role")
    return await _request(
        settings,
        "POST",
        "tenants/invitations",
        bearer=access_token,
        json_body={
            "data": {
                "type": "invitations",
                "attributes": {"email": email},
                "relationships": {
                    "roles": {
                        "data": [
                            {"type": "roles", "id": role_id} for role_id in role_ids
                        ]
                    }
                },
            }
        },
    )


async def patch_tenant_name(
    settings: Settings,
    *,
    access_token: str,
    tenant_id: str,
    name: str,
) -> dict[str, Any]:
    return await _request(
        settings,
        "PATCH",
        f"tenants/{tenant_id}",
        bearer=access_token,
        json_body={
            "data": {
                "type": "tenants",
                "id": tenant_id,
                "attributes": {"name": name},
            }
        },
    )


async def fetch_tenant_id_from_token(
    settings: Settings,
    access_token: str,
) -> str:
    try:
        claims = jwt.get_unverified_claims(access_token)
        tenant_id = claims.get("tenant_id")
        if isinstance(tenant_id, str) and tenant_id:
            return tenant_id
    except Exception:
        pass

    payload = await _request(
        settings,
        "GET",
        "users/me?include=memberships",
        bearer=access_token,
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ProwlerApiError("Prowler users/me response missing data")

    included = payload.get("included")
    if isinstance(included, list):
        for item in included:
            if not isinstance(item, dict):
                continue
            rels = item.get("relationships")
            if not isinstance(rels, dict):
                continue
            tenant_rel = rels.get("tenant")
            if not isinstance(tenant_rel, dict):
                continue
            tenant_data = tenant_rel.get("data")
            if isinstance(tenant_data, dict) and tenant_data.get("id"):
                return str(tenant_data["id"])

    rels = data.get("relationships")
    if isinstance(rels, dict):
        memberships = rels.get("memberships")
        if isinstance(memberships, dict):
            mem_data = memberships.get("data")
            if isinstance(mem_data, list) and mem_data:
                first = mem_data[0]
                if isinstance(first, dict) and first.get("id"):
                    # Membership id only — fall through to token tenant claim via obtain.
                    pass

    raise ProwlerApiError("Could not resolve Prowler tenant id for user")
