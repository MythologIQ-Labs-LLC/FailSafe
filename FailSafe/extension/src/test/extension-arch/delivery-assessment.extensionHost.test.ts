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

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as vscode from 'vscode';
import { ARCHITECTURE_BOOTSTRAP_TITLE } from '../../extension/operatorConfirmation';
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
      if (message !== ARCHITECTURE_BOOTSTRAP_TITLE) return undefined;
      return rest.filter((x): x is string => typeof x === 'string')[0];
    };
    const boot = await vscode.commands.executeCommand(BOOTSTRAP) as { status?: string };
    assert.ok(boot.status === 'created' || boot.status === 'reuse', JSON.stringify(boot));
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

  test('linked document and commit: incomplete with one gap, governance missing (the ledger is wired)', async function () {
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
    assert.deepEqual(view.assessment.gaps, ['governance']);
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
});
