// FX-BROWSER-VERIFY-SKILLS (Phase 2 Round 2 of
// plan-monitor-coherence-and-browser-verification.md v5).
// Asserts that the real `/api/skills` route (per SkillsApiRoute.ts:77) is
// served by ConsoleServer and that the Workspace > Skills sub-tab UI surface
// loads against it without contradiction. The route reads the workspace
// filesystem; the helper writes a fixture-empty workspace by default, so we
// assert response shape + UI tab structure rather than catalog contents.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX-BROWSER-VERIFY-SKILLS — workspace > skills coherence', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('GET /api/skills returns { skills: [...] } shape from real route', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/skills');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    expect(body.json).toHaveProperty('skills');
    expect(Array.isArray(body.json.skills)).toBe(true);
  });

  test('GET /api/skills/relevance?phase=plan returns recommended/allRelevant/otherAvailable', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/skills/relevance?phase=plan');
      return { status: res.status, json: await res.json() };
    });
    expect(body.status).toBe(200);
    expect(body.json).toHaveProperty('phase', 'plan');
    expect(body.json).toHaveProperty('recommended');
    expect(body.json).toHaveProperty('allRelevant');
    expect(body.json).toHaveProperty('otherAvailable');
  });

  test('workspace tab is present in the sidebar; clicking it activates the panel', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    const workspaceBtn = page.locator('.tab-btn[data-target="workspace"]');
    await expect(workspaceBtn).toBeVisible();
    await workspaceBtn.click();
    await expect(page.locator('#workspace')).toHaveClass(/active/);
  });
});
