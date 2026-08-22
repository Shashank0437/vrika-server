"""Org admin config API — the central place to manage per-org settings."""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.db import get_database
from app.dependencies.tenant import require_tenant_admin
from app.schemas.org_settings import (
    BrandingConfigIn,
    BrandingConfigOut,
    FetchModelsIn,
    FetchModelsOut,
    LlmSettingsIn,
    LlmSettingsOut,
    OrgSettingsOut,
    SmtpConfigIn,
    SmtpConfigOut,
    SsoSettingsIn,
    SsoSettingsOut,
    TestLlmConnectionIn,
    TestLlmConnectionOut,
)
from app.services import org_settings as svc

router = APIRouter(prefix="/org/settings", tags=["org-settings"])


@router.get("", response_model=OrgSettingsOut)
async def get_settings_endpoint(
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> OrgSettingsOut:
    return await svc.get_org_settings(db, settings, user["organization_id"])


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


@router.patch("/llm", response_model=LlmSettingsOut)
async def update_llm_endpoint(
    payload: LlmSettingsIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> LlmSettingsOut:
    try:
        return await svc.update_llm_settings(db, settings, user["organization_id"], payload)
    except svc.OrgSettingsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.message)


@router.post("/llm/fetch-models", response_model=FetchModelsOut)
async def fetch_models_endpoint(
    payload: FetchModelsIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> FetchModelsOut:
    try:
        return await svc.fetch_available_models(db, settings, user["organization_id"], payload)
    except svc.OrgSettingsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.message)


@router.post("/llm/test-connection", response_model=TestLlmConnectionOut)
async def test_llm_connection_endpoint(
    payload: TestLlmConnectionIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> TestLlmConnectionOut:
    return await svc.test_llm_connection(db, settings, user["organization_id"], payload)


@router.patch("/sso", response_model=SsoSettingsOut)
async def update_sso_endpoint(
    payload: SsoSettingsIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> SsoSettingsOut:
    try:
        return await svc.update_sso_settings(db, settings, user["organization_id"], payload)
    except svc.OrgSettingsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.message)


@router.get("/llm/internal-resolve")
async def internal_resolve_llm_endpoint(
    secret: str = "",
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Internal microservice bridge endpoint for Cloud Security / Lighthouse to fetch active LLM config."""
    valid_secrets = {
        s.strip().strip("'").strip('"')
        for s in (
            settings.vrika_bridge_secret,
            settings.prowler_bridge_secret,
            settings.admin_api_key,
        )
        if s and s.strip().strip("'").strip('"')
    }
    if not valid_secrets or secret.strip().strip("'").strip('"') not in valid_secrets:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid bridge secret")

    # Find the primary active organization's LLM config or first org config
    first_doc = await db["organization_settings"].find_one({"llm.active_provider": {"$exists": True}})
    if not first_doc:
        first_doc = await db["organization_settings"].find_one()

    if not first_doc or "organization_id" not in first_doc:
        return {"configured": False}

    cfg = await svc.resolve_llm_config_for_org(db, settings, first_doc["organization_id"])
    if not cfg:
        return {"configured": False}

    return {"configured": True, **cfg}
