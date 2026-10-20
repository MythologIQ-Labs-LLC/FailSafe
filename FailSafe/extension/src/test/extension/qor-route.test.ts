import { strict as assert } from 'assert';
import { registerQorRoute } from '../../roadmap/routes/QorRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

interface FakeSprint { id: string; planId: string; title: string }
interface FakePlan { id: string; title: string }

function makeDeps(overrides: Partial<ApiRouteDeps>): ApiRouteDeps {
  const base = {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
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
    getStoredRiskRegister: () => [],
    mutateRiskRegister: (fn: (risks: any[]) => any) => fn([]),
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

  test('GET /api/sprint/:id returns {sprint, plan} from planManager', async () => {
    const sprint: FakeSprint = { id: 'abc', planId: 'p1', title: 'S' };
    const plan: FakePlan = { id: 'p1', title: 'Plan One' };
    const planManager: any = {
      getSprint: (id: string) => (id === 'abc' ? sprint : null),
      getPlan: (id: string) => (id === 'p1' ? plan : null),
      getAllPlans: () => [plan],
    };
    const app = makeApp();
    registerQorRoute(app, makeDeps({ planManager }));
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
    const app = makeApp();
    registerQorRoute(app, makeDeps({ planManager }));
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
    const app = makeApp();
    registerQorRoute(app, makeDeps({ planManager }));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/plans' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.plans, []);
  });

  // B289: the Qor runtime routes are retired. A runtime stub reaches the router through an
  // untyped override, so a tree that still registers the routes answers 200 and fails here.
  for (const [method, path] of [['GET', '/api/qor/runtime'], ['GET', '/api/qor/health'], ['POST', '/api/qor/evaluate']] as const) {
    test(`B289 ${method} ${path} is gone (404)`, async () => {
      const runtimeStub: Record<string, unknown> = {
        qorRuntimeService: {
          fetchSnapshot: async () => ({ enabled: true, connected: true }),
          proxy: async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
            res.status(200).json({ ok: true });
          },
        },
      };
      const app = makeApp();
      registerQorRoute(app, makeDeps(runtimeStub as Partial<ApiRouteDeps>));
      harness = new RouteHarness(app);
      await harness.start();

      const res = await harness.request(method === 'POST' ? { method, path, body: {} } : { path });

      assert.strictEqual(res.status, 404);
    });
  }

});
