import { strict as assert } from 'assert';
import {
  parseLinearIssueId, buildIssueQuery, parseIssueResponse, toIntentPreview,
} from '../../../integrations/linear/linear-import';
import { fetchLinearIssue, readRateLimit, type LinearPostFn } from '../../../integrations/linear/linear-client';

suite('linear-import parse (B-INT-11 #97)', () => {
  test('resolves a Linear issue URL (with + without slug) to the identifier', () => {
    assert.equal(parseLinearIssueId('https://linear.app/acme/issue/ENG-123'), 'ENG-123');
    assert.equal(parseLinearIssueId('https://linear.app/acme/issue/ENG-123/fix-the-thing'), 'ENG-123');
    assert.equal(parseLinearIssueId('https://linear.app/acme/issue/AB-9?foo=1'), 'AB-9');
  });
  test('resolves a bare identifier (case-normalized) and rejects garbage', () => {
    assert.equal(parseLinearIssueId('ENG-123'), 'ENG-123');
    assert.equal(parseLinearIssueId('eng-123'), 'ENG-123');
    assert.equal(parseLinearIssueId('not an id'), null);
    assert.equal(parseLinearIssueId('https://example.com/whatever'), null);
    assert.equal(parseLinearIssueId(''), null);
  });
});

suite('linear-import query + parse + map (B-INT-11 #97)', () => {
  test('buildIssueQuery binds the identifier as the $id variable', () => {
    const q = buildIssueQuery('ENG-7');
    assert.deepEqual(q.variables, { id: 'ENG-7' });
    assert.match(q.query, /issue\(id: \$id\)/);
    assert.match(q.query, /identifier title description/);
  });

  test('parseIssueResponse tolerates missing/null relations + returns null when no issue', () => {
    const full = parseIssueResponse({ data: { issue: {
      identifier: 'ENG-1', title: 'T', description: 'D', priority: 2,
      state: { name: 'In Progress' }, assignee: { name: 'Ada' }, labels: { nodes: [{ name: 'bug' }, { name: 'p1' }] },
    } } });
    assert.equal(full?.state, 'In Progress');
    assert.deepEqual(full?.labels, ['bug', 'p1']);
    const sparse = parseIssueResponse({ data: { issue: { identifier: 'ENG-2', title: 'X', assignee: null, labels: null, state: null } } });
    assert.equal(sparse?.assignee, undefined);
    assert.deepEqual(sparse?.labels, []);
    assert.equal(parseIssueResponse({ data: { issue: null } }), null);
    assert.equal(parseIssueResponse({ errors: [{ message: 'nope' }] }), null);
  });

  test('toIntentPreview builds an UNCOMMITTED preview (committed:false)', () => {
    const p = toIntentPreview({ identifier: 'ENG-1', title: 'Fix login', priority: 1, labels: ['bug'] });
    assert.equal(p.committed, false);
    assert.equal(p.source, 'linear');
    assert.match(p.intent, /ENG-1 — Fix login/);
  });
});

suite('linear-client (B-INT-11 #97)', () => {
  const issueBody = JSON.stringify({ data: { issue: { identifier: 'ENG-1', title: 'Fix login', labels: { nodes: [] } } } });

  test('parse failure short-circuits before any network call', async () => {
    let called = false;
    const post: LinearPostFn = async () => { called = true; return { status: 200, body: issueBody }; };
    const r = await fetchLinearIssue('garbage', 'lin_api_xxx', post);
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });

  test('missing api key → error, no network', async () => {
    let called = false;
    const post: LinearPostFn = async () => { called = true; return { status: 200, body: issueBody }; };
    const r = await fetchLinearIssue('ENG-1', '', post);
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });

  test('happy path → uncommitted preview; rate-limit headers surfaced', async () => {
    const post: LinearPostFn = async () => ({ status: 200, body: issueBody, headers: { 'X-RateLimit-Requests-Remaining': '4999', 'X-RateLimit-Requests-Limit': '5000' } });
    const r = await fetchLinearIssue('https://linear.app/acme/issue/ENG-1', 'lin_api_secret', post);
    assert.equal(r.ok, true);
    assert.equal(r.preview?.committed, false);
    assert.equal(r.rateLimit?.remaining, 4999);
  });

  test('SECRET MASKING: the api key passes only in the Authorization header, never in the result', async () => {
    let sentAuth: string | undefined;
    const post: LinearPostFn = async (_u, headers) => { sentAuth = headers.Authorization; return { status: 200, body: issueBody }; };
    const r = await fetchLinearIssue('ENG-1', 'lin_api_TOPSECRET', post);
    assert.equal(sentAuth, 'lin_api_TOPSECRET', 'key is sent in the Authorization header');
    assert.ok(!JSON.stringify(r).includes('TOPSECRET'), 'key never appears anywhere in the returned result');
  });

  test('401/403 → auth error; 429 → rate-limit error (non-throwing)', async () => {
    const r401 = await fetchLinearIssue('ENG-1', 'k', async () => ({ status: 401, body: '' }));
    assert.equal(r401.ok, false); assert.match(r401.error ?? '', /auth/i);
    const r429 = await fetchLinearIssue('ENG-1', 'k', async () => ({ status: 429, body: '' }));
    assert.equal(r429.ok, false); assert.equal(r429.status, 429);
  });

  test('readRateLimit is defensive (no headers → undefined)', () => {
    assert.equal(readRateLimit(undefined), undefined);
    assert.equal(readRateLimit({}), undefined);
  });
});
