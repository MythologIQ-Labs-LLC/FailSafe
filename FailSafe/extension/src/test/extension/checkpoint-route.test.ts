// Functional tests for CheckpointRoute (checkpoint list/detail/rollback).
// Routes were extracted from ConsoleServer; verify each branch + cap behavior
// + the rollback security gates.

import { strict as assert } from 'assert';
import { setupCheckpointRoutes } from '../../roadmap/routes/CheckpointRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';

interface Checkpoint { id: string; createdAt: string; checkpointType: string; }

function makeDeps(overrides: Partial<ApiRouteDeps> = {}): {
  deps: ApiRouteDeps;
  broadcasts: Array<Record<string, unknown>>;
} {
  const broadcasts: Array<Record<string, unknown>> = [];
  const deps = Object.assign({
    rejectIfRemote: () => false,
    broadcast: (data: Record<string, unknown>) => { broadcasts.push(data); },
    getRecentCheckpoints: () => [] as Checkpoint[],
    getCheckpointById: () => null,
    verifyCheckpointChain: () => true,
    revertService: null,
  } as Partial<ApiRouteDeps>, overrides) as ApiRouteDeps;
  return { deps, broadcasts };
}

suite('CheckpointRoute (FX list/detail + /api/actions/rollback)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('GET /api/checkpoints — returns checkpoints + chain valid flag', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: () => [
        { id: 'cp-1', createdAt: 't1', checkpointType: 'monitoring.resumed' },
        { id: 'cp-2', createdAt: 't2', checkpointType: 'monitoring.stopped' },
      ] as never,
      verifyCheckpointChain: () => true,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/checkpoints' });
    assert.equal(res.status, 200);
    assert.equal(res.body.checkpoints.length, 2);
    assert.equal(res.body.chainValid, true);
  });

  test('GET /api/checkpoints — limit query is parsed and capped at 200', async () => {
    let received: number | undefined;
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: (limit?: number) => { received = limit; return [] as never; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/checkpoints?limit=500' });
    assert.equal(received, 200, 'limit should clamp to 200 max');
  });

  test('GET /api/checkpoints — invalid limit defaults to 50', async () => {
    let received: number | undefined;
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: (limit?: number) => { received = limit; return [] as never; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/checkpoints?limit=notanumber' });
    assert.equal(received, 50);
  });

  test('GET /api/checkpoints — limit floor is 1', async () => {
    let received: number | undefined;
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: (limit?: number) => { received = limit; return [] as never; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/checkpoints?limit=-5' });
    assert.equal(received, 1, 'limit should clamp to 1 minimum');
  });

  test('GET /api/checkpoints/:id — returns checkpoint when found', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      getCheckpointById: (id: string) => ({ id, checkpointType: 'sprint.start' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/checkpoints/cp-42' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.checkpoint.id, 'cp-42');
  });

  test('GET /api/checkpoints/:id — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupCheckpointRoutes(app, deps);
    const captured = await invokeRemote(app, 'GET', '/api/checkpoints/cp-42');
    assert.equal(captured.statusCode, 403);
  });

  test('POST /api/actions/rollback — 503 when revertService is unavailable', async () => {
    const app = makeApp();
    const { deps } = makeDeps({ revertService: null });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'cp-1' },
    });
    assert.equal(res.status, 503);
    assert.match(String(res.body.error), /revert service unavailable/);
  });

  test('POST /api/actions/rollback — 400 when checkpointId missing', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: { revert: async () => ({ success: true }) } as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/rollback', body: {} });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /checkpointId required/);
  });

  test('POST /api/actions/rollback — 404 when checkpoint not found', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: { revert: async () => ({ success: true }) } as never,
      getCheckpointById: () => null,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'missing' },
    });
    assert.equal(res.status, 404);
    assert.match(String(res.body.error), /checkpoint not found/);
  });

  test('POST /api/actions/rollback — happy path calls revert + broadcasts hub.refresh', async () => {
    let revertCalled = false;
    let revertArgs: unknown = null;
    const app = makeApp();
    const { deps, broadcasts } = makeDeps({
      revertService: {
        revert: async (req: unknown) => {
          revertCalled = true;
          revertArgs = req;
          return { success: true, steps: [] };
        },
      } as never,
      getCheckpointById: (id: string) => ({ id, checkpointType: 'sprint.start' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback',
      body: { checkpointId: 'cp-42', reason: 'rollback test' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(revertCalled);
    const args = revertArgs as { actor: string; reason: string; targetCheckpoint: { id: string } };
    assert.equal(args.actor, 'user.local');
    assert.equal(args.reason, 'rollback test');
    assert.equal(args.targetCheckpoint.id, 'cp-42');
    assert.ok(broadcasts.some((b) => b.type === 'hub.refresh'));
  });

  test('POST /api/actions/rollback — reason is truncated to 2000 chars', async () => {
    let captured = '';
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: {
        revert: async (req: unknown) => {
          captured = (req as { reason: string }).reason;
          return { success: true };
        },
      } as never,
      getCheckpointById: () => ({ id: 'cp-1', checkpointType: 'x' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({
      method: 'POST', path: '/api/actions/rollback',
      body: { checkpointId: 'cp-1', reason: 'r'.repeat(5000) },
    });
    assert.equal(captured.length, 2000);
  });

  test('POST /api/actions/rollback — 500 when revert throws', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: {
        revert: async () => { throw new Error('git reset failed'); },
      } as never,
      getCheckpointById: () => ({ id: 'cp-1', checkpointType: 'x' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'cp-1' },
    });
    assert.equal(res.status, 500);
    assert.match(String(res.body.error), /git reset failed/);
  });

  test('POST /api/actions/rollback — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupCheckpointRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/rollback');
    assert.equal(captured.statusCode, 403);
  });
});
