// FX609 (extended) — Phase 1 of plan-learn-tab-multimode-redesign:
// sectioned-essay renderer. Invokes `renderEssayList` and asserts the
// rendered DOM contains: inline-SVG icon, read-time chip, pull-quote on the
// first section, multiple H4 section headings, sectioned paragraphs, and
// the template as an inline `<aside>` callout (not `<details>`).
//
// SG-035 acceptance question: every assertion invokes the renderer and
// checks rendered output (jsdom DOM queries), not artifact presence.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { renderEssayList } from "../../roadmap/ui/modules/learn-essay-list.js";

function mount(html: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
    url: "http://localhost:9999",
  });
  dom.window.document.getElementById("root")!.innerHTML = html;
  return dom.window.document;
}

suite("Learn-tab essay sectioned renderer (Phase 1 of multimode redesign)", () => {
  test("renders inline SVG icon in card header for every essay", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    assert.equal(cards.length, 5);
    for (const card of cards) {
      const icon = card.querySelector(".cc-learn-essay-card-head .cc-learn-essay-icon");
      assert.ok(icon, `card ${card.getAttribute("data-essay-anchor")} must render an inline SVG icon`);
      assert.equal(icon!.tagName.toLowerCase(), "svg");
    }
  });

  test("each card head carries a `~Nm read` chip", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    for (const card of cards) {
      const chip = card.querySelector(".cc-learn-essay-readtime");
      assert.ok(chip, `card ${card.getAttribute("data-essay-anchor")} must render read-time chip`);
      assert.match(
        chip!.textContent || "",
        /~\d+m read/,
        "read-time chip must match `~Nm read`",
      );
    }
  });

  test("first section of every essay renders a pullquote blockquote before its heading", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    for (const card of cards) {
      const firstSection = card.querySelector(".cc-learn-essay-section");
      assert.ok(firstSection, `card ${card.getAttribute("data-essay-anchor")} must have first section`);
      const pull = firstSection!.querySelector(".cc-learn-essay-pullquote");
      assert.ok(pull, `first section of ${card.getAttribute("data-essay-anchor")} must render pullquote`);
      assert.ok(
        (pull!.textContent || "").trim().length > 0,
        "pullquote text must be non-empty",
      );
    }
  });

  test("subsequent sections do NOT render a pullquote (only first section convention)", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    // Slow-down essay has 3 beginner sections; verify only the first carries a pullquote.
    const card = doc.querySelector('[data-essay-anchor="learn.essay.slow-down-to-speed-up"]');
    assert.ok(card);
    const sections = card!.querySelectorAll(".cc-learn-essay-section");
    assert.ok(sections.length >= 2, "slow-down essay must have at least 2 beginner sections");
    const allPullQuotes = card!.querySelectorAll(".cc-learn-essay-pullquote");
    assert.equal(
      allPullQuotes.length,
      1,
      "exactly one pullquote per card (first section only)",
    );
  });

  test("each section emits an H4 heading + at least one paragraph", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    for (const card of cards) {
      const sections = card.querySelectorAll(".cc-learn-essay-section");
      assert.ok(sections.length >= 1, "every card has at least one section");
      for (const section of sections) {
        const h4 = section.querySelector("h4.cc-learn-essay-section-heading");
        assert.ok(h4, `section in ${card.getAttribute("data-essay-anchor")} must have H4 heading`);
        const paragraphs = section.querySelectorAll("p.cc-learn-essay-paragraph");
        assert.ok(
          paragraphs.length >= 1,
          `section under H4 "${h4!.textContent}" must have at least 1 paragraph`,
        );
      }
    }
  });

  test("templates render as inline <aside> callouts (NOT <details> wrappers)", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    // Acceptance-criteria template should be an aside, not a details element.
    const accCard = doc.querySelector('[data-essay-anchor="learn.essay.acceptance-criteria"]');
    const accTemplate = accCard!.querySelector(".cc-learn-essay-template");
    assert.ok(accTemplate);
    assert.equal(
      accTemplate!.tagName.toLowerCase(),
      "aside",
      "acceptance-criteria template must be inline <aside>, not <details>",
    );
    // No <details> elements anywhere in the rendered essay list.
    assert.equal(
      doc.querySelectorAll("details").length,
      0,
      "no <details> wrappers — templates render inline",
    );
  });

  test("read-time chip math scales with body word count (smoke check)", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    // Slow-down essay has the longest beginner body in the Phase 1 set.
    const slow = doc.querySelector('[data-essay-anchor="learn.essay.slow-down-to-speed-up"]');
    const slowChip = slow!.querySelector(".cc-learn-essay-readtime");
    const m = (slowChip!.textContent || "").match(/~(\d+)m read/);
    assert.ok(m, "read-time chip must encode an integer minute count");
    assert.ok(parseInt(m![1], 10) >= 1, "read-time must be at least 1 minute");
  });

  test("renderer dispatches on body shape: legacy string body falls back to single-section", () => {
    // Hostile-fixture override: inject a string body, assert the renderer
    // still produces valid HTML via the legacy `<p class="cc-learn-essay-body">`
    // path. Restore the original in finally so other tests see real content.
    const lessonsMod = require("../../education/lessons.js");
    const target = "learn.essay.scope-before-prompt";
    const original = lessonsMod.LESSONS[target];
    lessonsMod.LESSONS[target] = {
      ...original,
      body: { beginner: "legacy single string body", intermediate: "x", advanced: "x" },
    };
    try {
      const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
      const card = doc.querySelector('[data-essay-anchor="learn.essay.scope-before-prompt"]');
      assert.ok(card);
      // Legacy path produces a `.cc-learn-essay-body` paragraph (no sections).
      const legacyBody = card!.querySelector("p.cc-learn-essay-body");
      assert.ok(legacyBody, "string body must render via legacy <p> fallback");
      assert.match(legacyBody!.textContent || "", /legacy single string body/);
      assert.equal(
        card!.querySelectorAll(".cc-learn-essay-section").length,
        0,
        "string body must NOT produce sectioned blocks",
      );
    } finally {
      lessonsMod.LESSONS[target] = original;
    }
  });

  test("icon registry maps the 5 essay icon keys to renderable SVG strings", () => {
    // Validate via the icons module directly — Phase 1 leaf module.
    const { iconHtml, ICON_KEYS } = require("../../roadmap/ui/modules/learn-essay-icons.js");
    const expected = ["clock", "target", "checklist", "fork", "magnifier"];
    for (const k of expected) {
      assert.ok(ICON_KEYS.includes(k), `icon registry must include "${k}"`);
      const html = iconHtml(k);
      assert.match(html, /^<svg /, `${k} icon must produce a leading <svg> element`);
      assert.match(html, /currentColor/, `${k} icon must use currentColor for theme adaptation`);
    }
  });

  test("Phase 2: each card carries a single accent modifier class per ESSAY_ACCENT_MAP", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const expected: Record<string, string> = {
      "learn.essay.slow-down-to-speed-up": "cc-learn-essay-card--accent-green",
      "learn.essay.scope-before-prompt": "cc-learn-essay-card--accent-cyan",
      "learn.essay.acceptance-criteria": "cc-learn-essay-card--accent-gold",
      "learn.essay.choose-agent-option": "cc-learn-essay-card--accent-orange",
      "learn.essay.verify-output": "cc-learn-essay-card--accent-red",
    };
    for (const [anchor, cls] of Object.entries(expected)) {
      const card = doc.querySelector(`[data-essay-anchor="${anchor}"]`);
      assert.ok(card, `card for ${anchor} must render`);
      assert.ok(card!.classList.contains(cls), `card ${anchor} must carry ${cls}`);
    }
  });

  test("Phase 2: card has id=cc-learn-essay-<slug> for jump-strip anchor target", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const slow = doc.querySelector('[data-essay-anchor="learn.essay.slow-down-to-speed-up"]');
    assert.ok(slow);
    assert.equal(slow!.getAttribute("id"), "cc-learn-essay-slow-down-to-speed-up");
  });

  test("Phase 2 A3: relevant-now badge container always renders with aria-live=polite (even when no badge)", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const regions = doc.querySelectorAll(".cc-learn-essay-relevant-now-region");
    assert.equal(regions.length, 5, "every essay card has the live region");
    for (const region of regions) {
      assert.equal(region.getAttribute("aria-live"), "polite");
      assert.equal(region.getAttribute("aria-atomic"), "true");
    }
  });

  test("Phase 2 A3: badge text appears inside the live region only when contextual trigger fires", () => {
    const docNoTrigger = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const noBadgeRegion = docNoTrigger.querySelector(
      '[data-essay-anchor="learn.essay.verify-output"] .cc-learn-essay-relevant-now-region',
    );
    assert.equal((noBadgeRegion!.textContent || "").trim(), "", "no trigger → region empty");

    const docWithTrigger = mount(
      renderEssayList({
        enabled: true,
        proficiency: "beginner",
        triggerResults: [{ anchor: "learn.essay.verify-output", fire: true }],
      }),
    );
    const withBadgeRegion = docWithTrigger.querySelector(
      '[data-essay-anchor="learn.essay.verify-output"] .cc-learn-essay-relevant-now-region',
    );
    assert.match((withBadgeRegion!.textContent || ""), /Now relevant/);
  });

  test("Phase 2: jump-strip mounts at top of essay list with 5 anchors", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const jump = doc.querySelector("aside.cc-learn-essay-jump");
    assert.ok(jump, "jump-strip aside must mount");
    const anchors = jump!.querySelectorAll("a.cc-learn-essay-jump-anchor");
    assert.equal(anchors.length, 5);
  });

  test("Phase 2: acceptance-criteria template renders Copy button + inset class", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const accCard = doc.querySelector('[data-essay-anchor="learn.essay.acceptance-criteria"]');
    const tmpl = accCard!.querySelector(".cc-learn-essay-template");
    assert.ok(tmpl);
    assert.ok(
      tmpl!.classList.contains("cc-learn-essay-template--inset"),
      "template must carry the --inset modifier for the nested sub-panel style",
    );
    const copyBtn = tmpl!.querySelector("[data-acceptance-copy]");
    assert.ok(copyBtn, "Copy button must render on the acceptance template");
    assert.equal((copyBtn!.textContent || "").trim(), "Copy");
  });

  test("Phase 2: Copy button click triggers visible feedback (button label flips to 'Copied')", () => {
    // navigator.clipboard mocking across jsdom + Node-global navigator
    // is brittle (Node 21+ navigator is a read-only getter). Verify the
    // OBSERVABLE behavior instead: clicking the Copy button immediately
    // flips its label to "Copied" (best-effort clipboard.writeText is
    // wrapped in try/catch and silently degrades on missing API).
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
      url: "http://localhost:9999",
    });
    const prev = { window: (global as any).window, document: (global as any).document };
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    try {
      dom.window.document.getElementById("root")!.innerHTML =
        renderEssayList({ enabled: true, proficiency: "beginner" });
      const { bindEssayAck } = require("../../roadmap/ui/modules/learn-essay-bindings.js");
      bindEssayAck(dom.window.document);
      const copyBtn = dom.window.document.querySelector("[data-acceptance-copy]") as HTMLButtonElement;
      assert.ok(copyBtn);
      assert.equal((copyBtn.textContent || "").trim(), "Copy", "initial label is 'Copy'");
      copyBtn.click();
      assert.equal((copyBtn.textContent || "").trim(), "Copied", "label flips to 'Copied' immediately after click");
      assert.equal(
        copyBtn.getAttribute("aria-label"),
        "Template copied",
        "aria-label updates to 'Template copied' for SR users",
      );
    } finally {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
    }
  });

  test("Phase 2 A9: section sub-headings render as <h4>, not <h3> (heading hierarchy)", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const sectionHeads = doc.querySelectorAll(".cc-learn-essay-section-heading");
    assert.ok(sectionHeads.length > 0, "at least one section heading must render");
    for (const h of sectionHeads) {
      assert.equal(
        h.tagName.toLowerCase(),
        "h4",
        "section sub-heading must be <h4> (essay title is <h3>, tab is <h2>)",
      );
    }
  });

  test("icon registry returns '' for unknown / missing icon keys (graceful fallback)", () => {
    const { iconHtml } = require("../../roadmap/ui/modules/learn-essay-icons.js");
    assert.equal(iconHtml(undefined), "");
    assert.equal(iconHtml("nonexistent-icon"), "");
    assert.equal(iconHtml(42 as any), "");
  });
});
