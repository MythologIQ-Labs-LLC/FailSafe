// jsdom UI test for the Mind Map density-disclosure label (Myth-Tech-Forge
// Relay Cycle 071 / FailSafe#244 webview-density audit). BrainstormGraph
// already computed { nodeCount, edgeCount, duplicatesRemoved } via getStats()
// but nothing rendered it — this asserts the new toolbar label stays
// truthful across updates: the empty/singular/plural boundary, the
// duplicate-edge-merged disclosure (an operator can author more edges than
// are shown, and that delta must not be silent), scoping to a caller-given
// root rather than always the global document, and defensive handling of a
// missing host or malformed stats.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { updateDensityStatus } from '../../../src/roadmap/ui/modules/brainstorm-density-status.js';
// @ts-expect-error JS module import in TS test context
import { BrainstormGraph } from '../../../src/roadmap/ui/modules/brainstorm-graph.js';

interface DomHandle { dom: JSDOM; restore: () => void; }

function installDom(): DomHandle {
  const dom = new JSDOM(
    '<!DOCTYPE html><span class="cc-bs-density-status"></span>',
  );
  const g = globalThis as Record<string, unknown>;
  const prevDoc = g.document;
  g.document = dom.window.document;
  return { dom, restore: () => { g.document = prevDoc; } };
}

function installFetchAndStorage(edges: unknown[]): () => void {
  const g = globalThis as { fetch?: unknown; localStorage?: unknown };
  const prevFetch = g.fetch;
  const prevStorage = g.localStorage;
  g.fetch = async () => ({ ok: true, status: 200, json: async () => ({ nodes: [{ id: 'a' }, { id: 'b' }], edges }) });
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  return () => { g.fetch = prevFetch; g.localStorage = prevStorage; };
}

suite('Brainstorm density status (FX244 webview-density audit)', () => {
  let domHandle: DomHandle;
  setup(() => { domHandle = installDom(); });
  teardown(() => { domHandle.restore(); });

  test('renders plural node/edge counts', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, { nodeCount: 3000, edgeCount: 2999 });
    assert.equal(el?.textContent, '3000 nodes · 2999 edges');
  });

  test('renders singular node/edge counts at exactly 1', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, { nodeCount: 1, edgeCount: 1 });
    assert.equal(el?.textContent, '1 node · 1 edge');
  });

  test('renders the empty-graph state truthfully', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, { nodeCount: 0, edgeCount: 0 });
    assert.equal(el?.textContent, '0 nodes · 0 edges');
  });

  test('missing/non-finite stats fall back to 0 rather than "NaN" or "undefined"', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, {});
    assert.equal(el?.textContent, '0 nodes · 0 edges');
  });

  test('discloses one merged duplicate edge, singular wording', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, { nodeCount: 2, edgeCount: 1, duplicatesRemoved: 1 });
    assert.equal(el?.textContent, '2 nodes · 1 edge (1 duplicate edge merged)');
  });

  test('discloses multiple merged duplicate edges, plural wording', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, { nodeCount: 5, edgeCount: 4, duplicatesRemoved: 3 });
    assert.equal(el?.textContent, '5 nodes · 4 edges (3 duplicate edges merged)');
  });

  test('duplicatesRemoved of 0 (or absent) adds no parenthetical — no false disclosure', () => {
    const el = updateDensityStatus(domHandle.dom.window.document, { nodeCount: 5, edgeCount: 4, duplicatesRemoved: 0 });
    assert.equal(el?.textContent, '5 nodes · 4 edges');
  });

  test('no host element in the DOM is a no-op, not a throw', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    assert.doesNotThrow(() => updateDensityStatus(dom.window.document, { nodeCount: 5, edgeCount: 4 }));
    assert.equal(updateDensityStatus(dom.window.document, { nodeCount: 5, edgeCount: 4 }), null);
  });

  test('accepts a scoped container Element as root, not only the global Document', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="a"><span class="cc-bs-density-status"></span></div><div id="b"><span class="cc-bs-density-status">stale</span></div>');
    const containerA = dom.window.document.getElementById('a');
    updateDensityStatus(containerA, { nodeCount: 7, edgeCount: 6 });
    assert.equal(containerA?.querySelector('.cc-bs-density-status')?.textContent, '7 nodes · 6 edges');
    // The sibling container's label must be untouched — proves the update was
    // actually scoped to `containerA`, not silently falling through to the
    // whole document.
    assert.equal(dom.window.document.getElementById('b')?.querySelector('.cc-bs-density-status')?.textContent, 'stale');
  });

  test('reflects BrainstormGraph.getStats() node/edge counts directly', () => {
    const graph = new BrainstormGraph({});
    graph.nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    graph.edges = [{ source: 'a', target: 'b' }];
    const el = updateDensityStatus(domHandle.dom.window.document, graph.getStats());
    assert.equal(el?.textContent, '3 nodes · 1 edge');
  });

  test('reflects BrainstormGraph.getStats().duplicatesRemoved after a real server-branch dedup pass', async () => {
    // Server returns 2 nodes and 2 edges that collide on (source,target,label)
    // identity — exactly the FX894 dedupeEdges path fetchGraph() runs.
    const restore = installFetchAndStorage([
      { source: 'a', target: 'b', label: 'links' },
      { source: 'a', target: 'b', label: 'links' },
    ]);
    try {
      const graph = new BrainstormGraph({});
      await graph.fetchGraph();
      const stats = graph.getStats();
      assert.equal(stats.nodeCount, 2);
      assert.equal(stats.edgeCount, 1, 'the duplicate must not be double-counted as a real edge');
      assert.equal(stats.duplicatesRemoved, 1);
      const el = updateDensityStatus(domHandle.dom.window.document, stats);
      assert.equal(el?.textContent, '2 nodes · 1 edge (1 duplicate edge merged)');
    } finally {
      restore();
    }
  });
});
