import { expect, test, type Page } from "@playwright/test";
import type {
  AgentChatSession,
  AgentChatSessionIntelligence,
} from "../src/lib/agentChat";
import { matchesProject } from "../src/lib/projects";

function intelligence(
  id: string,
  title: string,
  projectId?: string | null,
): AgentChatSessionIntelligence {
  return {
    session_id: id,
    title,
    project_id: projectId,
    status: "COMPLETED",
    summary: "",
    started_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:01:00Z",
    average_time_to_breach: "1m",
    average_time_to_breach_seconds: 60,
    total_scans: 1,
    findings_count: {
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
      total: 1,
    },
    findings: [],
    tools_used: ["test_scanner"],
    timeline: [],
    targets: ["https://example.test"],
    report_metadata: {},
  };
}

async function workspace(page: Page) {
  const histories = [
    intelligence("alpha", "Alpha scan", "project-a"),
    intelligence("beta", "Beta scan", "project-b"),
    intelligence("unassigned", "Unassigned scan", null),
    intelligence("legacy", "Legacy scan"),
  ];
  const chats: AgentChatSession[] = [
    ...histories,
    intelligence("old-alpha", "Older Alpha chat", "project-a"),
  ].map((row) => ({
    id: row.session_id,
    title: row.title,
    project_id: row.project_id,
    created_at: row.started_at,
    updated_at: row.updated_at,
  }));
  const state = {
    delays: {} as Record<string, number>,
    failHistory: "",
    historyStatus: 503,
    failCloud: "",
    created: [] as Record<string, unknown>[],
    embedScopes: [] as string[],
  };
  await page.addInitScript(() =>
    localStorage.setItem("vrika_token", "synthetic-ui-test"),
  );
  await page.route("**/mock-cloud", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Cloud workspace preview</body></html>",
    }),
  );
  await page.route("**/be/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/be/, "");
    const scope = url.searchParams.get("project_id") ?? "";
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          id: "user-1",
          email: "owner@example.test",
          username: "Owner",
          tenant_id: "org-1",
          roles: ["tenant_admin"],
        },
      });
    if (path === "/projects")
      return route.fulfill({
        json: [
          {
            id: "project-a",
            name: "Alpha project",
            member_ids: [],
            cloud_provider_ids: [],
          },
          {
            id: "project-b",
            name: "Beta project",
            member_ids: [],
            cloud_provider_ids: [],
          },
        ],
      });
    if (path === "/auth/cloud-security/embed") {
      state.embedScopes.push(scope);
      if (state.failCloud && scope === state.failCloud)
        return route.fulfill({
          status: 503,
          json: { detail: "Cloud temporarily unavailable" },
        });
      return route.fulfill({ json: { embed_path: "/mock-cloud" } });
    }
    if (path.endsWith("/capabilities"))
      return route.fulfill({ json: { llm_configured: true } });
    if (path.endsWith("/session-intelligence")) {
      if (state.delays[scope])
        await new Promise((resolve) =>
          setTimeout(resolve, state.delays[scope]),
        );
      if (state.failHistory && scope === state.failHistory)
        return route.fulfill({
          status: state.historyStatus,
          json: { detail: "History temporarily unavailable" },
        });
      return route.fulfill({
        json: histories.filter((row) => matchesProject(row.project_id, scope)),
      });
    }
    if (path.endsWith("/sessions")) {
      if (request.method() === "GET")
        return route.fulfill({
          json: chats.filter(
            (row) =>
              row.id !== "old-alpha" && matchesProject(row.project_id, scope),
          ),
        });
      const body = request.postDataJSON();
      state.created.push(body);
      const chat = {
        id: `new-${state.created.length}`,
        title: "New scoped scan",
        project_id: body.project_id ?? null,
        created_at: "2026-09-27",
        updated_at: "2026-09-27",
      };
      chats.unshift(chat);
      return route.fulfill({ json: chat });
    }
    const detail = path.match(/\/sessions\/([^/]+)$/);
    if (detail) {
      const chat = chats.find((row) => row.id === detail[1]);
      return route.fulfill({
        status: chat ? 200 : 404,
        json: chat ?? { detail: "Session not found" },
      });
    }
    if (request.method() === "POST")
      return route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"type":"done"}\n\n',
      });
    return route.fulfill({ json: [] });
  });
  return state;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}`) }).click();
}

test("project selection filters history metrics and recent chats, persists across navigation, and tags new scans", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Alpha scan", { exact: true })).toBeVisible();
  await choose(page, "Web project", "Alpha project");
  await expect(page.getByText("Beta scan", { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByText("Total scans", { exact: true })
      .locator("..")
      .locator("p")
      .nth(1),
  ).toHaveText("1");
  await page.getByRole("link", { name: /New scan/i }).click();
  await expect(
    page.getByRole("combobox", { name: "Scan project" }),
  ).toContainText("Alpha project");
  await expect(
    page.getByRole("button", { name: "Alpha scan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Beta scan", exact: true }),
  ).toHaveCount(0);
  await choose(page, "Scan project", "Beta project");
  await expect(
    page.getByRole("button", { name: "Beta scan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Alpha scan", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Beta scan", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Scan project" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.locator("textarea").fill("Review https://example.test");
  await page.locator("textarea").press("Enter");
  await expect.poll(() => state.created[0]?.project_id).toBe("project-b");
  await page.getByRole("link", { name: "Go to Dashboard" }).click();
  await expect(
    page.getByRole("combobox", { name: "Web project" }),
  ).toContainText("Beta project");
  await expect(page.getByText("Alpha scan", { exact: true })).toHaveCount(0);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("combobox", { name: "Web project" }),
  ).toContainText("Beta project");
  await expect(page).toHaveURL(/project=project-b/);
});

test("All projects and Unassigned retain legacy scans without treating filter values as project IDs", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await choose(page, "Web project", "Unassigned");
  await expect(page.getByText("Legacy scan", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Unassigned scan", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alpha scan", { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByText("Total scans", { exact: true })
      .locator("..")
      .locator("p")
      .nth(1),
  ).toHaveText("2");
  await choose(page, "Web project", "All projects");
  await expect(page.getByText("Alpha scan", { exact: true })).toBeVisible();
  await expect(page.getByText("Beta scan", { exact: true })).toBeVisible();
  await page.goto("/dashboard/scan?new=1&project=unassigned", {
    waitUntil: "domcontentloaded",
  });
  await page.locator("textarea").fill("Review legacy target");
  await page.locator("textarea").press("Enter");
  await expect.poll(() => state.created.length).toBe(1);
  expect(state.created[0].project_id).toBeUndefined();
});

test("slow and failed history responses never replace a different project's data", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/dashboard?project=project-b", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Beta scan", { exact: true })).toBeVisible();
  state.delays["project-a"] = 1200;
  await choose(page, "Web project", "Alpha project");
  await choose(page, "Web project", "Beta project");
  await page.waitForTimeout(1500);
  await expect(page.getByText("Beta scan", { exact: true })).toBeVisible();
  await expect(page.getByText("Alpha scan", { exact: true })).toHaveCount(0);
  state.failHistory = "project-b";
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "History temporarily unavailable" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Beta scan", { exact: true })).toBeVisible();
});

test("a direct chat link outside the recent-list limit opens in its real project", async ({
  page,
}) => {
  await workspace(page);
  await page.goto("/dashboard/scan?project=project-b&chat_id=old-alpha", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("combobox", { name: "Scan project" }),
  ).toContainText("Alpha project");
  await expect(
    page.getByRole("button", { name: "Older Alpha chat", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/chat_id=old-alpha/);
  await expect(
    page.getByRole("button", { name: "Beta scan", exact: true }),
  ).toHaveCount(0);
});

test("Projects opens its filtered history and revoked access clears cached results", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Alpha project", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Web project" }),
  ).toContainText("Alpha project");
  await expect(page.getByText("Alpha scan", { exact: true })).toBeVisible();
  await expect(page.getByText("Beta scan", { exact: true })).toHaveCount(0);
  state.failHistory = "project-a";
  state.historyStatus = 403;
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "History temporarily unavailable" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Alpha scan", { exact: true })).toHaveCount(0);
});

test("Cloud project selection survives navigation and remains usable after embed failure", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/dashboard/cloud-security", {
    waitUntil: "domcontentloaded",
  });
  await choose(page, "Cloud project", "Alpha project");
  await expect.poll(() => state.embedScopes.at(-1)).toBe("project-a");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const count = state.embedScopes.length;
  await page.goto("/dashboard/cloud-security", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("combobox", { name: "Cloud project" }),
  ).toContainText("Alpha project");
  await expect.poll(() => state.embedScopes.length).toBeGreaterThan(count);
  expect(state.embedScopes.slice(count)).toEqual(["project-a"]);
  state.failCloud = "project-b";
  await choose(page, "Cloud project", "Beta project");
  await expect(
    page.getByText("Cloud temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await choose(page, "Cloud project", "All projects");
  await expect(page.locator('iframe[title="Cloud Security"]')).toBeVisible();
  await expect(
    page.getByText("Cloud temporarily unavailable", { exact: true }),
  ).toHaveCount(0);
});
