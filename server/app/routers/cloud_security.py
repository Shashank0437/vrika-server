from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.schemas.cloud_security import CloudSecurityEmbedOut
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
