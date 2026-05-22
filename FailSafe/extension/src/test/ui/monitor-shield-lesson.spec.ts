// FX597 — Educational Component Phase 4b e2e proof.
// The Monitor SHIELD phase-tracker carries a "What does this mean?" micro-
// lesson expander on the active phase. This spec drives the real compact
// Monitor UI, opens the expander, and asserts the phase explanation text is
// shown to the user. Sink: real page.locator() reads against rendered DOM.

import { test, expect } from '@playwright/test';

import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';
import { serveCompactUI, ServeController } from './helpers/serveCompactUI';

function hubWithEducation(phase: 'PLAN' | 'GATE' | 'SUBSTANTIATE', enabled: boolean): HubFixture {
  const hub = hubForPhase(phase);
  hub.education = { enabled, proficiency: 'beginner' };
  return hub;
}

test.describe('FX597 — Monitor SHIELD phase-tracker micro-lesson', () => {
  let controller: ServeController;

  test.afterEach(async () => {
    if (controller) await controller.close();
  });

  test('Plan phase shows a "What does this mean?" expander that opens to the explanation', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubWithEducation('PLAN', true) });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    // The phase track renders the active-phase micro-lesson inside #phase-track.
    const lesson = page.locator('#phase-track details.cc-edu-lesson');
    await expect(lesson).toBeVisible({ timeout: 5000 });

    // Collapsed by default.
    await expect(lesson).not.toHaveAttribute('open', /.*/);

    // Open the expander via its summary.
    await lesson.locator('summary').click();
    await expect(lesson).toHaveAttribute('open', '');

    // The Plan phase explanation is now visible.
    const body = lesson.locator('.cc-edu-lesson-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('first SHIELD phase');
  });

  test('Audit phase expander opens to the Audit explanation', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubWithEducation('GATE', true) });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    const lesson = page.locator('#phase-track details.cc-edu-lesson');
    await expect(lesson).toBeVisible({ timeout: 5000 });
    await lesson.locator('summary').click();
    await expect(lesson.locator('.cc-edu-lesson-body')).toContainText('reviews the plan');
  });

  test('no micro-lesson expander when education is disabled', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubWithEducation('PLAN', false) });
    await page.goto(`${controller.url}/index.html?ui=compact`);

    // Phase track itself must still render.
    await expect(page.locator('#phase-track .phase-row').first()).toBeVisible({ timeout: 5000 });
    // But no lesson expander.
    await expect(page.locator('#phase-track details.cc-edu-lesson')).toHaveCount(0);
  });
});
