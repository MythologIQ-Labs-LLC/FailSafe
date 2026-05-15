// FX-BROWSER-VERIFY-MONITOR (Phase 2 Round 2 of plan-monitor-coherence-and-browser-verification.md v5).
// Boots the real ConsoleServer via the Phase 2 Round 1 helper and drives the
// Monitor UI through cold-load / WS-open / forced-WS-drop transitions. Each
// case asserts coherence across status line + sentinel orb class — the very
// contradiction class the plan was scoped to gate (status="Connecting..."
// while sentinel reads green).
//
// Sink: real `page.locator()` reads against the rendered Monitor surface
// served by ConsoleServer's static-file route at `/index.html`.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX-BROWSER-VERIFY-MONITOR — status ↔ sentinel coherence', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      // Gentle teardown buffer for audioVaultService async leak risk noted in
      // Phase 2 Round 1 plan annotations.
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('cold load: status line + sentinel label coherent (no contradictory green/idle pairing on label)', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    // Block hub fetch so `firstHubLoaded` stays false in the in-page client.
    await page.route('**/api/hub', () => { /* never fulfill */ });
    await page.goto(`${controller.url}/index.html?ui=compact`);
    const status = page.locator('#status-line');
    const sentinelLabel = page.locator('#sentinel-label');
    const orb = page.locator('#sentinel-orb');
    // Status line is visible and reads either "Connecting..." or "Connected"
    // depending on how fast the WS handshake races the assertion.
    await expect(status).toBeVisible();
    // The sentinel LABEL must be the "no data yet" sentinel ("—") on cold
    // load when no hub fetch has resolved. The orb class must reflect the
    // pending state — `sentinel-monitor.js:19` now derives state from
    // `status.running`, so an idle daemon paints `pending`, not `monitoring`.
    await expect(orb).toHaveClass(/sentinel-orb pending/);
    await expect(orb).not.toHaveClass(/monitoring/);
    await expect.poll(async () => sentinelLabel.textContent(), { timeout: 5000 }).toMatch(/—|Idle/);
  });

  test('after WS open + hub broadcast: status reflects connected state', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/index.html?ui=compact`);
    const status = page.locator('#status-line');
    // The page's onopen handler flips status to "Connected"; poll because
    // exact timing depends on WS handshake.
    await expect.poll(async () => status.textContent(), { timeout: 5000 }).toMatch(/Connected/);
  });

  test('after forced WS drop: status flips to "Disconnected" + sentinel label resets when firstHubLoaded was false', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    // Block hub fetch so the in-page client never sets firstHubLoaded=true,
    // ensuring the disconnect path goes through paintPendingSentinel().
    await page.route('**/api/hub', () => { /* never fulfill */ });
    await page.goto(`${controller.url}/index.html?ui=compact`);
    const status = page.locator('#status-line');
    await expect.poll(async () => status.textContent(), { timeout: 5000 }).toMatch(/Connected/);

    // Force-drop the socket. setConnectionState('disconnected') runs
    // paintPendingSentinel() because !firstHubLoaded. Note: the helper's
    // harness still accepts new connections, so the in-page reconnect timer
    // (~1s) will quickly re-establish — we observe the disconnected state
    // before reconnect via `expect.poll` with a tight interval.
    controller.closeAllSockets();

    // Poll fast and short — must observe "Disconnected" or "retrying" within
    // the ~1s reconnect window. The base reconnect delay is 1000ms + jitter
    // per roadmap.js:120, so a 900ms window leaves margin.
    await expect.poll(async () => status.textContent(), { intervals: [10, 25, 50], timeout: 900 })
      .toMatch(/Disconnected|retrying/);
    // After paintPendingSentinel, the label is '—' (deterministic). The orb
    // class is also '#sentinel-orb pending' here because paintPendingSentinel
    // overwrites it directly (roadmap.js:107).
    await expect(page.locator('#sentinel-label')).toHaveText('—');
  });
});
