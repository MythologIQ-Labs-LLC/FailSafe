/**
 * FX535 — B-B199-2 Phase 1: Replay sub-view behavioral E2E.
 *
 * ReplayRenderer (`src/roadmap/ui/modules/replay.js`) is the Agents tab's
 * Replay sub-pill. Coverage spans:
 *   - Empty state when /api/v1/runs returns no runs
 *   - List view with active + completed sections + counts
 *   - Slice cap (completed limited to 20)
 *   - Click run card → detail view (fetches /api/v1/runs/:id)
 *   - Step kind badge + diff stats rendering
 *   - Inline governance decision card rendering
 *   - Back button returns to list
 *   - agentRun WS event triggers re-render (initial + post-event fetch)
 *
 * Substrate: page.route() intercepts the two /api/v1/runs endpoints to
 * inject test fixtures. WS event dispatch uses the test-only global
 * window.__failsafeRenderers (B-B199-2 Phase 0; benign __failsafe* hook
 * added to command-center.js init tail).
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

const VALID_RUN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test.afterEach(async () => {
  await controller?.close();
});

async function gotoReplay(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  await expect(page.locator('#agents')).toBeVisible({ timeout: 10000 });
  await page.locator('#agents .cc-pill[data-key="replay"]').click();
}

test("FX535.1 — empty state when no runs exist", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [], completed: [] }),
    }),
  );
  await gotoReplay(page, controller.url);
  await expect(page.locator("#agents", { hasText: "No agent runs recorded" })).toBeVisible({ timeout: 10000 });
});

test("FX535.2 — list view renders active + completed sections with counts", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        active: [
          { id: "active-1", agentName: "agent-A", stepCount: 5, startedAt: "2026-05-20T00:00:00Z" },
          { id: "active-2", agentName: "agent-B", stepCount: 3, startedAt: "2026-05-20T00:01:00Z" },
        ],
        completed: [
          { id: "done-1", agentName: "agent-C", stepCount: 10, startedAt: "2026-05-19T00:00:00Z", status: "succeeded" },
          { id: "done-2", agentName: "agent-D", stepCount: 7, startedAt: "2026-05-19T00:01:00Z", status: "failed" },
          { id: "done-3", agentName: "agent-E", stepCount: 4, startedAt: "2026-05-19T00:02:00Z", status: "succeeded" },
        ],
      }),
    }),
  );
  await gotoReplay(page, controller.url);
  await expect(page.locator("#agents", { hasText: "Active Runs (2)" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#agents", { hasText: "Recent Runs (3)" })).toBeVisible();
  await expect(page.locator("#agents .cc-replay-run")).toHaveCount(5);
});

test("FX535.3 — completed runs capped at 20 (slice limit)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  const completed = Array.from({ length: 25 }, (_, i) => ({
    id: `done-${i}`,
    agentName: `agent-${i}`,
    stepCount: i,
    startedAt: "2026-05-19T00:00:00Z",
  }));
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [{ id: "act-1", agentName: "a", stepCount: 1 }], completed }),
    }),
  );
  await gotoReplay(page, controller.url);
  // 1 active + 20 completed = 21 total
  await expect(page.locator("#agents .cc-replay-run")).toHaveCount(21);
});

test("FX535.4 — click run card navigates to detail view (fetches /api/v1/runs/:id)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [], completed: [{ id: VALID_RUN_ID, agentName: "test", stepCount: 3 }] }),
    }),
  );
  await page.route(`**/api/v1/runs/${VALID_RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          id: VALID_RUN_ID,
          agentName: "test",
          status: "succeeded",
          steps: [
            { kind: "file_edit", title: "step 1", timestamp: "2026-05-20T00:00:00Z" },
            { kind: "command_run", title: "step 2", timestamp: "2026-05-20T00:00:01Z" },
            { kind: "tool_call", title: "step 3", timestamp: "2026-05-20T00:00:02Z" },
          ],
        },
      }),
    }),
  );
  await gotoReplay(page, controller.url);
  await page.locator(`#agents .cc-replay-run[data-run-id="${VALID_RUN_ID}"]`).click();
  await expect(page.locator("#agents .cc-replay-back")).toBeVisible({ timeout: 10000 });
});

test("FX535.5 — step renders kind badge + diff stats", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [], completed: [{ id: VALID_RUN_ID, agentName: "diff-test", stepCount: 1 }] }),
    }),
  );
  await page.route(`**/api/v1/runs/${VALID_RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          id: VALID_RUN_ID,
          agentName: "diff-test",
          steps: [
            {
              kind: "file_edit",
              title: "modify config",
              timestamp: "2026-05-20T00:00:00Z",
              diffStats: { additions: 12, deletions: 4 },
            },
          ],
        },
      }),
    }),
  );
  await gotoReplay(page, controller.url);
  await page.locator(`#agents .cc-replay-run[data-run-id="${VALID_RUN_ID}"]`).click();
  await expect(page.locator("#agents", { hasText: "file_edit" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#agents", { hasText: "+12" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "-4" })).toBeVisible();
});

test("FX535.6 — governance decision card renders inside step", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [], completed: [{ id: VALID_RUN_ID, agentName: "gov-test", stepCount: 1 }] }),
    }),
  );
  await page.route(`**/api/v1/runs/${VALID_RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          id: VALID_RUN_ID,
          agentName: "gov-test",
          steps: [
            {
              kind: "governance_decision",
              title: "policy gate",
              timestamp: "2026-05-20T00:00:00Z",
              governanceDecision: {
                action: "BLOCK",
                riskCategory: "security",
                confidence: 0.87,
                mitigation: "Reject merge until security review",
              },
            },
          ],
        },
      }),
    }),
  );
  await gotoReplay(page, controller.url);
  await page.locator(`#agents .cc-replay-run[data-run-id="${VALID_RUN_ID}"]`).click();
  await expect(page.locator("#agents", { hasText: "BLOCK" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#agents", { hasText: "security" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "87%" })).toBeVisible();
});

test("FX535.7 — back button returns to list view", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [], completed: [{ id: VALID_RUN_ID, agentName: "back-test", stepCount: 1 }] }),
    }),
  );
  await page.route(`**/api/v1/runs/${VALID_RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: { id: VALID_RUN_ID, agentName: "back-test", steps: [{ kind: "file_edit", title: "step", timestamp: "2026-05-20T00:00:00Z" }] },
      }),
    }),
  );
  await gotoReplay(page, controller.url);
  await page.locator(`#agents .cc-replay-run[data-run-id="${VALID_RUN_ID}"]`).click();
  await expect(page.locator("#agents .cc-replay-back")).toBeVisible({ timeout: 10000 });
  await page.locator("#agents .cc-replay-back").click();
  await expect(page.locator("#agents", { hasText: "Recent Runs (1)" })).toBeVisible({ timeout: 5000 });
});

test("FX535.8 — agentRun WS event triggers re-fetch of /api/v1/runs", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  let runsCallCount = 0;
  await page.route("**/api/v1/runs", (route) => {
    runsCallCount++;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ active: [], completed: [] }),
    });
  });
  await gotoReplay(page, controller.url);
  await expect(page.locator("#agents", { hasText: "No agent runs recorded" })).toBeVisible({ timeout: 10000 });
  const initialCount = runsCallCount;
  // Trigger the agentRun event through the TabGroup wrapper. tab-group.js:58
  // propagates onEvent to all sub-renderers; only ReplayRenderer acts on
  // 'agentRun' (its onEvent at replay.js:183-185 calls render()).
  await page.evaluate(() => {
    const renderers = (globalThis as unknown as { __failsafeRenderers?: { agents?: { onEvent?: (e: unknown) => void } } }).__failsafeRenderers;
    renderers?.agents?.onEvent?.({ type: "agentRun" });
  });
  // Wait briefly for the async fetch inside render() to issue.
  await page.waitForFunction(
    ([startCount]) => (window as unknown as { __replayFetchSpy?: number }).__replayFetchSpy === undefined
      ? true : false,
    [initialCount],
    { timeout: 1000 },
  ).catch(() => undefined);
  // Direct request count check.
  await page.waitForTimeout(500);
  expect(runsCallCount).toBeGreaterThanOrEqual(initialCount + 1);
});
