// FX897 + FX204/FX205 supplements — Brainstorm toolbar wiring (#235 Phase 2,
// written FIRST per TDD). wireToolbar(renderer) owns the relocated layout/view
// bindings (brainstorm.js:176-188 pre-relocation), the new FIT/RESET controls,
// and view-prefs persistence. RESET releases fx/fy/fz pins + reheats the sim
// WITHOUT touching the nodes/edges arrays (LD4).

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import in TS test context
import { wireToolbar, applyViewPrefs } from "../../../src/roadmap/ui/modules/brainstorm-toolbar-wiring.js";
// @ts-expect-error JS module import in TS test context
import { loadViewPrefs, saveViewPrefs, viewPrefsKey } from "../../../src/roadmap/ui/modules/brainstorm-graph-io.js";
// @ts-expect-error JS module import in TS test context
import { BrainstormCanvas } from "../../../src/roadmap/ui/modules/brainstorm-canvas.js";

const TOOLBAR_HTML = `<!DOCTYPE html><div id="root">
  <button class="cc-btn cc-bs-layout" data-layout="FORCE">FORCE</button>
  <button class="cc-btn cc-bs-layout" data-layout="TREE">TREE</button>
  <button class="cc-btn cc-bs-layout" data-layout="CIRCLE">CIRCLE</button>
  <button class="cc-btn cc-bs-view active" data-view="2D">2D</button>
  <button class="cc-btn cc-bs-view" data-view="3D">3D</button>
  <button class="cc-btn cc-bs-fit">FIT VIEW</button>
  <button class="cc-btn cc-bs-reset-view">RESET VIEW</button>
  <div id="container"></div></div>`;

function installLocalStorageStub(): { restore: () => void; store: Map<string, string> } {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem(k: string) { return store.has(k) ? store.get(k) : null; },
    setItem(k: string, v: string) { store.set(k, v); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  };
  return { store, restore: () => { (globalThis as { localStorage: unknown }).localStorage = original; } };
}

interface Fixture {
  renderer: any; canvas: any; nodes: any[]; canvasNodes: any[];
  calls: Record<string, unknown[][]>;
  click: (sel: string) => void;
}

function makeFixture(doc: any): Fixture {
  const calls: Record<string, unknown[][]> = {
    setLayout: [], setViewMode: [], fitToView: [], reheat: [], saveLocal: [],
  };
  const nodes = [{ id: "n1", x: 1, y: 2, fx: 1, fy: 2, fz: 3 }, { id: "n2", x: 4, y: 5, fx: 4, fy: 5 }];
  const canvasNodes = nodes.map((n) => ({ ...n }));
  const canvas: any = {
    viewMode: "2D", layout: "FORCE", nodes: canvasNodes,
    graph: { d3ReheatSimulation: () => calls.reheat.push([]) },
    setLayout: (l: string) => { canvas.layout = l; calls.setLayout.push([l]); },
    setViewMode: (m: string) => { canvas.viewMode = m; calls.setViewMode.push([m]); },
    fitToView: () => calls.fitToView.push([]),
  };
  const renderer = {
    graph: {
      canvas, nodes, edges: [{ source: "n1", target: "n2", label: "x" }],
      _saveLocal: () => calls.saveLocal.push([]),
    },
    _getEl: (sel: string) => doc.querySelector(sel),
    _getAll: (sel: string) => [...doc.querySelectorAll(sel)],
  };
  const click = (sel: string) => doc.querySelector(sel).dispatchEvent(
    new (doc.defaultView.Event)("click", { bubbles: true }));
  return { renderer, canvas, nodes, canvasNodes, calls, click };
}

let restore: () => void;
let store: Map<string, string>;
let dom: JSDOM;
let originalWindow: any;

function registerToolbarHooks(): void {
  setup(() => {
    const ls = installLocalStorageStub();
    restore = ls.restore; store = ls.store;
    dom = new JSDOM(TOOLBAR_HTML);
    originalWindow = (global as any).window;
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
  });

  teardown(() => {
    restore();
    (global as any).window = originalWindow;
    (global as any).document = originalWindow ? originalWindow.document : undefined;
  });

}

suite("FX897 brainstorm toolbar wiring", () => {
  registerToolbarHooks();
  test("layout button click applies canvas.setLayout AND persists the pref", () => {
    const f = makeFixture(dom.window.document);
    wireToolbar(f.renderer);
    f.click('.cc-bs-layout[data-layout="TREE"]');
    assert.deepEqual(f.calls.setLayout, [["TREE"]]);
    assert.equal(JSON.parse(store.get(viewPrefsKey()) as string).layout, "TREE");
  });

  test("view button click applies canvas.setViewMode AND persists the pref", () => {
    const f = makeFixture(dom.window.document);
    wireToolbar(f.renderer);
    f.click('.cc-bs-view[data-view="3D"]');
    assert.deepEqual(f.calls.setViewMode, [["3D"]]);
    const prefs = JSON.parse(store.get(viewPrefsKey()) as string);
    assert.equal(prefs.viewMode, "3D");
    assert.equal(prefs.layout, "FORCE", "layout carried alongside the view pref");
  });

  test("T10 (#319): applyViewPrefs on an identity-less renderer reconciles to the last real identity's prefs", () => {
    const f = makeFixture(dom.window.document);
    (f.renderer as any).workspacePath = "";
    saveViewPrefs({ layout: "TREE", viewMode: "3D" }, "G:/repo/A");
    applyViewPrefs(f.renderer);
    assert.equal(f.canvas.layout, "TREE",
      "canvas constructed before identity delivery must heal to the persisted layout");
    assert.equal(f.canvas.viewMode, "3D",
      "canvas constructed before identity delivery must heal to the persisted view mode");
  });

  test("restore-on-init: saved {TREE, 3D} applies through the canvas constructor path", () => {
    saveViewPrefs({ layout: "TREE", viewMode: "3D" });
    const dagCalls: unknown[] = [];
    const s: any = {};
    for (const m of ["backgroundColor", "nodeLabel", "nodeColor", "nodeVal", "linkColor",
      "linkWidth", "linkDirectionalParticles", "linkDirectionalParticleSpeed",
      "linkDirectionalParticleWidth", "onNodeClick", "onNodeRightClick", "onNodeDragEnd",
      "onDagError", "cameraPosition", "width", "height", "graphData", "nodeResolution",
      "showNavInfo", "pauseAnimation", "zoomToFit"]) s[m] = () => s;
    s.d3Force = () => ({ strength: () => undefined, distance: () => undefined });
    s.dagMode = (m: unknown) => { dagCalls.push(m); return s; };
    (global as any).window.ForceGraph3D = () => () => s;
    (global as any).window.matchMedia = () => ({ matches: true });
    const canvas = new BrainstormCanvas(dom.window.document.getElementById("container"), loadViewPrefs());
    assert.equal(canvas.viewMode, "3D", "saved view mode drives the factory choice");
    assert.equal(canvas.layout, "TREE");
    assert.deepEqual(dagCalls, ["td"], "saved TREE layout applied as dagMode('td') on init");
    canvas.destroy();
  });
});

suite("FX897 brainstorm toolbar wiring", () => {
  registerToolbarHooks();
  test("FIT button calls canvas.fitToView exactly once per click", () => {
    const f = makeFixture(dom.window.document);
    wireToolbar(f.renderer);
    f.click(".cc-bs-fit");
    assert.equal(f.calls.fitToView.length, 1);
  });

  test("RESET VIEW clears every fx/fy/fz, reheats, refits — node/edge counts unchanged", () => {
    const f = makeFixture(dom.window.document);
    wireToolbar(f.renderer);
    f.click(".cc-bs-reset-view");
    for (const n of [...f.nodes, ...f.canvasNodes]) {
      assert.ok(!("fx" in n) && !("fy" in n) && !("fz" in n), `pins cleared on ${n.id}`);
    }
    assert.equal(f.calls.reheat.length, 1, "d3ReheatSimulation called so relayout is visible");
    assert.equal(f.calls.fitToView.length, 1, "refit after pin release");
    assert.equal(f.renderer.graph.nodes.length, 2, "nodes untouched");
    assert.equal(f.renderer.graph.edges.length, 1, "edges untouched");
    assert.equal(f.canvas.nodes.length, 2, "canvas nodes untouched");
    assert.equal(f.calls.saveLocal.length, 1, "unpinned state persisted");
  });
});
