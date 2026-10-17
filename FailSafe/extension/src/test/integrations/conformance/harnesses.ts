/**
 * Conformance harnesses (#474): for every catalog adapter and every capability
 * it claims, a function that drives the adapter's real code (its injected
 * transport fed recorded responses, real IntentService and git worktrees in
 * temporary folders) and returns what it observed. contracts.ts judges it.
 * No live provider is contacted.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentService } from '../../../governance/IntentService';
import { SessionManager } from '../../../governance/SessionManager';
import { IntentHistoryLog } from '../../../governance/IntentHistoryLog';
import { fetchJiraIssue } from '../../../integrations/jira/jira-client';
import { healthFromJiraFetch } from '../../../integrations/jira/jira-health';
import { fetchLinearIssue } from '../../../integrations/linear/linear-client';
import { healthFromLinearFetch } from '../../../integrations/linear/linear-health';
import {
  fromJiraPreview, fromLinearPreview, previewMarkdown, reviewAndImport, type ImportReviewUi, type TrackerIssue,
} from '../../../integrations/tracker-import/tracker-intent-import';
import { observeOpenHandsRun } from '../../../integrations/agent-observe/openhands-observer';
import { evidencePath, persistOpenHandsObservations } from '../../../integrations/agent-observe/openhands-import';
import { EVIDENCE_KEY_ID, EvidenceKeyHolder, type SecretsLike } from '../../../integrations/agent-observe/openhands-signing';
import { OpenHandsEvidenceReader } from '../../../integrations/agent-observe/openhands-evidence';
import { healthFromMcpScan } from '../../../integrations/agent-observe/agent-observe-health';
import {
  getIntegrationHealthStore, IntegrationHealthStore, setIntegrationHealthStore, type HealthMapping,
} from '../../../integrations/catalog/integration-health';
import { auditMcpConfig } from '../../../integrations/agent-observe/mcp-policy-audit';
import { runMcpPolicyScan } from '../../../extension/agent-observe-command';
import { runOpenHandsImport } from '../../../extension/openhands-import-command';
import { importSarifText } from '../../../integrations/sarif/sarif-to-risk';
import { healthFromSarifImport } from '../../../integrations/sarif/sarif-health';
import { importSentryRisks, type RiskSink } from '../../../integrations/sentry/sentry-import';
import { healthFromSentryImport } from '../../../integrations/sentry/sentry-health';
import { publishCheckRunPayload, type GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';
import { buildManualAdvisoryPayload } from '../../../integrations/github-checks/github-checks-map';
import { healthFromGitHubPublish } from '../../../integrations/github-checks/github-checks-health';
import { sendSlackNotification } from '../../../integrations/slack/slack-sender';
import { healthFromSlackDelivery } from '../../../integrations/slack/slack-health';
import { sendTeamsNotification } from '../../../integrations/teams/teams-sender';
import { healthFromTeamsDelivery } from '../../../integrations/teams/teams-health';
import { runContinueGoverned } from '../../../integrations/agent-cli/continue-wrapper';
import { runAiderGoverned } from '../../../integrations/agent-cli/aider-wrapper';
import type { AgentRunFn, AgentRunOutcome } from '../../../integrations/agent-cli/agent-cli-core';
import { healthFromAgentRun } from '../../../integrations/agent-cli/agent-cli-health';
import { runJiraImport } from '../../../extension/jira-command';
import { runLinearImport } from '../../../extension/linear-command';
import { jiraReplay, linearReplay, loadFixture } from '../tracker-import/replay';
import { context as sentryContext, issue as sentryIssue, OPTS as SENTRY_OPTS, server as sentryServer } from '../sentry/sentry-fixtures';
import { makeRepo, read, removeRepo, useGitConfig } from '../agent-cli/git-fixture';
import type { Harnesses, RiskRecord } from './contracts';

const JIRA_TOKEN = 'conf_jira_tok_7777';
const JIRA_AUTH = { baseUrl: 'https://acme.atlassian.net', email: 'me@acme.test', apiToken: JIRA_TOKEN };
const LINEAR_KEY = 'conf_lin_key_8888';

const roots: string[] = [];
function tmp(prefix: string): string {
  const r = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(r);
  return r;
}
export function cleanupHarnesses(): void {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true, maxRetries: 3 });
}

function service(root: string): IntentService {
  const s = new IntentService(root, new SessionManager(root));
  s.setGovernanceModeGetter(() => 'observe');
  return s;
}

async function createdCount(root: string): Promise<number> {
  return (await new IntentHistoryLog(path.join(root, '.failsafe', 'manifest')).loadAllEntries()).filter((e) => e.event === 'CREATED').length;
}

function quietUi(approve: boolean): ImportReviewUi {
  return {
    showPreview: async () => undefined, confirmCreate: async () => approve, editPurpose: async (v) => v,
    pickPlanId: async () => 'plan-1', info: () => undefined, warn: () => undefined, error: () => undefined,
  };
}

const importUi = { warn: () => Promise.resolve(undefined), moveToSecureStorage: () => undefined, error: () => undefined, info: () => undefined, progress: <T>(_t: string, f: () => Promise<T>) => f() };

/** decline -> approve -> repeat, through the real review flow and a real IntentService. */
async function intentDraft(issue: TrackerIssue, expectedRef: string) {
  const root = tmp('fs-conf-int-');
  const intents = service(root);
  await reviewAndImport(issue, { intents, ui: quietUi(false), governanceMode: () => 'observe' });
  const afterDecline = await createdCount(root);
  await reviewAndImport(issue, { intents, ui: quietUi(true), governanceMode: () => 'observe' });
  const afterApprove = await createdCount(root);
  const externalRef = (await intents.getActiveIntent())?.metadata.externalRef;
  const restartedRef = (await service(root).getActiveIntent())?.metadata.externalRef;
  await reviewAndImport(issue, { intents, ui: quietUi(true), governanceMode: () => 'observe' });
  return { afterDecline, afterApprove, externalRef, restartedRef, expectedRef, afterRepeat: await createdCount(root) };
}

async function jiraIssue(): Promise<TrackerIssue> {
  const r = await fetchJiraIssue('PROJ-123', JIRA_AUTH, jiraReplay(['jira-PROJ-123']).fn);
  return fromJiraPreview(r.preview!);
}

async function linearIssue(): Promise<TrackerIssue> {
  const r = await fetchLinearIssue('ENG-42', LINEAR_KEY, linearReplay([{ fixture: 'linear-ENG-42', id: 'ENG-42' }]).fn);
  return fromLinearPreview(r.preview!);
}

// ---- OpenHands ------------------------------------------------------------------

class Secrets {
  stored: string | undefined;
  private readonly ls = new Set<(e: { key: string }) => void>();
  context(): SecretsLike {
    return {
      get: async () => this.stored,
      store: async (_k, v) => { this.stored = v; this.ls.forEach((l) => l({ key: EVIDENCE_KEY_ID })); },
      onDidChange: (l) => { this.ls.add(l); return { dispose: () => this.ls.delete(l) }; },
    };
  }
}
const OH = (id: string) => ({ id, timestamp: '2026-10-10T10:00:00Z', action: { kind: 'ExecuteBashAction' }, tool_name: 'execute_bash' });

async function openhandsTimeline() {
  const root = tmp('fs-conf-oh-');
  const keys = new EvidenceKeyHolder(new Secrets().context());
  const raw = [OH('c1'), OH('c2')];
  const bytes = Buffer.from(JSON.stringify({ version: '1.0.0', events: raw }));
  const recs = observeOpenHandsRun(raw, '1.0.0').records;
  await persistOpenHandsObservations(root, path.join(root, 'run.json'), bytes, recs, { keys });
  const repeat = await persistOpenHandsObservations(root, path.join(root, 'run.json'), bytes, recs, { keys });
  const entries = new OpenHandsEvidenceReader(keys, () => [{ fsPath: root, name: 'ws' }]).read().entries;
  const forgedRoot = tmp('fs-conf-ohf-');
  fs.mkdirSync(path.dirname(evidencePath(forgedRoot)), { recursive: true });
  fs.copyFileSync(evidencePath(root), evidencePath(forgedRoot));
  const fresh = new EvidenceKeyHolder(new Secrets().context());
  await fresh.ensureKey(); await fresh.loadKey();
  const forgedEntries = new OpenHandsEvidenceReader(fresh, () => [{ fsPath: forgedRoot, name: 'clone' }]).read().entries.length;
  return { entries, repeatImported: repeat.imported, forgedEntries };
}

async function openhandsStatus() {
  const root = tmp('fs-conf-ohs-');
  const keys = new EvidenceKeyHolder(new Secrets().context());
  const good = path.join(root, 'good.json');
  fs.writeFileSync(good, JSON.stringify({ version: '1.0.0', events: [OH('s1')] }));
  const bad = path.join(root, 'bad.json');
  fs.writeFileSync(bad, '{ nope');
  const ui = (file: string) => ({ pickFile: async () => file, confirm: async () => true, info: () => undefined, warn: () => undefined, error: () => undefined });
  // What the command itself records, read back from a temporary health store.
  const health = async (file: string): Promise<HealthMapping> => {
    const data = new Map<string, unknown>();
    const store = new IntegrationHealthStore({ get: <T>(k: string) => data.get(k) as T, update: (k, v) => { data.set(k, v); return Promise.resolve(); } });
    const previous = getIntegrationHealthStore();
    setIntegrationHealthStore(store);
    try { await runOpenHandsImport({ workspaceRoot: root, enabled: true, ui: ui(file), keys }); } finally { setIntegrationHealthStore(previous); }
    const ev = store.snapshot().openhands;
    if (!ev) return [];
    return ev.result === 'failing' ? ['failing', ev.category!] : [ev.result] as HealthMapping;
  };
  return { success: await health(good), failure: await health(bad) };
}

// ---- risk ingest ------------------------------------------------------------------

function capturingSink(): { records: RiskRecord[]; upsert: (r: Record<string, unknown>) => void } {
  const records: RiskRecord[] = [];
  return { records, upsert: (r) => { records.push(r as RiskRecord); } };
}

const SARIF = JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'semgrep' } }, results: [
  { ruleId: 'js.no-eval', level: 'error', message: { text: 'eval is dangerous' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.js' }, region: { startLine: 3 } } }] },
  { ruleId: 'js.weak-hash', level: 'warning', message: { text: 'md5' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/b.js' }, region: { startLine: 9 } } }] },
] }] });

function sarifIngest() {
  const a = capturingSink(); importSarifText(SARIF, a.upsert);
  const b = capturingSink(); importSarifText(SARIF, b.upsert);
  let threw = false; let failed = 0;
  try { failed = importSarifText(SARIF, () => { throw new Error('locked'); }).failed; } catch { threw = true; }
  return { records: a.records, secondIds: b.records.map((r) => String(r.id)), throwingSinkThrew: threw, throwingSinkFailed: failed };
}

const MCP_SECRET = 'sk-mcp-SECRET-424242';
const MCP_CONFIG = JSON.stringify({ mcpServers: {
  shell: { command: '/usr/bin/bash', args: ['-c', 'x'], env: { API_TOKEN: MCP_SECRET }, autoApprove: ['*'] },
  remote: { url: `https://mcp.example.com/sse?token=${MCP_SECRET}`, type: 'sse' },
} });

function mcpRead(root: string) {
  return (f: string) => { if (f === path.join(root, '.mcp.json')) return MCP_CONFIG; throw new Error('ENOENT'); };
}

function mcpIngest() {
  const root = path.join(os.tmpdir(), 'fs-conf-mcp-virtual');
  const a = capturingSink(); runMcpPolicyScan(root, a.upsert, mcpRead(root));
  const b = capturingSink(); runMcpPolicyScan(root, b.upsert, mcpRead(root));
  let threw = false; let failed = 0;
  try { failed = runMcpPolicyScan(root, () => { throw new Error('locked'); }, mcpRead(root)).failed; } catch { threw = true; }
  return { records: a.records, secondIds: b.records.map((r) => String(r.id)), throwingSinkThrew: threw, throwingSinkFailed: failed };
}

async function sentryIngest() {
  const pages = [[sentryIssue('101'), sentryIssue('102')]];
  const capture = (): { records: RiskRecord[]; sink: RiskSink } => {
    const records: RiskRecord[] = [];
    return { records, sink: { upsertWith: (_id, build) => { records.push(build(undefined) as RiskRecord); return 'created'; } } };
  };
  const a = capture(); await importSentryRisks(SENTRY_OPTS, sentryServer(pages).get, a.sink, sentryContext());
  const b = capture(); await importSentryRisks(SENTRY_OPTS, sentryServer(pages).get, b.sink, sentryContext());
  let threw = false; let failed = 0;
  try { failed = (await importSentryRisks(SENTRY_OPTS, sentryServer(pages).get, { upsertWith: () => { throw new Error('locked'); } }, sentryContext())).failed; } catch { threw = true; }
  return { records: a.records, secondIds: b.records.map((r) => String(r.id)), throwingSinkThrew: threw, throwingSinkFailed: failed };
}

// ---- GitHub, Slack, Teams ------------------------------------------------------------

const SHA = 'c'.repeat(40);
const GH_CTX = { remoteUrl: 'https://github.com/acme/widgets', headSha: SHA };
const GH_OPTS = { enabled: true, token: 'ghp_conformance' };

async function githubPublish() {
  let body: Record<string, unknown> = {};
  const post: GitHubPostFn = async (_u, _h, b) => { body = JSON.parse(b); return { status: 201, body: JSON.stringify({ id: 11, head_sha: SHA }) }; };
  await publishCheckRunPayload(buildManualAdvisoryPayload(SHA), GH_CTX, GH_OPTS, post);
  const failure = await publishCheckRunPayload(buildManualAdvisoryPayload(SHA), GH_CTX, GH_OPTS, async () => { throw new Error('ECONNRESET'); });
  return { conclusion: body.conclusion, name: body.name, failureOk: failure.ok };
}

async function githubStatus() {
  const ok = await publishCheckRunPayload(buildManualAdvisoryPayload(SHA), GH_CTX, GH_OPTS, async () => ({ status: 201, body: JSON.stringify({ id: 12 }) }));
  const denied = await publishCheckRunPayload(buildManualAdvisoryPayload(SHA), GH_CTX, GH_OPTS, async () => ({ status: 401, body: '' }));
  return { success: healthFromGitHubPublish(ok), failure: healthFromGitHubPublish(denied) };
}

const NOTICE = { kind: 'veto', title: 'Veto on a.ts', detail: 'blocked' } as const;

async function notify(send: (status: number) => Promise<{ ok: boolean }>) {
  const okResult = await send(200);
  let threw = false; let failResult = { ok: true };
  try { failResult = await send(500); } catch { threw = true; }
  return { okResult, failResult, threw };
}
const slackSend = (status: number) => sendSlackNotification('https://hooks.slack.com/services/T/B/x', NOTICE, async () => ({ status }));
const teamsSend = (status: number) => sendTeamsNotification('https://acme.webhook.office.com/x', NOTICE, async () => ({ status }));

// ---- Continue / Aider ----------------------------------------------------------------

const fixtureExe = (name: string) => path.join(os.tmpdir(), 'fixture-bin', name);

function editingRunner(versionCode = 0): AgentRunFn {
  return async (cmd, args, opts) => {
    if (args[0] === '--version') return { stdout: `${cmd} 1.0.0`, stderr: '', code: versionCode };
    fs.writeFileSync(path.join(opts?.cwd ?? '.', 'README.md'), 'edited by the agent\n');
    return { stdout: 'done', stderr: '', code: 0 };
  };
}

async function inRepo<T>(work: (root: string) => Promise<T>): Promise<T> {
  const cfg = useGitConfig();
  const ceiling = process.env.GIT_CEILING_DIRECTORIES;
  const root = makeRepo({ 'README.md': 'readme\n' });
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  try { return await work(root); } finally {
    if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = ceiling;
    removeRepo(root); cfg.restore();
  }
}

type AgentRun = (root: string, run: AgentRunFn) => Promise<AgentRunOutcome>;
const continueRun: AgentRun = (root, run) => runContinueGoverned({ prompt: 'p', allow: [], cwd: root, writesAllowed: true, timeoutMs: 60000 }, { run, classify: () => 'L1', issuedAt: 'T', resolve: fixtureExe });
const aiderRun: AgentRun = (root, run) => runAiderGoverned({ prompt: 'p', cwd: root, writesAllowed: true, timeoutMs: 60000 }, { run, classify: () => 'L1', issuedAt: 'T', resolve: fixtureExe });

function isolated(runAgent: AgentRun) {
  return () => inRepo(async (root) => {
    const out = await runAgent(root, editingRunner());
    return { status: out.status, hasChangeSet: !!out.changeSet, workspaceUnchanged: read(root, 'README.md') === 'readme\n' };
  });
}

function agentStatus(runAgent: AgentRun) {
  return () => inRepo(async (root) => ({
    success: healthFromAgentRun(await runAgent(root, editingRunner())),
    failure: healthFromAgentRun(await runAgent(root, editingRunner(127))),
  }));
}

// ---- the registry ------------------------------------------------------------------

export const HARNESSES: Harnesses = {
  jira: {
    'issue-preview': async () => {
      const issue = await jiraIssue();
      let calls = 0;
      await runJiraImport(async () => 'PROJ-123', {
        creds: {} as never, endpoints: {} as never, enabled: false, email: 'me@acme.test',
        get: async () => { calls++; return { status: 200, body: '{}' }; }, ui: importUi as never,
      });
      return { key: issue.key, title: issue.title, url: issue.url!, text: previewMarkdown(issue), disabledCalls: calls, secrets: [JIRA_TOKEN, Buffer.from(`me@acme.test:${JIRA_TOKEN}`).toString('base64')] };
    },
    'intent-draft': async () => intentDraft(await jiraIssue(), 'jira:PROJ-123'),
    'status-evidence': async () => ({
      success: healthFromJiraFetch(await fetchJiraIssue('PROJ-123', JIRA_AUTH, jiraReplay(['jira-PROJ-123']).fn)),
      failure: healthFromJiraFetch(await fetchJiraIssue('PROJ-123', JIRA_AUTH, jiraReplay(['jira-PROJ-123-401']).fn)),
    }),
  },
  linear: {
    'issue-preview': async () => {
      const issue = await linearIssue();
      let calls = 0;
      await runLinearImport(async () => 'ENG-42', {
        creds: {} as never, enabled: false, post: async () => { calls++; return { status: 200, body: '{}' }; }, ui: importUi as never,
      });
      return { key: issue.key, title: issue.title, url: issue.url!, text: previewMarkdown(issue), disabledCalls: calls, secrets: [LINEAR_KEY] };
    },
    'intent-draft': async () => intentDraft(await linearIssue(), 'linear:ENG-42'),
    'status-evidence': async () => ({
      success: healthFromLinearFetch(await fetchLinearIssue('ENG-42', LINEAR_KEY, linearReplay([{ fixture: 'linear-ENG-42', id: 'ENG-42' }]).fn)),
      failure: healthFromLinearFetch(await fetchLinearIssue('ENG-42', LINEAR_KEY, linearReplay([{ fixture: 'linear-ENG-42-401', id: 'ENG-42' }]).fn)),
    }),
  },
  openhands: {
    'timeline-evidence': openhandsTimeline,
    'status-evidence': openhandsStatus,
  },
  'agent-audit': {
    'policy-audit': async () => {
      const findings = auditMcpConfig('project', MCP_CONFIG);
      return { highFindings: findings.filter((f) => f.severity === 'high').length, findingsText: JSON.stringify(findings), secret: MCP_SECRET };
    },
    'risk-ingest': async () => mcpIngest(),
    'status-evidence': async () => {
      const root = path.join(os.tmpdir(), 'fs-conf-mcp-virtual');
      return {
        success: healthFromMcpScan(runMcpPolicyScan(root, () => undefined, mcpRead(root))),
        failure: healthFromMcpScan(runMcpPolicyScan(root, () => { throw new Error('locked'); }, mcpRead(root))),
      };
    },
  },
  sarif: {
    'risk-ingest': async () => sarifIngest(),
    'status-evidence': async () => ({
      success: healthFromSarifImport(importSarifText(SARIF, () => undefined)),
      failure: healthFromSarifImport(importSarifText('{ not sarif', () => undefined)),
    }),
  },
  sentry: {
    'risk-ingest': sentryIngest,
    'status-evidence': async () => ({
      success: healthFromSentryImport(await importSentryRisks(SENTRY_OPTS, sentryServer([[sentryIssue('201')]]).get, { upsertWith: () => 'created' }, sentryContext())),
      failure: healthFromSentryImport(await importSentryRisks(SENTRY_OPTS, async () => ({ status: 401, body: '' }), { upsertWith: () => 'created' }, sentryContext())),
    }),
  },
  'github-checks': {
    'check-publish': githubPublish,
    'status-evidence': githubStatus,
  },
  slack: {
    notify: () => notify(slackSend),
    'status-evidence': async () => ({ success: healthFromSlackDelivery(await slackSend(200)), failure: healthFromSlackDelivery(await slackSend(500)) }),
  },
  teams: {
    notify: () => notify(teamsSend),
    'status-evidence': async () => ({ success: healthFromTeamsDelivery(await teamsSend(202)), failure: healthFromTeamsDelivery(await teamsSend(500)) }),
  },
  continue: {
    'isolated-run': isolated(continueRun),
    'status-evidence': agentStatus(continueRun),
  },
  aider: {
    'isolated-run': isolated(aiderRun),
    'status-evidence': agentStatus(aiderRun),
  },
};

export { loadFixture };
