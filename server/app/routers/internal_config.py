"""Internal server-to-server config API.

Cloud Security (Prowler) calls this to fetch an organization's config for a
given Prowler tenant. Authenticated with a shared secret header (reusing the
bridge secret), NOT a user token — it is only reachable inside the private
Docker network.
"""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.db import get_database
from app.services import org_settings as svc

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_internal_secret(
    x_vrika_internal_secret: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = (
        settings.prowler_bridge_secret.strip()
        or settings.vrika_bridge_secret.strip()
    )
    provided = (x_vrika_internal_secret or "").strip()
    if not expected or not provided or not hmac.compare_digest(provided, expected):
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
