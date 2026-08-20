// FX916 — Monitor sentinel-alert click-through to Console verdict deep link.
//
// The warning banner ("N issue(s) detected…") must be a working link in both
// Monitor host contexts:
//   - browser-served (top-level window): window.open pops the Console at
//     #governance:audit?verdict=<ts> and the matching Audit Log record is
//     highlighted (identity = the verdict's own timestamp, propagated through
//     the checkpoint payload and the transparency log — plan Phase 1);
//   - embedded (sidebar webview iframe): popups are sandboxed, so the click
//     posts { type: 'failsafe.openConsole', route } to the parent chrome
//     (relayed host-side by FailSafeSidebarProvider → failsafe.openConsoleRoute).
//
// The fixture timestamp is deliberately NOT today: verdict deep links must
// bypass the audit stream's default same-day date filter (hasAuditHashFilter
// verdict bypass, plan Phase 2) or older verdicts would never render.

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

test.describe('FX916 - Monitor sentinel-alert Console deep link', () => {
  let controller: ConsoleServerController;

  test.beforeEach(async () => {
    controller = await serveConsoleServerUI({
      initialHub: warnHub(),
      timelineEvents: [
        {
          id: 'evt-warn-1',
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

  test('browser-served: alert click opens the Console with the verdict highlighted', async ({ page }) => {
    await page.goto(`${controller.url}/?ui=compact`);
    const alert = page.locator('#sentinel-alert');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).toContainText('1 issue(s) detected');

    const popupPromise = page.waitForEvent('popup');
    await alert.click();
    const popup = await popupPromise;

    expect(popup.url()).toContain('/command-center.html#governance:audit?verdict=');
    expect(decodeURIComponent(popup.url())).toContain(VERDICT_TS);

    // The deep-linked record renders despite the non-today timestamp (date-
    // filter bypass) and carries the highlight class applied by
    // highlightRecordFromHash. The class self-clears after 3s, so wait on the
    // highlighted selector directly (polling starts at popup load — no
    // two-stage visibility-then-class race on slow runners).
    const highlighted = popup.locator('.cc-verdict--highlighted');
    await expect(highlighted).toBeVisible({ timeout: 10000 });
    await expect(highlighted).toHaveAttribute('data-event-ts', VERDICT_TS);
    await popup.close();
  });

  test('embedded: alert click posts failsafe.openConsole with the verdict route to the parent', async ({ page }) => {
    // Mirror the sidebar chrome's shape (pattern: monitor-theme-inheritance.spec.ts):
    // host page iframes the compact Monitor and captures relay messages.
    const host = `<!DOCTYPE html><html><body>
      <iframe id="frame" src="${controller.url}/?ui=compact" style="width:420px;height:640px;border:0"></iframe>
      <script>
        window.__openConsoleMessages = [];
        window.addEventListener('message', (e) => {
          const d = e && e.data; if (!d || typeof d !== 'object') return;
          if (d.type === 'failsafe.openConsole') window.__openConsoleMessages.push(d);
        });
      </script>
    </body></html>`;
    await page.setContent(host, { waitUntil: 'load' });

    const frame = page.frameLocator('#frame');
    const alert = frame.locator('#sentinel-alert');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await alert.click();

    await expect
      .poll(async () => page.evaluate(() => (window as any).__openConsoleMessages), { timeout: 5000 })
      .toEqual([
        {
          type: 'failsafe.openConsole',
          route: `governance:audit?verdict=${encodeURIComponent(VERDICT_TS)}`,
        },
      ]);
  });
});
