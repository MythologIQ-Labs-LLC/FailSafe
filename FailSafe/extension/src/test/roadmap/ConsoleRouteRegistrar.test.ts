// Functional tests for ConsoleRouteRegistrar (Phase 60 §0 refactor).
// Invokes setupAllRoutes against a fake Express app and asserts the
// expected route paths are registered without orphan handlers.

import { strict as assert } from 'assert';
import {
  ConsoleRouteRegistrar, type ConsoleRouteHost,
} from '../../roadmap/services/ConsoleRouteRegistrar';

interface FakeRoute { method: string; path: string; }

function makeFakeApp(): { app: any; routes: FakeRoute[]; middlewares: number } {
  const routes: FakeRoute[] = [];
  let middlewares = 0;
  const record = (method: string) => (path: string, ..._handlers: unknown[]) => {
    routes.push({ method, path });
  };
  const app: any = {
    use: (..._args: unknown[]) => { middlewares += 1; },
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    patch: record('PATCH'),
    delete: record('DELETE'),
    all: record('ALL'),
    options: record('OPTIONS'),
    head: record('HEAD'),
  };
  return { app, routes, middlewares: 0,
    get countMiddlewares() { return middlewares; },
  } as any;
}

function makeFakeHub(): any {
  return {
    buildHubSnapshot: async () => ({}),
    getRecentCheckpoints: () => [],
    getRecentVerdicts: () => [],
    getCheckpointById: () => null,
    verifyCheckpointChain: () => true,
    getRevertService: () => null,
    recordCheckpoint: () => undefined,
    inferPhaseKeyFromPlan: () => 'plan',
    getChainValidAt: () => null,
    getCachedChainValid: () => true,
    setCachedChainValid: () => undefined,
    getTransparencyEvents: () => [],
    getRiskRegister: () => [],
    writeRiskRegister: () => undefined,
  };
}

function makeHost(app: any, hub: any): ConsoleRouteHost {
  const noopSG = { analyzeFailurePatterns: async () => [], analyzeAllPatterns: async () => [], getUnresolvedEntries: async () => [] };
  return {
    app, uiDir: '/tmp/ui', workspaceRoot: '/tmp/ws', workspaceDirname: '/tmp/dist',
    hub,
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    getUiEntryFile: () => 'command-center.html',
    getInstalledSkills: () => [],
    getEnforcementEngine: () => null,
    getPermissionManager: () => null,
    getSystemRegistry: () => null,
    getScaffoldCallback: () => null,
    getScaffoldWebCallback: () => null,
    getOutputChannel: () => null,
    getAgentTimelineService: () => null,
    getAgentHealthIndicator: () => null,
    getAgentRunRecorder: () => null,
    qorRuntimeService: { fetchSnapshot: async () => ({}) },
    brainstormService: { exportSession: async () => ({}), createIdeationBuffer: () => ({}) },
    audioVaultService: { listSessions: async () => [] },
    marketplaceCatalog: {},
    marketplaceInstaller: {},
    securityScanner: {},
    adapterService: { getConfig: () => ({ adapterBaseUrl: undefined }) },
    sentinelDaemon: {},
    planManager: {
      getAllSprints: () => [], getCurrentSprint: () => null,
      getActivePlan: () => null,
    },
    qorelogicManager: {
      getLedgerManager: () => ({}),
      getShadowGenomeManager: () => noopSG,
    },
    featureGate: undefined,
    getBicameralClient: () => null,
    getBicameralCommand: () => "bicameral-mcp",
    getBicameralAutoConnect: () => false,
    setBicameralAutoConnect: async () => undefined,
  };
}

function setupRegistrar(): { routes: FakeRoute[]; host: ConsoleRouteHost } {
  const { app, routes } = makeFakeApp();
  const hub = makeFakeHub();
  const host = makeHost(app, hub);
  const reg = new ConsoleRouteRegistrar(host);
  reg.setupAllRoutes();
  return { routes, host };
}

function pathsByMethod(routes: FakeRoute[], method: string): string[] {
  return routes.filter((r) => r.method === method).map((r) => r.path);
}

suite('ConsoleRouteRegistrar (Phase 60 §0)', () => {
  test('setupAllRoutes — core routes registered (root/health/roadmap/hub/workspaces)', () => {
    const { routes } = setupRegistrar();
    const gets = pathsByMethod(routes, 'GET');
    assert.ok(gets.includes('/'), 'missing /');
    assert.ok(gets.includes('/health'), 'missing /health');
    assert.ok(gets.includes('/api/roadmap'), 'missing /api/roadmap');
    assert.ok(gets.includes('/api/hub'), 'missing /api/hub');
    assert.ok(gets.includes('/api/v1/workspaces'), 'missing /api/v1/workspaces');
  });

  test('setupAllRoutes — verdicts + trust v1 routes registered', () => {
    const { routes } = setupRegistrar();
    const gets = pathsByMethod(routes, 'GET');
    assert.ok(gets.includes('/api/v1/verdicts'));
    assert.ok(gets.includes('/api/v1/trust'));
  });

  test('setupAllRoutes — console HTML routes registered', () => {
    const { routes } = setupRegistrar();
    const gets = pathsByMethod(routes, 'GET');
    for (const p of [
      '/console/home', '/console/run/:runId', '/console/workflows',
      '/console/skills', '/console/genome', '/console/reports',
      '/console/settings', '/console/kpi', '/console/agents', '/console/sre',
    ]) {
      assert.ok(gets.includes(p), `missing GET ${p}`);
    }
  });

  test('setupAllRoutes — preflight routes only registered when permission manager present', () => {
    const { routes: noPmRoutes } = setupRegistrar();
    const gets = pathsByMethod(noPmRoutes, 'GET');
    assert.ok(!gets.includes('/console/preflight'), 'preflight GET present without PM');

    const { app, routes } = makeFakeApp();
    const host = makeHost(app, makeFakeHub());
    (host as any).getPermissionManager = () => ({
      getAllRequestedScopes: () => [], grant: () => undefined, deny: () => undefined,
    });
    new ConsoleRouteRegistrar(host).setupAllRoutes();
    const gets2 = pathsByMethod(routes, 'GET');
    const posts2 = pathsByMethod(routes, 'POST');
    assert.ok(gets2.includes('/console/preflight'));
    assert.ok(posts2.includes('/console/preflight/grant'));
    assert.ok(posts2.includes('/console/preflight/deny'));
  });

  test('setupAllRoutes — no orphan handlers (every registered path has method + path)', () => {
    const { routes } = setupRegistrar();
    for (const r of routes) {
      assert.ok(r.method && r.path, `orphan handler: ${JSON.stringify(r)}`);
      assert.ok(typeof r.path === 'string' && r.path.length > 0, `empty path on ${r.method}`);
    }
    // At minimum: roadmap routes + verdicts/trust + 8 console routes + workspaces.
    assert.ok(routes.length > 15, `too few routes registered: ${routes.length}`);
  });

  test('buildApiRouteDeps — surfaces hub callbacks + agent-recorder delegates', () => {
    const { app, routes: _r } = makeFakeApp();
    const host = makeHost(app, makeFakeHub());
    const reg = new ConsoleRouteRegistrar(host);
    const deps = reg.buildApiRouteDeps();
    assert.equal(typeof deps.buildHubSnapshot, 'function');
    assert.equal(typeof deps.recordCheckpoint, 'function');
    assert.equal(typeof deps.getRecentCheckpoints, 'function');
    assert.equal(typeof deps.broadcast, 'function');
    assert.deepEqual(deps.getActiveRuns(), []);
    assert.deepEqual(deps.getCompletedRuns(), []);
    assert.equal(deps.loadRun('any'), null);
  });

  test('buildApiRouteDeps — agent timeline/health delegates degrade gracefully when service is null', () => {
    const { app } = makeFakeApp();
    const host = makeHost(app, makeFakeHub());
    const reg = new ConsoleRouteRegistrar(host);
    const deps = reg.buildApiRouteDeps();
    assert.deepEqual(deps.getTimelineEntries(), []);
    assert.equal(deps.getHealthMetrics(), null);
  });

  test('setupAllRoutes — action POST routes registered (panic/resume/verify/scaffold)', () => {
    const { routes } = setupRegistrar();
    const posts = pathsByMethod(routes, 'POST');
    for (const p of [
      '/api/actions/resume-monitoring',
      '/api/actions/panic-stop',
      '/api/actions/verify-integrity',
      '/api/actions/scaffold-skills',
    ]) {
      assert.ok(posts.includes(p), `missing POST ${p}`);
    }
  });
});
