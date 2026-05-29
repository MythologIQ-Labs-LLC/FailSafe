// FX808 — OpenDesignRoute (B-OD-8): create_artifact enqueues L3 + 409 pending,
// never invokes the client. FX809 (decide-l3) lives in actions-route.test.ts.
// Uses the in-process RouteHarness (no raw fetch/listen) for isolation safety
// under the full vscode-test suite run.

import { strict as assert } from 'assert';
import {
  setupOpenDesignRoutes,
  OPEN_DESIGN_CREATE_ARTIFACT_KIND,
  type OpenDesignRouteDeps,
} from '../../../roadmap/routes/OpenDesignRoute';
import { RouteHarness, makeApp, invokeRemote } from '../../extension/helpers/routeTestHarness';

interface QueueRecord { request: Record<string, unknown>; }

function makeDeps(overrides: Partial<OpenDesignRouteDeps> = {}): {
  deps: OpenDesignRouteDeps;
  queued: QueueRecord[];
} {
  const queued: QueueRecord[] = [];
  const deps: OpenDesignRouteDeps = {
    rejectIfRemote: () => false,
    broadcast: () => {},
    // A connected client whose execute method must NOT be reached by the route.
    getOpenDesignClient: () =>
      ({ executeApprovedCreateArtifact: async () => ({ isError: false }) }) as never,
    queueL3Approval: async (request) => {
      queued.push({ request: request as unknown as Record<string, unknown> });
      return 'approval-1';
    },
    ...overrides,
  };
  return { deps, queued };
}

suite('roadmap/routes OpenDesignRoute (B-OD-8 FX808)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('valid create_artifact request enqueues L3 {kind,meta} and returns 409 pending; client untouched', async () => {
    const app = makeApp();
    const { deps, queued } = makeDeps();
    setupOpenDesignRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/open-design-create-artifact',
      body: { args: { name: 'hero.svg', path: 'assets/hero.svg' } },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.pending, true);
    assert.equal(res.body.approvalId, 'approval-1');
    assert.equal(queued.length, 1, 'exactly one L3 enqueue');
    const r = queued[0].request;
    assert.equal(r.kind, OPEN_DESIGN_CREATE_ARTIFACT_KIND);
    assert.deepEqual(r.meta, { tool: 'create_artifact', args: { name: 'hero.svg', path: 'assets/hero.svg' } });
    assert.equal(r.filePath, 'assets/hero.svg', 'filePath derived from args.path');
    assert.equal(r.riskGrade, 'L3');
  });

  test('missing args object returns 400 and does not enqueue', async () => {
    const app = makeApp();
    const { deps, queued } = makeDeps();
    setupOpenDesignRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/open-design-create-artifact', body: { notArgs: 1 },
    });
    assert.equal(res.status, 400);
    assert.equal(queued.length, 0, 'no enqueue on bad request');
  });

  test('client not connected returns 503 and does not enqueue', async () => {
    const app = makeApp();
    const queued: QueueRecord[] = [];
    const { deps } = makeDeps({
      getOpenDesignClient: () => null,
      queueL3Approval: async (request) => {
        queued.push({ request: request as unknown as Record<string, unknown> });
        return 'x';
      },
    });
    setupOpenDesignRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/open-design-create-artifact', body: { args: { name: 'a' } },
    });
    assert.equal(res.status, 503);
    assert.equal(queued.length, 0, 'no enqueue when client unavailable');
  });

  test('filePath falls back to a synthetic id when args.path is absent', async () => {
    const app = makeApp();
    const { deps, queued } = makeDeps();
    setupOpenDesignRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({
      method: 'POST', path: '/api/actions/open-design-create-artifact', body: { args: { name: 'no-path' } },
    });
    assert.equal(queued[0].request.filePath, 'open-design:create_artifact');
  });

  test('remote request is rejected before enqueue', async () => {
    const app = makeApp();
    const queued: QueueRecord[] = [];
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ ok: false }); return true; },
      queueL3Approval: async (request) => {
        queued.push({ request: request as unknown as Record<string, unknown> });
        return 'x';
      },
    });
    setupOpenDesignRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/open-design-create-artifact');
    assert.equal(captured.statusCode, 403);
    assert.equal(queued.length, 0, 'remote request never enqueues');
  });
});
