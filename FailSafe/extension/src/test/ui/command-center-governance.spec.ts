// FX-BROWSER-VERIFY-GOVERNANCE (Phase 2 Round 2 of
// plan-monitor-coherence-and-browser-verification.md v5).
// Drives the verdict-injection chain end-to-end:
//   helper.setVerdicts([...]) → mutates checkpointRef → ConsoleServer's
//   private `checkpointMemory` (re-pointed at checkpointRef in helper step
//   4.5) → /api/v1/verdicts response (ConsoleServer.ts:469) →
//   getRecentVerdicts (line 1036) → ckptGetRecentVerdicts (line 1037, with
//   checkpointDb=null forces memory fallback per CheckpointStore.ts:73-76).

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { buildVerdictRecord } from './helpers/consoleServerFixtures';

test.describe('FX-BROWSER-VERIFY-GOVERNANCE — verdict-injection ↔ alerts', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('setVerdicts([BLOCK]) is reflected by /api/v1/verdicts via memory fallback', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    const blockRecord = buildVerdictRecord({ verdict: 'BLOCK', reason: 'gov-spec-block' });
    controller.setVerdicts([blockRecord]);

    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/v1/verdicts');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    expect(Array.isArray(body.json)).toBe(true);
    expect(body.json.length).toBe(1);
    expect(body.json[0]).toHaveProperty('verdict', 'BLOCK');
  });

  test('setVerdicts([]) yields empty /api/v1/verdicts (empty-state path)', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    controller.setVerdicts([]);
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/v1/verdicts');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    expect(Array.isArray(body.json)).toBe(true);
    expect(body.json.length).toBe(0);
  });

  test('mid-session verdict mutation is visible to subsequent fetch (live wiring)', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);

    // First fetch: empty.
    const first = await page.evaluate(async () => {
      const res = await fetch('/api/v1/verdicts');
      return await res.json();
    });
    expect(Array.isArray(first)).toBe(true);
    expect((first as unknown[]).length).toBe(0);

    // Inject a VETO verdict via the helper; same checkpointRef → ConsoleServer
    // reads the new state on the very next request.
    controller.setVerdicts([buildVerdictRecord({ verdict: 'VETO', reason: 'mid-session' })]);

    const second = await page.evaluate(async () => {
      const res = await fetch('/api/v1/verdicts');
      return await res.json();
    });
    expect(Array.isArray(second)).toBe(true);
    expect((second as Array<{ verdict?: string }>).length).toBe(1);
    expect((second as Array<{ verdict?: string }>)[0].verdict).toBe('VETO');
  });

  test('governance tab is reachable from the sidebar', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const govBtn = page.locator('.tab-btn[data-target="governance"]');
    await expect(govBtn).toBeVisible();
    await govBtn.click();
    await expect(page.locator('#governance')).toHaveClass(/active/);
  });
});
