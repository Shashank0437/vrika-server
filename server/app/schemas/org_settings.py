"""Schemas for the central per-organization configuration store.

Each config lives under a named *section* (branding, smtp, ...). Adding a new
config = add a section model here + register it in the service. Secrets are
never returned in the *Out* models (masked as ``has_*`` booleans).
"""

from __future__ import annotations

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
    use_tls: bool = True
    from_email: EmailStr | None = None


class SmtpConfigOut(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    has_password: bool = False  # never expose the real password
    use_tls: bool = True
    from_email: str | None = None
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# Aggregate (returned by GET /org/settings)
# ---------------------------------------------------------------------------


class OrgSettingsOut(BaseModel):
    branding: BrandingConfigOut = Field(default_factory=BrandingConfigOut)
    smtp: SmtpConfigOut = Field(default_factory=SmtpConfigOut)
