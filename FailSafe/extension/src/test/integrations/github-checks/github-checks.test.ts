import { strict as assert } from 'assert';
import * as mapModule from '../../../integrations/github-checks/github-checks-map';
import * as clientModule from '../../../integrations/github-checks/github-checks-client';
import {
  parseRepoSlug, buildManualAdvisoryPayload, type CheckRunPayload, type CheckConclusion,
} from '../../../integrations/github-checks/github-checks-map';
import { publishCheckRunPayload, type GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';

const CTX = { remoteUrl: 'https://github.com/acme/failsafe.git', headSha: 'deadbeef' };
const OPTS = { enabled: true, token: 't' };
const OK_BODY = JSON.stringify({ id: 9988 });

/** Build a payload with an arbitrary (possibly non-publishable) name. */
function payload(name: string, conclusion: string): CheckRunPayload {
  return {
    name, head_sha: CTX.headSha, status: 'completed', conclusion,
    output: { title: 't', summary: 's' },
  } as unknown as CheckRunPayload;
}

function countingPost(status = 201, body = OK_BODY): { post: GitHubPostFn; calls: () => number } {
  let n = 0;
  return { post: async () => { n += 1; return { status, body }; }, calls: () => n };
}

suite('github-checks map (#96)', () => {
  test('FX476 manual advisory is neutral and not the required SHIELD check', () => {
    const p = buildManualAdvisoryPayload('sha-123');
    assert.equal(p.name, 'FailSafe Manual Advisory');
    assert.equal(p.conclusion, 'neutral');
    assert.equal(p.status, 'completed');
    assert.equal(p.head_sha, 'sha-123');
    assert.match(p.output.summary, /no independent qor audit/i);
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

  test('#476 export pin: the operator-verdict primitives and the raw transport are not exported', () => {
    const client = clientModule as unknown as Record<string, unknown>;
    const map = mapModule as unknown as Record<string, unknown>;
    assert.equal(client.publishCheckRun, undefined, 'publishCheckRun removed');
    assert.equal(client.postCheckRun, undefined, 'transport not re-exported by the client');
    assert.equal(map.mapVerdictToConclusion, undefined, 'mapVerdictToConclusion removed');
    assert.equal(map.buildCheckRunPayload, undefined, 'buildCheckRunPayload removed');
  });
});

suite('github-checks allowlist (#476)', () => {
  const SHIELD_LIKE = [
    'FailSafe SHIELD', ' FailSafe SHIELD', 'FailSafe: SHIELD', 'FailSafe SHIELD',
    'FailSafe-SHIELD', 'SHIELD', 'FailSafe  SHIELD', 'X',
  ];
  for (const name of SHIELD_LIKE) {
    test(`success under ${JSON.stringify(name)} is refused before the transport`, async () => {
      const c = countingPost();
      const r = await publishCheckRunPayload(payload(name, 'success'), CTX, OPTS, c.post);
      assert.equal(r.ok, false);
      assert.equal(c.calls(), 0);
    });
  }

  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    test(`inherited key ${name} is never publishable`, async () => {
      const c = countingPost();
      const r = await publishCheckRunPayload(payload(name, 'neutral'), CTX, OPTS, c.post);
      assert.equal(r.ok, false);
      assert.equal(c.calls(), 0);
    });
  }

  test('the allowlist runs before every other guard (refused, not a local-only no-op)', async () => {
    const c = countingPost();
    for (const opts of [{ enabled: false, token: 't' }, { enabled: true, token: '' }]) {
      const r = await publishCheckRunPayload(payload('FailSafe SHIELD', 'success'), CTX, opts, c.post);
      assert.equal(r.ok, false);
      assert.equal(r.localOnly, undefined);
      assert.match(r.error ?? '', /not publishable/);
    }
    assert.equal(c.calls(), 0);
  });

  test('mutating the exported PUBLISHABLE_CHECKS view cannot widen publishing', async () => {
    const view = mapModule.PUBLISHABLE_CHECKS as unknown as Map<string, Set<string>>;
    try { view.set('FailSafe SHIELD', new Set(['success', 'neutral'])); } catch { /* frozen is fine too */ }
    try { (view.get('FailSafe Manual Advisory') as Set<string> | undefined)?.add('success'); } catch { /* frozen is fine too */ }
    assert.equal(mapModule.isPublishable('FailSafe SHIELD', 'success'), false);
    assert.equal(mapModule.isPublishable('FailSafe Manual Advisory', 'success'), false);
    const c = countingPost();
    assert.equal((await publishCheckRunPayload(payload('FailSafe Manual Advisory', 'success'), CTX, OPTS, c.post)).ok, false);
    assert.equal((await publishCheckRunPayload(payload('FailSafe SHIELD', 'neutral'), CTX, OPTS, c.post)).ok, false);
    assert.equal(c.calls(), 0);
  });

  test('neutral under the SHIELD name is refused (neutral passes required checks)', async () => {
    const c = countingPost();
    const r = await publishCheckRunPayload(payload('FailSafe SHIELD', 'neutral'), CTX, OPTS, c.post);
    assert.equal(r.ok, false);
    assert.equal(c.calls(), 0);
  });

  test('the manual advisory may be neutral only', async () => {
    const bad = countingPost();
    assert.equal((await publishCheckRunPayload(payload('FailSafe Manual Advisory', 'success'), CTX, OPTS, bad.post)).ok, false);
    assert.equal(bad.calls(), 0);
    const good = countingPost();
    const r = await publishCheckRunPayload(buildManualAdvisoryPayload(CTX.headSha), CTX, OPTS, good.post);
    assert.equal(r.ok, true);
    assert.equal(good.calls(), 1);
  });

  for (const conclusion of ['success', 'neutral', 'failure'] as CheckConclusion[]) {
    test(`PR Linkage may publish ${conclusion}`, async () => {
      const c = countingPost();
      const r = await publishCheckRunPayload(payload('FailSafe: PR Linkage', conclusion), CTX, OPTS, c.post);
      assert.equal(r.ok, true);
      assert.equal(c.calls(), 1);
    });
  }
});

suite('github-checks strict responses (#476)', () => {
  const advisory = buildManualAdvisoryPayload(CTX.headSha);
  const BAD: Array<[string, { status: number; body: string }]> = [
    ['201 non-JSON', { status: 201, body: 'not json' }],
    ['201 string id', { status: 201, body: '{"id":"9"}' }],
    ['201 zero id', { status: 201, body: '{"id":0}' }],
    ['201 fractional id', { status: 201, body: '{"id":1.5}' }],
    ['200 numeric id', { status: 200, body: '{"id":1}' }],
    ['202 empty', { status: 202, body: '' }],
    ['404', { status: 404, body: '{"message":"Not Found"}' }],
    ['422', { status: 422, body: '{"message":"No commit found for SHA: x"}' }],
    ['500', { status: 500, body: '' }],
    ['403 rate limit', { status: 403, body: '{"message":"API rate limit exceeded"}' }],
  ];
  for (const [label, res] of BAD) {
    test(`${label} is not a confirmed publish`, async () => {
      const r = await publishCheckRunPayload(advisory, CTX, { enabled: true, token: 'ghs_SECRET1' }, async () => res);
      assert.equal(r.ok, false);
      assert.equal(r.checkRunId, undefined);
      const text = JSON.stringify(r);
      assert.ok(!text.includes('ghs_SECRET1'), 'token never in the result');
      if (res.body.length > 2) assert.ok(!text.includes(res.body), 'response body never in the result');
    });
  }

  test('a throwing transport is a non-throwing failure', async () => {
    const r = await publishCheckRunPayload(advisory, CTX, OPTS, async () => { throw new Error('ECONNRESET'); });
    assert.equal(r.ok, false);
    assert.equal(r.checkRunId, undefined);
  });

  test('201 with a positive integer id is published', async () => {
    const r = await publishCheckRunPayload(advisory, CTX, OPTS, async () => ({ status: 201, body: '{"id":7}' }));
    assert.equal(r.ok, true);
    assert.equal(r.checkRunId, 7);
  });

  test('a malformed apiBaseUrl fails closed without a POST', async () => {
    const c = countingPost();
    const r = await publishCheckRunPayload(advisory, CTX, { enabled: true, token: 't', apiBaseUrl: 'not a url' }, c.post);
    assert.equal(r.ok, false);
    assert.equal(c.calls(), 0);
  });
});

suite('github-checks client guards (#96)', () => {
  const advisory = buildManualAdvisoryPayload(CTX.headSha);

  test('disabled / no token / fork / missing context -> local-only, NO network', async () => {
    const c = countingPost();
    assert.equal((await publishCheckRunPayload(advisory, CTX, { enabled: false, token: 't' }, c.post)).localOnly, true);
    assert.equal((await publishCheckRunPayload(advisory, CTX, { enabled: true, token: '' }, c.post)).localOnly, true);
    assert.equal((await publishCheckRunPayload(advisory, { ...CTX, isFork: true }, OPTS, c.post)).localOnly, true);
    assert.equal((await publishCheckRunPayload(advisory, { headSha: 'x' }, OPTS, c.post)).localOnly, true);
    assert.equal((await publishCheckRunPayload(advisory, { remoteUrl: CTX.remoteUrl }, OPTS, c.post)).localOnly, true);
    assert.equal(c.calls(), 0);
  });

  test('happy path posts to the check-runs endpoint and returns the id', async () => {
    let sentUrl = '', sentBody = '';
    const post: GitHubPostFn = async (url, _h, body) => { sentUrl = url; sentBody = body; return { status: 201, body: OK_BODY }; };
    const r = await publishCheckRunPayload(advisory, CTX, OPTS, post);
    assert.equal(r.ok, true); assert.equal(r.localOnly, undefined); assert.equal(r.checkRunId, 9988);
    assert.equal(sentUrl, 'https://api.github.com/repos/acme/failsafe/check-runs');
    assert.match(sentBody, /"conclusion":"neutral"/);
    assert.match(sentBody, /"head_sha":"deadbeef"/);
  });

  test('SECRET MASKING: token only in the Authorization header, never in the result', async () => {
    let sentAuth: string | undefined;
    const post: GitHubPostFn = async (_u, headers) => { sentAuth = headers.Authorization; return { status: 201, body: OK_BODY }; };
    const r = await publishCheckRunPayload(advisory, CTX, { enabled: true, token: 'ghs_TOPSECRET' }, post);
    assert.equal(sentAuth, 'token ghs_TOPSECRET');
    assert.ok(!JSON.stringify(r).includes('TOPSECRET'));
  });

  test('401/403 -> auth error; 422 -> rejected (non-throwing)', async () => {
    const r401 = await publishCheckRunPayload(advisory, CTX, OPTS, async () => ({ status: 401, body: '' }));
    assert.equal(r401.ok, false); assert.match(r401.error ?? '', /auth/i);
    const r422 = await publishCheckRunPayload(advisory, CTX, OPTS, async () => ({ status: 422, body: '' }));
    assert.equal(r422.ok, false); assert.equal(r422.status, 422);
  });

  test('custom apiBaseUrl is honored (GHES)', async () => {
    let sentUrl = '';
    const post: GitHubPostFn = async (url) => { sentUrl = url; return { status: 201, body: OK_BODY }; };
    await publishCheckRunPayload(advisory, CTX, { enabled: true, token: 't', apiBaseUrl: 'https://ghe.acme.com/api/v3/' }, post);
    assert.equal(sentUrl, 'https://ghe.acme.com/api/v3/repos/acme/failsafe/check-runs');
  });
});
