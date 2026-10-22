// Lane E (plan-e-console-ui-xss) rows R1-R11: server-rendered /console/* pages
// (S24-S34). Each route renders hostile workspace-derived values; the sent HTML
// is parsed and must be inert, with attribute values round-tripping.

import { strict as assert } from 'assert';
import {
  HomeRoute, RunDetailRoute, WorkflowsRoute, SkillsRoute,
  GenomeRoute, ReportsRoute, SettingsRoute, GovernanceKPIRoute,
  PreflightRoute, AgentCoverageRoute,
} from '../../roadmap/routes';
import { buildSreHtml, type AgtSreSnapshot } from '../../roadmap/routes/templates/SreTemplate';
import { TAG, DQ, assertInert, parseHtml } from './xssProbe';

interface MockRes { statusCode: number; sent: string; send(c: string): MockRes; status(c: number): MockRes; redirect(u: string): MockRes }

function makeRes(): MockRes {
  return {
    statusCode: 200,
    sent: '',
    send(c: string) { this.sent = String(c); return this; },
    status(c: number) { this.statusCode = c; return this; },
    redirect() { return this; },
  };
}
const req = (params: Record<string, string> = {}): any => ({ params, body: {} });

function deps(overrides: Record<string, unknown> = {}): any {
  return Object.assign({
    planManager: {
      getCurrentSprint: () => null, getAllPlans: () => [], getPlan: () => null,
      getPlanProgress: () => ({ completed: 0, total: 0, blocked: 0 }),
    },
    ledgerManager: { getRecentEntries: async () => [] },
    shadowGenomeManager: {
      getAvailability: () => ({ available: true }),
      analyzeFailurePatterns: async () => [], getUnresolvedEntries: async () => [],
    },
    enforcementEngine: { getGovernanceMode: () => 'observe' },
    configProfile: { getAll: () => [] },
    getInstalledSkills: () => [],
  }, overrides);
}

const hostileEntry = { timestamp: TAG, eventType: TAG, agentDid: TAG, riskGrade: TAG };

function inertText(html: string): Document {
  const doc = parseHtml(html);
  assertInert(doc);
  assert.ok(doc.body.textContent!.includes(TAG), 'the hostile value is shown literally');
  return doc;
}

suite('Lane E XSS: server-rendered console routes (R1-R11)', () => {
  test('R1 /console/workflows: plan id in href and text, title in text (S24)', () => {
    const res = makeRes();
    WorkflowsRoute.render(req(), res as any, deps({ planManager: { getAllPlans: () => [{ id: DQ, title: TAG }] } }));
    const doc = inertText(res.sent);
    const a = doc.querySelector('tbody a')!;
    assert.equal(a.getAttribute('href'), `/console/run/${encodeURIComponent(DQ)}`);
    assert.equal(a.textContent, DQ);
  });

  test('R2 /console/run/:id: plan id and title (S25)', () => {
    const res = makeRes();
    RunDetailRoute.render(req({ runId: 'p' }), res as any, deps({ planManager: {
      getPlan: () => ({ id: TAG, title: TAG }), getPlanProgress: () => ({ completed: 1, total: 2, blocked: false }),
    } }));
    inertText(res.sent);
  });

  test('R3 /console/home: ledger fields, sprint name and mode (S26)', async () => {
    const res = makeRes();
    await HomeRoute.render(req(), res as any, deps({
      planManager: { getCurrentSprint: () => ({ id: 's', name: TAG }) },
      ledgerManager: { getRecentEntries: async () => [hostileEntry] },
      enforcementEngine: { getGovernanceMode: () => TAG },
    }));
    inertText(res.sent);
  });

  test('R4 /console/reports: ledger fields (S27)', async () => {
    const res = makeRes();
    await ReportsRoute.render(req(), res as any, deps({ ledgerManager: { getRecentEntries: async () => [hostileEntry] } }));
    inertText(res.sent);
  });

  test('R5 /console/kpi: ledger risk grade (S28)', async () => {
    const res = makeRes();
    await GovernanceKPIRoute.render(req(), res as any, { ledgerManager: { getRecentEntries: async () => [hostileEntry] } } as any);
    inertText(res.sent);
  });

  test('R6 /console/skills: SKILL.md name and version (S29)', () => {
    const res = makeRes();
    SkillsRoute.render(req(), res as any, deps({ getInstalledSkills: () => [{ name: TAG, version: TAG }] }));
    inertText(res.sent);
  });

  test('R7 /console/agents: manifest name, terminal name, agent type, settings path (S30)', async () => {
    const sys = { getManifest: () => ({ name: TAG }) };
    const registry = {
      detectAll: async () => ({
        registeredSystems: [sys],
        activeTerminals: [{ name: TAG, agentType: TAG, terminalIndex: 0 }],
        agentTeams: { enabled: false, settingsPath: TAG },
      }),
      detect: async () => ({ detected: true }),
      hasGovernance: () => true,
    };
    const res = makeRes();
    await AgentCoverageRoute.render(req(), res as any, { systemRegistry: registry as any });
    inertText(res.sent);
  });

  test('R8 /console/genome: failure mode and remediation status (S31)', async () => {
    const res = makeRes();
    await GenomeRoute.render(req(), res as any, deps({ shadowGenomeManager: {
      getAvailability: () => ({ available: true }),
      analyzeFailurePatterns: async () => [{ failureMode: TAG, count: 1 }],
      getUnresolvedEntries: async () => [{ id: 1, failureMode: TAG, remediationStatus: TAG }],
    } }));
    inertText(res.sent);
  });

  test('R9 /console/settings: profile key, value, source and mode (S32)', () => {
    const res = makeRes();
    SettingsRoute.render(req(), res as any, deps({
      configProfile: { getAll: () => [{ key: TAG, value: TAG, source: TAG }] },
      enforcementEngine: { getGovernanceMode: () => TAG },
    }));
    inertText(res.sent);
  });

  test('R10 /console/preflight: scope id in text and hidden value (S33)', () => {
    const res = makeRes();
    PreflightRoute.render(req(), res as any, { permissionManager: {
      getAllRequestedScopes: () => [{ id: DQ, active: true, grantedAt: TAG }, { id: TAG, active: false, grantedAt: 't' }],
    } } as any);
    const doc = inertText(res.sent);
    const values = Array.from(doc.querySelectorAll('input[name=scopeId]')).map((i) => i.getAttribute('value'));
    assert.deepEqual(values, [DQ, DQ, TAG, TAG]);
  });

  test('R11 /console/sre: fleet status in title, uncoerced numbers (S34)', () => {
    const snapshot = {
      policies: [], trustScores: [], asiCoverage: {},
      sli: { name: 'compliance', target: 0.95, currentValue: null, meetingTarget: null, totalDecisions: TAG },
      fleet: [{ agentId: 'a1', status: DQ, circuitState: 'closed', taskCount: TAG, successRate: 1 }],
    } as unknown as AgtSreSnapshot;
    const doc = parseHtml(buildSreHtml({ connected: true, snapshot }));
    assertInert(doc);
    assert.ok(doc.querySelector(`[title]`), 'the fleet status dot renders');
    assert.equal(doc.querySelectorAll('[title]')[0].getAttribute('title'), DQ);
  });
});
