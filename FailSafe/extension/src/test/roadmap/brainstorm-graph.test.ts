// Functional tests for BrainstormGraph (FX207 Clear/Undo/Redo + FX213 graph
// operations + onEvent handlers). Pure-logic surface — uses fetch + localStorage
// stubs to keep tests deterministic, then exercises mergeNodes / undo / redo /
// onEvent dispatch directly.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { BrainstormGraph } from '../../../src/roadmap/ui/modules/brainstorm-graph.js';

interface CanvasSpy {
  nodes: unknown[] | null;
  edges: unknown[] | null;
  setNodes: (n: unknown[]) => void;
  setEdges: (e: unknown[], n: unknown[]) => void;
}

function makeCanvasSpy(): CanvasSpy {
  const spy: CanvasSpy = {
    nodes: null, edges: null,
    setNodes(n) { spy.nodes = n; },
    setEdges(e) { spy.edges = e; },
  };
  return spy;
}

interface MemoryStore { get: (k: string) => unknown; set: (k: string, v: unknown) => void; }
function makeStore(): MemoryStore {
  const data = new Map<string, unknown>();
  return { get: (k) => data.get(k), set: (k, v) => { data.set(k, v); } };
}

function installLocalStorageStub(): { restore: () => void; store: Map<string, string> } {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem(k: string) { return store.has(k) ? store.get(k) : null; },
    setItem(k: string, v: string) { store.set(k, v); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  };
  return {
    store,
    restore: () => { (globalThis as { localStorage: unknown }).localStorage = original; },
  };
}

function installFetchStub(handler: (url: string, init?: { method?: string; body?: string }) => unknown): () => void {
  const original = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const body = handler(url, init);
    return { ok: true, status: 200, json: async () => body };
  };
  return () => { (globalThis as { fetch?: unknown }).fetch = original; };
}

suite('BrainstormGraph (FX207, FX213)', () => {
  let lsRestore: () => void;
  let fetchRestore: () => void;

  setup(() => {
    lsRestore = installLocalStorageStub().restore;
    fetchRestore = installFetchStub(() => ({}));
  });

  teardown(() => {
    fetchRestore();
    lsRestore();
  });

  test('FX213 mergeNodes — adds new nodes; existing ids deduped', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes([{ id: 'n1', label: 'A', type: 'Idea' }], []);
    graph.mergeNodes([{ id: 'n1', label: 'A again', type: 'Idea' }, { id: 'n2', label: 'B', type: 'Risk' }], []);
    assert.equal(graph.nodes.length, 2);
    assert.deepEqual(graph.nodes.map((n: { id: string }) => n.id).sort(), ['n1', 'n2']);
  });

  test('FX213 mergeNodes — appends edges', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes(
      [{ id: 'n1', label: 'A', type: 'Idea' }, { id: 'n2', label: 'B', type: 'Idea' }],
      [{ source: 'n1', target: 'n2', label: 'relates to' }],
    );
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].source, 'n1');
  });

  test('FX213 mergeNodes — pushes a canvas update via setNodes/setEdges', () => {
    const canvas = makeCanvasSpy();
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.setCanvas(canvas);
    graph.mergeNodes([{ id: 'n1', label: 'A', type: 'Idea' }], []);
    assert.deepEqual(canvas.nodes, graph.nodes);
    assert.deepEqual(canvas.edges, graph.edges);
  });

  test('FX207 undo — reverses a merge', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes([{ id: 'n1', label: 'A', type: 'Idea' }], []);
    assert.equal(graph.nodes.length, 1);
    graph.undo();
    assert.equal(graph.nodes.length, 0, 'undo should remove the merged node');
  });

  test('FX207 redo — re-applies an undone merge', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes([{ id: 'n1', label: 'A', type: 'Idea' }], []);
    graph.undo();
    graph.redo();
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'n1');
  });

  test('FX207 undo — empty stack is safe', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    assert.doesNotThrow(() => graph.undo());
    assert.equal(graph.nodes.length, 0);
  });

  test('FX207 redo — empty stack is safe', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    assert.doesNotThrow(() => graph.redo());
    assert.equal(graph.nodes.length, 0);
  });

  test('FX207 new merge after undo clears redo stack', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes([{ id: 'n1', label: 'A', type: 'Idea' }], []);
    graph.undo();
    // New merge while redo stack is populated — should clear redo
    graph.mergeNodes([{ id: 'n2', label: 'B', type: 'Idea' }], []);
    graph.redo();
    // redo should now do nothing since the stack was cleared
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'n2');
  });

  test('FX207 clearAll — empties graph + makes undo restore the snapshot', async () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes(
      [{ id: 'n1', label: 'A', type: 'Idea' }, { id: 'n2', label: 'B', type: 'Idea' }],
      [{ source: 'n1', target: 'n2', label: 'rel' }],
    );
    await graph.clearAll();
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
    graph.undo();
    assert.equal(graph.nodes.length, 2, 'undo of clearAll should restore both nodes');
    assert.equal(graph.edges.length, 1);
  });

  test('FX213 onEvent brainstorm.update — merges incoming nodes/edges', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.onEvent({
      type: 'brainstorm.update',
      payload: {
        nodes: [{ id: 'evt-1', label: 'From WS', type: 'Idea' }],
        edges: [],
      },
    });
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'evt-1');
  });

  test('FX213 onEvent brainstorm.node-removed — removes node + adjacent edges', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes(
      [{ id: 'n1', label: 'A', type: 'Idea' }, { id: 'n2', label: 'B', type: 'Idea' }],
      [{ source: 'n1', target: 'n2', label: 'rel' }],
    );
    graph.onEvent({ type: 'brainstorm.node-removed', payload: { id: 'n1' } });
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'n2');
    assert.equal(graph.edges.length, 0, 'edges adjacent to removed node should be pruned');
  });

  test('FX213 onEvent brainstorm.reset — clears nodes + edges', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.mergeNodes([{ id: 'n1', label: 'A', type: 'Idea' }], []);
    graph.onEvent({ type: 'brainstorm.reset' });
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
  });

  test('FX213 submitTranscript — empty transcript returns error without fetch', async () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    const r1 = await graph.submitTranscript('');
    assert.equal(r1.error, 'Empty transcript');
    const r2 = await graph.submitTranscript('   \n   ');
    assert.equal(r2.error, 'Empty transcript');
  });

  test('FX213 submitTranscript — non-empty transcript posts to /api/v1/brainstorm/transcript', async () => {
    let captured: { url?: string; method?: string; body?: unknown } = {};
    fetchRestore();
    fetchRestore = installFetchStub((url, init) => {
      captured = { url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null };
      return { extraction: { nodes: [], edges: [] } };
    });
    const graph = new BrainstormGraph({ store: makeStore() });
    const result = await graph.submitTranscript('Test transcript');
    assert.equal(captured.url, '/api/v1/brainstorm/transcript');
    assert.equal(captured.method, 'POST');
    assert.deepEqual(captured.body, { transcript: 'Test transcript' });
    assert.ok(result.extraction);
  });

  test('FX213 _maxHistory — undo stack caps at 50 entries (oldest dropped)', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    for (let i = 0; i < 60; i += 1) {
      graph.mergeNodes([{ id: `n${i}`, label: `node ${i}`, type: 'Idea' }], []);
    }
    // _undoStack is private; access via cast
    const stackLen = (graph as unknown as { _undoStack: unknown[] })._undoStack.length;
    assert.equal(stackLen, 50);
  });

  test('FX213 applyExtraction — wraps mergeNodes with default empty edges', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    graph.applyExtraction({ nodes: [{ id: 'x', label: 'X', type: 'Idea' }] });
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.edges.length, 0);
  });

  test('FX213 applyExtraction — null/undefined fields are tolerated', () => {
    const graph = new BrainstormGraph({ store: makeStore() });
    assert.doesNotThrow(() => graph.applyExtraction({}));
    assert.doesNotThrow(() => graph.applyExtraction({ nodes: null, edges: null }));
    assert.equal(graph.nodes.length, 0);
  });
});
