// FX597 - Monitor compact More info actions.
// The compact Monitor keeps education out of the phase track and exposes
// small More info actions on summary fields.

import { test, expect } from '@playwright/test';

import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';
import { serveCompactUI, ServeController } from './helpers/serveCompactUI';

function hubWithEducation(phase: 'PLAN' | 'GATE' | 'SUBSTANTIATE', enabled: boolean): HubFixture {
  const hub = hubForPhase(phase);
  hub.education = { enabled, proficiency: 'beginner' };
  return hub;
}

test.describe('FX597 - Monitor compact More info actions', () => {
  let controller: ServeController;

  test.afterEach(async () => {
    if (controller) await controller.close();
  });

  test('Plan phase shows compact More info buttons instead of the old expander', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubWithEducation('PLAN', true) });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    await expect(page.locator('#phase-track .phase-row').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#phase-track details.cc-edu-lesson')).toHaveCount(0);
    await expect(page.getByText('What does this mean?')).toHaveCount(0);
    await expect(page.locator('[data-info-target="recent"]')).toBeVisible();
    await expect(page.locator('[data-info-target="next"]')).toBeVisible();
  });

  test('Audit phase next-step More info opens the Governance Console tab', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubWithEducation('GATE', true) });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    await expect(page.locator('#phase-track .phase-row').first()).toBeVisible({ timeout: 5000 });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-info-target="next"]').click();
    const popup = await popupPromise;
    expect(popup.url()).toContain('/command-center.html#governance');
    await popup.close();
  });

  test('no inline micro-lesson expander when education is disabled', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubWithEducation('PLAN', false) });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    await expect(page.locator('#phase-track .phase-row').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#phase-track details.cc-edu-lesson')).toHaveCount(0);
  });
});
