// #319 (FX897/#263 residual) — render() only fires for the ACTIVE TabGroup
// sub-view (tab-group.js renderActive), so a hub payload carrying the correct
// workspacePath while Mind Map is inactive — or arriving with no further
// render() call afterward at all — previously never reached a live canvas,
// leaving it stuck under the wrong identity forever. BrainstormRenderer now
// subscribes to hub delivery directly in its constructor and reconciles via
// the shared _syncWorkspaceIdentity() method regardless of render()/tab timing.

import { strict as assert } from "assert";
// @ts-expect-error JS module import in TS test context
import { BrainstormRenderer } from "../../../src/roadmap/ui/modules/brainstorm.js";
// @ts-expect-error JS module import in TS test context
import { saveViewPrefs } from "../../../src/roadmap/ui/modules/brainstorm-graph-io.js";

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

function makeCanvasStub(initial: { layout: string; viewMode: string }): any {
  return {
    layout: initial.layout,
    viewMode: initial.viewMode,
    setLayout(l: string) { this.layout = l; },
    setViewMode(v: string) { this.viewMode = v; },
  };
}

// Mirrors the Object.create(BrainstormRenderer.prototype) pattern already used
// in brainstorm-listener-hygiene.test.ts to unit-test renderer logic without a
// full DOM/vscode host.
function makeBareRenderer(canvas: any): any {
  const r: any = Object.create(BrainstormRenderer.prototype);
  r.graph = { canvas };
  r._getAll = () => []; // toolbar highlight targets; irrelevant to this defect
  return r;
}

let restore: () => void;

suite("#319 brainstorm workspace-identity hub sync", () => {
  setup(() => { restore = installLocalStorageStub().restore; });
  teardown(() => { restore(); });

  test("constructor subscribes _syncWorkspaceIdentity to hub delivery, independent of render()", () => {
    const hubListeners: Array<(data: any) => void> = [];
    const client = { on: (type: string, cb: (data: any) => void) => { if (type === 'hub') hubListeners.push(cb); } };
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = { getElementById: () => null, addEventListener: () => {} };
    try {
      new BrainstormRenderer('workspace', { client });
    } finally {
      (globalThis as any).document = origDoc;
    }
    assert.strictEqual(hubListeners.length, 1, "constructor must register exactly one hub listener");
  });

  test("interleave 3: canvas already live under the WRONG identity, no further render() ever arrives — hub subscription alone must still reconcile", () => {
    saveViewPrefs({ layout: "TREE", viewMode: "3D" }, "G:/repo/real");
    const canvas = makeCanvasStub({ layout: "FORCE", viewMode: "2D" }); // constructed under the wrong/default identity
    const r = makeBareRenderer(canvas);
    r.workspacePath = ""; // identity unknown at construction time, per interleave 3

    // The defect: render() is never called again (tab inactive / no further hub
    // render reached this sub-view). Only the direct hub subscription observes
    // the identity arrival — exercise exactly that path, not render().
    r._syncWorkspaceIdentity({ workspacePath: "G:/repo/real" });

    assert.strictEqual(r.workspacePath, "G:/repo/real", "identity must update from the hub payload alone");
    assert.deepStrictEqual({ layout: canvas.layout, viewMode: canvas.viewMode }, { layout: "TREE", viewMode: "3D" },
      "canvas must reconcile to the persisted prefs under the now-correct identity without any render() call");
  });

  test("no-op when identity is unchanged (idempotent — does not fight a user's live in-session choice)", () => {
    saveViewPrefs({ layout: "TREE", viewMode: "3D" }, "G:/repo/real");
    const canvas = makeCanvasStub({ layout: "CIRCLE", viewMode: "2D" }); // user has since changed layout live
    const r = makeBareRenderer(canvas);
    r.workspacePath = "G:/repo/real"; // already correct

    r._syncWorkspaceIdentity({ workspacePath: "G:/repo/real" });

    assert.deepStrictEqual({ layout: canvas.layout, viewMode: canvas.viewMode }, { layout: "CIRCLE", viewMode: "2D" },
      "must not overwrite the live canvas when the hub payload repeats an already-current identity");
  });

  test("no-op when no canvas exists yet (still pre-construction — nothing to reconcile)", () => {
    const r = makeBareRenderer(null);
    r.workspacePath = "";
    assert.doesNotThrow(() => r._syncWorkspaceIdentity({ workspacePath: "G:/repo/real" }));
    assert.strictEqual(r.workspacePath, "G:/repo/real", "identity still tracked even with no live canvas to reconcile");
  });

  test("falls back to the previously known identity when a hub payload omits workspacePath", () => {
    const canvas = makeCanvasStub({ layout: "FORCE", viewMode: "2D" });
    const r = makeBareRenderer(canvas);
    r.workspacePath = "G:/repo/real";
    r._syncWorkspaceIdentity({});
    assert.strictEqual(r.workspacePath, "G:/repo/real", "an identity-less hub tick must not clobber a known workspacePath");
  });
});
