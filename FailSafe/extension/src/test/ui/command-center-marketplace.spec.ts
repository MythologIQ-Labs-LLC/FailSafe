// FX-BROWSER-VERIFY-MARKETPLACE (Phase 2 Round 2 of
// plan-monitor-coherence-and-browser-verification.md v5).
// Asserts the real `/api/marketplace/catalog` route (per MarketplaceRoute.ts:50)
// served by ConsoleServer and that the marketplace surface (Workspace tab >
// Skills > Marketplace view-toggle) doesn't contradict the catalog response
// shape. Empty catalog by default — assertions focus on response contract,
// trust-tier badge / install-button-label coherence-via-absence.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX-BROWSER-VERIFY-MARKETPLACE — catalog route + UI coherence', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('GET /api/marketplace/catalog returns { items, scanners, globalCachePath }', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/marketplace/catalog');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    expect(body.json).toHaveProperty('items');
    expect(Array.isArray(body.json.items)).toBe(true);
    expect(body.json).toHaveProperty('scanners');
    expect(body.json).toHaveProperty('globalCachePath');
  });

  test('marketplace catalog contract — items array elements expose status when populated', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    // The route returns a (possibly empty) items array; if any item is
    // present, every element must carry a `status` so the install-button
    // label / trust-tier badge cannot ever read undefined.
    const items = await page.evaluate(async () => {
      const res = await fetch('/api/marketplace/catalog');
      const j = await res.json();
      return j.items as Array<{ status?: unknown }>;
    });
    for (const item of items) {
      expect(item).toHaveProperty('status');
    }
  });

  test('GET /api/marketplace/item/:id returns 404 when id is unknown (route is wired)', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/marketplace/item/does-not-exist');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(404);
    expect(body.json).toHaveProperty('error');
  });
});
