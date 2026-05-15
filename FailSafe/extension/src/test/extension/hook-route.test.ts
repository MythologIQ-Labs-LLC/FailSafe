import { strict as assert } from 'assert';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { registerHookRoute } from '../../roadmap/routes/HookRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function makeDeps(workspaceRoot: string, overrides: Partial<ApiRouteDeps> = {}): ApiRouteDeps {
  return Object.assign({
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    qorRuntimeService: {} as any,
    buildHubSnapshot: async () => ({}),
    workspaceRoot,
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

suite('registerHookRoute', () => {
  let harness: RouteHarness;
  let tmpRoot: string;

  setup(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-hook-route-'));
  });

  teardown(async () => {
    if (harness) await harness.stop();
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test('GET /api/hooks/status returns enabled=true for a fresh workspace', async () => {
    const app = makeApp();
    registerHookRoute(app, makeDeps(tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/hooks/status' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { enabled: true });
  });

  test('GET /api/hooks/status returns enabled=false when disabled sentinel exists', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.claude', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.claude', 'hooks', 'disabled'), 'x');
    const app = makeApp();
    registerHookRoute(app, makeDeps(tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/hooks/status' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { enabled: false });
  });

  test('POST /api/hooks/toggle with enabled=false creates sentinel and returns {enabled:false}', async () => {
    const app = makeApp();
    registerHookRoute(app, makeDeps(tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/hooks/toggle',
      body: { enabled: false },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { enabled: false });
    assert.ok(
      fs.existsSync(path.join(tmpRoot, '.claude', 'hooks', 'disabled')),
      'disabled sentinel must exist after toggle',
    );
  });

  test('POST /api/hooks/toggle with enabled=true removes sentinel and returns {enabled:true}', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.claude', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.claude', 'hooks', 'disabled'), 'x');
    const app = makeApp();
    registerHookRoute(app, makeDeps(tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/hooks/toggle',
      body: { enabled: true },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { enabled: true });
    assert.ok(
      !fs.existsSync(path.join(tmpRoot, '.claude', 'hooks', 'disabled')),
      'disabled sentinel must be removed',
    );
  });

  test('POST /api/hooks/toggle with non-boolean enabled returns 400', async () => {
    const app = makeApp();
    registerHookRoute(app, makeDeps(tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/hooks/toggle',
      body: { enabled: 'yes' },
    });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'enabled must be a boolean' });
  });

  test('GET /api/hooks/status with rejectIfRemote=true returns 403', async () => {
    const app = makeApp();
    registerHookRoute(app, makeDeps(tmpRoot, {
      rejectIfRemote: (_req, res) => {
        res.status(403).json({ error: 'Forbidden: local access only' });
        return true;
      },
    }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/hooks/status' });

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Forbidden: local access only' });
  });
});
