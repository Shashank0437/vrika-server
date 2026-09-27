"""Organization-local role bindings. Explicit empty bindings grant no access."""

from app.schemas.access import Action, RoleBinding

ROLE_ACTIONS = {
    "viewer": frozenset({"view"}),
    "analyst": frozenset({"view", "execute", "edit"}),
    "lead": frozenset({"view", "execute", "edit", "manage_members"}),
    "admin": frozenset({"view", "execute", "edit", "manage_members", "manage_roles"}),
}


def effective_bindings(user: dict) -> list[dict]:
    if "role_bindings" in user:
        return [
            RoleBinding.model_validate(binding).model_dump()
            for binding in user["role_bindings"]
        ]
    roles = user.get("roles") or []
    if "tenant_admin" in roles:
        return [{"role": "admin", "scope_type": "global", "scope_id": None}]
    if "tenant_member" in roles:
        return [
            {"role": "analyst", "scope_type": "module", "scope_id": module}
            for module in ("web_security", "cloud_security")
        ]
    return []


def has_permission(
    user: dict,
    action: Action,
    *,
    module: str | None = None,
    project_id: str | None = None,
) -> bool:
    for binding in effective_bindings(user):
        if action not in ROLE_ACTIONS[binding["role"]]:
            continue
        scope = binding["scope_type"]
        if scope == "global":
            return True
        if scope == "module" and binding["scope_id"] == module:
            return True
        if scope == "project" and project_id and binding["scope_id"] == project_id:
            return True
    return False


def accessible_project_ids(user: dict, action: Action = "view") -> list[str]:
    return [
        binding["scope_id"]
        for binding in effective_bindings(user)
        if binding["scope_type"] == "project"
        and action in ROLE_ACTIONS[binding["role"]]
    ]


def can_enter_module(user: dict, module: str) -> bool:
    return has_permission(user, "view", module=module) or bool(
        accessible_project_ids(user)
    )


def compatibility_roles(bindings: list[dict]) -> list[str]:
    return (
        ["tenant_admin"]
        if has_permission({"role_bindings": bindings}, "manage_roles")
        else ["tenant_member"]
    )


def session_filter(user: dict) -> dict:
    query = {"organization_id": user["organization_id"]}
    if not has_permission(user, "view", module="web_security"):
        query["project_id"] = {"$in": accessible_project_ids(user)}
    return query
