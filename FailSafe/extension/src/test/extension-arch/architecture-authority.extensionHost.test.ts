// #531 slice 2 (plan-531b LD10): architecture authority in the real extension host.
//
// Runs only in the `architecture-index` vscode-test configuration, whose workspace is a fresh temp
// git repository seeded with docs/architecture/RUNTIME.md and one commit. Activates FailSafe, then
// writes an index by hand (two canonical `runtime` rows, a superseded row with no successor, a
// canonical row whose file is absent) plus an untracked document an agent wrote. The architecture
// routes are mounted on a test-side app with the real modal confirmer over vscode.window (answering
// only the supersession title), a real SOA ledger from the test kit and a recording L3 queue.
//
// The suites of this configuration share one workspace and run in either order, so this suite puts
// the repository back as it found it: the index (deleted, or its original bytes) and the files it wrote.

import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as vscode from 'vscode';
import { createOperatorConfirmer } from '../../extension/operatorConfirmation';
import { setupArchitectureIndexRoutes, type ArchitectureIndexRouteDeps } from '../../roadmap/routes/ArchitectureIndexRoute';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';
import { makeEnv, openLedger, type Env } from '../qorelogic/ledgerTestKit';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';

const SUPERSEDE_TITLE = 'Propose this architecture supersession?';
const INDEX = 'docs/ARCHITECTURE_INDEX.md';
const NOTES = 'docs/architecture/RUNTIME_NOTES.md';
const WRITTEN = ['docs/architecture/RUNTIME_B.md', 'docs/architecture/LEGACY.md', NOTES];
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const row = (id: string, domain: string, link: string, status: string): string =>
  `| ${id} | ${domain} | ${link} | ${status} | manual | - | - | - | unknown | unknown | manual |`;
const TEXT = ['# Architecture Index', '', '## Registry', '', HEADER, '|---|---|---|---|---|---|---|---|---|---|---|',
  row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical'),
  row('runtime', 'runtime', '[Runtime](architecture/RUNTIME.md)', 'canonical'),
  row('runtime-b', 'Runtime', '[Runtime B](architecture/RUNTIME_B.md)', 'canonical'),
  row('legacy', 'legacy runtime', '[Legacy](architecture/LEGACY.md)', 'superseded'),
  row('gone', 'gone', '[Gone](architecture/GONE.md)', 'canonical'),
  '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
  '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');
const lineOf = (needle: string): number => TEXT.split('\n').findIndex((l) => l.includes(needle)) + 1;
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

function git(root: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

suite('#531 slice 2 architecture authority (extension host, temp git workspace)', () => {
  const original = vscode.window.showWarningMessage;
  const dialogs: string[] = [];
  let answer: 'approve' | 'decline' = 'decline';
  let root = '';
  let indexBefore: Buffer | null = null;
  let env: Env | null = null;
  let ledger: LedgerManager | null = null;
  let harness: RouteHarness | null = null;
  const queue: Array<Record<string, unknown>> = [];

  const proposals = async (): Promise<number> => (await ledger!.getEntriesByType('PROPOSAL' as never, -1)).length;
  const post = (body: Record<string, unknown>) => harness!.request({ method: 'POST', path: '/api/actions/architecture-index/propose', body });

  suiteSetup(async function () {
    this.timeout(120000);
    root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    assert.ok(root && fs.existsSync(path.join(root, '.git')), `workspace ${root} is the temp git repository`);
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
    const target = path.join(root, ...INDEX.split('/'));
    indexBefore = fs.existsSync(target) ? fs.readFileSync(target) : null;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, TEXT);
    for (const rel of WRITTEN) fs.writeFileSync(path.join(root, ...rel.split('/')), `# ${rel}\n`);
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = async (message: string, ...rest: unknown[]) => {
      dialogs.push(message);
      if (message !== SUPERSEDE_TITLE || answer !== 'approve') return undefined;
      return rest.filter((x): x is string => typeof x === 'string')[0];
    };
    env = makeEnv();
    ledger = await openLedger(env);
    const app = makeApp();
    setupArchitectureIndexRoutes(app, {
      rejectIfRemote: () => false, workspaceRoot: root, getIndexPathSetting: () => undefined, getLedgerManager: () => ledger,
      queueL3Approval: async (r: Record<string, unknown>) => { queue.push({ ...r, id: `l3-${queue.length + 1}`, state: 'QUEUED' }); return `l3-${queue.length}`; },
      getL3Queue: () => queue.map((q) => ({ ...q })),
      openFileInEditor: async () => undefined,
      confirmOperatorAction: createOperatorConfirmer(vscode.window as never),
    } as unknown as ArchitectureIndexRouteDeps);
    harness = new RouteHarness(app);
    await harness.start();
  });

  suiteTeardown(async () => {
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = original;
    await harness?.stop();
    ledger?.close();
    env?.cleanup();
    const target = path.join(root, ...INDEX.split('/'));
    if (indexBefore) fs.writeFileSync(target, indexBefore); else fs.rmSync(target, { force: true });
    for (const rel of WRITTEN) fs.rmSync(path.join(root, ...rel.split('/')), { force: true });
  });

  test('GET lists each finding with its index line, the index hash and HEAD', async function () {
    this.timeout(60000);
    const res = await harness!.request({ path: '/api/v1/architecture/index' });
    assert.equal(res.status, 200);
    const a = res.body.authority;
    assert.equal(a.provenance.indexSha256, sha(TEXT));
    assert.equal(a.provenance.sourceSha, git(root, 'rev-parse', 'HEAD'));
    const by = (kind: string) => a.findings.filter((f: { kind: string }) => f.kind === kind);
    assert.deepEqual(by('conflicting-canonical')[0].rows.map((r: { id: string; line: number }) => [r.id, r.line]),
      [['runtime', lineOf('| runtime |')], ['runtime-b', lineOf('| runtime-b |')]]);
    assert.deepEqual(by('canonical-missing').map((f: { rows: Array<{ id: string; line: number }>; reason: string }) => [f.rows[0].id, f.rows[0].line, f.reason]),
      [['gone', lineOf('| gone |'), 'not-on-disk']]);
    assert.deepEqual(by('dangling-supersession').map((f: { reason: string; rows: Array<{ id: string }> }) => [f.reason, f.rows[0].id]), [['no-successor', 'legacy']]);
    assert.ok(by('unregistered-normative').some((f: { path: string }) => f.path === NOTES));
  });

  test('a competing canonical registration is refused with no dialog and no ledger entry', async function () {
    this.timeout(60000);
    const shown = dialogs.length;
    const res = await post({ path: NOTES, action: 'register', domain: 'runtime', status: 'canonical' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.conflict, 'canonical-exists');
    assert.deepEqual(res.body.existing.map((r: { id: string }) => r.id), ['runtime', 'runtime-b']);
    assert.equal(dialogs.length, shown);
    assert.equal(await proposals(), 0);
    assert.equal(queue.length, 0);
  });

  test('a declined supersession records nothing; an approved one is recorded with HEAD; a second one of the same rows is pending', async function () {
    this.timeout(60000);
    const body = { path: NOTES, action: 'register', domain: 'runtime', status: 'canonical', supersedes: ['runtime', 'runtime-b'] };
    answer = 'decline';
    const declined = await post(body);
    assert.equal(declined.status, 409, JSON.stringify(declined.body));
    assert.equal(declined.body.confirmation, 'declined');
    assert.equal(dialogs.filter((d) => d === SUPERSEDE_TITLE).length, 1);
    assert.equal(await proposals(), 0);
    answer = 'approve';
    const approved = await post(body);
    assert.equal(approved.status, 202, JSON.stringify(approved.body));
    assert.equal(dialogs.filter((d) => d === SUPERSEDE_TITLE).length, 2);
    const entry = await ledger!.getEntryById(approved.body.ledgerEntryId);
    assert.equal(entry?.eventType, 'PROPOSAL');
    assert.equal(entry?.payload.sourceSha, git(root, 'rev-parse', 'HEAD'));
    assert.equal(entry?.payload.indexSha256, sha(TEXT));
    assert.match(String(entry?.payload.operationId), /^op_/);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].kind, 'architecture-doc-supersede');
    const again = await post({ path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'runtime-b' });
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.conflict, 'pending-authority');
    assert.equal(dialogs.filter((d) => d === SUPERSEDE_TITLE).length, 2, 'no dialog for a pending refusal');
    assert.equal(fs.readFileSync(path.join(root, ...INDEX.split('/')), 'utf8'), TEXT, 'the index is never edited');
  });
});
