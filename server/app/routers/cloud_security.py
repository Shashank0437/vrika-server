from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.schemas.cloud_security import CloudSecurityEmbedOut, NotifyScanCompletedIn
from app.services.cloud_scan_notifications import send_cloud_scan_completed_notification
from app.services.prowler_bridge import ProwlerBridgeError, get_cloud_security_embed_path
from app.services.prowler_client import ProwlerApiError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/cloud-security/embed", response_model=CloudSecurityEmbedOut)
async def cloud_security_embed(
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> CloudSecurityEmbedOut:
    try:
        embed_path = await get_cloud_security_embed_path(db, settings, user)
    except ProwlerBridgeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    except ProwlerApiError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Prowler API error: {exc.message}",
        )
    return CloudSecurityEmbedOut(embed_path=embed_path)


@router.post("/cloud-security/notify-scan-completed")
async def notify_scan_completed(
    payload: NotifyScanCompletedIn,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Trigger picture-perfect Cloud Security scan & attack graph completion notification email.
    
    Dispatches to the user who ran the scan (To:) and CCs all other teammates in the organization.
    """
    try:
        res = await send_cloud_scan_completed_notification(
            db,
            settings,
            org_id=user["organization_id"],
            scanner_email=user["email"],
            provider=payload.provider,
            account_id=payload.account_id,
            account_name=payload.account_name,
            scan_id=payload.scan_id,
            compliance_score=payload.compliance_score,
            scanned_resources=payload.scanned_resources,
            findings=payload.findings,
            attack_paths_count=payload.attack_paths_count,
            top_attack_path=payload.top_attack_path,
        )
        return {"status": "success", "detail": res}
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send scan notification: {exc}",
        )
