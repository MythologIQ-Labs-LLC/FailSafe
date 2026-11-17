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
  if (args[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (args[0] === 'status') return { code: 0, stdout: ' M .gitignore\\n', stderr: '' };
  if (args[0] === 'symbolic-ref') return { code: 0, stdout: REQ.branch, stderr: '' };
  if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}
const okPost: GitHubPostFn = async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/9', number: 9 }) });

suite('commitPushOpenPr #476 pre-egress branch/index identity', () => {
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
    assert.match(r.warning || '', /branch.*(mismatch|verify|select)/i);
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
