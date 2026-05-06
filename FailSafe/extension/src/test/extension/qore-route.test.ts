import { strict as assert } from 'assert';
import { registerQoreRoute } from '../../roadmap/routes/QoreRoute';
import {
  QoreRuntimeService,
  type QoreFetchFn,
  type QoreRuntimeOptions,
} from '../../roadmap/services/QoreRuntimeService';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function makeRuntimeOptions(overrides: Partial<QoreRuntimeOptions> = {}): QoreRuntimeOptions {
  return { enabled: true, baseUrl: 'http://qore.test', timeoutMs: 1000, ...overrides };
}

function makeFetchStub(handler: (url: string) => unknown): QoreFetchFn {
  return async (url) => {
    const body = handler(url);
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify(body); },
      async json() { return body; },
    };
  };
}

interface FakeSprint { id: string; planId: string; title: string }
interface FakePlan { id: string; title: string }

function makeDeps(overrides: Partial<ApiRouteDeps>): ApiRouteDeps {
  const base = {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    qoreRuntimeService: undefined as unknown as QoreRuntimeService,
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
  } as ApiRouteDeps;
  return Object.assign(base, overrides);
}

suite('registerQoreRoute', () => {
  let harness: RouteHarness;

  teardown(async () => {
    if (harness) await harness.stop();
  });

  test('GET /api/qore/runtime returns 200 with snapshot from QoreRuntimeService', async () => {
    const fetchStub = makeFetchStub((url) => {
      if (url.endsWith('/health')) return {};
      if (url.endsWith('/policy/version')) return { policyVersion: 'v3' };
      return {};
    });
    const service = new QoreRuntimeService(makeRuntimeOptions(), fetchStub);
    const app = makeApp();
    registerQoreRoute(app, makeDeps({ qoreRuntimeService: service }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/qore/runtime' });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.connected, true);
    assert.equal(res.body.policyVersion, 'v3');
  });

  test('GET /api/qore/health with enabled=false returns 503 + disabled message', async () => {
    const service = new QoreRuntimeService(
      makeRuntimeOptions({ enabled: false }),
      makeFetchStub(() => ({})),
    );
    const app = makeApp();
    registerQoreRoute(app, makeDeps({ qoreRuntimeService: service }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/qore/health' });

    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { error: 'Qore runtime integration is disabled' });
  });

  test('POST /api/qore/evaluate forwards body and returns upstream JSON', async () => {
    let captured: unknown = null;
    const fetchStub: QoreFetchFn = async (url, init) => {
      captured = init.body ? JSON.parse(init.body) : null;
      return {
        ok: true,
        status: 200,
        async text() { return ''; },
        async json() { return { verdict: 'PASS' }; },
      };
    };
    const service = new QoreRuntimeService(makeRuntimeOptions(), fetchStub);
    const app = makeApp();
    registerQoreRoute(app, makeDeps({ qoreRuntimeService: service }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/qore/evaluate',
      body: { intent: 'audit' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { verdict: 'PASS' });
    assert.deepEqual(captured, { intent: 'audit' });
  });

  test('GET /api/sprint/:id returns {sprint, plan} from planManager', async () => {
    const sprint: FakeSprint = { id: 'abc', planId: 'p1', title: 'S' };
    const plan: FakePlan = { id: 'p1', title: 'Plan One' };
    const planManager: any = {
      getSprint: (id: string) => (id === 'abc' ? sprint : null),
      getPlan: (id: string) => (id === 'p1' ? plan : null),
      getAllPlans: () => [plan],
    };
    const service = new QoreRuntimeService(makeRuntimeOptions(), makeFetchStub(() => ({})));
    const app = makeApp();
    registerQoreRoute(app, makeDeps({ qoreRuntimeService: service, planManager }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/sprint/abc' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sprint, sprint);
    assert.deepEqual(res.body.plan, plan);
  });

  test('GET /api/qore/runtime rejects via deps.rejectIfRemote with 403', async () => {
    const service = new QoreRuntimeService(makeRuntimeOptions(), makeFetchStub(() => ({})));
    const app = makeApp();
    const deps = makeDeps({
      qoreRuntimeService: service,
      rejectIfRemote: (_req, res) => {
        res.status(403).json({ error: 'Forbidden: local access only' });
        return true;
      },
    });
    registerQoreRoute(app, deps);
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/qore/runtime' });

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Forbidden: local access only' });
  });
});
