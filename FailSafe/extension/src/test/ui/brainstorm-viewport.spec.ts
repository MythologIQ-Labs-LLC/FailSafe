/**
 * FX897 — Mind Map viewport + persistence (#235 Phase 2, real Chromium;
 * design-reference visual gate). Layout/view/position persistence across
 * reload, FIT recovery of an off-viewport graph, cyclic-DAG fallback,
 * container-resize tracking without window resize, and 100+ node density.
 *
 * Self-contained: navigation + seed-route helpers duplicated from
 * brainstorm-reseed.spec.ts (that file must not grow — #234 LD6). Reads the
 * live surfaces via the test-only window.__failsafeRenderers hook; the FIT
 * assertions reach the vendor instance via renderer.graph.canvas.graph
 * (zoom()/centerAt() getters — plan V1-F6).
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

type Pg = import("@playwright/test").Page;
type Seed = { nodes: unknown[]; edges: unknown[] };

const SEED2: Seed = {
  nodes: [
    { id: "cb-a", label: "Viewport A", type: "Architecture", confidence: 100, source: "codebase" },
    { id: "cb-b", label: "Viewport B", type: "Risk", confidence: 100, source: "codebase" },
  ],
  edges: [{ source: "cb-a", target: "cb-b", label: "links" }],
};

const CYCLIC: Seed = {
  nodes: SEED2.nodes,
  edges: [
    { source: "cb-a", target: "cb-b", label: "fwd" },
    { source: "cb-b", target: "cb-a", label: "back" },
  ],
};

function bigSeed(count: number): Seed {
  const nodes = Array.from({ length: count }, (_, i) => (
    { id: `cb-${i}`, label: `N${i}`, type: "Idea", confidence: 100, source: "codebase" }));
  const edges = Array.from({ length: count - 1 }, (_, i) => (
    { source: `cb-${i}`, target: `cb-${i + 1}`, label: "next" }));
  return { nodes, edges };
}

async function gotoMindmap(page: Pg, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });
}

/** Boots a ConsoleServer, stubs graph/seed routes, installs page-context
 *  accessors (__bs → renderer, __bsView → vendor zoom/centroid-distance),
 *  navigates to the Mind Map, and waits for a live canvas. */
async function boot(page: Pg, seed: Seed): Promise<void> {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/brainstorm/graph", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [] }) }));
  await page.route("**/api/v1/brainstorm/seed", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(seed) }));
  await page.addInitScript(() => {
    const bs = () => (globalThis as any).__failsafeRenderers?.workspace?.subViews
      ?.find((s: any) => s.key === "brainstorm")?.renderer;
    (globalThis as any).__bs = bs;
    (globalThis as any).__bsView = () => {
      const c = bs()?.graph?.canvas;
      if (!c?.graph?.zoom || !c.nodes?.length) return null;
      const cx = c.nodes.reduce((s: number, n: any) => s + (n.x || 0), 0) / c.nodes.length;
      const cy = c.nodes.reduce((s: number, n: any) => s + (n.y || 0), 0) / c.nodes.length;
      const ctr = c.graph.centerAt();
      return { zoom: c.graph.zoom(), dist: Math.hypot(ctr.x - cx, ctr.y - cy) };
    };
  });
  await gotoMindmap(page, controller.url);
  await expect.poll(() => page.evaluate(() => {
    const c = (globalThis as any).__bs?.()?.graph?.canvas;
    return !!(c && c.graph && c.nodes.length);
  }), { timeout: 10000 }).toBe(true);
}

test("FX897 — layout + view selection survive page reload (toolbar screenshot gate)", async ({ page }) => {
  await boot(page, SEED2);
  // Design gate: capture the toolbar row incl. the new FIT/RESET controls.
  await page.locator("#workspace .cc-bs-toolbar").screenshot({
    path: "test-results/brainstorm-viewport-toolbar.png",
  });
  await page.locator('#workspace .cc-bs-layout[data-layout="TREE"]').click();
  await page.locator('#workspace .cc-bs-view[data-view="3D"]').click();
  await expect.poll(() => page.evaluate(() => {
    const renderer = (globalThis as any).__bs?.();
    const identity = renderer?.workspacePath || "local";
    const key = `failsafe-brainstorm-view:${encodeURIComponent(identity)}`;
    return JSON.parse(localStorage.getItem(key) || "{}");
  })).toEqual({ layout: "TREE", viewMode: "3D" });
  await gotoMindmap(page, controller.url); // full reload
  await expect.poll(() => page.evaluate(() => {
    const c = (globalThis as any).__bs?.()?.graph?.canvas;
    return c ? { layout: c.layout, viewMode: c.viewMode } : null;
  }), { timeout: 10000 }).toEqual({ layout: "TREE", viewMode: "3D" });
});

test("FX897 — dragged node position survives reload (fx/fy persisted)", async ({ page }) => {
  await boot(page, SEED2);
  await page.evaluate(() => {
    // Drive the dragEnd→moveCallback persistence hop directly: the vendor
    // dragEnd→pin path is unit-covered (brainstorm-canvas-viewport.test.ts);
    // real pointer drags on the force canvas are flaky headless.
    const r = (globalThis as any).__bs();
    r.graph.canvas.moveCallback(r.graph.nodes[0].id, 4242, -777, undefined);
    // moveCallback sets fx/fy synchronously then schedules a 400ms debounced
    // _saveLocal; flush it deterministically rather than racing the timer
    // (headless CI throttles setTimeout, so a wall-clock wait is flaky and the
    // reload can tear the page down before the debounce fires). The feature
    // under test is pin-persist-across-reload, not the debounce interval.
    r.graph._saveLocal();
  });
  await gotoMindmap(page, controller.url);
  await expect.poll(() => page.evaluate(() => {
    const n = (globalThis as any).__bs?.()?.graph?.nodes?.[0];
    return n ? { fx: n.fx, fy: n.fy } : null;
  }), { timeout: 10000 }).toEqual({ fx: 4242, fy: -777 });
});

test("FX897 — FIT VIEW recovers an off-viewport graph", async ({ page }) => {
  await boot(page, SEED2);
  await page.waitForTimeout(900); // let the LD6 initial-render fit settle first
  const before = await page.evaluate(() => {
    const c = (globalThis as any).__bs().graph.canvas;
    c.graph.zoom(0.05);
    c.graph.centerAt(5000, 5000);
    return (globalThis as any).__bsView();
  });
  expect(before.zoom).toBeLessThanOrEqual(0.06);
  await page.locator("#workspace .cc-bs-fit").click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__bsView()?.zoom),
    { timeout: 10000 }).toBeGreaterThan(before.zoom);
  await expect.poll(() => page.evaluate(() => (globalThis as any).__bsView()?.dist),
    { timeout: 10000 }).toBeLessThan(before.dist);
});

test("FX897 — TREE on a cyclic graph falls back to FORCE, nodes stay rendered", async ({ page }) => {
  await boot(page, CYCLIC);
  await page.locator('#workspace .cc-bs-layout[data-layout="TREE"]').click();
  await expect.poll(() => page.evaluate(() => {
    const c = (globalThis as any).__bs().graph.canvas;
    return {
      layout: c.layout,
      count: c.nodes.length,
      finite: c.nodes.every((n: any) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    };
  }), { timeout: 10000 }).toEqual({ layout: "FORCE", count: 2, finite: true });
});

test("FX897 — container resize 400px → 1200px tracks WITHOUT window resize", async ({ page }) => {
  await boot(page, SEED2);
  const setWidth = (w: number) => page.evaluate((width) => {
    const el = (globalThis as any).__bs().graph.canvas.container as HTMLElement;
    el.style.flex = "none";
    el.style.width = `${width}px`;
    el.style.maxWidth = `${width}px`;
  }, w);
  await setWidth(400);
  await expect.poll(() => page.evaluate(() => {
    const w = (globalThis as any).__bs().graph.canvas.graph.width();
    return w >= 380 && w <= 420;
  }), { timeout: 5000 }).toBe(true);
  await setWidth(1200);
  await expect.poll(() => page.evaluate(() => {
    const w = (globalThis as any).__bs().graph.canvas.graph.width();
    return w >= 1180 && w <= 1220;
  }), { timeout: 5000 }).toBe(true);
});

test("FX897 — 100+ node graph renders and FIT keeps every position finite", async ({ page }) => {
  await boot(page, bigSeed(110));
  await page.locator("#workspace .cc-bs-fit").click();
  await expect.poll(() => page.evaluate(() => {
    const c = (globalThis as any).__bs().graph.canvas;
    return {
      count: c.nodes.length,
      finite: c.nodes.every((n: any) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    };
  }), { timeout: 15000 }).toEqual({ count: 110, finite: true });
});
