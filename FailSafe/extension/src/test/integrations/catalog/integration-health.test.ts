// #479 (plan-v608 lane B, H1/H2/H4): catalog health comes from recorded
// evidence of real calls, never from configuration alone. H4 drives each
// adapter's real code (injected transports, recorded responses) and checks the
// health its outcome maps to.

import { strict as assert } from 'assert';
import * as os from 'os';
import * as path from 'path';
import {
  HEALTH_STALE_MS, HEALTH_STATE_KEY, IntegrationHealthStore, sanitizeEvidence, sanitizeSnapshot,
  type MementoLike,
} from '../../../integrations/catalog/integration-health';
import { buildIntegrationStatus, INTEGRATION_CATALOG, type IntegrationDescriptor } from '../../../integrations/catalog/integration-catalog';
import { fetchJiraIssue, type JiraGetFn } from '../../../integrations/jira/jira-client';
import { healthFromJiraFetch } from '../../../integrations/jira/jira-health';
import { fetchLinearIssue, type LinearPostFn } from '../../../integrations/linear/linear-client';
import { healthFromLinearFetch } from '../../../integrations/linear/linear-health';
import { importSentryRisks, type RiskSink } from '../../../integrations/sentry/sentry-import';
import { healthFromSentryImport } from '../../../integrations/sentry/sentry-health';
import { importSarifText } from '../../../integrations/sarif/sarif-to-risk';
import { healthFromSarifImport } from '../../../integrations/sarif/sarif-health';
import { publishCheckRunPayload, type GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';
import { buildManualAdvisoryPayload, type CheckRunPayload } from '../../../integrations/github-checks/github-checks-map';
import { healthFromGitHubPublish } from '../../../integrations/github-checks/github-checks-health';
import { runContinueGoverned } from '../../../integrations/agent-cli/continue-wrapper';
import type { AgentRunFn } from '../../../integrations/agent-cli/agent-cli-core';
import { healthFromAgentRun } from '../../../integrations/agent-cli/agent-cli-health';
import { healthFromMcpScan, healthFromOpenHandsImport } from '../../../integrations/agent-observe/agent-observe-health';
import { runMcpPolicyScan } from '../../../extension/agent-observe-command';
import { sendSlackNotification } from '../../../integrations/slack/slack-sender';
import { healthFromSlackDelivery } from '../../../integrations/slack/slack-health';
import { sendTeamsNotification } from '../../../integrations/teams/teams-sender';
import { healthFromTeamsDelivery } from '../../../integrations/teams/teams-health';
import { context as sentryContext, issue, OPTS as SENTRY_OPTS, server } from '../sentry/sentry-fixtures';

class MemoryMemento implements MementoLike {
  data = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.data.get(key) as T | undefined; }
  update(key: string, value: unknown): Promise<void> { this.data.set(key, JSON.parse(JSON.stringify(value))); return Promise.resolve(); }
}

const T0 = Date.parse('2026-10-15T12:00:00.000Z');
const jira = (): IntegrationDescriptor => INTEGRATION_CATALOG.find((d) => d.id === 'jira')!;
const CONFIGURED = {
  'failsafe.integrations.jira.enabled': true,
  'failsafe.integrations.jira.baseUrl': true,
  'failsafe.integrations.jira.email': true,
  'failsafe.integrations.jira.apiToken': true,
};
const ev = (result: string, ageMs = 0, category?: string) =>
  ({ result, category, checkedAt: new Date(T0 - ageMs).toISOString() });

suite('integration health states (#479 H1)', () => {
  test('configuration alone is configured-unverified; only evidence moves the state', () => {
    assert.equal(buildIntegrationStatus(jira(), CONFIGURED, {}, T0).state, 'configured-unverified');
    assert.equal(buildIntegrationStatus(jira(), CONFIGURED, { jira: ev('contract-verified') }, T0).state, 'contract-verified');
    assert.equal(buildIntegrationStatus(jira(), CONFIGURED, { jira: ev('connected') }, T0).state, 'connected');
    assert.equal(buildIntegrationStatus(jira(), CONFIGURED, { jira: ev('failing', 0, 'auth') }, T0).state, 'failing');
  });

  test('evidence older than 7 days is stale; 1 ms younger is not', () => {
    assert.equal(buildIntegrationStatus(jira(), CONFIGURED, { jira: ev('contract-verified', HEALTH_STALE_MS + 1) }, T0).state, 'stale');
    assert.equal(buildIntegrationStatus(jira(), CONFIGURED, { jira: ev('contract-verified', HEALTH_STALE_MS) }, T0).state, 'contract-verified');
  });

  test('disabled and needs-config win over any evidence', () => {
    const verified = { jira: ev('contract-verified') };
    assert.equal(buildIntegrationStatus(jira(), { ...CONFIGURED, 'failsafe.integrations.jira.enabled': false }, verified, T0).state, 'disabled');
    assert.equal(buildIntegrationStatus(jira(), { ...CONFIGURED, 'failsafe.integrations.jira.apiToken': false }, verified, T0).state, 'needs-config');
  });

  test('lastResult, capabilities and evidenceKind are reported', () => {
    const s = buildIntegrationStatus(jira(), CONFIGURED, { jira: ev('failing', 0, 'rate_limited') }, T0);
    assert.deepEqual(s.lastResult, { result: 'failing', category: 'rate_limited', checkedAt: new Date(T0).toISOString() });
    assert.deepEqual([...s.capabilities], ['issue-preview', 'intent-draft']);
    assert.equal(s.evidenceKind, 'service');
  });
});

suite('integration health store sanitizer (#479 H2)', () => {
  test('drops unknown ids, results, categories, non-ISO times and extra fields', () => {
    assert.equal(sanitizeEvidence({ result: 'healthy', checkedAt: new Date(T0).toISOString() }), undefined);
    assert.equal(sanitizeEvidence({ result: 'failing', category: 'oops', checkedAt: new Date(T0).toISOString() }), undefined);
    assert.equal(sanitizeEvidence({ result: 'failing', checkedAt: new Date(T0).toISOString() }), undefined);
    assert.equal(sanitizeEvidence({ result: 'connected', checkedAt: 'yesterday' }), undefined);
    assert.deepEqual(sanitizeEvidence({ result: 'connected', checkedAt: new Date(T0).toISOString(), detail: 'x' }),
      { result: 'connected', checkedAt: new Date(T0).toISOString() });
    assert.deepEqual(Object.keys(sanitizeSnapshot({ nope: ev('connected'), jira: ev('connected') })), ['jira']);
  });

  test('a token handed to the store in an extra field never reaches the stored value', () => {
    const memento = new MemoryMemento();
    const store = new IntegrationHealthStore(memento, () => T0);
    const secret = 'xoxb-SUPER-SECRET-TOKEN';
    (store.record as unknown as (...a: unknown[]) => void)('jira', 'failing', 'auth', secret);
    store.record('slack', 'failing', secret as never);
    memento.data.set('other', secret);
    const stored = JSON.stringify(memento.get(HEALTH_STATE_KEY));
    assert.ok(!stored.includes(secret), stored);
    assert.deepEqual(store.snapshot(), { jira: { result: 'failing', category: 'auth', checkedAt: new Date(T0).toISOString() } });
  });

  test('a forged snapshot planted in the memento is sanitized on read', () => {
    const memento = new MemoryMemento();
    memento.data.set(HEALTH_STATE_KEY, { jira: { result: 'contract-verified', checkedAt: 'now', note: 'trust me' }, sentry: ev('connected') });
    assert.deepEqual(Object.keys(new IntegrationHealthStore(memento).snapshot()), ['sentry']);
  });

  test('clear forgets only the named integrations', () => {
    const memento = new MemoryMemento();
    const store = new IntegrationHealthStore(memento, () => T0);
    store.record('jira', 'contract-verified');
    store.record('sentry', 'connected');
    store.clear(['jira']);
    assert.deepEqual(Object.keys(store.snapshot()), ['sentry']);
  });
});

// ---- H4: real adapter outcomes -> health -------------------------------------

const JIRA_AUTH = { baseUrl: 'https://acme.atlassian.net', email: 'a@b.c', apiToken: 'jira-token' };
const jiraGet = (status: number, body: string): JiraGetFn => async () => ({ status, body });
const linearPost = (status: number, body: string): LinearPostFn => async () => ({ status, body });
const ISSUE_BODY = JSON.stringify({ key: 'PROJ-1', fields: { summary: 'S' } });

suite('health from real adapter outcomes (#479 H4)', () => {
  test('Jira: parsed issue is verified; 200 with a non-issue body is contract; status and transport map', async () => {
    const h = async (get: JiraGetFn) => healthFromJiraFetch(await fetchJiraIssue('PROJ-1', JIRA_AUTH, get));
    assert.deepEqual(await h(jiraGet(200, ISSUE_BODY)), ['contract-verified']);
    assert.deepEqual(await h(jiraGet(200, '{"unexpected":true}')), ['failing', 'contract']);
    assert.deepEqual(await h(jiraGet(200, 'not json')), ['failing', 'contract']);
    assert.deepEqual(await h(jiraGet(401, '')), ['failing', 'auth']);
    assert.deepEqual(await h(jiraGet(429, '')), ['failing', 'rate_limited']);
    assert.deepEqual(await h(jiraGet(404, '')), ['failing', 'not_found']);
    assert.deepEqual(await h(jiraGet(502, '')), ['failing', 'http']);
    assert.deepEqual(await h(async () => { throw new Error('ECONNRESET'); }), ['failing', 'network']);
    assert.deepEqual(healthFromJiraFetch(await fetchJiraIssue('not a key', JIRA_AUTH, jiraGet(200, ISSUE_BODY))), []);
  });

  test('Linear: 200 with an errors array is contract; parsed issue is verified', async () => {
    const h = async (post: LinearPostFn) => healthFromLinearFetch(await fetchLinearIssue('ENG-1', 'lin_key', post));
    assert.deepEqual(await h(linearPost(200, JSON.stringify({ data: { issue: { identifier: 'ENG-1', title: 'T' } } }))), ['contract-verified']);
    assert.deepEqual(await h(linearPost(200, JSON.stringify({ data: { issue: null }, errors: [{ message: 'Entity not found' }] }))), ['failing', 'contract']);
    assert.deepEqual(await h(linearPost(401, '')), ['failing', 'auth']);
  });

  test('Sentry: ok with failed writes is storage, not verified; local-only is refused', async () => {
    const s = server([[issue('1'), issue('2'), issue('3')]]);
    let calls = 0;
    const flaky: RiskSink = { upsertWith: () => { calls++; if (calls <= 2) throw new Error('disk full'); return 'created'; } };
    const failed = await importSentryRisks(SENTRY_OPTS, s.get, flaky, sentryContext());
    assert.equal(failed.ok, true);
    assert.equal(failed.failed, 2);
    assert.deepEqual(healthFromSentryImport(failed), ['failing', 'storage']);
    const good = await importSentryRisks(SENTRY_OPTS, server([[issue('4')]]).get, { upsertWith: () => 'created' }, sentryContext());
    assert.deepEqual(healthFromSentryImport(good), ['contract-verified']);
    const local = await importSentryRisks({ ...SENTRY_OPTS, enabled: false }, s.get, flaky, sentryContext());
    assert.deepEqual(healthFromSentryImport(local), ['failing', 'refused']);
    const auth = await importSentryRisks(SENTRY_OPTS, async () => ({ status: 401, body: '' }), flaky, sentryContext());
    assert.deepEqual(healthFromSentryImport(auth), ['failing', 'auth']);
    assert.deepEqual(healthFromSentryImport({ ...good, write: { failed: 0, chunksFailed: 1 } }), ['failing', 'storage']);
    assert.deepEqual(healthFromSentryImport({ ...good, write: { failed: 3, chunksFailed: 0 } }), ['failing', 'storage']);
  });

  test('SARIF: throwing sink is storage, parse error is contract, unreadable is contract, zero results is parsed', () => {
    const sarif = (results: unknown[]) => JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'semgrep' } }, results }] });
    const one = [{ ruleId: 'r', level: 'error', message: { text: 'm' }, locations: [] }];
    assert.deepEqual(healthFromSarifImport(importSarifText(sarif(one), () => { throw new Error('locked'); })), ['failing', 'storage']);
    assert.deepEqual(healthFromSarifImport(importSarifText('{ not sarif', () => undefined)), ['failing', 'contract']);
    assert.deepEqual(healthFromSarifImport({ unreadable: true }), ['failing', 'contract']);
    assert.deepEqual(healthFromSarifImport(importSarifText(sarif([]), () => undefined)), ['contract-verified']);
    assert.deepEqual(healthFromSarifImport(importSarifText(sarif(one), () => undefined)), ['contract-verified']);
    const ok = importSarifText(sarif(one), () => undefined);
    assert.deepEqual(healthFromSarifImport({ ...ok, write: { failed: 0, chunksFailed: 1 } }), ['failing', 'storage']);
  });

  test('GitHub: created run is verified; refusal, bad base URL, auth and transport map', async () => {
    const SHA = 'a'.repeat(40);
    const ctx = { remoteUrl: 'https://github.com/acme/x', headSha: SHA };
    const opts = { enabled: true, token: 'ghp_x' };
    const post = (status: number, body: string): GitHubPostFn => async () => ({ status, body });
    const advisory = buildManualAdvisoryPayload(SHA);
    const h = async (p: CheckRunPayload, o: typeof opts & { apiBaseUrl?: string }, f: GitHubPostFn) =>
      healthFromGitHubPublish(await publishCheckRunPayload(p, ctx, o, f));
    assert.deepEqual(await h(advisory, opts, post(201, JSON.stringify({ id: 7 }))), ['contract-verified']);
    assert.deepEqual(await h({ ...advisory, name: 'FailSafe SHIELD', conclusion: 'success' } as unknown as CheckRunPayload, opts, post(201, '{"id":1}')), ['failing', 'refused']);
    assert.deepEqual(await h(advisory, { ...opts, apiBaseUrl: 'ht!tp://bad' }, post(201, '{"id":1}')), ['failing', 'config']);
    assert.deepEqual(await h(advisory, opts, post(401, '')), ['failing', 'auth']);
    assert.deepEqual(await h(advisory, opts, async () => { throw new Error('ETIMEDOUT'); }), ['failing', 'network']);
    assert.deepEqual(await h(advisory, opts, post(201, 'not json')), ['failing', 'contract']);
  });

  test('Continue: missing binary is not_installed; a run blocked before spawn records nothing', async () => {
    const cwd = os.tmpdir();
    const resolve = (name: string) => path.join(os.tmpdir(), 'fixture-bin', name);
    const run = (versionCode: number): AgentRunFn => async (_cmd, args) => ({ stdout: args[0] === '--version' ? 'cn 1.0.0' : '', stderr: '', code: args[0] === '--version' ? versionCode : 0 });
    const base = { prompt: 'p', allow: [], cwd, timeoutMs: 1000 };
    const missing = await runContinueGoverned({ ...base, writesAllowed: true }, { run: run(127), classify: () => 'L1', issuedAt: 't', resolve });
    assert.deepEqual(healthFromAgentRun(missing), ['failing', 'not_installed']);
    const blocked = await runContinueGoverned({ ...base, writesAllowed: false }, { run: run(0), classify: () => 'L1', issuedAt: 't', resolve });
    assert.equal(blocked.status, 'BLOCKED_PRE_EXECUTION');
    assert.deepEqual(healthFromAgentRun(blocked), []);
    assert.deepEqual(healthFromAgentRun({ available: true, spawned: true }), ['connected']);
  });

  test('agent audit and OpenHands: parsed, storage, nothing scanned; a version only from the setting is connected', () => {
    const files: Record<string, string> = { [path.join('/ws', '.mcp.json')]: JSON.stringify({ mcpServers: { s: { command: 'bash' } } }) };
    const read = (f: string) => { if (files[f] === undefined) throw new Error('ENOENT'); return files[f]; };
    assert.deepEqual(healthFromMcpScan(runMcpPolicyScan('/ws', () => undefined, read)), ['contract-verified']);
    assert.deepEqual(healthFromMcpScan(runMcpPolicyScan('/ws', () => { throw new Error('locked'); }, read)), ['failing', 'storage']);
    assert.deepEqual(healthFromMcpScan(runMcpPolicyScan('/empty', () => undefined, read)), []);
    assert.deepEqual(healthFromOpenHandsImport({ kind: 'imported', versionDeclaredByExport: false }), ['connected']);
    assert.deepEqual(healthFromOpenHandsImport({ kind: 'imported', versionDeclaredByExport: true }), ['contract-verified']);
    assert.deepEqual(healthFromOpenHandsImport({ kind: 'unsupported-version' }), ['failing', 'unsupported_version']);
  });

  test('Slack and Teams: 2xx is connected, never verified; 429, 500, transport and oversize map', async () => {
    const notice = { kind: 'veto', title: 't', detail: 's' } as never;
    const s = async (status: number | Error) => healthFromSlackDelivery(await sendSlackNotification('https://hooks.slack.com/x', notice,
      async () => { if (status instanceof Error) throw status; return { status }; }));
    assert.deepEqual(await s(200), ['connected']);
    assert.deepEqual(await s(429), ['failing', 'rate_limited']);
    assert.deepEqual(await s(500), ['failing', 'http']);
    assert.deepEqual(await s(new Error('ENOTFOUND')), ['failing', 'network']);
    assert.deepEqual(healthFromSlackDelivery(await sendSlackNotification(undefined, notice, async () => ({ status: 200 }))), []);
    const t = async (status: number) => healthFromTeamsDelivery(await sendTeamsNotification('https://x.webhook.office.com/y', notice, async () => ({ status })));
    assert.deepEqual(await t(202), ['connected']);
    assert.deepEqual(await t(429), ['failing', 'rate_limited']);
    const huge = { kind: 'veto', title: 't', consoleUrl: 'http://127.0.0.1/' + 'x'.repeat(30000) } as never;
    assert.deepEqual(healthFromTeamsDelivery(await sendTeamsNotification('https://x.webhook.office.com/y', huge, async () => ({ status: 200 }))), ['failing', 'refused']);
  });
});
