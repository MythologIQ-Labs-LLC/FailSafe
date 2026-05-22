// FX594 — Educational Component Phase 4a: governance-mode card extraction +
// micro-lesson mount.
//
// jsdom functional test. SG-035: render real HTML, assert on real DOM.
// Covers:
//  - the `governance-mode` lesson renders inside the card when education is
//    enabled;
//  - nothing lesson-shaped renders when education is disabled;
//  - the extraction preserves the existing mode-button behaviour (regression).
//
// Imports the COMPILED leaf from out/ so its `./education-lesson.js` import
// resolves at runtime.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { renderGovernanceModeCard, bindGovernanceModeCard, MODE_OPTIONS } from "../../roadmap/ui/modules/governance-mode-card.js";

function setupDom(): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>", {
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
    dom,
    restore: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
      (global as any).localStorage = prev.localStorage;
      (global as any).sessionStorage = prev.sessionStorage;
    },
  };
}

suite("governance-mode-card extraction + lesson mount (FX594)", () => {
  let env: { dom: JSDOM; restore: () => void };
  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("FX594 card renders the governance-mode lesson when education enabled", () => {
    const doc = env.dom.window.document;
    const html = renderGovernanceModeCard({
      governanceModeState: { mode: "observe", defaulted: true },
      education: { enabled: true, proficiency: "beginner" },
    });
    doc.getElementById("root")!.innerHTML = html;
    const card = doc.getElementById("cc-governance-mode");
    assert.ok(card, "governance-mode card present");
    const lesson = card!.querySelector("details.cc-edu-lesson");
    assert.ok(lesson, "education micro-lesson mounted inside the card");
    assert.match(card!.innerHTML, /What does this mean\?/);
  });

  test("FX594 no lesson renders when education disabled", () => {
    const doc = env.dom.window.document;
    const html = renderGovernanceModeCard({
      governanceModeState: { mode: "observe", defaulted: true },
      education: { enabled: false, proficiency: "beginner" },
    });
    doc.getElementById("root")!.innerHTML = html;
    const card = doc.getElementById("cc-governance-mode");
    assert.ok(card, "card still renders (only the lesson is gated)");
    assert.equal(
      card!.querySelector("details.cc-edu-lesson"),
      null,
      "no lesson expander when education disabled",
    );
  });

  test("FX594 no lesson renders when education config absent", () => {
    const doc = env.dom.window.document;
    const html = renderGovernanceModeCard({
      governanceModeState: { mode: "assist", defaulted: false },
    });
    doc.getElementById("root")!.innerHTML = html;
    assert.equal(
      doc.querySelector("details.cc-edu-lesson"),
      null,
      "absent education config must not render a lesson",
    );
  });

  test("FX594 regression — all three mode buttons render with data-governance-mode", () => {
    const doc = env.dom.window.document;
    doc.getElementById("root")!.innerHTML = renderGovernanceModeCard({
      governanceModeState: { mode: "enforce", defaulted: false },
      education: { enabled: true, proficiency: "beginner" },
    });
    const buttons = doc.querySelectorAll("[data-governance-mode]");
    assert.equal(buttons.length, MODE_OPTIONS.length, "one button per mode option");
    const modes = Array.from(buttons).map((b) => (b as Element).getAttribute("data-governance-mode"));
    assert.deepEqual(modes.sort(), ["assist", "enforce", "observe"]);
  });

  test("FX594 regression — active mode button carries aria-pressed", () => {
    const doc = env.dom.window.document;
    doc.getElementById("root")!.innerHTML = renderGovernanceModeCard({
      governanceModeState: { mode: "assist", defaulted: false },
      education: { enabled: true, proficiency: "beginner" },
    });
    const active = doc.querySelector('[data-governance-mode="assist"]');
    assert.ok(active, "assist button present");
    assert.equal(active!.getAttribute("aria-pressed"), "true", "active mode is aria-pressed");
  });

  test("FX594 regression — bindGovernanceModeCard wires click without throwing", () => {
    const doc = env.dom.window.document;
    const root = doc.getElementById("root")!;
    root.innerHTML = renderGovernanceModeCard({
      governanceModeState: { mode: "observe", defaulted: true },
      education: { enabled: true, proficiency: "beginner" },
    });
    bindGovernanceModeCard(root);
    const btn = doc.querySelector('[data-governance-mode="enforce"]') as any;
    assert.ok(btn, "enforce button present");
    // Click navigates via window.location.href command-uri; jsdom tolerates
    // the assignment. The regression assertion is "no throw" + idempotent bind.
    assert.doesNotThrow(() => btn.click(), "mode-button click must not throw");
    assert.equal(btn.getAttribute("data-cc-bound"), "1", "bind sentinel set");
  });

  test("FX594 (default) tag shown when governance mode is defaulted", () => {
    const doc = env.dom.window.document;
    doc.getElementById("root")!.innerHTML = renderGovernanceModeCard({
      governanceModeState: { mode: "observe", defaulted: true },
      education: { enabled: true, proficiency: "beginner" },
    });
    assert.match(doc.getElementById("root")!.innerHTML, /\(default\)/);
  });
});
