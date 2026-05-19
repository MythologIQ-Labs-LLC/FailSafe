/**
 * FX522 — B199 Phase 6: Governance tab Playwright structural coverage.
 *
 * The Governance top-level tab hosts 3 sub-views via TabGroup:
 *   - Audit (TransparencyRenderer) — audit log stream
 *   - Risks (RisksRenderer) — risk register
 *   - Compliance (GovernanceRenderer) — sentinel + policies + mode transitions
 *
 * FX508 (Phase 2 sibling) already covers the Compliance sub-pill rendering
 * `recentModeTransitions`. Phase 6 establishes structural coverage for the
 * other two: Audit + Risks. Deep behavioral coverage (audit stream filters,
 * risk derivation) deferred to future phases.
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

async function gotoGovernance(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await expect(page.locator('#governance')).toBeVisible({ timeout: 10000 });
}

test("FX522 Governance tab — 3 sub-pills render (Audit / Risks / Compliance)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoGovernance(page, controller.url);
  await expect(page.locator('#governance .cc-subview-bar')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#governance .cc-pill[data-key="audit"]')).toBeVisible();
  await expect(page.locator('#governance .cc-pill[data-key="risks"]')).toBeVisible();
  await expect(page.locator('#governance .cc-pill[data-key="compliance"]')).toBeVisible();
});

test("FX522 Governance tab — Audit active by default + subview renders", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoGovernance(page, controller.url);
  await expect(page.locator('#governance .cc-pill[data-key="audit"]')).toHaveClass(/active/);
  await expect(page.locator('#governance .cc-subview-content')).toBeVisible();
});

test("FX522 Governance tab — Risks click activates pill + renders subview", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoGovernance(page, controller.url);
  await page.locator('#governance .cc-pill[data-key="risks"]').click();
  await expect(page.locator('#governance .cc-pill[data-key="risks"]')).toHaveClass(/active/);
  await expect(page.locator('#governance .cc-subview-content')).toBeVisible();
});
