/**
 * FX509 / mode-surface end-to-end Playwright spec.
 *
 * The B194 observe-mode advisory banner was REMOVED with the enforce-default
 * flip (plan-qor155-align-enforce-default, 2026-08-19) — the live assertion
 * here is now the negative contract: the Monitor renders with NO #mode-banner
 * element in any governance mode.
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

const OBSERVE_HUB: any = {
  governanceModeState: { mode: "observe", defaulted: false },
  recentModeTransitions: [],
  sentinelStatus: { running: true, queueDepth: 0, lastVerdict: { decision: "PASS" } },
  recentVerdicts: [],
};

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

test("Monitor renders with no #mode-banner element in any governance mode (banner removed)", async ({ page }) => {
  // Even under explicit observe — the mode most likely to resurrect the
  // banner — the element must not exist in the served markup.
  controller = await serveConsoleServerUI({ initialHub: OBSERVE_HUB });
  await page.goto(`${controller.url}/index.html`);
  // The sibling sentinel-alert slot proves the sidebar region rendered.
  await expect(page.locator("#sentinel-alert")).toBeAttached({ timeout: 10000 });
  await expect(page.locator("#mode-banner")).toHaveCount(0);
});

// Note: Command Center sub-tab E2E coverage for FX508 currently relies on the
// JSDOM unit test (src/test/roadmap/governance-mode-transitions.test.ts —
// 4 cases). The harness's `setHub` / `initialHub` paths inject via WebSocket
// `init`, which the Monitor compact UI (roadmap.js) consumes directly but the
// Command Center page bootstraps via `/api/hub` (real HubSnapshotService output
// with fake managers). Extending the harness to also short-circuit /api/hub is
// a separate cycle; tracked as B-EM-4. Unit coverage proves the renderer logic
// with the same SG-035 acceptance discipline.
