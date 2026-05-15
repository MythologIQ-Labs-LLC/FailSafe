// Functional tests for BrainstormRoute node CRUD + graph + pending/retry
// (FX082 POST /node, FX083 GET /graph, FX084 POST /transcript, plus PATCH/DELETE/clear/pending/retry).

import { strict as assert } from 'assert';
import { setupBrainstormRoutes } from '../../roadmap/routes/BrainstormRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';

interface Node { id: string; label: string; type: string; }

interface BrainstormStub {
  graph: { nodes: Node[]; edges: unknown[] };
  pending: Array<{ id: string; transcript: string }>;
  addNode: (label: string, type: string, clientId?: string) => Node;
  updateNode: (id: string, label: string, type: string) => Node | null;
  removeNode: (id: string) => boolean;
  getGraph: () => { nodes: Node[]; edges: unknown[] };
  reset: () => void;
  getPendingTranscripts: () => Array<{ id: string; transcript: string }>;
  retryPending: () => Promise<Array<{ extraction?: unknown }>>;
  processTranscript: (transcript: string) => Promise<{ extraction?: unknown; queued?: unknown }>;
}

function makeBrainstormStub(): BrainstormStub {
  const graph = { nodes: [] as Node[], edges: [] as unknown[] };
  const pending: Array<{ id: string; transcript: string }> = [];
  let counter = 0;
  return {
    graph, pending,
    addNode(label, type, clientId) {
      const node: Node = { id: clientId || `n-${++counter}`, label, type };
      graph.nodes.push(node);
      return node;
    },
    updateNode(id, label, type) {
      const found = graph.nodes.find((n) => n.id === id);
      if (!found) return null;
      found.label = label;
      found.type = type;
      return found;
    },
    removeNode(id) {
      const idx = graph.nodes.findIndex((n) => n.id === id);
      if (idx < 0) return false;
      graph.nodes.splice(idx, 1);
      return true;
    },
    getGraph() { return graph; },
    reset() { graph.nodes.length = 0; graph.edges.length = 0; pending.length = 0; },
    getPendingTranscripts() { return pending; },
    retryPending: async () => pending.map(() => ({ extraction: { nodes: [], edges: [] } })),
    processTranscript: async (transcript) => ({
      extraction: { nodes: [{ id: 't-1', label: transcript.slice(0, 30), type: 'Idea' }], edges: [] },
    }),
  };
}

function makeDeps(stub: BrainstormStub, overrides: Partial<ApiRouteDeps> = {}): {
  deps: ApiRouteDeps;
  broadcasts: Array<Record<string, unknown>>;
} {
  const broadcasts: Array<Record<string, unknown>> = [];
  const deps = Object.assign({
    rejectIfRemote: () => false,
    broadcast: (data: Record<string, unknown>) => { broadcasts.push(data); },
    brainstormService: stub as never,
    audioVaultService: { storeAudio: async () => 'hash', getAudio: async () => null } as never,
  }, overrides) as ApiRouteDeps;
  return { deps, broadcasts };
}

suite('BrainstormRoute (FX082, FX083, FX084 + node CRUD)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('FX082 POST /api/v1/brainstorm/node — adds node + broadcasts + returns node', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps, broadcasts } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/node',
      body: { label: 'Test idea', type: 'Idea' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.label, 'Test idea');
    assert.equal(stub.graph.nodes.length, 1);
    assert.ok(broadcasts.some((b) => b.type === 'brainstorm.update'));
  });

  test('FX082 POST /api/v1/brainstorm/node — 400 when label missing', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/node', body: { type: 'Idea' },
    });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /Label required/i);
    assert.equal(stub.graph.nodes.length, 0);
  });

  test('FX082 POST /api/v1/brainstorm/node — label is truncated to 200 chars', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const longLabel = 'L'.repeat(500);
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/node',
      body: { label: longLabel, type: 'Idea' },
    });
    assert.equal(res.body.label.length, 200);
  });

  test('FX082 POST /api/v1/brainstorm/node — type defaults to "Feature" when omitted', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/node', body: { label: 'X' },
    });
    assert.equal(res.body.type, 'Feature');
  });

  test('FX082 POST /api/v1/brainstorm/node — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub, {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupBrainstormRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/v1/brainstorm/node');
    assert.equal(captured.statusCode, 403);
  });

  test('PATCH /api/v1/brainstorm/node/:id — updates known node', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.addNode('Original', 'Idea');
    const { deps, broadcasts } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'PATCH', path: '/api/v1/brainstorm/node/n-1',
      body: { label: 'Updated', type: 'Decision' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.label, 'Updated');
    assert.equal(stub.graph.nodes[0].label, 'Updated');
    assert.ok(broadcasts.some((b) => b.type === 'brainstorm.update'));
  });

  test('PATCH /api/v1/brainstorm/node/:id — 404 unknown node', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'PATCH', path: '/api/v1/brainstorm/node/missing',
      body: { label: 'X', type: 'Idea' },
    });
    assert.equal(res.status, 404);
  });

  test('PATCH /api/v1/brainstorm/node/:id — 400 missing label', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.addNode('A', 'Idea');
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'PATCH', path: '/api/v1/brainstorm/node/n-1', body: {},
    });
    assert.equal(res.status, 400);
  });

  test('DELETE /api/v1/brainstorm/node/:id — removes known node + broadcasts', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.addNode('Goner', 'Idea');
    const { deps, broadcasts } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'DELETE', path: '/api/v1/brainstorm/node/n-1' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(stub.graph.nodes.length, 0);
    assert.ok(broadcasts.some((b) => b.type === 'brainstorm.node-removed'));
  });

  test('DELETE /api/v1/brainstorm/node/:id — 404 unknown', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'DELETE', path: '/api/v1/brainstorm/node/missing' });
    assert.equal(res.status, 404);
  });

  test('FX083 GET /api/v1/brainstorm/graph — returns full graph', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.addNode('A', 'Idea');
    stub.addNode('B', 'Risk');
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/brainstorm/graph' });
    assert.equal(res.status, 200);
    assert.equal(res.body.nodes.length, 2);
  });

  test('DELETE /api/v1/brainstorm/graph — clears graph + broadcasts reset', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.addNode('A', 'Idea');
    const { deps, broadcasts } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'DELETE', path: '/api/v1/brainstorm/graph' });
    assert.equal(res.status, 200);
    assert.equal(stub.graph.nodes.length, 0);
    assert.ok(broadcasts.some((b) => b.type === 'brainstorm.reset'));
  });

  test('FX084 POST /api/v1/brainstorm/transcript — empty body returns 400', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/transcript', body: { transcript: '' },
    });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /Empty/i);
  });

  test('FX084 POST /api/v1/brainstorm/transcript — extraction returned + broadcast on success', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    const { deps, broadcasts } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/transcript',
      body: { transcript: 'We need to ship the new login screen' },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.nodes));
    assert.ok(broadcasts.some((b) => b.type === 'brainstorm.update'));
  });

  test('FX084 POST /api/v1/brainstorm/transcript — queued path returns 202', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.processTranscript = async () => ({ queued: { id: 'q-1', transcript: 'x' } });
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/v1/brainstorm/transcript', body: { transcript: 'q' },
    });
    assert.equal(res.status, 202);
    assert.equal(res.body.status, 'queued');
  });

  test('GET /api/v1/brainstorm/pending — returns pending list', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.pending.push({ id: 'q-1', transcript: 'pending one' });
    stub.pending.push({ id: 'q-2', transcript: 'pending two' });
    const { deps } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/v1/brainstorm/pending' });
    assert.equal(res.status, 200);
    assert.equal(res.body.pending.length, 2);
  });

  test('POST /api/v1/brainstorm/retry — processes pending count + broadcasts each', async () => {
    const app = makeApp();
    const stub = makeBrainstormStub();
    stub.pending.push({ id: 'q-1', transcript: 'pending one' });
    stub.pending.push({ id: 'q-2', transcript: 'pending two' });
    const { deps, broadcasts } = makeDeps(stub);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/v1/brainstorm/retry', body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 2);
    assert.equal(broadcasts.filter((b) => b.type === 'brainstorm.update').length, 2);
  });
});
