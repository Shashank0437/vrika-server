"""
server/app/services/cloud_scan_notifications.py

Renders and sends Cloud Security scan completion and Attack Graph notifications
via the organization's dynamic SMTP server, with recipient routing to the scan initiator (To)
and all organization teammates (CC).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from bson import ObjectId
from jinja2 import Environment, FileSystemLoader
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings
from app.constants import ORGANIZATIONS_COLLECTION, USERS_COLLECTION
from app.services.smtp_service import send_mail_for_org

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"
_jinja_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=True)


def render_cloud_scan_email(
    *,
    organization_name: str,
    provider: str,
    account_id: str,
    account_name: Optional[str] = None,
    scan_id: str,
    compliance_score: int,
    scanned_resources: int,
    findings: Dict[str, int],
    attack_paths_count: int,
    top_attack_path: Optional[str] = None,
    dashboard_url: str,
    completed_at: Optional[str] = None,
) -> tuple[str, str, str]:
    """Returns (subject, html_body, text_body) for Cloud Security Scan & Compliance."""
    html_template = _jinja_env.get_template("cloud_scan_completed.html.j2")
    text_template = _jinja_env.get_template("cloud_scan_completed.txt.j2")

    ctx = {
        "organization_name": organization_name,
        "provider": provider,
        "account_id": account_id,
        "account_name": account_name,
        "scan_id": scan_id,
        "compliance_score": compliance_score,
        "scanned_resources": scanned_resources,
        "findings": findings,
        "attack_paths_count": attack_paths_count,
        "top_attack_path": top_attack_path,
        "dashboard_url": dashboard_url,
        "completed_at": completed_at,
        "scanner_email": "",
        "preheader": f"Cloud scan completed for {account_id} ({provider.upper()}): {compliance_score}% Compliance, {findings.get('critical', 0)} Critical findings",
    }

    subject = f"🛡️ [Vrika] Cloud Scan Complete — {provider.upper()} ({account_id})"
    return subject, html_template.render(**ctx), text_template.render(**ctx)


def render_attack_paths_email(
    *,
    organization_name: str,
    provider: str,
    account_id: str,
    account_name: Optional[str] = None,
    scan_id: str,
    attack_paths_count: int,
    blast_radius_count: Optional[str] = None,
    top_attack_path: Optional[str] = None,
    dashboard_url: str,
    completed_at: Optional[str] = None,
) -> tuple[str, str, str]:
    """Returns (subject, html_body, text_body) for Dedicated Attack Path Alerts."""
    html_template = _jinja_env.get_template("attack_paths_completed.html.j2")
    text_template = _jinja_env.get_template("attack_paths_completed.txt.j2")

    ctx = {
        "organization_name": organization_name,
        "provider": provider,
        "account_id": account_id,
        "account_name": account_name,
        "scan_id": scan_id,
        "attack_paths_count": attack_paths_count,
        "blast_radius_count": blast_radius_count or "High",
        "top_attack_path": top_attack_path,
        "dashboard_url": dashboard_url,
        "completed_at": completed_at,
        "preheader": f"Urgent: {attack_paths_count} Critical Attack Paths discovered in {account_id} ({provider.upper()})",
    }

    subject = f"⚡ [Vrika] Critical Attack Paths Discovered — {provider.upper()} ({account_id})"
    return subject, html_template.render(**ctx), text_template.render(**ctx)


async def send_cloud_scan_completed_notification(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    *,
    org_id: ObjectId,
    scanner_email: str,
    provider: str,
    account_id: str,
    account_name: Optional[str] = None,
    scan_id: str,
    compliance_score: int = 100,
    scanned_resources: int = 0,
    findings: Optional[Dict[str, int]] = None,
    attack_paths_count: int = 0,
    top_attack_path: Optional[str] = None,
    pdf_report_bytes: Optional[bytes] = None,
    pdf_report_filename: Optional[str] = None,
    pdf_attachments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Resolve initiator (To) and all other teammates in the org (CC), and dispatch notification with dual PDFs."""
    org = await db[ORGANIZATIONS_COLLECTION].find_one({"_id": org_id})
    org_name = org.get("name") if org else "Your Organization"

    scanner_norm = scanner_email.strip().lower()

    # Resolve all other active users in the same organization for CC
    other_users_cursor = db[USERS_COLLECTION].find(
        {"organization_id": org_id, "email": {"$ne": scanner_norm}}
    )
    cc_emails: List[str] = []
    async for u in other_users_cursor:
        e = str(u.get("email") or "").strip().lower()
        if e and e not in cc_emails and e != scanner_norm:
            cc_emails.append(e)

    dashboard_url = f"{settings.frontend_url.rstrip('/')}/dashboard/cloud-security"

    subject, html_body, text_body = render_cloud_scan_email(
        organization_name=org_name,
        provider=provider,
        account_id=account_id,
        account_name=account_name,
        scan_id=scan_id,
        compliance_score=compliance_score,
        scanned_resources=scanned_resources,
        findings=findings or {"critical": 0, "high": 0, "medium": 0, "low": 0, "passed": 0},
        attack_paths_count=attack_paths_count,
        top_attack_path=top_attack_path,
        dashboard_url=dashboard_url,
    )

    attachments: List[Dict[str, Any]] = []
    if pdf_attachments:
        attachments.extend(pdf_attachments)
    elif pdf_report_bytes:
        attachments.append(
            {
                "filename": pdf_report_filename or f"vrika_executive_report_{scan_id[:8]}.pdf",
                "content": pdf_report_bytes,
                "type": "application/pdf",
            }
        )
    else:
        try:
            from app.services.pdf_report_generator import generate_executive_pdf_report

            generated_bytes = generate_executive_pdf_report(
                organization_name=org_name,
                provider=provider,
                account_id=account_id,
                account_name=account_name,
                scan_id=scan_id,
                compliance_score=compliance_score,
                scanned_resources=scanned_resources,
                findings=findings or {},
                attack_paths_count=attack_paths_count,
                top_attack_path=top_attack_path,
            )
            if generated_bytes:
                attachments.append(
                    {
                        "filename": f"vrika_executive_report_{scan_id[:8]}.pdf",
                        "content": generated_bytes,
                        "type": "application/pdf",
                    }
                )
        except Exception as exc:
            logger.warning("Could not auto-generate executive PDF report: %s", exc)

    safe_attachments: List[Dict[str, Any]] = []
    total_size = 0
    MAX_ATTACHMENT_BUDGET = 20 * 1024 * 1024  # 20MB budget for standard SMTP relays

    for att in attachments:
        c = att.get("content")
        size = len(c) if isinstance(c, (bytes, bytearray)) else len(str(c))
        if total_size + size <= MAX_ATTACHMENT_BUDGET:
            safe_attachments.append(att)
            total_size += size
        else:
            logger.warning(
                "Attachment %s (%d bytes) exceeds safe SMTP limit, omitting to prevent socket disconnect",
                att.get("filename"),
                size,
            )

    logger.info(
        "Sending Cloud Security scan email for org_id=%s (To: %s, CC: %d teammates, Attachments: %d, Total Attachment Size: %.2f MB)",
        org_id,
        scanner_norm,
        len(cc_emails),
        len(safe_attachments),
        total_size / (1024 * 1024),
    )

    try:
        return await send_mail_for_org(
            db,
            settings,
            org_id,
            to=scanner_norm,
            cc=cc_emails if cc_emails else None,
            subject=subject,
            body=text_body,
            html_body=html_body,
            attachments=safe_attachments if safe_attachments else None,
        )
    except Exception as exc:
        logger.warning("Primary scan email send encountered error: %s. Retrying with executive attachment only...", exc)
        exec_only = [safe_attachments[0]] if safe_attachments else None
        return await send_mail_for_org(
            db,
            settings,
            org_id,
            to=scanner_norm,
            cc=cc_emails if cc_emails else None,
            subject=subject,
            body=text_body,
            html_body=html_body,
            attachments=exec_only,
        )



async def send_attack_paths_completed_notification(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    *,
    org_id: ObjectId,
    scanner_email: str,
    provider: str,
    account_id: str,
    account_name: Optional[str] = None,
    scan_id: str,
    attack_paths_count: int = 1,
    blast_radius_count: Optional[str] = None,
    top_attack_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Dispatch dedicated high-priority Attack Path alert email."""
    org = await db[ORGANIZATIONS_COLLECTION].find_one({"_id": org_id})
    org_name = org.get("name") if org else "Your Organization"

    scanner_norm = scanner_email.strip().lower()

    other_users_cursor = db[USERS_COLLECTION].find(
        {"organization_id": org_id, "email": {"$ne": scanner_norm}}
    )
    cc_emails: List[str] = []
    async for u in other_users_cursor:
        e = str(u.get("email") or "").strip().lower()
        if e and e not in cc_emails and e != scanner_norm:
            cc_emails.append(e)

    dashboard_url = f"{settings.frontend_url.rstrip('/')}/dashboard/cloud-security"

    subject, html_body, text_body = render_attack_paths_email(
        organization_name=org_name,
        provider=provider,
        account_id=account_id,
        account_name=account_name,
        scan_id=scan_id,
        attack_paths_count=attack_paths_count,
        blast_radius_count=blast_radius_count,
        top_attack_path=top_attack_path,
        dashboard_url=dashboard_url,
    )

    logger.info(
        "Sending Attack Path Alert email for org_id=%s (To: %s, CC: %d teammates, Paths: %d)",
        org_id,
        scanner_norm,
        len(cc_emails),
        attack_paths_count,
    )

    return await send_mail_for_org(
        db,
        settings,
        org_id,
        to=scanner_norm,
        cc=cc_emails if cc_emails else None,
        subject=subject,
        body=text_body,
        html_body=html_body,
    )
