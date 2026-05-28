/**
 * FX704 — Open Design provenance pill renders on run cards.
 *
 * Verifies the Monitor Agents -> Replay sub-view's `renderRunCard()` paints
 * an "Open Design" origin pill on rows whose run.provenance.source ==='open-design',
 * and omits the pill when provenance is undefined (regression guard).
 *
 * The pill content is a STATIC LITERAL (no dynamic interpolation) per plan
 * v3 design — verified by asserting the exact "Open Design" text via locator.
 */

import { test, expect, Route } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

const RUN_WITH_OD = {
  id: "11111111-1111-1111-1111-111111111111",
  agentName: "od-agent",
  agentDid: "did:open-design:test",
  agentType: "claude",
  agentSource: "implicit",
  startedAt: new Date().toISOString(),
  status: "running",
  steps: [],
  provenance: { source: "open-design", projectId: "proj-fx704" },
};

const RUN_PLAIN = {
  id: "22222222-2222-2222-2222-222222222222",
  agentName: "plain-agent",
  agentDid: "did:test:plain",
  agentType: "claude",
  agentSource: "manual",
  startedAt: new Date().toISOString(),
  status: "running",
  steps: [],
};

async function openReplay(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  await expect(page.locator('#agents')).toBeVisible({ timeout: 10000 });
  await page.locator('#agents .cc-pill[data-key="replay"]').click();
  await expect(page.locator('#agents .cc-pill[data-key="replay"]')).toHaveClass(/active/);
  await expect(page.locator('#agents .cc-subview-content')).toBeVisible();
}

test("FX704 Open Design pill renders when run.provenance.source === 'open-design'", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {}, agentHealth: null } as any,
  });
  // Intercept the /api/v1/runs endpoint so the ReplayRenderer sees our fixture.
  await page.route('**/api/v1/runs', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ active: [RUN_WITH_OD], completed: [] }),
    });
  });
  await openReplay(page, controller.url);
  const runCard = page.locator(`#agents .cc-replay-run[data-run-id="${RUN_WITH_OD.id}"]`);
  await expect(runCard).toBeVisible({ timeout: 10000 });
  const pill = runCard.locator('.cc-origin-pill.cc-origin-od');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/Open Design/);
});

test("FX704 Open Design pill is ABSENT when provenance is undefined (regression guard)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {}, agentHealth: null } as any,
  });
  await page.route('**/api/v1/runs', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ active: [RUN_PLAIN], completed: [] }),
    });
  });
  await openReplay(page, controller.url);
  const runCard = page.locator(`#agents .cc-replay-run[data-run-id="${RUN_PLAIN.id}"]`);
  await expect(runCard).toBeVisible({ timeout: 10000 });
  await expect(runCard.locator('.cc-origin-pill')).toHaveCount(0);
});
