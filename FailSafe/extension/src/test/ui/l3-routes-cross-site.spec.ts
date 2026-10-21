/**
 * Lane D (plan-l3-routes-guard LD7, Playwright, Chromium): a page on another origin cannot open
 * the L3 approve-all or Panic Stop dialogs through the Console's routes, and the Console's own
 * Process All button still reaches the dialog.
 *
 * The other origin is a second loopback port (Chromium does not apply its private-network rules
 * between two loopback origins). Nothing here shows what a public website can reach.
 */

import * as http from "http";
import type { AddressInfo } from "net";
import { test, expect } from "@playwright/test";
import type { OperatorActionRequest } from "../../extension/operatorConfirmation";
import { serveConsoleServerUI, ConsoleServerController } from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController | undefined;
let other: http.Server | undefined;

test.afterEach(async () => {
  await controller?.close();
  controller = undefined;
  if (other) await new Promise<void>((r) => other!.close(() => r()));
  other = undefined;
});

const L3_ITEM = { id: "l3-1", state: "QUEUED", filePath: "src/secure.ts", riskGrade: "L3", queuedAt: "t", flags: [] };

async function otherOrigin(): Promise<string> {
  other = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>other origin</title>");
  });
  await new Promise<void>((r) => other!.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(other.address() as AddressInfo).port}/`;
}

for (const route of ["/api/actions/approve-l3-batch", "/api/actions/panic-stop"]) {
  test(`B1 a no-cors text/plain POST from another origin to ${route} arrives and opens no dialog`, async ({ page }) => {
    const shown: OperatorActionRequest[] = [];
    const decided: string[] = [];
    const requestLog: Array<{ method: string; path: string }> = [];
    controller = await serveConsoleServerUI({
      initialHub: { version: "test", bootstrapState: {}, l3Queue: [L3_ITEM] } as never,
      l3Queue: [L3_ITEM],
      onL3Decision: (id) => { decided.push(id); },
      requestLog,
      operatorConfirmer: async (r) => { shown.push(r); return "approved"; },
    });
    await page.goto(await otherOrigin());
    await page.evaluate(async ({ target }) => {
      await fetch(target, { method: "POST", mode: "no-cors", body: "" });
      await fetch(target, { method: "POST", mode: "no-cors", body: '{"decision":"APPROVED"}' });
    }, { target: `${controller.url}${route}` });
    await expect.poll(() => requestLog.filter((r) => r.method === "POST" && r.path === route).length).toBe(2);
    expect(shown.length).toBe(0);
    expect(decided.length).toBe(0);
  });
}

test("B2 the Console's Process All button reaches the dialog and decides the queued item", async ({ page }) => {
  const shown: OperatorActionRequest[] = [];
  const decided: string[] = [];
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {}, l3Queue: [L3_ITEM] } as never,
    l3Queue: [L3_ITEM],
    onL3Decision: (id) => { decided.push(id); },
    operatorConfirmer: async (r) => { shown.push(r); return "approved"; },
  });
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await page.locator('#governance .cc-pill[data-key="compliance"]').click();
  const button = page.locator("#governance .cc-gov-l3-batch");
  await expect(button).toBeVisible({ timeout: 10000 });
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/actions/approve-l3-batch") && r.request().method() === "POST"),
    button.click(),
  ]);
  expect(response.status()).toBe(200);
  expect(shown.length).toBe(1);
  expect(shown[0].title).toBe("Approve all 1 queued L3 item?");
  expect(decided).toEqual(["l3-1"]);
});
