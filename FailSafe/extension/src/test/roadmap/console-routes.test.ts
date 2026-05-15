// Functional tests for browser-served Console HTML routes (FX120-FX127, FX130-FX132).
// Each route's render() is invoked directly with mock req/res + minimal mock deps.
// Sink: real HTML body content captured via res.send / res.redirect / res.status.
//
// Coverage: empty state + populated state for routes whose deps have a sensible
// empty signal; status + redirect for action POSTs.

import { strict as assert } from 'assert';
import {
  HomeRoute, RunDetailRoute, WorkflowsRoute, SkillsRoute,
  GenomeRoute, ReportsRoute, SettingsRoute, GovernanceKPIRoute,
  PreflightRoute, AgentCoverageRoute,
} from '../../roadmap/routes';

interface MockRes {
  statusCode: number;
  sent: string;
  redirected: string | null;
  send(content: string): MockRes;
  status(code: number): MockRes;
  redirect(url: string): MockRes;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    sent: '',
    redirected: null,
    send(content: string) { this.sent = String(content); return this; },
    status(code: number) { this.statusCode = code; return this; },
    redirect(url: string) { this.redirected = url; return this; },
  };
  return res;
}

function makeReq(params: Record<string, string> = {}, body: Record<string, unknown> = {}): any {
  return { params, body };
}

function makeDeps(overrides: Record<string, unknown> = {}): any {
  return Object.assign({
    planManager: {
      getCurrentSprint: () => null,
      getAllPlans: () => [],
      getPlan: () => null,
      getPlanProgress: () => ({ completed: 0, total: 0, blocked: 0 }),
    },
    ledgerManager: {
      getRecentEntries: async () => [],
    },
    shadowGenomeManager: {
      analyzeFailurePatterns: async () => [],
      getUnresolvedEntries: async () => [],
    },
    enforcementEngine: {
      getGovernanceMode: () => 'observe',
    },
    configProfile: {
      getAll: () => [],
    },
    getInstalledSkills: () => [],
  }, overrides);
}

suite('Console HTML routes (FX120-FX132)', () => {

  test('FX120 HomeRoute — empty state when no current sprint', async () => {
    const res = makeRes();
    await HomeRoute.render(makeReq(), res as any, makeDeps());
    assert.equal(res.statusCode, 200);
    assert.match(res.sent, /<title>No /i);
  });

  test('FX120 HomeRoute — populated state shows mode + sprint + ledger entries', async () => {
    const res = makeRes();
    await HomeRoute.render(makeReq(), res as any, makeDeps({
      planManager: { getCurrentSprint: () => ({ id: 'sprint-1', name: 'Test Sprint' }) },
      ledgerManager: {
        getRecentEntries: async () => [
          { timestamp: '2026-05-07T00:00:00Z', eventType: 'AUDIT_PASS', agentDid: 'did:test' },
        ],
      },
      enforcementEngine: { getGovernanceMode: () => 'enforce' },
    }));
    assert.match(res.sent, /<title>FailSafe Console<\/title>/);
    assert.match(res.sent, /Test Sprint/);
    assert.match(res.sent, />enforce</);
    assert.match(res.sent, /AUDIT_PASS/);
  });

  test('FX121 RunDetailRoute — 404 for unknown id', async () => {
    const res = makeRes();
    await RunDetailRoute.render(makeReq({ runId: 'missing' }), res as any, makeDeps());
    assert.equal(res.statusCode, 404);
    assert.match(res.sent, /not found/i);
  });

  test('FX121 RunDetailRoute — known id renders progress', async () => {
    const res = makeRes();
    await RunDetailRoute.render(makeReq({ runId: 'plan-1' }), res as any, makeDeps({
      planManager: {
        getPlan: () => ({ id: 'plan-1', title: 'Test Plan' }),
        getPlanProgress: () => ({ completed: 3, total: 10, blocked: 1 }),
      },
    }));
    assert.equal(res.statusCode, 200);
    assert.match(res.sent, /Test Plan/);
    assert.match(res.sent, /Completed: 3 \/ 10/);
    assert.match(res.sent, /Blocked: 1/);
  });

  test('FX122 WorkflowsRoute — empty state when no plans', async () => {
    const res = makeRes();
    await WorkflowsRoute.render(makeReq(), res as any, makeDeps());
    assert.match(res.sent, /<title>No /i);
  });

  test('FX122 WorkflowsRoute — lists plans with run-detail links', async () => {
    const res = makeRes();
    await WorkflowsRoute.render(makeReq(), res as any, makeDeps({
      planManager: { getAllPlans: () => [
        { id: 'plan-1', title: 'First plan' },
        { id: 'plan-2', title: 'Second plan' },
      ] },
    }));
    assert.match(res.sent, /<a href="\/console\/run\/plan-1">/);
    assert.match(res.sent, /<a href="\/console\/run\/plan-2">/);
    assert.match(res.sent, /First plan/);
  });

  test('FX123 SkillsRoute — empty state when no skills installed', async () => {
    const res = makeRes();
    await SkillsRoute.render(makeReq(), res as any, makeDeps());
    assert.match(res.sent, /<title>No /i);
  });

  test('FX123 SkillsRoute — lists installed skills with versions', async () => {
    const res = makeRes();
    await SkillsRoute.render(makeReq(), res as any, makeDeps({
      getInstalledSkills: () => [
        { name: 'qor-audit', version: '1.0.0' },
        { name: 'qor-implement' },
      ],
    }));
    assert.match(res.sent, /qor-audit/);
    assert.match(res.sent, /1\.0\.0/);
    assert.match(res.sent, /qor-implement/);
    assert.match(res.sent, />-</); // dash for missing version
  });

  test('FX124 GenomeRoute — empty state when no patterns or unresolved', async () => {
    const res = makeRes();
    await GenomeRoute.render(makeReq(), res as any, makeDeps());
    assert.match(res.sent, /<title>No /i);
  });

  test('FX124 GenomeRoute — populated shows patterns + unresolved tables', async () => {
    const res = makeRes();
    await GenomeRoute.render(makeReq(), res as any, makeDeps({
      shadowGenomeManager: {
        analyzeFailurePatterns: async () => [
          { failureMode: 'TEST_ASSERTION_FAILED', count: 7 },
        ],
        getUnresolvedEntries: async () => [
          { id: 'sg-001', failureMode: 'STALE_CACHE', remediationStatus: 'open' },
        ],
      },
    }));
    assert.match(res.sent, /TEST_ASSERTION_FAILED/);
    assert.match(res.sent, />7</);
    assert.match(res.sent, /sg-001/);
    assert.match(res.sent, /STALE_CACHE/);
  });

  test('FX125 ReportsRoute — counts AUDIT_PASS / AUDIT_FAIL across entries', async () => {
    const res = makeRes();
    await ReportsRoute.render(makeReq(), res as any, makeDeps({
      ledgerManager: {
        getRecentEntries: async () => [
          { timestamp: 't1', eventType: 'AUDIT_PASS', agentDid: 'a' },
          { timestamp: 't2', eventType: 'AUDIT_PASS', agentDid: 'b' },
          { timestamp: 't3', eventType: 'AUDIT_FAIL', agentDid: 'c' },
          { timestamp: 't4', eventType: 'GENESIS', agentDid: 'd' },
        ],
      },
    }));
    assert.match(res.sent, /PASS: 2/);
    assert.match(res.sent, /FAIL: 1/);
    assert.match(res.sent, /Total: 4/);
  });

  test('FX126 SettingsRoute — shows governance mode + config table', async () => {
    const res = makeRes();
    SettingsRoute.render(makeReq(), res as any, makeDeps({
      configProfile: { getAll: () => [
        { key: 'governance.mode', value: 'enforce', source: 'workspace' },
      ] },
      enforcementEngine: { getGovernanceMode: () => 'enforce' },
    }));
    assert.match(res.sent, /governance\.mode/);
    assert.match(res.sent, /enforce/);
    assert.match(res.sent, /workspace/);
    assert.match(res.sent, /Governance Mode:/);
  });

  test('FX127 GovernanceKPIRoute — pass rate calculated from entries', async () => {
    const res = makeRes();
    await GovernanceKPIRoute.render(makeReq(), res as any, {
      ledgerManager: {
        getRecentEntries: async () => [
          { timestamp: 't1', eventType: 'AUDIT_PASS' },
          { timestamp: 't2', eventType: 'AUDIT_PASS' },
          { timestamp: 't3', eventType: 'AUDIT_PASS' },
          { timestamp: 't4', eventType: 'AUDIT_FAIL' },
          { timestamp: 't5', eventType: 'QUARANTINE_START' },
          { timestamp: 't6', eventType: 'RELEASE_PUBLISHED' },
        ],
      },
    } as any);
    // 3/4 = 75.0 pass rate
    assert.match(res.sent, /75\.0/);
  });

  test('FX127 GovernanceKPIRoute — zero-division-safe when no audits', async () => {
    const res = makeRes();
    await GovernanceKPIRoute.render(makeReq(), res as any, {
      ledgerManager: { getRecentEntries: async () => [] },
    } as any);
    assert.match(res.sent, /0\.0/);
  });

  test('FX130 PreflightRoute — renders rows for all requested scopes', () => {
    const res = makeRes();
    PreflightRoute.render(makeReq(), res as any, {
      permissionManager: {
        getAllRequestedScopes: () => [
          { id: 'fs.read', active: true, grantedAt: '2026-05-07T00:00:00Z' },
          { id: 'fs.write', active: false, grantedAt: '2026-05-06T00:00:00Z' },
        ],
      },
    } as any);
    assert.match(res.sent, /fs\.read/);
    assert.match(res.sent, /Granted/);
    assert.match(res.sent, /fs\.write/);
    assert.match(res.sent, /Denied/);
  });

  test('FX131 PreflightRoute.handleGrant — calls permissionManager.grant + redirects', () => {
    const res = makeRes();
    let granted: string | null = null;
    PreflightRoute.handleGrant(makeReq({}, { scopeId: 'fs.read' }), res as any, {
      permissionManager: {
        grant: (id: string) => { granted = id; },
      },
    } as any);
    assert.equal(granted, 'fs.read');
    assert.equal(res.redirected, '/console/preflight');
  });

  test('FX131 PreflightRoute.handleGrant — 400 when scopeId missing', () => {
    const res = makeRes();
    PreflightRoute.handleGrant(makeReq({}, {}), res as any, {
      permissionManager: { grant: () => undefined },
    } as any);
    assert.equal(res.statusCode, 400);
    assert.match(res.sent, /Missing scopeId/);
  });

  test('FX132 PreflightRoute.handleDeny — calls permissionManager.deny + redirects', () => {
    const res = makeRes();
    let denied: string | null = null;
    PreflightRoute.handleDeny(makeReq({}, { scopeId: 'fs.write' }), res as any, {
      permissionManager: {
        deny: (id: string) => { denied = id; },
      },
    } as any);
    assert.equal(denied, 'fs.write');
    assert.equal(res.redirected, '/console/preflight');
  });

  test('FX132 PreflightRoute.handleDeny — 400 when scopeId missing', () => {
    const res = makeRes();
    PreflightRoute.handleDeny(makeReq({}, {}), res as any, {
      permissionManager: { deny: () => undefined },
    } as any);
    assert.equal(res.statusCode, 400);
    assert.match(res.sent, /Missing scopeId/);
  });

  test('FX128 AgentCoverageRoute — GET /console/agents renders the agent coverage model', async () => {
    // Build a deterministic two-agent landscape (per acceptance criterion: ≥2 agents).
    // The route asks the registry for detectAll(), then per system calls
    // getManifest() / detect() / hasGovernance(). Both rendered tables must reflect
    // the fixture, plus the agentTeams block must reflect the enabled flag/path.
    const claudeSystem = { getManifest: () => ({ name: 'claude-code' }) };
    const codexSystem = { getManifest: () => ({ name: 'codex-cli' }) };

    const fakeLandscape = {
      registeredSystems: [claudeSystem, codexSystem],
      activeTerminals: [
        { name: 'pwsh-1', agentType: 'claude-code', terminalIndex: 0 },
        { name: 'pwsh-2', agentType: 'codex-cli', terminalIndex: 1 },
      ],
      agentTeams: { enabled: true, settingsPath: '/ws/.claude/teams.json' },
    };

    const detectionBySystem = new Map<unknown, boolean>([
      [claudeSystem, true],
      [codexSystem, false],
    ]);
    const governanceBySystem = new Map<unknown, boolean>([
      [claudeSystem, true],
      [codexSystem, false],
    ]);

    const fakeRegistry = {
      detectAll: async () => fakeLandscape,
      detect: async (sys: unknown) => ({ detected: detectionBySystem.get(sys) ?? false }),
      hasGovernance: (sys: unknown) => governanceBySystem.get(sys) ?? false,
    };

    const res = makeRes();
    await AgentCoverageRoute.render(makeReq(), res as any, { systemRegistry: fakeRegistry as any });

    assert.equal(res.statusCode, 200);
    // Section headers (proves shell rendered through the model, not a static stub)
    assert.match(res.sent, /<h1>Agent Coverage<\/h1>/);
    assert.match(res.sent, /<h2>Registered Systems<\/h2>/);
    assert.match(res.sent, /<h2>Active Terminals<\/h2>/);
    assert.match(res.sent, /<h2>Agent Teams<\/h2>/);

    // Per-agent rows from registeredSystems with detect() + hasGovernance() outputs
    assert.match(res.sent, /<tr><td>claude-code<\/td><td>Yes<\/td><td>Yes<\/td><\/tr>/);
    assert.match(res.sent, /<tr><td>codex-cli<\/td><td>No<\/td><td>No<\/td><\/tr>/);

    // Terminal rows from activeTerminals (name + agentType + terminalIndex tuple)
    assert.match(res.sent, /<tr><td>pwsh-1<\/td><td>claude-code<\/td><td>0<\/td><\/tr>/);
    assert.match(res.sent, /<tr><td>pwsh-2<\/td><td>codex-cli<\/td><td>1<\/td><\/tr>/);

    // agentTeams status block reflects enabled=true + the settingsPath value
    assert.match(res.sent, /Status: Enabled/);
    assert.match(res.sent, /Settings: \/ws\/\.claude\/teams\.json/);
  });
});
