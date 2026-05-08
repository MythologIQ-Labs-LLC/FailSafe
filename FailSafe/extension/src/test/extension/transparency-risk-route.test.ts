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
