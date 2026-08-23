"""Schemas for the central per-organization configuration store.

Each config lives under a named *section* (branding, smtp, llm, sso, ...). Adding a new
config = add a section model here + register it in the service. Secrets are
never returned in the *Out* models (masked as ``has_*`` booleans).
"""

from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field

# ---------------------------------------------------------------------------
# Branding (company logo used on Cloud Security PDF reports)
# ---------------------------------------------------------------------------


class BrandingConfigIn(BaseModel):
    """Upload payload: a base64-encoded PNG/JPEG (bare base64 or data URI)."""

    logo_base64: str = Field(..., min_length=1)
    logo_filename: str = Field(default="", max_length=255)


class BrandingConfigOut(BaseModel):
    has_custom_logo: bool = False
    logo_filename: str = ""
    logo_content_type: str = ""
    # Data URI for UI preview (safe to expose; it is the org's own logo).
    logo: str | None = None
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# SMTP (outbound email; consumable by vrika-server and/or Cloud Security)
# ---------------------------------------------------------------------------


class SmtpConfigIn(BaseModel):
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    username: str = Field(default="", max_length=255)
    # Optional: keep the existing stored password when omitted/blank.
    password: str = Field(default="", max_length=1024)
    security: str = Field(default="starttls")  # "starttls" | "ssl" | "none"
    from_email: EmailStr | None = None
    from_name: str | None = Field(default="Vrika Security", max_length=255)
    enabled: bool = True


class SmtpConfigOut(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    has_password: bool = False  # never expose the real password
    security: str = "starttls"
    from_email: str | None = None
    from_name: str | None = "Vrika Security"
    enabled: bool = True
    updated_at: str | None = None


class TestSmtpIn(BaseModel):
    test_recipient: EmailStr


# ---------------------------------------------------------------------------
# LLM Providers (OpenRouter, OpenAI, Anthropic, Gemini, Custom / vLLM / Ollama)
# ---------------------------------------------------------------------------


class LlmProviderConfigIn(BaseModel):
    api_key: str = Field(default="", max_length=2048)
    base_url: str = Field(default="", max_length=1024)
    model: str = Field(default="", max_length=255)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=131072)
    context_limit: Optional[int] = Field(default=None, ge=512, le=2097152)


class LlmProviderConfigOut(BaseModel):
    has_api_key: bool = False
    base_url: str = ""
    model: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096
    context_limit: Optional[int] = None


class LlmSettingsIn(BaseModel):
    active_provider: str = Field(
        default="openrouter",
        pattern="^(openrouter|openai|anthropic|gemini|custom)$",
    )
    providers: Dict[str, LlmProviderConfigIn] = Field(default_factory=dict)


class LlmSettingsOut(BaseModel):
    active_provider: str = "openrouter"
    providers: Dict[str, LlmProviderConfigOut] = Field(default_factory=dict)
    updated_at: str | None = None


class ModelOption(BaseModel):
    id: str
    name: str
    context_length: Optional[int] = None


class FetchModelsIn(BaseModel):
    provider: str = Field(..., pattern="^(openrouter|openai|anthropic|gemini|custom)$")
    api_key: str = Field(default="", max_length=2048)
    base_url: str = Field(default="", max_length=1024)


class FetchModelsOut(BaseModel):
    models: List[ModelOption] = Field(default_factory=list)


class TestLlmConnectionIn(BaseModel):
    provider: str = Field(..., pattern="^(openrouter|openai|anthropic|gemini|custom)$")
    api_key: str = Field(default="", max_length=2048)
    base_url: str = Field(default="", max_length=1024)
    model: str = Field(default="", max_length=255)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class TestLlmConnectionOut(BaseModel):
    success: bool
    message: str
    latency_ms: float = 0.0
    response_preview: str = ""


# ---------------------------------------------------------------------------
# SAML SSO (Enterprise Single Sign-On)
# ---------------------------------------------------------------------------


class SsoSettingsIn(BaseModel):
    enabled: bool = False
    enforced: bool = False
    domain: str = Field(default="", max_length=255)
    idp_entity_id: str = Field(default="", max_length=1024)
    idp_sso_url: str = Field(default="", max_length=1024)
    idp_x509_cert: str = Field(default="", max_length=16384)


class SsoSettingsOut(BaseModel):
    enabled: bool = False
    enforced: bool = False
    domain: str = ""
    idp_entity_id: str = ""
    idp_sso_url: str = ""
    has_idp_cert: bool = False
    idp_x509_cert: str = ""
    sp_entity_id: str = ""
    sp_acs_url: str = ""
    sp_metadata_url: str = ""
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# Aggregate (returned by GET /org/settings)
# ---------------------------------------------------------------------------


class OrgSettingsOut(BaseModel):
    branding: BrandingConfigOut = Field(default_factory=BrandingConfigOut)
    smtp: SmtpConfigOut = Field(default_factory=SmtpConfigOut)
    llm: LlmSettingsOut = Field(default_factory=LlmSettingsOut)
    sso: SsoSettingsOut = Field(default_factory=SsoSettingsOut)
