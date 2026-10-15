/**
 * #514 (FX960, Playwright) — Console side of operator confirmation.
 *
 * Gated loopback routes hold the request open while VS Code shows a modal
 * dialog. These specs hold each gated route open with a page.route mock and
 * assert the Console's status banner: "Confirm this in the VS Code dialog"
 * while pending, "Not confirmed in VS Code" when the server answers 409
 * confirmation:"declined", and the server's own error text otherwise (ratify's
 * 409 not-connected). Re-enabling hooks is not gated, so it shows no pending
 * banner (A5). The real modal is covered by operatorConfirmation.test.ts and
 * the route tests; this spec covers the Console wiring only.
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

const PENDING = "Confirm this in the VS Code dialog";
const DECLINED = "Not confirmed in VS Code";
// The error text deliberately differs from the banner text, so the banner
// assertions prove the client maps `confirmation`, not that it echoes `error`.
const DECLINED_BODY = { ok: false, confirmation: "declined", error: "nothing was recorded" };
const BUSY_BODY = { ok: false, confirmation: "busy", error: "another dialog is open" };

const OD_L3_ITEM = {
  id: "od-l3-1",
  filePath: "open-design:create_artifact",
  riskGrade: "L3",
  queuedAt: "2026-05-28T00:00:00Z",
  kind: "open-design-create-artifact",
  meta: { tool: "create_artifact", args: { name: "hero.svg" } },
};

/** Hold every request to `path` until `release` is called with a response. */
async function holdRoute(page: Page, path: string): Promise<{
  requested: Promise<void>;
  release: (status: number, body: unknown) => void;
}> {
  let release: (status: number, body: unknown) => void = () => undefined;
  let markRequested: () => void = () => undefined;
  const requested = new Promise<void>((r) => { markRequested = r; });
  const answer = new Promise<{ status: number; body: unknown }>((r) => {
    release = (status, body) => r({ status, body });
  });
  await page.route(`**${path}`, async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    markRequested();
    const { status, body } = await answer;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { requested, release };
}

const banner = (page: Page) => page.locator("#cc-operator-banner");

test("#514 decide-l3: pending banner while the dialog is open, then Not confirmed on 409; the item stays queued", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {}, l3Queue: [OD_L3_ITEM] } as never,
  });
  const held = await holdRoute(page, "/api/actions/decide-l3");
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await page.locator('#governance .cc-pill[data-key="compliance"]').click();
  const approve = page.locator('#governance .cc-l3-decide[data-decision="APPROVED"]');
  await expect(approve).toBeVisible({ timeout: 10000 });

  await approve.click();
  await held.requested;
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText(PENDING);

  held.release(409, DECLINED_BODY);
  await expect(banner(page)).toContainText(DECLINED);
  await expect(page.locator("#governance .cc-l3-opendesign")).toBeVisible();
});

test("#514 rollback: pending banner, then Not confirmed on 429 busy", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: "test", bootstrapState: {},
      recentCheckpoints: [{ id: "cp-1", checkpointType: "sprint.start", timestamp: "2026-10-14T00:00:00Z" }],
    } as never,
  });
  const held = await holdRoute(page, "/api/actions/rollback");
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  const rollback = page.locator("#agents .cc-rollback-btn");
  await expect(rollback).toBeVisible({ timeout: 10000 });

  await rollback.click();
  await held.requested;
  await expect(banner(page)).toContainText(PENDING);

  held.release(429, BUSY_BODY);
  await expect(banner(page)).toContainText(DECLINED);
});

test("#514 hooks toggle: turning hooks off shows the pending banner, then Not confirmed on 409 and the box stays checked", async ({ page }) => {
  controller = await serveConsoleServerUI({ initialHub: { version: "test", bootstrapState: {} } as never });
  const held = await holdRoute(page, "/api/hooks/toggle");
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="settings"]').click();
  const toggle = page.locator("#settings .cc-hook-toggle");
  await expect(toggle).toBeVisible({ timeout: 10000 });
  await expect(toggle).toBeChecked();

  await toggle.click();
  await held.requested;
  await expect(banner(page)).toContainText(PENDING);

  held.release(409, DECLINED_BODY);
  await expect(banner(page)).toContainText(DECLINED);
  await expect(toggle).toBeChecked();
});

test("#514 A5 hooks toggle: turning hooks back on is not gated and shows no pending banner", async ({ page }) => {
  controller = await serveConsoleServerUI({ initialHub: { version: "test", bootstrapState: {} } as never });
  await page.route("**/api/hooks/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) }));
  const held = await holdRoute(page, "/api/hooks/toggle");
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="settings"]').click();
  const toggle = page.locator("#settings .cc-hook-toggle");
  await expect(toggle).toBeVisible({ timeout: 10000 });
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await held.requested;
  await expect(banner(page)).toBeHidden();
  held.release(200, { enabled: true });
  await expect(toggle).toBeChecked();
  await expect(banner(page)).toBeHidden();
});

test("#514 ratify: a 409 not-connected still renders the server's error text in the bicameral card", async ({ page }) => {
  const features = [{
    feature: "auth-rewrite",
    decisions: [{ id: "d-001", title: "Drop legacy session-cookie path", source: "rfc-003", status: "unratified", bindings: [] }],
  }];
  let connected = false;
  const client = {
    isConnected: () => connected,
    connect: async () => { connected = true; },
    disconnect: async () => { connected = false; },
    history: async () => features,
    drift: async () => [],
    ratify: async () => undefined,
    preflight: async () => ({ priorDecisions: [], drifted: [], openQuestions: [] }),
  };
  controller = await serveConsoleServerUI({ bicameralClient: client as never, bicameralConfigured: true });
  const held = await holdRoute(page, "/api/actions/bicameral-ratify");
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="integrations"]').click();
  await page.locator('.cc-pill[data-key="bicameral"]').click();
  await page.locator('[data-action="bicameral-connect"]').click();
  const ratify = page.locator('[data-decision-id="d-001"] [data-action="bicameral-ratify"]');
  await expect(ratify).toBeVisible({ timeout: 5000 });

  await ratify.click();
  await held.requested;
  await expect(banner(page)).toContainText(PENDING);

  held.release(409, { ok: false, error: "Bicameral not connected" });
  await expect(page.locator(".cc-bicameral-error")).toContainText("Bicameral not connected");
  await expect(banner(page)).toContainText("Bicameral not connected");
});
