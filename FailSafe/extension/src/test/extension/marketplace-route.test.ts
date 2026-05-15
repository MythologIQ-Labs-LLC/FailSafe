// Functional tests for MarketplaceRoute (FX091–FX097 + adjacent install/confirm/uninstall paths).
// Drives every endpoint via the in-process HTTP harness so middleware + req.body parsing
// runs the same as production. Sink: real HTTP status codes + JSON bodies.

import { strict as assert } from 'assert';
import { setupMarketplaceRoutes, MarketplaceRouteDeps } from '../../roadmap/routes/MarketplaceRoute';
import type {
  MarketplaceItem, ScannerAvailability, SecurityScanResult, InstallOptions, InstallProgress,
} from '../../roadmap/services/MarketplaceTypes';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';

function buildItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'unit-test fixture',
    category: 'ui-orchestration',
    author: 'tests',
    repoUrl: 'https://example.invalid/repo.git',
    repoRef: 'main',
    status: 'not-installed',
    trustTier: 'unverified',
    sandboxEnabled: true,
    requiredPermissions: [],
    featured: false,
    tags: [],
    version: '0.0.0',
    techStack: [],
    difficulty: 'beginner',
    auditStatus: 'community',
    ...overrides,
  };
}

const SCANNER_AVAIL: ScannerAvailability = {
  garak: true, promptfoo: true, lastChecked: '2026-05-06T00:00:00Z',
};
const SCAN_PASS: SecurityScanResult = {
  passed: true, scanner: 'both', timestamp: '2026-05-06T00:00:00Z',
  findings: [], riskGrade: 'L1', recommendedAction: 'approve',
};

function makeDeps(items: MarketplaceItem[], overrides: Partial<MarketplaceRouteDeps> = {}): {
  deps: MarketplaceRouteDeps;
  broadcasts: Array<Record<string, unknown>>;
  installCalls: Array<{ item: MarketplaceItem; opts: InstallOptions }>;
} {
  const broadcasts: Array<Record<string, unknown>> = [];
  const installCalls: Array<{ item: MarketplaceItem; opts: InstallOptions }> = [];
  const itemMap = new Map(items.map((it) => [it.id, { ...it }]));
  const catalog = {
    getCatalog: () => Array.from(itemMap.values()),
    getItem: (id: string) => itemMap.get(id),
    getFeatured: () => Array.from(itemMap.values()).filter((it) => it.featured),
    getInstalled: () => Array.from(itemMap.values()).filter((it) => it.status === 'installed'),
    updateItemStatus: (id: string, updates: Partial<MarketplaceItem>) => {
      const cur = itemMap.get(id);
      if (cur) itemMap.set(id, { ...cur, ...updates });
    },
    setScannerAvailability: () => undefined,
    getCachePath: () => '/tmp/test-cache',
  };
  const installer = {
    install: async (item: MarketplaceItem, opts: InstallOptions, _onProgress: (p: InstallProgress) => void) => {
      installCalls.push({ item, opts });
      return { success: true, installPath: '/tmp/test-install/' + item.id };
    },
    uninstall: async () => true,
  };
  const scanner = {
    checkAvailability: async () => SCANNER_AVAIL,
    runFullScan: async () => SCAN_PASS,
  };
  const deps: MarketplaceRouteDeps = {
    rejectIfRemote: () => false,
    broadcast: (data) => { broadcasts.push(data); },
    marketplaceCatalog: catalog as never,
    marketplaceInstaller: installer as never,
    securityScanner: scanner as never,
    ...overrides,
  };
  return { deps, broadcasts, installCalls };
}

suite('MarketplaceRoute (FX091–FX097)', () => {
  let harness: RouteHarness;

  teardown(async () => { if (harness) await harness.stop(); });

  test('FX091 GET /api/marketplace/catalog — returns items + scanners + cachePath', async () => {
    const items = [buildItem({ id: 'a' }), buildItem({ id: 'b' })];
    const app = makeApp();
    const { deps } = makeDeps(items);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/marketplace/catalog' });
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.deepEqual(res.body.scanners, SCANNER_AVAIL);
    assert.equal(res.body.globalCachePath, '/tmp/test-cache');
  });

  test('FX092 GET /api/marketplace/item/:id — 200 for known, 404 for unknown', async () => {
    const app = makeApp();
    const { deps } = makeDeps([buildItem({ id: 'known' })]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const ok = await harness.request({ path: '/api/marketplace/item/known' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.item.id, 'known');
    const miss = await harness.request({ path: '/api/marketplace/item/missing' });
    assert.equal(miss.status, 404);
    assert.match(String(miss.body.error), /not found/i);
  });

  test('FX093 POST /api/marketplace/install/:id — local request returns HITL nonce', async () => {
    const app = makeApp();
    const { deps } = makeDeps([buildItem({ id: 'a', name: 'Alpha' })]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/marketplace/install/a' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'pending_approval');
    assert.match(String(res.body.nonce), /^[0-9a-f]{64}$/);
    assert.equal(res.body.item.id, 'a');
    assert.equal(res.body.item.name, 'Alpha');
    assert.ok(new Date(res.body.expiresAt).getTime() > Date.now());
  });

  test('FX093 POST /api/marketplace/install/:id — non-loopback origin is rejected (403)', async () => {
    const app = makeApp();
    let rejectedCount = 0;
    const { deps } = makeDeps([buildItem({ id: 'a' })], {
      rejectIfRemote: (_req, res) => {
        rejectedCount += 1;
        res.status(403).json({ error: 'Forbidden: local access only' });
        return true;
      },
    });
    setupMarketplaceRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/marketplace/install/a');
    assert.equal(captured.statusCode, 403);
    assert.equal(rejectedCount, 1);
  });

  test('FX093 POST /api/marketplace/install/:id — 404 for unknown, 409 when already installing', async () => {
    const app = makeApp();
    const { deps } = makeDeps([buildItem({ id: 'busy', status: 'installing' })]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const miss = await harness.request({ method: 'POST', path: '/api/marketplace/install/missing' });
    assert.equal(miss.status, 404);
    const busy = await harness.request({ method: 'POST', path: '/api/marketplace/install/busy' });
    assert.equal(busy.status, 409);
  });

  test('install/:id/confirm — valid nonce starts install + records HITL nonce as one-time-use', async () => {
    const app = makeApp();
    const { deps, broadcasts, installCalls } = makeDeps([buildItem({ id: 'a' })]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const intent = await harness.request({ method: 'POST', path: '/api/marketplace/install/a' });
    const nonce = intent.body.nonce as string;
    const ok = await harness.request({
      method: 'POST', path: '/api/marketplace/install/a/confirm',
      body: { nonce, sandboxEnabled: true, runSecurityScan: false },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'installing');
    // wait one tick for async install promise to schedule broadcast
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(installCalls.length, 1);
    assert.equal(installCalls[0].opts.runSecurityScan, false);
    assert.ok(broadcasts.some((b) => b.type === 'marketplace.installing'));
    // Nonce is one-time-use: replay must fail
    const replay = await harness.request({
      method: 'POST', path: '/api/marketplace/install/a/confirm',
      body: { nonce, sandboxEnabled: true, runSecurityScan: false },
    });
    assert.equal(replay.status, 403);
    assert.match(String(replay.body.error), /invalid|expired/i);
  });

  test('install/:id/confirm — nonce mismatched to item is rejected', async () => {
    const app = makeApp();
    const { deps } = makeDeps([buildItem({ id: 'a' }), buildItem({ id: 'b' })]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const intent = await harness.request({ method: 'POST', path: '/api/marketplace/install/a' });
    const wrong = await harness.request({
      method: 'POST', path: '/api/marketplace/install/b/confirm',
      body: { nonce: intent.body.nonce },
    });
    assert.equal(wrong.status, 403);
    assert.match(String(wrong.body.error), /does not match/i);
  });

  test('FX094 POST /api/marketplace/scan/:id — 400 when not installed, 404 unknown, 200 scanning when installed', async () => {
    const app = makeApp();
    const { deps, broadcasts } = makeDeps([
      buildItem({ id: 'fresh' }),
      buildItem({ id: 'live', status: 'installed', installPath: '/tmp/x' }),
    ]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const miss = await harness.request({ method: 'POST', path: '/api/marketplace/scan/missing' });
    assert.equal(miss.status, 404);
    const notInst = await harness.request({ method: 'POST', path: '/api/marketplace/scan/fresh' });
    assert.equal(notInst.status, 400);
    const ok = await harness.request({ method: 'POST', path: '/api/marketplace/scan/live' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'scanning');
    assert.ok(broadcasts.some((b) => b.type === 'marketplace.scanning'));
  });

  test('FX095 GET /api/marketplace/scanners — returns availability', async () => {
    const app = makeApp();
    const { deps } = makeDeps([]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/marketplace/scanners' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, SCANNER_AVAIL);
  });

  test('FX096 GET /api/marketplace/featured — filtered by featured flag', async () => {
    const app = makeApp();
    const { deps } = makeDeps([
      buildItem({ id: 'a', featured: true }),
      buildItem({ id: 'b', featured: false }),
      buildItem({ id: 'c', featured: true }),
    ]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/marketplace/featured' });
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.deepEqual(res.body.items.map((it: MarketplaceItem) => it.id).sort(), ['a', 'c']);
  });

  test('FX097 GET /api/marketplace/installed — filtered by installed status', async () => {
    const app = makeApp();
    const { deps } = makeDeps([
      buildItem({ id: 'a', status: 'installed' }),
      buildItem({ id: 'b', status: 'not-installed' }),
      buildItem({ id: 'c', status: 'installed' }),
      buildItem({ id: 'd', status: 'quarantined' }),
    ]);
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/marketplace/installed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.deepEqual(res.body.items.map((it: MarketplaceItem) => it.id).sort(), ['a', 'c']);
  });

  test('uninstall remote-origin is rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps([buildItem({ id: 'a', status: 'installed' })], {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupMarketplaceRoutes(app, deps);
    const captured = await invokeRemote(app, 'DELETE', '/api/marketplace/uninstall/a');
    assert.equal(captured.statusCode, 403);
  });
});
