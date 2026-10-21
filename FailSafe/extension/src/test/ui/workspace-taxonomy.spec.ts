// FX891 — Workspace › Taxonomy editor (operator taxonomy + agent mappings).
// Real Chromium (the design-reference gate for a user-facing surface): renders a
// row per program/vertical/agent, the add-handler mutates the DOM, and Save POSTs
// the edited config to /api/v1/tracker/config.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { serveConsoleServerUI, type ConsoleServerController } from './helpers/serveConsoleServerUI';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

let controller: ConsoleServerController;
const roots: string[] = [];
test.afterEach(async () => {
  await controller?.close();
  for (const r of roots.splice(0)) removeTempTree(r);
});

const CONFIG = {
  config: {
    programs: [{ key: 'ci', name: 'CI', accent: '#38d6c8' }, { key: 'rt', name: 'Runtime', accent: '#f0728f' }],
    verticals: [{ key: 'ci', name: 'CI', accent: '#38d6c8' }, { key: 'rt', name: 'Runtime', accent: '#f0728f' }],
    agents: [{ key: 'ci', name: 'CI', program: 'ci', vertical: 'ci', patterns: ['ci'] }],
  },
  source: 'config',
  lint: [],
};

async function gotoTaxonomy(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator('#workspace')).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="taxonomy"]').click();
  await expect(page.locator('#workspace .cc-tax')).toBeVisible({ timeout: 10000 });
}

test('FX891 — Taxonomy editor renders one row per program/vertical/agent', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route('**/api/v1/tracker/config', (r) => r.fulfill({ json: CONFIG }));
  await gotoTaxonomy(page, controller.url);
  await expect(page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-row')).toHaveCount(2);
  await expect(page.locator('#workspace .cc-tax-section[data-kind="verticals"] .cc-tax-row')).toHaveCount(2);
  await expect(page.locator('#workspace .cc-tax-section[data-kind="agents"] .cc-tax-row')).toHaveCount(1);
});

test('FX891 — "add" program mutates the DOM (handler is wired, not static markup)', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route('**/api/v1/tracker/config', (r) => r.fulfill({ json: CONFIG }));
  await gotoTaxonomy(page, controller.url);
  await page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-add').click();
  await expect(page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-row')).toHaveCount(3);
});

test('FX891 — editing a program name + Save POSTs the updated config', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  let posted: { programs?: Array<{ key: string; name: string }> } | null = null;
  await page.route('**/api/v1/tracker/config', (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true, written: ['docs/roadmap/tracker-config.yaml', '.failsafe/governance/tracker-taxonomy.directive.md'] } });
    }
    return r.fulfill({ json: CONFIG });
  });
  await gotoTaxonomy(page, controller.url);
  const nameInput = page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-row').first().locator('[data-field="name"]');
  await nameInput.fill('CI/CD Renamed');
  await page.locator('#workspace .cc-tax-save').click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted!.programs!.find((p) => p.key === 'ci')!.name).toBe('CI/CD Renamed');
});

// #548 (T8) — Save keeps the fields the editor does not show, and the Console drift
// block reports where the declared functionality differs from the real sub-views.
const FULL = {
  config: {
    programs: [{ key: 'governance', name: 'Governance', accent: '#7aa2f7' }],
    verticals: [{ key: 'governance', name: 'Governance', accent: '#7aa2f7', summary: 'Audit & compliance',
      functionality: ['**Audit Log** stream', '**Risks** register'], backend: ['`EnforcementEngine`'] }],
    agents: [{ key: 'gov', name: 'Gov', program: 'governance', vertical: 'governance', patterns: ['gov'], evidence: ['PR #1'] }],
  },
  source: 'config',
  lint: [],
  drift: {
    applies: true, matched: 7, consoleVerticals: 7, drifted: 1, unmatched: [],
    verticals: [{ key: 'governance', name: 'Governance', declared: true, missing: ['Shadow Genome'], extra: [], outOfOrder: false }],
  },
};

test('#548 — Save keeps vertical functionality, summary and agent evidence', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  let posted: typeof FULL.config | null = null;
  await page.route('**/api/v1/tracker/config', (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true, written: ['docs/roadmap/tracker-config.yaml'] } });
    }
    return r.fulfill({ json: FULL });
  });
  await gotoTaxonomy(page, controller.url);
  await page.locator('#workspace .cc-tax-section[data-kind="verticals"] .cc-tax-row').first().locator('[data-field="name"]').fill('Governance 2');
  await page.locator('#workspace .cc-tax-save').click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted!.verticals[0]).toEqual({ ...FULL.config.verticals[0], name: 'Governance 2' });
  expect(posted!.agents[0].evidence).toEqual(['PR #1']);
});

test('#548 — the drift block names a missing Console sub-view', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route('**/api/v1/tracker/config', (r) => r.fulfill({ json: FULL }));
  await gotoTaxonomy(page, controller.url);
  const block = page.locator('#workspace .cc-tax-drift');
  await expect(block).toHaveAttribute('data-state', 'drift');
  await expect(block.locator('[data-drift-key="governance"]')).toContainText('missing: Shadow Genome');
});

test('#548 — unmocked: the real route reports drift and never rewrites the file', async ({ page }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-548-taxonomy-'));
  roots.push(root);
  const cfg = path.join(root, 'docs', 'roadmap', 'tracker-config.yaml');
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  const text = [
    '# operator file',
    'verticals:',
    ...['monitor', 'learn', 'agents', 'workspace'].flatMap((k) => [`  - key: ${k}`, '    functionality: []']),
    '  - key: governance',
    '    functionality:',
    '      - "**Audit Log** stream"',
    '      - "**Risks** register"',
    '      - "**Compliance** status"',
    '',
  ].join('\n');
  fs.writeFileSync(cfg, text, 'utf-8');
  controller = await serveConsoleServerUI({ workspaceRoot: root });
  await gotoTaxonomy(page, controller.url);
  const block = page.locator('#workspace .cc-tax-drift');
  await expect(block).toHaveAttribute('data-state', 'drift');
  await expect(block.locator('[data-drift-key="governance"]')).toContainText('missing: Shadow Genome');
  await expect(block).toContainText('docs/roadmap/tracker-config.yaml');
  expect(fs.readFileSync(cfg, 'utf-8')).toBe(text);
});

// B331 (P1) — an unsaved edit survives a hub refresh, a sub-view switch and a top-level
// tab switch in real Chromium, and Save then posts it.
test('B331 — an unsaved edit survives hub.refresh and navigation; Save posts it', async ({ page }) => {
  controller = await serveConsoleServerUI({ initialHub: { version: 'test', bootstrapState: {} } as never });
  let posted: typeof FULL.config | null = null;
  await page.route('**/api/v1/tracker/config', (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true, written: ['docs/roadmap/tracker-config.yaml'], fingerprint: 'f'.repeat(64) } });
    }
    return r.fulfill({ json: { ...FULL, fingerprint: 'e'.repeat(64) } });
  });
  await gotoTaxonomy(page, controller.url);
  const name = () => page.locator('#workspace .cc-tax-section[data-kind="verticals"] .cc-tax-row').first().locator('[data-field="name"]');
  await name().fill('Governance (unsaved)');
  const hub = page.waitForResponse((res) => res.url().includes('/api/hub'));
  controller.broadcast({ type: 'hub.refresh' });
  await hub;
  await expect(name()).toHaveValue('Governance (unsaved)');
  await page.locator('#workspace .cc-pill[data-key="tracker"]').click();
  await page.locator('#workspace .cc-pill[data-key="taxonomy"]').click();
  await expect(page.locator('#workspace .cc-tax')).toBeVisible({ timeout: 10000 });
  await expect(name()).toHaveValue('Governance (unsaved)');
  await page.locator('.tab-btn[data-target="governance"]').click();
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await page.locator('#workspace .cc-pill[data-key="taxonomy"]').click();
  await expect(name()).toHaveValue('Governance (unsaved)');
  await page.locator('#workspace .cc-tax-save').click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted!.verticals[0].name).toBe('Governance (unsaved)');
});
