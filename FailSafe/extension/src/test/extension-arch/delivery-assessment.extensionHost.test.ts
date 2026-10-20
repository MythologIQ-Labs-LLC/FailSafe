// #532 part B (plan-532b LD7/LD10): the delivery assessment in the real extension host.
//
// Runs only in the `architecture-index` vscode-test configuration, whose workspace is a fresh temp
// git repository seeded with docs/architecture/RUNTIME.md and one commit. Activates FailSafe,
// bootstraps the architecture index (created, or reuse when the architecture-index suite ran
// first), creates an intent with tracker-style provenance from a test-side IntentService on the
// same root, links the RUNTIME.md row and, after a commit made with core.hooksPath cleared, HEAD,
// through the shared delivery functions, then runs failsafe.delivery.assessActiveIntent.
//
// No governance-evidence writer fires deterministically here (ProvenanceTracker reacts only to
// editor saves; this test writes with fs), so the expected outcome is `incomplete` with one gap,
// governance `missing` — not `unavailable`, because the live ledger is wired. A byte change to the
// document then gives `stale`, and an unlink gives `missing`.
//
// The two suites of this configuration share one workspace and run in either order, so when this
// suite created the index it puts the repository back as it found it (HEAD, the index file and the
// document bytes); after a reuse it leaves the other suite's index alone.
//
// plan-532c (G1-G3): a governed commit through runGovernedCommitFlow with the production git runner
// and governedCommitLinker over the real modal confirmer (the stubbed dialog answers only the
// committed-under title) links the commit it made; a test-side PASS shows as the intent decision
// with review still missing; a VETO makes review failing and the delivery failing. Teardown also
// returns to the original branch, deletes the governed branch and its file, and unsets hooksPath.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as vscode from 'vscode';
import { ARCHITECTURE_BOOTSTRAP_TITLE, DELIVERY_LINK_TITLES, createOperatorConfirmer } from '../../extension/operatorConfirmation';
import { defaultGitRunner } from '../../extension/governedCommit';
import { runGovernedCommitFlow } from '../../extension/governedCommitFlow';
import { governedCommitLinker } from '../../extension/governedCommitLink';
import { discoverArchitectureIndex } from '../../governance/architecture/ArchitectureIndexDiscovery';
import { IntentService } from '../../governance/IntentService';
import { SessionManager } from '../../governance/SessionManager';
import {
  prepareDeliveryEdge, writeDeliveryEdge, type DeliveryContext, type DeliveryView, type ReadyEdge,
} from '../../governance/delivery/deliveryService';

const BOOTSTRAP = 'failsafe.architecture.bootstrapIndex';
const ASSESS = 'failsafe.delivery.assessActiveIntent';
const DOC = 'docs/architecture/RUNTIME.md';
const INDEX = 'docs/ARCHITECTURE_INDEX.md';

function git(root: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

type Found = Extract<DeliveryView, { found: true }>;
const status = (view: Found, key: string): string | undefined => view.assessment.steps.find((s) => s.key === key)?.status;

suite('#532 delivery assessment (extension host, temp git workspace)', () => {
  const original = vscode.window.showWarningMessage;
  let root = '';
  let ctx: DeliveryContext;
  let intentId = '';
  let rowId = '';
  let createdIndex = false;
  let headBefore = '';
  let docBefore: Buffer | null = null;
  let branchBefore = '';
  let answerLink = false;
  const GOVERNED_BRANCH = 'fix/organize-20261019120000';
  const GOVERNED_FILE = 'notes/governed.txt';

  suiteSetup(async function () {
    this.timeout(120000);
    root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    assert.ok(root && fs.existsSync(path.join(root, '.git')), `workspace ${root} is the temp git repository`);
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
    const deadline = Date.now() + 60000;
    for (;;) {
      const commands = await vscode.commands.getCommands(true);
      if (commands.includes(BOOTSTRAP) && commands.includes(ASSESS)) break;
      if (Date.now() > deadline) throw new Error(`${ASSESS} was never registered`);
      await new Promise((r) => setTimeout(r, 250));
    }
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = async (message: string, ...rest: unknown[]) => {
      if (message !== ARCHITECTURE_BOOTSTRAP_TITLE && !(answerLink && message === DELIVERY_LINK_TITLES['committed-under'])) return undefined;
      return rest.filter((x): x is string => typeof x === 'string')[0];
    };
    headBefore = git(root, 'rev-parse', 'HEAD');
    branchBefore = git(root, 'symbolic-ref', '--short', 'HEAD');
    docBefore = fs.readFileSync(path.join(root, ...DOC.split('/')));
    const boot = await vscode.commands.executeCommand(BOOTSTRAP) as { status?: string };
    assert.ok(boot.status === 'created' || boot.status === 'reuse', JSON.stringify(boot));
    createdIndex = boot.status === 'created';
    const row = discoverArchitectureIndex({ workspaceRoot: root }).rows.find((r) => r.docPath === DOC);
    assert.ok(row, `the bootstrapped index registers ${DOC}`);
    rowId = row!.id;

    const service = new IntentService(root, new SessionManager(root));
    const intent = await service.createIntent({
      type: 'feature', purpose: 'PROJ-7 — Deliver the runtime', scope: { files: [], modules: [], riskGrade: 'L1' },
      metadata: { author: 'user', tags: ['jira'], externalRef: 'jira:PROJ-7' },
      provenance: { source: 'jira', key: 'PROJ-7', externalRef: 'jira:PROJ-7', contentSha256: 'c'.repeat(64), fetchedAt: new Date().toISOString() },
    });
    intentId = intent.id;
    ctx = { workspaceRoot: root, intents: service, ledger: null };
  });

  suiteTeardown(() => {
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = original;
    if (!root) return;
    if (docBefore) fs.writeFileSync(path.join(root, ...DOC.split('/')), docBefore);
    if (branchBefore && git(root, 'symbolic-ref', '--short', 'HEAD') !== branchBefore) git(root, 'checkout', '-q', branchBefore);
    if (headBefore) git(root, 'reset', '-q', '--mixed', headBefore);
    spawnSync('git', ['branch', '-D', GOVERNED_BRANCH], { cwd: root, windowsHide: true });
    spawnSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: root, windowsHide: true });
    fs.rmSync(path.join(root, ...GOVERNED_FILE.split('/')), { force: true });
    if (createdIndex) fs.rmSync(path.join(root, ...INDEX.split('/')), { force: true });
  });

  async function edge(action: 'link' | 'unlink', kind: 'implements' | 'committed-under', target: string): Promise<void> {
    const prepared = await prepareDeliveryEdge(ctx, action, { intentId, edge: kind, target });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(await writeDeliveryEdge(ctx, prepared as ReadyEdge, 'user'), { ok: true });
  }

  async function assess(): Promise<Found> {
    const view = await vscode.commands.executeCommand(ASSESS) as DeliveryView;
    assert.equal(view.integrity, 'valid', JSON.stringify(view));
    assert.equal((view as { found: boolean }).found, true, JSON.stringify(view));
    assert.equal((view as Found).intent.id, intentId, 'the command assesses the active intent');
    return view as Found;
  }

  test('linked document and commit: incomplete with the review and governance gaps, governance missing (the ledger is wired)', async function () {
    this.timeout(60000);
    await edge('link', 'implements', rowId);
    git(root, 'add', '--', INDEX);
    git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
      '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', 'add architecture index');
    await edge('link', 'committed-under', git(root, 'rev-parse', 'HEAD'));
    const view = await assess();
    assert.equal(status(view, 'issue'), 'recorded');
    assert.equal(status(view, 'architecture'), 'recorded');
    assert.equal(status(view, 'code'), 'recorded');
    assert.equal(status(view, 'governance'), 'missing', 'missing, not unavailable: the live ledger is wired');
    assert.equal(status(view, 'receipt'), 'unavailable');
    assert.equal(view.assessment.overall, 'incomplete');
    assert.equal(status(view, 'review'), 'missing', 'no review of the implementation is recorded (B320, B321)');
    assert.deepEqual(view.assessment.gaps, ['review', 'governance']);
  });

  test('a byte change to the linked document makes architecture stale', async function () {
    this.timeout(60000);
    fs.appendFileSync(path.join(root, ...DOC.split('/')), '\nOne more line.\n');
    const view = await assess();
    assert.equal(status(view, 'architecture'), 'stale');
  });

  test('an unlink makes architecture missing', async function () {
    this.timeout(60000);
    await edge('unlink', 'implements', rowId);
    const view = await assess();
    assert.equal(status(view, 'architecture'), 'missing');
  });

  test('G1: the governed commit links the commit it made after the modal confirmation', async function () {
    this.timeout(60000);
    const hooks = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-nohooks-'));
    git(root, 'config', 'core.hooksPath', hooks);
    git(root, 'config', 'user.name', 'FailSafe-Test');
    git(root, 'config', 'user.email', 'test@failsafe.invalid');
    git(root, 'config', 'commit.gpgsign', 'false');
    fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(root, ...GOVERNED_FILE.split('/')), 'governed\n');
    const lines: string[] = [];
    answerLink = true;
    let commitSha: string | undefined;
    try {
      const r = await runGovernedCommitFlow('organize', [GOVERNED_FILE], ['Add notes'], {
        workspaceRoot: root, git: defaultGitRunner, confirm: async () => true, recordDeclined: async () => undefined,
        now: () => '2026-10-19T12:00:00.000Z',
        linkCommit: governedCommitLinker({
          workspaceRoot: root, getIntents: () => ctx.intents, getLedger: () => null,
          confirm: createOperatorConfirmer(vscode.window), log: (l) => lines.push(l),
        }),
      }) as { step: string; commitSha?: string; warning?: string };
      assert.equal(r.step, 'committed', JSON.stringify(r));
      commitSha = r.commitSha;
    } finally {
      answerLink = false;
      fs.rmSync(hooks, { recursive: true, force: true });
    }
    assert.ok(commitSha, 'the commit is bound to this run');
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], /linked/);
    const view = await assess();
    const rec = view.assessment.steps.find((s) => s.key === 'code')!.records.find((x) => x.sha === commitSha);
    assert.ok(rec, 'the governed commit is a code record');
    assert.equal(rec!.via, 'governed-commit');
    assert.equal(rec!.action, 'organize');
  });

  test('G2: a test-side PASS is the intent decision, not a review: review stays missing, incomplete', async function () {
    this.timeout(60000);
    await (ctx.intents as IntentService).updateStatus('PASS', 'judge');
    const view = await assess();
    assert.equal(status(view, 'review'), 'missing');
    assert.equal(view.intent.decision?.status, 'PASS');
    assert.equal(view.assessment.overall, 'incomplete');
    assert.equal(view.assessment.completeReachable, false);
  });

  test('G3: a test-side VETO makes review failing and the delivery failing', async function () {
    this.timeout(60000);
    await (ctx.intents as IntentService).updateStatus('VETO', 'judge');
    const view = await assess();
    assert.equal(status(view, 'review'), 'failing');
    assert.equal(view.assessment.overall, 'failing');
  });
});
