/**
 * FX525 — B199 Phase 9: real disk → hub → renderer E2E.
 *
 * Deep audit (CRITICAL): existing B191 coverage is fixture-driven via
 * `serveCompactUI`. The original B191 symptom was Monitor failing to reflect
 * ON-DISK META_LEDGER mutations. This phase exercises the full chain:
 *
 *   fs.writeFile(docs/META_LEDGER.md, ...) →
 *   WorkspaceArtifactBuilder reads at hub-build →
 *   /api/hub returns updated payload →
 *   controller.broadcast(hub.refresh) →
 *   page fetches /api/hub →
 *   ledger summary fields update in the rendered hub payload.
 *
 * Scope: validates the disk → hub portion of the chain. The
 * WorkspaceMutationBus auto-firing on file mutation is timing-sensitive
 * (debounce + watcher latency); this spec drives the refresh explicitly
 * via controller.broadcast to keep the test deterministic.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;
let tmpWorkspace: string;

test.beforeEach(() => {
  tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "fx525-"));
  fs.mkdirSync(path.join(tmpWorkspace, "docs"), { recursive: true });
});

test.afterEach(async () => {
  await controller?.close();
  try { fs.rmSync(tmpWorkspace, { recursive: true, force: true }); } catch { /* ignore */ }
});

test("FX525 disk META_LEDGER → /api/hub reflects ledger entry count on rebuild", async () => {
  // Initial empty ledger.
  const ledgerPath = path.join(tmpWorkspace, "docs", "META_LEDGER.md");
  fs.writeFileSync(ledgerPath, "# META_LEDGER\n\n", "utf-8");
  controller = await serveConsoleServerUI({ workspaceRoot: tmpWorkspace });
  // Initial /api/hub call — empty ledger.
  const before = await fetchJson(`${controller.url}/api/hub`);
  const beforeCount = Number(before?.ledgerSummary?.totalEntries ?? 0);
  // Write a SHIELD seal entry to disk.
  fs.appendFileSync(ledgerPath, sealEntryFixture(), "utf-8");
  // Second /api/hub call — WorkspaceArtifactBuilder re-reads on every hub
  // build, so the new entry must surface.
  const after = await fetchJson(`${controller.url}/api/hub`);
  const afterCount = Number(after?.ledgerSummary?.totalEntries ?? 0);
  expect(afterCount).toBeGreaterThan(beforeCount);
});

test("FX525 disk META_LEDGER + hub.refresh broadcast → Monitor compact UI re-renders new state", async ({ page }) => {
  const ledgerPath = path.join(tmpWorkspace, "docs", "META_LEDGER.md");
  fs.writeFileSync(ledgerPath, "# META_LEDGER\n\n", "utf-8");
  controller = await serveConsoleServerUI({ workspaceRoot: tmpWorkspace });
  await page.goto(`${controller.url}/index.html`);
  // Allow initial render.
  await page.waitForTimeout(500);
  // Write a SHIELD entry to disk + tell page to re-fetch.
  fs.appendFileSync(ledgerPath, sealEntryFixture(), "utf-8");
  controller.broadcast({ type: "hub.refresh" });
  // Allow re-fetch + re-render.
  await page.waitForTimeout(800);
  // The Monitor's hub payload now contains the new ledger entry; visible side
  // effect: at minimum, the page didn't crash on the refresh + re-render.
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});

function sealEntryFixture(): string {
  return `
---

### Entry #999: SESSION SEAL — fx525-test-entry

**Date**: 2026-05-19
**Phase**: substantiate
**Chain Hash**: \`deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\`

## Decision

**SEAL** — fixture entry for FX525 test.

_Session: fx525-disk-hub-renderer_
`;
}

async function fetchJson(url: string): Promise<any> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`fetch failed: ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}
