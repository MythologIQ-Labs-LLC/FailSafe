// FX-BROWSER-VERIFY-TIMELINE (Phase 2 Round 2 of
// plan-monitor-coherence-and-browser-verification.md v5).
// Asserts the real `/api/transparency` route (per TransparencyRiskRoute.ts:13)
// serves the fixture-written `<workspaceRoot>/.failsafe/logs/transparency.jsonl`
// file. Per the Phase 2 Round 1 specialist annotation, the route returns
// `{ events: [...] }` (NOT a raw array) — assertions account for the wrapper.
// The Timeline sub-tab lives under "agents" in the Command Center.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { buildTimelineEvent } from './helpers/consoleServerFixtures';

test.describe('FX-BROWSER-VERIFY-TIMELINE — transparency route + filters', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('GET /api/transparency returns { events: [...] } sourced from fixture', async ({ page }) => {
    controller = await serveConsoleServerUI({
      timelineEvents: [
        buildTimelineEvent('e-1', 'prompt.dispatched', { severity: 'info' }),
        buildTimelineEvent('e-2', 'policy.checked', { severity: 'warn' }),
        buildTimelineEvent('e-3', 'verdict.issued', { severity: 'high' }),
      ],
    });
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/transparency');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    // Helper unit-test case 3 confirms the wrapper shape — the route does
    // NOT return a raw array.
    expect(body.json).toHaveProperty('events');
    const events = body.json.events as Array<{ id?: string }>;
    expect(Array.isArray(events)).toBe(true);
    const ids = events.map((e) => e.id);
    expect(ids).toContain('e-1');
    expect(ids).toContain('e-2');
    expect(ids).toContain('e-3');
  });

  test('empty fixture: route returns empty events array (not 500, not undefined)', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/transparency');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    expect(body.json).toHaveProperty('events');
    expect(Array.isArray(body.json.events)).toBe(true);
    expect(body.json.events.length).toBe(0);
  });

  test('large fixture: response shape is bounded (50-cap honoured by route)', async ({ page }) => {
    // Generate 75 events; the route is documented to cap at 50.
    const many = Array.from({ length: 75 }, (_, i) =>
      buildTimelineEvent(`e-${i}`, i % 2 === 0 ? 'prompt.dispatched' : 'policy.checked'),
    );
    controller = await serveConsoleServerUI({ timelineEvents: many });
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/transparency');
      return await res.json();
    });
    expect(body).toHaveProperty('events');
    const events = body.events as unknown[];
    // Route's getTransparencyEvents(50) bound — the response must not exceed
    // the documented cap.
    expect(events.length).toBeLessThanOrEqual(50);
  });
});
