import logging
import secrets
from datetime import UTC, datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.constants import ORG_INVITE_REDIS_PREFIX
from app.db import get_database
from app.dependencies.tenant import require_tenant_admin
from app.dependencies.access import require_admin_view, require_manage_roles
from app.schemas.access import UpdateBindingsIn
from app.services.access import effective_bindings
from app.services.access_management import update_bindings, validate_bindings
from app.redis_client import get_redis
from app.schemas.tenant import CreateInvitationIn, TenantMemberOut, UpdateMemberRoleIn
from app.schemas.tenant_tools import OrgToolPolicyOut, PatchToolEnabledIn
from app.services.agent_client import (
    AgentUnreachableError,
    fetch_agent_health_and_catalog,
)
from app.services.brevo_email import (
    render_invitation_email,
    send_transactional_email_one,
)
from app.services.organization_tools import (
    catalog_tool_names,
    get_policy_doc,
    set_tool_enabled_for_org,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant", tags=["tenant"])


@router.get("/tools/policy", response_model=OrgToolPolicyOut)
async def get_org_tool_policy(
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> OrgToolPolicyOut:
    doc = await get_policy_doc(db, user["organization_id"])
    return OrgToolPolicyOut(disabled_tool_names=list(doc["disabled_tool_names"]))


@router.patch("/tools/policy", status_code=status.HTTP_200_OK)
async def patch_org_tool_policy(
    body: PatchToolEnabledIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, str]:
    s = get_settings()
    try:
        _, catalog = await fetch_agent_health_and_catalog(s)
    except AgentUnreachableError as e:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=e.message,
        ) from e
    names = catalog_tool_names(catalog)
    try:
        await set_tool_enabled_for_org(
            db,
            user["organization_id"],
            user["_id"],
            body.tool_name,
            enabled=body.enabled,
            valid_names=names,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {"detail": "ok"}


PENDING = "pending"
ACCEPTED = "accepted"
CANCELLED = "cancelled"


@router.get("/members", response_model=list[TenantMemberOut])
async def list_tenant_members(
    user: dict = Depends(require_admin_view),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[TenantMemberOut]:
    org_id = user["organization_id"]
    cursor = db.users.find({"organization_id": org_id}).sort("created_at", 1)
    out: list[TenantMemberOut] = []
    async for doc in cursor:
        out.append(
            TenantMemberOut(
                id=str(doc["_id"]),
                email=doc["email"],
                username=doc.get("username") or "",
                roles=list(doc.get("roles") or []),
                role_bindings=effective_bindings(doc),
                access_version=doc.get("access_version", 0),
            ),
        )
    return out


@router.put("/members/{member_id}/bindings", response_model=TenantMemberOut)
async def replace_member_bindings(
    member_id: str,
    body: UpdateBindingsIn,
    user: dict = Depends(require_manage_roles),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TenantMemberOut:
    updated = await update_bindings(
        db, user, member_id,
        [binding.model_dump() for binding in body.role_bindings], body.expected_version,
    )
    return TenantMemberOut(
        id=str(updated["_id"]), email=updated["email"], username=updated.get("username", ""),
        roles=updated["roles"], role_bindings=updated["role_bindings"],
        access_version=updated["access_version"],
    )


@router.patch("/members/{member_id}/role", response_model=TenantMemberOut)
@router.put("/members/{member_id}/role", response_model=TenantMemberOut)
async def update_member_role(
    member_id: str,
    body: UpdateMemberRoleIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TenantMemberOut:
    org_id = user["organization_id"]
    try:
        member_oid = ObjectId(member_id)
    except Exception:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Invalid member ID format.",
        )

    target_user = await db.users.find_one({"_id": member_oid, "organization_id": org_id})
    if not target_user:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Member not found in your organization.",
        )

    updated = await update_bindings(
        db, user, member_id, effective_bindings({"roles": [body.role]}),
        target_user.get("access_version", 0),
    )
    return TenantMemberOut(
        id=str(updated["_id"]),
        email=updated["email"],
        username=updated.get("username") or "",
        roles=list(updated.get("roles") or []),
        role_bindings=effective_bindings(updated),
        access_version=updated["access_version"],
    )


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    body: CreateInvitationIn,
    user: dict = Depends(require_tenant_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, str]:
    s = get_settings()
    org_id = user["organization_id"]
    bindings = (
        [binding.model_dump() for binding in body.role_bindings]
        if body.role_bindings is not None
        else effective_bindings({"roles": [body.role]})
    )
    await validate_bindings(db, org_id, bindings)
    from app.services.smtp_service import get_org_smtp_config

    smtp_cfg = await get_org_smtp_config(db, s, org_id)
    has_smtp = bool(smtp_cfg and smtp_cfg.get("enabled"))
    has_brevo = bool(s.brevo_api_key.strip() and s.brevo_sender_email.strip())
    if not has_smtp and not has_brevo:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured. Please configure SMTP in Organization Settings.",
        )

    email_norm = body.email.lower().strip()
    if await db.users.find_one({"email": email_norm}):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="That email already has a Vrika account. Invitation not sent.",
        )

    org_id = user["organization_id"]
    now = datetime.now(UTC)

    await db.organization_invitations.update_many(
        {"organization_id": org_id, "email": email_norm, "status": PENDING},
        {"$set": {"status": CANCELLED, "updated_at": now}},
    )

    invite_doc = {
        "organization_id": org_id,
        "email": email_norm,
        "username": body.username.strip(),
        "roles": [body.role],
        "role_bindings": bindings,
        "invited_by": user["_id"],
        "status": PENDING,
        "created_at": now,
        "updated_at": now,
        "phone": "",
    }
    insert_res = await db.organization_invitations.insert_one(invite_doc)
    inv_oid = insert_res.inserted_id

    token = secrets.token_urlsafe(32)
    ttl = s.invitation_token_ttl_seconds
    r = get_redis()
    redis_key = f"{ORG_INVITE_REDIS_PREFIX}{token}"
    await r.setex(redis_key, ttl, str(inv_oid))

    org = await db.organizations.find_one({"_id": org_id})
    org_name = org["name"] if org else "Your organization"

    inviter_username = user.get("username") or ""
    inviter_email = user.get("email") or ""
    inviter_display = inviter_username.strip() or inviter_email

    accept_url = f"{s.frontend_url.rstrip('/')}/invite/accept?token={token}"
    subject, html, text = render_invitation_email(
        invitee_username=body.username.strip(),
        organization_name=org_name,
        inviter_display=inviter_display,
        accept_url=accept_url,
    )

    try:
        from app.services.smtp_service import send_mail_for_org

        await send_mail_for_org(
            db,
            s,
            org_id,
            to=email_norm,
            subject=subject,
            body=text,
            html_body=html,
        )
    except Exception as exc:
        logger.exception("Failed to send organization invitation email: %s", exc)
        await r.delete(redis_key)
        await db.organization_invitations.delete_one({"_id": inv_oid})
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not send invitation email: {exc}",
        )

    logger.info(
        "Org invitation sent to %s org_id=%s inviter=%s",
        email_norm,
        str(org_id),
        inviter_display,
    )
    return {"detail": "Invitation sent."}
