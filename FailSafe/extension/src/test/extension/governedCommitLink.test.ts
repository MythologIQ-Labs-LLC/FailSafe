// #532 (plan-532c LD7, B286): the governed commit offers a `committed-under` link for the commit it
// made, on a real temp git repository with a real IntentService and the shared delivery functions.
//
// The commit is made by runGovernedCommitFlow with the production git runner (no origin, so the
// ladder stops at `committed`). Approved -> one LINKED entry whose provenance names the commit, its
// tree and branch, `via: governed-commit` and the action; the dialog shows those values and the
// commit's file counts. Declined, busy and unwired append nothing. No active intent, an unbound
// commit (including a foreign parent made between the pre-HEAD read and the commit), a commit
// outside HEAD's 50 most recent and an already-linked commit never open the dialog. After HEAD
// moves on, the edge still names FailSafe's commit.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { defaultGitRunner, type GitRunner } from '../../extension/governedCommit';
import { runGovernedCommitFlow, type GovernedFlowDeps } from '../../extension/governedCommitFlow';
import { governedCommitLinker, offerCommittedUnderLink } from '../../extension/governedCommitLink';
import { DELIVERY_LINK_TITLES, type OperatorActionRequest, type OperatorConfirmation } from '../../extension/operatorConfirmation';
import type { IntentService } from '../../governance/IntentService';
import type { DeliveryContext } from '../../governance/delivery/deliveryService';
import {
  commitAll, deliveryWorkspace, git, importedIntent, intentService, type DeliveryWorkspace,
} from '../governance/delivery/deliveryFixtures';

interface Run { sha: string | undefined; warning: string | undefined; step: string }

suite('#532 governed commit link (B286)', () => {
  let ws: DeliveryWorkspace;
  let service: IntentService;
  let ctx: DeliveryContext;

  setup(() => {
    ws = deliveryWorkspace('failsafe-governed-link-');
    // The production runner honours repository config: give the temp repo an identity, no signing and no hooks.
    const hooks = path.join(ws.root, '.failsafe', 'no-hooks');
    fs.mkdirSync(hooks, { recursive: true });
    git(ws.root, 'config', 'user.name', 'FailSafe-Test');
    git(ws.root, 'config', 'user.email', 'test@failsafe.invalid');
    git(ws.root, 'config', 'commit.gpgsign', 'false');
    git(ws.root, 'config', 'core.hooksPath', hooks);
    service = intentService(ws.root);
    ctx = { workspaceRoot: ws.root, intents: service, ledger: null };
  });
  teardown(() => ws.cleanup());

  const historyLines = (): string[] => {
    const f = path.join(ws.root, '.failsafe', 'manifest', 'intent_history.jsonl');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : [];
  };
  function confirmer(result: OperatorConfirmation) {
    const shown: OperatorActionRequest[] = [];
    return { shown, confirm: async (r: OperatorActionRequest) => { shown.push(r); return result; } };
  }

  /** A governed commit of `docs/new.md` through the production runner (optionally wrapped). */
  async function governedCommit(wrap?: (inner: GitRunner) => GitRunner, linkCommit?: GovernedFlowDeps["linkCommit"]): Promise<Run> {
    fs.writeFileSync(path.join(ws.root, 'docs', 'new.md'), '# New\n');
    const deps: GovernedFlowDeps = {
      workspaceRoot: ws.root, git: wrap ? wrap(defaultGitRunner) : defaultGitRunner, confirm: async () => true,
      recordDeclined: async () => {}, now: () => '2026-10-19T12:00:00.000Z', linkCommit,
    };
    const r = await runGovernedCommitFlow('organize', ['docs/new.md'], ['Add docs/new.md'], deps) as
      { step: string; commitSha?: string; warning?: string };
    return { sha: r.commitSha, warning: r.warning, step: r.step };
  }

  const offer = (sha: string | undefined, confirm: ReturnType<typeof confirmer>['confirm'] | undefined, paths = ['docs/new.md']) =>
    offerCommittedUnderLink(ctx, confirm, { commitSha: sha, action: 'organize', requestedPaths: paths });

  test('approved: one LINKED entry naming the commit, tree, branch, via governed-commit and the action; the dialog shows them', async () => {
    const intent = await importedIntent(service);
    const run = await governedCommit();
    assert.equal(run.step, 'committed', JSON.stringify(run));
    assert.equal(run.sha, git(ws.root, 'rev-parse', 'HEAD'));
    const c = confirmer('approved');
    const out = await offer(run.sha, c.confirm);
    assert.equal(out.outcome, 'linked', out.detail);
    const lines = historyLines().map((l) => JSON.parse(l));
    const linked = lines.filter((e) => e.event === 'LINKED');
    assert.equal(linked.length, 1);
    const p = linked[0].details.provenance;
    assert.equal(linked[0].details.edge, 'committed-under');
    assert.equal(linked[0].details.target, run.sha);
    assert.equal(p.sha, run.sha);
    assert.equal(p.tree, git(ws.root, 'rev-parse', `${run.sha}^{tree}`));
    assert.equal(p.branch, 'fix/organize-20261019120000');
    assert.equal(p.via, 'governed-commit');
    assert.equal(p.action, 'organize');
    assert.equal(p.intentSourceHash, lines[0].entryHash);
    assert.equal(linked[0].actor, 'user');
    assert.equal(c.shown.length, 1);
    assert.equal(c.shown[0].title, DELIVERY_LINK_TITLES['committed-under']);
    for (const want of [run.sha!, p.tree, 'fix/organize-20261019120000', 'Made by: FailSafe organize (governed commit)',
      'Files in this commit: 1; within the paths FailSafe staged: 1', intent.purpose]) {
      assert.ok(c.shown[0].detail.includes(want), `dialog shows ${want}:\n${c.shown[0].detail}`);
    }
    assert.doesNotMatch(c.shown[0].detail, /already staged/);
  });

  test('a file staged before the run is included in the commit and the dialog says so', async () => {
    await importedIntent(service);
    fs.mkdirSync(path.join(ws.root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(ws.root, 'notes', 'extra.txt'), 'staged earlier\n');
    git(ws.root, 'add', '--', 'notes/extra.txt');
    const run = await governedCommit();
    assert.ok(run.sha, JSON.stringify(run));
    const c = confirmer('approved');
    assert.equal((await offer(run.sha, c.confirm)).outcome, 'linked');
    assert.match(c.shown[0].detail, /Files in this commit: 2; within the paths FailSafe staged: 1/);
    assert.match(c.shown[0].detail, /1 file\(s\) outside those paths were already staged before FailSafe committed and are included/);
  });

  test('a directory path counts the files under it as staged by FailSafe', async () => {
    await importedIntent(service);
    const run = await governedCommit();
    const c = confirmer('approved');
    assert.equal((await offer(run.sha, c.confirm, ['docs/'])).outcome, 'linked');
    assert.match(c.shown[0].detail, /Files in this commit: 1; within the paths FailSafe staged: 1/);
  });

  test('declined, busy and unwired append nothing', async () => {
    await importedIntent(service);
    const run = await governedCommit();
    for (const result of ['declined', 'busy'] as const) {
      const before = historyLines().length;
      const c = confirmer(result);
      assert.equal((await offer(run.sha, c.confirm)).outcome, result);
      assert.equal(c.shown.length, 1);
      assert.equal(historyLines().length, before, `${result} appended nothing`);
    }
    const before = historyLines().length;
    assert.equal((await offer(run.sha, undefined)).outcome, 'unwired');
    assert.equal(historyLines().length, before);
  });

  test('no active intent: no dialog, nothing written', async () => {
    const run = await governedCommit();
    const c = confirmer('approved');
    assert.equal((await offer(run.sha, c.confirm)).outcome, 'no-active-intent');
    assert.equal(c.shown.length, 0);
    assert.deepEqual(historyLines(), []);
  });

  test('an unbound commit (no commitSha) never opens the dialog', async () => {
    await importedIntent(service);
    const c = confirmer('approved');
    assert.equal((await offer(undefined, c.confirm)).outcome, 'no-commit');
    assert.equal((await offer('abc1234', c.confirm)).outcome, 'no-commit');
    assert.equal(c.shown.length, 0);
  });

  test('foreign parent end to end: a commit made between the pre-HEAD read and the commit leaves commitSha unset, and the linker opens no dialog', async () => {
    await importedIntent(service);
    // After the pre-commit `rev-parse --verify --quiet HEAD` returns, another writer moves HEAD
    // with commit-tree + update-ref, leaving the index untouched.
    const wrap = (inner: GitRunner): GitRunner => async (args, cwd) => {
      const out = await inner(args, cwd);
      if (args.join(' ') === 'rev-parse --verify --quiet HEAD') {
        const tree = git(cwd, 'rev-parse', 'HEAD^{tree}');
        const r = spawnSync('git', ['-c', 'core.hooksPath=', 'commit-tree', tree, '-p', 'HEAD', '-m', 'foreign'],
          { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x.invalid', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x.invalid' } });
        assert.equal(r.status, 0, r.stderr);
        git(cwd, 'update-ref', 'HEAD', String(r.stdout).trim());
      }
      return out;
    };
    const c = confirmer('approved');
    const lines: string[] = [];
    const linker = governedCommitLinker({
      workspaceRoot: ws.root, getIntents: () => service, getLedger: () => null, confirm: c.confirm, log: (l) => lines.push(l),
    });
    const run = await governedCommit(wrap, linker);
    assert.equal(run.step, 'committed');
    assert.equal(run.sha, undefined, 'the commit is not bound to this run');
    assert.match(run.warning ?? '', /its parent is not the HEAD recorded before the commit/);
    assert.equal(c.shown.length, 0, 'no dialog');
    assert.deepEqual(lines, [], 'the flow never called the linker');
    assert.equal(historyLines().filter((l) => l.includes('"event":"LINKED"')).length, 0);
    assert.equal((await offer(run.sha, c.confirm)).outcome, 'no-commit');
    assert.equal(c.shown.length, 0);
  });

  test('the linker wired into the flow links the bound commit and logs one line per outcome', async () => {
    await importedIntent(service);
    const c = confirmer('approved');
    const lines: string[] = [];
    fs.writeFileSync(path.join(ws.root, 'docs', 'new.md'), '# New\n');
    const r = await runGovernedCommitFlow('organize', ['docs/new.md'], ['Add docs/new.md'], {
      workspaceRoot: ws.root, git: defaultGitRunner, confirm: async () => true, recordDeclined: async () => {},
      now: () => '2026-10-19T12:00:00.000Z',
      linkCommit: governedCommitLinker({
        workspaceRoot: ws.root, getIntents: () => service, getLedger: () => null, confirm: c.confirm, log: (l) => lines.push(l),
      }),
    }) as { commitSha?: string };
    assert.ok(r.commitSha);
    assert.equal(c.shown.length, 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /linked/);
    assert.equal(historyLines().filter((l) => l.includes('"event":"LINKED"')).length, 1);
  });

  test('a commit outside HEAD\'s 50 most recent and an already-linked commit are refused before any dialog', async () => {
    await importedIntent(service);
    const run = await governedCommit();
    const c = confirmer('approved');
    assert.equal((await offer(run.sha, c.confirm)).outcome, 'linked');
    assert.equal((await offer(run.sha, c.confirm)).outcome, 'refused', 'already linked');
    assert.equal(c.shown.length, 1);
    for (let i = 0; i < 51; i += 1) commitAll(ws.root, `later ${i}`);
    git(ws.root, 'reset', '-q', '--mixed', 'HEAD'); // keep the index clean
    const old = git(ws.root, 'rev-list', '--max-parents=0', 'HEAD');
    assert.equal((await offer(old, c.confirm)).outcome, 'refused');
    assert.equal(c.shown.length, 1, 'no dialog for a commit outside the recent list');
  });

  test('after HEAD moves on, the edge still names FailSafe\'s commit, not HEAD', async () => {
    await importedIntent(service);
    const run = await governedCommit();
    const later = commitAll(ws.root, 'someone else');
    assert.notEqual(later, run.sha);
    const c = confirmer('approved');
    assert.equal((await offer(run.sha, c.confirm)).outcome, 'linked');
    const linked = historyLines().map((l) => JSON.parse(l)).filter((e) => e.event === 'LINKED');
    assert.equal(linked[0].details.target, run.sha);
    assert.notEqual(linked[0].details.target, git(ws.root, 'rev-parse', 'HEAD'));
  });
});
