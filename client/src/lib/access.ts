import type { AuthUser } from "./auth-context";

export type AccessRole = "viewer" | "analyst" | "lead" | "admin";
export type RoleBinding = {
  role: AccessRole;
  scope_type: "global" | "module" | "project";
  scope_id: string | null;
};
export type AccessAction =
  | "view"
  | "execute"
  | "edit"
  | "manage_members"
  | "manage_roles";
export type AccessModule = "web_security" | "cloud_security";
export type AccessScope = { module?: AccessModule; projectId?: string | null };
type AccessUser = Pick<AuthUser, "roles" | "role_bindings"> | null | undefined;

export function getRoleBindings(user: AccessUser): RoleBinding[] {
  if (!user) return [];
  if (user.role_bindings !== undefined) return user.role_bindings;
  if (user.roles?.some((role) => role === "tenant_admin" || role === "admin"))
    return [{ role: "admin", scope_type: "global", scope_id: null }];
  if (user.roles?.some((role) => ["member", "tenant_member"].includes(role)))
    return ["web_security", "cloud_security"].map((scope_id) => ({
      role: "analyst",
      scope_type: "module",
      scope_id,
    }));
  return [];
}

export function hasPermission(
  user: AccessUser,
  action: AccessAction,
  scope: AccessScope = {},
): boolean {
  return getRoleBindings(user).some((binding) => {
    if (
      binding.role === "admin" &&
      binding.scope_type === "global" &&
      binding.scope_id === null
    )
      return true;
    if (
      binding.role === "viewer" &&
      binding.scope_type === "global" &&
      binding.scope_id === null
    )
      return action === "view";
    if (
      binding.role === "analyst" &&
      binding.scope_type === "module" &&
      binding.scope_id === scope.module &&
      ["web_security", "cloud_security"].includes(binding.scope_id ?? "")
    )
      return ["view", "execute", "edit"].includes(action);
    if (
      binding.role === "lead" &&
      binding.scope_type === "project" &&
      !!scope.projectId &&
      binding.scope_id === scope.projectId
    )
      return ["view", "execute", "edit", "manage_members"].includes(action);
    return false;
  });
}

/** Entering a module is not authorization for an unscoped resource or write. */
export function canEnterModule(
  user: AccessUser,
  module: AccessModule,
): boolean {
  return (
    hasPermission(user, "view", { module }) ||
    getRoleBindings(user).some(
      (b) => b.role === "lead" && b.scope_type === "project" && !!b.scope_id,
    )
  );
}

export function canStartScan(user: AccessUser): boolean {
  return (
    hasPermission(user, "execute", { module: "web_security" }) ||
    getRoleBindings(user).some(
      (b) => b.role === "lead" && b.scope_type === "project" && !!b.scope_id,
    )
  );
}

export function landingRoute(user: AccessUser): string {
  if (canEnterModule(user, "web_security")) return "/dashboard";
  if (canEnterModule(user, "cloud_security"))
    return "/dashboard/cloud-security";
  return "/dashboard/no-access";
}

export function canVisitDashboard(user: AccessUser, pathname: string): boolean {
  if (pathname === "/dashboard/no-access") return true;
  if (/^\/dashboard\/(users|settings|analytics|usage)(\/|$)/.test(pathname))
    return hasPermission(user, "view");
  if (pathname.startsWith("/dashboard/projects"))
    return (
      hasPermission(user, "view") ||
      getRoleBindings(user).some(
        (b) => b.role === "lead" && b.scope_type === "project",
      )
    );
  return canEnterModule(
    user,
    pathname.startsWith("/dashboard/cloud-security")
      ? "cloud_security"
      : "web_security",
  );
}
