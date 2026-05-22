// FX595 — Educational Component Phase 4b/4c: SHIELD phase-tracker lesson
// expanders + FirstRunModePicker lesson-derived detail.
//
// Part A (jsdom): renderPhase() folds the Plan/Audit/Substantiate micro-lesson
// expanders into the phaseTrack innerHTML when education is enabled; the
// phaseTitle branch is left untouched (A2).
// Part B: FirstRunModePicker QuickPick items carry lesson-derived `detail`
// drawn from the registry — a native surface (no webview expander).
//
// SG-035: real renderers, real DOM / real QuickPick capture.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
import * as vscode from "vscode";
import { FirstRunModePicker } from "../../governance/FirstRunModePicker";
import { getLesson } from "../../education/lessons";
import type { ConfigManager } from "../../shared/ConfigManager";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { renderPhase } from "../../roadmap/ui/modules/monitor-render.js";

// --- Part A: renderPhase phase-tracker lessons ----------------------------

interface PhaseEls {
  phaseTitle: { textContent: string };
  phaseTrack: { innerHTML: string };
}

function setupDom(): { restore: () => void } {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost:9999",
  });
  const prev = {
    window: (global as any).window,
    document: (global as any).document,
    localStorage: (global as any).localStorage,
    sessionStorage: (global as any).sessionStorage,
  };
  const mem = new Map<string, string>();
  const memStore = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
  };
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).localStorage = memStore;
  (global as any).sessionStorage = memStore;
  return {
    restore: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
      (global as any).localStorage = prev.localStorage;
      (global as any).sessionStorage = prev.sessionStorage;
    },
  };
}

function makeEls(): PhaseEls {
  return { phaseTitle: { textContent: "" }, phaseTrack: { innerHTML: "" } };
}

suite("Monitor SHIELD phase-tracker lessons (FX595 Part A)", () => {
  let restore: () => void;
  setup(() => { restore = setupDom().restore; });
  teardown(() => restore());

  test("FX595 Plan phase active → phaseTrack carries shield.plan expander", () => {
    const els = makeEls();
    renderPhase({ title: "Plan", index: 0 }, els, { enabled: true, proficiency: "beginner" });
    assert.match(els.phaseTrack.innerHTML, /cc-edu-lesson/, "lesson expander folded into phaseTrack");
    assert.match(els.phaseTrack.innerHTML, /first SHIELD phase/, "shield.plan body present");
  });

  test("FX595 Audit phase active → phaseTrack carries shield.audit expander", () => {
    const els = makeEls();
    renderPhase({ title: "Audit", index: 1 }, els, { enabled: true, proficiency: "beginner" });
    assert.match(els.phaseTrack.innerHTML, /reviews the plan/, "shield.audit body present");
  });

  test("FX595 Substantiate phase active → shield.substantiate expander", () => {
    const els = makeEls();
    renderPhase({ title: "Substantiate", index: 4 }, els, { enabled: true, proficiency: "beginner" });
    assert.match(els.phaseTrack.innerHTML, /prove the work/, "shield.substantiate body present");
  });

  test("FX595 education disabled → no lesson expander in phaseTrack", () => {
    const els = makeEls();
    renderPhase({ title: "Plan", index: 0 }, els, { enabled: false, proficiency: "beginner" });
    assert.ok(!/cc-edu-lesson/.test(els.phaseTrack.innerHTML), "no lesson when education disabled");
  });

  test("FX595 absent education config → no lesson, renderPhase still works", () => {
    const els = makeEls();
    renderPhase({ title: "Plan", index: 0 }, els);
    assert.ok(!/cc-edu-lesson/.test(els.phaseTrack.innerHTML), "no lesson when config absent");
    assert.match(els.phaseTrack.innerHTML, /phase-row/, "phase track still rendered");
  });

  test("FX595 A2 — phaseTitle is untouched by the lesson injection", () => {
    const els = makeEls();
    renderPhase({ title: "Plan", index: 0 }, els, { enabled: true, proficiency: "beginner" });
    assert.equal(els.phaseTitle.textContent, "PLAN", "phaseTitle is the plain uppercased title");
    assert.ok(!/cc-edu-lesson/.test(els.phaseTitle.textContent), "no lesson markup in phaseTitle");
  });

  test("FX595 Implement phase has no v1 lesson (anchor unmapped)", () => {
    const els = makeEls();
    renderPhase({ title: "Implement", index: 2 }, els, { enabled: true, proficiency: "beginner" });
    assert.ok(!/cc-edu-lesson/.test(els.phaseTrack.innerHTML), "Implement has no v1 micro-lesson");
  });
});

// --- Part B: FirstRunModePicker lesson-derived detail ---------------------

suite("FirstRunModePicker lesson-derived detail (FX595 Part B)", () => {
  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let capturedPicks: Array<{ mode: string; detail?: string }> | null;

  function makeConfigManager(): ConfigManager {
    const state: Record<string, unknown> = { "failsafe.onboarded.mode": false };
    return {
      getGlobalState: <T>(key: string, dv: T): T => (state[key] as T | undefined) ?? dv,
      setGlobalState: async <T>(key: string, value: T): Promise<void> => { state[key] = value; },
    } as unknown as ConfigManager;
  }

  suiteSetup(() => {
    originalShowQuickPick = vscode.window.showQuickPick;
    originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.window as { showQuickPick: unknown }).showQuickPick = async (
      picks: unknown,
    ): Promise<undefined> => {
      capturedPicks = picks as Array<{ mode: string; detail?: string }>;
      return undefined; // dismiss — detail capture is all we need
    };
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (): vscode.WorkspaceConfiguration => ({
      get: () => undefined,
      has: () => false,
      inspect: () => undefined,
      update: async () => {},
    } as unknown as vscode.WorkspaceConfiguration);
  });

  suiteTeardown(() => {
    (vscode.window as { showQuickPick: unknown }).showQuickPick = originalShowQuickPick;
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
  });

  setup(() => { capturedPicks = null; });

  test("FX595 every QuickPick item carries a lesson-derived detail", async () => {
    const picker = new FirstRunModePicker(makeConfigManager());
    await picker.checkAndRun();
    assert.ok(capturedPicks, "QuickPick was shown");
    assert.equal(capturedPicks!.length, 3, "three mode picks");
    for (const pick of capturedPicks!) {
      assert.ok(
        typeof pick.detail === "string" && pick.detail.length > 0,
        `pick ${pick.mode} must carry a non-empty detail`,
      );
    }
  });

  test("FX595 the detail text matches the governance-mode lesson registry body", async () => {
    const expected = getLesson("governance-mode", "beginner");
    assert.ok(expected, "registry has a governance-mode beginner lesson");
    const picker = new FirstRunModePicker(makeConfigManager());
    await picker.checkAndRun();
    for (const pick of capturedPicks!) {
      assert.equal(
        pick.detail,
        expected,
        `pick ${pick.mode} detail must equal the registry lesson body`,
      );
    }
  });
});
