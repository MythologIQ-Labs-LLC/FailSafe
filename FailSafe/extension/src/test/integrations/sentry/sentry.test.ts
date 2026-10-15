import { strict as assert } from 'assert';
import { sentryLevelToSeverity, parseSentryIssue, sentryIssueToRisk } from '../../../integrations/sentry/sentry-to-risk';
import { buildIssuesPath, fetchSentryIssues, nextSentryPage, type ListDeps, type SentryGetFn } from '../../../integrations/sentry/sentry-client';
import { readSentrySettings } from '../../../integrations/sentry/sentry-settings';

// FX829 (#102, #478): list requests, pagination trust, token handling, settings.
// Import-level counts live in sentry-import.test.ts.

// One issue carries list-level release and suspect-commit fields that the
// import must ignore: release data comes only from issue-detail responses.
const ISSUES_FIXTURE = JSON.stringify([
  {
    id: '101', shortId: 'PROJ-101', title: 'TypeError: undefined is not a function',
    culprit: 'app/api/handler', level: 'error', status: 'unresolved',
    permalink: 'https://sentry.io/organizations/acme/issues/101/',
    firstSeen: '2026-05-01T00:00:00Z', lastSeen: '2026-06-01T00:00:00Z',
    project: { slug: 'backend' },
    lastRelease: { version: 'backend@5.4.2' },
    suspectCommit: 'feedface',
    suspectCommits: [{ id: 'deadbeefcafe', message: 'refactor handler' }],
  },
  {
    id: '102', title: 'Warning: slow query', level: 'warning', status: 'unresolved',
    permalink: 'https://sentry.io/organizations/acme/issues/102/',
    firstSeen: '2026-05-20T00:00:00Z', lastSeen: '2026-06-02T00:00:00Z',
    project: { slug: 'backend' },
  },
]);

/** Recording sleep on an advancing clock; never waits for real. */
function deps(): ListDeps & { sleeps: number[] } {
  let now = 1_700_000_000_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    cancel: { cancelled: false, onCancel: () => () => undefined },
    policy: { now: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; } },
  };
}

suite('sentry-to-risk map (#102, #478)', () => {
  test('level → severity is deterministic + fail-safe', () => {
    assert.equal(sentryLevelToSeverity('fatal'), 'high');
    assert.equal(sentryLevelToSeverity('error'), 'high');
    assert.equal(sentryLevelToSeverity('warning'), 'warn');
    assert.equal(sentryLevelToSeverity('info'), 'info');
    assert.equal(sentryLevelToSeverity('debug'), 'info');
    assert.equal(sentryLevelToSeverity('mystery'), 'warn');
    assert.equal(sentryLevelToSeverity(undefined), 'warn');
  });

  test('parseSentryIssue reads canonical fields and shortId, never a release or suspect commit; null when no id', () => {
    const issues = JSON.parse(ISSUES_FIXTURE);
    const a = parseSentryIssue(issues[0], 'production') as unknown as Record<string, unknown>;
    assert.equal(a.id, '101');
    assert.equal(a.shortId, 'PROJ-101');
    assert.equal(a.sourceUrl, 'https://sentry.io/organizations/acme/issues/101/');
    assert.equal(a.project, 'backend');
    assert.equal(a.environment, 'production');
    assert.equal(a.firstSeen, '2026-05-01T00:00:00Z');
    for (const k of ['release', 'suspectCommit', 'suspectCommits']) assert.equal(k in a, false, k);
    assert.equal(parseSentryIssue({ title: 'x' }), null);
    assert.equal(parseSentryIssue(null), null);
  });

  test('sentryIssueToRisk takes release only from its argument and never writes suspectCommit or status', () => {
    const issue = parseSentryIssue(JSON.parse(ISSUES_FIXTURE)[0], 'production');
    assert.ok(issue);
    const bare = sentryIssueToRisk(issue, { importedAt: '2026-10-15T00:00:00.000Z' });
    assert.equal(bare.id, 'sentry:101');
    assert.equal(bare.source, 'sentry');
    assert.equal(bare.severity, 'high');
    assert.equal(bare.updatedAt, '2026-10-15T00:00:00.000Z');
    assert.equal('status' in bare, false, 'status is the store owner\'s, not Sentry\'s');
    assert.deepEqual(bare.location, { url: 'https://sentry.io/organizations/acme/issues/101/' });
    const prov = bare.provenance as Record<string, unknown>;
    assert.equal(prov.shortId, 'PROJ-101');
    assert.equal(prov.environment, 'production');
    assert.equal('release' in prov, false, 'the list item lastRelease is ignored');
    assert.equal('suspectCommit' in prov, false);
    const release = { source: 'sentry-issue-detail' as const, first: 'b@1', verifiedAt: '2026-10-15T00:00:00.000Z' };
    assert.deepEqual((sentryIssueToRisk(issue, { release, importedAt: 't' }).provenance as Record<string, unknown>).release, release);
  });
});

suite('sentry-client list requests (#102, #478)', () => {
  test('buildIssuesPath uses the organization endpoint with project, sort=date, limit=100 and environment as its own parameter', () => {
    assert.equal(buildIssuesPath('acme', 'backend'),
      '/api/0/organizations/acme/issues/?project=backend&query=is%3Aunresolved&sort=date&limit=100');
    const withEnv = buildIssuesPath('acme', 'backend', { environment: 'production', query: 'is:unresolved level:error' });
    assert.match(withEnv, /[?&]environment=production(&|$)/);
    assert.match(withEnv, /query=is%3Aunresolved\+level%3Aerror/);
    assert.ok(!/environment%3A/.test(withEnv), 'environment is no longer folded into the query');
  });

  test('disabled or unconfigured → local-only, NO network', async () => {
    for (const opts of [{ enabled: false, token: 't', org: 'a', project: 'b' }, { enabled: true, token: '', org: 'a', project: 'b' }]) {
      let called = false;
      const r = await fetchSentryIssues(opts, async () => { called = true; return { status: 200, body: ISSUES_FIXTURE }; }, deps());
      assert.equal(r.localOnly, true);
      assert.equal(called, false);
      assert.deepEqual(r.items, []);
    }
  });

  test('SECRET MASKING: the token goes only in the Authorization header, never in the result', async () => {
    let sentAuth: string | undefined;
    const get: SentryGetFn = async (_u, headers) => { sentAuth = headers.Authorization; return { status: 200, body: ISSUES_FIXTURE }; };
    const r = await fetchSentryIssues({ enabled: true, token: 'sntrys_TOPSECRET', org: 'acme', project: 'backend' }, get, deps());
    assert.equal(sentAuth, 'Bearer sntrys_TOPSECRET');
    assert.equal(r.items.length, 2);
    assert.ok(!JSON.stringify(r).includes('TOPSECRET'));
  });

  test('401/403 → auth error; 404 → not found (one request each); 429 → rate_limited after 4 requests', async () => {
    const o = { enabled: true, token: 't', org: 'a', project: 'b' };
    for (const [status, re] of [[401, /auth/i], [403, /auth/i], [404, /not found/i]] as const) {
      let calls = 0;
      const r = await fetchSentryIssues(o, async () => { calls++; return { status, body: '' }; }, deps());
      assert.equal(r.ok, false); assert.equal(r.status, status); assert.match(r.error ?? '', re); assert.equal(calls, 1);
    }
    let calls = 0;
    const d = deps();
    const r429 = await fetchSentryIssues(o, async () => { calls++; return { status: 429, body: '' }; }, d);
    assert.equal(r429.status, 429);
    assert.equal(calls, 4);
    assert.deepEqual(d.sleeps, [1000, 2000, 4000]);
  });

  test('a custom apiBaseUrl keeps its host and subpath', async () => {
    const sent: string[] = [];
    const get: SentryGetFn = async (url) => { sent.push(url); return { status: 200, body: '[]' }; };
    await fetchSentryIssues({ enabled: true, token: 't', org: 'acme', project: 'backend', apiBaseUrl: 'https://sentry.acme.com/' }, get, deps());
    await fetchSentryIssues({ enabled: true, token: 't', org: 'acme', project: 'backend', apiBaseUrl: 'https://host.example/sentry' }, get, deps());
    assert.match(sent[0], /^https:\/\/sentry\.acme\.com\/api\/0\/organizations\/acme\/issues\/\?project=backend/);
    assert.match(sent[1], /^https:\/\/host\.example\/sentry\/api\/0\/organizations\/acme\/issues\//);
  });
});

suite('Sentry pagination trust (FailSafe #478)', () => {
  const options = { enabled: true, token: 'private-token', org: 'acme', project: 'backend' };
  const one = JSON.stringify([{ id: '1', title: 'Issue one', level: 'error' }]);
  const makeLink = (url: string, results = true) => `<${url}>; rel="next"; results="${results}"`;

  test('rejects other-origin pagination rather than sending the token to another host', async () => {
    let calls = 0;
    const get: SentryGetFn = async () => { calls++; return { status: 200, body: one, headers: { link: makeLink('https://attacker.invalid/steal') } }; };
    const r = await fetchSentryIssues(options, get, deps());
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /pagination/i);
    assert.equal(calls, 1);
    assert.deepEqual(r.items, []);
  });

  test('rejects unrelated paths and repeated cursors', async () => {
    const firstUrl = 'https://sentry.io/api/0/organizations/acme/issues/?project=backend';
    assert.throws(() => nextSentryPage(makeLink('https://sentry.io/api/0/other/'), firstUrl, firstUrl), /Untrusted/);
    const get: SentryGetFn = async (url) => ({ status: 200, body: one, headers: { link: makeLink(url) } });
    const r = await fetchSentryIssues(options, get, deps());
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /cursor loop/i);
    assert.deepEqual(r.items, []);
  });

  test('does not echo exception text containing a secret into result diagnostics', async () => {
    const r = await fetchSentryIssues(options, async () => { throw new Error('private-token leaked'); }, deps());
    assert.equal(r.ok, false);
    assert.ok(!JSON.stringify(r).includes('private-token'));
  });

  test('malformed API base URL does not throw or contact network', async () => {
    let called = false;
    const r = await fetchSentryIssues({ ...options, apiBaseUrl: 'not-a-url' }, async () => { called = true; return { status: 200, body: one }; }, deps());
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /invalid sentry api base url/i);
    assert.equal(called, false);
  });

  test('rejects insecure API origins before sending authorization', async () => {
    let called = false;
    const r = await fetchSentryIssues({ ...options, apiBaseUrl: 'http://sentry.internal' }, async () => { called = true; return { status: 200, body: one }; }, deps());
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });
});

suite('readSentrySettings (#478 LD9)', () => {
  const reader = (values: Record<string, unknown>) => (key: string, fallback: unknown) => (key in values ? values[key] : fallback);

  test('unset settings give the defaults', () => {
    const s = readSentrySettings(reader({}), undefined);
    assert.equal(s.enabled, false);
    assert.equal(s.query, 'is:unresolved');
    assert.equal(s.environment, undefined);
    assert.equal(s.maxReleaseLookups, 50);
  });

  test('blank query and environment fall back; maxReleaseLookups is clamped and validated', () => {
    assert.equal(readSentrySettings(reader({ 'integrations.sentry.query': '  ' }), undefined).query, 'is:unresolved');
    assert.equal(readSentrySettings(reader({ 'integrations.sentry.query': 'is:unresolved level:error' }), undefined).query, 'is:unresolved level:error');
    assert.equal(readSentrySettings(reader({ 'integrations.sentry.environment': ' ' }), undefined).environment, undefined);
    for (const [raw, want] of [[-5, 0], [500, 200], ['abc', 50], [2.5, 50], [7, 7]] as const) {
      assert.equal(readSentrySettings(reader({ 'integrations.sentry.maxReleaseLookups': raw }), undefined).maxReleaseLookups, want, String(raw));
    }
  });
});
