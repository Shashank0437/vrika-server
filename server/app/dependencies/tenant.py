from fastapi import Depends, HTTPException, Request, status

from app.dependencies.auth import require_auth_user
from app.services.access import has_permission


async def require_tenant_admin(request: Request, user: dict = Depends(require_auth_user)) -> dict:
    permitted = has_permission(user, "manage_roles")
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        permitted = has_permission(user, "view")
    if request.url.path.startswith("/tenant/tools/"):
        action = "view" if request.method == "GET" else "edit"
        permitted = has_permission(user, action, module="web_security")
    if not permitted:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Tenant administrator role required",
        )
    return user
