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

// #532 (plan-532c LD7a, B286): the commit is bound to this run before it may be offered for
// linking. commitSha is set only when the commit's parent is the HEAD read before the commit (none
// when unborn), its tree is the index tree FailSafe staged (`write-tree`), its message is the one
// FailSafe wrote (`--cleanup=verbatim` keeps it exact, plus the newline git appends), and it is the
// tip of the branch. Otherwise commitSha stays unset and the warning names the failed check.
suite('commitPushOpenPr — commit binding (#532 B286)', () => {
  const PRE = 'a'.repeat(40);
  const TREE = '7'.repeat(40);
  const NEW = 'b'.repeat(40);
  const MSG = REQ.message;
  interface Script { pre?: GitResp; tree?: string; sha?: string; log?: string; tip?: string }
  function bindGit(s: Script = {}, calls: string[][] = []): GitRunner {
    return async (args) => {
      calls.push(args);
      const j = args.join(' ');
      if (j === 'rev-parse --verify --quiet HEAD') return s.pre ?? { code: 0, stdout: `${PRE}\n`, stderr: '' };
      if (j === 'write-tree') return { code: 0, stdout: `${s.tree ?? TREE}\n`, stderr: '' };
      if (j === 'rev-parse --verify HEAD') return { code: 0, stdout: `${s.sha ?? NEW}\n`, stderr: '' };
      if (args[0] === 'log') return { code: 0, stdout: s.log ?? `${TREE}\0${PRE}\0${MSG}\n`, stderr: '' };
      if (j === `rev-parse --verify --quiet refs/heads/${REQ.branch}`) return { code: 0, stdout: `${s.tip ?? NEW}\n`, stderr: '' };
      if (args[0] === 'remote') return { code: 1, stdout: '', stderr: '' };
      return defaultFor(args);
    };
  }

  test('bound: parent, tree, message and branch tip match -> commitSha is the full name', async () => {
    const calls: string[][] = [];
    const r = await commitPushOpenPr(REQ, { git: bindGit({}, calls) });
    assert.equal(r.step, 'committed');
    assert.equal(r.commitSha, NEW);
    assert.doesNotMatch(r.warning ?? '', /not bound/);
    assert.deepEqual(calls.find((c) => c[0] === 'commit'), ['commit', '--cleanup=verbatim', '-m', MSG], 'the message is stored verbatim');
    const order = calls.map((c) => c.join(' '));
    assert.ok(order.indexOf('rev-parse --verify --quiet HEAD') < order.findIndex((c) => c.startsWith('commit ')), 'pre-HEAD read before the commit');
    assert.ok(order.indexOf('write-tree') < order.findIndex((c) => c.startsWith('commit ')), 'index tree read before the commit');
  });

  test('a foreign parent (another commit landed after the pre-HEAD read) leaves commitSha unset; the warning names the parent check', async () => {
    const r = await commitPushOpenPr(REQ, { git: bindGit({ log: `${TREE}\0${'c'.repeat(40)}\0${MSG}\n` }) });
    assert.equal(r.step, 'committed');
    assert.equal(r.commitSha, undefined);
    assert.match(r.warning ?? '', /not bound to this run \(its parent is not the HEAD recorded before the commit\)/);
  });

  test('a changed tree or message leaves commitSha unset and names hooks and trailers', async () => {
    for (const log of [`${'8'.repeat(40)}\0${PRE}\0${MSG}\n`, `${TREE}\0${PRE}\0${MSG}\n\nSigned-off-by: x <x@example.invalid>\n`]) {
      const r = await commitPushOpenPr(REQ, { git: bindGit({ log }) });
      assert.equal(r.commitSha, undefined, JSON.stringify(log));
      assert.match(r.warning ?? '', /a commit hook or a configured trailer changed the commit/);
    }
  });

  test('a branch tip that is not the commit, and a non-full name, leave commitSha unset', async () => {
    const tip = await commitPushOpenPr(REQ, { git: bindGit({ tip: 'd'.repeat(40) }) });
    assert.equal(tip.commitSha, undefined);
    assert.match(tip.warning ?? '', /not the tip of fix\/organize-123/);
    const short = await commitPushOpenPr(REQ, { git: bindGit({ sha: 'abc1234' }) });
    assert.equal(short.commitSha, undefined);
    assert.match(short.warning ?? '', /not a full commit name/);
  });

  test('an unborn pre-HEAD binds a root commit (no parents) and refuses a commit that has a parent', async () => {
    const unborn = { code: 1, stdout: '', stderr: '' };
    const root = await commitPushOpenPr(REQ, { git: bindGit({ pre: unborn, log: `${TREE}\0\0${MSG}\n` }) });
    assert.equal(root.commitSha, NEW);
    const parented = await commitPushOpenPr(REQ, { git: bindGit({ pre: unborn }) });
    assert.equal(parented.commitSha, undefined);
    assert.match(parented.warning ?? '', /parent/);
  });

  test('a pre-HEAD git cannot read leaves commitSha unset', async () => {
    const r = await commitPushOpenPr(REQ, { git: bindGit({ pre: { code: 128, stdout: '', stderr: 'fatal' } }) });
    assert.equal(r.step, 'committed');
    assert.equal(r.commitSha, undefined);
    assert.match(r.warning ?? '', /not bound/);
  });
});
