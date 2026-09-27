"""
server/app/services/cloud_scan_notifications.py

Renders and sends Cloud Security scan completion and Attack Graph notifications
via the organization's dynamic SMTP server, restricted to the provider's project members.
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
from app.services.access import has_permission
from app.services.smtp_service import send_mail_for_org

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"
_jinja_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=True)


class NotificationRoutingError(RuntimeError):
    """A notification cannot be safely routed to one project's members."""


async def resolve_notification_project(db, org_id: ObjectId, provider_id: str) -> dict:
    projects = await db.projects.find(
        {"organization_id": org_id, "cloud_provider_ids": provider_id}
    ).to_list(length=2)
    if not provider_id or len(projects) != 1:
        logger.warning(
            "Blocked Cloud email: provider must belong to exactly one project (org=%s provider=%s)",
            org_id, provider_id,
        )
        raise NotificationRoutingError(
            "Cloud email requires the provider to be assigned to exactly one project"
        )
    return projects[0]


async def resolve_project_recipients(
    db, org_id: ObjectId, provider_id: str, scanner_email: str = ""
) -> tuple[dict, str, list[str]]:
    project = await resolve_notification_project(db, org_id, provider_id)
    project_id = str(project["_id"])
    candidates = db[USERS_COLLECTION].find({
        "organization_id": org_id,
        "$or": [
            {"_id": {"$in": [ObjectId(mid) for mid in project.get("member_ids", [])]}},
            {"role_bindings": {"$elemMatch": {
                "scope_type": "project", "scope_id": project_id,
            }}},
        ],
    })
    recipients: set[str] = set()
    async for user in candidates:
        # Do not send against stale permissions while a grant/revocation is pending.
        if user.get("pending_access_change"):
            logger.warning(
                "Excluded Cloud email recipient with pending access change (project=%s user=%s)",
                project_id, user["_id"],
            )
            continue
        if not has_permission(user, "view", module="cloud_security", project_id=project_id):
            continue
        email = str(user.get("email") or "").strip().lower()
        if email:
            recipients.add(email)
        else:
            logger.warning(
                "Excluded Cloud email recipient without an email address (project=%s user=%s)",
                project_id, user["_id"],
            )
    if not recipients:
        logger.warning(
            "Blocked Cloud email: no authorized project recipients (org=%s project=%s)",
            org_id, project_id,
        )
        raise NotificationRoutingError(
            "Cloud email requires at least one project member with Cloud Security read access"
        )
    preferred = scanner_email.strip().lower()
    to = preferred if preferred in recipients else min(recipients)
    return project, to, sorted(recipients - {to})


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
    project_name: Optional[str] = None,
) -> tuple[str, str, str]:
    """Returns (subject, html_body, text_body) for Cloud Security Scan & Compliance."""
    html_template = _jinja_env.get_template("cloud_scan_completed.html.j2")
    text_template = _jinja_env.get_template("cloud_scan_completed.txt.j2")

    ctx = {
        "organization_name": organization_name,
        "project_name": project_name,
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

    subject = f"Vrika Cloud Scan Complete — {provider.upper()} ({account_id})"
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
    project_name: Optional[str] = None,
) -> tuple[str, str, str]:
    """Returns (subject, html_body, text_body) for Dedicated Attack Path Alerts."""
    html_template = _jinja_env.get_template("attack_paths_completed.html.j2")
    text_template = _jinja_env.get_template("attack_paths_completed.txt.j2")

    ctx = {
        "organization_name": organization_name,
        "project_name": project_name,
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
    provider_id: str,
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
    """Dispatch reports only to authorized members of the provider's project."""
    project = await resolve_notification_project(db, org_id, provider_id)
    org = await db[ORGANIZATIONS_COLLECTION].find_one({"_id": org_id})
    org_name = org.get("name") if org else "Your Organization"

    dashboard_url = f"{settings.frontend_url.rstrip('/')}/dashboard/cloud-security"

    subject, html_body, text_body = render_cloud_scan_email(
        organization_name=org_name,
        project_name=project["name"],
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

    async def dispatch(report_attachments):
        current_project, to, cc = await resolve_project_recipients(
            db, org_id, provider_id, scanner_email
        )
        if current_project["_id"] != project["_id"]:
            logger.warning("Blocked Cloud email: provider project changed (scan=%s)", scan_id)
            raise NotificationRoutingError("Provider project changed; regenerate the email")
        logger.info(
            "Sending Cloud scan email (org=%s project=%s scan=%s recipients=%d attachments=%d)",
            org_id, project["_id"], scan_id, 1 + len(cc), len(report_attachments or []),
        )
        return await send_mail_for_org(
            db,
            settings,
            org_id,
            to=to,
            cc=cc or None,
            subject=subject,
            body=text_body,
            html_body=html_body,
            attachments=report_attachments,
        )

    try:
        return await dispatch(safe_attachments or None)
    except NotificationRoutingError:
        raise
    except Exception as exc:
        logger.warning("Primary scan email send encountered error: %s. Retrying with executive attachment only...", exc)
        exec_only = [safe_attachments[0]] if safe_attachments else None
        return await dispatch(exec_only)



async def send_attack_paths_completed_notification(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    *,
    org_id: ObjectId,
    provider_id: str,
    scanner_email: str,
    provider: str,
    account_id: str,
    account_name: Optional[str] = None,
    scan_id: str,
    attack_paths_count: int = 1,
    blast_radius_count: Optional[str] = None,
    top_attack_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Dispatch a high-priority alert only to authorized project members."""
    project, to, cc = await resolve_project_recipients(
        db, org_id, provider_id, scanner_email
    )
    org = await db[ORGANIZATIONS_COLLECTION].find_one({"_id": org_id})
    org_name = org.get("name") if org else "Your Organization"

    dashboard_url = f"{settings.frontend_url.rstrip('/')}/dashboard/cloud-security"

    subject, html_body, text_body = render_attack_paths_email(
        organization_name=org_name,
        project_name=project["name"],
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
        "Sending Attack Path Alert email for org_id=%s project=%s (Recipients: %d, Paths: %d)",
        org_id,
        project["_id"],
        1 + len(cc),
        attack_paths_count,
    )

    return await send_mail_for_org(
        db,
        settings,
        org_id,
        to=to,
        cc=cc or None,
        subject=subject,
        body=text_body,
        html_body=html_body,
    )
