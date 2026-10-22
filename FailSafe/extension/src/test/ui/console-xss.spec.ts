// Lane E (plan-e-console-ui-xss) rows U1-U4: real-browser (Chromium) checks
// against the real ConsoleServer. Each hostile payload sets window.__fsXss if
// it ever executes; every row asserts it never does.
//
// U1  Governance > Compliance policies card, hub alert carrying markup (S1).
// U1b The same through the real producer: a workspace META_LEDGER whose
//     **Verdict**: line carries the payload -> GovernancePhaseTracker -> hub
//     -> governance.js policies card (audit fold 10).
// U2  Governance > Risks Edit modal, risk title breaking out of value= (S11).
// U3  command-center.html with a hash that is not a valid selector value (S21).
// U4  Development Tracker links from programs.yaml: javascript: and its
//     obfuscations never become a link target; http(s) stays a link (S22).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { serveConsoleServerUI, type ConsoleServerController } from './helpers/serveConsoleServerUI';

const TAG = '<img src=x onerror="window.__fsXss=1">';
const DQ = 'x" autofocus onfocus="window.__fsXss=1" data-x="';

let controller: ConsoleServerController | undefined;
const tempDirs: string[] = [];

test.afterEach(async () => {
  await controller?.close();
  controller = undefined;
  await new Promise((r) => setTimeout(r, 50));
  while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

async function fired(page: Page): Promise<unknown> {
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as unknown as { __fsXss?: unknown }).__fsXss);
}

async function openCompliance(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html#governance:compliance`);
  await expect(page.locator('#governance .cc-pill[data-key="compliance"]')).toHaveClass(/active/, { timeout: 10000 });
  await expect(page.getByText('Active Policies').first()).toBeVisible({ timeout: 10000 });
}

test('U1 Compliance policies card: a hub alert carrying markup does not execute (S1)', async ({ page }) => {
  const message = `Blocked: BLOCK ${TAG}`;
  controller = await serveConsoleServerUI({
    initialHub: {
      version: 'test', bootstrapState: {}, sentinelStatus: { running: true }, l3Queue: [],
      metricIntegrity: [], unattributedFileActivity: { count: 0, recent: [] }, recentModeTransitions: [],
      governancePhase: { current: 'GATE', activeAlerts: [{ id: 'block-1', type: 'BLOCK', message, entry: 1 }] },
    } as never,
  });
  await openCompliance(page, controller.url);
  await expect(page.locator('#governance .cc-card').filter({ hasText: 'Active Policies' })).toContainText('Blocked: BLOCK');
  expect(await fired(page), 'the payload executed').toBeUndefined();
  expect(await page.locator('#governance img').count()).toBe(0);
  await expect(page.locator('#governance').getByText(message)).toBeVisible();
});

test('U1b Compliance policies card: a META_LEDGER verdict carrying markup does not execute (S1, real producer)', async ({ page }) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-lane-e-ledger-'));
  tempDirs.push(ws);
  fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'docs', 'META_LEDGER.md'), [
    '# META LEDGER', '',
    '### Entry #1: GATE', '',
    '**Timestamp**: 2026-10-22T00:00:00Z',
    '**Phase**: GATE',
    `**Verdict**: BLOCK ${TAG}`,
    '', '---', '',
  ].join('\n'), 'utf8');
  controller = await serveConsoleServerUI({ workspaceRoot: ws });
  await openCompliance(page, controller.url);
  await expect(page.locator('#governance .cc-card').filter({ hasText: 'Active Policies' })).toContainText('Blocked: BLOCK', { timeout: 10000 });
  expect(await fired(page), 'the payload executed').toBeUndefined();
  expect(await page.locator('#governance img').count()).toBe(0);
  await expect(page.locator('#governance').getByText(`Blocked: BLOCK ${TAG}`)).toBeVisible();
});

test('U2 Risks Edit modal: a risk title breaking out of value= does not execute (S11)', async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: {
      version: 'test', bootstrapState: {},
      risks: [{ id: 'risk-1', title: DQ, severity: 'high', description: 'd', source: 'manual' }],
    } as never,
  });
  await page.goto(`${controller.url}/command-center.html#governance:risks`);
  await expect(page.locator('#governance .cc-pill[data-key="risks"]')).toHaveClass(/active/, { timeout: 10000 });
  await page.locator('#governance .cc-risk-edit').first().click();
  const input = page.locator('.cc-modal-overlay input[name=title]');
  await expect(input).toBeVisible();
  await input.focus();
  expect(await fired(page), 'the payload executed').toBeUndefined();
  expect(await page.locator('.cc-modal-overlay [autofocus], .cc-modal-overlay [data-x]').count()).toBe(0);
  expect(await input.inputValue()).toBe(DQ);
});

for (const hash of ['#"]', '#\\', '#a"b']) {
  test(`U3 command-center.html${hash} still boots and starts the hub client (S21)`, async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: { version: 'test', bootstrapState: {} } as never });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const hubRequested = page.waitForRequest((r) => r.url().endsWith('/api/hub'), { timeout: 10000 }).then(() => true, () => false);
    await page.goto(`${controller.url}/command-center.html${hash}`);
    expect(await hubRequested, 'client.start() fetched /api/hub').toBe(true);
    expect(errors, 'no uncaught page error').toEqual([]);
  });
}

const REFUSED = [
  'javascript:window.__fsXss=1', 'JaVaScRiPt:window.__fsXss=1', ' \x01javascript:window.__fsXss=1',
  'java\tscript:window.__fsXss=1', 'java\nscript:window.__fsXss=1',
  'data:text/html,<script>window.__fsXss=1</script>', 'vbscript:msgbox(1)',
];
const ALLOWED = ['https://example.com/ok', 'http://example.com/ok', '/relative/ok'];

function trackerPayload(ref: string): Record<string, unknown> {
  const links = [...REFUSED, ...ALLOWED].map((href, i) => ({ t: 'url', href, label: `link-${i}` }));
  return {
    repo: 'o/r', meta: { title: 'Fixture' },
    rcs: [{ id: 'v1.0.0', state: 'prod', ref, note: '2026-10-22', summary: 's' }],
    programs: [{ key: 'p', name: 'Program', accent: '#38d6c8' }],
    phases: [{ prog: 'p', key: 'P1', rc: 'v1.0.0', w: 100, title: 'Phase one', links }],
    verticals: [], cadence: 'semver', manifestPresent: true, lint: [], ok: true,
  };
}

async function hrefs(page: Page): Promise<Array<{ text: string; href: string; protocol: string }>> {
  return page.$$eval('a', (as) => as.map((a) => ({
    text: (a.textContent || '').trim(), href: a.getAttribute('href') || '', protocol: (a as HTMLAnchorElement).protocol,
  })));
}

for (const ref of [REFUSED[0], REFUSED[2]]) {
  test(`U4 tracker: release ref ${JSON.stringify(ref)} and phase links never become script targets (S22)`, async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: trackerPayload(ref) }));
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.chip').first().click();
    await expect(page.locator('.modal-link').first()).toBeVisible({ timeout: 5000 });
    const all = await hrefs(page);
    const scripted = all.filter((a) => a.href && !['http:', 'https:'].includes(a.protocol));
    expect(scripted, 'no anchor targets a non-http(s) scheme').toEqual([]);
    const linked = all.filter((a) => a.text.startsWith('link-') || a.text.startsWith('↗link-'))
      .filter((a) => a.href).map((a) => a.href);
    expect(linked.sort()).toEqual([...ALLOWED].sort());
    expect(await fired(page)).toBeUndefined();
  });
}

test('U4 control: an https release ref stays a link', async ({ page }) => {
  controller = await serveConsoleServerUI();
  await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: trackerPayload('https://github.com/o/r/releases/tag/v1.0.0') }));
  await page.goto(`${controller.url}/console/tracker`);
  await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 10000 });
  const refs = (await hrefs(page)).filter((a) => a.text.includes('record')).map((a) => a.href);
  expect(refs.length).toBeGreaterThan(0);
  for (const h of refs) expect(h).toBe('https://github.com/o/r/releases/tag/v1.0.0');
});
