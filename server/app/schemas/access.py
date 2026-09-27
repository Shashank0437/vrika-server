from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Action = Literal["view", "execute", "edit", "manage_members", "manage_roles"]
Module = Literal["web_security", "cloud_security"]


class RoleBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    role: Literal["viewer", "analyst", "lead", "admin"]
    scope_type: Literal["global", "module", "project"]
    scope_id: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def valid_scope(self):
        if self.role in {"viewer", "admin"}:
            valid = self.scope_type == "global" and self.scope_id is None
        elif self.role == "analyst":
            valid = self.scope_type == "module" and self.scope_id in {
                "web_security",
                "cloud_security",
            }
        else:
            valid = self.scope_type == "project" and bool(self.scope_id)
        if not valid:
            raise ValueError("Role and scope combination is invalid")
        return self


class UpdateBindingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_bindings: list[RoleBinding] = Field(max_length=100)
    expected_version: int = Field(ge=0)

    @model_validator(mode="after")
    def unique_bindings(self):
        if len(set(self.role_bindings)) != len(self.role_bindings):
            raise ValueError("Duplicate role bindings")
        return self


class ProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)


class ProjectOut(BaseModel):
    id: str
    name: str
    member_ids: list[str] = Field(default_factory=list)
    cloud_provider_ids: list[str] = Field(default_factory=list)


class ProjectMembersIn(BaseModel):
    member_ids: list[str] = Field(max_length=500)


class ProjectProvidersIn(BaseModel):
    provider_ids: list[str] = Field(max_length=500)


class SessionProjectIn(BaseModel):
    project_id: str | None = None
