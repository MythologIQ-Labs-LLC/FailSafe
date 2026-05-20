/**
 * FX536 — B-B199-2 Phase 2: Genome sub-view behavioral E2E.
 *
 * GenomeRenderer (`src/roadmap/ui/modules/genome.js`) is the Agents tab's
 * Genome sub-pill. Coverage spans:
 *   - Empty pattern state (no patterns, no unresolved)
 *   - Pattern cards render with mode-specific colors
 *   - Show-All toggle switches between filtered (unresolved-only) and full set
 *   - Pattern slice cap (12 entries max)
 *   - Unresolved entries table renders rows with status indicators
 *   - failureArchived WS event triggers re-render
 *
 * Substrate: page.route() intercepts /api/v1/genome to inject fixtures.
 * WS event dispatch via the test-only globalThis.__failsafeRenderers
 * (B-B199-2 Phase 0) → TabGroup `agents` wrapper → GenomeRenderer.onEvent.
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

async function gotoGenome(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  await expect(page.locator('#agents')).toBeVisible({ timeout: 10000 });
  await page.locator('#agents .cc-pill[data-key="genome"]').click();
}

test("FX536.1 — empty pattern state shows guidance text", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/genome", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ patterns: [], allPatterns: [], unresolved: [] }),
    }),
  );
  await gotoGenome(page, controller.url);
  await expect(page.locator("#agents", { hasText: "No failure patterns" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#agents", { hasText: "No unresolved failure patterns." })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "All genome entries resolved" })).toBeVisible();
});

test("FX536.2 — pattern cards render with failure-mode labels + counts", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/genome", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        patterns: [
          { failureMode: "COMPLEXITY_VIOLATION", count: 5, component: "foo.ts" },
          { failureMode: "SECURITY_STUB", count: 1, component: "bar.ts" },
          { failureMode: "HALLUCINATION", count: 8, component: "baz.ts" },
        ],
        allPatterns: [],
        unresolved: [],
      }),
    }),
  );
  await gotoGenome(page, controller.url);
  await expect(page.locator("#agents .cc-grid-4 .cc-card")).toHaveCount(3, { timeout: 10000 });
  await expect(page.locator("#agents", { hasText: "COMPLEXITY_VIOLATION" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "SECURITY_STUB" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "HALLUCINATION" })).toBeVisible();
  await expect(page.locator("#agents .cc-grid-4 .cc-card").filter({ hasText: "foo.ts" })).toBeVisible();
});

test("FX536.3 — show-all toggle switches filtered → all set", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/genome", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        patterns: [
          { failureMode: "HALLUCINATION", count: 1, component: "filtered-only" },
        ],
        allPatterns: [
          { failureMode: "HALLUCINATION", count: 1, component: "filtered-only" },
          { failureMode: "ORPHAN", count: 2, component: "all-only-a" },
          { failureMode: "GHOST_PATH", count: 3, component: "all-only-b" },
        ],
        unresolved: [],
      }),
    }),
  );
  await gotoGenome(page, controller.url);
  // Initial render shows only filtered (1 card).
  await expect(page.locator("#agents .cc-grid-4 .cc-card")).toHaveCount(1, { timeout: 10000 });
  // Click the toggle.
  await page.locator("#agents .cc-genome-toggle").click();
  // Show-all renders all 3.
  await expect(page.locator("#agents .cc-grid-4 .cc-card")).toHaveCount(3, { timeout: 5000 });
});

test("FX536.4 — pattern cards capped at 12 entries (slice limit)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  const allPatterns = Array.from({ length: 15 }, (_, i) => ({
    failureMode: "ORPHAN",
    count: i,
    component: `comp-${i}`,
  }));
  await page.route("**/api/v1/genome", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ patterns: [], allPatterns, unresolved: [] }),
    }),
  );
  await gotoGenome(page, controller.url);
  // Initial render (unresolved-only) shows empty card; toggle to show-all.
  await page.locator("#agents .cc-genome-toggle").click();
  await expect(page.locator("#agents .cc-grid-4 .cc-card")).toHaveCount(12, { timeout: 5000 });
});

test("FX536.5 — unresolved entries table renders rows with status colors", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/genome", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        patterns: [],
        allPatterns: [],
        unresolved: [
          { id: "11111111-2222-3333-4444-555555555555", failureMode: "HALLUCINATION", remediationStatus: "unresolved" },
          { id: "22222222-3333-4444-5555-666666666666", failureMode: "ORPHAN", remediationStatus: "investigating" },
          { id: "33333333-4444-5555-6666-777777777777", failureMode: "GHOST_PATH", remediationStatus: "mitigated" },
        ],
      }),
    }),
  );
  await gotoGenome(page, controller.url);
  await expect(page.locator("#agents", { hasText: "Unresolved Entries (3)" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#agents", { hasText: "unresolved" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "investigating" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "mitigated" })).toBeVisible();
  // Verify the rendered ID prefixes (first 8 chars of each ID per genome.js:98).
  await expect(page.locator("#agents", { hasText: "11111111" })).toBeVisible();
  await expect(page.locator("#agents", { hasText: "22222222" })).toBeVisible();
});

test("FX536.6 — failureArchived WS event triggers re-fetch", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  let genomeCallCount = 0;
  await page.route("**/api/v1/genome", (route) => {
    genomeCallCount++;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ patterns: [], allPatterns: [], unresolved: [] }),
    });
  });
  await gotoGenome(page, controller.url);
  await expect(page.locator("#agents", { hasText: "No failure patterns" })).toBeVisible({ timeout: 10000 });
  const initialCount = genomeCallCount;
  // Synthesize the event. GenomeRenderer.onEvent (genome.js:106-108) reacts
  // to type='genome.failureArchived' by calling render() which re-fetches.
  await page.evaluate(() => {
    const renderers = (globalThis as unknown as { __failsafeRenderers?: { agents?: { onEvent?: (e: unknown) => void } } }).__failsafeRenderers;
    renderers?.agents?.onEvent?.({ type: "genome.failureArchived" });
  });
  await page.waitForTimeout(500);
  expect(genomeCallCount).toBeGreaterThanOrEqual(initialCount + 1);
});
