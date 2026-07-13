/**
 * FX894 — Mind Map re-seed stability (#234). Repeated RE-SEED clicks against
 * the same repository seed must not duplicate edges in the live renderer graph.
 *
 * Self-contained: navigation + seed-route helpers duplicated from
 * brainstorm-tab.spec.ts (that file is pre-existing over-cap debt and must not
 * grow — plan #234 LD6). Reads the live graph via the test-only
 * window.__failsafeRenderers hook and drives the .cc-bs-seed REPO control.
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

async function gotoMindmap(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator('#workspace')).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator('#workspace .cc-bs-export')).toBeVisible({ timeout: 10000 });
}

const SEED_BODY = JSON.stringify({
  nodes: [
    { id: "cb-g1", label: "Plan #234", type: "Architecture", confidence: 100, source: "codebase" },
    { id: "cb-f1", label: "Edge dupes", type: "Risk", confidence: 100, source: "codebase" },
  ],
  edges: [{ source: "cb-g1", target: "cb-f1", label: "caused" }],
});

async function stubSeedRoutes(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/v1/brainstorm/graph", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [] }) }));
  await page.route("**/api/v1/brainstorm/seed", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: SEED_BODY }));
}

function graphEdgeCount(): number {
  const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { edges?: unknown[] } } }> } } }).__failsafeRenderers;
  const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
  return (graph?.edges ?? []).length;
}

test("FX894 — repeated RE-SEED keeps graph.edges.length constant", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubSeedRoutes(page);
  await gotoMindmap(page, controller.url);
  // fetchGraph auto-seeds the empty map; the single seed edge lands once.
  await expect.poll(() => page.evaluate(graphEdgeCount), { timeout: 8000 }).toBe(1);
  await page.locator('#workspace .cc-bs-seed').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(graphEdgeCount)).toBe(1);
  await page.locator('#workspace .cc-bs-seed').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(graphEdgeCount)).toBe(1);
});
