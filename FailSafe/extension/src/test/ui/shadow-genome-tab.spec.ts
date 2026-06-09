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
    { id: "f1", label: "Spec Drift", recurrence: 2, severity: "repeated", governanceRoots: [{ id: "g1", label: "Governance: plan gate" }, { id: "p1", label: "Governance: deploy gate" }] },
    { id: "f2", label: "Authority Leak", recurrence: 1, severity: "emerging", governanceRoots: [{ id: "g1", label: "Governance: plan gate" }] },
  ],
  trustTransitions: [],
  federation: { sourced: false, peers: [], note: "Federation peer status is not yet sourced." },
};

const DEGRADED = {
  enabled: false, degraded: true,
  summary: { nodeCount: 0, edgeCount: 0, unresolvedCount: 0, recurringPatternCount: 0, trustTransitionCount: 0 },
  typeDistribution: {}, recentChains: [], projectSurfaces: [], incidents: [], trustTransitions: [],
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
  await expect(page.locator("#governance .sg-panel-title", { hasText: "Node distribution" })).toBeVisible();
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
  await expect(page.locator("#governance .sg-panel-title", { hasText: "Node distribution" })).toBeVisible();
});

test("disabled loader → spec §14 degraded empty card", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/qor/governance-dashboard", (r) => r.fulfill({ json: DEGRADED }));
  await gotoShadowGenome(page, controller.url);

  await expect(page.locator("#governance .sg-empty-title")).toHaveText(/No failure evidence/);
  await expect(page.locator("#governance .sg-chip-degraded")).toBeVisible();
});
