import { strict as assert } from 'assert';
import { registerQorRoute } from '../../roadmap/routes/QorRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import type { ShadowGenomeResult } from '../../qorlogic/shadow-genome-client';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';
import { FIXTURE_GENOME } from '../qorlogic/fixtures/genome-graph.fixture';

function makeDeps(overrides: Partial<ApiRouteDeps>): ApiRouteDeps {
  const base = {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    qorRuntimeService: undefined as any,
    buildHubSnapshot: async () => ({}),
    workspaceRoot: '/tmp/ws', workspaceDirname: __dirname,
    brainstormService: {} as any, audioVaultService: {} as any,
    getRecentCheckpoints: () => [], getCheckpointById: () => null, verifyCheckpointChain: () => true,
    revertService: null, sentinelDaemon: {} as any, planManager: {} as any, qorelogicManager: {} as any,
    recordCheckpoint: () => undefined, inferPhaseKeyFromPlan: () => 'plan',
    chainValidAt: null, cachedChainValid: true, setCachedChainValid: () => undefined,
    getTransparencyEvents: () => [], getRiskRegister: () => [], writeRiskRegister: () => undefined,
    getTimelineEntries: () => [], getHealthMetrics: () => null,
    getGenomePatterns: async () => [], getGenomeAllPatterns: async () => [], getGenomeUnresolved: async () => [],
    getActiveRuns: () => [], getCompletedRuns: () => [], getRun: () => undefined, loadRun: () => null, getRunSteps: () => [],
  } as ApiRouteDeps;
  return Object.assign(base, overrides);
}

suite('GET /api/qor/governance-dashboard', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('enabled loader → 200 + dashboard derived from the FX863 genome', async () => {
    const app = makeApp();
    const result: ShadowGenomeResult = { ok: true, graph: FIXTURE_GENOME };
    registerQorRoute(app, makeDeps({ loadShadowGenome: async () => result }));
    harness = new RouteHarness(app); await harness.start();

    const res = await harness.request({ path: '/api/qor/governance-dashboard' });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.summary.nodeCount, 4);
    assert.equal(res.body.summary.recurringPatternCount, 1);
  });

  test('loader off (localOnly) → 200 + enabled:false zeroed payload', async () => {
    const app = makeApp();
    registerQorRoute(app, makeDeps({ loadShadowGenome: async () => ({ ok: true, localOnly: true }) }));
    harness = new RouteHarness(app); await harness.start();

    const res = await harness.request({ path: '/api/qor/governance-dashboard' });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);
    assert.equal(res.body.summary.nodeCount, 0);
  });

  test('absent loader → 200 + degraded payload (degrade-safe default)', async () => {
    const app = makeApp();
    registerQorRoute(app, makeDeps({})); // no loadShadowGenome wired
    harness = new RouteHarness(app); await harness.start();

    const res = await harness.request({ path: '/api/qor/governance-dashboard' });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);
  });

  test('remote request → rejectIfRemote short-circuits before the loader', async () => {
    let loaderCalled = false;
    const app = makeApp();
    registerQorRoute(app, makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
      loadShadowGenome: async () => { loaderCalled = true; return { ok: true, localOnly: true }; },
    }));
    harness = new RouteHarness(app); await harness.start();

    const res = await harness.request({ path: '/api/qor/governance-dashboard' });

    assert.equal(res.status, 403);
    assert.equal(loaderCalled, false);
  });
});
