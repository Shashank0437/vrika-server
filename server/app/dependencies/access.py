import json

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.constants import AGENT_CHAT_SESSIONS_COLLECTION
from app.db import get_database
from app.dependencies.auth import require_auth_user
from app.services.access import can_enter_module, has_permission


async def require_manage_roles(user: dict = Depends(require_auth_user)) -> dict:
    if not has_permission(user, "manage_roles"):
        raise HTTPException(403, "Managing role bindings requires manage_roles")
    return user


async def require_admin_view(user: dict = Depends(require_auth_user)) -> dict:
    if not has_permission(user, "view"):
        raise HTTPException(403, "Global read access required")
    return user


async def require_web_access(
    request: Request,
    user: dict = Depends(require_auth_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    action = (
        "view"
        if request.method in {"GET", "HEAD", "OPTIONS"}
        else ("edit" if request.method in {"PATCH", "PUT", "DELETE"} else "execute")
    )
    session_id = request.path_params.get("session_id")
    project_id = None
    if session_id:
        try:
            sid = ObjectId(session_id)
        except InvalidId as exc:
            raise HTTPException(400, "Invalid session ID") from exc
        session = await db[AGENT_CHAT_SESSIONS_COLLECTION].find_one(
            {"_id": sid, "organization_id": user["organization_id"]}
        )
        if not session:
            raise HTTPException(404, "Session not found")
        project_id = session.get("project_id")
    elif request.method == "POST" and request.url.path.rstrip("/").endswith(
        "/sessions"
    ):
        try:
            body = await request.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "A JSON session payload is required") from exc
        project_id = body.get("project_id") if isinstance(body, dict) else None
        if project_id:
            try:
                project = await db.projects.find_one(
                    {
                        "_id": ObjectId(project_id),
                        "organization_id": user["organization_id"],
                    }
                )
            except (InvalidId, TypeError) as exc:
                raise HTTPException(400, "Invalid project ID") from exc
            if not project:
                raise HTTPException(404, "Project not found")

    permitted = has_permission(
        user, action, module="web_security", project_id=project_id
    )
    if not session_id and action == "view":
        permitted = can_enter_module(user, "web_security")
    if not permitted:
        raise HTTPException(
            403, f"Missing {action} permission for this Web Security resource"
        )
    return user


async def require_cloud_access(user: dict = Depends(require_auth_user)) -> dict:
    if not can_enter_module(user, "cloud_security"):
        raise HTTPException(403, "Cloud Security access required")
    return user


async def require_web_module_access(
    request: Request, user: dict = Depends(require_auth_user)
) -> dict:
    action = "view" if request.method in {"GET", "HEAD", "OPTIONS"} else "execute"
    if not has_permission(user, action, module="web_security"):
        raise HTTPException(
            403, f"Module-wide {action} permission required for workspace tools"
        )
    return user
