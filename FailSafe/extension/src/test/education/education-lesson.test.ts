// FX593 — Educational Component Phase 3: webview micro-lesson affordance.
// jsdom functional test. SG-035: render real HTML, assert on real DOM.
//
// Imports the COMPILED module from out/ (not src/) so the leaf's internal
// `../../../education/lessons.js` import resolves to out/education/lessons.js
// — lessons.ts has no raw .js sibling in src/.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { renderLesson, bindLessonDismiss } from "../../roadmap/ui/modules/education-lesson.js";

const KNOWN_ANCHOR = "governance-mode";

function setupDom(): { dom: JSDOM; restore: () => void } {
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
    dom,
    restore: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
      (global as any).localStorage = prev.localStorage;
      (global as any).sessionStorage = prev.sessionStorage;
    },
  };
}

suite("education-lesson webview affordance (FX593)", () => {
  let env: { dom: JSDOM; restore: () => void };

  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("FX593 known anchor → collapsed <details> expander", () => {
    const doc = env.dom.window.document;
    const html = renderLesson(KNOWN_ANCHOR, { enabled: true, proficiency: "beginner" });
    assert.ok(html.length > 0, "expected non-empty markup");
    doc.body.innerHTML = html;
    const details = doc.querySelector("details.cc-edu-lesson") as any;
    assert.ok(details, "expander element present");
    assert.equal(details.hasAttribute("open"), false, "must be collapsed by default");
    assert.match(doc.body.innerHTML, /What does this mean\?/);
  });

  test("FX593 enabled:false → empty string", () => {
    assert.equal(renderLesson(KNOWN_ANCHOR, { enabled: false, proficiency: "beginner" }), "");
  });

  test("FX593 unknown anchor → empty string", () => {
    assert.equal(renderLesson("no-such-anchor", { enabled: true, proficiency: "beginner" }), "");
  });

  test("FX593 proficiency selects the matching body", () => {
    const beginner = renderLesson(KNOWN_ANCHOR, { enabled: true, proficiency: "beginner" });
    const advanced = renderLesson(KNOWN_ANCHOR, { enabled: true, proficiency: "advanced" });
    assert.notEqual(beginner, advanced, "different proficiency must render different body");
    assert.match(advanced, /record-only/);
  });

  test("FX593 dismiss removes the expander and persists state", () => {
    const doc = env.dom.window.document;
    doc.body.innerHTML = renderLesson(KNOWN_ANCHOR, {
      enabled: true,
      proficiency: "beginner",
    });
    bindLessonDismiss(doc);
    const btn = doc.querySelector("[data-edu-dismiss]") as any;
    assert.ok(btn, "dismiss control present");
    btn.click();
    assert.equal(
      doc.querySelector("details.cc-edu-lesson"),
      null,
      "expander removed after dismiss",
    );
    // Persisted: a subsequent render for the same anchor returns empty.
    assert.equal(
      renderLesson(KNOWN_ANCHOR, { enabled: true, proficiency: "beginner" }),
      "",
      "dismissed anchor should not re-render",
    );
  });

  test("FX593 lesson body HTML is escaped", () => {
    // Inject a hostile lesson directly into the registry to prove escaping.
    const lessonsMod = require("../../education/lessons.js");
    lessonsMod.LESSONS["fixture-xss"] = {
      id: "fixture-xss",
      anchor: "fixture-xss",
      term: "XSS Fixture",
      levels: ["beginner"],
      body: { beginner: '<img src=x onerror="alert(1)">' },
    };
    try {
      const html = renderLesson("fixture-xss", { enabled: true, proficiency: "beginner" });
      assert.ok(html.indexOf("<img") === -1, "raw <img> tag must be escaped");
      assert.match(html, /&lt;img/, "escaped entity must be present");
    } finally {
      delete lessonsMod.LESSONS["fixture-xss"];
    }
  });
});
