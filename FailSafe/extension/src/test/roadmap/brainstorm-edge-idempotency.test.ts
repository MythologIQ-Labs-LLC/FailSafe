// FX894 — Mind Map edge idempotency (#234). Merges, WS replays, and repository
// re-seeds must not duplicate edges; undo/redo must be key-exact. Self-contained
// suite: localStorage/fetch stub helpers duplicated from brainstorm-graph.test.ts
// (that file is pre-existing over-cap debt and must not grow — plan #234 LD6).

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { BrainstormGraph } from '../../../src/roadmap/ui/modules/brainstorm-graph.js';

const STORAGE_KEY = 'failsafe-brainstorm-graph';

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

function installFetchStub(handler: (url: string) => unknown): () => void {
  const original = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    const body = handler(url);
    return { ok: true, status: 200, json: async () => body };
  };
  return () => { (globalThis as { fetch?: unknown }).fetch = original; };
}

const N1 = { id: 'n1', label: 'A', type: 'Idea' };
const N2 = { id: 'n2', label: 'B', type: 'Idea' };
const REL = { source: 'n1', target: 'n2', label: 'requires' };

suite('FX894 edge idempotency', () => {
  let lsRestore: () => void;
  let fetchRestore: () => void;
  let lsStore: Map<string, string>;

  setup(() => {
    const ls = installLocalStorageStub();
    lsRestore = ls.restore;
    lsStore = ls.store;
    fetchRestore = installFetchStub(() => ({}));
  });

  teardown(() => {
    fetchRestore();
    lsRestore();
  });

  test('mergeNodes twice with identical payload — edges.length unchanged after second call', () => {
    const graph = new BrainstormGraph({});
    graph.mergeNodes([N1, N2], [REL]);
    assert.equal(graph.edges.length, 1);
    graph.mergeNodes([N1, N2], [REL]);
    assert.equal(graph.edges.length, 1, 'second identical merge must add nothing');
  });

  test("onEvent('brainstorm.update') replayed twice — no duplicate edges", () => {
    const graph = new BrainstormGraph({});
    const evt = { type: 'brainstorm.update', payload: { nodes: [N1, N2], edges: [REL] } };
    graph.onEvent(evt);
    graph.onEvent(evt);
    assert.equal(graph.edges.length, 1, 'WS replay must be idempotent');
  });

  test('two edges same endpoints different labels — both kept', () => {
    const graph = new BrainstormGraph({});
    graph.mergeNodes([N1, N2], [
      { source: 'n1', target: 'n2', label: 'requires' },
      { source: 'n1', target: 'n2', label: 'blocks' },
    ]);
    assert.equal(graph.edges.length, 2, 'typed parallel relationships are distinct');
  });

  test('edges with delimiter-bearing ids — distinct keys, both kept', () => {
    const graph = new BrainstormGraph({});
    graph.mergeNodes([], [
      { source: 'a b', target: 'c', label: 'x' },
      { source: 'a', target: 'b c', label: 'x' },
    ]);
    assert.equal(graph.edges.length, 2, 'JSON-array keying must not collide on delimiters');
  });

  test('malformed edge (missing target) — dropped, well-formed sibling kept', () => {
    const graph = new BrainstormGraph({});
    graph.mergeNodes([N1, N2], [
      { source: 'n1', label: 'dangling' },
      REL,
    ]);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].target, 'n2');
  });

  test('_loadLocal over triplicate localStorage edge — single survivor, duplicatesRemoved === 2', () => {
    lsStore.set(STORAGE_KEY, JSON.stringify({ nodes: [N1, N2], edges: [REL, REL, REL] }));
    const graph = new BrainstormGraph({});
    graph._loadLocal();
    assert.equal(graph.edges.length, 1, 'legacy triplicate repaired to a single instance');
    assert.equal(graph.getStats().duplicatesRemoved, 2);
    const persisted = JSON.parse(lsStore.get(STORAGE_KEY) as string);
    assert.equal(persisted.edges.length, 1, 'repaired set persisted back to localStorage');
  });

  test('undo after merge adding 1 edge beside its twin-by-endpoints — removes only the added edge', () => {
    const graph = new BrainstormGraph({});
    graph.mergeNodes([N1, N2], [{ source: 'n1', target: 'n2', label: 'old' }]);
    graph.mergeNodes([], [{ source: 'n1', target: 'n2', label: 'new' }]);
    assert.equal(graph.edges.length, 2);
    graph.undo();
    assert.equal(graph.edges.length, 1, 'undo removes exactly the edge its command added');
    assert.equal(graph.edges[0].label, 'old', 'label-blind endpoint twin must survive');
  });

  test('redo restores removed edges exactly once; second redo is a no-op on edge count', () => {
    const graph = new BrainstormGraph({});
    graph.mergeNodes([N1, N2], [{ source: 'n1', target: 'n2', label: 'old' }]);
    graph.mergeNodes([], [{ source: 'n1', target: 'n2', label: 'new' }]);
    graph.undo();
    graph.redo();
    assert.equal(graph.edges.length, 2, 'redo re-adds the removed edge exactly once');
    graph.redo();
    assert.equal(graph.edges.length, 2, 'redo on an empty stack changes nothing');
  });
});
