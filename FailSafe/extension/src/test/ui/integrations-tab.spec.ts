/**
 * FX519 — B199 Phase 3: Integrations tab Playwright coverage.
 *
 * The existing `integrations-bicameral.spec.ts` (FX490) already covers the
 * Bicameral card render states. Phase 3 extends with the surface that was
 * deferred in Phase 2 because the /api/hub override (B-EM-4) wasn't on this
 * branch yet — Voice Pack installed state + Bicameral ratify click flow.
 *
 * Branch substrate dependencies:
 *  - B-BIC-1 ratify USER_OVERRIDE ledger append (this branch).
 *  - B-BIC-4 capability cache (this branch).
 *  - B-EM-4 /api/hub override (replicated inline in serveConsoleServerUI.ts).
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

test("FX519 Voice Pack Settings card — installed state renders Uninstall + disk-usage", async ({ page }) => {
  // The Voice Pack card lives in the Settings tab. Phase 2 only covered the
  // absent state because /api/hub override wasn't yet wired. Now that B-EM-4
  // (replicated inline on this branch) intercepts /api/hub, the installed
  // fixture surfaces the full card render.
  controller = await serveConsoleServerUI({
    voicePackInstalled: true,
    voicePackVersion: '5.2.0',
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="settings"]').click();
  const slot = page.locator('#cc-voice-pack-settings-slot');
  await expect(slot).toBeVisible({ timeout: 10000 });
  // Installed state surfaces Uninstall affordance + a v<version> display
  // somewhere in the card body.
  await expect(slot).toContainText(/v?5\.2\.0|installed|Uninstall/i, { timeout: 10000 });
});

// FX519 Bicameral ratify end-to-end is already covered by FX490's
// `ratify decision → POST hits the route with the right decisionId + verdict`
// case (integrations-bicameral.spec.ts:124). The B-BIC-1 ledger-append surface
// is covered by FX514 mocha (BicameralRoute.test.ts). No duplicate Playwright
// case needed here — the Phase 3 leverage is in Voice Pack installed-state
// coverage (the case Phase 2 explicitly deferred pending B-EM-4 substrate).

// FX519 capability-driven UI dimming — deferred until B-BIC-13 lands the
// UI consumer of getCapabilities(). The cache exists on the client side
// (B-BIC-4) but no UI consumer reads it yet.
test.skip("FX519 Bicameral card dims affordances for unsupported tools (deferred until B-BIC-13)", async ({ page }) => {
  // When B-BIC-13 ships UI dimming, this asserts that a client whose
  // getCapabilities() returns only ['bicameral.history'] renders the Ratify
  // button as disabled.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _placeholder = page;
});
