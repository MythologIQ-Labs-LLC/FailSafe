// E2E for the staleness indicator: WS disconnect must visibly mark the phase
// track and surface the banner; reconnect must clear both. Sink: real DOM
// reads against the live page after triggering server-side socket events.

import { test, expect } from '@playwright/test';

import { hubForPhase } from './helpers/ledgerFixtures';
import { serveCompactUI, ServeController } from './helpers/serveCompactUI';

test.describe('Monitor staleness indicator', () => {
  let controller: ServeController;

  test.afterEach(async () => {
    if (controller) await controller.close();
  });

  test('connected → disconnected → reconnected lifecycle', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubForPhase('IMPLEMENT') });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    const phaseTrack = page.locator('#phase-track');
    const banner = page.locator('#monitor-staleness-banner');

    await expect(phaseTrack).not.toHaveClass(/(?:^|\s)stale(?:\s|$)/);
    await expect(banner).toHaveClass(/hidden/);

    controller.acceptingConnections(false);
    controller.closeAllSockets();

    await expect(phaseTrack).toHaveClass(/(?:^|\s)stale(?:\s|$)/);
    await expect(banner).not.toHaveClass(/hidden/);
    await expect(banner).toHaveText('Disconnected — data may be stale');

    controller.acceptingConnections(true);

    await expect(phaseTrack).not.toHaveClass(/(?:^|\s)stale(?:\s|$)/, { timeout: 10000 });
    await expect(banner).toHaveClass(/hidden/);
  });
});
