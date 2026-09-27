from typing import Literal

from pydantic import BaseModel, EmailStr, Field
from app.schemas.access import RoleBinding


class TenantMemberOut(BaseModel):
    id: str
    email: str
    username: str
    roles: list[str]
    role_bindings: list[RoleBinding] = Field(default_factory=list)
    access_version: int = 0


class CreateInvitationIn(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=1, max_length=120)
    role: Literal["tenant_member", "tenant_admin"] = "tenant_member"
    role_bindings: list[RoleBinding] | None = Field(default=None, max_length=100)


class UpdateMemberRoleIn(BaseModel):
    role: Literal["tenant_member", "tenant_admin"]


class InvitationPreviewOut(BaseModel):
    organization_name: str
    inviter_display: str
    invitee_email: str
    invitee_username: str
    sso_available: bool = False
    sso_required: bool = False
    provider_display_name: str = ""
