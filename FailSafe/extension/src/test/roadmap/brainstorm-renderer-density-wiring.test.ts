// jsdom test for BrainstormRenderer._wireCanvasData's density-status wiring
// (Myth-Tech-Forge Relay Cycle 071 / FailSafe#244 webview-density audit,
// review follow-up on FailSafe#392). The brainstorm-density-status.test.ts
// suite only exercises the leaf formatter in isolation — this asserts the
// actual production wiring: a canvas.setNodes() call (the single choke point
// every graph mutation routes through — fetch, merge, undo/redo, seed)
// reaches the DOM label with the current BrainstormGraph.getStats(), scoped
// to the renderer's own container rather than the global document.
//
// Constructing a full BrainstormRenderer requires SttEngine/TtsEngine/
// VoiceController/KeyboardManager/WebLlmEngine, none of which are needed to
// verify this wiring and several of which reach for real browser/audio APIs
// jsdom doesn't provide. Rather than stub all of that, this calls the real
// _wireCanvasData method (the code under test) via Function.prototype.call
// against a minimal duck-typed `this` — a standard technique for unit-testing
// one method of a class without constructing the whole instance.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { BrainstormRenderer } from '../../../src/roadmap/ui/modules/brainstorm.js';

interface DomHandle { dom: JSDOM; restore: () => void; }

function installDom(): DomHandle {
  const dom = new JSDOM(
    '<!DOCTYPE html><div id="workspace"><span class="cc-bs-density-status"></span></div>',
  );
  const g = globalThis as Record<string, unknown>;
  const prevDoc = g.document;
  const prevWin = g.window;
  g.document = dom.window.document;
  g.window = dom.window;
  return { dom, restore: () => { g.document = prevDoc; g.window = prevWin; } };
}

function makeCanvasStub() {
  return {
    nodes: [] as unknown[],
    edges: [] as unknown[],
    setNodes(n: unknown[]) { this.nodes = n; },
    setEdges(e: unknown[], _n: unknown[]) { this.edges = e; },
    fitToView() {},
    onNodeMove(_cb: unknown) {},
  };
}

suite('BrainstormRenderer._wireCanvasData density wiring (FX244 webview-density audit)', () => {
  let domHandle: DomHandle;
  setup(() => { domHandle = installDom(); });
  teardown(() => { domHandle.restore(); });

  test('an initial canvas.setNodes()/setEdges() pair updates the scoped density label', async () => {
    const container = domHandle.dom.window.document.getElementById('workspace');
    const fakeThis = {
      container,
      graph: {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ source: 'a', target: 'b' }],
        getStats() { return { nodeCount: this.nodes.length, edgeCount: this.edges.length, duplicatesRemoved: 0 }; },
      },
      _updateEmptyState() {},
    };
    const canvas = makeCanvasStub();

    (BrainstormRenderer.prototype as any)._wireCanvasData.call(fakeThis, canvas);
    await Promise.resolve(); // flush the queueMicrotask the wrapped setNodes schedules

    const label = container?.querySelector('.cc-bs-density-status');
    assert.equal(label?.textContent, '3 nodes · 1 edge');
  });

  test('a later mutation (simulating mergeNodes/undo re-invoking setNodes/setEdges) refreshes the label', async () => {
    const container = domHandle.dom.window.document.getElementById('workspace');
    const graph = {
      nodes: [{ id: 'a' }],
      edges: [] as unknown[],
      getStats() { return { nodeCount: this.nodes.length, edgeCount: this.edges.length, duplicatesRemoved: 0 }; },
    };
    const fakeThis = { container, graph, _updateEmptyState() {} };
    const canvas = makeCanvasStub();

    (BrainstormRenderer.prototype as any)._wireCanvasData.call(fakeThis, canvas);
    await Promise.resolve();
    assert.equal(container?.querySelector('.cc-bs-density-status')?.textContent, '1 node · 0 edges');

    // Simulate a mutation growing the graph (e.g. mergeNodes), then re-driving
    // the same wrapped setNodes/setEdges the way BrainstormGraph does.
    graph.nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    graph.edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
    canvas.setNodes(graph.nodes);
    canvas.setEdges(graph.edges, graph.nodes);
    await Promise.resolve();

    assert.equal(container?.querySelector('.cc-bs-density-status')?.textContent, '4 nodes · 2 edges');
  });

  test('the update is scoped to the renderer\'s own container, not the global document', async () => {
    // A second, unrelated container with a stale label proves the wiring
    // updates only its own container's element.
    domHandle.dom.window.document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="other"><span class="cc-bs-density-status">stale</span></div>',
    );
    const container = domHandle.dom.window.document.getElementById('workspace');
    const other = domHandle.dom.window.document.getElementById('other');
    const fakeThis = {
      container,
      graph: {
        nodes: [{ id: 'a' }],
        edges: [],
        getStats() { return { nodeCount: 1, edgeCount: 0, duplicatesRemoved: 0 }; },
      },
      _updateEmptyState() {},
    };
    const canvas = makeCanvasStub();

    (BrainstormRenderer.prototype as any)._wireCanvasData.call(fakeThis, canvas);
    await Promise.resolve();

    assert.equal(container?.querySelector('.cc-bs-density-status')?.textContent, '1 node · 0 edges');
    assert.equal(other?.querySelector('.cc-bs-density-status')?.textContent, 'stale');
  });
});
