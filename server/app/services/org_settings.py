"""Central per-organization configuration store (source of truth).

One Mongo document per organization in ``organization_settings``, with each
config under a named section. Secrets are encrypted at rest (Fernet, reusing the
bridge helpers) and never returned to browsers. Cloud Security reads what it
needs via the internal API (see routers/internal_config.py).
"""

from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings
from app.schemas.org_settings import (
    BrandingConfigIn,
    BrandingConfigOut,
    OrgSettingsOut,
    SmtpConfigIn,
    SmtpConfigOut,
)
from app.services.prowler_bridge import decrypt_password, encrypt_password

_COLLECTION = "organization_settings"
_MAX_LOGO_BYTES = 2 * 1024 * 1024
_ALLOWED_LOGO_TYPES = ("image/png", "image/jpeg")


class OrgSettingsError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


# ---------------------------------------------------------------------------
# Image helpers (mirror Cloud Security's validation: PNG/JPEG, <= 2 MB)
# ---------------------------------------------------------------------------


def _detect_image_type(data: bytes) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return None


def _decode_logo(logo_base64: str) -> tuple[str, str]:
    """Return ``(clean_base64, content_type)`` or raise OrgSettingsError."""
    raw = (logo_base64 or "").strip()
    if raw.startswith("data:"):
        try:
            header, encoded = raw.split(",", 1)
        except ValueError as exc:
            raise OrgSettingsError("Malformed image data URI") from exc
        if ";base64" not in header:
            raise OrgSettingsError("Only base64-encoded images are supported")
        raw = encoded

    try:
        decoded = base64.b64decode(raw, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise OrgSettingsError("Invalid base64 image data") from exc

    if not decoded:
        raise OrgSettingsError("Empty image")
    if len(decoded) > _MAX_LOGO_BYTES:
        raise OrgSettingsError("Logo exceeds the 2 MB size limit")

    content_type = _detect_image_type(decoded)
    if content_type not in _ALLOWED_LOGO_TYPES:
        raise OrgSettingsError("Unsupported image type. Use PNG or JPEG")

    return base64.b64encode(decoded).decode("ascii"), content_type


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


async def _get_doc(
    db: AsyncIOMotorDatabase, org_id: ObjectId
) -> dict[str, Any]:
    return await db[_COLLECTION].find_one({"organization_id": org_id}) or {}


async def _set_section(
    db: AsyncIOMotorDatabase,
    org_id: ObjectId,
    section: str,
    value: dict[str, Any],
) -> None:
    now = _now()
    await db[_COLLECTION].update_one(
        {"organization_id": org_id},
        {
            "$set": {section: value, "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


# ---------------------------------------------------------------------------
# Read (masked, for admins/UI)
# ---------------------------------------------------------------------------


def _branding_out(section: dict[str, Any]) -> BrandingConfigOut:
    logo_b64 = section.get("logo_base64") or ""
    content_type = section.get("logo_content_type") or "image/png"
    return BrandingConfigOut(
        has_custom_logo=bool(logo_b64),
        logo_filename=section.get("logo_filename") or "",
        logo_content_type=content_type if logo_b64 else "",
        logo=f"data:{content_type};base64,{logo_b64}" if logo_b64 else None,
        updated_at=_iso(section.get("updated_at")),
    )


def _smtp_out(section: dict[str, Any]) -> SmtpConfigOut:
    return SmtpConfigOut(
        host=section.get("host") or "",
        port=int(section.get("port") or 587),
        username=section.get("username") or "",
        has_password=bool(section.get("password_enc")),
        use_tls=bool(section.get("use_tls", True)),
        from_email=section.get("from_email"),
        updated_at=_iso(section.get("updated_at")),
    )


async def get_org_settings(
    db: AsyncIOMotorDatabase, org_id: ObjectId
) -> OrgSettingsOut:
    doc = await _get_doc(db, org_id)
    return OrgSettingsOut(
        branding=_branding_out(doc.get("branding") or {}),
        smtp=_smtp_out(doc.get("smtp") or {}),
    )


# ---------------------------------------------------------------------------
# Write (validated, secrets encrypted)
# ---------------------------------------------------------------------------


async def update_branding(
    db: AsyncIOMotorDatabase,
    org_id: ObjectId,
    payload: BrandingConfigIn,
) -> BrandingConfigOut:
    clean_b64, content_type = _decode_logo(payload.logo_base64)
    section = {
        "logo_base64": clean_b64,
        "logo_content_type": content_type,
        "logo_filename": payload.logo_filename or "",
        "updated_at": _now(),
    }
    await _set_section(db, org_id, "branding", section)
    return _branding_out(section)


async def delete_branding(
    db: AsyncIOMotorDatabase, org_id: ObjectId
) -> BrandingConfigOut:
    section = {
        "logo_base64": "",
        "logo_content_type": "",
        "logo_filename": "",
        "updated_at": _now(),
    }
    await _set_section(db, org_id, "branding", section)
    return _branding_out(section)


async def update_smtp(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    payload: SmtpConfigIn,
) -> SmtpConfigOut:
    existing = (await _get_doc(db, org_id)).get("smtp") or {}
    section: dict[str, Any] = {
        "host": payload.host,
        "port": payload.port,
        "username": payload.username,
        "use_tls": payload.use_tls,
        "from_email": str(payload.from_email) if payload.from_email else None,
        "updated_at": _now(),
    }
    # Keep the existing password when the caller leaves it blank.
    if payload.password:
        section["password_enc"] = encrypt_password(settings, payload.password)
    elif existing.get("password_enc"):
        section["password_enc"] = existing["password_enc"]
    await _set_section(db, org_id, "smtp", section)
    return _smtp_out(section)


# ---------------------------------------------------------------------------
# Internal resolution (server-to-server; secrets decrypted)
# ---------------------------------------------------------------------------


async def resolve_config_for_prowler_tenant(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    prowler_tenant_id: str,
) -> dict[str, Any]:
    """Return the org config for a Cloud Security tenant, secrets decrypted.

    Only for the internal (server-to-server) API. Maps the Prowler tenant to a
    Vrika organization via ``prowler_tenant_links``.
    """
    link = await db.prowler_tenant_links.find_one(
        {"prowler_tenant_id": prowler_tenant_id}
    )
    if not link:
        return {}
    org_id = link["vrika_organization_id"]
    doc = await _get_doc(db, org_id)

    branding = doc.get("branding") or {}
    smtp = doc.get("smtp") or {}

    smtp_out: dict[str, Any] = {}
    if smtp.get("host"):
        smtp_out = {
            "host": smtp.get("host"),
            "port": int(smtp.get("port") or 587),
            "username": smtp.get("username") or "",
            "use_tls": bool(smtp.get("use_tls", True)),
            "from_email": smtp.get("from_email"),
        }
        if smtp.get("password_enc"):
            try:
                smtp_out["password"] = decrypt_password(
                    settings, smtp["password_enc"]
                )
            except Exception:
                smtp_out["password"] = ""

    return {
        "branding": {
            "logo_base64": branding.get("logo_base64") or "",
            "logo_content_type": branding.get("logo_content_type") or "",
            "logo_filename": branding.get("logo_filename") or "",
        },
        "smtp": smtp_out,
    }
