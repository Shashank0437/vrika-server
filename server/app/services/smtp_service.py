"""
server/app/services/smtp_service.py

Dynamic, per-organization SMTP email service for Vrika.
Handles credential encryption, connection testing, invitation dispatching, and security scan reports.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional, Tuple, Union

from bson import ObjectId
from cryptography.fernet import Fernet, InvalidToken
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.constants import ORGANIZATIONS_COLLECTION
from app.schemas.org_settings import SmtpConfigIn, SmtpConfigOut

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Encryption Helpers (Fernet)
# ---------------------------------------------------------------------------

def _get_fernet(settings: Optional[Settings] = None) -> Fernet:
    s = settings or get_settings()
    # Use dedicated SMTP encryption key if provided, or derive from jwt_secret
    raw_key = os.getenv("SMTP_CREDS_ENCRYPTION_KEY") or s.jwt_secret
    key_bytes = hashlib.sha256(raw_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_value(plain: str, settings: Optional[Settings] = None) -> str:
    if not plain:
        return ""
    return _get_fernet(settings).encrypt(plain.encode()).decode()


def decrypt_value(token: str, settings: Optional[Settings] = None) -> str:
    if not token:
        return ""
    try:
        return _get_fernet(settings).decrypt(token.encode()).decode()
    except (InvalidToken, Exception) as exc:
        logger.error("Failed to decrypt stored SMTP password: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Database Helpers (Save / Load)
# ---------------------------------------------------------------------------

async def save_org_smtp_config(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    payload: SmtpConfigIn,
) -> SmtpConfigOut:
    """Encrypt password and persist SMTP settings to db.organizations under section 'smtp'."""
    doc = await db[ORGANIZATIONS_COLLECTION].find_one({"_id": org_id})
    existing = (doc or {}).get("smtp") or {}

    new_pwd = payload.password.strip()
    if new_pwd:
        enc_pwd = encrypt_value(new_pwd, settings)
    else:
        enc_pwd = existing.get("password_encrypted") or ""

    now = datetime.now(UTC)
    section: Dict[str, Any] = {
        "host": payload.host.strip(),
        "port": payload.port,
        "username": payload.username.strip(),
        "password_encrypted": enc_pwd,
        "security": payload.security.strip().lower(),  # "starttls", "ssl", "none"
        "from_email": str(payload.from_email).strip().lower() if payload.from_email else None,
        "from_name": (payload.from_name or "Vrika Security").strip(),
        "enabled": payload.enabled,
        "updated_at": now,
    }

    await db[ORGANIZATIONS_COLLECTION].update_one(
        {"_id": org_id},
        {"$set": {"smtp": section}},
    )
    await db["organization_settings"].update_one(
        {"organization_id": org_id},
        {"$set": {"smtp": section, "updated_at": now}},
        upsert=True,
    )

    return SmtpConfigOut(
        host=section["host"],
        port=section["port"],
        username=section["username"],
        has_password=bool(enc_pwd),
        security=section["security"],
        from_email=section["from_email"],
        from_name=section["from_name"],
        enabled=section["enabled"],
        updated_at=str(section.get("updated_at") or ""),
    )


async def get_org_smtp_config(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
) -> Optional[Dict[str, Any]]:
    """Retrieve decrypted SMTP credentials for an organization."""
    doc = await db[ORGANIZATIONS_COLLECTION].find_one({"_id": org_id})
    if not doc:
        return None
    raw = doc.get("smtp")
    if not isinstance(raw, dict) or not raw.get("host"):
        return None

    out = dict(raw)
    enc_pwd = raw.get("password_encrypted") or ""
    out["password"] = decrypt_value(enc_pwd, settings) if enc_pwd else ""
    return out


# ---------------------------------------------------------------------------
# Synchronous SMTP Client Worker (Executed via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _send_mail_sync(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    security: str,
    from_addr: str,
    to_addrs: List[str],
    cc_addrs: Optional[List[str]],
    bcc_addrs: Optional[List[str]],
    subject: str,
    body_plain: str,
    body_html: Optional[str] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Execute synchronous SMTP handshake and message dispatch."""
    # 1. Build MIME Message
    all_recipients: List[str] = []
    for addr in to_addrs + (cc_addrs or []) + (bcc_addrs or []):
        clean = addr.strip().lower()
        if clean and clean not in all_recipients:
            all_recipients.append(clean)

    if not all_recipients:
        raise ValueError("No recipient email addresses provided")

    msg = MIMEMultipart("mixed" if attachments else "alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    if cc_addrs:
        msg["Cc"] = ", ".join(cc_addrs)

    # 2. Attach Body (Plaintext and/or HTML)
    if body_html and attachments:
        alt_part = MIMEMultipart("alternative")
        alt_part.attach(MIMEText(body_plain, "plain", "utf-8"))
        alt_part.attach(MIMEText(body_html, "html", "utf-8"))
        msg.attach(alt_part)
    elif body_html:
        msg.attach(MIMEText(body_plain, "plain", "utf-8"))
        msg.attach(MIMEText(body_html, "html", "utf-8"))
    else:
        msg.attach(MIMEText(body_plain, "plain", "utf-8"))

    # 3. Attach File Artifacts (e.g. Executive PDF Report)
    if attachments:
        import base64
        for att in attachments:
            if not isinstance(att, dict):
                continue
            filename = att.get("filename") or "document.pdf"
            content = att.get("content")
            if isinstance(content, str):
                try:
                    # Try base64 decoding in case a base64 string was passed directly
                    raw_bytes = base64.b64decode(content, validate=True)
                except Exception:
                    raw_bytes = content.encode("utf-8")
            elif isinstance(content, bytes):
                raw_bytes = content
            else:
                continue

            part = MIMEApplication(raw_bytes, Name=filename)
            part["Content-Disposition"] = f'attachment; filename="{filename}"'
            msg.attach(part)

    # 4. Connect and Authenticate
    sec_mode = security.strip().lower()
    if sec_mode == "ssl" or port == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context, timeout=60.0) as server:
            if username and password:
                server.login(username, password)
            server.sendmail(from_addr, all_recipients, msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=60.0) as server:
            server.ehlo()
            if sec_mode == "starttls" or port == 587:
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()
            if username and password:
                server.login(username, password)
            server.sendmail(from_addr, all_recipients, msg.as_string())


    return {
        "status": "sent",
        "to": to_addrs,
        "cc": cc_addrs or [],
        "via": host,
        "recipients_count": len(all_recipients),
    }


# ---------------------------------------------------------------------------
# High-Level Asynchronous Mail Dispatcher
# ---------------------------------------------------------------------------

async def send_mail_for_org(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    org_id: ObjectId,
    *,
    to: Union[List[str], str],
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Dynamically route outbound email through the organization's configured SMTP server.
    
    If the organization has not configured custom SMTP or has disabled it,
    gracefully falls back to platform default (Brevo) if available.
    """
    to_list = [to] if isinstance(to, str) else list(to)
    to_list = [a.strip() for a in to_list if a.strip()]

    # 1. Check Organization Custom SMTP
    smtp_cfg = await get_org_smtp_config(db, settings, org_id)
    if smtp_cfg and smtp_cfg.get("enabled"):
        host = str(smtp_cfg["host"])
        port = int(smtp_cfg.get("port") or 587)
        username = str(smtp_cfg.get("username") or "")
        password = str(smtp_cfg.get("password") or "")
        security = str(smtp_cfg.get("security") or "starttls")
        from_email = str(smtp_cfg.get("from_email") or username or "no-reply@vrika.ai")
        from_name = str(smtp_cfg.get("from_name") or "Vrika Security")
        formatted_from = f"{from_name} <{from_email}>" if from_name else from_email

        logger.info("📧 Dispatching email via org custom SMTP (host=%s, org_id=%s, to=%s)", host, org_id, to_list)
        return await asyncio.to_thread(
            _send_mail_sync,
            host=host,
            port=port,
            username=username,
            password=password,
            security=security,
            from_addr=formatted_from,
            to_addrs=to_list,
            cc_addrs=cc,
            bcc_addrs=bcc,
            subject=subject,
            body_plain=body,
            body_html=html_body,
            attachments=attachments,
        )

    # 2. Fallback to Platform Brevo API if configured
    if settings.brevo_api_key and settings.brevo_sender_email.strip():
        logger.info("📧 Custom SMTP not enabled; using platform Brevo fallback for org_id=%s", org_id)
        from app.services.brevo_email import send_transactional_email
        all_to = to_list + (cc or [])
        await send_transactional_email(
            to_addresses=all_to,
            subject=subject,
            html=html_body or body,
            text=body,
        )
        return {"status": "sent", "via": "brevo_fallback", "to": to_list}

    raise RuntimeError(
        "No email service available: Custom SMTP is not configured/enabled for this organization, "
        "and platform Brevo API credentials are not set."
    )


async def test_org_smtp_connection(
    settings: Settings,
    config: SmtpConfigIn,
    test_recipient: str,
) -> Dict[str, Any]:
    """Test connection and authentication with client-supplied SMTP credentials."""
    host = config.host.strip()
    port = config.port
    username = config.username.strip()
    password = config.password.strip()
    security = config.security.strip().lower()
    from_email = str(config.from_email).strip() if config.from_email else (username or "test@vrika.ai")
    from_name = (config.from_name or "Vrika Security Test").strip()
    formatted_from = f"{from_name} <{from_email}>" if from_name else from_email

    subject = "✅ Vrika SMTP Configuration Test"
    body_plain = (
        f"This is an automated test email confirming that your SMTP server ({host}:{port}) "
        f"is properly configured and authorized for Vrika."
    )
    body_html = f"""
    <!DOCTYPE html>
    <html>
      <body style="font-family: sans-serif; background-color: #0f0a1c; color: #f3f0fa; padding: 32px;">
        <div style="max-width: 520px; margin: 0 auto; background: #1b132e; border: 1px solid #3d2b6b; border-radius: 12px; padding: 24px;">
          <h2 style="color: #a855f7; margin-top: 0;">Vrika SMTP Test Successful</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #d8b4fe;">
            Your custom SMTP server connection has been verified successfully.
          </p>
          <div style="background: #271b45; padding: 12px 16px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #e9d5ff;">
            <div><strong>Host:</strong> {host}:{port}</div>
            <div><strong>Security:</strong> {security.upper()}</div>
            <div><strong>Sender:</strong> {from_email}</div>
          </div>
          <p style="font-size: 12px; color: #948aa8; margin-top: 20px;">
            This email was sent on demand via Vrika Organization Settings.
          </p>
        </div>
      </body>
    </html>
    """

    return await asyncio.to_thread(
        _send_mail_sync,
        host=host,
        port=port,
        username=username,
        password=password,
        security=security,
        from_addr=formatted_from,
        to_addrs=[test_recipient.strip()],
        cc_addrs=None,
        bcc_addrs=None,
        subject=subject,
        body_plain=body_plain,
        body_html=body_html,
        attachments=None,
    )
