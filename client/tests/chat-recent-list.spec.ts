import { expect, test, type Page } from "@playwright/test";
import type { AgentChatSession } from "../src/lib/agentChat";

const chats: AgentChatSession[] = [
  {
    id: "chat-1",
    title: "First review chat",
    created_at: "2026-09-26T10:00:00Z",
    updated_at: "2026-09-26T10:00:00Z",
  },
  {
    id: "chat-2",
    title: "Second review chat",
    created_at: "2026-09-26T09:00:00Z",
    updated_at: "2026-09-26T09:00:00Z",
  },
];

type ListResponse = { status: number; json: unknown; delayMs?: number };

async function mockChat(
  page: Page,
  respondToList: (call: number) => ListResponse,
) {
  let listCalls = 0;
  await page.addInitScript(() =>
    localStorage.setItem("vrika_token", "synthetic-ui-test"),
  );
  await page.route("**/be/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
    if (path.endsWith("/sessions") && request.method() === "GET") {
      const { status, json, delayMs } = respondToList(++listCalls);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return route.fulfill({ status, json }).catch(() => undefined);
    }
    return route.fulfill({ json: [] });
  });
  return { listCalls: () => listCalls };
}

function recentChats(page: Page) {
  return page
    .getByText("Recent chats", { exact: true })
    .locator("xpath=following-sibling::div[1]");
}

test("recent chats stay visible while the list refreshes in the background", async ({
  page,
}) => {
  const mock = await mockChat(page, (call) => ({
    status: 200,
    json: chats,
    delayMs: call === 1 ? 0 : 1500,
  }));
  await page.goto("/dashboard/scan");
  const list = recentChats(page);
  await expect(
    list.getByRole("button", { name: "Second review chat", exact: true }),
  ).toBeVisible();

  // Record every DOM state of the list so a brief loader/empty flash cannot slip between assertions.
  await list.evaluate((el) => {
    const w = window as unknown as { __chatListFlashes: string[] };
    w.__chatListFlashes = [];
    const check = () => {
      const text = el.textContent ?? "";
      if (
        text.includes("Loading…") ||
        text.includes("No chats yet") ||
        !text.includes("First review chat") ||
        !text.includes("Second review chat")
      )
        w.__chatListFlashes.push(text.slice(0, 80));
    };
    new MutationObserver(check).observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  const refreshesBefore = mock.listCalls();
  await list
    .getByRole("button", { name: "Second review chat", exact: true })
    .click();
  await expect.poll(mock.listCalls).toBeGreaterThan(refreshesBefore);
  // Let the delayed background refresh finish.
  await page.waitForTimeout(2500);

  const flashes = await page.evaluate(
    () =>
      (window as unknown as { __chatListFlashes: string[] }).__chatListFlashes,
  );
  expect(flashes).toEqual([]);
  await expect(
    list.getByRole("button", { name: "First review chat", exact: true }),
  ).toBeVisible();
});

test("a failed background refresh keeps the last loaded chats", async ({
  page,
}) => {
  await mockChat(page, (call) =>
    call === 1
      ? { status: 200, json: chats }
      : { status: 500, json: { detail: "temporary failure" } },
  );
  await page.goto("/dashboard/scan");
  const list = recentChats(page);
  await expect(
    list.getByRole("button", { name: "First review chat", exact: true }),
  ).toBeVisible();

  await list
    .getByRole("button", { name: "Second review chat", exact: true })
    .click();
  await expect(
    list.getByText("Couldn't refresh chats. Showing the last loaded list."),
  ).toBeVisible();
  await expect(
    list.getByRole("button", { name: "First review chat", exact: true }),
  ).toBeVisible();
  await expect(
    list.getByRole("button", { name: "Second review chat", exact: true }),
  ).toBeVisible();
});

test("the first load still shows a loader and then the empty state", async ({
  page,
}) => {
  await mockChat(page, () => ({ status: 200, json: [], delayMs: 800 }));
  await page.goto("/dashboard/scan");
  const list = recentChats(page);
  await expect(list.getByText("Loading…")).toBeVisible();
  await expect(list.getByText(/No chats yet/)).toBeVisible();
});
