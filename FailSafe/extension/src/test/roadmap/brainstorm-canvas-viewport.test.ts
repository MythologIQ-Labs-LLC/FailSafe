// FX897 — Mind Map viewport mechanics (#235 Phase 1, written FIRST per TDD).
// Exercises BrainstormCanvas fitToView / layout-switch fit / onDagError
// fallback / ResizeObserver lifecycle / dragEnd pinning via a recording
// vendor-graph stub (vendor APIs zoomToFit + onDagError verified at plan
// time — plan-mindmap-viewport-235.md LD1).

import { strict as assert } from "assert";
// @ts-expect-error JS module import in TS test context
import { BrainstormCanvas } from "../../../src/roadmap/ui/modules/brainstorm-canvas.js";
import { JSDOM } from "jsdom";

const CHAINED = [
  "backgroundColor", "nodeLabel", "nodeColor", "nodeVal", "linkColor",
  "linkWidth", "linkDirectionalParticles", "linkDirectionalParticleSpeed",
  "linkDirectionalParticleWidth", "onNodeClick", "onNodeRightClick",
  "cameraPosition", "width", "height", "graphData", "nodeResolution",
  "showNavInfo", "pauseAnimation", "d3ReheatSimulation",
];

interface StubRecord {
  s: any;
  zoomToFit: unknown[][];
  dagMode: unknown[];
  order: string[];
  handlers: { dagError?: () => unknown; dragEnd?: (n: any) => void };
}

function makeStub(): StubRecord {
  const rec: StubRecord = { s: {}, zoomToFit: [], dagMode: [], order: [], handlers: {} };
  for (const m of CHAINED) rec.s[m] = () => rec.s;
  rec.s.d3Force = () => ({ strength: () => undefined, distance: () => undefined });
  rec.s.onNodeDragEnd = (fn: any) => { rec.handlers.dragEnd = fn; return rec.s; };
  rec.s.onDagError = (fn: any) => { rec.handlers.dagError = fn; return rec.s; };
  rec.s.dagMode = (m: unknown) => {
    rec.dagMode.push(m); rec.order.push(`dagMode:${String(m)}`); return rec.s;
  };
  rec.s.zoomToFit = (...a: unknown[]) => {
    rec.zoomToFit.push(a); rec.order.push("zoomToFit"); return rec.s;
  };
  return rec;
}

suite("FX897 BrainstormCanvas viewport", () => {
  let originalWindow: any;
  let stub: StubRecord;
  let canvas: any;

  setup(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    originalWindow = (global as any).window;
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    stub = makeStub();
    (global as any).window.ForceGraph = () => () => stub.s;
    (global as any).window.ForceGraph3D = () => () => stub.s;
    (global as any).window.matchMedia = () => ({ matches: false });
  });

  teardown(() => {
    canvas?.destroy?.();
    canvas = null;
    (global as any).window = originalWindow;
    (global as any).document = originalWindow ? originalWindow.document : undefined;
  });

  function build(prefs?: unknown): any {
    const container = (global as any).document.getElementById("container");
    canvas = new BrainstormCanvas(container, prefs);
    return container;
  }

  test("fitToView passes duration 400 normally and 0 under reduced motion (LD3)", () => {
    build();
    stub.zoomToFit.length = 0;
    canvas.fitToView();
    assert.deepEqual(stub.zoomToFit[stub.zoomToFit.length - 1], [400, 40]);
    canvas.destroy();
    (global as any).window.matchMedia = () => ({ matches: true });
    stub = makeStub();
    (global as any).window.ForceGraph = () => () => stub.s;
    build();
    stub.zoomToFit.length = 0;
    canvas.fitToView();
    assert.deepEqual(stub.zoomToFit[stub.zoomToFit.length - 1], [0, 40],
      "reduced motion must make the fit an instant jump");
  });

  test("setLayout('TREE') applies dagMode('td') THEN fitToView", () => {
    build();
    stub.order.length = 0;
    canvas.setLayout("TREE");
    const dagIdx = stub.order.indexOf("dagMode:td");
    const fitIdx = stub.order.indexOf("zoomToFit");
    assert.notEqual(dagIdx, -1, "dagMode('td') applied on TREE");
    assert.ok(fitIdx > dagIdx, "fit must follow the dagMode change");
  });

  test("onDagError reverts dagMode to null (FORCE) and invokes onDagFallback with layout name", () => {
    build();
    let fallback: string | null = null;
    canvas.onDagFallback = (layout: string) => { fallback = layout; };
    canvas.setLayout("TREE");
    assert.ok(stub.handlers.dagError, "onDagError wired on the factory chain");
    stub.handlers.dagError!();
    assert.equal(stub.dagMode[stub.dagMode.length - 1], null, "dagMode reverted to null");
    assert.equal(canvas.layout, "FORCE", "canvas layout state reverted to FORCE");
    assert.equal(fallback, "TREE", "fallback callback receives the attempted layout");
  });

  test("ResizeObserver observes container when available; disconnects on re-init and destroy", () => {
    const observed: unknown[] = [];
    let disconnects = 0;
    let instances = 0;
    (global as any).window.ResizeObserver = class {
      constructor(_cb: unknown) { instances += 1; }
      observe(el: unknown): void { observed.push(el); }
      disconnect(): void { disconnects += 1; }
    };
    const container = build();
    assert.equal(instances, 1, "observer created on init");
    assert.equal(observed[0], container, "observer watches this.container");
    canvas.setViewMode("3D"); // triggers _initGraph re-entry
    assert.ok(disconnects >= 1, "previous observer disconnected on re-init");
    assert.equal(instances, 2, "fresh observer registered after re-init");
    const before = disconnects;
    canvas.destroy();
    assert.ok(disconnects > before, "destroy disconnects the observer");
    canvas = null;
  });

  test("window.resize fallback when ResizeObserver is unavailable", () => {
    assert.equal((global as any).window.ResizeObserver, undefined);
    build();
    assert.ok(!canvas._resizeObserver, "no observer instance without ResizeObserver");
    // fallback listener stays bound: dispatching resize must not throw
    (global as any).window.dispatchEvent(new (global as any).window.Event("resize"));
  });

  test("onNodeDragEnd pins fx/fy (and fz only when z defined) then invokes moveCallback", () => {
    build();
    const moves: unknown[][] = [];
    canvas.onNodeMove((...a: unknown[]) => moves.push(a));
    const n2d: any = { id: "a", x: 1, y: 2 };
    stub.handlers.dragEnd!(n2d);
    assert.equal(n2d.fx, 1, "fx pinned to dragged x");
    assert.equal(n2d.fy, 2, "fy pinned to dragged y");
    assert.equal(n2d.fz, undefined, "no fz pin in 2D");
    assert.deepEqual(moves[moves.length - 1], ["a", 1, 2, undefined]);
    const n3d: any = { id: "b", x: 3, y: 4, z: 5 };
    stub.handlers.dragEnd!(n3d);
    assert.equal(n3d.fz, 5, "fz pinned when z is defined (LD4)");
    assert.deepEqual(moves[moves.length - 1], ["b", 3, 4, 5]);
  });
});
