import { strict as assert } from 'assert';
import {
  mapVerdictToConclusion, parseRepoSlug, buildCheckRunPayload,
} from '../../../integrations/github-checks/github-checks-map';
import { publishCheckRun, type GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';

suite('github-checks map (#96)', () => {
  test('verdict → conclusion is deterministic (and fail-safe for unknowns)', () => {
    assert.equal(mapVerdictToConclusion('PASS'), 'success');
    assert.equal(mapVerdictToConclusion('WARN'), 'neutral');
    assert.equal(mapVerdictToConclusion('VETO'), 'failure');
    assert.equal(mapVerdictToConclusion('pass'), 'success');
    assert.equal(mapVerdictToConclusion('weird'), 'neutral');
    assert.equal(mapVerdictToConclusion(''), 'neutral');
  });

  test('parseRepoSlug handles https / ssh / token-embedded / .git, rejects garbage', () => {
    assert.deepEqual(parseRepoSlug('https://github.com/acme/failsafe'), { owner: 'acme', repo: 'failsafe' });
    assert.deepEqual(parseRepoSlug('https://github.com/acme/failsafe.git'), { owner: 'acme', repo: 'failsafe' });
    assert.deepEqual(parseRepoSlug('git@github.com:acme/failsafe.git'), { owner: 'acme', repo: 'failsafe' });
    assert.deepEqual(parseRepoSlug('ssh://git@github.com/acme/failsafe.git'), { owner: 'acme', repo: 'failsafe' });
    assert.deepEqual(parseRepoSlug('https://x-access-token:TOKEN@github.com/acme/failsafe.git'), { owner: 'acme', repo: 'failsafe' });
    assert.equal(parseRepoSlug('not a url'), null);
    assert.equal(parseRepoSlug(''), null);
  });

  test('buildCheckRunPayload maps conclusion + title and defaults name/summary', () => {
    const p = buildCheckRunPayload({ verdict: 'VETO', headSha: 'abc123' });
    assert.equal(p.status, 'completed');
    assert.equal(p.conclusion, 'failure');
    assert.equal(p.name, 'FailSafe SHIELD');
    assert.equal(p.head_sha, 'abc123');
    assert.equal(p.output.title, 'SHIELD: VETO');
    assert.match(p.output.summary, /VETO/);
    assert.equal(p.details_url, undefined);
    const p2 = buildCheckRunPayload({ verdict: 'PASS', headSha: 'sha', name: 'X', summary: 'all good', detailsUrl: 'http://127.0.0.1:9376/console/home' });
    assert.equal(p2.conclusion, 'success');
    assert.equal(p2.name, 'X');
    assert.equal(p2.output.summary, 'all good');
    assert.equal(p2.details_url, 'http://127.0.0.1:9376/console/home');
  });
});

suite('github-checks client (#96)', () => {
  const okBody = JSON.stringify({ id: 9988 });
  const ctx = { remoteUrl: 'https://github.com/acme/failsafe.git', headSha: 'deadbeef' };

  test('disabled → local-only, NO network', async () => {
    let called = false;
    const post: GitHubPostFn = async () => { called = true; return { status: 201, body: okBody }; };
    const r = await publishCheckRun('PASS', ctx, { enabled: false, token: 't' }, post);
    assert.equal(r.localOnly, true); assert.equal(called, false);
  });

  test('no token → local-only, NO network', async () => {
    let called = false;
    const post: GitHubPostFn = async () => { called = true; return { status: 201, body: okBody }; };
    const r = await publishCheckRun('PASS', ctx, { enabled: true, token: '' }, post);
    assert.equal(r.localOnly, true); assert.equal(called, false);
  });

  test('fork PR context → local-only, NO network', async () => {
    let called = false;
    const post: GitHubPostFn = async () => { called = true; return { status: 201, body: okBody }; };
    const r = await publishCheckRun('VETO', { ...ctx, isFork: true }, { enabled: true, token: 't' }, post);
    assert.equal(r.localOnly, true); assert.equal(called, false);
  });

  test('missing remote / missing sha → local-only', async () => {
    const post: GitHubPostFn = async () => ({ status: 201, body: okBody });
    const r1 = await publishCheckRun('PASS', { headSha: 'x' }, { enabled: true, token: 't' }, post);
    assert.equal(r1.localOnly, true);
    const r2 = await publishCheckRun('PASS', { remoteUrl: 'https://github.com/a/b' }, { enabled: true, token: 't' }, post);
    assert.equal(r2.localOnly, true);
  });

  test('happy path → posts to the check-runs endpoint, maps conclusion, returns id', async () => {
    let sentUrl = '', sentBody = '';
    const post: GitHubPostFn = async (url, _h, body) => { sentUrl = url; sentBody = body; return { status: 201, body: okBody }; };
    const r = await publishCheckRun('VETO', ctx, { enabled: true, token: 't' }, post);
    assert.equal(r.ok, true); assert.equal(r.localOnly, undefined); assert.equal(r.checkRunId, 9988);
    assert.equal(sentUrl, 'https://api.github.com/repos/acme/failsafe/check-runs');
    assert.match(sentBody, /"conclusion":"failure"/);
    assert.match(sentBody, /"head_sha":"deadbeef"/);
  });

  test('SECRET MASKING: token only in the Authorization header, never in the result', async () => {
    let sentAuth: string | undefined;
    const post: GitHubPostFn = async (_u, headers) => { sentAuth = headers.Authorization; return { status: 201, body: okBody }; };
    const r = await publishCheckRun('PASS', ctx, { enabled: true, token: 'ghs_TOPSECRET' }, post);
    assert.equal(sentAuth, 'token ghs_TOPSECRET', 'token is sent in the Authorization header');
    assert.ok(!JSON.stringify(r).includes('TOPSECRET'), 'token never appears anywhere in the returned result');
  });

  test('401/403 → auth error; 422 → rejected (non-throwing)', async () => {
    const r401 = await publishCheckRun('PASS', ctx, { enabled: true, token: 't' }, async () => ({ status: 401, body: '' }));
    assert.equal(r401.ok, false); assert.match(r401.error ?? '', /auth/i);
    const r422 = await publishCheckRun('PASS', ctx, { enabled: true, token: 't' }, async () => ({ status: 422, body: '' }));
    assert.equal(r422.ok, false); assert.equal(r422.status, 422);
  });

  test('custom apiBaseUrl is honored (GHES)', async () => {
    let sentUrl = '';
    const post: GitHubPostFn = async (url) => { sentUrl = url; return { status: 201, body: okBody }; };
    await publishCheckRun('PASS', ctx, { enabled: true, token: 't', apiBaseUrl: 'https://ghe.acme.com/api/v3/' }, post);
    assert.equal(sentUrl, 'https://ghe.acme.com/api/v3/repos/acme/failsafe/check-runs');
  });
});
