// #476 / GRB: effective Git push destination must be bound on ALL paths.
// Injected GitRunner and GitHub POST. No network, credentials or real pushes.
import { strict as assert } from 'assert';
import { commitPushOpenPr, type GitRunner } from '../../extension/governedCommit';
import { runGovernedCommitFlow } from '../../extension/governedCommitFlow';
import { inspectPushBinding } from '../../extension/githubPushBinding';

const FETCH = 'https://github.com/acme/repo.git';
const SSH_PUSH = 'git@github.com:acme/repo.git';
const BAD = 'https://attacker.invalid/acme/repo.git';
const GHES = 'https://ghe.example/acme/repo.git';
const BRANCH = 'fix/organize-20260610120000';
const REQUEST = {
  workspaceRoot: '/ws', paths: ['file.txt'], branch: BRANCH,
  message: 'test', base: 'main', prTitle: 'test', prBody: '',
};
type GitReply = { code: number; stdout: string; stderr: string };
const reply = (stdout = '', code = 0): GitReply => ({ stdout, code, stderr: '' });

function mockGit(opts: { fetch?: string; pushes?: string[]; remoteFailure?: boolean } = {}) {
  const calls: string[][] = [];
  let reads = 0;
  const git: GitRunner = async (args) => {
    calls.push(args);
    if (args[0] === 'remote') {
      if (opts.remoteFailure) return reply('', 1);
      if (args.includes('--push')) {
        const values = opts.pushes || [opts.fetch || FETCH];
        return reply(values[Math.min(reads++, values.length - 1)]);
      }
      return reply(opts.fetch || FETCH);
    }
    if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return reply('true');
    if (args[0] === 'status') return reply(' M file.txt');
    if (args[0] === 'symbolic-ref') return reply(BRANCH);
    return reply('');
  };
  return { git, calls };
}
function count(calls: string[][], name: string) {
  return calls.filter(c => c[0] === name).length;
}

suite('#476 effective push-target binding (public GitHub + GHES)', () => {
  test('ordinary public GitHub resolves one approved effective destination', async () => {
    const m = mockGit();
    const bound = await inspectPushBinding(m.git, '/ws', FETCH);
    assert.equal(bound.ok, true);
    if (bound.ok) assert.equal(bound.pushUrl, FETCH);
    assert.ok(m.calls.some(a => a.join(' ') === 'remote get-url --push --all origin'));
  });

  test('public fetch target paired with hostile pushurl is rejected without token', async () => {
    const m = mockGit({ pushes: [BAD] });
    const r = await commitPushOpenPr(REQUEST, { git: m.git });
    assert.equal(r.step, 'committed');
    assert.match(r.warning || '', /push destination/i);
    assert.equal(count(m.calls, 'push'), 0);
  });

  test('public GitHub with PR token refuses hostile pushurl before push or POST', async () => {
    const m = mockGit({ pushes: [BAD] });
    let posts = 0;
    const r = await commitPushOpenPr(REQUEST, {
      git: m.git, token: 'fixture-token',
      post: async () => { posts++; return { status: 201, body: '{}' }; },
    });
    assert.equal(r.step, 'committed');
    assert.equal(count(m.calls, 'push'), 0);
    assert.equal(posts, 0);
  });

  test('multiple effective push destinations fail closed', async () => {
    const m = mockGit({ pushes: [FETCH + '\n' + FETCH] });
    const bound = await inspectPushBinding(m.git, '/ws', FETCH);
    assert.equal(bound.ok, false);
    const r = await commitPushOpenPr(REQUEST, { git: m.git });
    assert.equal(r.step, 'committed');
    assert.equal(count(m.calls, 'push'), 0);
  });

  test('an unapproved HTTPS to SSH rewrite of the same repo is refused by direct API', async () => {
    const m = mockGit({ pushes: [SSH_PUSH] });
    const r = await commitPushOpenPr(REQUEST, { git: m.git });
    assert.equal(r.step, 'committed');
    assert.equal(count(m.calls, 'push'), 0);
  });

  test('explicit operator-approved HTTPS fetch and SSH push to same repo work', async () => {
    const m = mockGit({ pushes: [SSH_PUSH] });
    const r = await commitPushOpenPr(REQUEST, {
      git: m.git, requireExactRemoteApproval: true,
      approvedRemoteUrl: FETCH, approvedPushUrl: SSH_PUSH,
    });
    assert.equal(r.step, 'pushed');
    assert.equal(count(m.calls, 'push'), 1);
  });

  test('normal public GitHub path with token publishes a PR after verified push', async () => {
    const m = mockGit();
    let posts = 0;
    const r = await commitPushOpenPr(REQUEST, {
      git: m.git, token: 'fixture-token',
      post: async () => {
        posts++;
        return { status: 201, body: '{"html_url":"https://github.com/acme/repo/pull/1"}' };
      },
    });
    assert.equal(r.step, 'pr');
    assert.equal(count(m.calls, 'push'), 1);
    assert.equal(posts, 1);
  });

  test('enterprise host remains allowed only with matching API and approved scope', async () => {
    const m = mockGit({ fetch: GHES, pushes: [GHES] });
    const r = await commitPushOpenPr(REQUEST, {
      git: m.git, apiBaseUrl: 'https://ghe.example/api/v3',
      requireExactRemoteApproval: true,
      approvedRemoteUrl: GHES, approvedPushUrl: GHES,
    });
    assert.equal(r.step, 'pushed');
    assert.equal(count(m.calls, 'push'), 1);
  });

  test('enterprise Git remote with default public API is rejected before push', async () => {
    const m = mockGit({ fetch: GHES, pushes: [GHES] });
    const r = await commitPushOpenPr(REQUEST, { git: m.git });
    assert.equal(r.step, 'committed');
    assert.equal(count(m.calls, 'push'), 0);
  });

  test('operator prompt shows actual push target even when no PR token exists', async () => {
    const m = mockGit({ pushes: [SSH_PUSH] });
    const prompts: string[] = [];
    const result = await runGovernedCommitFlow('organize', ['file.txt'], ['edit'], {
      workspaceRoot: '/ws', git: m.git,
      now: () => '2026-06-10T12:00:00.000Z',
      confirm: async message => { prompts.push(message); return true; },
      recordDeclined: async () => {},
    });
    assert.ok(prompts[0].includes(SSH_PUSH), prompts[0]);
    assert.equal(result.step, 'pushed');
    assert.equal(count(m.calls, 'push'), 1);
  });

  test('push target changed after operator approval never reaches git push', async () => {
    const m = mockGit({ pushes: [FETCH, BAD] });
    let posts = 0;
    const result = await runGovernedCommitFlow('organize', ['file.txt'], ['edit'], {
      workspaceRoot: '/ws', git: m.git,
      now: () => '2026-06-10T12:00:00.000Z',
      confirm: async () => true, recordDeclined: async () => {},
      token: 'fixture-token',
      post: async () => { posts++; return { status: 201, body: '{}' }; },
    });
    assert.equal(result.step, 'committed');
    assert.equal(count(m.calls, 'push'), 0);
    assert.equal(posts, 0);
  });

  test('effective push URL changing after a successful push refuses token-backed PR', async () => {
    const m = mockGit({ pushes: [FETCH, BAD] });
    let posts = 0;
    const r = await commitPushOpenPr(REQUEST, {
      git: m.git, token: 'fixture-token',
      post: async () => { posts++; return { status: 201, body: '{}' }; },
    });
    assert.equal(r.step, 'pushed');
    assert.match(r.warning || '', /push destination changed/i);
    assert.equal(count(m.calls, 'push'), 1);
    assert.equal(posts, 0);
  });

  test('unparseable credential-bearing fetch URL never authorizes public push', async () => {
    const secret = 'https://user:FAKEPASSWORD@github.com/acme/repo.git';
    const m = mockGit({ fetch: secret, pushes: [secret] });
    const r = await commitPushOpenPr(REQUEST, { git: m.git });
    assert.equal(r.step, 'committed');
    assert.equal(count(m.calls, 'push'), 0);
    assert.ok(!JSON.stringify(r).includes('FAKEPASSWORD'));
  });
});
