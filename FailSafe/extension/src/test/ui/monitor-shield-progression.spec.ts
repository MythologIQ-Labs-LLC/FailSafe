// E2E proof for B191 Monitor SHIELD visibility.
// Drives the compact Monitor UI through every governance phase fixture and
// asserts the rendered DOM matches what the user actually sees. Sink: real
// `page.locator()` reads against the rendered phase track.

import { test, expect, Page } from '@playwright/test';

import { hubForPhase, ShieldPhase } from './helpers/ledgerFixtures';
import { serveCompactUI, ServeController } from './helpers/serveCompactUI';

const PHASE_LABELS = ['Plan', 'Audit', 'Implement', 'Substantiate'] as const;

async function readStepClasses(page: Page): Promise<string[]> {
  const handles = await page.locator('#phase-track .phase-row:not(.debug-row) .step').all();
  const out: string[] = [];
  for (const h of handles) {
    const cls = await h.getAttribute('class');
    out.push((cls || '').replace(/\s+/g, ' ').trim());
  }
  return out;
}

function expectStepStatuses(actualClasses: string[], expected: ReadonlyArray<'done' | 'active' | 'pending'>): void {
  expect(actualClasses).toHaveLength(expected.length);
  expected.forEach((status, idx) => {
    const cls = actualClasses[idx];
    expect(cls, `step[${idx}] (${PHASE_LABELS[idx] ?? 'extra'}) class=${cls}`).toContain(status);
  });
}

async function loadMonitor(page: Page, controller: ServeController): Promise<void> {
  await page.goto(`${controller.url}/index.html?ui=compact`);
  await expect(page.locator('#phase-track .phase-row:not(.debug-row) .step').first()).toBeVisible();
}

test.describe('Monitor SHIELD progression', () => {
  let controller: ServeController;

  test.afterEach(async () => {
    if (controller) await controller.close();
  });

  const matrix: ReadonlyArray<{
    phase: ShieldPhase;
    expected: ReadonlyArray<'done' | 'active' | 'pending'>;
    note?: string;
  }> = [
    { phase: 'IDLE', expected: ['pending', 'pending', 'pending', 'pending'] },
    { phase: 'PLAN', expected: ['active', 'pending', 'pending', 'pending'] },
    { phase: 'GATE', expected: ['done', 'active', 'pending', 'pending'] },
    { phase: 'IMPLEMENT', expected: ['done', 'done', 'active', 'pending'] },
    { phase: 'SUBSTANTIATE', expected: ['done', 'done', 'done', 'active'] },
    { phase: 'SEALED', expected: ['done', 'done', 'done', 'done'] },
  ];

  for (const { phase, expected } of matrix) {
    test(`phase=${phase} renders ${expected.join('/')}`, async ({ page }) => {
      controller = await serveCompactUI({ hub: hubForPhase(phase) });
      await loadMonitor(page, controller);
      const classes = await readStepClasses(page);
      expectStepStatuses(classes, expected);
    });
  }

  test('plan title shows Tracking: <plan title>', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubForPhase('IMPLEMENT', 'Comprehensive E2E Coverage') });
    await loadMonitor(page, controller);
    await expect(page.locator('#monitor-plan-title')).toHaveText('Tracking: Comprehensive E2E Coverage');
  });

  test('hub.refresh broadcast re-renders phase track', async ({ page }) => {
    controller = await serveCompactUI({ hub: hubForPhase('PLAN') });
    await loadMonitor(page, controller);
    expectStepStatuses(await readStepClasses(page), ['active', 'pending', 'pending', 'pending']);

    controller.setHub(hubForPhase('IMPLEMENT'));
    controller.broadcast({ type: 'hub.refresh' });

    await expect.poll(async () => {
      const classes = await readStepClasses(page);
      return classes[2] || '';
    }, { timeout: 5000 }).toContain('active');

    expectStepStatuses(await readStepClasses(page), ['done', 'done', 'active', 'pending']);
  });
});
