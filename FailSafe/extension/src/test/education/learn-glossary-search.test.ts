// FX615 — Phase 3: Glossary sub-view search (rename + section-grouped).
// SG-035: invoke the renderer + interact with rendered DOM after typing
// into search input; assert on observable output.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { LearnGlossary } from "../../roadmap/ui/modules/learn-glossary.js";

function freshContainer(): { container: HTMLElement; doc: Document; cleanup: () => void } {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
    url: "http://localhost:9999",
  });
  const prev = { window: (global as any).window, document: (global as any).document };
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  const container = dom.window.document.getElementById("root") as HTMLElement;
  return {
    container,
    doc: dom.window.document,
    cleanup: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
    },
  };
}

function mount(hub: any) {
  const env = freshContainer();
  const g = new LearnGlossary();
  g.container = env.container;
  g.render(hub);
  return { g, container: env.container, doc: env.doc, cleanup: env.cleanup };
}

const enabledHub = { education: { enabled: true, proficiency: "beginner" } };

suite("Learn-tab Glossary search (FX615 Phase 3)", () => {
  test("empty query renders the alphabetized all-terms list", () => {
    const { container, cleanup } = mount(enabledHub);
    try {
      const sections = container.querySelectorAll(".cc-learn-glossary-section");
      assert.equal(sections.length, 1, "single all-terms section rendered");
      const rows = container.querySelectorAll(".cc-learn-glossary-row");
      // 12 FailSafe baseline + 48 SWE + 1 bicameral-integration = 61.
      assert.ok(rows.length >= 13, `expected at least 13 rows; saw ${rows.length}`);
    } finally { cleanup(); }
  });

  test("single-token query filters across all sections; remaining rows match the token", () => {
    const { doc, container, cleanup } = mount(enabledHub);
    try {
      const input = container.querySelector('[data-learn-glossary-search]') as HTMLInputElement;
      input.value = "interceptor";
      input.dispatchEvent(new (doc.defaultView as any).Event("input"));
      const rows = container.querySelectorAll(".cc-learn-glossary-row");
      assert.ok(rows.length >= 1, "search 'interceptor' must match at least 1 row");
      for (const row of rows) {
        const text = (row.textContent || "").toLowerCase();
        assert.ok(text.includes("interceptor"), `row '${text.slice(0, 40)}' must match`);
      }
    } finally { cleanup(); }
  });

  test("no-match query renders one zero-match line", () => {
    const { doc, container, cleanup } = mount(enabledHub);
    try {
      const input = container.querySelector('[data-learn-glossary-search]') as HTMLInputElement;
      input.value = "zzz-no-such-token-anywhere-xyz";
      input.dispatchEvent(new (doc.defaultView as any).Event("input"));
      const zeros = container.querySelectorAll(".cc-learn-glossary-section-zero");
      assert.equal(zeros.length, 1, "all terms section collapses to a single zero-match line");
      const rows = container.querySelectorAll(".cc-learn-glossary-row");
      assert.equal(rows.length, 0, "no rows render under no-match");
      assert.equal(container.querySelectorAll(".cc-learn-glossary-section-head").length, 1);
      assert.ok(container.querySelector("[data-learn-glossary-search]"));
    } finally { cleanup(); }
  });

  test("disabled education renders empty container", () => {
    const env = freshContainer();
    try {
      const g = new LearnGlossary();
      g.container = env.container;
      g.render({ education: { enabled: false } });
      assert.equal(env.container.innerHTML, "");
    } finally { env.cleanup(); }
  });

  test("destroy() clears state + DOM", () => {
    const { g, container, cleanup } = mount(enabledHub);
    try {
      g.destroy();
      assert.equal(container.innerHTML, "");
      assert.equal(g._query, "");
      assert.equal(g._expanded.size, 0);
    } finally { cleanup(); }
  });

  test("search is case-insensitive", () => {
    const { doc, container, cleanup } = mount(enabledHub);
    try {
      const input = container.querySelector('[data-learn-glossary-search]') as HTMLInputElement;
      input.value = "INTERCEPTOR";
      input.dispatchEvent(new (doc.defaultView as any).Event("input"));
      const rows = container.querySelectorAll(".cc-learn-glossary-row");
      assert.ok(rows.length >= 1, "uppercase query must still find matches");
    } finally { cleanup(); }
  });

  test("search input has a11y attributes (inputmode, spellcheck, autocomplete, paired label)", () => {
    const { container, cleanup } = mount(enabledHub);
    try {
      const input = container.querySelector('[data-learn-glossary-search]') as HTMLInputElement;
      assert.equal(input.getAttribute("inputmode"), "search");
      assert.equal(input.getAttribute("spellcheck"), "false");
      assert.equal(input.getAttribute("autocomplete"), "off");
      assert.equal(input.getAttribute("type"), "search");
      const label = container.querySelector(`label[for="${input.id}"]`);
      assert.ok(label, "search input must have a paired label");
      assert.ok(
        label!.classList.contains("visually-hidden"),
        "label is visually hidden but reachable by SR",
      );
    } finally { cleanup(); }
  });

  test("results container is a live region (aria-live=polite)", () => {
    const { container, cleanup } = mount(enabledHub);
    try {
      const region = container.querySelector(".cc-learn-glossary-results");
      assert.ok(region);
      assert.equal(region!.getAttribute("aria-live"), "polite");
      assert.equal(region!.getAttribute("role"), "region");
    } finally { cleanup(); }
  });
});
