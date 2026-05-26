// FX619 — Phase 2 visual rebuild: sticky jump-strip at top of Read sub-view
// (Direction-B graft per ui-designer 2026-05-24 dispatch). SG-035: invoke
// the pure-function renderer + assert on output DOM structure.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { renderEssayJumpStrip, slugForAnchor } from "../../roadmap/ui/modules/learn-essay-jump.js";

function mount(html: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`, {
    url: "http://localhost:9999",
  });
  dom.window.document.getElementById("root")!.innerHTML = html;
  return dom.window.document;
}

const FIVE_ESSAYS = [
  { anchor: "learn.essay.slow-down-to-speed-up", term: "Slow down to speed up", accent: "green" },
  { anchor: "learn.essay.scope-before-prompt", term: "Scope before prompt", accent: "cyan" },
  { anchor: "learn.essay.acceptance-criteria", term: "Acceptance criteria before code", accent: "gold" },
  { anchor: "learn.essay.choose-agent-option", term: "Choosing between agent suggestions", accent: "orange" },
  { anchor: "learn.essay.verify-output", term: "Verify before you believe", accent: "red" },
];

suite("Learn-tab essay jump-strip (FX619)", () => {
  test("renders one anchor per essay in caller-supplied order", () => {
    const doc = mount(renderEssayJumpStrip(FIVE_ESSAYS, []));
    const anchors = doc.querySelectorAll("a.cc-learn-essay-jump-anchor");
    assert.equal(anchors.length, 5, "expected exactly 5 jump anchors");
    const anchorAttrs = [...anchors].map((a) => a.getAttribute("data-jump-anchor"));
    assert.deepEqual(anchorAttrs, FIVE_ESSAYS.map((e) => e.anchor), "anchor order matches input");
  });

  test("each anchor href targets the matching essay card id via hash", () => {
    const doc = mount(renderEssayJumpStrip(FIVE_ESSAYS, []));
    const anchors = doc.querySelectorAll("a.cc-learn-essay-jump-anchor");
    for (let i = 0; i < FIVE_ESSAYS.length; i++) {
      const slug = slugForAnchor(FIVE_ESSAYS[i].anchor);
      const expectedHref = `#cc-learn-essay-${slug}`;
      assert.equal(
        anchors[i].getAttribute("href"),
        expectedHref,
        `anchor ${i} href must point to #cc-learn-essay-${slug}`,
      );
    }
  });

  test("anchors in the relevant-now set carry a visible dot indicator", () => {
    const relevant = ["learn.essay.scope-before-prompt", "learn.essay.verify-output"];
    const doc = mount(renderEssayJumpStrip(FIVE_ESSAYS, relevant));
    const anchors = [...doc.querySelectorAll("a.cc-learn-essay-jump-anchor")];
    for (let i = 0; i < anchors.length; i++) {
      const isRelevant = relevant.includes(FIVE_ESSAYS[i].anchor);
      const dot = anchors[i].querySelector(".cc-learn-essay-jump-dot");
      if (isRelevant) {
        assert.ok(dot, `anchor ${i} (${FIVE_ESSAYS[i].anchor}) must carry the dot`);
        assert.equal(dot!.getAttribute("aria-label"), "Relevant now");
      } else {
        assert.equal(dot, null, `anchor ${i} (${FIVE_ESSAYS[i].anchor}) must NOT carry the dot`);
      }
    }
  });

  test("anchor accent maps to a CSS modifier class derived from the accent name", () => {
    const doc = mount(renderEssayJumpStrip(FIVE_ESSAYS, []));
    const anchors = [...doc.querySelectorAll("a.cc-learn-essay-jump-anchor")];
    for (let i = 0; i < anchors.length; i++) {
      const expectedAccent = FIVE_ESSAYS[i].accent;
      assert.ok(
        anchors[i].classList.contains(`cc-learn-essay-jump-anchor--accent-${expectedAccent}`),
        `anchor ${i} must carry the cc-learn-essay-jump-anchor--accent-${expectedAccent} modifier`,
      );
    }
  });

  test("returns empty string for an empty essay list", () => {
    assert.equal(renderEssayJumpStrip([], []), "");
    assert.equal(renderEssayJumpStrip([], ["something"]), "");
  });

  test("nav role + aria-label set on the wrapping aside (a11y)", () => {
    const doc = mount(renderEssayJumpStrip(FIVE_ESSAYS, []));
    const aside = doc.querySelector("aside.cc-learn-essay-jump");
    assert.ok(aside, "wrapping <aside> must render");
    assert.equal(aside!.getAttribute("role"), "navigation");
    assert.equal(aside!.getAttribute("aria-label"), "Jump to essay");
  });

  test("slugForAnchor strips the `learn.essay.` prefix", () => {
    assert.equal(slugForAnchor("learn.essay.scope-before-prompt"), "scope-before-prompt");
    assert.equal(slugForAnchor("learn.essay.x"), "x");
    assert.equal(slugForAnchor("no-prefix"), "no-prefix");
    assert.equal(slugForAnchor(""), "");
    assert.equal(slugForAnchor(undefined as any), "");
  });

  test("anchor labels render with 1-based step numbers (1. Term)", () => {
    const doc = mount(renderEssayJumpStrip(FIVE_ESSAYS, []));
    const nums = [...doc.querySelectorAll(".cc-learn-essay-jump-anchor-num")];
    assert.equal(nums.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(nums[i].textContent, `${i + 1}.`);
    }
  });
});
