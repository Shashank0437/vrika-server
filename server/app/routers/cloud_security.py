from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.dependencies.access import require_cloud_access
from app.services.access import has_permission
from app.schemas.cloud_security import CloudSecurityEmbedOut, NotifyScanCompletedIn
from app.services.cloud_scan_notifications import (
    NotificationRoutingError,
    resolve_notification_project,
    send_cloud_scan_completed_notification,
)
from app.services.prowler_bridge import ProwlerBridgeError, get_cloud_security_embed_path
from app.services.prowler_client import ProwlerApiError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/cloud-security/embed", response_model=CloudSecurityEmbedOut)
async def cloud_security_embed(
    project_id: str | None = None,
    user: dict = Depends(require_cloud_access),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> CloudSecurityEmbedOut:
    if project_id and not has_permission(user, "view", module="cloud_security", project_id=project_id):
        raise HTTPException(403, "Cloud Security access to this project is required")
    try:
        embed_path = await get_cloud_security_embed_path(db, settings, user, project_id=project_id)
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
    """Send a Cloud report only to authorized members of its provider's project."""
    try:
        project = await resolve_notification_project(
            db, user["organization_id"], str(payload.provider_id)
        )
        if not has_permission(
            user, "execute", module="cloud_security", project_id=str(project["_id"])
        ):
            raise HTTPException(403, "Cloud Security execute permission required for this project")
        res = await send_cloud_scan_completed_notification(
            db,
            settings,
            org_id=user["organization_id"],
            provider_id=str(payload.provider_id),
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
    except NotificationRoutingError as exc:
        raise HTTPException(409, str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send scan notification: {exc}",
        )
