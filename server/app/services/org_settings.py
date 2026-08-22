"""Central per-organization configuration store (source of truth).

One Mongo document per organization in ``organization_settings``, with each
config under a named section. Secrets are encrypted at rest (Fernet, reusing the
bridge helpers) and never returned to browsers.
"""

from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
import time
from typing import Any, Dict, List

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings
from app.constants import SSO_CONFIGS_COLLECTION
from app.schemas.org_settings import (
    BrandingConfigIn,
    BrandingConfigOut,
    FetchModelsIn,
    FetchModelsOut,
    LlmProviderConfigIn,
    LlmProviderConfigOut,
    LlmSettingsIn,
    LlmSettingsOut,
    ModelOption,
    OrgSettingsOut,
    SmtpConfigIn,
    SmtpConfigOut,
    SsoSettingsIn,
    SsoSettingsOut,
    TestLlmConnectionIn,
    TestLlmConnectionOut,
)
from app.services.prowler_bridge import decrypt_password, encrypt_password

_COLLECTION = "organization_settings"
_MAX_LOGO_BYTES = 2 * 1024 * 1024
_ALLOWED_LOGO_TYPES = ("image/png", "image/jpeg")

DEFAULT_CURATED_ANTHROPIC_MODELS = [
    ModelOption(id="claude-3-7-sonnet-20250219", name="Claude 3.7 Sonnet (Hybrid Reasoning)", context_length=200000),
    ModelOption(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet (Latest v2)", context_length=200000),
    ModelOption(id="claude-3-5-haiku-20241022", name="Claude 3.5 Haiku", context_length=200000),
    ModelOption(id="claude-3-opus-20240229", name="Claude 3 Opus", context_length=200000),
    ModelOption(id="claude-3-sonnet-20240229", name="Claude 3 Sonnet", context_length=200000),
    ModelOption(id="claude-3-haiku-20240307", name="Claude 3 Haiku", context_length=200000),
]

DEFAULT_CURATED_GEMINI_MODELS = [
    ModelOption(id="gemini-2.5-pro", name="Gemini 2.5 Pro (Reasoning)", context_length=1000000),
    ModelOption(id="gemini-2.5-flash", name="Gemini 2.5 Flash (Latest)", context_length=1000000),
    ModelOption(id="gemini-2.0-flash", name="Gemini 2.0 Flash (Fast)", context_length=1000000),
    ModelOption(id="gemini-1.5-pro", name="Gemini 1.5 Pro (2M Ctx)", context_length=2000000),
    ModelOption(id="gemini-1.5-flash", name="Gemini 1.5 Flash", context_length=1000000),
]


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
# Image helpers (PNG/JPEG, <= 2 MB)
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


def _llm_out(section: dict[str, Any]) -> LlmSettingsOut:
    providers_raw = section.get("providers") or {}
    providers_out: Dict[str, LlmProviderConfigOut] = {}
    for prov_name, prov_dict in providers_raw.items():
        if isinstance(prov_dict, dict):
            providers_out[prov_name] = LlmProviderConfigOut(
                has_api_key=bool(prov_dict.get("api_key_enc")),
                base_url=prov_dict.get("base_url") or "",
                model=prov_dict.get("model") or "",
                temperature=float(prov_dict.get("temperature", 0.7)),
                max_tokens=int(prov_dict.get("max_tokens", 4096)),
                context_limit=int(prov_dict["context_limit"]) if prov_dict.get("context_limit") else None,
            )

    return LlmSettingsOut(
        active_provider=section.get("active_provider") or "openrouter",
        providers=providers_out,
        updated_at=_iso(section.get("updated_at")),
    )


def _sso_out(section: dict[str, Any], settings: Settings) -> SsoSettingsOut:
    api_base = settings.api_base_url.rstrip("/")
    sp_entity_id = settings.saml_sp_entity_id or f"{api_base}/auth/saml/metadata"
    sp_acs_url = settings.saml_acs_url or f"{api_base}/auth/saml/acs"
    sp_metadata_url = f"{api_base}/auth/saml/metadata"
    cert = section.get("idp_x509_cert") or ""

    return SsoSettingsOut(
        enabled=bool(section.get("enabled")),
        enforced=bool(section.get("enforced")),
        domain=section.get("domain") or "",
        idp_entity_id=section.get("idp_entity_id") or "",
        idp_sso_url=section.get("idp_sso_url") or "",
        has_idp_cert=bool(cert),
        idp_x509_cert=cert,
        sp_entity_id=sp_entity_id,
        sp_acs_url=sp_acs_url,
        sp_metadata_url=sp_metadata_url,
        updated_at=_iso(section.get("updated_at")),
    )


async def get_org_settings(
    db: AsyncIOMotorDatabase, settings: Settings, org_id: ObjectId
) -> OrgSettingsOut:
    doc = await _get_doc(db, org_id)
    sso_sec = doc.get("sso") or {}
    if not sso_sec:
        sso_doc = await db[SSO_CONFIGS_COLLECTION].find_one({"organization_id": org_id})
        if sso_doc:
            sso_sec = sso_doc
    return OrgSettingsOut(
        branding=_branding_out(doc.get("branding") or {}),
        smtp=_smtp_out(doc.get("smtp") or {}),
        llm=_llm_out(doc.get("llm") or {}),
        sso=_sso_out(sso_sec, settings),
    )


async def update_sso_settings(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    payload: SsoSettingsIn,
) -> SsoSettingsOut:
    domain = payload.domain.lower().strip().lstrip("@")
    idp_entity_id = payload.idp_entity_id.strip()
    idp_sso_url = payload.idp_sso_url.strip()
    idp_cert = payload.idp_x509_cert.strip()

    if payload.enabled:
        if not domain:
            raise OrgSettingsError("Email domain is required to enable SSO")
        if not idp_sso_url:
            raise OrgSettingsError("IdP Single Sign-On URL is required")
        if not idp_entity_id:
            raise OrgSettingsError("IdP Entity ID / Issuer is required")
        if not idp_cert:
            raise OrgSettingsError("IdP X.509 Certificate is required")

    section = {
        "enabled": payload.enabled,
        "enforced": payload.enforced,
        "domain": domain,
        "idp_entity_id": idp_entity_id,
        "idp_sso_url": idp_sso_url,
        "idp_x509_cert": idp_cert,
        "updated_at": _now(),
    }

    await _set_section(db, org_id, "sso", section)

    # Sync into SSO_CONFIGS_COLLECTION for auth/saml domain discovery & login routing
    await db[SSO_CONFIGS_COLLECTION].update_one(
        {"organization_id": org_id},
        {
            "$set": {
                "organization_id": org_id,
                "domain": domain,
                "enabled": payload.enabled,
                "enforced": payload.enforced,
                "idp_entity_id": idp_entity_id,
                "idp_sso_url": idp_sso_url,
                "idp_x509_cert": idp_cert,
                "updated_at": _now(),
            }
        },
        upsert=True,
    )

    return _sso_out(section, settings)


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
    if payload.password:
        section["password_enc"] = encrypt_password(settings, payload.password)
    elif existing.get("password_enc"):
        section["password_enc"] = existing["password_enc"]
    await _set_section(db, org_id, "smtp", section)
    return _smtp_out(section)


async def update_llm_settings(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    payload: LlmSettingsIn,
) -> LlmSettingsOut:
    existing_section = (await _get_doc(db, org_id)).get("llm") or {}
    existing_providers = existing_section.get("providers") or {}

    updated_providers: Dict[str, Any] = {}
    for prov_name, prov_in in payload.providers.items():
        prov_dict: dict[str, Any] = {
            "base_url": prov_in.base_url.strip(),
            "model": prov_in.model.strip(),
            "temperature": prov_in.temperature,
            "max_tokens": prov_in.max_tokens,
            "context_limit": prov_in.context_limit,
        }

        # Handle API key encryption / preservation
        if prov_in.api_key and prov_in.api_key.strip():
            prov_dict["api_key_enc"] = encrypt_password(settings, prov_in.api_key.strip())
        else:
            old_prov = existing_providers.get(prov_name) or {}
            if old_prov.get("api_key_enc"):
                prov_dict["api_key_enc"] = old_prov["api_key_enc"]

        updated_providers[prov_name] = prov_dict

    section: dict[str, Any] = {
        "active_provider": payload.active_provider,
        "providers": updated_providers,
        "updated_at": _now(),
    }
    await _set_section(db, org_id, "llm", section)
    return _llm_out(section)


# ---------------------------------------------------------------------------
# Dynamic Model Fetching & Live Connection Testing
# ---------------------------------------------------------------------------


async def _resolve_api_key_for_provider(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    provider: str,
    input_key: str,
) -> str:
    key = input_key.strip()
    if key:
        return key
    doc = await _get_doc(db, org_id)
    llm_doc = doc.get("llm") or {}
    prov_doc = (llm_doc.get("providers") or {}).get(provider) or {}
    enc_key = prov_doc.get("api_key_enc")
    if enc_key:
        try:
            return decrypt_password(settings, enc_key)
        except Exception:
            return ""
    return ""


async def fetch_available_models(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    payload: FetchModelsIn,
) -> FetchModelsOut:
    provider = payload.provider.lower()
    api_key = await _resolve_api_key_for_provider(db, settings, org_id, provider, payload.api_key)
    base_url = payload.base_url.strip()

    models_out: List[ModelOption] = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        if provider == "openrouter":
            url = base_url or "https://openrouter.ai/api/v1/models"
            if not url.endswith("/models"):
                url = f"{url.rstrip('/')}/models"
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            try:
                res = await client.get(url, headers=headers)
                if res.is_success:
                    data = res.json()
                    for m in data.get("data", []):
                        m_id = m.get("id")
                        if m_id:
                            models_out.append(
                                ModelOption(
                                    id=m_id,
                                    name=m.get("name") or m_id,
                                    context_length=m.get("context_length"),
                                )
                            )
                else:
                    raise OrgSettingsError(f"OpenRouter returned status {res.status_code}: {res.text[:200]}")
            except httpx.RequestError as exc:
                raise OrgSettingsError(f"Failed to connect to OpenRouter: {str(exc)}")

        elif provider == "openai":
            url = base_url or "https://api.openai.com/v1"
            url = f"{url.rstrip('/')}/models"
            if not api_key:
                raise OrgSettingsError("OpenAI API key is required to fetch models")
            headers = {"Authorization": f"Bearer {api_key}"}
            try:
                res = await client.get(url, headers=headers)
                if res.is_success:
                    data = res.json()
                    for m in data.get("data", []):
                        m_id = m.get("id")
                        if m_id:
                            models_out.append(ModelOption(id=m_id, name=m_id))
                    # Sort models alphabetically
                    models_out.sort(key=lambda x: x.id)
                else:
                    raise OrgSettingsError(f"OpenAI returned status {res.status_code}: {res.text[:200]}")
            except httpx.RequestError as exc:
                raise OrgSettingsError(f"Failed to connect to OpenAI: {str(exc)}")

        elif provider == "anthropic":
            url = (base_url or "https://api.anthropic.com").rstrip("/")
            models_endpoint = f"{url}/v1/models"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }
            try:
                if api_key:
                    res = await client.get(models_endpoint, headers=headers)
                    if res.is_success:
                        data = res.json()
                        for m in data.get("data", []):
                            m_id = m.get("id")
                            if m_id:
                                models_out.append(
                                    ModelOption(id=m_id, name=m.get("display_name") or m_id)
                                )
                if not models_out:
                    models_out = list(DEFAULT_CURATED_ANTHROPIC_MODELS)
            except Exception:
                models_out = list(DEFAULT_CURATED_ANTHROPIC_MODELS)

        elif provider == "gemini":
            if not api_key:
                models_out = list(DEFAULT_CURATED_GEMINI_MODELS)
            else:
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                try:
                    res = await client.get(url)
                    if res.is_success:
                        data = res.json()
                        for m in data.get("models", []):
                            methods = m.get("supportedGenerationMethods", [])
                            if "generateContent" in methods:
                                m_name = m.get("name", "")
                                m_id = m_name.replace("models/", "")
                                display = m.get("displayName") or m_id
                                input_limit = m.get("inputTokenLimit")
                                models_out.append(ModelOption(id=m_id, name=display, context_length=input_limit))
                    if not models_out:
                        models_out = list(DEFAULT_CURATED_GEMINI_MODELS)
                except Exception:
                    models_out = list(DEFAULT_CURATED_GEMINI_MODELS)

        elif provider == "custom":
            if not base_url:
                raise OrgSettingsError("Base URL is required for Custom provider")
            url = f"{base_url.rstrip('/')}/models"
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            try:
                res = await client.get(url, headers=headers)
                if res.is_success:
                    data = res.json()
                    items = data.get("data", []) if isinstance(data, dict) and "data" in data else data.get("models", []) if isinstance(data, dict) else []
                    for m in items:
                        m_id = m.get("id") or m.get("name") if isinstance(m, dict) else str(m)
                        if m_id:
                            models_out.append(ModelOption(id=m_id, name=m_id))
                else:
                    raise OrgSettingsError(f"Custom server returned status {res.status_code}: {res.text[:200]}")
            except httpx.RequestError as exc:
                raise OrgSettingsError(f"Failed to connect to custom base URL: {str(exc)}")

    return FetchModelsOut(models=models_out)


async def test_llm_connection(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    payload: TestLlmConnectionIn,
) -> TestLlmConnectionOut:
    provider = payload.provider.lower()
    api_key = await _resolve_api_key_for_provider(db, settings, org_id, provider, payload.api_key)
    base_url = payload.base_url.strip()
    model = payload.model.strip()

    if not model and provider != "custom":
        model = "gpt-4o-mini" if provider == "openai" else "claude-3-5-haiku-20241022" if provider == "anthropic" else "gemini-1.5-flash" if provider == "gemini" else "openai/gpt-4.1-mini"

    start_time = time.perf_counter()

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            if provider in ("openrouter", "openai", "custom"):
                if provider == "openrouter":
                    url = (base_url or "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
                elif provider == "openai":
                    url = (base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
                else:
                    url = base_url.rstrip("/") + "/chat/completions"

                headers = {"Content-Type": "application/json"}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"

                body = {
                    "model": model,
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 15,
                    "temperature": payload.temperature,
                }
                res = await client.post(url, headers=headers, json=body)
                latency = round((time.perf_counter() - start_time) * 1000, 1)

                if res.is_success:
                    data = res.json()
                    choices = data.get("choices") or []
                    preview = ""
                    if choices:
                        msg = choices[0].get("message") or {}
                        preview = msg.get("content") or ""
                    return TestLlmConnectionOut(
                        success=True,
                        message=f"Connected successfully to {provider.upper()} ({latency}ms)",
                        latency_ms=latency,
                        response_preview=preview.strip(),
                    )
                else:
                    return TestLlmConnectionOut(
                        success=False,
                        message=f"API Error {res.status_code}: {res.text[:250]}",
                        latency_ms=latency,
                    )

            elif provider == "anthropic":
                url = (base_url or "https://api.anthropic.com").rstrip("/") + "/v1/messages"
                headers = {
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                }
                body = {
                    "model": model or "claude-3-5-haiku-20241022",
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 15,
                    "temperature": min(payload.temperature, 1.0),
                }
                res = await client.post(url, headers=headers, json=body)
                latency = round((time.perf_counter() - start_time) * 1000, 1)

                if res.is_success:
                    data = res.json()
                    content = data.get("content") or []
                    preview = content[0].get("text", "") if content else ""
                    return TestLlmConnectionOut(
                        success=True,
                        message=f"Connected successfully to Anthropic ({latency}ms)",
                        latency_ms=latency,
                        response_preview=preview.strip(),
                    )
                else:
                    return TestLlmConnectionOut(
                        success=False,
                        message=f"Anthropic Error {res.status_code}: {res.text[:250]}",
                        latency_ms=latency,
                    )

            elif provider == "gemini":
                if not api_key:
                    return TestLlmConnectionOut(success=False, message="Gemini API key is required", latency_ms=0)
                target_model = model or "gemini-1.5-flash"
                if target_model.startswith("models/"):
                    target_model = target_model.replace("models/", "")
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
                body = {
                    "contents": [{"parts": [{"text": "Hello"}]}],
                    "generationConfig": {"maxOutputTokens": 15, "temperature": min(payload.temperature, 2.0)},
                }
                res = await client.post(url, json=body)
                latency = round((time.perf_counter() - start_time) * 1000, 1)
                if res.is_success:
                    data = res.json()
                    candidates = data.get("candidates") or []
                    preview = ""
                    if candidates:
                        parts = (candidates[0].get("content") or {}).get("parts") or []
                        if parts:
                            preview = parts[0].get("text", "")
                    return TestLlmConnectionOut(
                        success=True,
                        message=f"Connected successfully to Google Gemini ({latency}ms)",
                        latency_ms=latency,
                        response_preview=preview.strip(),
                    )
                else:
                    return TestLlmConnectionOut(
                        success=False,
                        message=f"Gemini API Error {res.status_code}: {res.text[:250]}",
                        latency_ms=latency,
                    )

        except Exception as exc:
            latency = round((time.perf_counter() - start_time) * 1000, 1)
            return TestLlmConnectionOut(
                success=False,
                message=f"Connection failed: {str(exc)}",
                latency_ms=latency,
            )

    return TestLlmConnectionOut(success=False, message="Unhandled provider")


# ---------------------------------------------------------------------------
# Internal runtime resolution (for agent chat and pipelines)
# ---------------------------------------------------------------------------


async def resolve_llm_config_for_org(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
) -> dict[str, Any] | None:
    """Return decrypted active LLM configuration for runtime execution."""
    doc = await _get_doc(db, org_id)
    llm_doc = doc.get("llm") or {}
    active_prov = llm_doc.get("active_provider") or "openrouter"
    prov_doc = (llm_doc.get("providers") or {}).get(active_prov)
    if not prov_doc:
        return None

    decrypted_key = ""
    if prov_doc.get("api_key_enc"):
        try:
            decrypted_key = decrypt_password(settings, prov_doc["api_key_enc"])
        except Exception:
            decrypted_key = ""

    return {
        "provider": active_prov,
        "model": prov_doc.get("model") or "",
        "api_key": decrypted_key,
        "base_url": prov_doc.get("base_url") or "",
        "temperature": float(prov_doc.get("temperature", 0.7)),
        "max_tokens": int(prov_doc.get("max_tokens", 4096)),
        "context_limit": prov_doc.get("context_limit"),
    }
