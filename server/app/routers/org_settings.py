"""Org admin config API — the central place to manage per-org settings."""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.db import get_database
from app.dependencies.tenant import require_tenant_admin
from app.schemas.org_settings import (
    BrandingConfigIn,
    BrandingConfigOut,
    OrgSettingsOut,
    SmtpConfigIn,
    SmtpConfigOut,
)
from app.services import org_settings as svc

router = APIRouter(prefix="/org/settings", tags=["org-settings"])


@router.get("", response_model=OrgSettingsOut)
async def get_settings_endpoint(
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> OrgSettingsOut:
    return await svc.get_org_settings(db, user["organization_id"])


@router.patch("/branding", response_model=BrandingConfigOut)
async def update_branding_endpoint(
    payload: BrandingConfigIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> BrandingConfigOut:
    try:
        return await svc.update_branding(db, user["organization_id"], payload)
    except svc.OrgSettingsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.message)


@router.delete("/branding", response_model=BrandingConfigOut)
async def delete_branding_endpoint(
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> BrandingConfigOut:
    return await svc.delete_branding(db, user["organization_id"])


@router.patch("/smtp", response_model=SmtpConfigOut)
async def update_smtp_endpoint(
    payload: SmtpConfigIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> SmtpConfigOut:
    try:
        return await svc.update_smtp(db, settings, user["organization_id"], payload)
    except svc.OrgSettingsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.message)
