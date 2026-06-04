import { strict as assert } from 'assert';
import {
  parseJiraIssueKey, buildIssuePath, parseIssueResponse, toIntentPreview,
} from '../../../integrations/jira/jira-import';
import { fetchJiraIssue, type JiraGetFn } from '../../../integrations/jira/jira-client';

suite('jira-import parse (#98)', () => {
  test('resolves a Jira issue URL (with + without query) and a bare key, case-normalized', () => {
    assert.equal(parseJiraIssueKey('https://acme.atlassian.net/browse/PROJ-123'), 'PROJ-123');
    assert.equal(parseJiraIssueKey('https://acme.atlassian.net/browse/PROJ-123?focusedCommentId=1'), 'PROJ-123');
    assert.equal(parseJiraIssueKey('PROJ-123'), 'PROJ-123');
    assert.equal(parseJiraIssueKey('proj-123'), 'PROJ-123');
  });
  test('rejects garbage', () => {
    assert.equal(parseJiraIssueKey('not an issue'), null);
    assert.equal(parseJiraIssueKey('https://example.com/whatever'), null);
    assert.equal(parseJiraIssueKey(''), null);
  });
});

suite('jira-import path + parse + map (#98)', () => {
  test('buildIssuePath targets the v2 issue resource with explicit fields', () => {
    const path = buildIssuePath('PROJ-7');
    assert.match(path, /^\/rest\/api\/2\/issue\/PROJ-7\?fields=/);
    assert.match(path, /summary,description,status,priority,assignee,labels,components/);
  });

  test('parseIssueResponse tolerates missing fields + ignores custom fields; null when no issue', () => {
    const full = parseIssueResponse({ key: 'PROJ-1', fields: {
      summary: 'Fix login', description: 'Steps to repro', status: { name: 'In Progress' },
      priority: { name: 'High' }, assignee: { displayName: 'Ada Lovelace' },
      labels: ['bug', 'p1'], components: [{ name: 'auth' }, { name: 'api' }],
      customfield_10010: { weird: true }, // unknown custom field — must be ignored
    } });
    assert.equal(full?.summary, 'Fix login');
    assert.equal(full?.status, 'In Progress');
    assert.equal(full?.priority, 'High');
    assert.equal(full?.assignee, 'Ada Lovelace');
    assert.deepEqual(full?.labels, ['bug', 'p1']);
    assert.deepEqual(full?.components, ['auth', 'api']);

    const sparse = parseIssueResponse({ key: 'PROJ-2', fields: { summary: 'X', assignee: null, status: null, labels: null, components: null } });
    assert.equal(sparse?.assignee, undefined);
    assert.deepEqual(sparse?.labels, []);
    assert.deepEqual(sparse?.components, []);

    // ADF description object (v3 shape) → plain text fallback
    const adf = parseIssueResponse({ key: 'PROJ-3', fields: { summary: 'Y',
      description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'world' }] }] } } });
    assert.equal(adf?.description, 'hello world');

    assert.equal(parseIssueResponse({ errorMessages: ['Issue does not exist'] }), null);
    assert.equal(parseIssueResponse(null), null);
  });

  test('toIntentPreview builds an UNCOMMITTED preview with a source URL', () => {
    const p = toIntentPreview({ key: 'PROJ-1', summary: 'Fix login', labels: ['bug'], components: [] }, 'https://acme.atlassian.net');
    assert.equal(p.committed, false);
    assert.equal(p.source, 'jira');
    assert.match(p.intent, /PROJ-1 — Fix login/);
    assert.equal(p.sourceUrl, 'https://acme.atlassian.net/browse/PROJ-1');
  });
});

suite('jira-client (#98)', () => {
  const baseUrl = 'https://acme.atlassian.net';
  const issueBody = JSON.stringify({ key: 'PROJ-1', fields: { summary: 'Fix login', status: { name: 'To Do' }, labels: [], components: [] } });
  const auth = { baseUrl, email: 'dev@acme.com', apiToken: 'jira_TOPSECRET' };

  test('parse failure short-circuits before any network call', async () => {
    let called = false;
    const get: JiraGetFn = async () => { called = true; return { status: 200, body: issueBody }; };
    const r = await fetchJiraIssue('garbage', auth, get);
    assert.equal(r.ok, false); assert.equal(called, false);
  });

  test('missing baseUrl / credentials → error, no network', async () => {
    let called = false;
    const get: JiraGetFn = async () => { called = true; return { status: 200, body: issueBody }; };
    const noBase = await fetchJiraIssue('PROJ-1', { email: 'x', apiToken: 'y' }, get);
    assert.equal(noBase.ok, false); assert.equal(called, false);
    const noCreds = await fetchJiraIssue('PROJ-1', { baseUrl, email: '', apiToken: '' }, get);
    assert.equal(noCreds.ok, false); assert.equal(called, false);
  });

  test('happy path → uncommitted preview with source URL', async () => {
    const get: JiraGetFn = async (url) => { assert.match(url, /\/rest\/api\/2\/issue\/PROJ-1\?fields=/); return { status: 200, body: issueBody }; };
    const r = await fetchJiraIssue('https://acme.atlassian.net/browse/PROJ-1', auth, get);
    assert.equal(r.ok, true);
    assert.equal(r.preview?.committed, false);
    assert.equal(r.preview?.sourceUrl, 'https://acme.atlassian.net/browse/PROJ-1');
  });

  test('SECRET MASKING: the api token (and its base64) is sent only in the Authorization header, never in the result', async () => {
    let sentAuth: string | undefined;
    const get: JiraGetFn = async (_u, headers) => { sentAuth = headers.Authorization; return { status: 200, body: issueBody }; };
    const r = await fetchJiraIssue('PROJ-1', auth, get);
    assert.ok(sentAuth?.startsWith('Basic '), 'Basic auth header is sent');
    const b64 = Buffer.from('dev@acme.com:jira_TOPSECRET').toString('base64');
    assert.equal(sentAuth, `Basic ${b64}`, 'header is base64(email:token)');
    const s = JSON.stringify(r);
    assert.ok(!s.includes('jira_TOPSECRET'), 'raw token never appears in the result');
    assert.ok(!s.includes(b64), 'base64 credential never appears in the result');
  });

  test('401/403 → auth error; 404 → not found; 429 → rate limit (non-throwing)', async () => {
    const r401 = await fetchJiraIssue('PROJ-1', auth, async () => ({ status: 401, body: '' }));
    assert.equal(r401.ok, false); assert.match(r401.error ?? '', /auth/i);
    const r404 = await fetchJiraIssue('PROJ-1', auth, async () => ({ status: 404, body: '' }));
    assert.equal(r404.ok, false); assert.equal(r404.status, 404);
    const r429 = await fetchJiraIssue('PROJ-1', auth, async () => ({ status: 429, body: '' }));
    assert.equal(r429.ok, false); assert.equal(r429.status, 429);
  });
});
