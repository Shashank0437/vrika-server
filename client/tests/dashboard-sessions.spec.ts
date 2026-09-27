import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AgentChatSessionIntelligence } from "../src/lib/agentChat";

const session: AgentChatSessionIntelligence = {
  session_id: "session-abc123",
  title: "Example web security review",
  status: "COMPLETED",
  summary:
    "## Review summary\n\nA **high-priority finding** needs review.\n\n- Verify access controls\n- Review the evidence",
  started_at: "2026-09-26T10:00:00Z",
  updated_at: "2026-09-26T10:10:00Z",
  completed_at: "2026-09-26T10:10:00Z",
  executed_by: "reviewer@example.test",
  average_time_to_breach: "10m",
  average_time_to_breach_seconds: 600,
  total_scans: 1,
  findings_count: {
    critical: 0,
    high: 1,
    medium: 0,
    low: 0,
    info: 0,
    total: 1,
  },
  targets: [`https://example.test/${"long-path/".repeat(25)}`],
  tools_used: ["test_scanner"],
  findings: [
    {
      id: "finding-1",
      severity: "HIGH",
      name: "Access control finding",
      details: "Review **authorization** before resolving this finding.",
      affected_target: "https://example.test/admin",
      source_tool: "test_scanner",
      first_seen: "2026-09-26T10:01:00Z",
      evidence: `${"Full evidence line\n".repeat(30)}FINAL EVIDENCE LINE`,
    },
  ],
  timeline: Array.from({ length: 20 }, (_, index) => ({
    timestamp: "2026-09-26T10:01:00Z",
    type: "tool",
    title: `Activity ${index + 1}`,
    details: "Recorded **tool activity**.",
  })),
  report_metadata: {},
};

async function mockWorkspace(page: Page, rows = [session]) {
  await page.addInitScript(() =>
    localStorage.setItem("vrika_token", "synthetic-ui-test"),
  );
  await page.route("**/be/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          id: "test-user",
          email: "reviewer@example.test",
          username: "Reviewer",
          tenant_id: "test-tenant",
          roles: ["tenant_admin"],
          organization_name: "Test workspace",
        },
      });
    if (path.endsWith("/session-intelligence"))
      return route.fulfill({ json: rows });
    if (path.endsWith("/report"))
      return route.fulfill({
        json: {
          attachment: {
            id: "pdf-1",
            filename: "session-report.pdf",
            content_type: "application/pdf",
          },
        },
      });
    if (path.includes("/attachments/"))
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-1.4 synthetic test",
        headers: {
          "Content-Disposition": 'attachment; filename="session-report.pdf"',
        },
      });
    if (path.endsWith("/analyze"))
      return route.fulfill({
        json: {
          success: true,
          result: JSON.stringify({
            summary:
              "## Analysis result\n\nReview **access controls**.\n\n- Follow up with the owner",
          }),
        },
      });
    return route.fulfill({ json: [] });
  });
}

test("background is over 90% smaller, preloaded, cached and fills a tall viewport", async ({
  page,
  request,
}) => {
  const original = readFileSync("public/bg.png");
  const optimized = readFileSync(
    "src/components/dashboard/dashboard-background.webp",
  );
  expect(optimized.length).toBeLessThan(original.length / 10);
  expect(optimized.length).toBeLessThan(60_000);
  await mockWorkspace(page);
  await page.setViewportSize({ width: 1280, height: 1500 });
  const response = await page.goto("/dashboard");
  const html = await response!.text();
  const image = page.locator('img[src*="dashboard-background"]');
  await expect(image).toHaveCount(1);
  const src = await image.getAttribute("src");
  expect(src).toMatch(
    /\/_next\/static\/media\/dashboard-background\..*\.webp$/,
  );
  expect(html).toContain('rel="preload"');
  expect(html).toContain(src);
  await expect
    .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const bounds = await image.boundingBox();
  expect(bounds).toEqual({ x: 256, y: 0, width: 1024, height: 1500 });
  expect(await image.evaluate((img) => getComputedStyle(img).objectFit)).toBe(
    "cover",
  );
  const asset = await request.get(src!);
  expect(asset.headers()["cache-control"]).toContain("immutable");
  expect((await asset.body()).length).toBe(optimized.length);
  await page.evaluate(() => {
    document.body.style.minHeight = "4000px";
    window.scrollTo(0, 1200);
  });
  expect(await image.boundingBox()).toEqual(bounds);
  expect(
    await page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .filter((r) => r.name.endsWith("/bg.png")).length,
    ),
  ).toBe(0);
});

test("background placeholder is visible before authentication and without the image", async ({
  page,
}) => {
  await mockWorkspace(page);
  // Keep authentication pending to exercise the server-rendered loading shell.
  await page.route("**/auth/me", () => {});
  await page.route("**/*dashboard-background*.webp", (route) => route.abort());
  await page.goto("/dashboard", { waitUntil: "commit" });
  const background = page.locator('img[src*="dashboard-background"]');
  // SSR includes the decorative layer before the authenticated shell renders.
  expect(await page.content()).toContain("data:image");
  await expect(background).toHaveCount(1);
  const fallback = await background
    .locator("..")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(fallback).toContain("gradient");
});

test("each session has exactly four distinct actions and a working terminal link", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/dashboard");
  const actions = page.getByRole("group", {
    name: `Actions for ${session.title}`,
  });
  await expect(actions.getByRole("button")).toHaveCount(3);
  await expect(actions.getByRole("link")).toHaveCount(1);
  await expect(
    actions.getByRole("button", { name: "Command CTL", exact: true }),
  ).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Run AI Analysis" }),
  ).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Generate PDF report" }),
  ).toBeVisible();
  await expect(actions.getByRole("link")).toHaveAttribute(
    "href",
    "/dashboard/scan?chat_id=session-abc123&project=unassigned",
  );
  for (const action of await actions.locator("button, a").all()) {
    await expect(action).toBeInViewport({ ratio: 1 });
  }
  expect(
    await page
      .locator("table")
      .locator("..")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("session-history.png"),
    fullPage: true,
  });
});

test("Command CTL renders readable content, all activity and full evidence with keyboard navigation", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", {
    name: "Command CTL",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Command CTL" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Review summary" }),
  ).toBeVisible();
  await expect(dialog.locator("strong")).toHaveText("high-priority finding");
  await expect(dialog.getByText("reviewer@example.test")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("command-overview.png"),
  });
  await dialog.getByRole("tab", { name: "Targets & tools" }).click();
  await expect(
    dialog.getByText(session.targets[0], { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 600, height: 600 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const bounds = await dialog.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(568);
  await dialog.getByRole("tab", { name: "Findings (1)" }).click();
  await dialog.getByText("View full evidence").click();
  await expect(dialog.locator("pre")).toContainText("FINAL EVIDENCE LINE");
  expect(
    await dialog
      .locator("pre")
      .evaluate((el) => getComputedStyle(el).webkitLineClamp),
  ).toBe("none");
  await page.screenshot({
    path: test.info().outputPath("command-evidence-narrow.png"),
  });
  await dialog.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(20);
  await expect(dialog.getByText("Activity 1", { exact: true })).toBeVisible();
  await dialog
    .getByRole("tab", { name: "Activity", exact: true })
    .press("Home");
  await expect(
    dialog.getByRole("tab", { name: "Overview & report" }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("tab", { name: "Overview & report" }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});

test("Command CTL tooltip does not linger after the dialog is opened and closed", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", {
    name: "Command CTL",
    exact: true,
  });
  const tooltip = page.getByText(
    "Command CTL: overview, targets, findings and activity",
  );
  await trigger.hover();
  await expect(tooltip).toBeVisible();
  await trigger.click();
  await expect(tooltip).toBeHidden();
  const dialog = page.getByRole("dialog", { name: "Command CTL" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(tooltip).toBeHidden();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(tooltip).toBeHidden();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});

test("new reports generate and download in one action; existing reports are not regenerated", async ({
  page,
}) => {
  await mockWorkspace(page, [
    session,
    {
      ...session,
      session_id: "session-existing",
      title: "Existing report session",
      report_metadata: {
        latest_attachment: { id: "saved-pdf", filename: "saved.pdf" },
      },
    },
  ]);
  let generated = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/report")) generated++;
  });
  await page.goto("/dashboard");
  const download = page.waitForEvent("download");
  await page
    .getByRole("group", { name: `Actions for ${session.title}` })
    .getByRole("button", { name: "Generate PDF report" })
    .click();
  expect((await download).suggestedFilename()).toBe("session-report.pdf");
  expect(generated).toBe(1);
  const saved = page.waitForEvent("download");
  await page
    .getByRole("group", { name: "Actions for Existing report session" })
    .getByRole("button", { name: "Download PDF report" })
    .click();
  await saved;
  expect(generated).toBe(1);
});

test("report errors are visible in Command CTL and the button becomes usable again", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/report", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Report service unavailable" },
    }),
  );
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Command CTL", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Generate PDF report" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Report service unavailable",
  );
  await expect(
    dialog.getByRole("button", { name: "Generate PDF report" }),
  ).toBeEnabled();
});

test("AI analysis renders Markdown and failures are explicit", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Run AI Analysis" }).click();
  const dialog = page.getByRole("dialog", { name: "AI Session Analysis" });
  await expect(
    dialog.getByRole("heading", { name: "Analysis result" }),
  ).toBeVisible();
  await expect(dialog.locator("strong")).toHaveText("access controls");
  await page.keyboard.press("Escape");
  await page.route("**/analyze", (route) =>
    route.fulfill({ json: { success: false } }),
  );
  await page.getByRole("button", { name: "Run AI Analysis" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "No analysis was returned",
  );
});

test("empty session sections explain missing data without claiming a clean scan", async ({
  page,
}) => {
  await mockWorkspace(page, [
    {
      ...session,
      summary: "",
      targets: [],
      tools_used: [],
      findings: [],
      timeline: [],
      findings_count: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    },
  ]);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Command CTL", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/No summary is available yet/)).toBeVisible();
  await dialog.getByRole("tab", { name: "Targets & tools" }).click();
  await expect(dialog.getByText("No targets recorded.")).toBeVisible();
  await expect(dialog.getByText("No tools recorded.")).toBeVisible();
  await dialog.getByRole("tab", { name: "Findings (0)" }).click();
  await expect(dialog.getByText(/does not confirm/)).toBeVisible();
  await dialog.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(dialog.getByText("No activity recorded.")).toBeVisible();
});
