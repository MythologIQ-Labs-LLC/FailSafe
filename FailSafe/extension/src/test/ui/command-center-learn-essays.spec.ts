// FX611 — Educational Component (FailSafe Learn v2) e2e proof.
// Command Center → Learn tab → the SWE-craft essay list. Drives the real
// Command Center UI, activates the Learn tab, and asserts the five essay
// cards render with the FailSafe glossary as a secondary reference below.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';

function learnHub(): HubFixture {
  const hub = hubForPhase('IMPLEMENT');
  hub.governanceModeState = { mode: 'observe', defaulted: true };
  hub.education = { enabled: true, proficiency: 'beginner' };
  return hub;
}

test.describe('FX611 — Command Center Learn tab (SWE-craft essay list)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('the Learn tab opens the SWE-craft essay list with 5 cards visible', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);

    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    const list = page.locator('#cc-learn-essay-list');
    await expect(list).toBeVisible({ timeout: 5000 });
    const cards = list.locator('article.cc-learn-essay-card');
    await expect(cards).toHaveCount(5);

    // Each card carries its essay anchor + a title.
    const anchors = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-essay-anchor')),
    );
    expect(anchors).toEqual(
      expect.arrayContaining([
        'learn.essay.slow-down-to-speed-up',
        'learn.essay.scope-before-prompt',
        'learn.essay.acceptance-criteria',
        'learn.essay.choose-agent-option',
        'learn.essay.verify-output',
      ]),
    );

    // The acceptance-criteria card exposes its template.
    const accept = page.locator('[data-essay-anchor="learn.essay.acceptance-criteria"]');
    await expect(accept.locator('.cc-learn-essay-template')).toBeVisible();
  });

  test('the FailSafe Glossary appears below the essay list as a secondary reference', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    await expect(page.locator('#cc-learn-essay-list')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#learn details#cc-edu-glossary')).toBeVisible();
  });
});
