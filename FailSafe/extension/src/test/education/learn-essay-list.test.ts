// FX609 — Educational Component Phase 3: Learn-tab essay list renderer.
// jsdom functional test. SG-035: render real HTML, assert on real DOM.

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

const ESSAY_ANCHORS = [
  "learn.essay.slow-down-to-speed-up",
  "learn.essay.scope-before-prompt",
  "learn.essay.acceptance-criteria",
  "learn.essay.choose-agent-option",
  "learn.essay.verify-output",
];

suite("Learn-tab essay list renderer (FX609)", () => {
  test("FX609 renders 5 essay cards (one per SWE-craft anchor) when education enabled", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    assert.equal(cards.length, 5, "expected exactly 5 essay cards");
    const anchors = [...cards].map((c) => (c as Element).getAttribute("data-essay-anchor"));
    for (const expected of ESSAY_ANCHORS) {
      assert.ok(anchors.includes(expected), `essay anchor missing from rendered cards: ${expected}`);
    }
  });

  test("FX609 returns empty string when education is disabled", () => {
    assert.equal(renderEssayList({ enabled: false, proficiency: "beginner" }), "");
  });

  test("FX609 returns empty string when config is absent", () => {
    assert.equal(renderEssayList(undefined as any), "");
    assert.equal(renderEssayList({}), "");
  });

  test("FX609 sorts fired-trigger anchors first and marks them relevant-now", () => {
    const triggerResults = [
      { anchor: "learn.essay.verify-output", fire: true },
      { anchor: "learn.essay.scope-before-prompt", fire: false },
    ];
    const doc = mount(
      renderEssayList({ enabled: true, proficiency: "beginner", triggerResults }),
    );
    const cards = [...doc.querySelectorAll("article.cc-learn-essay-card")];
    assert.equal(
      cards[0].getAttribute("data-essay-anchor"),
      "learn.essay.verify-output",
      "fired-trigger anchor must appear first",
    );
    assert.equal(cards[0].getAttribute("data-relevant-now"), "true");
    assert.ok(
      cards[0].querySelector(".cc-learn-essay-relevant-now"),
      "fired-trigger card must show the relevant-now badge",
    );
    // The other 4 cards have data-relevant-now=false.
    for (let i = 1; i < cards.length; i++) {
      assert.equal(cards[i].getAttribute("data-relevant-now"), "false");
    }
  });

  test("FX609 acceptance-criteria card renders the acceptance-criteria template", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const card = doc.querySelector('[data-essay-anchor="learn.essay.acceptance-criteria"]');
    assert.ok(card, "acceptance-criteria card present");
    const template = card!.querySelector(".cc-learn-essay-template");
    assert.ok(template, "acceptance-criteria template section present");
    assert.match(
      template!.textContent || "",
      /I am changing \[specific behavior\]/,
      "acceptance-criteria template body must render",
    );
  });

  test("FX609 choose-agent-option card renders the 6-question option-evaluation table", () => {
    const doc = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    const card = doc.querySelector('[data-essay-anchor="learn.essay.choose-agent-option"]');
    assert.ok(card, "choose-agent-option card present");
    const table = card!.querySelector("table.cc-learn-option-table");
    assert.ok(table, "option-evaluation table present");
    const rows = table!.querySelectorAll("tbody tr");
    assert.equal(rows.length, 6, "option-evaluation table must have 6 rows");
  });

  test("FX609 only relevant-now cards carry a 'Mark as read' control", () => {
    // Without triggerResults: no card is relevant-now → no Mark-as-read buttons.
    const docNone = mount(renderEssayList({ enabled: true, proficiency: "beginner" }));
    assert.equal(
      docNone.querySelectorAll("[data-learn-essay-ack]").length,
      0,
      "no Mark-as-read controls without a firing trigger",
    );

    // With a firing trigger: only that anchor's card carries the control.
    const docOne = mount(
      renderEssayList({
        enabled: true,
        proficiency: "beginner",
        triggerResults: [{ anchor: "learn.essay.verify-output", fire: true }],
      }),
    );
    const acks = docOne.querySelectorAll("[data-learn-essay-ack]");
    assert.equal(acks.length, 1, "exactly one Mark-as-read control matches the firing anchor");
    assert.equal(
      acks[0].getAttribute("data-learn-essay-ack"),
      "learn.essay.verify-output",
      "Mark-as-read anchor matches the firing trigger's anchor",
    );
  });

  test("FX609 essay body is HTML-escaped (hostile-fixture)", () => {
    // Inject a hostile body into the lesson registry; assert renderer escapes.
    // Restore in finally so subsequent tests (FX612 SWE-vocab dominance) see
    // the real body — otherwise the hostile mutation leaks across tests.
    const lessonsMod = require("../../education/lessons.js");
    const target = "learn.essay.scope-before-prompt";
    const original = lessonsMod.LESSONS[target];
    lessonsMod.LESSONS[target] = {
      ...original,
      body: {
        beginner: '<img src=x onerror="alert(1)">',
        intermediate: "x",
        advanced: "x",
      },
    };
    try {
      const html = renderEssayList({ enabled: true, proficiency: "beginner" });
      assert.ok(html.indexOf("<img src=x") === -1, "raw <img> must be escaped");
      assert.match(html, /&lt;img/, "escaped entity must be present");
    } finally {
      lessonsMod.LESSONS[target] = original;
    }
  });
});
