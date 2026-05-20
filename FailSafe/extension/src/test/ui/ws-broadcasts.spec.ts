/**
 * FX524 — B199 Phase 8: WebSocket broadcast matrix.
 *
 * Deep audit identified ~12 broadcast types are emitted but only `hub.refresh`
 * has end-to-end UI-consumer proof (via `monitor-shield-progression.spec.ts`).
 * This phase establishes baseline coverage that the WS connection accepts
 * each broadcast type without crashing the page (renderer either consumes or
 * gracefully ignores).
 *
 * Acceptance: page emits no `pageerror` after broadcast lands. This is
 * structural-defensive (catches "broadcast crashes the renderer" regressions);
 * specific consumer-behavior verification belongs to per-feature specs.
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

// 12 broadcast types observed in the source via
// grep -rE 'broadcast.*\\{ *type: *[\\'"][a-z][^\\'"]+'.
const BROADCAST_TYPES = [
  "hub.refresh",
  "event",
  "verdict",
  "transparency",
  "agentRun",
  "bicameral.connected",
  "bicameral.disconnected",
  "brainstorm.reset",
  "risk.created",
  "risk.updated",
  "risk.deleted",
  "skills.install.progress",
  "skills.install.complete",
  "voicePack.install.complete",
  "voicePack.install.error",
  "voicePack.uninstalled",
];

for (const t of BROADCAST_TYPES) {
  test(`FX524 broadcast type "${t}" — page survives delivery without runtime error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    controller = await serveConsoleServerUI({
      initialHub: { version: 'test', bootstrapState: {} } as any,
    });
    await page.goto(`${controller.url}/command-center.html`);
    await expect(page.locator(".tab-nav")).toBeVisible({ timeout: 10000 });
    // Deliver the broadcast type to the connected WebSocket.
    controller.broadcast({ type: t, payload: {} });
    await page.waitForTimeout(200);
    expect(errors, `runtime error after broadcast "${t}": ${errors.join("; ")}`).toEqual([]);
  });
}
