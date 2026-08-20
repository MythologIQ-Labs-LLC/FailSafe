// FX917 — Monitor deep-link affordances: keyboard-only operability (#242 slice).
//
// WCAG 2.1.1 (keyboard) + 2.4.7 (focus visible) for the primary journey:
// a keyboard-only operator Tab-reaches the sentinel warning banner, sees a
// focus ring, activates with Enter, and lands focused on the deep-linked
// verdict record in the Console Audit Log — no pointer events anywhere.
//
// The focus ring is asserted via computed style (Chromium applies
// :focus-visible for Tab-initiated focus); the screenshot is a human-review
// artifact only (repo has no toHaveScreenshot baseline infra).

import { test, expect } from '@playwright/test';

import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from './helpers/serveConsoleServerUI';

const VERDICT_TS = '2026-05-01T12:00:00.000Z';

function warnHub(): HubFixture {
  const hub = hubForPhase('GATE');
  hub.sentinelStatus = { running: true, queueDepth: 1, lastVerdict: { decision: 'WARN' } };
  hub.recentVerdicts = [
    {
      decision: 'WARN',
      riskGrade: 'L2',
      summary: '1 issue(s) detected - review recommended',
      timestamp: VERDICT_TS,
    },
  ];
  return hub;
}

test.describe('FX917 - Monitor deep-link keyboard accessibility', () => {
  let controller: ConsoleServerController;

  test.beforeEach(async () => {
    controller = await serveConsoleServerUI({
      initialHub: warnHub(),
      timelineEvents: [
        {
          id: 'evt-warn-a11y',
          type: 'sentinel.verdict',
          decision: 'WARN',
          riskGrade: 'L2',
          filePath: 'src/example.ts',
          timestamp: VERDICT_TS,
        },
      ],
    });
  });

  test.afterEach(async () => {
    if (controller) await controller.close();
  });

  test('keyboard-only: Tab reaches the alert, focus ring shows, Enter opens the focused verdict', async ({ page }) => {
    await page.goto(`${controller.url}/?ui=compact`);
    const alert = page.locator('#sentinel-alert');
    await expect(alert).toBeVisible({ timeout: 10000 });

    // Tab until the alert is the active element (deterministic order: only the
    // debug-status and two More-info buttons precede it under this fixture;
    // bounded loop guards against layout drift without pointer fallback).
    let focused = false;
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      focused = await alert.evaluate((el) => el === document.activeElement);
      if (focused) break;
    }
    expect(focused, '#sentinel-alert must be reachable by Tab alone').toBe(true);

    await expect(alert).toHaveAttribute('role', 'button');
    const name = await alert.getAttribute('aria-label');
    expect(name).toContain('1 issue(s) detected');

    // WCAG 2.4.7: keyboard focus must be visible (the :focus-visible rule).
    const outline = await alert.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/monitor-a11y-focus-ring.png' });

    const popupPromise = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const popup = await popupPromise;

    expect(decodeURIComponent(popup.url())).toContain(`#governance:audit?verdict=${VERDICT_TS}`);
    // The deep-linked record receives focus exactly once (Phase 2 latch).
    await expect(popup.locator(`[data-event-ts="${VERDICT_TS}"]`)).toBeVisible({ timeout: 10000 });
    const activeTs = await popup.evaluate(
      () => document.activeElement?.getAttribute('data-event-ts') ?? null,
    );
    expect(activeTs, 'the verdict record must be document.activeElement on landing').toBe(VERDICT_TS);
    await popup.close();
  });
});

test.describe('FX920 - Monitor modal triggers keyboard journeys', () => {
  let controller: ConsoleServerController;

  function alertHub(): HubFixture {
    const hub = warnHub();
    hub.governancePhase = {
      ...hub.governancePhase,
      activeAlerts: [
        { id: 'veto-548', type: 'VETO', message: 'Audit VETO on plan X', entry: 548 },
      ],
    };
    return hub;
  }

  test.afterEach(async () => {
    if (controller) await controller.close();
  });

  async function tabUntilFocused(page: import('@playwright/test').Page, selector: string, max = 25): Promise<boolean> {
    for (let i = 0; i < max; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(
        (sel) => document.activeElement?.matches?.(sel) ?? false, selector);
      if (focused) return true;
    }
    return false;
  }

  test('keyboard-only: metric card opens its explanation modal; Escape returns focus to the card', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: warnHub() });
    await page.goto(`${controller.url}/?ui=compact`);
    await expect(page.locator('.health-item[data-metric="blockers"]')).toBeVisible({ timeout: 10000 });

    const reached = await tabUntilFocused(page, '.health-item[data-metric="blockers"]');
    expect(reached, 'the blockers card must be Tab-reachable').toBe(true);

    const card = page.locator('.health-item[data-metric="blockers"]');
    await expect(card).toHaveAttribute('role', 'button');
    const name = await card.getAttribute('aria-label');
    expect(name).toContain('Critical Blockers');
    expect(name).not.toContain('?');
    const outline = await card.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    await page.keyboard.press('Enter');
    const dialog = page.locator('.cc-modal-overlay[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const focusInside = await page.evaluate(() =>
      document.querySelector('.cc-modal-overlay')?.contains(document.activeElement) ?? false);
    expect(focusInside, 'focus must land inside the dialog').toBe(true);

    // The compact Monitor loads only roadmap.css — the .cc-modal-overlay
    // wrapper must be styled THERE, not just in command-center.css, or the
    // modal renders in-flow with no overlay chrome (audit-verified gap).
    const overlayStyle = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, background: s.backgroundColor, z: s.zIndex };
    });
    expect(overlayStyle.position, 'overlay must be a fixed full-viewport layer').toBe('fixed');
    expect(overlayStyle.background, 'overlay must dim the page behind the modal')
      .not.toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/);
    expect(Number(overlayStyle.z)).toBeGreaterThan(0);
    const cardStyle = await page.locator('.cc-modal').evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, radius: s.borderTopLeftRadius, maxWidth: s.maxWidth };
    });
    expect(cardStyle.maxWidth, 'modal card must be width-bounded for the sidebar').not.toBe('none');
    expect(parseFloat(cardStyle.radius), 'modal card must have card chrome').toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/monitor-metric-modal-styled.png' });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const returned = await page.evaluate(() =>
      document.activeElement?.matches?.('.health-item[data-metric="blockers"]') ?? false);
    expect(returned, 'Escape must return focus to the invoking card').toBe(true);
  });

  test('keyboard-only: alert row opens details; a mid-modal hub refresh recreates rows; Escape re-anchors', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: alertHub() });
    await page.goto(`${controller.url}/?ui=compact`);
    const row = page.locator('.governance-alert[data-alert-id="veto-548"]');
    await expect(row).toBeVisible({ timeout: 10000 });

    const reached = await tabUntilFocused(page, '.governance-alert[data-alert-id="veto-548"]');
    expect(reached, 'the alert row must be Tab-reachable').toBe(true);
    await expect(row).toHaveAttribute('role', 'button');

    await page.keyboard.press('Enter');
    const dialog = page.locator('.cc-modal-overlay[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Production cadence (audit #570 V1): a hub refresh arrives while the
    // modal is open, destroying and recreating every alert row. Mark the
    // pre-refresh row so we can PROVE the destructive rebuild happened —
    // without this the assertion could pass via the plain connected-case
    // restore and silently certify nothing (observer finding 3).
    await page.evaluate(() => {
      document.querySelector('.governance-alert[data-alert-id="veto-548"]')
        ?.setAttribute('data-prerefresh', '1');
    });
    controller.setHub(alertHub());
    await expect.poll(async () => page.evaluate(() =>
      document.querySelector('.governance-alert[data-alert-id="veto-548"]')
        ?.getAttribute('data-prerefresh') ?? null,
    ), { timeout: 5000 }).toBe(null); // recreated row lacks the marker ⇒ rebuild proven

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const anchored = await page.evaluate(() =>
      document.activeElement?.getAttribute?.('data-alert-id') ?? null);
    expect(anchored, 'focus must re-anchor to the recreated row with the same data-alert-id').toBe('veto-548');
  });
});
