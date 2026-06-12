// FX886 — Workspace › Tracker reload-persistence + full-space (research-brief
// Phase 1, Issues 1 & 2). Real Chromium against the actual ConsoleServer
// (jsdom-insufficient per the operator rules for a visual/lifecycle surface):
//
//  - Issue 1 (no reload): repeated live hub refreshes while the Tracker sub-view
//    is active must NOT tear down/reload the embedded iframe. Proven two ways —
//    element identity (a marker survives) AND a framenavigated counter to
//    /console/tracker that stays at 1 across N refreshes.
//  - Issue 2 (full space): the embed fills available width + viewport height
//    instead of being capped at the old min-height:600px floor. Tall viewport so
//    a 600px cap would be visibly short of fill. Design source = the in-repo
//    .cc-canvas full-bleed precedent (command-center.css).

import { test, expect } from '@playwright/test';
import { serveConsoleServerUI, type ConsoleServerController } from './helpers/serveConsoleServerUI';

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

async function gotoTracker(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator('#workspace')).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="tracker"]').click();
  await expect(page.locator('#workspace iframe.cc-trk-frame')).toBeVisible({ timeout: 10000 });
}

test('FX886 Tracker iframe is NOT recreated across repeated live hub refreshes', async ({ page }) => {
  // Count real navigations of the embedded tracker frame.
  let trackerNavs = 0;
  page.on('framenavigated', (frame) => {
    if (frame.url().includes('/console/tracker')) trackerNavs += 1;
  });

  controller = await serveConsoleServerUI({ initialHub: { version: 'test', bootstrapState: {} } as any });
  await gotoTracker(page, controller.url);

  // Wait for the first (and only expected) tracker navigation to commit.
  await expect.poll(() => trackerNavs, { timeout: 10000 }).toBe(1);

  // Tag the live iframe element; if any re-render recreates it, the marker is lost.
  await page.evaluate(() => {
    const f = document.querySelector('#workspace iframe.cc-trk-frame') as HTMLElement | null;
    if (f) f.dataset.persistMarker = 'fx886';
  });

  // Fire several live hub refreshes (the exact reload trigger: init → 'hub' → render fan-out).
  for (let i = 0; i < 3; i += 1) {
    controller.setHub({ version: `test-${i}`, bootstrapState: {} } as any);
    await page.waitForTimeout(150);
  }

  // Element identity preserved → not torn down → no reload.
  await expect(page.locator('#workspace iframe.cc-trk-frame[data-persist-marker="fx886"]')).toHaveCount(1);
  await expect(page.locator('#workspace iframe.cc-trk-frame')).toHaveCount(1);
  // And the frame never re-navigated.
  expect(trackerNavs, 'tracker iframe must not re-navigate on hub refresh').toBe(1);
});

test('FX886 Tracker embed fills available viewport height (not capped at 600px)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1200 });
  controller = await serveConsoleServerUI({ initialHub: { version: 'test', bootstrapState: {} } as any });
  await gotoTracker(page, controller.url);

  const frameBox = await page.locator('#workspace iframe.cc-trk-frame').boundingBox();
  const contentBox = await page.locator('#workspace .cc-subview-content').boundingBox();
  expect(frameBox, 'iframe has a layout box').not.toBeNull();
  expect(contentBox, 'subview-content has a layout box').not.toBeNull();

  // Full-space: on a 1200px-tall viewport the embed fills well past the old 600px
  // floor (the discriminating assertion — RED without the :has(.cc-trk) rule).
  expect(frameBox!.height).toBeGreaterThan(800);
  // And uses the available horizontal space of its pane.
  expect(frameBox!.width).toBeGreaterThanOrEqual(contentBox!.width * 0.9);
});
