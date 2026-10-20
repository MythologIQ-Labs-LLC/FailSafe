// Tests for the operator-confirmed Organize/Initialize commit flow.

import { strict as assert } from 'assert';
import { runGovernedCommitFlow, type GovernedFlowDeps } from '../../extension/governedCommitFlow';
import type { GitRunner } from '../../extension/governedCommit';

function defaultFor(args: string[]): { code: number; stdout: string; stderr: string } {
  if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
  if (args[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (args[0] === 'status') return { code: 0, stdout: ' M .gitignore\n', stderr: '' };
  if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}
const git: GitRunner = async (args) => defaultFor(args);

function baseDeps(over: Partial<GovernedFlowDeps>): GovernedFlowDeps {
  return {
    workspaceRoot: '/ws', git, confirm: async () => true, recordDeclined: async () => {},
    now: () => '2026-06-10T12:00:00.000Z', ...over,
  };
}

suite('runGovernedCommitFlow', () => {
  test('no changes → noop, never prompts', async () => {
    let prompted = false;
    const r = await runGovernedCommitFlow('organize', [], [], baseDeps({ confirm: async () => { prompted = true; return true; } }));
    assert.deepEqual(r, { step: 'noop' });
    assert.equal(prompted, false);
  });

  test('declined → records to the ledger, no commit', async () => {
    const recorded: unknown[] = [];
    let committed = false;
    const r = await runGovernedCommitFlow(
      'organize', ['.gitignore'], ['Add 1 governance pattern to .gitignore'],
      baseDeps({
        confirm: async () => false,
        recordDeclined: async (info) => { recorded.push(info); },
        git: async (a) => { if (a[0] === 'commit') committed = true; return defaultFor(a); },
      }),
    );
    assert.deepEqual(r, { step: 'declined' });
    assert.equal(committed, false);
    assert.deepEqual(recorded, [{ action: 'organize', changes: ['Add 1 governance pattern to .gitignore'], at: '2026-06-10T12:00:00.000Z' }]);
  });

  test('approved + token → drives the ladder to a PR; branch is timestamp-stamped', async () => {
    const calls: string[][] = [];
    const r = await runGovernedCommitFlow(
      'organize', ['.gitignore', '.editorconfig'], ['Create .editorconfig', 'Add patterns'],
      baseDeps({
        git: async (a) => { calls.push(a); return defaultFor(a); },
        post: async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/3' }) }),
        token: 'tok',
      }),
    );
    assert.equal((r as { step: string }).step, 'pr');
    const checkout = calls.find((c) => c[0] === 'checkout' && c[1] === '-b');
    assert.equal(checkout?.[2], 'fix/organize-20260610120000');
  });
});

// #532 (plan-532c LD7b, B286): linkCommit is offered the bound commit once after committed, pushed
// or pr, never otherwise, and a throwing linkCommit never changes the commit result.
suite('runGovernedCommitFlow — linkCommit (#532 B286)', () => {
  const PRE = 'a'.repeat(40);
  const TREE = '7'.repeat(40);
  const NEW = 'b'.repeat(40);
  const message = 'chore(organize): apply 1 workspace change(s)\n\n- Add patterns';
  function bound(over: (a: string[]) => { code: number; stdout: string; stderr: string } | undefined = () => undefined): GitRunner {
    return async (a) => {
      const hit = over(a);
      if (hit) return hit;
      const j = a.join(' ');
      if (j === 'rev-parse --verify --quiet HEAD') return { code: 0, stdout: PRE, stderr: '' };
      if (j === 'write-tree') return { code: 0, stdout: TREE, stderr: '' };
      if (j === 'rev-parse --verify HEAD') return { code: 0, stdout: NEW, stderr: '' };
      if (a[0] === 'log') return { code: 0, stdout: `${TREE}\0${PRE}\0${message}\n`, stderr: '' };
      if (a[0] === 'rev-parse' && a.some((x) => x.startsWith('refs/heads/'))) return { code: 0, stdout: NEW, stderr: '' };
      return defaultFor(a);
    };
  }
  const run = (deps: Partial<GovernedFlowDeps>) =>
    runGovernedCommitFlow('organize', ['.gitignore'], ['Add patterns'], baseDeps(deps));

  test('committed, pushed and pr each call linkCommit once with the bound commit and the run', async () => {
    const cases: Array<[string, Partial<GovernedFlowDeps>, GitRunner]> = [
      ['committed', {}, bound((a) => (a[0] === 'remote' ? { code: 1, stdout: '', stderr: '' } : undefined))],
      ['pushed', {}, bound()],
      ['pr', { post: async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/3' }) }), token: 'tok' }, bound()],
    ];
    for (const [step, extra, g] of cases) {
      const seen: Array<{ sha: string; action: string; paths: string[] }> = [];
      const r = await run({ ...extra, git: g, linkCommit: async (res, info) => { seen.push({ sha: res.commitSha, ...info }); } });
      assert.equal((r as { step: string }).step, step);
      assert.deepEqual(seen, [{ sha: NEW, action: 'organize', paths: ['.gitignore'] }], step);
    }
  });

  test('never called on declined, noop, not-a-repo, a failed commit or an unbound commit', async () => {
    let calls = 0;
    const linkCommit = async () => { calls += 1; };
    await run({ confirm: async () => false, git: bound(), linkCommit });
    await runGovernedCommitFlow('organize', [], [], baseDeps({ git: bound(), linkCommit }));
    await run({ git: bound((a) => (a.includes('--is-inside-work-tree') ? { code: 0, stdout: 'false', stderr: '' } : undefined)), linkCommit });
    await run({ git: bound((a) => (a[0] === 'commit' ? { code: 1, stdout: '', stderr: 'nothing' } : undefined)), linkCommit });
    const foreign = await run({ git: bound((a) => (a[0] === 'log' ? { code: 0, stdout: `${TREE}\0${'c'.repeat(40)}\0${message}\n`, stderr: '' } : undefined)), linkCommit });
    assert.equal((foreign as { commitSha?: string }).commitSha, undefined);
    assert.equal(calls, 0);
  });

  test('a throwing linkCommit leaves the result unchanged', async () => {
    const r = await run({ git: bound(), linkCommit: async () => { throw new Error('boom'); } });
    assert.equal((r as { step: string }).step, 'pushed');
    assert.equal((r as { commitSha?: string }).commitSha, NEW);
  });
});
