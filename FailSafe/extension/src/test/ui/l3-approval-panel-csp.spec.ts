/**
 * FX964 (Playwright) — the L3 Approval Queue buttons work under the panel's
 * own Content-Security-Policy.
 *
 * The webview CSP allows only nonce'd scripts. Inline onclick handlers are
 * blocked by that policy, so Approve, Reject and View File did nothing in
 * VS Code. These specs render the real builder output, with its CSP meta
 * tag, in Chromium, stub acquireVsCodeApi, click each button and assert the
 * message the extension would receive.
 */

import { test, expect, type Page } from "@playwright/test";
import { buildL3ApprovalHtml } from "../../genesis/panels/l3ApprovalHtml";
import type { L3ApprovalRequest } from "../../shared/types";

const NONCE = "TestNonce0123456789abcdefABCDEF01";

function item(id: string, filePath: string): L3ApprovalRequest {
  return {
    id,
    filePath,
    riskGrade: "L3",
    agentDid: "did:myth:test-agent-0000000000000000",
    agentTrust: 0.5,
    queuedAt: "2026-10-15T00:00:00Z",
    sentinelSummary: "critical path changed",
    flags: ["auth"],
    state: "QUEUED",
  } as unknown as L3ApprovalRequest;
}

async function render(page: Page, queue: L3ApprovalRequest[]): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  // Init scripts run before page scripts and are not subject to page CSP,
  // standing in for the API VS Code injects into every webview.
  await page.addInitScript(() => {
    const posted: unknown[] = [];
    (window as unknown as { __posted: unknown[] }).__posted = posted;
    (window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi =
      () => ({ postMessage: (m: unknown) => posted.push(m) });
  });
  const html = buildL3ApprovalHtml(queue, { nonce: NONCE, cspSource: "https://webview.test" });
  await page.route("https://webview.test/panel.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto("https://webview.test/panel.html");
  return violations;
}

const posted = (page: Page) =>
  page.evaluate(() => (window as unknown as { __posted: unknown[] }).__posted);

test("FX964 Approve, Reject and View File post their messages under the panel CSP", async ({ page }) => {
  const violations = await render(page, [item("req-1", "src/auth/login.ts")]);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("button", { name: "View File" }).click();

  await expect.poll(() => posted(page)).toEqual([
    { command: "approve", id: "req-1" },
    { command: "reject", id: "req-1" },
    { command: "viewFile", file: "src/auth/login.ts" },
  ]);
  expect(violations).toEqual([]);
});

test("FX964 each item's buttons carry that item's id and path, including quotes and markup", async ({ page }) => {
  const tricky = `it's "odd" <b>`;
  await render(page, [
    item("req-1", "a.ts"),
    item(tricky, `C:\\work\\it's "odd" <b>.ts`),
  ]);

  await page.getByRole("button", { name: "Reject" }).nth(1).click();
  await page.getByRole("button", { name: "View File" }).nth(1).click();
  await page.getByRole("button", { name: "Approve" }).nth(0).click();

  await expect.poll(() => posted(page)).toEqual([
    { command: "reject", id: tricky },
    { command: "viewFile", file: `C:\\work\\it's "odd" <b>.ts` },
    { command: "approve", id: "req-1" },
  ]);
  await expect(page.locator("b")).toHaveCount(0);
});

test("FX964 the empty queue renders without CSP violations", async ({ page }) => {
  const violations = await render(page, []);
  await expect(page.getByText("No pending approvals")).toBeVisible();
  expect(violations).toEqual([]);
});
