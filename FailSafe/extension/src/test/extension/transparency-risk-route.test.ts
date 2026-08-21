// Functional tests for TransparencyRiskRoute (FX110 transparency + FX111-FX114 risk CRUD).
// Drives every endpoint via the in-process HTTP harness; sink: real status codes,
// JSON bodies, and the in-memory risk store + broadcast log.

import { strict as assert } from 'assert';
import { setupTransparencyRiskRoutes } from '../../roadmap/routes/TransparencyRiskRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';

interface Risk { id: string; title: string; severity: string; status: string; description: string; createdAt: string; }

function makeDeps(initial: Risk[] = [], overrides: Partial<ApiRouteDeps> = {}): {
  deps: ApiRouteDeps; store: Risk[]; broadcasts: Array<Record<string, unknown>>;
} {
  const store: Risk[] = [...initial];
  const broadcasts: Array<Record<string, unknown>> = [];
  const base: Partial<ApiRouteDeps> = {
    rejectIfRemote: () => false,
    broadcast: (data) => { broadcasts.push(data); },
    getRiskRegister: () => store,
    // #377: mutations read the durable store; in this fake the single array
    // serves both views unless a case overrides with separate arrays (the
    // stored-vs-display distinction is the point of the contract-pin case).
    getStoredRiskRegister: () => store,
    writeRiskRegister: (next: any[]) => {
      const copy = [...next];
      store.length = 0;
      for (const r of copy) store.push(r as Risk);
    },
    getTransparencyEvents: () => [{ id: 'tx-1', kind: 'audit' }] as never,
  };
  const deps = Object.assign({}, base, overrides) as ApiRouteDeps;
  return { deps, store, broadcasts };
}

suite('TransparencyRiskRoute (FX110, FX111–FX114)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('FX110 GET /api/transparency — returns events array', async () => {
    const app = makeApp();
    const { deps } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/transparency' });
    assert.equal(res.status, 200);
    assert.equal(res.body.events.length, 1);
    assert.equal(res.body.events[0].id, 'tx-1');
  });

  test('FX111 GET /api/risks — returns current register', async () => {
    const app = makeApp();
    const seed: Risk = { id: 'r1', title: 'Seeded', severity: 'high', status: 'open', description: '', createdAt: '2026-05-06T00:00:00Z' };
    const { deps } = makeDeps([seed]);
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/risks' });
    assert.equal(res.status, 200);
    assert.equal(res.body.risks.length, 1);
    assert.equal(res.body.risks[0].id, 'r1');
  });

  test('FX112 POST /api/v1/risks — creates risk + broadcasts + returns it', async () => {
    const app = makeApp();
    const { deps, store, broadcasts } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/risks',
      body: { title: 'Test risk', severity: 'medium', status: 'open', description: 'unit test' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.risk.title, 'Test risk');
    assert.equal(res.body.risk.severity, 'medium');
    assert.equal(res.body.risk.status, 'open');
    assert.match(String(res.body.risk.id), /^risk-\d+$/);
    assert.equal(store.length, 1);
    assert.deepEqual(store[0], res.body.risk);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].type, 'risk.created');
  });

  test('FX112 POST /api/v1/risks — defaults status to "open" when omitted', async () => {
    const app = makeApp();
    const { deps } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/risks',
      body: { title: 'no-status', severity: 'low' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.risk.status, 'open');
  });

  test('FX112 POST /api/v1/risks — 400 when title or severity is missing', async () => {
    const app = makeApp();
    const { deps } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const noTitle = await harness.request({
      method: 'POST', path: '/api/v1/risks', body: { severity: 'high' },
    });
    assert.equal(noTitle.status, 400);
    assert.equal(noTitle.body.ok, false);
    const noSev = await harness.request({
      method: 'POST', path: '/api/v1/risks', body: { title: 'x' },
    });
    assert.equal(noSev.status, 400);
    assert.equal(noSev.body.ok, false);
  });

  test('FX112 POST /api/v1/risks — title truncated to 200 chars, description to 2000', async () => {
    const app = makeApp();
    const { deps } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const longTitle = 't'.repeat(500);
    const longDesc = 'd'.repeat(5000);
    const res = await harness.request({
      method: 'POST', path: '/api/v1/risks',
      body: { title: longTitle, severity: 'high', description: longDesc },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.risk.title.length, 200);
    assert.equal(res.body.risk.description.length, 2000);
  });

  test('FX112 POST /api/v1/risks — non-loopback origin rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps([], {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupTransparencyRiskRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/v1/risks');
    assert.equal(captured.statusCode, 403);
  });

  test('FX113 PUT /api/v1/risks/:id — updates known risk + broadcasts', async () => {
    const app = makeApp();
    const seed: Risk = { id: 'r1', title: 'A', severity: 'low', status: 'open', description: '', createdAt: '2026-05-06T00:00:00Z' };
    const { deps, store, broadcasts } = makeDeps([seed]);
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'PUT', path: '/api/v1/risks/r1',
      body: { title: 'A updated', status: 'mitigated' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.risk.title, 'A updated');
    assert.equal(res.body.risk.status, 'mitigated');
    assert.equal(res.body.risk.severity, 'low'); // preserved
    assert.equal(store[0].title, 'A updated');
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].type, 'risk.updated');
  });

  test('FX113 PUT /api/v1/risks/:id — request body cannot spoof the id (security)', async () => {
    const app = makeApp();
    const seed: Risk = { id: 'r1', title: 'A', severity: 'low', status: 'open', description: '', createdAt: '2026-05-06T00:00:00Z' };
    const { deps, store } = makeDeps([seed]);
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'PUT', path: '/api/v1/risks/r1',
      body: { id: 'attacker-controlled', title: 'A2' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.risk.id, 'r1'); // path id wins
    assert.equal(store[0].id, 'r1');
  });

  test('FX113 PUT /api/v1/risks/:id — 404 for unknown id', async () => {
    const app = makeApp();
    const { deps } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'PUT', path: '/api/v1/risks/missing', body: { title: 'x' },
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });

  test('FX113 PUT /api/v1/risks/:id — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps([], {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupTransparencyRiskRoutes(app, deps);
    const captured = await invokeRemote(app, 'PUT', '/api/v1/risks/r1');
    assert.equal(captured.statusCode, 403);
  });

  test('FX114 DELETE /api/v1/risks/:id — removes known risk + broadcasts', async () => {
    const app = makeApp();
    const seed: Risk = { id: 'r1', title: 'A', severity: 'low', status: 'open', description: '', createdAt: '2026-05-06T00:00:00Z' };
    const { deps, store, broadcasts } = makeDeps([seed]);
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'DELETE', path: '/api/v1/risks/r1' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(store.length, 0);
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].type, 'risk.deleted');
    assert.deepEqual(broadcasts[0].payload, { id: 'r1' });
  });

  test('FX114 DELETE /api/v1/risks/:id — 404 for unknown id', async () => {
    const app = makeApp();
    const { deps } = makeDeps();
    setupTransparencyRiskRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'DELETE', path: '/api/v1/risks/missing' });
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });

  test('FX114 DELETE /api/v1/risks/:id — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps([], {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupTransparencyRiskRoutes(app, deps);
    const captured = await invokeRemote(app, 'DELETE', '/api/v1/risks/r1');
    assert.equal(captured.statusCode, 403);
  });
});

// ── #377: mutations read the DURABLE store, never the display fallback ────────
// (plan-risk-routes-durable-store-377; #241 F-6 sibling on the route path)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskRegisterManager } from '../../roadmap/services/RiskRegisterManager';

suite('#377 durable-store-only route mutations', () => {
  let harness2: RouteHarness;
  teardown(async () => { if (harness2) await harness2.stop(); });

  test('contract pin: POST writes stored+1, NOT display+1 (fallback never promoted)', async () => {
    const stored: Risk[] = [];
    const fallback: Risk[] = [0, 1, 2].map(i => ({
      id: `backlog:S${i}`, title: `backlog ${i}`, severity: 'medium',
      status: 'open', description: '', createdAt: '2026-01-01T00:00:00Z',
    }));
    const writes: Risk[][] = [];
    const { deps } = makeDeps([], {
      getRiskRegister: () => [...stored, ...fallback],
      getStoredRiskRegister: () => [...stored],
      writeRiskRegister: (next: any[]) => { writes.push(next as Risk[]); },
    });
    const app = makeApp();
    setupTransparencyRiskRoutes(app, deps);
    harness2 = new RouteHarness(app);
    await harness2.start();
    const res = await harness2.request({
      path: '/api/v1/risks', method: 'POST',
      body: { title: 'real risk', severity: 'high' },
    });
    assert.equal(res.status, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].length, 1,
      'the write must contain ONLY the new record — a length of 4 means the display fallback was durably promoted');
  });

  test('real manager: POST on a backlog-only workspace persists exactly one record', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx377-routes-'));
    try {
      const docsDir = path.join(dir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'BACKLOG.md'),
        ['## Security Blockers', '', '- [ ] [S0] item 0', '- [ ] [S1] item 1', '- [ ] [S2] item 2'].join('\n'), 'utf-8');
      const mgr = new RiskRegisterManager(dir);
      const { deps } = makeDeps([], {
        getRiskRegister: () => mgr.getRisks() as unknown as Risk[],
        getStoredRiskRegister: () => mgr.getStoredRisks() as unknown as Risk[],
        writeRiskRegister: (next: any[]) => mgr.writeRisks(next),
      });
      const app = makeApp();
      setupTransparencyRiskRoutes(app, deps);
      harness2 = new RouteHarness(app);
      await harness2.start();
      assert.equal(mgr.getRisks().length, 3, 'precondition: display view shows the fallback');
      const res = await harness2.request({
        path: '/api/v1/risks', method: 'POST',
        body: { title: 'one real risk', severity: 'high' },
      });
      assert.equal(res.status, 200);
      const onDisk = JSON.parse(fs.readFileSync(
        path.join(dir, '.failsafe', 'risks', 'risks.json'), 'utf-8')).risks;
      assert.equal(onDisk.length, 1,
        `exactly ONE record must persist; got ${onDisk.length} (fallback promotion)`);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  test('PUT on a backlog-derived id: 404 with the read-only explanation', async () => {
    const { deps } = makeDeps([], {
      getRiskRegister: () => [{
        id: 'backlog:S0', title: 'b', severity: 'medium', status: 'open',
        description: '', createdAt: '2026-01-01T00:00:00Z',
      }],
      getStoredRiskRegister: () => [],
    });
    const app = makeApp();
    setupTransparencyRiskRoutes(app, deps);
    harness2 = new RouteHarness(app);
    await harness2.start();
    const res = await harness2.request({
      path: '/api/v1/risks/backlog%3AS0', method: 'PUT', body: { status: 'closed' },
    });
    assert.equal(res.status, 404);
    assert.match(String(res.body.error), /backlog-derived rows are read-only/,
      'the error body must explain the contract for raw API consumers');
  });

  test('DELETE on a backlog-derived id: 404, nothing written', async () => {
    const writes: unknown[] = [];
    const { deps } = makeDeps([], {
      getStoredRiskRegister: () => [],
      writeRiskRegister: (next: any[]) => { writes.push(next); },
    });
    const app = makeApp();
    setupTransparencyRiskRoutes(app, deps);
    harness2 = new RouteHarness(app);
    await harness2.start();
    const res = await harness2.request({ path: '/api/v1/risks/backlog%3AS1', method: 'DELETE' });
    assert.equal(res.status, 404);
    assert.equal(writes.length, 0);
  });
});
