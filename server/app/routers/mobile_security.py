from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.dependencies.access import require_mobile_access
from app.schemas.mobile_security import MobileSecurityEmbedOut
from app.services.mobile_bridge import (
    ProwlerBridgeError,
    get_mobile_security_embed_path,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/mobile-security/embed", response_model=MobileSecurityEmbedOut)
async def mobile_security_embed(
    user: dict = Depends(require_mobile_access),
    settings: Settings = Depends(get_settings),
) -> MobileSecurityEmbedOut:
    try:
        embed_path = get_mobile_security_embed_path(settings, user)
    except ProwlerBridgeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    return MobileSecurityEmbedOut(embed_path=embed_path)
