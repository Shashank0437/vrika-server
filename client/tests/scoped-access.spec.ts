import { expect, test, type Page } from "@playwright/test";
import {
  canEnterModule,
  getRoleBindings,
  hasPermission,
  landingRoute,
  type RoleBinding,
} from "../src/lib/access";
import type { AuthUser } from "../src/lib/auth-context";

const binding = (
  role: RoleBinding["role"],
  scope_type: RoleBinding["scope_type"],
  scope_id: string | null = null,
): RoleBinding => ({ role, scope_type, scope_id });
const viewer = binding("viewer", "module", "web_security");
const admin = binding("admin", "global");
const web = binding("analyst", "module", "web_security");
const cloud = binding("analyst", "module", "cloud_security");
const lead = binding("lead", "project", "project-1");
const baseUser: AuthUser = {
  id: "user-1",
  email: "owner@example.test",
  username: "Owner",
  tenant_id: "tenant-1",
  roles: ["tenant_admin"],
};
const project = {
  id: "project-1",
  name: "App review",
  member_ids: ["user-2"],
  cloud_provider_ids: [],
};
const member = {
  ...baseUser,
  id: "user-2",
  email: "member@example.test",
  username: "Member",
  role_bindings: [viewer],
  access_version: 4,
};

test("permission matrix uses canonical bindings and only matching scopes", () => {
  const user = (role_bindings: RoleBinding[]) => ({
    ...baseUser,
    role_bindings,
  });
  expect(getRoleBindings({ roles: ["tenant_admin"] })).toEqual([admin]);
  expect(getRoleBindings({ roles: ["member"] })).toEqual([web, cloud]);
  expect(getRoleBindings({ roles: ["tenant_member"] })).toEqual([web, cloud]);
  expect(hasPermission(user([]), "view")).toBe(false);
  expect(landingRoute(user([]))).toBe("/dashboard/no-access");
  expect(hasPermission(user([viewer]), "view", { projectId: "other" })).toBe(
    false,
  );
  expect(
    hasPermission(user([viewer]), "view", { module: "web_security" }),
  ).toBe(true);
  expect(
    hasPermission(user([viewer]), "view", { module: "cloud_security" }),
  ).toBe(false);
  for (const action of [
    "execute",
    "edit",
    "manage_members",
    "manage_roles",
  ] as const)
    expect(
      hasPermission(user([viewer]), action, {
        module: "web_security",
        projectId: "project-1",
      }),
    ).toBe(false);
  expect(
    hasPermission(user([web]), "execute", { module: "web_security" }),
  ).toBe(true);
  expect(hasPermission(user([web]), "edit", { module: "cloud_security" })).toBe(
    false,
  );
  expect(hasPermission(user([web]), "view")).toBe(false);
  expect(
    hasPermission(user([lead]), "manage_members", { projectId: "project-1" }),
  ).toBe(true);
  expect(hasPermission(user([lead]), "execute", { projectId: "other" })).toBe(
    false,
  );
  expect(
    hasPermission(user([lead]), "execute", { module: "web_security" }),
  ).toBe(false);
  expect(
    hasPermission(user([lead]), "manage_roles", { projectId: "project-1" }),
  ).toBe(false);
  expect(
    hasPermission(user([cloud, lead]), "execute", {
      module: "web_security",
      projectId: "project-1",
    }),
  ).toBe(true);
  expect(
    hasPermission(user([cloud, lead]), "execute", {
      module: "web_security",
      projectId: "other",
    }),
  ).toBe(false);
  expect(hasPermission(user([admin]), "manage_roles")).toBe(true);
  expect(canEnterModule(user([cloud]), "web_security")).toBe(false);
  expect(landingRoute(user([cloud]))).toBe("/dashboard/cloud-security");
  expect(
    hasPermission(user([binding("admin", "project", "project-1")]), "edit", {
      projectId: "project-1",
    }),
  ).toBe(false);
});

async function mockWorkspace(
  page: Page,
  bindings: RoleBinding[],
  conflict = false,
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let currentBindings = bindings;
  let members = [member];
  let projectMembers = [
    {
      id: "user-2",
      username: "Member",
      email: "member@example.test",
      role: "viewer",
      is_member: true,
      access_version: 4,
    },
    {
      id: "user-3",
      username: "New teammate",
      email: "new@example.test",
      role: null as string | null,
      is_member: false,
      access_version: 0,
    },
  ];
  let authReads = 0;
  await page.addInitScript(() =>
    localStorage.setItem("vrika_token", "synthetic-ui-test"),
  );
  await page.route("**/be/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/be/, "");
    const method = request.method();
    if (path === "/auth/me") {
      authReads++;
      return route.fulfill({
        json: {
          ...baseUser,
          role_bindings: currentBindings,
          access_version: 1,
        },
      });
    }
    if (method !== "GET") {
      const body = request.postDataJSON() ?? {};
      writes.push({ path, body });
      if (/\/projects\/project-1\/members\/[^/]+\/role$/.test(path)) {
        const id = path.split("/").at(-2);
        const saved = projectMembers.find((row) => row.id === id)!;
        const updated = {
          ...saved,
          role: body.role,
          is_member: !!body.role,
          access_version: saved.access_version + 1,
        };
        projectMembers = projectMembers.map((row) =>
          row.id === id ? updated : row,
        );
        return route.fulfill({ json: updated });
      }
      if (path.endsWith("/bindings")) {
        if (conflict)
          return route.fulfill({
            status: 409,
            json: { detail: "Version conflict" },
          });
        members = members.map((row) => ({
          ...row,
          role_bindings: body.role_bindings,
          access_version: 5,
        }));
        if (path.includes("/user-1/")) currentBindings = body.role_bindings;
        return route.fulfill({ json: members[0] });
      }
      if (path.endsWith("/sessions"))
        return route.fulfill({
          json: {
            id: "new-chat",
            title: "New chat",
            project_id: body.project_id,
            created_at: "2026-09-27",
            updated_at: "2026-09-27",
          },
        });
      if (path.endsWith("/messages/stream"))
        return route.fulfill({
          contentType: "text/event-stream",
          body: 'data: {"type":"done"}\n\n',
        });
      return route.fulfill({ json: {} });
    }
    if (path === "/tenant/members")
      return route.fulfill({
        json: [
          ...members,
          { ...baseUser, role_bindings: currentBindings, access_version: 1 },
        ],
      });
    if (path === "/projects") return route.fulfill({ json: [project] });
    if (path === "/projects/project-1/member-roles")
      return route.fulfill({ json: projectMembers });
    if (path === "/projects/member-options")
      return route.fulfill({
        json: [
          member,
          { id: "user-3", username: "New teammate", email: "new@example.test" },
        ],
      });
    if (path.endsWith("/capabilities"))
      return route.fulfill({ json: { llm_configured: true } });
    if (path === "/auth/cloud-security/embed")
      return route.fulfill({ json: { embed_path: "/mock-cloud" } });
    if (path === "/org/settings")
      return route.fulfill({
        json: {
          branding: {},
          llm: {
            active_provider: "openai",
            providers: { openai: { has_api_key: true } },
          },
        },
      });
    if (path === "/workspace/tools")
      return route.fulfill({
        json: {
          tools: [],
          disabled_tools: [],
          agent_reachable: true,
          agent_status: "healthy",
        },
      });
    if (path.endsWith("/sessions"))
      return route.fulfill({
        json: [
          {
            id: "chat-1",
            title: "Saved review",
            project_id: "project-1",
            created_at: "2026-09-27",
            updated_at: "2026-09-27",
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  return { writes, authReads: () => authReads };
}

test("cloud-only analyst lands in cloud without redirect loops or admin links", async ({
  page,
}) => {
  await mockWorkspace(page, [cloud]);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/cloud-security/);
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Web Security" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "User management" })).toHaveCount(
    0,
  );
  await page.goto("/dashboard/users", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/cloud-security/);
});

test("explicit empty bindings overrides legacy admin and offers sign out", async ({
  page,
}) => {
  const state = await mockWorkspace(page, []);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "No workspace access" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/no-access$/);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link"),
  ).toHaveCount(0);
  expect(state.writes).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("module viewer cannot enter admin panels, create scans or send chats", async ({
  page,
}) => {
  const state = await mockWorkspace(page, [viewer]);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /New scan/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start scan" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "User management" })).toHaveCount(
    0,
  );
  await page.goto("/dashboard/users", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/scan?chat_id=chat-1", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(/Read-only workspace/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New chat", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete chat Saved review" }),
  ).toBeDisabled();
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate Report", exact: true }),
  ).toBeDisabled();
  expect(state.writes).toEqual([]);
});

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}`) }).click();
}

test("admin edits multiple constrained bindings with optimistic version", async ({
  page,
}) => {
  const state = await mockWorkspace(page, [admin]);
  await page.goto("/dashboard/users", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Team directory")).toBeVisible();
  await page.screenshot({ path: "/tmp/vrika-users-redesign.png" });
  await page
    .getByRole("button", { name: "Edit bindings for member@example.test" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Role 1" }).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: /^Admin/ })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/vrika-role-picker-redesign.png" });
  await page.keyboard.press("Escape");
  await choose(page, "Role 1", "Analyst");
  await choose(page, "Scope 1", "Cloud Security");
  await dialog.getByRole("button", { name: "Add binding" }).click();
  await choose(page, "Role 2", "Project lead");
  await choose(page, "Scope 2", "App review");
  await dialog.getByRole("button", { name: "Save bindings" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0]).toEqual({
    path: "/tenant/members/user-2/bindings",
    body: { role_bindings: [cloud, lead], expected_version: 4 },
  });
});

test("invitations default to viewer and conflict errors preserve edits", async ({
  page,
}) => {
  const state = await mockWorkspace(page, [admin], true);
  await page.goto("/dashboard/users", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Invite user" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill("new@example.test");
  await page
    .getByRole("dialog")
    .getByLabel("Display name / username")
    .fill("New member");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes[0].body.role_bindings).toEqual([viewer]);
  await page
    .getByRole("button", { name: "Edit bindings for member@example.test" })
    .click();
  await choose(page, "Role 1", "Analyst");
  await page.getByRole("button", { name: "Save bindings" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "changed while you were editing",
  );
  await expect(page.getByRole("combobox", { name: "Role 1" })).toContainText(
    "Analyst",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit bindings for member@example.test" }),
  ).toBeFocused();
});

test("own role changes refresh authentication and remove write controls", async ({
  page,
}) => {
  const state = await mockWorkspace(page, [admin]);
  await page.goto("/dashboard/users", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Edit bindings for owner@example.test" })
    .click();
  await page
    .getByRole("checkbox", { name: /Organization administrator/ })
    .uncheck();
  await page.getByRole("button", { name: "Add binding" }).click();
  await expect(page.getByRole("combobox", { name: "Role 1" })).toContainText(
    "Viewer",
  );
  await page.getByRole("button", { name: "Save bindings" }).click();
  await expect(page.getByRole("button", { name: "Invite user" })).toHaveCount(
    0,
  );
  expect(state.authReads()).toBeGreaterThanOrEqual(2);
});

test("project lead must select a project before creating a scan", async ({
  page,
}) => {
  const state = await mockWorkspace(page, [lead]);
  await page.goto("/dashboard/scan?new=1", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("combobox", { name: "Scan project" }),
  ).toContainText("All projects");
  await expect(page.locator("textarea")).toHaveCount(0);
  await choose(page, "Scan project", "App review");
  await page.locator("textarea").fill("Review https://example.test");
  await page.locator("textarea").press("Enter");
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path.endsWith("/sessions"))?.body
          .project_id,
    )
    .toBe("project-1");
});

test("project lead assigns Viewer, Analyst and Lead only through project-scoped endpoints", async ({
  page,
}) => {
  const state = await mockWorkspace(page, [lead]);
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "Create project" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Manage App review" }).click();
  await page.getByLabel("Project name").fill("Renamed review");
  await choose(page, "Add organization member", "New teammate");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Project role for new@example.test" }),
  ).toContainText("Viewer");
  await choose(page, "Project role for new@example.test", "Analyst");
  await expect(
    page.getByRole("combobox", { name: "Project role for new@example.test" }),
  ).toContainText("Analyst");
  await choose(page, "Project role for new@example.test", "Lead");
  await expect(
    page.getByRole("combobox", { name: "Project role for new@example.test" }),
  ).toContainText("Lead");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.writes).toEqual([
    {
      path: "/projects/project-1/members/user-3/role",
      body: { role: "viewer", expected_version: 0 },
    },
    {
      path: "/projects/project-1/members/user-3/role",
      body: { role: "analyst", expected_version: 1 },
    },
    {
      path: "/projects/project-1/members/user-3/role",
      body: { role: "lead", expected_version: 2 },
    },
    { path: "/projects/project-1", body: { name: "Renamed review" } },
  ]);
});

test("project controls are custom, inline in the top row, and keyboard accessible", async ({
  page,
}) => {
  await mockWorkspace(page, [admin]);
  await page.goto("/dashboard/scan?new=1", { waitUntil: "domcontentloaded" });
  const scan = page.getByRole("combobox", { name: "Scan project" });
  await expect(scan).toBeVisible();
  await expect(page.locator("header").filter({ has: scan })).toHaveCount(1);
  await expect(page.locator("select")).toHaveCount(0);
  await scan.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("textbox", { name: "Search scan project" }).fill("App");
  await page.keyboard.press("Enter");
  await expect(scan).toContainText("App review");
  await expect(scan).toBeFocused();
  await page.screenshot({ path: "/tmp/vrika-scan-header-redesign.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/cloud-security", {
    waitUntil: "domcontentloaded",
  });
  const cloudProject = page.getByRole("combobox", { name: "Cloud project" });
  await expect(cloudProject).toBeVisible();
  const header = page.locator("header").filter({ has: cloudProject });
  await expect(header).toHaveCount(1);
  await expect(header).toContainText("Cloud project");
  await page.screenshot({ path: "/tmp/vrika-cloud-header-redesign.png" });
  await cloudProject.click();
  await page.keyboard.press("Escape");
  await expect(cloudProject).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await cloudProject.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("Projects contains only project details and membership, with no resource assignment requests", async ({
  page,
}) => {
  await mockWorkspace(page, [admin]);
  const resourceRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/be\/(projects\/cloud-providers|workspace\/agent-chat\/sessions)/.test(
        request.url(),
      )
    )
      resourceRequests.push(request.url());
  });
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Search projects" }).fill("absent");
  await expect(page.getByText("No matching projects")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.screenshot({
    path: "/tmp/vrika-projects-redesign.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Manage App review" }).click();
  await expect(page.getByText("Web sessions", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Cloud accounts/providers", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Add organization member" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Add organization member" }),
  ).toBeFocused();
  await page.screenshot({ path: "/tmp/vrika-project-dialog-redesign.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Add organization member" }).click();
  const option = page.getByRole("option", { name: /^New teammate/ });
  await expect(option).toBeVisible();
  const optionBounds = await option.boundingBox();
  expect(optionBounds!.x).toBeGreaterThanOrEqual(0);
  expect(optionBounds!.x + optionBounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Save project" }),
  ).toBeVisible();
  expect(resourceRequests).toEqual([]);
});
