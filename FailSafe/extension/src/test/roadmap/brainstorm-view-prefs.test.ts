// FX897 — Mind Map view prefs persistence (#235 Phase 1, written FIRST per
// TDD). loadViewPrefs/saveViewPrefs round-trip {layout, viewMode} through the
// 'failsafe-brainstorm-view' localStorage key with corrupt-safe defaults.

import { strict as assert } from "assert";
// @ts-expect-error JS module import in TS test context
import { loadViewPrefs, saveViewPrefs, viewPrefsKey, VIEW_PREFS_KEY } from "../../../src/roadmap/ui/modules/brainstorm-graph-io.js";

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

let restore: () => void;
let store: Map<string, string>;

function registerViewPrefsHooks(): void {
  setup(() => {
    const ls = installLocalStorageStub();
    restore = ls.restore;
    store = ls.store;
  });

  teardown(() => { restore(); });

}

suite("FX897 brainstorm view prefs", () => {
  registerViewPrefsHooks();
  test("exports the workspace-scoped key prefix", () => {
    assert.equal(VIEW_PREFS_KEY, "failsafe-brainstorm-view");
  });

  test("workspace A and B round-trip without cross-contamination", () => {
    saveViewPrefs({ layout: "TREE", viewMode: "3D" }, "G:/repo/A");
    saveViewPrefs({ layout: "CIRCLE", viewMode: "2D" }, "G:/repo/B");
    assert.deepEqual(loadViewPrefs("G:/repo/A"), { layout: "TREE", viewMode: "3D" });
    assert.deepEqual(loadViewPrefs("G:/repo/B"), { layout: "CIRCLE", viewMode: "2D" });
    assert.ok(store.has(viewPrefsKey("G:/repo/A")), "workspace A has its own key");
    assert.notEqual(viewPrefsKey("G:/repo/A"), viewPrefsKey("G:/repo/B"));
  });

  test("corrupt stored JSON -> defaults {FORCE, 2D}", () => {
    store.set(viewPrefsKey("G:/repo/A"), "{not-json!!!");
    assert.deepEqual(loadViewPrefs("G:/repo/A"), { layout: "FORCE", viewMode: "2D" });
  });

  test("absent key -> defaults {FORCE, 2D}", () => {
    assert.deepEqual(loadViewPrefs(), { layout: "FORCE", viewMode: "2D" });
  });

  test("malformed field types -> per-field defaults", () => {
    store.set(viewPrefsKey("G:/repo/A"), JSON.stringify({ layout: 7, viewMode: "HOLOGRAM" }));
    assert.deepEqual(loadViewPrefs("G:/repo/A"), { layout: "FORCE", viewMode: "2D" });
  });
});

// #319 — identity fallback: prefs must survive the [canvas construction,
// first hub delivery) window where workspacePath is still '' on reload.
// saveViewPrefs records the last real identity; both IO functions fall back
// to it when called identity-less.
suite("FX897/#319 brainstorm view prefs — identity fallback", () => {
  registerViewPrefsHooks();

  test("T7: loadViewPrefs('') returns prefs saved under the recorded last identity", () => {
    saveViewPrefs({ layout: "TREE", viewMode: "3D" }, "G:/repo/A");
    assert.deepEqual(loadViewPrefs(""), { layout: "TREE", viewMode: "3D" });
  });

  test("T8: loadViewPrefs('') with no recorded identity keeps the terminal defaults", () => {
    assert.deepEqual(loadViewPrefs(""), { layout: "FORCE", viewMode: "2D" });
  });

  test("T9: saveViewPrefs(prefs, '') after a real-identity save persists under the real key", () => {
    saveViewPrefs({ layout: "TREE", viewMode: "3D" }, "G:/repo/A");
    saveViewPrefs({ layout: "CIRCLE", viewMode: "2D" }, "");
    assert.deepEqual(loadViewPrefs("G:/repo/A"), { layout: "CIRCLE", viewMode: "2D" },
      "an identity-less save heals onto the last recorded identity");
    assert.equal(store.has(viewPrefsKey("")), false,
      "nothing lands in the 'local' bucket while a real identity is known");
  });
});

suite("FX897 brainstorm view prefs", () => {
  registerViewPrefsHooks();
  test("save never throws when localStorage is unavailable", () => {
    restore();
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage: unknown }).localStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
    };
    try {
      saveViewPrefs({ layout: "TREE", viewMode: "3D" });
      assert.deepEqual(loadViewPrefs(), { layout: "FORCE", viewMode: "2D" },
        "read failure degrades to defaults");
    } finally {
      (globalThis as { localStorage: unknown }).localStorage = original;
      restore = () => undefined;
    }
  });
});
