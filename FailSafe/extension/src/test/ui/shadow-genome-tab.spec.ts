/**
 * Shadow Genome dashboard sub-view (#196 Phase 2) — real ConsoleServer + Chromium.
 * Substrate: page.route() intercepts /api/qor/governance-dashboard to inject a
 * deterministic dashboard. Asserts the sub-view lives under Governance (not
 * Agents), renders the 5 summary cards, switches modes, and shows the degraded
 * empty state when the loader is off.
 */
import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  type ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;
test.afterEach(async () => { if (controller) await controller.close(); });

const DASHBOARD = {
  enabled: true,
  degraded: false,
  summary: { nodeCount: 4, edgeCount: 3, unresolvedCount: 2, recurringPatternCount: 1, trustTransitionCount: 0 },
  typeDistribution: { governance: 2, failure: 2 },
  recentChains: [{ rootId: "g1", failureId: "f1", depth: 1, nodeTypes: ["governance", "failure"] }],
  projectSurfaces: [{ id: "g1", label: "Governance: plan gate", failureCount: 2, unresolvedCount: 2 }],
  incidents: [
    { id: "f1", label: "Spec Drift", recurrence: 2, severity: "repeated", provenance: "reconstructed", governanceRoots: [{ id: "g1", label: "Governance: plan gate" }, { id: "p1", label: "Governance: deploy gate" }] },
    { id: "f2", label: "Authority Leak", recurrence: 1, severity: "emerging", governanceRoots: [{ id: "g1", label: "Governance: plan gate" }] },
  ],
  graph: {
    nodes: [
      { id: "g1", type: "governance", label: "Governance: plan gate" },
      { id: "p1", type: "governance", label: "Governance: deploy gate" },
      { id: "f1", type: "failure", label: "Spec Drift" },
      { id: "f2", type: "failure", label: "Authority Leak" },
    ],
    edges: [
      { id: "e3", source: "g1", target: "f1", type: "applies_to" },
      { id: "e4", source: "g1", target: "f2", type: "triggered_by" },
      { id: "e5", source: "p1", target: "f1", type: "applies_to" },
    ],
  },
  trustTransitions: [],
  learningMaturity: [
    { stage: "Observed", count: 2 }, { stage: "Classified", count: 0 }, { stage: "Constraint extracted", count: 0 },
    { stage: "Detectable", count: 0 }, { stage: "Enforced", count: 0 }, { stage: "Verified", count: 0 },
  ],
  federation: { sourced: false, peers: [], note: "Federation peer status is not yet sourced." },
};

const DEGRADED = {
  enabled: false, degraded: true,
  summary: { nodeCount: 0, edgeCount: 0, unresolvedCount: 0, recurringPatternCount: 0, trustTransitionCount: 0 },
  typeDistribution: {}, recentChains: [], projectSurfaces: [], incidents: [],
  graph: { nodes: [], edges: [] }, trustTransitions: [], learningMaturity: [],
  federation: { sourced: false, peers: [] },
};

async function openIncidents(page: import("@playwright/test").Page): Promise<void> {
  await page.locator('#governance .sg-pill[data-mode="incidents"]').click();
}

async function gotoShadowGenome(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await expect(page.locator('#governance')).toBeVisible({ timeout: 10000 });
  await page.locator('#governance .cc-pill[data-key="shadow-genome"]').click();
}

test("Governance › Shadow Genome — 5 summary cards render the dashboard counts", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator("#governance .sg-card")).toHaveCount(5);
  await expect(
    page.locator("#governance .sg-card", { hasText: "Unresolved" }).locator(".sg-card-num"),
  ).toHaveText("2");
  await expect(page.locator("#governance .sg-chip-live")).toBeVisible();
});

test("mode switch — clicking Federation swaps the active mode body", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  // default mode = Genome Map
  await expect(page.locator("#governance .sg-graph-svg")).toBeVisible();
  await page.locator('#governance .sg-pill[data-mode="federation"]').click();
  await expect(page.locator("#governance .sg-panel-title", { hasText: "Federation" })).toBeVisible();
  await expect(page.locator("#governance").getByText("not yet sourced")).toBeVisible();
});

test("Incidents mode — evidence ledger renders one row per incident", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);
  await openIncidents(page);

  await expect(page.locator("#governance .sg-incident")).toHaveCount(2);
  await expect(page.locator("#governance .sg-incident").first()).toContainText("Spec Drift");
  await expect(page.locator("#governance .sg-incident").first()).toHaveClass(/sg-sev-repeated/);
});

test("Incidents — per-record provenance badge (#454: reconstructed vs recorded)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);
  await openIncidents(page);

  // f1 is flagged reconstructed (derived); f2 has no provenance → no badge.
  const badge = page.locator("#governance .sg-incident", { hasText: "Spec Drift" }).locator(".sg-prov-reconstructed");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("reconstructed");
  await expect(page.locator("#governance .sg-incident", { hasText: "Authority Leak" }).locator(".sg-prov")).toHaveCount(0);
});

test("incident row opens the case-file drawer; Locate in Genome returns to the map", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);
  await openIncidents(page);

  await page.locator("#governance .sg-incident").first().click();
  await expect(page.locator("#governance .sg-drawer")).toBeVisible();
  await expect(page.locator("#governance .sg-drawer-title")).toHaveText("Spec Drift");
  // the drawer shows the governance roots applied to this failure
  await expect(page.locator("#governance .sg-drawer")).toContainText("Governance: deploy gate");
  // honest "not yet sourced" for ungraphed fields
  await expect(page.locator("#governance .sg-drawer")).toContainText("not yet sourced");

  await page.locator("#governance .sg-locate").click();
  await expect(page.locator("#governance .sg-graph-svg")).toBeVisible();
});

test("Genome Map — deterministic causal-graph SVG renders one node per graph node", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url); // default mode = Genome Map

  await expect(page.locator("#governance .sg-graph-svg")).toBeVisible();
  await expect(page.locator("#governance .sg-node")).toHaveCount(4);
  await expect(page.locator('#governance .sg-edge')).toHaveCount(3);
});

test("Genome Map — selecting a node populates the inspector; reset clears it", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  await page.locator('#governance .sg-node[data-node="f1"]').click();
  await expect(page.locator("#governance .sg-graph-rail .sg-drawer-title")).toHaveText("Spec Drift");
  // the inspector lists the causal relationship type
  await expect(page.locator("#governance .sg-graph-rail")).toContainText("applies_to");
  await page.locator("#governance .sg-reset").click();
  await expect(page.locator("#governance .sg-graph-rail")).toContainText("Select a node");
});

test("Genome Map — View as Table is the accessible fallback (graph is not the only path)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  await page.locator('#governance .sg-view-btn[data-view="table"]').click();
  await expect(page.locator("#governance .sg-data-table")).toHaveCount(2); // nodes + edges tables
  await expect(page.locator("#governance .sg-graph-svg")).toHaveCount(0);
  await expect(page.locator("#governance .sg-data-table tbody tr").first()).toBeVisible();
});

test("Learning maturity panel — Observed populated, deeper stages honest-0", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator("#governance .sg-maturity .sg-panel-title")).toContainText("Learning maturity");
  await expect(page.locator("#governance .sg-mat-row")).toHaveCount(6);
  await expect(page.locator("#governance .sg-mat-row", { hasText: "Observed" }).locator(".sg-mat-num")).toHaveText("2");
  await expect(page.locator("#governance .sg-mat-row", { hasText: "Verified" }).locator(".sg-mat-num")).toHaveText("0");
});

test("Trust Transitions — render-ready: honest empty, and chains when data is present", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  const withTrust = {
    ...DASHBOARD,
    trustTransitions: [{ from: "CBT", to: "KBT", direction: "promotion", governanceNodeId: "audit-gate", at: "2026-06-09" }],
  };
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: withTrust }));
  await gotoShadowGenome(page, controller.url);
  await page.locator('#governance .sg-pill[data-mode="trust"]').click();

  await expect(page.locator("#governance .sg-trust-card")).toHaveCount(1);
  await expect(page.locator("#governance .sg-trust-card")).toContainText("CBT");
  await expect(page.locator("#governance .sg-trust-card")).toContainText("KBT");
  await expect(page.locator("#governance .sg-trust-card")).toHaveClass(/sg-trust-promotion/);
});

test("Federation — render-ready: 'not yet sourced', and peer states when present", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  const withPeers = {
    ...DASHBOARD,
    federation: { sourced: true, peers: [{ id: "qor", name: "QorLogic", state: "synced", lastSync: "2m ago" }, { id: "acc", name: "Accountable", state: "stale" }] },
  };
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: withPeers }));
  await gotoShadowGenome(page, controller.url);
  await page.locator('#governance .sg-pill[data-mode="federation"]').click();

  await expect(page.locator("#governance .sg-fed-peer")).toHaveCount(2);
  await expect(page.locator("#governance .sg-fed-state.sg-fed-synced")).toBeVisible();
  await expect(page.locator("#governance .sg-fed-peer", { hasText: "Accountable" }).locator(".sg-fed-stale")).toBeVisible();
});

test("Genome Map — zoom controls change the viewBox; Reset restores the default", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  const svg = page.locator("#governance .sg-graph-svg");
  const base = await svg.getAttribute("viewBox");
  expect(base).toBe("0.0 0.0 800.0 520.0");
  await page.locator('#governance .sg-zoom[data-zoom="in"]').click();
  await expect(svg).not.toHaveAttribute("viewBox", base!);
  await page.locator("#governance .sg-reset").click();
  await expect(svg).toHaveAttribute("viewBox", base!);
});

test("Genome Map — accessibility: control names + keyboard node selection", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator('#governance .sg-zoom[data-zoom="in"]')).toHaveAttribute("aria-label", "Zoom in");
  await expect(page.locator("#governance .sg-reset")).toHaveAttribute("aria-label", "Reset view");
  const node = page.locator('#governance .sg-node[data-node="f1"]');
  await expect(node).toHaveAttribute("role", "button");
  await expect(node).toHaveAttribute("tabindex", "0");
  await node.focus();
  await node.press("Enter");
  await expect(page.locator("#governance .sg-graph-rail .sg-drawer-title")).toHaveText("Spec Drift");
});

test("Genome Map — empty graph shows the honest 'No causal graph yet' state", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  const noGraph = { ...DASHBOARD, graph: { nodes: [], edges: [] } };
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: noGraph }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator("#governance .sg-graph-wrap")).toContainText("No causal graph yet");
  await expect(page.locator("#governance .sg-graph-svg")).toHaveCount(0);
});

test("Genome Map — narrow viewport keeps graph + inspector accessible (responsive)", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.setViewportSize({ width: 700, height: 900 });
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DASHBOARD }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator("#governance .sg-graph-svg")).toBeVisible();
  await expect(page.locator("#governance .sg-graph-rail")).toBeVisible();
});

test("disabled loader → spec §14 degraded empty card", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DEGRADED }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator("#governance .sg-empty-title")).toHaveText(/No failure evidence/);
  await expect(page.locator("#governance .sg-chip-degraded")).toBeVisible();
});
