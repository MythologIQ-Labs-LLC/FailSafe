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
