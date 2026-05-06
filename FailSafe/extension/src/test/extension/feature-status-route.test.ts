import { strict as assert } from 'assert';
import { registerFeatureStatusRoute } from '../../roadmap/routes/FeatureStatusRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import type { IFeatureGate, FeatureFlag, FeatureTier } from '../../core/interfaces/IFeatureGate';
import { FEATURE_TIER_MAP } from '../../core/FeatureGateService';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function fakeFeatureGate(tier: FeatureTier, enabled: Set<FeatureFlag>): IFeatureGate {
  return {
    getTier: () => tier,
    isEnabled: (flag) => enabled.has(flag),
    requireFeature: () => undefined,
    onTierChange: () => () => undefined,
  };
}

function makeDeps(overrides: Partial<ApiRouteDeps>): ApiRouteDeps {
  return Object.assign({
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    qoreRuntimeService: {} as any,
    buildHubSnapshot: async () => ({}),
    workspaceRoot: '/tmp/ws',
    workspaceDirname: __dirname,
    brainstormService: {} as any,
    audioVaultService: {} as any,
    getRecentCheckpoints: () => [],
    getCheckpointById: () => null,
    verifyCheckpointChain: () => true,
    revertService: null,
    sentinelDaemon: {} as any,
    planManager: {} as any,
    qorelogicManager: {} as any,
    recordCheckpoint: () => undefined,
    inferPhaseKeyFromPlan: () => 'plan',
    chainValidAt: null,
    cachedChainValid: true,
    setCachedChainValid: () => undefined,
    getTransparencyEvents: () => [],
    getRiskRegister: () => [],
    writeRiskRegister: () => undefined,
    getTimelineEntries: () => [],
    getHealthMetrics: () => null,
    getGenomePatterns: async () => [],
    getGenomeAllPatterns: async () => [],
    getGenomeUnresolved: async () => [],
    getActiveRuns: () => [],
    getCompletedRuns: () => [],
    getRun: () => undefined,
    loadRun: () => null,
    getRunSteps: () => [],
  } as ApiRouteDeps, overrides);
}

suite('registerFeatureStatusRoute', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('GET /api/v1/features returns tier + features for every FEATURE_TIER_MAP key', async () => {
    const enabled = new Set<FeatureFlag>(['governance.enforce']);
    const gate = fakeFeatureGate('free', enabled);
    const app = makeApp();
    registerFeatureStatusRoute(app, makeDeps({ featureGate: gate }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/v1/features' });

    assert.equal(res.status, 200);
    assert.equal(res.body.tier, 'free');
    const flags = Object.keys(FEATURE_TIER_MAP);
    assert.ok(flags.length > 0, 'feature map non-empty');
    for (const flag of flags) {
      const entry = res.body.features[flag];
      assert.ok(entry, `feature ${flag} present in response`);
      assert.equal(typeof entry.requiredTier, 'string');
      assert.equal(typeof entry.enabled, 'boolean');
    }
    assert.equal(res.body.features['governance.enforce'].enabled, true);
  });

  test('GET /api/v1/features returns {tier:"free", features:{}} when no featureGate', async () => {
    const app = makeApp();
    registerFeatureStatusRoute(app, makeDeps({ featureGate: undefined }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/v1/features' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { tier: 'free', features: {} });
  });

  test('GET /api/v1/status preserves {sentinel, governance, chain, version} shape', async () => {
    const hub = {
      sentinelStatus: { running: true, mode: 'observe', eventsProcessed: 7 },
      chainValid: true,
      version: '5.0.0',
    };
    const app = makeApp();
    registerFeatureStatusRoute(app, makeDeps({ buildHubSnapshot: async () => hub }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/v1/status' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sentinel, { running: true, mode: 'observe', eventsProcessed: 7 });
    assert.deepEqual(res.body.governance, { mode: 'observe' });
    assert.deepEqual(res.body.chain, { valid: true });
    assert.equal(res.body.version, '5.0.0');
  });

  test('GET /api/v1/status applies safe defaults when hub fields missing', async () => {
    const app = makeApp();
    registerFeatureStatusRoute(app, makeDeps({ buildHubSnapshot: async () => ({}) }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/v1/status' });

    assert.equal(res.status, 200);
    assert.equal(res.body.sentinel.running, false);
    assert.equal(res.body.sentinel.mode, 'unknown');
    assert.equal(res.body.sentinel.eventsProcessed, 0);
    assert.equal(res.body.governance.mode, 'observe');
    assert.equal(res.body.chain.valid, false);
    assert.equal(res.body.version, 'unknown');
  });
});
