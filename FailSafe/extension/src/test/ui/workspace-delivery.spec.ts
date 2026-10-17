// #532 part B (plan-532b LD8/LD10) — Playwright coverage for the Workspace "Delivery" sub-view.
//
// Drives the REAL ConsoleServer (serveConsoleServerUI) against a temp `git init` workspace with a
// managed architecture index, a real IntentService holding an imported intent, and a ledger stub:
//   - Link architecture and Link commit each post exactly once; with a ledger entry naming the
//     intent the outcome is "evidence complete except receipt";
//   - a declined confirmer changes nothing: no history entry, the step stays missing.
// Design source: the Architecture sub-view (same card, chip and scope-line vocabulary).

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { IntentService } from '../../governance/IntentService';
import type { OperatorConfirmation } from '../../extension/operatorConfirmation';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const SCOPE_LINE = 'This assessment uses only the links you recorded here and evidence already in the FailSafe ledger. ' +
  'Nothing is inferred and nothing leaves this machine. Receipts are unavailable until the ledger repair (#467). ' +
  'Recorded means the evidence is present, not that it passed.';
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const INDEX = ['# Architecture Index', '', '## Registry', '', HEADER, '|---|---|---|---|---|---|---|---|---|---|---|',
  '| architecture-navigation | architecture navigation | [Architecture Index](ARCHITECTURE_INDEX.md) | canonical | manual | - | - | - | unknown | unknown | manual |',
  '| runtime | runtime | [Runtime](architecture/RUNTIME.md) | canonical | manual | - | - | - | unknown | unknown | manual |',
  '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
  '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');

function git(root: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

function workspace(): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-delivery-ui-')));
  git(root, 'init', '-q');
  fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), INDEX);
  fs.writeFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME.md'), '# Runtime\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.failsafe/\n');
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '-m', 'seed <architecture>');
  return root;
}

/** IntentService without the vscode-bound SessionManager (Playwright runs outside VS Code). */
async function importedIntent(root: string): Promise<{ service: IntentService; id: string }> {
  const service = new IntentService(root, { setActiveIntent: async () => undefined } as never);
  const intent = await service.createIntent({
    type: 'feature', purpose: 'PROJ-7 — Deliver the runtime', scope: { files: [], modules: [], riskGrade: 'L1' },
    metadata: { author: 'user', tags: ['jira'], externalRef: 'jira:PROJ-7' },
    provenance: { source: 'jira', key: 'PROJ-7', externalRef: 'jira:PROJ-7', contentSha256: 'c'.repeat(64), fetchedAt: '2026-10-17T00:00:00.000Z' },
  });
  return { service, id: intent.id };
}

function ledgerNaming(intentId: string): unknown {
  const entry = {
    id: 7, timestamp: '2026-10-17T00:00:00.000Z', eventType: 'PROVENANCE_RECORDED', agentDid: 'did:t', agentTrustAtAction: 0,
    gdprTrigger: false, payload: { intentId, agentType: 'test' }, entryHash: 'h'.repeat(64), prevHash: 'p', signature: 's',
  };
  return { isAvailable: () => true, findEntriesContaining: async (v: string) => (v === intentId ? [entry] : []) };
}

async function openDelivery(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await page.locator('#workspace .cc-pill[data-key="delivery"]').click();
  await expect(page.locator('#workspace .cc-dlv')).toBeVisible({ timeout: 10000 });
}

const history = (root: string): string =>
  fs.readFileSync(path.join(root, '.failsafe', 'manifest', 'intent_history.jsonl'), 'utf8');

test.describe('#532 Workspace › Delivery sub-view', () => {
  let controller: ConsoleServerController | undefined;
  const roots: string[] = [];

  test.afterEach(async () => {
    await controller?.close();
    controller = undefined;
    for (const r of roots.splice(0)) removeTempTree(r);
  });

  test('each Link posts once; a ledger entry naming the intent gives evidence complete except receipt', async ({ page }) => {
    const root = workspace();
    roots.push(root);
    const { service, id } = await importedIntent(root);
    const confirmed: string[] = [];
    controller = await serveConsoleServerUI({
      workspaceRoot: root, intentService: service, ledgerManager: ledgerNaming(id),
      operatorConfirmer: async (r) => { confirmed.push(r.title); return 'approved' as OperatorConfirmation; },
    });
    const posts: string[] = [];
    page.on('request', (req) => { if (req.method() === 'POST' && req.url().includes('/api/actions/delivery/')) posts.push(req.postData() ?? ''); });
    await openDelivery(page, controller.url);

    const view = page.locator('#workspace .cc-dlv');
    await expect(view.locator('.cc-dlv-scope')).toHaveText(SCOPE_LINE);
    await expect(view.locator('.cc-dlv-step[data-key="issue"]')).toHaveAttribute('data-status', 'recorded');
    await expect(view.locator('.cc-dlv-step[data-key="architecture"]')).toHaveAttribute('data-status', 'missing');
    await expect(view.locator('.cc-dlv-step[data-key="governance"]')).toHaveAttribute('data-status', 'recorded');
    await expect(view.locator('.cc-dlv-step[data-key="receipt"]')).toHaveAttribute('data-status', 'unavailable');

    await view.locator('.cc-dlv-arch-pick').selectOption('runtime');
    await view.locator('.cc-dlv-link-arch').click();
    await expect(view.locator('.cc-dlv-step[data-key="architecture"]')).toHaveAttribute('data-status', 'recorded');
    await page.locator('#workspace .cc-dlv-link-commit').click();
    await expect(page.locator('#workspace .cc-dlv-step[data-key="code"]')).toHaveAttribute('data-status', 'recorded');
    await expect(page.locator('#workspace .cc-dlv-overall')).toContainText('Evidence complete except receipt');
    expect(posts.map((p) => JSON.parse(p))).toEqual([
      { intentId: id, edge: 'implements', target: 'runtime' },
      { intentId: id, edge: 'committed-under', target: git(root, 'rev-parse', 'HEAD') },
    ]);
    expect(confirmed).toHaveLength(2);
    expect(history(root).match(/"event":"LINKED"/g)).toHaveLength(2);
    // The commit's changed files are listed for display (the root commit adds the index).
    await expect(page.locator('#workspace .cc-dlv-step[data-key="code"]')).toContainText('docs/ARCHITECTURE_INDEX.md');
  });

  test('a declined confirmer changes nothing', async ({ page }) => {
    const root = workspace();
    roots.push(root);
    const { service } = await importedIntent(root);
    controller = await serveConsoleServerUI({
      workspaceRoot: root, intentService: service, operatorConfirmer: async () => 'declined' as OperatorConfirmation,
    });
    await openDelivery(page, controller.url);
    const before = history(root);
    await page.locator('#workspace .cc-dlv-link-arch').click();
    await expect(page.locator('#workspace .cc-dlv-result')).toContainText('Not confirmed in VS Code');
    await expect(page.locator('#workspace .cc-dlv-step[data-key="architecture"]')).toHaveAttribute('data-status', 'missing');
    await expect(page.locator('#workspace .cc-dlv-step[data-key="governance"]')).toHaveAttribute('data-status', 'unavailable');
    expect(history(root)).toBe(before);
  });
});
