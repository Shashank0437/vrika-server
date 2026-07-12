"""Provision Prowler tenants/users for Vrika orgs and mint iframe embed tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import string
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

from bson import ObjectId
from cryptography.fernet import Fernet, InvalidToken
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings
from app.redis_client import get_redis
from app.services import prowler_client

_EMBED_NONCE_PREFIX = "prowler_embed:"
_EMBED_TTL_SECONDS = 60


class ProwlerBridgeError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _bridge_secret(settings: Settings) -> str:
    secret = (
        settings.prowler_bridge_secret.strip()
        or settings.vrika_bridge_secret.strip()
    )
    if not secret:
        raise ProwlerBridgeError(
            "PROWLER_BRIDGE_SECRET or VRIKA_BRIDGE_SECRET must be configured"
        )
    return secret


def _fernet(settings: Settings) -> Fernet:
    key = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_password(settings: Settings, password: str) -> str:
    return _fernet(settings).encrypt(password.encode()).decode()


def decrypt_password(settings: Settings, token: str) -> str:
    try:
        return _fernet(settings).decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ProwlerBridgeError("Stored Prowler credentials are invalid") from exc


def _random_password(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64url_decode(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + pad)


def mint_embed_token(settings: Settings, *, access: str, refresh: str) -> str:
    secret = _bridge_secret(settings)
    nonce = secrets.token_urlsafe(16)
    body = {
        "access": access,
        "refresh": refresh,
        "exp": int(datetime.now(UTC).timestamp()) + _EMBED_TTL_SECONDS,
        "nonce": nonce,
    }
    body_b64 = _b64url_encode(json.dumps(body, separators=(",", ":")).encode())
    sig = hmac.new(
        secret.encode(),
        body_b64.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{body_b64}.{sig}"


async def _store_embed_nonce(nonce: str) -> None:
    r = get_redis()
    await r.setex(f"{_EMBED_NONCE_PREFIX}{nonce}", _EMBED_TTL_SECONDS, "1")


def _embed_path(settings: Settings, token: str, redirect: str = "/") -> str:
    base = settings.prowler_public_base_path.rstrip("/") or "/prowler"
    query = urlencode({"token": token, "redirect": redirect})
    return f"{base}/api/auth/vrika-embed?{query}"


async def _save_user_link(
    db: AsyncIOMotorDatabase,
    *,
    vrika_user_id: ObjectId,
    vrika_org_id: ObjectId,
    email: str,
    password: str,
    prowler_tenant_id: str,
    settings: Settings,
) -> None:
    now = datetime.now(UTC)
    await db.prowler_user_links.update_one(
        {"vrika_user_id": vrika_user_id},
        {
            "$set": {
                "vrika_organization_id": vrika_org_id,
                "prowler_email": email,
                "prowler_password_enc": encrypt_password(settings, password),
                "prowler_tenant_id": prowler_tenant_id,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def _save_org_link(
    db: AsyncIOMotorDatabase,
    *,
    vrika_org_id: ObjectId,
    prowler_tenant_id: str,
    vrika_owner_user_id: ObjectId,
    prowler_owner_email: str,
) -> None:
    now = datetime.now(UTC)
    await db.prowler_tenant_links.update_one(
        {"vrika_organization_id": vrika_org_id},
        {
            "$set": {
                "prowler_tenant_id": prowler_tenant_id,
                "vrika_owner_user_id": vrika_owner_user_id,
                "prowler_owner_email": prowler_owner_email,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def _provision_first_org_user(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    *,
    user: dict[str, Any],
    org: dict[str, Any],
) -> dict[str, Any]:
    email = str(user["email"]).strip().lower()
    name = str(user.get("username") or email.split("@")[0]).strip() or email
    org_name = str(org.get("name") or "Vrika Organization").strip()
    password = _random_password()

    await prowler_client.create_user(
        settings,
        email=email,
        password=password,
        name=name,
        company_name=org_name,
    )

    access, refresh, tenant_id = await prowler_client.obtain_tokens(
        settings,
        email=email,
        password=password,
    )
    if not tenant_id:
        tenant_id = await prowler_client.fetch_tenant_id_from_token(settings, access)

    await prowler_client.patch_tenant_name(
        settings,
        access_token=access,
        tenant_id=tenant_id,
        name=org_name,
    )

    vrika_user_id = user["_id"]
    vrika_org_id = user["organization_id"]
    await _save_org_link(
        db,
        vrika_org_id=vrika_org_id,
        prowler_tenant_id=tenant_id,
        vrika_owner_user_id=vrika_user_id,
        prowler_owner_email=email,
    )
    await _save_user_link(
        db,
        vrika_user_id=vrika_user_id,
        vrika_org_id=vrika_org_id,
        email=email,
        password=password,
        prowler_tenant_id=tenant_id,
        settings=settings,
    )
    return {
        "prowler_email": email,
        "prowler_password": password,
        "prowler_tenant_id": tenant_id,
        "access": access,
        "refresh": refresh,
    }


async def _provision_additional_org_user(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    *,
    user: dict[str, Any],
    org_link: dict[str, Any],
) -> dict[str, Any]:
    owner_link = await db.prowler_user_links.find_one(
        {"vrika_user_id": org_link["vrika_owner_user_id"]},
    )
    if not owner_link:
        raise ProwlerBridgeError(
            "Prowler org owner credentials are missing; contact your administrator"
        )

    owner_email = str(owner_link["prowler_email"])
    owner_password = decrypt_password(settings, owner_link["prowler_password_enc"])
    tenant_id = str(org_link["prowler_tenant_id"])

    owner_access, _, _ = await prowler_client.obtain_tokens(
        settings,
        email=owner_email,
        password=owner_password,
        tenant_id=tenant_id,
    )

    email = str(user["email"]).strip().lower()
    name = str(user.get("username") or email.split("@")[0]).strip() or email
    password = _random_password()

    invitation = await prowler_client.create_invitation(
        settings,
        access_token=owner_access,
        email=email,
    )
    inv_attrs = prowler_client.parse_json_api_attrs(invitation)
    invitation_token = inv_attrs.get("token")
    if not isinstance(invitation_token, str) or not invitation_token:
        raise ProwlerBridgeError("Prowler invitation did not return a token")

    await prowler_client.create_user(
        settings,
        email=email,
        password=password,
        name=name,
        invitation_token=invitation_token,
    )

    access, refresh, _ = await prowler_client.obtain_tokens(
        settings,
        email=email,
        password=password,
        tenant_id=tenant_id,
    )

    await _save_user_link(
        db,
        vrika_user_id=user["_id"],
        vrika_org_id=user["organization_id"],
        email=email,
        password=password,
        prowler_tenant_id=tenant_id,
        settings=settings,
    )
    return {
        "prowler_email": email,
        "prowler_password": password,
        "prowler_tenant_id": tenant_id,
        "access": access,
        "refresh": refresh,
    }


async def provision_prowler_user(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    user: dict[str, Any],
) -> dict[str, Any]:
    org = await db.organizations.find_one({"_id": user["organization_id"]})
    if not org:
        raise ProwlerBridgeError("Vrika organization not found")

    org_link = await db.prowler_tenant_links.find_one(
        {"vrika_organization_id": user["organization_id"]},
    )
    if not org_link:
        return await _provision_first_org_user(db, settings, user=user, org=org)
    return await _provision_additional_org_user(
        db, settings, user=user, org_link=org_link
    )


async def get_cloud_security_embed_path(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    user: dict[str, Any],
) -> str:
    link = await db.prowler_user_links.find_one({"vrika_user_id": user["_id"]})
    if not link:
        provisioned = await provision_prowler_user(db, settings, user)
        access = provisioned["access"]
        refresh = provisioned["refresh"]
    else:
        email = str(link["prowler_email"])
        password = decrypt_password(settings, link["prowler_password_enc"])
        tenant_id = str(link.get("prowler_tenant_id") or "")
        access, refresh, _ = await prowler_client.obtain_tokens(
            settings,
            email=email,
            password=password,
            tenant_id=tenant_id or None,
        )

    token = mint_embed_token(settings, access=access, refresh=refresh)
    payload = token.split(".", 1)[0]
    try:
        body = json.loads(_b64url_decode(payload))
        nonce = body.get("nonce")
        if isinstance(nonce, str) and nonce:
            await _store_embed_nonce(nonce)
    except (json.JSONDecodeError, ValueError):
        pass

    base = settings.prowler_public_base_path.rstrip("/") or "/prowler"
    redirect = "/"
    return _embed_path(settings, token, redirect=redirect)
