// FX596 — Educational Component Phase 4a e2e proof.
// Command Center → Settings → the governance-mode card carries a "What does
// this mean?" micro-lesson expander. This spec drives the real Command Center
// UI, opens the expander, and asserts the Observe/Assist/Enforce explanation
// is shown to the user. Sink: real page.locator() reads against rendered DOM.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';

function hubWithEducation(enabled: boolean): HubFixture {
  const hub = hubForPhase('PLAN');
  hub.governanceModeState = { mode: 'observe', defaulted: true };
  hub.education = { enabled, proficiency: 'beginner' };
  return hub;
}

test.describe('FX596 — Command Center governance-mode card micro-lesson', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('governance-mode card shows a "What does this mean?" expander that opens to the explanation', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(true) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();
    await expect(page.locator('#settings')).toHaveClass(/active/);

    // The governance-mode card renders with an embedded micro-lesson.
    const card = page.locator('#cc-governance-mode');
    await expect(card).toBeVisible({ timeout: 5000 });
    const lesson = card.locator('details.cc-edu-lesson');
    await expect(lesson).toBeVisible();

    // Collapsed by default.
    await expect(lesson).not.toHaveAttribute('open', /.*/);

    // Open the expander.
    await lesson.locator('summary').click();
    await expect(lesson).toHaveAttribute('open', '');

    // The Observe/Assist/Enforce explanation is shown.
    const body = lesson.locator('.cc-edu-lesson-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('Observe');
    await expect(body).toContainText('Enforce');
  });

  test('governance-mode card has no micro-lesson when education is disabled', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(false) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();

    const card = page.locator('#cc-governance-mode');
    await expect(card).toBeVisible({ timeout: 5000 });
    // Mode buttons still render — only the lesson is gated.
    await expect(card.locator('[data-governance-mode]')).toHaveCount(3);
    await expect(card.locator('details.cc-edu-lesson')).toHaveCount(0);
  });

  test('dismissing the micro-lesson removes it from the card', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(true) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();

    const lesson = page.locator('#cc-governance-mode details.cc-edu-lesson');
    await expect(lesson).toBeVisible({ timeout: 5000 });
    await lesson.locator('summary').click();
    await lesson.locator('[data-edu-dismiss]').click();
    await expect(page.locator('#cc-governance-mode details.cc-edu-lesson')).toHaveCount(0);
  });
});
