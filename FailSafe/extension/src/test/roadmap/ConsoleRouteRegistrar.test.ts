// Functional tests for ConsoleRouteRegistrar (Phase 60 §0 refactor).
// Invokes setupAllRoutes against a fake Express app and asserts the
// expected route paths are registered without orphan handlers.

import { strict as assert } from 'assert';
import {
  ConsoleRouteRegistrar, type ConsoleRouteHost,
} from '../../roadmap/services/ConsoleRouteRegistrar';
import { EventBus } from '../../shared/EventBus';
import { setupBicameralRoutes } from '../../roadmap/routes/BicameralRoute';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';

interface FakeRoute { method: string; path: string; }
interface FakeUse { path: string | null; order: number; }

function makeFakeApp(): { app: any; routes: FakeRoute[]; uses: FakeUse[]; middlewares: number } {
  const routes: FakeRoute[] = [];
  const uses: FakeUse[] = [];
  let middlewares = 0;
  const record = (method: string) => (path: string, ..._handlers: unknown[]) => {
    routes.push({ method, path });
  };
  const app: any = {
    use: (...args: unknown[]) => {
      middlewares += 1;
      // First arg can be a mount path (string) or a handler function (no path).
      const first = args[0];
      uses.push({ path: typeof first === 'string' ? first : null, order: middlewares });
    },
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    patch: record('PATCH'),
    delete: record('DELETE'),
    all: record('ALL'),
    options: record('OPTIONS'),
    head: record('HEAD'),
  };
  return { app, routes, uses, middlewares: 0,
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
    getStoredRiskRegister: () => [],
    mutateRiskRegister: (fn: (risks: any[]) => any) => fn([]),
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
    getMcpInterceptor: () => null,
    getDriftToL3Mediator: () => null,
    getUpstreamMonitor: () => null,
    getBicameralCommand: () => "bicameral-mcp",
    getBicameralAutoConnect: () => false,
    setBicameralAutoConnect: async () => undefined,
    eventBus: new EventBus(),
    getVoicePackPath: () => null,
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

  test('trust v1 refuses unsupported green scores for empty, unknown, and unverified checkpoints (#470)', async () => {
    for (const checkpoints of [
      {},
      { a: { policyVerdict: 'UNKNOWN' } },
      { a: { policyVerdict: 'PASS' } },
      { a: { policyVerdict: 'PASS', evidenceRefs: [] } },
      { a: { policyVerdict: 'PASS', evidenceRefs: ['unverified-claim'] } },
    ]) {
      const handlers: Record<string, (_req: any, res: any) => Promise<void>> = {};
      const { app } = makeFakeApp();
      app.get = (p: string, handler: any) => { handlers[p] = handler; };
      const hub = makeFakeHub();
      hub.buildHubSnapshot = async () => ({ checkpoints });
      new ConsoleRouteRegistrar(makeHost(app, hub)).setupAllRoutes();
      let body: any;
      await handlers['/api/v1/trust']({}, { json: (value: any) => { body = value; } });
      assert.equal(body.overall, null);
      assert.equal(body.status, 'unverified');
      assert.equal(body.checkpointCount, Object.keys(checkpoints).length);
    }
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

  // FX494 — voice-pack /vendor static mount (Phase 2 of voice-substrate-extraction)
  test('setupAllRoutes — voice-pack /vendor mount registered when getVoicePackPath returns existing dir', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpPackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-mount-test-'));
    try {
      const { app, uses } = makeFakeApp() as any;
      const host = makeHost(app, makeFakeHub());
      (host as any).getVoicePackPath = () => tmpPackDir;
      new ConsoleRouteRegistrar(host).setupAllRoutes();
      const vendorMount = uses.find((u: any) => u.path === '/vendor');
      assert.ok(vendorMount, 'expected /vendor mount when voice-pack path exists');
    } finally {
      fs.rmSync(tmpPackDir, { recursive: true, force: true });
    }
  });

  test('setupAllRoutes — no /vendor mount when getVoicePackPath returns null', () => {
    const { app, uses } = makeFakeApp() as any;
    const host = makeHost(app, makeFakeHub());
    // Default makeHost: getVoicePackPath: () => null
    new ConsoleRouteRegistrar(host).setupAllRoutes();
    const vendorMount = uses.find((u: any) => u.path === '/vendor');
    assert.strictEqual(vendorMount, undefined, 'no /vendor mount when path is null');
  });

  test('setupAllRoutes — no /vendor mount when getVoicePackPath returns a non-existent dir', () => {
    const { app, uses } = makeFakeApp() as any;
    const host = makeHost(app, makeFakeHub());
    (host as any).getVoicePackPath = () => '/tmp/__failsafe_voice_pack_does_not_exist__';
    new ConsoleRouteRegistrar(host).setupAllRoutes();
    const vendorMount = uses.find((u: any) => u.path === '/vendor');
    assert.strictEqual(vendorMount, undefined, 'no /vendor mount when path does not exist');
  });

  // #514 (FX960): the operator confirmer reaches both route dep bags lazily
  // from the host getter, so a confirmer set after route registration is used.
  test('#514 buildApiRouteDeps + buildBicameralRouteDeps — confirmOperatorAction invokes the host confirmer', async () => {
    const { app } = makeFakeApp();
    const host = makeHost(app, makeFakeHub());
    const seen: string[] = [];
    const wired: { confirm?: (r: { title: string }) => Promise<string> } = {};
    (host as any).getOperatorConfirmer = () => wired.confirm;
    const reg = new ConsoleRouteRegistrar(host);
    const apiDeps = reg.buildApiRouteDeps();
    const bicameralDeps = reg.buildBicameralRouteDeps();
    // Wired after the deps were built, as bootstrapServers does.
    wired.confirm = async (r) => { seen.push(r.title); return 'approved'; };
    const request = { title: 't', detail: 'd', approveLabel: 'a' };
    assert.equal(await apiDeps.confirmOperatorAction!(request), 'approved');
    assert.equal(await bicameralDeps.confirmOperatorAction!({ ...request, title: 'b' }), 'approved');
    assert.deepEqual(seen, ['t', 'b']);
  });

  test('#514 a host with no confirmer leaves confirmOperatorAction undefined on both dep bags', () => {
    for (const getter of [undefined, () => undefined, () => null]) {
      const { app } = makeFakeApp();
      const host = makeHost(app, makeFakeHub());
      if (getter) (host as any).getOperatorConfirmer = getter;
      const reg = new ConsoleRouteRegistrar(host);
      assert.strictEqual(reg.buildApiRouteDeps().confirmOperatorAction, undefined);
      assert.strictEqual(reg.buildBicameralRouteDeps().confirmOperatorAction, undefined);
    }
  });

  // LD16 (b): the install route reaches the hook bootstrapBicameral sets, read at request time.
  test('LD16 (b) buildBicameralRouteDeps — rewireBicameral runs the host hook, or resolves when none is wired', async () => {
    const { app } = makeFakeApp();
    const host = makeHost(app, makeFakeHub());
    const wired: { fn: (() => Promise<void>) | null } = { fn: null };
    (host as any).getBicameralRewire = () => wired.fn;
    const deps = new ConsoleRouteRegistrar(host).buildBicameralRouteDeps() as { rewireBicameral?: () => Promise<void> };
    assert.equal(typeof deps.rewireBicameral, 'function');
    await deps.rewireBicameral!();
    let calls = 0;
    wired.fn = async () => { calls++; };
    await deps.rewireBicameral!();
    assert.equal(calls, 1);
  });
});

// #538 lane B review items 1 and 2: the AGT terminal runner and the Bicameral install
// ledger are read at request time, through the registrar's real wiring.
suite('#538 ConsoleRouteRegistrar request-time install wiring', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });

  test('agt-install with no terminal runner wired answers 503 before any dialog or ledger write', async () => {
    const app = makeApp();
    const host = makeHost(app, makeFakeHub());
    let confirms = 0;
    let appends = 0;
    (host as any).getOperatorConfirmer = () => async () => { confirms++; return 'approved'; };
    (host as any).getAgtRunInTerminal = () => null;
    (host as any).qorelogicManager = {
      ...host.qorelogicManager,
      getLedgerManager: () => ({ isAvailable: () => true, appendEntry: async () => { appends++; return { id: appends, entryHash: 'h' }; } }),
    };
    new ConsoleRouteRegistrar(host).setupAllRoutes();
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/agt-install', body: { id: 'typescript' } });
    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(confirms, 0, 'no dialog for a route that cannot act');
    assert.equal(appends, 0, 'no ledger entry for a route that cannot act');
  });

  test('bicameral-install records with a ledger that was wired after the routes registered', async () => {
    const { app: fakeApp } = makeFakeApp();
    const host = makeHost(fakeApp, makeFakeHub());
    const wired: { ledger: unknown } = { ledger: null };
    (host as any).qorelogicManager = { ...host.qorelogicManager, getLedgerManager: () => wired.ledger };
    const deps = new ConsoleRouteRegistrar(host).buildBicameralRouteDeps();
    const appended: unknown[] = [];
    wired.ledger = { isAvailable: () => true, appendEntry: async (e: unknown) => { appended.push(e); return { id: appended.length, entryHash: 'h' }; } };
    const app = makeApp();
    setupBicameralRoutes(app, {
      ...deps,
      confirmOperatorAction: async () => 'approved',
      runInstall: async (_opts: unknown, mode: string) => ({ mode, steps: [], done: true, ok: true }),
    } as never);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/bicameral-install', body: { mode: 'solo' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.ledger, 'recorded');
    assert.equal(appended.length, 1);
  });
});
