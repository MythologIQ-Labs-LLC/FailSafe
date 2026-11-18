// Fail-closed branch/index guards for the operator-confirmed governed commit flow (#476).
// All Git and HTTP boundaries are injected; no actual push or network.
import { strict as assert } from 'assert';
import { commitPushOpenPr, type GitRunner } from '../../extension/governedCommit';
import type { GitHubPostFn } from '../../integrations/github-checks/github-checks-client';

type GitResp = { code: number; stdout: string; stderr: string };
const REQ = {
  workspaceRoot: '/ws', paths: ['.gitignore', '.editorconfig', 'prs.json'],
  branch: 'fix/organize-123', message: 'chore(organize): apply 3 changes', base: 'main',
  prTitle: 'Organize', prBody: 'applied changes',
};
function defaultFor(args: string[]): GitResp {
  if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
  const bindingOp = args.join(' ');
  if (bindingOp === 'rev-parse --verify --quiet HEAD') return { code: 0, stdout: 'a'.repeat(40), stderr: '' };
  if (bindingOp === 'rev-parse --verify HEAD') return { code: 0, stdout: 'b'.repeat(40), stderr: '' };
  if (bindingOp.startsWith('rev-parse --verify --quiet refs/heads/')) return { code: 0, stdout: 'b'.repeat(40), stderr: '' };
  if (bindingOp === 'write-tree') return { code: 0, stdout: '7'.repeat(40), stderr: '' };
  if (args[0] === 'log') return { code: 0, stdout: '7'.repeat(40) + '\0' + 'a'.repeat(40) + '\0' + REQ.message + '\n', stderr: '' };
  if (args[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (args[0] === 'status') return { code: 0, stdout: ' M .gitignore\\n', stderr: '' };
  if (args[0] === 'symbolic-ref') return { code: 0, stdout: REQ.branch, stderr: '' };
  if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}
const okPost: GitHubPostFn = async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/9', number: 9 }) });

suite('commitPushOpenPr #476 pre-egress branch/index identity', () => {
  for (const [label, paths] of [
    ['empty path set', []],
    ['blank filename', ['']],
    ['NUL in filename', ['docs/unsafe\\u0000name']],
  ] as const) {
    test(`#715 ${label} refuses before any status, checkout, add, commit, push or PR`, async () => {
      const calls: string[][] = [];
      let posts = 0;
      const result = await commitPushOpenPr({ ...REQ, paths: [...paths] }, {
        git: async (args) => { calls.push(args); return defaultFor(args); },
        token: 'fixture-token', post: async () => { posts++; return { status: 201, body: '{}' }; },
      });
      assert.equal(result.step, 'noop');
      assert.match(result.warning ?? '', /invalid selected paths/i);
      assert.equal(posts, 0);
      assert.equal(calls.filter(x => ['status', 'checkout', 'add', 'commit', 'push', 'remote'].includes(x[0])).length, 0);
    });
  }

  test('failed git status refuses before branch selection, staging or external egress', async () => {
    const calls: string[][] = [];
    let posts = 0;
    const git: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'status') return { code: 1, stdout: '', stderr: 'repository status unavailable' };
      return defaultFor(args);
    };
    const result = await commitPushOpenPr(REQ, {
      git, token: 'fixture-token',
      post: async () => { posts++; return { status: 201, body: '{}' }; },
    });
    assert.equal(result.step, 'noop');
    assert.match(result.warning || '', /git status failed/i);
    assert.equal(posts, 0);
    assert.equal(calls.filter(a => ['checkout', 'add', 'commit', 'push', 'remote'].includes(a[0])).length, 0);
  });

  for (const [label, exit, warning] of [
    ['unrelated index entries already staged', 1, /pre-existing staged changes/i],
    ['unreadable staged index', 128, /staged index could not be verified/i],
  ] as const) {
    test(`#715 ${label}: no branch switch, stage, commit, push or PR`, async () => {
      const calls: string[][] = [];
      let posts = 0;
      const git: GitRunner = async (args) => {
        calls.push(args);
        if (args[0] === 'diff' && args.includes('--cached')) return { code: exit, stdout: '', stderr: '' };
        return defaultFor(args);
      };
      const r = await commitPushOpenPr(REQ, {
        git, token: 'synthetic', post: async () => { posts++; return { status: 201, body: '{}' }; },
      });
      assert.equal(r.step, 'noop');
      assert.match(r.warning || '', warning);
      assert.equal(posts, 0);
      assert.equal(calls.filter(x => ['checkout', 'add', 'commit', 'push', 'remote'].includes(x[0])).length, 0);
    });
  }

  test('#715: checkout hook stages content: second index gate refuses before git add/commit/egress', async () => {
    const calls: string[][] = [];
    let scans = 0;
    let posts = 0;
    const git: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'diff' && args.includes('--cached')) {
        scans++;
        return { code: scans === 2 ? 1 : 0, stdout: '', stderr: '' };
      }
      return defaultFor(args);
    };
    const r = await commitPushOpenPr(REQ, {
      git, token: 'synthetic', post: async () => { posts++; return { status: 201, body: '{}' }; },
    });
    assert.equal(r.step, 'noop');
    assert.match(r.warning || '', /staged changes appeared during checkout/i);
    assert.equal(scans, 2);
    assert.ok(calls.some(x => x[0] === 'checkout'));
    assert.equal(calls.filter(x => ['add', 'commit', 'push', 'remote'].includes(x[0])).length, 0);
    assert.equal(posts, 0);
  });

    test('both branch checkout attempts fail: no staging, commit, push or authenticated PR', async () => {
    const calls: string[][] = [];
    let posts = 0;
    const git: GitRunner = async (args) => {
      calls.push(args);
      return args[0] === 'checkout'
        ? { code: 1, stdout: '', stderr: 'branch cannot be selected' }
        : defaultFor(args);
    };
    const r = await commitPushOpenPr(REQ, {
      git, token: 'fixture-token',
      post: async () => { posts += 1; return { status: 201, body: '{}' }; },
    });
    assert.equal(r.step, 'noop');
    assert.match(r.warning || '', /branch.*(select|checkout|verify)/i);
    assert.equal(posts, 0);
    assert.equal(calls.filter((a) => ['add', 'commit', 'push', 'remote'].includes(a[0])).length, 0);
  });

  test('successful checkout reporting the wrong active branch refuses all writes', async () => {
    const calls: string[][] = [];
    const git: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'symbolic-ref') return { code: 0, stdout: 'main', stderr: '' };
      return defaultFor(args);
    };
    const r = await commitPushOpenPr(REQ, { git, token: 'fixture-token', post: okPost });
    assert.equal(r.step, 'noop');
    assert.match(r.warning || '', /branch.*verif/i);
    assert.equal(calls.filter((a) => ['add', 'commit', 'push', 'remote'].includes(a[0])).length, 0);
  });

  test('failed git add must not commit unrelated index state or publish', async () => {
    const calls: string[][] = [];
    let posts = 0;
    const git: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'add') return { code: 1, stdout: '', stderr: 'staging denied' };
      return defaultFor(args);
    };
    const r = await commitPushOpenPr(REQ, {
      git, token: 'fixture-token',
      post: async () => { posts += 1; return { status: 201, body: '{}' }; },
    });
    assert.equal(r.step, 'noop');
    assert.match(r.warning || '', /stag/i);
    assert.equal(posts, 0);
    assert.equal(calls.filter((a) => ['commit', 'push', 'remote'].includes(a[0])).length, 0);
  });

  test('existing target branch fallback remains usable when identity is verified', async () => {
    const calls: string[][] = [];
    const git: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'checkout' && args[1] === '-b') return { code: 1, stdout: '', stderr: 'exists' };
      return defaultFor(args);
    };
    const r = await commitPushOpenPr(REQ, { git, token: 'fixture-token', post: okPost });
    assert.equal(r.step, 'pr');
    assert.ok(calls.some((a) => a[0] === 'checkout' && a[1] === REQ.branch));
    assert.ok(calls.some((a) => a[0] === 'symbolic-ref'));
  });
});
