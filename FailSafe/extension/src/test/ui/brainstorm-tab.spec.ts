/**
 * FX539 — B-B199-1: Brainstorm behavioral E2E.
 *
 * Covers BrainstormRenderer shell + interactive button surface. Voice-input
 * live behavior + 3D canvas content rendering are explicitly out of scope
 * (deferred to B-B199-3 / future canvas-content work — both impractical to
 * E2E without Whisper/Piper/WebGL stacks).
 *
 * Substrate: page.route() intercepts /api/v1/brainstorm/graph. Click-handler
 * side effects (UNDO/REDO/EXPORT) verified via the test-only
 * window.__failsafeRenderers global (B-B199-2 Phase 0) which exposes the
 * BrainstormRenderer.graph instance for direct spy installation.
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
  // Shell template paints synchronously; wait for one of its anchor selectors.
  await expect(page.locator('#workspace .cc-bs-export')).toBeVisible({ timeout: 10000 });
}

async function stubGraphRoute(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/v1/brainstorm/graph", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nodes: [], edges: [] }),
    }),
  );
}

test("FX539.1 — shell renders all toolbar + canvas elements", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await expect(page.locator('#workspace .cc-bs-layout[data-layout="FORCE"]')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-layout[data-layout="TREE"]')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-layout[data-layout="CIRCLE"]')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-view[data-view="2D"]')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-view[data-view="3D"]')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-undo')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-redo')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-export')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-clear')).toBeVisible();
  await expect(page.locator('#workspace .cc-brainstorm-canvas')).toBeVisible();
});

test("FX539.2 — /api/v1/brainstorm/graph fetched at least once on render", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  let graphCallCount = 0;
  await page.route("**/api/v1/brainstorm/graph", (route) => {
    graphCallCount++;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nodes: [], edges: [] }),
    });
  });
  await gotoMindmap(page, controller.url);
  await page.waitForTimeout(500);
  expect(graphCallCount).toBeGreaterThanOrEqual(1);
});

test("FX539.3 — 2D view active by default", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await expect(page.locator('#workspace .cc-bs-view[data-view="2D"]')).toHaveClass(/active/);
  await expect(page.locator('#workspace .cc-bs-view[data-view="3D"]')).not.toHaveClass(/active/);
});

test("FX539.4 — click 3D toggle moves active state to 3D", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await page.locator('#workspace .cc-bs-view[data-view="3D"]').click();
  await expect(page.locator('#workspace .cc-bs-view[data-view="3D"]')).toHaveClass(/active/);
  await expect(page.locator('#workspace .cc-bs-view[data-view="2D"]')).not.toHaveClass(/active/);
});

test("FX539.5 — click TREE layout sets inline border-color (active indicator)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  const treeBtn = page.locator('#workspace .cc-bs-layout[data-layout="TREE"]');
  // Pre-click: inline borderColor is empty (set on click per brainstorm.js:184).
  const beforeColor = await treeBtn.evaluate((el) => (el as HTMLElement).style.borderColor);
  expect(beforeColor).toBe("");
  await treeBtn.click();
  const afterColor = await treeBtn.evaluate((el) => (el as HTMLElement).style.borderColor);
  expect(afterColor.length).toBeGreaterThan(0);
});

test("FX539.6 — UNDO click invokes BrainstormRenderer.graph.undo", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  // Install spy via the test-only global from B-B199-2 Phase 0.
  await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { undo?: () => void } } }> } } }).__failsafeRenderers;
    const sub = g?.workspace?.subViews?.find((s) => s.key === "brainstorm");
    const graph = sub?.renderer?.graph;
    if (!graph) throw new Error("BrainstormRenderer.graph not exposed");
    (graph as unknown as { __undoCalls?: number }).__undoCalls = 0;
    const original = graph.undo?.bind(graph);
    graph.undo = function spyUndo() {
      (graph as unknown as { __undoCalls: number }).__undoCalls++;
      return original ? original() : undefined;
    };
  });
  await page.locator('#workspace .cc-bs-undo').click();
  const calls = await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { __undoCalls?: number } } }> } } }).__failsafeRenderers;
    const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
    return (graph as unknown as { __undoCalls?: number })?.__undoCalls ?? 0;
  });
  expect(calls).toBe(1);
});

test("FX539.7 — REDO click invokes BrainstormRenderer.graph.redo", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { redo?: () => void } } }> } } }).__failsafeRenderers;
    const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
    if (!graph) throw new Error("BrainstormRenderer.graph not exposed");
    (graph as unknown as { __redoCalls?: number }).__redoCalls = 0;
    const original = graph.redo?.bind(graph);
    graph.redo = function spyRedo() {
      (graph as unknown as { __redoCalls: number }).__redoCalls++;
      return original ? original() : undefined;
    };
  });
  await page.locator('#workspace .cc-bs-redo').click();
  const calls = await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { __redoCalls?: number } } }> } } }).__failsafeRenderers;
    return (g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph as unknown as { __redoCalls?: number })?.__redoCalls ?? 0;
  });
  expect(calls).toBe(1);
});

test("FX539.8 — EXPORT click invokes BrainstormRenderer.graph.exportJSON (async)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { exportJSON?: () => Promise<void> } } }> } } }).__failsafeRenderers;
    const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
    if (!graph) throw new Error("BrainstormRenderer.graph not exposed");
    (graph as unknown as { __exportCalls?: number }).__exportCalls = 0;
    graph.exportJSON = async function spyExportJSON() {
      (graph as unknown as { __exportCalls: number }).__exportCalls++;
    };
  });
  await page.locator('#workspace .cc-bs-export').click();
  await page.waitForTimeout(200);
  const calls = await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { __exportCalls?: number } } }> } } }).__failsafeRenderers;
    return (g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph as unknown as { __exportCalls?: number })?.__exportCalls ?? 0;
  });
  expect(calls).toBe(1);
});

test("FX539.9 — RESET click + confirm(true) triggers graph.clearAll; dismiss does NOT", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { clearAll?: () => void } } }> } } }).__failsafeRenderers;
    const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
    if (!graph) throw new Error("BrainstormRenderer.graph not exposed");
    (graph as unknown as { __clearCalls?: number }).__clearCalls = 0;
    graph.clearAll = function spyClearAll() {
      (graph as unknown as { __clearCalls: number }).__clearCalls++;
    };
  });

  // First click — accept the confirm.
  page.once("dialog", (d) => void d.accept());
  await page.locator('#workspace .cc-bs-clear').click();
  await page.waitForTimeout(200);
  const acceptedCalls = await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { __clearCalls?: number } } }> } } }).__failsafeRenderers;
    return (g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph as unknown as { __clearCalls?: number })?.__clearCalls ?? 0;
  });
  expect(acceptedCalls).toBe(1);

  // Second click — dismiss.
  page.once("dialog", (d) => void d.dismiss());
  await page.locator('#workspace .cc-bs-clear').click();
  await page.waitForTimeout(200);
  const dismissedCalls = await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { __clearCalls?: number } } }> } } }).__failsafeRenderers;
    return (g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph as unknown as { __clearCalls?: number })?.__clearCalls ?? 0;
  });
  // After dismiss, clearAll should NOT have been called again.
  expect(dismissedCalls).toBe(1);
});

test("FX539.10 — empty graph response renders shell without error", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/brainstorm/graph", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nodes: [], edges: [] }),
    }),
  );
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  await gotoMindmap(page, controller.url);
  // Canvas container must still be present even with empty graph.
  await expect(page.locator('#workspace .cc-brainstorm-canvas')).toBeVisible();
  // No uncaught page errors from rendering an empty graph.
  expect(consoleErrors).toEqual([]);
});

// FX889 — repository seed (Phase 4). The Mind Map preloads repo knowledge when
// empty + the operator can strip their own layer keeping the seed. Real Chromium.
const SEED_BODY = JSON.stringify({
  nodes: [
    { id: "cb-g1", label: "Plan #196", type: "Architecture", confidence: 100, source: "codebase" },
    { id: "cb-f1", label: "SG-Drift", type: "Risk", confidence: 100, source: "codebase" },
  ],
  edges: [{ source: "cb-g1", target: "cb-f1", label: "caused" }],
});
async function stubSeedRoutes(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/v1/brainstorm/graph", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [] }) }));
  await page.route("**/api/v1/brainstorm/seed", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: SEED_BODY }));
}
function graphNodeIds() {
  const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { nodes?: Array<{ id: string; source?: string }> } } }> } } }).__failsafeRenderers;
  const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
  return (graph?.nodes ?? []).map((n) => ({ id: n.id, source: n.source }));
}

test("FX889 — empty Mind Map auto-seeds codebase nodes from the repo", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubSeedRoutes(page);
  await gotoMindmap(page, controller.url);
  await expect(page.locator('#workspace .cc-bs-seed')).toBeVisible();
  await expect(page.locator('#workspace .cc-bs-clear-layer')).toBeVisible();
  // fetchGraph auto-seeds the empty map; codebase nodes land in the graph.
  await expect.poll(() => page.evaluate(graphNodeIds).then((ns) => ns.length), { timeout: 8000 }).toBe(2);
  const nodes = await page.evaluate(graphNodeIds);
  expect(nodes.every((n) => n.source === "codebase")).toBe(true);
});

test("FX889 — CLEAR LAYER keeps repo nodes, drops the operator's brainstorm node", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubSeedRoutes(page);
  await gotoMindmap(page, controller.url);
  await expect.poll(() => page.evaluate(graphNodeIds).then((ns) => ns.length), { timeout: 8000 }).toBe(2);
  // Operator adds a brainstorm node (no source).
  await page.evaluate(() => {
    const g = (globalThis as unknown as { __failsafeRenderers?: { workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { mergeNodes?: (n: unknown[], e: unknown[]) => void } } }> } } }).__failsafeRenderers;
    g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph?.mergeNodes?.([{ id: "mine", label: "My idea", type: "Idea" }], []);
  });
  await expect.poll(() => page.evaluate(graphNodeIds).then((ns) => ns.length)).toBe(3);
  await page.locator('#workspace .cc-bs-clear-layer').click();
  const after = await page.evaluate(graphNodeIds);
  expect(after.map((n) => n.id).sort()).toEqual(["cb-f1", "cb-g1"]);
  expect(after.every((n) => n.source === "codebase")).toBe(true);
});
