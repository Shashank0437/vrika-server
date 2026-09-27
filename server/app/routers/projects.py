from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.db import get_database
from app.dependencies.access import require_manage_roles
from app.dependencies.auth import require_auth_user
from app.schemas.access import (
    ProjectIn,
    ProjectMembersIn,
    ProjectOut,
    ProjectProvidersIn,
    ProjectMemberRoleIn,
    ProjectMemberRoleOut,
)
from app.services.access import accessible_project_ids, effective_bindings, has_permission
from app.services.access_management import object_id, update_bindings
from app.services.cloud_access import sync_cloud_access

router = APIRouter(prefix="/projects", tags=["projects"])


def project_out(doc):
    return ProjectOut(
        id=str(doc["_id"]),
        name=doc["name"],
        member_ids=doc.get("member_ids", []),
        cloud_provider_ids=doc.get("cloud_provider_ids", []),
    )


async def require_project(db, user, project_id, action):
    project = await db.projects.find_one(
        {
            "_id": object_id(project_id),
            "organization_id": user["organization_id"],
        }
    )
    if not project:
        raise HTTPException(404, "Project not found")
    if not has_permission(user, action, project_id=project_id):
        raise HTTPException(403, f"Missing {action} permission for this project")
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(user=Depends(require_auth_user), db=Depends(get_database)):
    query = {"organization_id": user["organization_id"]}
    if not has_permission(user, "view") and not any(
        has_permission(user, "view", module=module)
        for module in ("web_security", "cloud_security")
    ):
        query["_id"] = {"$in": [object_id(pid) for pid in accessible_project_ids(user)]}
    rows = await db.projects.find(query).sort("name", 1).to_list(length=None)
    return [project_out(row) for row in rows]


@router.get("/member-options")
async def project_member_options(
    user=Depends(require_auth_user), db=Depends(get_database)
):
    if not has_permission(user, "view") and not accessible_project_ids(
        user, "manage_members"
    ):
        raise HTTPException(403, "Project membership management permission required")
    rows = await db.users.find(
        {"organization_id": user["organization_id"]},
        {"email": 1, "username": 1},
    ).to_list(length=None)
    return [
        {
            "id": str(row["_id"]),
            "email": row["email"],
            "username": row.get("username", ""),
        }
        for row in rows
    ]


@router.get("/cloud-providers")
async def list_cloud_providers(
    user=Depends(require_manage_roles), db=Depends(get_database)
):
    result = await sync_cloud_access(db, get_settings(), user, list_providers=True)
    if result is None:
        raise HTTPException(
            409, "Open Cloud Security once to connect your cloud account"
        )
    return result["providers"]


@router.put("/{project_id}/providers", response_model=ProjectOut)
async def assign_providers(
    project_id: str,
    body: ProjectProvidersIn,
    user=Depends(require_manage_roles),
    db=Depends(get_database),
):
    doc = await require_project(db, user, project_id, "edit")
    provider_ids = list(dict.fromkeys(body.provider_ids))
    result = await sync_cloud_access(
        db,
        get_settings(),
        user,
        provider_assignment={
            "project_id": project_id,
            "provider_ids": provider_ids,
        },
    )
    if result is None:
        raise HTTPException(
            409, "Open Cloud Security once to connect your cloud account"
        )
    await db.projects.update_many(
        {"organization_id": user["organization_id"]},
        {"$pull": {"cloud_provider_ids": {"$in": provider_ids}}},
    )
    await db.projects.update_one(
        {"_id": doc["_id"], "organization_id": user["organization_id"]},
        {"$set": {"cloud_provider_ids": provider_ids}},
    )
    return project_out({**doc, "cloud_provider_ids": provider_ids})


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectIn, user=Depends(require_manage_roles), db=Depends(get_database)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Project name cannot be blank")
    doc = {
        "organization_id": user["organization_id"],
        "name": name,
        "member_ids": [],
        "cloud_provider_ids": [],
        "created_at": datetime.now(UTC),
    }
    doc["_id"] = (await db.projects.insert_one(doc)).inserted_id
    return project_out(doc)


@router.patch("/{project_id}", response_model=ProjectOut)
async def rename_project(
    project_id: str,
    body: ProjectIn,
    user=Depends(require_auth_user),
    db=Depends(get_database),
):
    doc = await require_project(db, user, project_id, "edit")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Project name cannot be blank")
    await db.projects.update_one(
        {"_id": doc["_id"], "organization_id": user["organization_id"]},
        {"$set": {"name": name}},
    )
    return project_out({**doc, "name": name})


@router.put("/{project_id}/members", response_model=ProjectOut)
async def assign_members(
    project_id: str,
    body: ProjectMembersIn,
    user=Depends(require_auth_user),
    db=Depends(get_database),
):
    doc = await require_project(db, user, project_id, "manage_members")
    member_ids = list(dict.fromkeys(body.member_ids))
    count = await db.users.count_documents(
        {
            "_id": {"$in": [object_id(mid) for mid in member_ids]},
            "organization_id": user["organization_id"],
        }
    )
    if count != len(member_ids):
        raise HTTPException(400, "Every member must belong to this organization")
    await db.projects.update_one(
        {"_id": doc["_id"], "organization_id": user["organization_id"]},
        {"$set": {"member_ids": member_ids}},
    )
    return project_out({**doc, "member_ids": member_ids})


def project_member_role_out(user, project):
    roles = [
        binding["role"] for binding in effective_bindings(user)
        if binding["scope_type"] == "project" and binding["scope_id"] == str(project["_id"])
    ]
    rank = {"viewer": 0, "analyst": 1, "lead": 2}
    role = max(roles, key=rank.__getitem__) if roles else None
    return ProjectMemberRoleOut(
        id=str(user["_id"]),
        email=user["email"],
        username=user.get("username", ""),
        role=role,
        is_member=bool(role) or str(user["_id"]) in project.get("member_ids", []),
        access_version=user.get("access_version", 0),
    )


@router.get("/{project_id}/member-roles", response_model=list[ProjectMemberRoleOut])
async def list_project_member_roles(
    project_id: str,
    user=Depends(require_auth_user),
    db=Depends(get_database),
):
    project = await require_project(db, user, project_id, "manage_members")
    members = await db.users.find(
        {"organization_id": user["organization_id"]}
    ).sort("username", 1).to_list(length=None)
    return [project_member_role_out(member, project) for member in members]


@router.put("/{project_id}/members/{member_id}/role", response_model=ProjectMemberRoleOut)
async def set_project_member_role(
    project_id: str,
    member_id: str,
    body: ProjectMemberRoleIn,
    user=Depends(require_auth_user),
    db=Depends(get_database),
):
    await require_project(db, user, project_id, "manage_members")
    saved = await update_bindings(
        db, user, member_id, [], body.expected_version,
        managed_project_id=project_id, project_role=body.role,
    )
    project = await db.projects.find_one(
        {"_id": object_id(project_id), "organization_id": user["organization_id"]}
    )
    return project_member_role_out(saved, project)
