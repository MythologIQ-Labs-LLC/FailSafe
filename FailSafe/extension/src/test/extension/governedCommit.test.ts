// Per-feature tests for the governed commit→push→PR ladder (Organize/Initialize
// self-commit). Fully injected git runner + POST transport — no spawn / no network.

import { strict as assert } from 'assert';
import { commitPushOpenPr, redactUrlCredentials, type GitRunner, type GovernedCommitDeps } from '../../extension/governedCommit';
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

// #241 F-3: `git remote get-url` returns userinfo verbatim, so a credential-embedded
// origin reaches both the `remoteUrl` result field and the push-failure warning that
// bootstrapServers.ts surfaces via showInformationMessage. The placeholder below is a
// fake stand-in for an operator's real token.
suite('commitPushOpenPr — credential redaction (#241 F-3)', () => {
  const CRED = 'https://someuser:NOTAREALPW@github.com/o/r.git'; // EXAMPLE_SECRET: fake fixture credential, never real
  const withRemote = (stdout: string, extra: (a: string[]) => Partial<GitResp> | undefined = () => undefined) =>
    gitWith((a) => (a[0] === 'remote' ? { stdout } : extra(a)));

  test('credentialed origin → remoteUrl in the result is redacted', async () => {
    const r = await commitPushOpenPr(REQ, { git: withRemote(CRED) });
    assert.equal(r.remoteUrl, 'https://***@github.com/o/r.git');
  });

  test('push stderr echoing a credentialed url → warning is redacted', async () => {
    const r = await commitPushOpenPr(REQ, {
      git: withRemote(CRED, (a) =>
        a[0] === 'push' ? { code: 1, stderr: `fatal: Authentication failed for '${CRED}/'` } : undefined),
    });
    assert.equal(r.step, 'committed');
    assert.ok(!(r.warning || '').includes('NOTAREALPW'), `warning leaked the credential: ${r.warning}`);
    assert.match(r.warning || '', /push failed: fatal: Authentication failed for 'https:\/\/\*\*\*@github\.com\/o\/r\.git\/'/);
  });

  test('redaction leaves the slug-derived compare url and PR creation intact', async () => {
    const r = await commitPushOpenPr(REQ, { git: withRemote(CRED), post: okPost, token: 'tok' });
    assert.equal(r.step, 'pr');
    assert.equal(r.prUrl, 'https://github.com/o/r/pull/9');
    assert.equal(r.compareUrl, 'https://github.com/o/r/compare/main...fix/organize-123');
  });

  test('ssh remotes are untouched — `git@` is a username, not a secret', async () => {
    const r = await commitPushOpenPr(REQ, { git: withRemote('git@github.com:o/r.git') });
    assert.equal(r.remoteUrl, 'git@github.com:o/r.git');
  });

  test('token-as-username origin (no colon) is redacted too', async () => {
    const r = await commitPushOpenPr(REQ, { git: withRemote('https://NOTAREALPW@github.com/o/r.git') });
    assert.equal(r.remoteUrl, 'https://***@github.com/o/r.git');
  });
});

suite('redactUrlCredentials', () => {
  test('redacts every credentialed http(s) url in a multi-line blob', () => {
    const out = redactUrlCredentials(
      "remote: rejected\nfatal: could not read 'https://u:NOTAREALPW@github.com/o/r.git'\nhint: retry http://t@example.com/x", // EXAMPLE_SECRET: fake fixture credential, never real
    );
    assert.ok(!out.includes('NOTAREALPW'));
    assert.match(out, /https:\/\/\*\*\*@github\.com\/o\/r\.git/);
    assert.match(out, /http:\/\/\*\*\*@example\.com\/x/);
  });

  test('leaves urls without userinfo untouched, including @ inside a path', () => {
    for (const url of ['https://github.com/o/r.git', 'https://registry.example/@scope/pkg', 'git@github.com:o/r.git', 'ssh://git@github.com/o/r.git']) {
      assert.equal(redactUrlCredentials(url), url);
    }
  });

  test('#349 — a raw @ inside the password redacts to the LAST @ (no tail leak)', () => {
    // curl/git parse userinfo to the last @, so `p@ss` genuinely authenticates;
    // the first-@ regex left `ss@host` exposed.
    const out = redactUrlCredentials('push failed: https://u:p@ss@github.com/o/r.git rejected');
    assert.equal(out, 'push failed: https://***@github.com/o/r.git rejected');
    assert.ok(!out.includes('p@ss') && !out.includes('ss@'), `tail must not survive; got '${out}'`);
  });

  test('#349 — a previously partial redaction collapses correctly', () => {
    assert.equal(redactUrlCredentials('https://***@ss@github.com/o/r.git'), 'https://***@github.com/o/r.git');
  });

  test('is idempotent — re-redacting an already-redacted url is stable', () => {
    const once = redactUrlCredentials('https://u:NOTAREALPW@github.com/o/r.git'); // EXAMPLE_SECRET: fake fixture credential, never real
    assert.equal(redactUrlCredentials(once), once);
  });
});
