// FX600 — Educational Component Phase 6c: glossary surface affordance.
// jsdom functional test. SG-035: render real HTML, assert on real DOM.
//
// Imports the COMPILED leaf from out/ so its `../../../education/lessons.js`
// import resolves to out/education/lessons.js at runtime.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { renderGlossary } from "../../roadmap/ui/modules/education-glossary.js";
import { glossaryLessons } from "../../education/lessons";

function setupDom(): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost:9999",
  });
  const prev = {
    window: (global as any).window,
    document: (global as any).document,
  };
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  return {
    dom,
    restore: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
    },
  };
}

suite("education-glossary surface affordance (FX600)", () => {
  let env: { dom: JSDOM; restore: () => void };
  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("FX600 enabled → collapsed 'FailSafe Glossary' section", () => {
    const doc = env.dom.window.document;
    const html = renderGlossary({ enabled: true, proficiency: "beginner" });
    assert.ok(html.length > 0, "expected non-empty markup");
    doc.getElementById("root")!.innerHTML = html;
    const section = doc.querySelector("details#cc-edu-glossary") as any;
    assert.ok(section, "glossary section element present");
    assert.equal(section.hasAttribute("open"), false, "section collapsed by default");
    assert.match(doc.body.innerHTML, /FailSafe Glossary/);
  });

  test("FX600 enabled:false → empty string", () => {
    assert.equal(renderGlossary({ enabled: false, proficiency: "beginner" }), "");
  });

  test("FX600 absent config → empty string", () => {
    assert.equal(renderGlossary(undefined), "");
    assert.equal(renderGlossary({}), "");
  });

  test("FX600 lists every glossary term as a collapsed expander", () => {
    const doc = env.dom.window.document;
    doc.getElementById("root")!.innerHTML = renderGlossary({
      enabled: true,
      proficiency: "beginner",
    });
    const terms = doc.querySelectorAll("details.cc-edu-glossary-term");
    const expected = glossaryLessons();
    assert.equal(terms.length, expected.length, "one expander per glossary term");
    terms.forEach((t) => {
      assert.equal((t as any).hasAttribute("open"), false, "each term collapsed by default");
    });
    // Every glossary term label is present.
    for (const lesson of expected) {
      assert.ok(
        doc.body.innerHTML.indexOf(lesson.term.replace(/&/g, "&amp;")) !== -1 ||
          doc.body.textContent!.indexOf(lesson.term) !== -1,
        `term "${lesson.term}" must be listed`,
      );
    }
  });

  test("FX600 proficiency selects the matching body", () => {
    const beginner = renderGlossary({ enabled: true, proficiency: "beginner" });
    const advanced = renderGlossary({ enabled: true, proficiency: "advanced" });
    assert.notEqual(beginner, advanced, "different proficiency must render different bodies");
    // The MCP-server advanced body carries its terse marker.
    assert.match(advanced, /protocol-standard tool/);
    assert.match(beginner, /small helper program/);
  });

  test("FX600 a known term opens to its explanation", () => {
    const doc = env.dom.window.document;
    doc.getElementById("root")!.innerHTML = renderGlossary({
      enabled: true,
      proficiency: "beginner",
    });
    const mcp = doc.querySelector('[data-edu-glossary-anchor="glossary.mcp-server"]');
    assert.ok(mcp, "MCP server term present");
    const body = mcp!.querySelector(".cc-edu-glossary-term-body");
    assert.ok(body, "term body present");
    assert.match(body!.textContent || "", /helper program/, "term body shows the explanation");
  });

  test("FX600 term bodies are HTML-escaped", () => {
    // The glossary module escapes term bodies — prove it by injecting a
    // hostile glossary lesson into the registry.
    const lessonsMod = require("../../education/lessons.js");
    lessonsMod.LESSONS["glossary.xss-fixture"] = {
      id: "glossary-xss-fixture",
      anchor: "glossary.xss-fixture",
      kind: "glossary",
      term: '<b>XSS</b>',
      levels: ["beginner", "intermediate", "advanced"],
      body: {
        beginner: '<img src=x onerror="alert(1)">',
        intermediate: "x",
        advanced: "x",
      },
    };
    try {
      const html = renderGlossary({ enabled: true, proficiency: "beginner" });
      assert.ok(html.indexOf('<img src=x') === -1, "raw <img> tag must be escaped");
      assert.match(html, /&lt;img/, "escaped entity must be present");
      assert.ok(html.indexOf("<b>XSS</b>") === -1, "raw term markup must be escaped");
    } finally {
      delete lessonsMod.LESSONS["glossary.xss-fixture"];
    }
  });
});
