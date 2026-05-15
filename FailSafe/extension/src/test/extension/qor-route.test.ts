import { strict as assert } from 'assert';
import { registerQorRoute } from '../../roadmap/routes/QorRoute';
import {
  QorRuntimeService,
  type QorFetchFn,
  type QorRuntimeOptions,
} from '../../roadmap/services/QorRuntimeService';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function makeRuntimeOptions(overrides: Partial<QorRuntimeOptions> = {}): QorRuntimeOptions {
  return { enabled: true, baseUrl: 'http://qor.test', timeoutMs: 1000, ...overrides };
}

function makeFetchStub(handler: (url: string) => unknown): QorFetchFn {
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
    qorRuntimeService: undefined as unknown as QorRuntimeService,
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

suite('registerQorRoute', () => {
  let harness: RouteHarness;

  teardown(async () => {
    if (harness) await harness.stop();
  });

  test('GET /api/qor/runtime returns 200 with snapshot from QorRuntimeService', async () => {
    const fetchStub = makeFetchStub((url) => {
      if (url.endsWith('/health')) return {};
      if (url.endsWith('/policy/version')) return { policyVersion: 'v3' };
      return {};
    });
    const service = new QorRuntimeService(makeRuntimeOptions(), fetchStub);
    const app = makeApp();
    registerQorRoute(app, makeDeps({ qorRuntimeService: service }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/qor/runtime' });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.connected, true);
    assert.equal(res.body.policyVersion, 'v3');
  });

  test('GET /api/qor/health with enabled=false returns 503 + disabled message', async () => {
    const service = new QorRuntimeService(
      makeRuntimeOptions({ enabled: false }),
      makeFetchStub(() => ({})),
    );
    const app = makeApp();
    registerQorRoute(app, makeDeps({ qorRuntimeService: service }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/qor/health' });

    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { error: 'Qor runtime integration is disabled' });
  });

  test('POST /api/qor/evaluate forwards body and returns upstream JSON', async () => {
    let captured: unknown = null;
    const fetchStub: QorFetchFn = async (url, init) => {
      captured = init.body ? JSON.parse(init.body) : null;
      return {
        ok: true,
        status: 200,
        async text() { return ''; },
        async json() { return { verdict: 'PASS' }; },
      };
    };
    const service = new QorRuntimeService(makeRuntimeOptions(), fetchStub);
    const app = makeApp();
    registerQorRoute(app, makeDeps({ qorRuntimeService: service }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/qor/evaluate',
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
    const service = new QorRuntimeService(makeRuntimeOptions(), makeFetchStub(() => ({})));
    const app = makeApp();
    registerQorRoute(app, makeDeps({ qorRuntimeService: service, planManager }));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/sprint/abc' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sprint, sprint);
    assert.deepEqual(res.body.plan, plan);
  });

  test('FX102 GET /api/plans returns {plans: [...]} from planManager.getAllPlans', async () => {
    const plans: FakePlan[] = [
      { id: 'p1', title: 'First plan' },
      { id: 'p2', title: 'Second plan' },
    ];
    const planManager: any = {
      getSprint: () => null,
      getPlan: () => null,
      getAllPlans: () => plans,
    };
    const service = new QorRuntimeService(makeRuntimeOptions(), makeFetchStub(() => ({})));
    const app = makeApp();
    registerQorRoute(app, makeDeps({ qorRuntimeService: service, planManager }));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/plans' });
    assert.equal(res.status, 200);
    assert.equal(res.body.plans.length, 2);
    assert.equal(res.body.plans[0].id, 'p1');
    assert.equal(res.body.plans[1].title, 'Second plan');
  });

  test('FX102 GET /api/plans returns empty list when no plans exist', async () => {
    const planManager: any = {
      getSprint: () => null,
      getPlan: () => null,
      getAllPlans: () => [],
    };
    const service = new QorRuntimeService(makeRuntimeOptions(), makeFetchStub(() => ({})));
    const app = makeApp();
    registerQorRoute(app, makeDeps({ qorRuntimeService: service, planManager }));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/plans' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.plans, []);
  });

  test('GET /api/qor/runtime rejects via deps.rejectIfRemote with 403', async () => {
    const service = new QorRuntimeService(makeRuntimeOptions(), makeFetchStub(() => ({})));
    const app = makeApp();
    const deps = makeDeps({
      qorRuntimeService: service,
      rejectIfRemote: (_req, res) => {
        res.status(403).json({ error: 'Forbidden: local access only' });
        return true;
      },
    });
    registerQorRoute(app, deps);
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/qor/runtime' });

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'Forbidden: local access only' });
  });
});
