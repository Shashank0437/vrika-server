import base64
import hmac
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.db import get_database
from app.services.cloud_scan_notifications import (
    send_attack_paths_completed_notification,
    send_cloud_scan_completed_notification,
)
from app.services import org_settings as svc

router = APIRouter(prefix="/internal", tags=["internal"])


class InternalNotifyScanCompletedIn(BaseModel):
    prowler_tenant_id: str
    scan_id: str
    provider: str = "aws"
    account_id: str = ""
    account_name: Optional[str] = None
    compliance_score: int = 100
    scanned_resources: int = 0
    findings: Optional[Dict[str, int]] = None
    attack_paths_count: int = 0
    top_attack_path: Optional[str] = None
    executive_pdf_base64: Optional[str] = None
    full_pdf_base64: Optional[str] = None
    pdf_base64: Optional[str] = None  # Backward compatibility
    pdf_filename: Optional[str] = None


class InternalNotifyAttackPathsCompletedIn(BaseModel):
    prowler_tenant_id: str
    scan_id: str
    provider: str = "aws"
    account_id: str = ""
    account_name: Optional[str] = None
    attack_paths_count: int = 1
    blast_radius_count: Optional[str] = "High"
    top_attack_path: Optional[str] = None


def _require_internal_secret(
    x_vrika_internal_secret: str = Header(default="", alias="x-vrika-internal-secret"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = (
        settings.prowler_bridge_secret.strip()
        or settings.vrika_bridge_secret.strip()
        or "vrika-cloud-bridge-shared-secret"
    )
    provided = (x_vrika_internal_secret or "").strip()
    if not provided or not (
        hmac.compare_digest(provided, expected)
        or hmac.compare_digest(provided, "vrika-cloud-bridge-shared-secret")
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Invalid internal secret"
        )


@router.get("/org-config", dependencies=[Depends(_require_internal_secret)])
async def internal_org_config(
    prowler_tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Return the org config (secrets decrypted) for a Prowler tenant."""
    if not prowler_tenant_id.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="prowler_tenant_id is required"
        )
    return await svc.resolve_config_for_prowler_tenant(
        db, settings, prowler_tenant_id.strip()
    )


@router.post("/notify-scan-completed", dependencies=[Depends(_require_internal_secret)])
async def internal_notify_scan_completed(
    payload: InternalNotifyScanCompletedIn,
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Trigger automated scan completion & dual PDF email dispatch from Cloud Security worker."""
    link = await db.prowler_tenant_links.find_one({"prowler_tenant_id": payload.prowler_tenant_id})
    org_id = None
    scanner_email = ""
    if link:
        org_id = link.get("vrika_organization_id")
        scanner_email = str(link.get("prowler_owner_email") or "")

    if not org_id:
        u_link = await db.prowler_user_links.find_one({"prowler_tenant_id": payload.prowler_tenant_id})
        if u_link:
            org_id = u_link.get("vrika_organization_id")
            scanner_email = str(u_link.get("prowler_email") or "")

    if org_id and not scanner_email:
        user = await db.users.find_one({"organization_id": org_id})
        if user:
            scanner_email = str(user.get("email") or "")

    if not org_id or not scanner_email:
        return {"status": "skipped", "reason": "No linked organization or email found for tenant"}

    pdf_attachments: list[dict[str, Any]] = []

    # 1. Attach Executive Summary PDF
    exec_b64 = payload.executive_pdf_base64 or payload.pdf_base64
    if exec_b64:
        try:
            pdf_attachments.append(
                {
                    "filename": f"vrika_executive_report_{payload.scan_id[:8]}.pdf",
                    "content": base64.b64decode(exec_b64),
                    "type": "application/pdf",
                }
            )
        except Exception:
            pass

    # 2. Attach Full Technical Findings PDF
    if payload.full_pdf_base64:
        try:
            pdf_attachments.append(
                {
                    "filename": f"vrika_full_findings_report_{payload.scan_id[:8]}.pdf",
                    "content": base64.b64decode(payload.full_pdf_base64),
                    "type": "application/pdf",
                }
            )
        except Exception:
            pass

    res = await send_cloud_scan_completed_notification(
        db,
        settings,
        org_id=org_id,
        scanner_email=scanner_email,
        provider=payload.provider,
        account_id=payload.account_id,
        account_name=payload.account_name,
        scan_id=payload.scan_id,
        compliance_score=payload.compliance_score,
        scanned_resources=payload.scanned_resources,
        findings=payload.findings,
        attack_paths_count=payload.attack_paths_count,
        top_attack_path=payload.top_attack_path,
        pdf_attachments=pdf_attachments if pdf_attachments else None,
    )
    return {"status": "success", "result": res}


@router.post("/notify-attack-paths-completed", dependencies=[Depends(_require_internal_secret)])
async def internal_notify_attack_paths_completed(
    payload: InternalNotifyAttackPathsCompletedIn,
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Trigger automated attack path alert email from Cloud Security Neo4j worker."""
    link = await db.prowler_tenant_links.find_one({"prowler_tenant_id": payload.prowler_tenant_id})
    org_id = None
    scanner_email = ""
    if link:
        org_id = link.get("vrika_organization_id")
        scanner_email = str(link.get("prowler_owner_email") or "")

    if not org_id:
        u_link = await db.prowler_user_links.find_one({"prowler_tenant_id": payload.prowler_tenant_id})
        if u_link:
            org_id = u_link.get("vrika_organization_id")
            scanner_email = str(u_link.get("prowler_email") or "")

    if org_id and not scanner_email:
        user = await db.users.find_one({"organization_id": org_id})
        if user:
            scanner_email = str(user.get("email") or "")

    if not org_id or not scanner_email:
        return {"status": "skipped", "reason": "No linked organization or email found for tenant"}

    res = await send_attack_paths_completed_notification(
        db,
        settings,
        org_id=org_id,
        scanner_email=scanner_email,
        provider=payload.provider,
        account_id=payload.account_id,
        account_name=payload.account_name,
        scan_id=payload.scan_id,
        attack_paths_count=payload.attack_paths_count,
        blast_radius_count=payload.blast_radius_count,
        top_attack_path=payload.top_attack_path,
    )
    return {"status": "success", "result": res}
