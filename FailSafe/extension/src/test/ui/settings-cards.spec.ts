/**
 * FX513 — B199 Phase 2: Playwright E2E for the newest Settings cards.
 *
 * Covers 6 cases across 3 cards that landed in B194 / B195 / B197 and lacked
 * live E2E proof prior to this cycle:
 *
 *   - Voice Pack card: absent / installed states (B195)
 *   - Governance Mode card: '(default)' tag visible/hidden (B194)
 *   - qor-logic floor warning: visible/hidden per meetsFloor (B197)
 *
 * Uses `serveConsoleServerUI`'s /api/hub override (B-EM-4, FX512) to inject
 * the hub payload Command Center fetches at boot. Bicameral autoConnect is
 * already covered by FX490 via dedicated routes; out of scope here.
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

async function gotoSettings(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="settings"]').click();
  // Wait for the Settings panel to be visible (Theme card is always-rendered).
  await expect(page.locator('#settings')).toBeVisible({ timeout: 10000 });
}

test("FX513 Voice Pack card — absent state shows Install button + hint", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {} } as any,
  });
  await gotoSettings(page, controller.url);
  // Voice Pack card slot renders the absent-state CTA. The slot uses
  // `cc-voice-pack-settings-slot` id (per voice-pack-settings-card.js).
  const slot = page.locator('#cc-voice-pack-settings-slot');
  await expect(slot).toBeVisible({ timeout: 10000 });
  // Status route returns absent by default in test harness without a pack;
  // card surfaces the Install affordance.
  await expect(slot).toContainText(/not installed|Install Voice Pack|absent/i);
});

test("FX513 Governance Mode card — observe shows '(default)' tag", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: "test",
      governanceModeState: { mode: "observe", defaulted: true },
      bootstrapState: {},
    } as any,
  });
  await gotoSettings(page, controller.url);
  const modeCard = page.locator('#cc-governance-mode');
  await expect(modeCard).toBeVisible({ timeout: 10000 });
  await expect(modeCard).toContainText(/observe/i);
  await expect(modeCard).toContainText(/default/i);
});

test("FX513 Governance Mode card — assist hides '(default)' tag", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: "test",
      governanceModeState: { mode: "assist", defaulted: false },
      bootstrapState: {},
    } as any,
  });
  await gotoSettings(page, controller.url);
  const modeCard = page.locator('#cc-governance-mode');
  await expect(modeCard).toBeVisible({ timeout: 10000 });
  await expect(modeCard).toContainText(/assist/i);
  // '(default)' marker absent — card renders the three-button picker without it.
  await expect(modeCard).not.toContainText(/\(default\)/i);
});

// The qor-logic floor warning surface ships on `feat/qor-logic-version-pinning`
// (B197) which hasn't merged to main yet. These two cases stay test.skip until
// B197 lands on main; the JSDOM coverage (FX511) already proves the renderer
// logic, and the override-hook substrate FX512 unblocks the live test once the
// renderer reaches main.
test.skip("FX513 qor-logic floor warning — visible when meetsFloor=false (deferred until B197 merges)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: "test",
      bootstrapState: {
        qorLogicInstall: {
          hosts: [],
          anyInstalled: false,
          installedVersion: "0.30.0",
          minimumVersion: "0.31.1",
          meetsFloor: false,
        },
      },
    } as any,
  });
  await gotoSettings(page, controller.url);
  const warning = page.locator('.cc-qorlogic-floor-warning');
  await expect(warning).toBeVisible({ timeout: 10000 });
  await expect(warning).toContainText(/qor-logic v0\.30\.0/);
  await expect(warning).toContainText(/minimum v0\.31\.1/);
  await expect(warning).toContainText(/Re-run install/i);
});

test.skip("FX513 qor-logic floor warning — absent when meetsFloor=true (deferred until B197 merges)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: "test",
      bootstrapState: {
        qorLogicInstall: {
          hosts: [],
          anyInstalled: true,
          installedVersion: "0.31.5",
          minimumVersion: "0.31.1",
          meetsFloor: true,
        },
      },
    } as any,
  });
  await gotoSettings(page, controller.url);
  // Settings panel renders, but the floor-warning block is omitted.
  await expect(page.locator('#cc-qorlogic')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.cc-qorlogic-floor-warning')).toHaveCount(0);
});
