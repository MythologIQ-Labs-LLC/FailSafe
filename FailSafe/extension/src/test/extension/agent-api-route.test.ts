// Functional tests for AgentApiRoute — timeline, health, genome, runs, run steps
// (FX078 GET /api/v1/genome + run-replay surface).

import { strict as assert } from 'assert';
import { setupAgentApiRoutes } from '../../roadmap/routes/AgentApiRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

function makeDeps(overrides: Partial<ApiRouteDeps> = {}): ApiRouteDeps {
  return Object.assign({
    rejectIfRemote: () => false,
    broadcast: () => undefined,
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
  } as Partial<ApiRouteDeps>, overrides) as ApiRouteDeps;
}

suite('AgentApiRoute (FX078 genome + timeline/health/runs/steps)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('GET /api/v1/timeline — returns entries from getTimelineEntries with query', async () => {
    let captured: unknown = null;
    const app = makeApp();
    const deps = makeDeps({
      getTimelineEntries: (q) => { captured = q; return [{ id: 'a', timestamp: 't1' }] as never; },
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/timeline?after=2026-01-01' });
    assert.equal(res.status, 200);
    assert.equal(res.body.entries.length, 1);
    assert.equal((captured as Record<string, unknown>)?.after, '2026-01-01');
  });

  test('GET /api/v1/timeline — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const deps = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupAgentApiRoutes(app, deps);
    const captured = await invokeRemote(app, 'GET', '/api/v1/timeline');
    assert.equal(captured.statusCode, 403);
  });

  test('GET /api/v1/health — returns getHealthMetrics result', async () => {
    const app = makeApp();
    const deps = makeDeps({
      getHealthMetrics: () => ({ uptime: 100, errorRate: 0.01 }) as never,
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/health' });
    assert.equal(res.status, 200);
    assert.equal(res.body.metrics.uptime, 100);
  });

  test('GET /api/v1/health — null metrics propagated', async () => {
    const app = makeApp();
    const deps = makeDeps({ getHealthMetrics: () => null });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/health' });
    assert.equal(res.status, 200);
    assert.equal(res.body.metrics, null);
  });

  test('FX078 GET /api/v1/genome — returns patterns + allPatterns + unresolved buckets', async () => {
    const app = makeApp();
    const deps = makeDeps({
      getGenomePatterns: async () => [{ failureMode: 'HALLUCINATION', count: 3 }] as never,
      getGenomeAllPatterns: async () => [
        { failureMode: 'HALLUCINATION', count: 3, remediationStatus: 'UNRESOLVED' },
        { failureMode: 'STALE_CACHE', count: 1, remediationStatus: 'RESOLVED' },
      ] as never,
      getGenomeUnresolved: async (limit?: number) => {
        return Array.from({ length: Math.min(limit ?? 50, 2) }, (_, i) => ({
          id: `sg-${i}`, failureMode: 'HALLUCINATION', remediationStatus: 'UNRESOLVED',
        })) as never;
      },
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/genome' });
    assert.equal(res.status, 200);
    assert.equal(res.body.patterns.length, 1);
    assert.equal(res.body.allPatterns.length, 2);
    assert.equal(res.body.unresolved.length, 2);
  });

  test('FX078 GET /api/v1/genome — passes limit=50 to getGenomeUnresolved', async () => {
    let receivedLimit: number | undefined;
    const app = makeApp();
    const deps = makeDeps({
      getGenomeUnresolved: async (limit?: number) => {
        receivedLimit = limit;
        return [] as never;
      },
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/v1/genome' });
    assert.equal(receivedLimit, 50);
  });

  test('GET /api/v1/runs — returns active + completed buckets', async () => {
    const app = makeApp();
    const deps = makeDeps({
      getActiveRuns: () => [{ id: 'r-1', status: 'running' }] as never,
      getCompletedRuns: () => [{ id: 'r-2', status: 'success' }, { id: 'r-3', status: 'failed' }] as never,
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/runs' });
    assert.equal(res.status, 200);
    assert.equal(res.body.active.length, 1);
    assert.equal(res.body.completed.length, 2);
  });

  test('GET /api/v1/runs/:runId — 400 when runId is not a UUID', async () => {
    const app = makeApp();
    const deps = makeDeps();
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/runs/not-a-uuid' });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /Invalid run ID format/);
  });

  test('GET /api/v1/runs/:runId — 404 when run not found in memory or store', async () => {
    const app = makeApp();
    const deps = makeDeps({
      getRun: () => undefined,
      loadRun: () => null,
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: `/api/v1/runs/${VALID_UUID}` });
    assert.equal(res.status, 404);
    assert.match(String(res.body.error), /Run not found/);
  });

  test('GET /api/v1/runs/:runId — returns in-memory run when present', async () => {
    const app = makeApp();
    const deps = makeDeps({
      getRun: () => ({ id: VALID_UUID, status: 'running', steps: [] }) as never,
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: `/api/v1/runs/${VALID_UUID}` });
    assert.equal(res.status, 200);
    assert.equal(res.body.run.id, VALID_UUID);
    assert.equal(res.body.run.status, 'running');
  });

  test('GET /api/v1/runs/:runId — falls back to loadRun when getRun returns undefined', async () => {
    const app = makeApp();
    const deps = makeDeps({
      getRun: () => undefined,
      loadRun: (id: string) => ({ id, status: 'completed', loadedFromStore: true }) as never,
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: `/api/v1/runs/${VALID_UUID_2}` });
    assert.equal(res.status, 200);
    assert.equal(res.body.run.loadedFromStore, true);
  });

  test('GET /api/v1/runs/:runId/steps — 400 on invalid UUID', async () => {
    const app = makeApp();
    const deps = makeDeps();
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/runs/foobar/steps' });
    assert.equal(res.status, 400);
  });

  test('GET /api/v1/runs/:runId/steps — returns steps from getRunSteps', async () => {
    const app = makeApp();
    let captured: string | undefined;
    const deps = makeDeps({
      getRunSteps: (id: string) => {
        captured = id;
        return [
          { id: 's-1', name: 'step-1', status: 'success' },
          { id: 's-2', name: 'step-2', status: 'success' },
        ] as never;
      },
    });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: `/api/v1/runs/${VALID_UUID}/steps` });
    assert.equal(res.status, 200);
    assert.equal(res.body.steps.length, 2);
    assert.equal(captured, VALID_UUID);
  });

  test('GET /api/v1/runs/:runId/steps — empty steps array when run has none', async () => {
    const app = makeApp();
    const deps = makeDeps({ getRunSteps: () => [] });
    setupAgentApiRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: `/api/v1/runs/${VALID_UUID}/steps` });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.steps, []);
  });
});
