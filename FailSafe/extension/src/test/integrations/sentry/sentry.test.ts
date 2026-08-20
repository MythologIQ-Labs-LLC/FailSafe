import { strict as assert } from 'assert';
import {
  sentryLevelToSeverity, parseSentryIssue, parseIssuesResponse,
  sentryIssueToRisk, sentryIssuesToRisks,
} from '../../../integrations/sentry/sentry-to-risk';
import { buildIssuesPath, fetchSentryRisks, importSentryRisks, type SentryGetFn } from '../../../integrations/sentry/sentry-client';

// A realistic project-issues list fixture (two issues; one enriched with
// release + suspect commit, one bare — exercising "missing commit data").
const ISSUES_FIXTURE = JSON.stringify([
  {
    id: '101', shortId: 'PROJ-101', title: 'TypeError: undefined is not a function',
    culprit: 'app/api/handler', level: 'error', status: 'unresolved',
    permalink: 'https://sentry.io/organizations/acme/issues/101/',
    firstSeen: '2026-05-01T00:00:00Z', lastSeen: '2026-06-01T00:00:00Z',
    project: { slug: 'backend' },
    lastRelease: { version: 'backend@5.4.2' },
    suspectCommits: [{ id: 'deadbeefcafe', message: 'refactor handler' }],
  },
  {
    id: '102', title: 'Warning: slow query', level: 'warning', status: 'unresolved',
    permalink: 'https://sentry.io/organizations/acme/issues/102/',
    firstSeen: '2026-05-20T00:00:00Z', lastSeen: '2026-06-02T00:00:00Z',
    project: { slug: 'backend' },
    // no release, no suspect commit
  },
]);

suite('sentry-to-risk map (#102)', () => {
  test('level → severity is deterministic + fail-safe', () => {
    assert.equal(sentryLevelToSeverity('fatal'), 'high');
    assert.equal(sentryLevelToSeverity('error'), 'high');
    assert.equal(sentryLevelToSeverity('warning'), 'warn');
    assert.equal(sentryLevelToSeverity('info'), 'info');
    assert.equal(sentryLevelToSeverity('debug'), 'info');
    assert.equal(sentryLevelToSeverity('mystery'), 'warn');
    assert.equal(sentryLevelToSeverity(undefined), 'warn');
  });

  test('parseSentryIssue reads canonical fields incl. release + suspect commit; null when no id', () => {
    const issues = JSON.parse(ISSUES_FIXTURE);
    const a = parseSentryIssue(issues[0], 'production');
    assert.equal(a?.id, '101');
    assert.equal(a?.sourceUrl, 'https://sentry.io/organizations/acme/issues/101/');
    assert.equal(a?.project, 'backend');
    assert.equal(a?.environment, 'production'); // threaded from the scoped query
    assert.equal(a?.release, 'backend@5.4.2');
    assert.equal(a?.suspectCommit, 'deadbeefcafe');
    assert.equal(a?.firstSeen, '2026-05-01T00:00:00Z');
    assert.equal(parseSentryIssue({ title: 'x' }), null);
    assert.equal(parseSentryIssue(null), null);
  });

  test('missing commit/release data is tolerated (no ghost fields)', () => {
    const issues = JSON.parse(ISSUES_FIXTURE);
    const b = parseSentryIssue(issues[1]);
    assert.equal(b?.id, '102');
    assert.equal(b?.release, undefined);
    assert.equal(b?.suspectCommit, undefined);
  });

  test('sentryIssueToRisk builds a keyed, WARN-only risk record with provenance', () => {
    const issues = parseIssuesResponse(JSON.parse(ISSUES_FIXTURE), 'production');
    const risk = sentryIssueToRisk(issues[0]);
    assert.equal(risk.id, 'sentry:101');
    assert.equal(risk.source, 'sentry');
    assert.equal(risk.status, 'open');
    assert.equal(risk.severity, 'high');
    assert.deepEqual(risk.location, { url: 'https://sentry.io/organizations/acme/issues/101/' });
    const prov = risk.provenance as Record<string, unknown>;
    assert.equal(prov.release, 'backend@5.4.2');
    assert.equal(prov.suspectCommit, 'deadbeefcafe');
    assert.equal(prov.environment, 'production');
    // The bare issue must not carry release/suspectCommit keys.
    const prov2 = sentryIssueToRisk(issues[1]).provenance as Record<string, unknown>;
    assert.equal('release' in prov2, false);
    assert.equal('suspectCommit' in prov2, false);
  });

  test('sentryIssuesToRisks dedups by id (re-import upserts same key)', () => {
    const issues = parseIssuesResponse(JSON.parse(ISSUES_FIXTURE));
    const dup = [...issues, ...issues];
    const risks = sentryIssuesToRisks(dup);
    assert.equal(risks.length, 2);
    assert.deepEqual(risks.map((r) => r.id).sort(), ['sentry:101', 'sentry:102']);
  });
});

suite('sentry-client (#102)', () => {
  test('buildIssuesPath defaults query to is:unresolved + folds environment INTO the query (not a standalone param)', () => {
    assert.match(buildIssuesPath('acme', 'backend'), /^\/api\/0\/projects\/acme\/backend\/issues\/\?query=is%3Aunresolved$/);
    const withEnv = buildIssuesPath('acme', 'backend', { environment: 'production' });
    // environment is expressed inside the search query (`environment:production`),
    // URL-encoded as part of the single `query` param — never a separate `environment=` param.
    assert.match(withEnv, /query=is%3Aunresolved\+environment%3Aproduction/);
    assert.ok(!/[?&]environment=/.test(withEnv), 'must NOT use a standalone environment query param (the endpoint ignores it)');
  });

  test('disabled → local-only, NO network', async () => {
    let called = false;
    const get: SentryGetFn = async () => { called = true; return { status: 200, body: ISSUES_FIXTURE }; };
    const r = await fetchSentryRisks({ enabled: false, token: 't', org: 'a', project: 'b' }, get);
    assert.equal(r.localOnly, true); assert.equal(called, false); assert.equal(r.count, 0);
  });

  test('missing token/org/project → local-only, NO network', async () => {
    let called = false;
    const get: SentryGetFn = async () => { called = true; return { status: 200, body: ISSUES_FIXTURE }; };
    const r = await fetchSentryRisks({ enabled: true, token: '', org: 'a', project: 'b' }, get);
    assert.equal(r.localOnly, true); assert.equal(called, false);
  });

  test('happy path → maps issues to risks; upsert sink receives each', async () => {
    const get: SentryGetFn = async (url) => { assert.match(url, /\/api\/0\/projects\/acme\/backend\/issues\//); return { status: 200, body: ISSUES_FIXTURE }; };
    const upserted: Array<Record<string, unknown>> = [];
    const r = await importSentryRisks({ enabled: true, token: 't', org: 'acme', project: 'backend', environment: 'production' }, get, (risk) => upserted.push(risk));
    assert.equal(r.ok, true);
    assert.equal(r.count, 2);
    assert.equal(upserted.length, 2);
    assert.deepEqual(upserted.map((u) => u.id).sort(), ['sentry:101', 'sentry:102']);
  });

  test('SECRET MASKING: the token goes only in the Authorization header, never in the result', async () => {
    let sentAuth: string | undefined;
    const get: SentryGetFn = async (_u, headers) => { sentAuth = headers.Authorization; return { status: 200, body: ISSUES_FIXTURE }; };
    const r = await fetchSentryRisks({ enabled: true, token: 'sntrys_TOPSECRET', org: 'acme', project: 'backend' }, get);
    assert.equal(sentAuth, 'Bearer sntrys_TOPSECRET', 'token is sent as a Bearer header');
    assert.ok(!JSON.stringify(r).includes('TOPSECRET'), 'token never appears anywhere in the returned result');
  });

  test('401/403 → auth error; 404 → not found; 429 → rate limit (non-throwing, no upsert)', async () => {
    const upserted: unknown[] = [];
    const r401 = await importSentryRisks({ enabled: true, token: 't', org: 'a', project: 'b' }, async () => ({ status: 401, body: '' }), (x) => upserted.push(x));
    assert.equal(r401.ok, false); assert.match(r401.error ?? '', /auth/i); assert.equal(upserted.length, 0);
    const r404 = await fetchSentryRisks({ enabled: true, token: 't', org: 'a', project: 'b' }, async () => ({ status: 404, body: '' }));
    assert.equal(r404.status, 404);
    const r429 = await fetchSentryRisks({ enabled: true, token: 't', org: 'a', project: 'b' }, async () => ({ status: 429, body: '' }));
    assert.equal(r429.status, 429);
  });

  test('custom apiBaseUrl honored (self-hosted Sentry)', async () => {
    let sentUrl = '';
    const get: SentryGetFn = async (url) => { sentUrl = url; return { status: 200, body: '[]' }; };
    await fetchSentryRisks({ enabled: true, token: 't', org: 'acme', project: 'backend', apiBaseUrl: 'https://sentry.acme.com/' }, get);
    assert.match(sentUrl, /^https:\/\/sentry\.acme\.com\/api\/0\/projects\/acme\/backend\/issues\//);
  });
});

// #241 Tranche C D-2 shared class (FX915): guarded upsert loop.
suite('sentry upsert resilience (FX915/#241C)', () => {
  test('T6: throwing upsert mid-stream -> loop completes, failed counted on the result', async () => {
    const issues = [
      { id: '1', title: 'a', level: 'error', permalink: 'https://x/1' },
      { id: '2', title: 'b', level: 'error', permalink: 'https://x/2' },
      { id: '3', title: 'c', level: 'error', permalink: 'https://x/3' },
    ];
    const get: SentryGetFn = async () => ({ status: 200, body: JSON.stringify(issues) });
    let calls = 0;
    const r = await importSentryRisks(
      { enabled: true, token: 't', org: 'o', project: 'p' },
      get,
      () => { calls++; if (calls === 2) throw new Error('write refused'); },
    );
    assert.equal(r.ok, true);
    assert.equal(calls, 3, 'every risk still offered to the sink');
    assert.equal((r as any).failed, 1);
  });
});
