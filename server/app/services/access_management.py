import logging
from datetime import UTC, datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pymongo.errors import PyMongoError

from app.config import get_settings
from app.redis_client import get_redis
from app.schemas.access import RoleBinding
from app.services.access import compatibility_roles, effective_bindings, has_permission

logger = logging.getLogger(__name__)


def object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(400, "Invalid resource ID") from exc


async def validate_bindings(db, organization_id, bindings: list[dict]) -> None:
    parsed = [RoleBinding.model_validate(binding) for binding in bindings]
    if len(set(parsed)) != len(parsed):
        raise HTTPException(400, "Duplicate role bindings")
    for binding in parsed:
        if binding.role == "viewer" and binding.scope_type == "global":
            raise HTTPException(
                400, "Viewer access requires explicit module or project bindings"
            )
        if binding.scope_type == "project":
            project = await db.projects.find_one(
                {
                    "_id": object_id(binding.scope_id),
                    "organization_id": organization_id,
                }
            )
            if not project:
                raise HTTPException(404, "Project not found in your organization")


async def complete_pending_access(db, user):
    """Resume an idempotent, durably recorded change while holding the organization lock."""
    from app.services.cloud_access import sync_cloud_access

    pending = user.get("pending_access_change")
    if not pending:
        return user
    proposed = {
        **user,
        "role_bindings": pending["bindings"],
        "roles": compatibility_roles(pending["bindings"]),
        "access_version": pending["version"],
    }
    try:
        await db.access_audit.update_one(
            {"_id": pending["id"]},
            {
                "$setOnInsert": {
                    "organization_id": user["organization_id"],
                    "actor_id": pending["actor_id"],
                    "member_id": user["_id"],
                    "before": pending["before"],
                    "after": pending["bindings"],
                    "created_at": pending["created_at"],
                    "event": "access_change_requested",
                }
            },
            upsert=True,
        )
        await sync_cloud_access(db, get_settings(), proposed)
        before_projects = {
            b["scope_id"] for b in pending["before"] if b["scope_type"] == "project"
        }
        after_projects = {
            b["scope_id"] for b in pending["bindings"] if b["scope_type"] == "project"
        }
        roster_projects = before_projects | after_projects
        if pending.get("managed_project_id"):
            roster_projects.add(pending["managed_project_id"])
        for project_id in roster_projects:
            roster_result = await db.projects.update_one(
                {"_id": object_id(project_id), "organization_id": user["organization_id"]},
                {
                    "$addToSet" if project_id in after_projects else "$pull":
                    {"member_ids": str(user["_id"])}
                },
            )
            if roster_result.matched_count != 1:
                raise HTTPException(409, "Project changed during access synchronization")
        result = await db.users.update_one(
            {"_id": user["_id"], "pending_access_change.id": pending["id"]},
            {
                "$set": {
                    "role_bindings": proposed["role_bindings"],
                    "roles": proposed["roles"],
                    "access_version": proposed["access_version"],
                    "updated_at": datetime.now(UTC),
                },
                "$unset": {"pending_access_change": ""},
            },
        )
        if result.matched_count != 1:
            raise HTTPException(409, "Access changed concurrently; reload and retry")
    except (HTTPException, PyMongoError) as exc:
        logger.error(
            "Access synchronization pending member=%s operation=%s",
            user["_id"],
            pending["id"],
        )
        raise HTTPException(
            503,
            "Access change is pending synchronization. Retry to finish it before making further changes.",
        ) from exc
    proposed.pop("pending_access_change", None)
    return proposed


async def resume_pending_access(db, user):
    if not user.get("pending_access_change"):
        return user
    lock = get_redis().lock(
        f"rbac:{user['organization_id']}", timeout=120, blocking_timeout=5
    )
    if not await lock.acquire():
        raise HTTPException(503, "Access synchronization is in progress; retry")
    try:
        current = await db.users.find_one({"_id": user["_id"]})
        if not current:
            raise HTTPException(401, "User not found")
        return await complete_pending_access(db, current)
    finally:
        await lock.release()


async def update_bindings(
    db, actor, member_id, bindings, expected_version,
    *, managed_project_id=None, project_role=None,
):
    """Serialize organization role changes, including last-admin checks and cloud synchronization."""
    org_id = actor["organization_id"]
    lock = get_redis().lock(f"rbac:{org_id}", timeout=120, blocking_timeout=5)
    if not await lock.acquire():
        raise HTTPException(409, "Another access change is in progress; retry")
    try:
        pending_users = await db.users.find(
            {
                "organization_id": org_id,
                "pending_access_change": {"$exists": True},
            }
        ).to_list(length=None)
        for pending_user in pending_users:
            await complete_pending_access(db, pending_user)
        current_actor = await db.users.find_one(
            {"_id": actor["_id"], "organization_id": org_id}
        )
        allowed = current_actor and has_permission(
            current_actor,
            "manage_members" if managed_project_id else "manage_roles",
            project_id=managed_project_id,
        )
        if not allowed:
            raise HTTPException(403, "Role-management permission has been revoked")
        if managed_project_id:
            if project_role not in {None, "viewer", "analyst", "lead"}:
                raise HTTPException(400, "Invalid project role")
            if not await db.projects.find_one(
                {"_id": object_id(managed_project_id), "organization_id": org_id}
            ):
                raise HTTPException(404, "Project not found")
        target = await db.users.find_one(
            {"_id": object_id(member_id), "organization_id": org_id}
        )
        if not target:
            raise HTTPException(404, "Member not found in your organization")
        if target.get("access_version", 0) != expected_version:
            raise HTTPException(
                409, "Permissions changed since this page loaded. Reload and retry."
            )
        if managed_project_id:
            bindings = [
                binding for binding in effective_bindings(target)
                if not (
                    binding["scope_type"] == "project"
                    and binding["scope_id"] == managed_project_id
                )
            ]
            if project_role is not None:
                bindings.append({
                    "role": project_role,
                    "scope_type": "project",
                    "scope_id": managed_project_id,
                })
        await validate_bindings(db, org_id, bindings)
        proposed = {
            **target,
            "role_bindings": bindings,
            "access_version": expected_version + 1,
        }
        if has_permission(target, "manage_roles") and not has_permission(
            proposed, "manage_roles"
        ):
            others = await db.users.find(
                {
                    "organization_id": org_id,
                    "_id": {"$ne": target["_id"]},
                }
            ).to_list(length=None)
            if not any(has_permission(other, "manage_roles") for other in others):
                raise HTTPException(400, "Cannot remove the organization's last Admin")
        pending = {
            "id": ObjectId(),
            "actor_id": actor["_id"],
            "before": effective_bindings(target),
            "bindings": bindings,
            "version": expected_version + 1,
            "created_at": datetime.now(UTC),
            "managed_project_id": managed_project_id,
        }
        result = await db.users.update_one(
            {"_id": target["_id"], "organization_id": org_id},
            {"$set": {"pending_access_change": pending}},
        )
        if result.matched_count != 1:
            raise HTTPException(409, "Member changed concurrently; reload and retry")
        saved = await complete_pending_access(
            db, {**target, "pending_access_change": pending}
        )
        logger.info(
            "Updated role bindings member=%s org=%s actor=%s",
            member_id,
            org_id,
            actor["_id"],
        )
        return saved
    finally:
        await lock.release()
