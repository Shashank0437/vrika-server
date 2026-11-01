"""Mint Mobile Security iframe embed tokens for the vrika-mobile-security bridge."""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

from app.config import Settings
from app.services.prowler_bridge import ProwlerBridgeError, _b64url_encode

_EMBED_TTL_SECONDS = 60
_MOBILE_SECURITY_EMBED_BASE_PATH = "/mobsf/vrika-embed"


def _mobile_bridge_secret(settings: Settings) -> str:
    secret = settings.vrika_bridge_secret.strip()
    if not secret:
        raise ProwlerBridgeError("VRIKA_BRIDGE_SECRET must be configured")
    return secret


def _mobile_role_for(user: dict[str, Any]) -> str:
    from app.services.access import effective_bindings

    for binding in effective_bindings(user):
        if binding["role"] in {"admin", "lead", "analyst"}:
            return "maintainer"
    return "viewer"


def get_mobile_security_embed_path(settings: Settings, user: dict[str, Any]) -> str:
    secret = _mobile_bridge_secret(settings)
    body = {
        "email": user["email"],
        "role": _mobile_role_for(user),
        "exp": int(datetime.now(UTC).timestamp()) + _EMBED_TTL_SECONDS,
        "nonce": secrets.token_urlsafe(16),
    }
    body_b64 = _b64url_encode(json.dumps(body, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), body_b64.encode(), hashlib.sha256).hexdigest()
    token = f"{body_b64}.{sig}"
    query = urlencode({"token": token, "redirect": "/"})
    return f"{_MOBILE_SECURITY_EMBED_BASE_PATH}?{query}"
