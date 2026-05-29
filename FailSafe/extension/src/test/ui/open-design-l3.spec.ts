/**
 * FX811 (Playwright) — B-OD-8 visual verification.
 *
 * With a hub carrying a pending `open-design-create-artifact` L3 item, the
 * Governance → Compliance sub-view renders the buffered create_artifact with
 * its args + Approve/Reject controls, and clicking Approve fires a real
 * POST /api/actions/decide-l3. Also verifies the Open Design Integrations card
 * surfaces the "Request create_artifact" affordance.
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

const OD_L3_ITEM = {
  id: "od-l3-1",
  filePath: "open-design:create_artifact",
  riskGrade: "L3",
  queuedAt: "2026-05-28T00:00:00Z",
  kind: "open-design-create-artifact",
  meta: { tool: "create_artifact", args: { name: "hero.svg" } },
};

test("FX811 Governance L3 queue surfaces a pending Open Design create_artifact + Approve fires decide-l3", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {}, l3Queue: [OD_L3_ITEM] } as never,
  });
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await expect(page.locator("#governance")).toBeVisible({ timeout: 10000 });
  // Compliance sub-view hosts the L3 queue.
  await page.locator('#governance .cc-pill[data-key="compliance"]').click();

  const odBlock = page.locator("#governance .cc-l3-opendesign");
  await expect(odBlock).toBeVisible({ timeout: 10000 });
  await expect(odBlock).toContainText("create_artifact");
  await expect(odBlock).toContainText("hero.svg");

  const approve = page.locator('#governance .cc-l3-decide[data-decision="APPROVED"]');
  await expect(approve).toBeVisible();

  const [req] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().endsWith("/api/actions/decide-l3") && r.method() === "POST",
      { timeout: 10000 },
    ),
    approve.click(),
  ]);
  const body = req.postDataJSON() as { id: string; decision: string };
  expect(body.id).toBe("od-l3-1");
  expect(body.decision).toBe("APPROVED");
});

test("FX811 Open Design Integrations card surfaces the Request create_artifact affordance", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {} } as never,
  });
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="integrations"]').click();
  await page.locator('#integrations .cc-subview-bar .cc-pill', { hasText: "Open Design" }).click();
  await expect(page.locator("#integrations .cc-open-design-card")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#integrations .cc-od-create-artifact")).toBeVisible();
  await expect(page.locator("#integrations .cc-od-artifact-name")).toBeVisible();
});
