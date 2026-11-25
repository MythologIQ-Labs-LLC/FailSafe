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
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { commitPushOpenPr, defaultGitRunner, type GitRunner } from '../../extension/governedCommit';
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

  for (const injectionPhase of ['pre-existing', 'checkout', 'post-add'] as const) {
    test(`#715: ignored staged gitlink at ${injectionPhase} cannot escape the index guard`, async () => {
      // Real Git repro: .gitmodules ignore=all makes a staged 160000 entry
      // invisible to git diff --cached unless --ignore-submodules=none is set.
      const gitModules = '[submodule "sub"]\n\tpath = sub\n\turl = ./disconnected\n\tignore = all\n';
      fs.writeFileSync(path.join(ws.root, '.gitmodules'), gitModules);
      const originalHead = git(ws.root, 'rev-parse', 'HEAD');
      const stageGitlink = () => {
        git(ws.root, 'update-index', '--add', '--cacheinfo', `160000,${originalHead},sub`);
      };
      if (injectionPhase === 'pre-existing') stageGitlink();
      const check = (withOverride: boolean, outsideSelection = false) => spawnSync(
        'git',
        ['diff', '--cached', '--quiet', '--exit-code',
          ...(withOverride ? ['--ignore-submodules=none'] : []), '--',
          ...(outsideSelection ? [':(top)', ':(exclude,top,literal)docs/new.md'] : [])],
        { cwd: ws.root, encoding: 'utf8' },
      ).status;
      if (injectionPhase === 'pre-existing') {
        assert.equal(check(false), 0, 'fixture must reproduce ignored staged gitlink');
        assert.equal(check(true), 1, 'explicit override must detect the gitlink');
      }

      let injected = 0;
      const wrap = injectionPhase === 'pre-existing' ? undefined : (inner: GitRunner): GitRunner =>
        async (args, cwd) => {
          const result = await inner(args, cwd);
          if (result.code === 0 && injected === 0 &&
              (injectionPhase === 'checkout' ? args[0] === 'checkout' && args[1] === '-b'
                : args[0] === 'add')) {
            stageGitlink();
            injected++;
          }
          return result;
        };
      const run = await governedCommit(wrap);
      assert.equal(run.step, 'noop', JSON.stringify(run));
      assert.equal(run.sha, undefined, 'an ignored foreign gitlink may never become a bound commit');
      assert.match(run.warning || '', injectionPhase === 'pre-existing'
        ? /pre-existing staged/i
        : injectionPhase === 'checkout'
          ? /staged changes appeared during checkout/i
          : /staged changes outside selected paths/i);
      if (injectionPhase !== 'pre-existing') {
        assert.equal(injected, 1, 'fixture must inject the gitlink at the intended Git seam');
      }
      assert.match(git(ws.root, 'ls-files', '--stage', '--', 'sub'),
        /^160000 [a-f0-9]{40} 0\tsub/m,
        'the refused gitlink remains inspectable in the index');
      assert.equal(git(ws.root, 'rev-parse', 'HEAD'), originalHead,
        'no unauthorized commit may be created');
      // After git add, the operator-approved file is legitimately staged;
      // exclude it to measure ONLY the attacker-supplied gitlink.
      const outsideSelection = injectionPhase === 'post-add';
      assert.equal(check(false, outsideSelection), 0,
        'ignore=all still conceals the foreign gitlink outside approved scope');
      assert.equal(check(true, outsideSelection), 1,
        'fail-closed override detects the foreign gitlink');
    });
  }

  test('#715: pre-staged unrelated content refuses automated commit and remains staged', async () => {
    await importedIntent(service);
    fs.mkdirSync(path.join(ws.root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(ws.root, 'notes', 'extra.txt'), 'staged earlier\n');
    git(ws.root, 'add', '--', 'notes/extra.txt');
    const before = git(ws.root, 'diff', '--cached', '--name-status');
    const head = git(ws.root, 'rev-parse', 'HEAD');
    const run = await governedCommit();
    assert.equal(run.step, 'noop');
    assert.equal(run.sha, undefined);
    assert.match(run.warning || '', /pre-existing staged/i);
    assert.equal(git(ws.root, 'rev-parse', 'HEAD'), head);
    assert.equal(git(ws.root, 'diff', '--cached', '--name-status'), before);
    assert.equal(git(ws.root, 'branch', '--list', 'fix/organize-20261019120000'), '');
    assert.equal(historyLines().filter(line => line.includes('"LINKED"')).length, 0);
  });

  test('#715: a partially staged selected file is preserved and refuses auto-commit', async () => {
    fs.writeFileSync(path.join(ws.root, 'docs', 'new.md'), '# Staged version\n');
    git(ws.root, 'add', '--', 'docs/new.md');
    fs.writeFileSync(path.join(ws.root, 'docs', 'new.md'), '# Unstaged newer version\n');
    const staged = git(ws.root, 'show', ':docs/new.md');
    const head = git(ws.root, 'rev-parse', 'HEAD');
    const run = await governedCommit();
    assert.equal(run.step, 'noop');
    assert.equal(run.sha, undefined);
    assert.match(run.warning || '', /pre-existing staged/i);
    assert.equal(git(ws.root, 'show', ':docs/new.md'), staged);
    assert.equal(git(ws.root, 'rev-parse', 'HEAD'), head);
  });

  for (const mode of ['staged deletion', 'staged rename'] as const) {
    test(`#715: ${mode} in unrelated paths refuses without disturbing the index`, async () => {
      if (mode === 'staged deletion') {
        fs.rmSync(path.join(ws.root, 'docs', 'architecture', 'RUNTIME.md'));
        git(ws.root, 'add', '-u', '--', 'docs/architecture/RUNTIME.md');
      } else {
        git(ws.root, 'mv', 'docs/architecture/RUNTIME.md', 'docs/architecture/RUNTIME-renamed.md');
      }
      const before = git(ws.root, 'diff', '--cached', '--name-status');
      const head = git(ws.root, 'rev-parse', 'HEAD');
      const run = await governedCommit();
      assert.equal(run.step, 'noop');
      assert.equal(run.sha, undefined);
      assert.match(run.warning || '', /pre-existing staged/i);
      assert.equal(git(ws.root, 'diff', '--cached', '--name-status'), before);
      assert.equal(git(ws.root, 'rev-parse', 'HEAD'), head);
    });
  }

  test('#715: unexpected staging after selected git add cannot be committed or published', async () => {
    const before = git(ws.root, 'rev-parse', 'HEAD');
    fs.mkdirSync(path.join(ws.root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(ws.root, 'notes', 'unexpected.txt'), 'unselected private work\n');
    let injected = 0;
    const result = await governedCommit((inner) => async (args, cwd) => {
      const response = await inner(args, cwd);
      if (args[0] === 'add' && response.code === 0) {
        git(cwd, 'add', '--', 'notes/unexpected.txt');
        injected++;
      }
      return response;
    });
    assert.equal(injected, 1, 'the unexpected index mutation occurred after add');
    assert.equal(result.step, 'noop', JSON.stringify(result));
    assert.equal(result.sha, undefined);
    assert.match(result.warning || '', /staged changes outside selected paths/i);
    assert.equal(git(ws.root, 'rev-parse', 'HEAD'), before, 'no unauthorized commit');
    assert.match(git(ws.root, 'diff', '--cached', '--name-only'), /notes\/unexpected\.txt/, 'index is preserved for operator review');
  });

  test('#715: nested workspace with only requested file staged succeeds, not a false-positive off-scope refusal', async () => {
    const before = git(ws.root, 'rev-parse', 'HEAD');
    const nested = path.join(ws.root, 'docs');
    fs.writeFileSync(path.join(nested, 'nested-allowed.md'), '# Selected content\n');
    const calls: string[][] = [];
    const r = await commitPushOpenPr({
      workspaceRoot: nested, paths: ['nested-allowed.md'],
      branch: 'fix/nested-workspace-allowed', message: 'test selected only',
      base: 'main', prTitle: 'test', prBody: '',
    }, {
      git: async (args, cwd) => { calls.push(args); return defaultGitRunner(args, cwd); },
    });
    assert.equal(r.step, 'committed', JSON.stringify(r));
    assert.ok(r.commitSha, 'the local commit must be source-bound');
    assert.notEqual(git(ws.root, 'rev-parse', 'HEAD'), before);
    assert.equal(git(ws.root, 'show', '--format=', '--name-only', 'HEAD'), 'docs/nested-allowed.md');
    assert.ok(calls.some(args => args.join(' ') === 'rev-parse --show-prefix'),
      'the scope guard must resolve the subdirectory relative to the repository root');
    assert.equal(git(ws.root, 'diff', '--cached', '--name-only'), '');
  });

  test('#715: post-add guard checks entire repository when workspace is a nested directory', async () => {
    const before = git(ws.root, 'rev-parse', 'HEAD');
    const nested = path.join(ws.root, 'docs');
    fs.writeFileSync(path.join(nested, 'nested-new.md'), '# Requested change\n');
    fs.mkdirSync(path.join(ws.root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(ws.root, 'notes', 'outside.txt'), 'unrelated root work\n');
    const calls: string[][] = [];
    const result = await commitPushOpenPr({
      workspaceRoot: nested, paths: ['nested-new.md'],
      branch: 'fix/nested-workspace-index', message: 'test nested staging',
      base: 'main', prTitle: 'test', prBody: '',
    }, {
      git: async (args, cwd) => {
        calls.push(args);
        const reply = await defaultGitRunner(args, cwd);
        if (args[0] === 'add' && reply.code === 0) {
          git(ws.root, 'add', '--', 'notes/outside.txt');
        }
        return reply;
      },
    });
    assert.equal(result.step, 'noop', JSON.stringify(result));
    assert.match(result.warning || '', /staged changes outside selected paths/i);
    assert.ok(calls.some(args => args[0] === 'diff' && args.includes(':(top)')),
      'scope check must include staged files outside nested cwd');
    assert.equal(calls.filter(args => ['commit', 'push', 'remote'].includes(args[0])).length, 0);
    assert.equal(git(ws.root, 'rev-parse', 'HEAD'), before);
    assert.match(git(ws.root, 'diff', '--cached', '--name-only'), /notes\/outside\.txt/);
  });

  test('#715: clean index on an unborn branch still permits a bound root commit', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-index-unborn-'));
    try {
      git(root, 'init', '-q');
      git(root, 'config', 'user.name', 'FailSafe-Test');
      git(root, 'config', 'user.email', 'test@failsafe.invalid');
      git(root, 'config', 'commit.gpgsign', 'false');
      const hooks = path.join(root, 'disabled-hooks');
      fs.mkdirSync(hooks);
      git(root, 'config', 'core.hooksPath', hooks);
      fs.writeFileSync(path.join(root, 'first.md'), '# Initial\n');
      const r = await runGovernedCommitFlow('organize', ['first.md'], ['Add first.md'], {
        workspaceRoot: root, git: defaultGitRunner, confirm: async () => true,
        recordDeclined: async () => {}, now: () => '2026-10-19T12:00:00.000Z',
      });
      assert.equal(r.step, 'committed', JSON.stringify(r));
      assert.equal('commitSha' in r ? r.commitSha : undefined, git(root, 'rev-parse', 'HEAD'));
      assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
      assert.equal(git(root, 'show', '--pretty=format:', '--name-only', 'HEAD'), 'first.md');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  for (const selected of ['.', 'docs/..']) {
    test(`#715: Git-normalized root selection '${selected}' refuses before any staging`, async () => {
      const before = git(ws.root, 'rev-parse', 'HEAD');
      fs.writeFileSync(path.join(ws.root, 'private.txt'), 'unrelated private work\n');
      const r = await commitPushOpenPr({
        workspaceRoot: ws.root, paths: [selected], branch: 'fix/unsafe-root-selector',
        message: 'test root selection', base: 'main', prTitle: 'test', prBody: '',
      }, { git: defaultGitRunner });
      assert.equal(r.step, 'noop', JSON.stringify(r));
      assert.match(r.warning || '', /invalid selected paths/i);
      assert.equal(git(ws.root, 'rev-parse', 'HEAD'), before);
      assert.equal(git(ws.root, 'branch', '--list', 'fix/unsafe-root-selector'), '');
      assert.equal(git(ws.root, 'diff', '--cached', '--name-only'), '');
      assert.equal(git(ws.root, 'status', '--porcelain', '--', 'private.txt'), '?? private.txt');
    });
  }

  test('#715: Git pathspec magic must not expand a selected literal filename into unrelated files', async () => {
    const previous = git(ws.root, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(ws.root, 'private.txt'), 'unrelated private work\n');
    const r = await commitPushOpenPr({
      workspaceRoot: ws.root, paths: [':(glob)**'],
      branch: 'fix/untrusted-pathspec', message: 'test', base: 'main',
      prTitle: 'test', prBody: '',
    }, { git: defaultGitRunner });
    assert.equal(r.step, 'noop', JSON.stringify(r));
    assert.equal(git(ws.root, 'rev-parse', 'HEAD'), previous);
    assert.equal(git(ws.root, 'branch', '--list', 'fix/untrusted-pathspec'), '');
    assert.equal(git(ws.root, 'diff', '--cached', '--name-only'), '');
    assert.equal(git(ws.root, 'status', '--porcelain', '--', 'private.txt'), '?? private.txt');
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
