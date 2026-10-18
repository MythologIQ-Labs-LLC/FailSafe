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
const SCAN_PASS = {
  passed: true, scanner: 'both', timestamp: '2026-05-06T00:00:00Z',
  findings: [], riskGrade: 'L1', recommendedAction: 'approve', scanStatus: 'completed',
} as SecurityScanResult;

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
  // Four historical positive install route cases are deferred while endpoints intentionally return 503 (#468/#469).
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

  test.skip('FX093 POST /api/marketplace/install/:id — local request returns HITL nonce', async () => {
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

  test.skip('FX093 POST /api/marketplace/install/:id — 404 for unknown, 409 when already installing', async () => {
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

  test.skip('install/:id/confirm — valid nonce starts install + records HITL nonce as one-time-use', async () => {
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

  test.skip('install/:id/confirm — nonce mismatched to item is rejected', async () => {
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

  test('FX094 POST /api/marketplace/scan/:id — 503 while installs are disabled; the scanner never runs (#468)', async () => {
    const app = makeApp();
    const scanCalls: string[] = [];
    const { deps, broadcasts } = makeDeps(
      [buildItem({ id: 'live', status: 'installed', installPath: '/tmp/x' })],
      { securityScanner: { checkAvailability: async () => SCANNER_AVAIL,
          runFullScan: async (installPath: string) => { scanCalls.push(installPath); return SCAN_PASS; } } as never },
    );
    setupMarketplaceRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const live = await harness.request({ method: 'POST', path: '/api/marketplace/scan/live' });
    assert.equal(live.status, 503);
    assert.match(String(live.body.error), /disabled/i);
    const unknown = await harness.request({ method: 'POST', path: '/api/marketplace/scan/missing' });
    assert.equal(unknown.status, 503, 'gate precedes item lookup');
    assert.deepEqual(scanCalls, [], 'scanner must not run on untrusted install paths');
    assert.ok(!broadcasts.some((b) => b.type === 'marketplace.scanning'));
    assert.equal(deps.marketplaceCatalog.getItem('live')?.status, 'installed');
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

// #538 lane C (plan LD13): the uninstall receipt is awaited and caught. A
// receipt that cannot be written is reported on the event, never left as an
// unhandled rejection; the item is still not-installed because its files are gone.
suite('#538 uninstall receipt', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  async function uninstallWith(ledgerManager: unknown) {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const app = makeApp();
      const { deps, broadcasts } = makeDeps([buildItem({ id: 'a', status: 'installed', installPath: '/tmp/a' })], { ledgerManager: ledgerManager as never });
      setupMarketplaceRoutes(app, deps);
      harness = new RouteHarness(app);
      await harness.start();
      const res = await harness.request({ method: 'DELETE', path: '/api/marketplace/uninstall/a' });
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      return { res, broadcasts, status: deps.marketplaceCatalog.getItem('a')?.status, unhandled };
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  }

  test('U1 a rejecting ledger: 200, one append, no unhandled rejection, not-installed, and the event says recorded false', async () => {
    const appends: unknown[] = [];
    const out = await uninstallWith({
      isAvailable: () => true,
      appendEntry: async (e: unknown) => { appends.push(e); throw new Error('disk full'); },
    });
    assert.equal(out.res.status, 200);
    assert.equal(appends.length, 1, 'exactly one appendEntry call');
    assert.equal(out.unhandled.length, 0, 'no unhandled rejection');
    assert.equal(out.status, 'not-installed');
    const ev = out.broadcasts.find((b) => b.type === 'marketplace.uninstalled') as { payload: Record<string, unknown> } | undefined;
    assert.ok(ev, 'marketplace.uninstalled broadcast');
    assert.equal(ev!.payload.recorded, false);
    assert.match(String(ev!.payload.ledgerError), /disk full/);
  });

  test('U2 a recording ledger: the event says recorded true with the entry id', async () => {
    const out = await uninstallWith({
      isAvailable: () => true,
      appendEntry: async () => ({ id: 42, entryHash: 'h42' }),
    });
    assert.equal(out.res.status, 200);
    const ev = out.broadcasts.find((b) => b.type === 'marketplace.uninstalled') as { payload: Record<string, unknown> } | undefined;
    assert.equal(ev?.payload.recorded, true);
    assert.equal(ev?.payload.ledgerEntryId, 42);
    assert.equal(out.unhandled.length, 0);
  });
});
