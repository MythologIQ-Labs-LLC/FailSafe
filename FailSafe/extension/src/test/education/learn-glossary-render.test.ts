// FX615 - Learn-tab Glossary sorting, filters, row anatomy, expand toggle.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { LearnGlossary } from "../../roadmap/ui/modules/learn-glossary.js";

function freshEnv() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
    url: "http://localhost:9999",
  });
  const prev = { window: (global as any).window, document: (global as any).document };
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  return {
    dom,
    cleanup: () => { (global as any).window = prev.window; (global as any).document = prev.document; },
    mount(hub: any) {
      const g = new LearnGlossary();
      g.container = dom.window.document.getElementById("root") as HTMLElement;
      g.render(hub);
      return { g, container: g.container, doc: dom.window.document };
    },
  };
}

function terms(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".cc-learn-glossary-row-term")]
    .map((n) => (n.textContent || "").trim());
}

const beginnerHub = { education: { enabled: true, proficiency: "beginner" } };
const intermediateHub = { education: { enabled: true, proficiency: "intermediate" } };

suite("Learn-tab Glossary sorting and filters (FX615)", () => {
  test("renders all glossary rows alphabetically A-Z by default", () => {
    const env = freshEnv();
    try {
      const { container } = env.mount(beginnerHub);
      const rendered = terms(container);
      assert.ok(rendered.length > 10, "glossary rows render");
      const sorted = [...rendered].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      assert.deepEqual(rendered, sorted, "default glossary order is alphabetical");
      assert.ok((container.querySelector(".cc-learn-glossary-section-head")?.textContent || "").includes("All terms"));
    } finally { env.cleanup(); }
  });

  test("tag filters narrow the alphabetized list", () => {
    const env = freshEnv();
    try {
      const { container } = env.mount(beginnerHub);
      // Click triggers re-render which replaces the button node — must re-query
      // after click to read the new aria-pressed state.
      const fsFilterBefore = container.querySelector('[data-learn-glossary-filter="fs"]') as HTMLButtonElement;
      fsFilterBefore.click();
      const fsFilterAfter = container.querySelector('[data-learn-glossary-filter="fs"]');
      assert.equal(fsFilterAfter!.getAttribute("aria-pressed"), "true");
      const tags = [...container.querySelectorAll(".cc-learn-glossary-tag")]
        .map((n) => (n.textContent || "").trim());
      assert.ok(tags.length > 0, "filtered rows render");
      assert.ok(tags.every((tag) => tag === "FailSafe"), "only FailSafe-tagged rows remain");
    } finally { env.cleanup(); }
  });

  test("sort select can reverse the visible list Z-A", () => {
    const env = freshEnv();
    try {
      const { container } = env.mount(beginnerHub);
      const select = container.querySelector("[data-learn-glossary-sort]") as HTMLSelectElement;
      select.value = "za";
      select.dispatchEvent(new env.dom.window.Event("change", { bubbles: true }));
      const rendered = terms(container);
      const sorted = [...rendered].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" }));
      assert.deepEqual(rendered, sorted, "Z-A sort reverses row order");
    } finally { env.cleanup(); }
  });

  test("expand toggle reveals intermediate body at proficiency='intermediate'", () => {
    const env = freshEnv();
    try {
      const { container } = env.mount(intermediateHub);
      const toggle = container.querySelector("[data-learn-glossary-expand]") as HTMLButtonElement;
      assert.ok(toggle, "expand toggle must exist on at least one row at intermediate proficiency");
      assert.equal(toggle.getAttribute("aria-expanded"), "false", "collapsed by default");
      toggle.click();
      const anchor = toggle.getAttribute("data-learn-glossary-expand")!;
      const row = container.querySelector(`[data-anchor="${anchor}"]`);
      assert.ok(row!.querySelector(".cc-learn-glossary-row-extra"), "extra paragraph is revealed");
    } finally { env.cleanup(); }
  });

  test("missing education config defaults to enabled so Read/Glossary do not blank", () => {
    const env = freshEnv();
    try {
      const { container } = env.mount({});
      assert.ok(container.querySelector("#cc-learn-glossary"), "glossary renders without explicit education field");
    } finally { env.cleanup(); }
  });

  test("explicit education disabled still clears glossary", () => {
    const env = freshEnv();
    try {
      const { container } = env.mount({ education: { enabled: false, proficiency: "beginner" } });
      assert.equal(container.innerHTML, "");
    } finally { env.cleanup(); }
  });

  test("row body is HTML-escaped (hostile fixture)", () => {
    const env = freshEnv();
    try {
      const lessonsMod = require("../../education/lessons.js");
      const target = "glossary.bicameral-integration";
      const original = lessonsMod.LESSONS[target];
      lessonsMod.LESSONS[target] = {
        ...original,
        body: { beginner: '<img src=x onerror="alert(1)">', intermediate: "x", advanced: "x" },
      };
      try {
        const { container } = env.mount(beginnerHub);
        const html = container.innerHTML;
        assert.equal(html.indexOf("<img src=x"), -1, "raw <img> must be escaped");
        assert.ok(html.indexOf("&lt;img") >= 0, "escaped entity must appear");
      } finally {
        lessonsMod.LESSONS[target] = original;
      }
    } finally { env.cleanup(); }
  });
});
