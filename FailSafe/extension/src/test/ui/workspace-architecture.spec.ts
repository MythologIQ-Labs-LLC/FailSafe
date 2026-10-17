// #531 LD6/LD7 — Playwright coverage for the Workspace "Architecture" sub-view.
//
// Drives the REAL ConsoleServer (serveConsoleServerUI) against temp `git init` workspaces:
//   - an index with one registered document plus one unregistered duplicate an agent wrote:
//     the view lists the conflict and its suggestion, hides "Bootstrap index", shows the
//     fixed scope line, renders document strings as text, and "Propose registration" posts
//     exactly once (to a fake ledger and the harness's stub queueL3Approval);
//   - an absent index: "Bootstrap index" is shown and no proposal is offered.
// Design source: the Integrations Catalog renderer (same cards, pills and buttons).

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const SCOPE_LINE = 'FailSafe records the writes it makes here after your confirmation and never overwrites a file. ' +
  'Documents written by editors, agents or other tools are found when this view refreshes; FailSafe cannot block them.';
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';

function git(root: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function workspace(files: Record<string, string>): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-ui-')));
  git(root, 'init', '-q');
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', 'fixture');
  return root;
}

const INDEX = ['# Architecture Index', '', '## Registry', '', HEADER, '|---|---|---|---|---|---|---|---|---|---|---|',
  '| architecture-navigation | architecture navigation | [Architecture Index](ARCHITECTURE_INDEX.md) | canonical | manual | - | - | - | unknown | unknown | manual |',
  '| runtime | <b>runtime</b> | [Runtime](architecture/RUNTIME.md) | canonical | manual | - | - | - | unknown | unknown | manual |',
  '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
  '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');

function fakeLedger(entries: Array<Record<string, unknown>>): unknown {
  return {
    isAvailable: () => true,
    appendEntry: async (r: Record<string, unknown>) => { entries.push(r); return { id: 40 + entries.length, entryHash: 'h' }; },
  };
}

async function openArchitecture(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await page.locator('#workspace .cc-pill[data-key="architecture"]').click();
  await expect(page.locator('#workspace .cc-arch')).toBeVisible({ timeout: 10000 });
}

test.describe('#531 Workspace › Architecture sub-view', () => {
  let controller: ConsoleServerController | undefined;
  const roots: string[] = [];

  test.afterEach(async () => {
    await controller?.close();
    controller = undefined;
    for (const r of roots.splice(0)) removeTempTree(r);
  });

  test('present index with an unregistered duplicate: conflict, suggestion, scope line, no bootstrap, propose posts once', async ({ page }) => {
    const root = workspace({ 'docs/ARCHITECTURE_INDEX.md': INDEX, 'docs/architecture/RUNTIME.md': '# Runtime\n' });
    roots.push(root);
    // Written after the commit, never added: the "agent-created file" case.
    fs.writeFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME_COPY.md'), '# Runtime (copy)\n');
    const entries: Array<Record<string, unknown>> = [];
    const queued: Array<Record<string, unknown>> = [];
    controller = await serveConsoleServerUI({
      workspaceRoot: root,
      ledgerManager: fakeLedger(entries),
      queueL3Approval: async (r) => { queued.push(r); return 'l3-ui-1'; },
    });
    const proposals: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/api/actions/architecture-index/propose')) proposals.push(req.postData() ?? '');
    });
    await openArchitecture(page, controller.url);

    const view = page.locator('#workspace .cc-arch');
    await expect(view.locator('.cc-arch-state')).toHaveAttribute('data-state', 'present-with-problems');
    await expect(view.locator('.cc-arch-scope')).toHaveText(SCOPE_LINE);
    await expect(view.locator('.cc-arch-bootstrap')).toHaveCount(0);
    const card = view.locator('.cc-arch-candidate[data-path="docs/architecture/RUNTIME_COPY.md"]');
    await expect(card).toBeVisible();
    await expect(view.locator('.cc-arch-candidate')).toHaveCount(1);
    await expect(card.locator('.cc-arch-open').first()).toHaveText('Use existing: open docs/architecture/RUNTIME.md');
    await expect(view.locator('.cc-arch-problem .cc-arch-code')).toHaveText(['unregistered-normative']);
    // Document strings are text, never HTML: the domain cell `<b>runtime</b>` shows literally.
    await expect(view.locator('.cc-arch-rows').getByText('<b>runtime</b>', { exact: true })).toBeVisible();
    await expect(view.locator('.cc-arch-rows b')).toHaveCount(0);
    await expect(view.locator('.cc-arch-sub')).toContainText('Ledger available');

    await card.locator('.cc-arch-propose').click();
    await expect(view.locator('.cc-arch-result')).toContainText('Queued for L3 review (approval l3-ui-1, ledger entry #41)');
    expect(proposals).toHaveLength(1);
    expect(JSON.parse(proposals[0])).toEqual({ path: 'docs/architecture/RUNTIME_COPY.md', action: 'register' });
    expect(queued).toHaveLength(1);
    expect(queued[0].kind).toBe('architecture-doc-proposal');
    expect(queued[0].sourceLedgerEntryId).toBe(41);
    expect(entries).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), 'utf8')).toBe(INDEX);
  });

  test('absent index: Bootstrap index is shown, candidates are listed, and nothing can be proposed', async ({ page }) => {
    const root = workspace({ 'docs/architecture/RUNTIME.md': '# Runtime\n' });
    roots.push(root);
    controller = await serveConsoleServerUI({ workspaceRoot: root });
    await openArchitecture(page, controller.url);
    const view = page.locator('#workspace .cc-arch');
    await expect(view.locator('.cc-arch-state')).toHaveAttribute('data-state', 'absent');
    await expect(view.locator('.cc-arch-bootstrap')).toBeVisible();
    await expect(view.locator('.cc-arch-bootstrap')).toHaveText('Bootstrap index');
    await expect(view.locator('.cc-arch-candidate[data-path="docs/architecture/RUNTIME.md"]')).toBeVisible();
    await expect(view.locator('.cc-arch-propose')).toHaveCount(0);
    await expect(view.locator('.cc-arch-sub')).toContainText('Ledger unavailable');
    await expect(view.locator('.cc-arch-scope')).toHaveText(SCOPE_LINE);
    expect(fs.existsSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'))).toBe(false);
  });
});
