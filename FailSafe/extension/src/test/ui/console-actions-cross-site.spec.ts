/**
 * Lane D2 (plan-d2-resume-guard LD6, Playwright, Chromium, B383): a page on another origin cannot
 * resume a stopped Sentinel or run a checkpoint chain verification through the Console's routes,
 * and the Console's own Resume, Verify Chain and Verify Integrity buttons still work.
 *
 * The other origin is a second loopback port (Chromium does not apply its private-network rules
 * between two loopback origins). Nothing here shows what a public website can reach.
 *
 * The B2 verify counts assume nothing else on the Console page verifies the chain: the hub
 * verifies once while it is constructed (before the spy is installed) and no Console module
 * fetches /api/checkpoints.
 */

import * as http from "http";
import type { AddressInfo } from "net";
import { test, expect, type Page } from "@playwright/test";
import { serveConsoleServerUI, ConsoleServerController } from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController | undefined;
let other: http.Server | undefined;

test.afterEach(async () => {
  await controller?.close();
  controller = undefined;
  if (other) await new Promise<void>((r) => other!.close(() => r()));
  other = undefined;
});

async function otherOrigin(): Promise<string> {
  other = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>other origin</title><body></body>");
  });
  await new Promise<void>((r) => other!.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(other.address() as AddressInfo).port}/`;
}

interface Effects {
  starts: number;
  resumed: number;
  verifies: number;
  requestLog: Array<{ method: string; path: string }>;
  responseLog: Array<{ method: string; path: string; status: number }>;
}

async function serve(): Promise<Effects> {
  const effects: Effects = { starts: 0, resumed: 0, verifies: 0, requestLog: [], responseLog: [] };
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {}, agentHealth: null } as never,
    requestLog: effects.requestLog,
    responseLog: effects.responseLog,
    onSentinelStart: () => { effects.starts += 1; },
    onCheckpoint: (type) => { if (type === "monitoring.resumed") effects.resumed += 1; },
    onVerifyChain: () => { effects.verifies += 1; },
  });
  return effects;
}

type Sender = (page: Page, target: string) => Promise<void>;
const SENDERS: Array<[string, number, Sender]> = [
  ["two no-cors fetch POSTs (empty and '{}' text bodies)", 2, async (page, target) => {
    await page.evaluate(async (t) => {
      await fetch(t, { method: "POST", mode: "no-cors", body: "" });
      await fetch(t, { method: "POST", mode: "no-cors", body: "{}" });
    }, target);
  }],
  ["navigator.sendBeacon with an empty body", 1, async (page, target) => {
    expect(await page.evaluate((t) => navigator.sendBeacon(t, ""), target)).toBe(true);
  }],
  ["a submitted text/plain form", 1, async (page, target) => {
    await page.evaluate((t) => {
      const form = document.createElement("form");
      form.method = "post";
      form.enctype = "text/plain";
      form.action = t;
      const input = document.createElement("input");
      input.name = "a";
      input.value = "b";
      form.appendChild(input);
      document.body.appendChild(form);
      setTimeout(() => form.submit(), 0); // the navigation must not tear down this evaluate
    }, target);
  }],
];

for (const route of ["/api/actions/resume-monitoring", "/api/actions/verify-integrity"]) {
  for (const [label, arrivals, send] of SENDERS) {
    test(`B1 ${label} from another origin to ${route} arrives and changes nothing`, async ({ page }) => {
      const effects = await serve();
      await page.goto(await otherOrigin());
      await send(page, `${controller!.url}${route}`);
      const posts = <T extends { method: string; path: string }>(log: T[]) => log.filter((r) => r.method === "POST" && r.path === route);
      await expect.poll(() => posts(effects.requestLog).length).toBe(arrivals);
      // Lane D2 review: the request log is written before the route runs, so wait until every
      // response has been sent (the route has finished, async work included) before asserting.
      await expect.poll(() => posts(effects.responseLog).length).toBe(arrivals);
      expect(effects.starts).toBe(0);
      expect(effects.resumed).toBe(0);
      expect(effects.verifies).toBe(0);
      expect(posts(effects.responseLog).map((r) => r.status)).toEqual(Array(arrivals).fill(403));
    });
  }
}

async function clickAndWait(page: Page, route: string, selector: string): Promise<number> {
  const button = page.locator(selector);
  await expect(button).toBeVisible({ timeout: 10000 });
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(route) && r.request().method() === "POST"),
    button.click(),
  ]);
  return response.status();
}

test("B2 (regression guard) the Console's Operations Resume button starts the stopped Sentinel", async ({ page }) => {
  const effects = await serve();
  await page.goto(`${controller!.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  await expect(page.locator('#agents .cc-pill[data-key="operations"]')).toHaveClass(/active/, { timeout: 10000 });
  const status = await clickAndWait(page, "/api/actions/resume-monitoring", '#agents [data-action="/api/actions/resume-monitoring"]');
  expect(status).toBe(200);
  expect(effects.starts).toBe(1);
  expect(effects.resumed).toBe(1);
});

test("B2 (regression guard) the Console's Operations Verify Chain button verifies the chain", async ({ page }) => {
  const effects = await serve();
  await page.goto(`${controller!.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  await expect(page.locator('#agents .cc-pill[data-key="operations"]')).toHaveClass(/active/, { timeout: 10000 });
  const status = await clickAndWait(page, "/api/actions/verify-integrity", '#agents [data-action="/api/actions/verify-integrity"]');
  expect(status).toBe(200);
  expect(effects.verifies).toBe(1);
});

test("B2 (regression guard) the Console's Compliance Verify Integrity button verifies the chain", async ({ page }) => {
  const effects = await serve();
  await page.goto(`${controller!.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await page.locator('#governance .cc-pill[data-key="compliance"]').click();
  const status = await clickAndWait(page, "/api/actions/verify-integrity", "#governance .cc-gov-verify");
  expect(status).toBe(200);
  expect(effects.verifies).toBe(1);
});
