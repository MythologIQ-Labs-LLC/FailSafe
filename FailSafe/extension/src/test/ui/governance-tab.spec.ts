/**
 * FX522 — B199 Phase 6: Governance tab Playwright structural coverage.
 *
 * The Governance top-level tab hosts 3 sub-views via TabGroup:
 *   - Audit (TransparencyRenderer) — audit log stream
 *   - Risks (RisksRenderer) — risk register
 *   - Compliance (GovernanceRenderer) — sentinel + policies + mode transitions
 *
 * FX508 (Phase 2 sibling) already covers the Compliance sub-pill rendering
 * `recentModeTransitions`. Phase 6 establishes structural coverage for the
 * other two: Audit + Risks. Deep behavioral coverage (audit stream filters,
 * risk derivation) deferred to future phases.
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";
import { buildTimelineEvent } from "./helpers/consoleServerFixtures";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

async function gotoGovernance(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="governance"]').click();
  await expect(page.locator('#governance')).toBeVisible({ timeout: 10000 });
}

test("FX522 Governance tab — 3 sub-pills render (Audit / Risks / Compliance)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoGovernance(page, controller.url);
  await expect(page.locator('#governance .cc-subview-bar')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#governance .cc-pill[data-key="audit"]')).toBeVisible();
  await expect(page.locator('#governance .cc-pill[data-key="risks"]')).toBeVisible();
  await expect(page.locator('#governance .cc-pill[data-key="compliance"]')).toBeVisible();
});

test("FX522 Governance tab — Audit active by default + subview renders", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoGovernance(page, controller.url);
  await expect(page.locator('#governance .cc-pill[data-key="audit"]')).toHaveClass(/active/);
  await expect(page.locator('#governance .cc-subview-content')).toBeVisible();
});

test("FX522 Governance tab — Risks click activates pill + renders subview", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoGovernance(page, controller.url);
  await page.locator('#governance .cc-pill[data-key="risks"]').click();
  await expect(page.locator('#governance .cc-pill[data-key="risks"]')).toHaveClass(/active/);
  await expect(page.locator('#governance .cc-subview-content')).toBeVisible();
});

test("Governance deep link routes severity to Risks and highlights matching record", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: 'test',
      bootstrapState: {},
      risks: [{
        id: 'risk-high-1',
        title: 'Active threat',
        severity: 'high',
        description: 'Threat from test fixture',
        source: 'manual',
      }],
    } as any,
  });
  await page.goto(`${controller.url}/command-center.html#governance:risks?severity=high`);
  await expect(page.locator('#governance .cc-pill[data-key="risks"]')).toHaveClass(/active/);
  await expect(page.locator('#governance [data-risk-severity="high"]')).toHaveClass(/cc-risk--highlighted/);
});

test("Governance deep link routes L3 chain to Compliance and highlights chain section", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: 'test',
      bootstrapState: {},
      sentinelStatus: { running: true },
      l3Queue: [{ id: 'l3-1', riskGrade: 'L3', filePath: 'src/secure.ts' }],
      metricIntegrity: [],
      unattributedFileActivity: { count: 0, recent: [] },
      recentModeTransitions: [],
    } as any,
  });
  await page.goto(`${controller.url}/command-center.html#governance:compliance?section=l3-chain`);
  await expect(page.locator('#governance .cc-pill[data-key="compliance"]')).toHaveClass(/active/);
  await expect(page.locator('#governance [data-section="l3-chain"]')).toHaveClass(/cc-section--highlighted/);
});

test("Governance audit deep link filters by event id and highlights the record", async ({ page }) => {
  controller = await serveConsoleServerUI({
    timelineEvents: [
      buildTimelineEvent('evt-1', 'sentinel.verdict', { decision: 'WARN', riskGrade: 'L2', filePath: 'src/a.ts' }),
      buildTimelineEvent('evt-2', 'sentinel.verdict', { decision: 'BLOCK', riskGrade: 'L3', filePath: 'src/b.ts' }),
    ],
  });
  await page.goto(`${controller.url}/command-center.html#governance:audit?id=evt-2`);
  const body = await page.evaluate(async () => (await fetch('/api/transparency')).json());
  expect((body.events as Array<{ id?: string }>).map((e) => e.id)).toContain('evt-2');
  expect(await page.evaluate(() => window.location.hash)).toBe('#governance:audit?id=evt-2');
  await expect(page.locator('#governance .cc-pill[data-key="audit"]')).toHaveClass(/active/);
  await expect(page.locator('#governance .cc-transparency-record')).toHaveCount(1);
  await expect(page.locator('#governance [data-event-id="evt-2"]')).toHaveClass(/cc-verdict--highlighted/);
  await expect(page.locator('#governance [data-event-id="evt-2"]')).toContainText('Sentinel BLOCK L3 - src/b.ts');
});
