// Per-feature tests for the governed commit→push→PR ladder (Organize/Initialize
// self-commit). Fully injected git runner + POST transport — no spawn / no network.

import { strict as assert } from 'assert';
import { commitPushOpenPr, type GitRunner, type GovernedCommitDeps } from '../../extension/governedCommit';
import type { GitHubPostFn } from '../../integrations/github-checks/github-checks-client';

type GitResp = { code: number; stdout: string; stderr: string };

function defaultFor(args: string[]): GitResp {
  if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
  if (args[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (args[0] === 'status') return { code: 0, stdout: ' M .gitignore\n', stderr: '' };
  if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}
function gitWith(handler: (args: string[]) => Partial<GitResp> | undefined = () => undefined): GitRunner {
  return async (args) => ({ ...defaultFor(args), ...(handler(args) || {}) });
}

const okPost: GitHubPostFn = async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/9', number: 9 }) });
const REQ = {
  workspaceRoot: '/ws', paths: ['.gitignore', '.editorconfig', 'prs.json'],
  branch: 'fix/organize-123', message: 'chore(organize): apply 3 changes', base: 'main',
  prTitle: 'Organize', prBody: 'applied changes',
};

suite('commitPushOpenPr — governed Organize ladder', () => {
  test('full path → step "pr" with the PR url', async () => {
    const deps: GovernedCommitDeps = { git: gitWith(), post: okPost, token: 'tok' };
    const r = await commitPushOpenPr(REQ, deps);
    assert.equal(r.step, 'pr');
    assert.equal(r.prUrl, 'https://github.com/o/r/pull/9');
    assert.equal(r.commit, 'abc1234');
  });

  test('not a git repo → step "not-a-repo", no writes', async () => {
    const r = await commitPushOpenPr(REQ, { git: gitWith((a) => a.includes('--is-inside-work-tree') ? { stdout: 'false' } : undefined) });
    assert.equal(r.step, 'not-a-repo');
  });

  test('nothing staged among paths → step "noop"', async () => {
    const r = await commitPushOpenPr(REQ, { git: gitWith((a) => a[0] === 'status' ? { stdout: '' } : undefined) });
    assert.equal(r.step, 'noop');
  });

  test('no token → step "pushed" + compare url (floor)', async () => {
    const r = await commitPushOpenPr(REQ, { git: gitWith() }); // no post/token
    assert.equal(r.step, 'pushed');
    assert.equal(r.compareUrl, 'https://github.com/o/r/compare/main...fix/organize-123');
    assert.match(r.warning || '', /open the PR manually/);
  });

  test('no origin remote → step "committed" locally only', async () => {
    const r = await commitPushOpenPr(REQ, { git: gitWith((a) => a[0] === 'remote' ? { code: 1, stdout: '' } : undefined), post: okPost, token: 'tok' });
    assert.equal(r.step, 'committed');
    assert.match(r.warning || '', /no .origin. remote/);
  });

  test('push fails → step "committed" with the push error', async () => {
    const r = await commitPushOpenPr(REQ, { git: gitWith((a) => a[0] === 'push' ? { code: 1, stderr: 'denied' } : undefined), post: okPost, token: 'tok' });
    assert.equal(r.step, 'committed');
    assert.match(r.warning || '', /push failed: denied/);
  });

  test('PR rejected (422) → step "pushed" + compare url, never throws', async () => {
    const post422: GitHubPostFn = async () => ({ status: 422, body: '{}' });
    const r = await commitPushOpenPr(REQ, { git: gitWith(), post: post422, token: 'tok' });
    assert.equal(r.step, 'pushed');
    assert.equal(r.compareUrl, 'https://github.com/o/r/compare/main...fix/organize-123');
  });

  test('stages exactly the named paths (add -A -- <paths>)', async () => {
    const calls: string[][] = [];
    const git: GitRunner = async (args) => { calls.push(args); return defaultFor(args); };
    await commitPushOpenPr(REQ, { git, post: okPost, token: 'tok' });
    const add = calls.find((c) => c[0] === 'add');
    assert.deepEqual(add, ['add', '-A', '--', '.gitignore', '.editorconfig', 'prs.json']);
  });
});
