// jsdom UI test for the Mind Map density-disclosure label (Myth-Tech-Forge
// Relay Cycle 071 / FailSafe#244 webview-density audit). BrainstormGraph
// already computed { nodeCount, edgeCount } via getStats() but nothing
// rendered it — this asserts the new toolbar label stays truthful across
// updates, including the empty/singular/plural boundary and defensive
// handling of a missing host or malformed stats.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { updateDensityStatus } from '../../../src/roadmap/ui/modules/brainstorm-density-status.js';
// @ts-expect-error JS module import in TS test context
import { BrainstormGraph } from '../../../src/roadmap/ui/modules/brainstorm-graph.js';

interface DomHandle { dom: JSDOM; restore: () => void; }

function installDom(): DomHandle {
  const dom = new JSDOM(
    '<!DOCTYPE html><span class="cc-bs-density-status">0 nodes &middot; 0 edges</span>',
  );
  const g = globalThis as Record<string, unknown>;
  const prevDoc = g.document;
  g.document = dom.window.document;
  return { dom, restore: () => { g.document = prevDoc; } };
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

  test('no host element in the DOM is a no-op, not a throw', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    assert.doesNotThrow(() => updateDensityStatus(dom.window.document, { nodeCount: 5, edgeCount: 4 }));
    assert.equal(updateDensityStatus(dom.window.document, { nodeCount: 5, edgeCount: 4 }), null);
  });

  test('reflects BrainstormGraph.getStats() directly, including de-duplication accounting', async () => {
    const g = globalThis as { fetch?: unknown; localStorage?: unknown };
    const prevFetch = g.fetch;
    g.fetch = async () => ({ ok: true, status: 200, json: async () => ({ nodes: [], edges: [] }) });
    const store = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    try {
      const graph = new BrainstormGraph({});
      graph.nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      graph.edges = [{ source: 'a', target: 'b' }];
      const el = updateDensityStatus(domHandle.dom.window.document, graph.getStats());
      assert.equal(el?.textContent, '3 nodes · 1 edge');
    } finally {
      g.fetch = prevFetch;
    }
  });
});
