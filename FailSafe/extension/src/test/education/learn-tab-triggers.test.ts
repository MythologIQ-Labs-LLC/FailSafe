// FX610 — Learn-tab trigger-engine integration. Split out of `learn-tab.test.ts`
// when the suite grew past the Section 4 razor (250 lines). Shares the jsdom
// setup helper in `learn-tab-helpers.ts`. The FX606 host-composition suite
// (essay-list + glossary mount, education-disabled gating, 5-card directory)
// lives in `learn-tab.test.ts`.

import { strict as assert } from "assert";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { LearnRenderer } from "../../roadmap/ui/modules/learn.js";
import { setupDom, type LearnTabTestEnv } from "./learn-tab-helpers";

suite("Learn tab trigger-engine integration (FX610)", () => {
  let env: LearnTabTestEnv;
  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("FX610 a firing trigger surfaces its essay first in the essay list", () => {
    const doc = env.dom.window.document;
    // Seed: file activity exists + no active plan → scope-before-prompt fires.
    new LearnRenderer("learn").render({
      activePlan: null,
      recentCheckpoints: [],
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/x.ts" },
      ],
      education: { enabled: true, proficiency: "beginner" },
    });
    const cards = [...doc.querySelectorAll("article.cc-learn-essay-card")];
    assert.equal(cards.length, 5, "all 5 essays render (the curriculum is the directory)");
    assert.equal(
      cards[0].getAttribute("data-essay-anchor"),
      "learn.essay.scope-before-prompt",
      "scope-before-prompt should sort first because its trigger fires",
    );
    assert.equal(cards[0].getAttribute("data-relevant-now"), "true");
  });

  test("FX610 the curriculum directory shows all 5 essays even when an anchor is dismissed-for-nudge", () => {
    const doc = env.dom.window.document;
    // Pre-dismiss verify-output via the v2 sessionStorage key. The essay must
    // still render in the curriculum list; only the relevant-now badge is
    // suppressed (via the trigger gate in applyCaps).
    env.dom.window.sessionStorage.setItem(
      "fs-learn-nudge-dismissed:learn.essay.verify-output",
      "1",
    );
    new LearnRenderer("learn").render({
      activePlan: { phases: [] },
      education: { enabled: true, proficiency: "beginner" },
    });
    const all = doc.querySelectorAll("article.cc-learn-essay-card");
    assert.equal(all.length, 5, "curriculum list always shows all 5 essays");
    const verifyCard = doc.querySelector('[data-essay-anchor="learn.essay.verify-output"]');
    assert.ok(verifyCard, "the dismissed-for-nudge essay still appears in the directory");
    assert.equal(
      verifyCard!.getAttribute("data-relevant-now"),
      "false",
      "the dismissed-for-nudge essay does NOT carry the relevant-now badge",
    );
  });

  test("FX610 hidden (not-active) Learn tab does NOT consume the nudge budget; counts only land on the visible render", () => {
    // Fresh DOM where the #learn panel does NOT have `.active`.
    env.restore();
    env = setupDom(false);
    const hub = {
      activePlan: null,
      recentCheckpoints: [],
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/x.ts" },
      ],
      education: { enabled: true, proficiency: "beginner" },
    };
    const renderer = new LearnRenderer("learn");
    // Three hub ticks while the panel is hidden — should NOT consume budget.
    renderer.render(hub);
    renderer.render(hub);
    renderer.render(hub);
    assert.equal(
      env.dom.window.sessionStorage.getItem("fs-learn-nudge-count:learn.essay.scope-before-prompt"),
      null,
      "hidden Learn must not write nudge counts on hub ticks",
    );
    // Curriculum is pre-rendered so opening the tab is instant; no badges yet.
    const preCards = env.dom.window.document.querySelectorAll("article.cc-learn-essay-card");
    assert.equal(preCards.length, 5, "curriculum directory is pre-rendered while hidden");
    for (const card of preCards) {
      assert.equal(card.getAttribute("data-relevant-now"), "false");
    }
    // User clicks Learn → panel goes active → next render consumes one budget unit.
    env.dom.window.document.getElementById("learn")!.classList.add("active");
    renderer.render(hub);
    assert.equal(
      env.dom.window.sessionStorage.getItem("fs-learn-nudge-count:learn.essay.scope-before-prompt"),
      "1",
      "the first VISIBLE render increments the count exactly once",
    );
    const card = env.dom.window.document.querySelector(
      '[data-essay-anchor="learn.essay.scope-before-prompt"]',
    );
    assert.equal(card!.getAttribute("data-relevant-now"), "true");
  });

  test("FX610 disabled Learn does NOT consume the nudge budget (no triggers evaluated, no counts written)", () => {
    const hub = {
      activePlan: null,
      recentCheckpoints: [],
      unattributedFileActivity: [
        // Would fire scope-before-prompt if education were enabled.
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/x.ts" },
      ],
      education: { enabled: false, proficiency: "beginner" },
    };
    const renderer = new LearnRenderer("learn");
    renderer.render(hub);
    renderer.render(hub);
    renderer.render(hub);
    for (const anchor of [
      "learn.essay.scope-before-prompt",
      "learn.essay.acceptance-criteria",
      "learn.essay.choose-agent-option",
      "learn.essay.verify-output",
      "learn.essay.slow-down-to-speed-up",
    ]) {
      assert.equal(
        env.dom.window.sessionStorage.getItem(`fs-learn-nudge-count:${anchor}`),
        null,
        `disabled Learn must not write fs-learn-nudge-count:${anchor}`,
      );
    }
    assert.equal(
      env.dom.window.sessionStorage.getItem("fs-learn-session-start"),
      null,
      "disabled Learn must not seed the session-start timestamp",
    );
    // Re-enable: first scope-before-prompt fire MUST land the badge.
    renderer.render({ ...hub, education: { enabled: true, proficiency: "beginner" } });
    const card = env.dom.window.document.querySelector(
      '[data-essay-anchor="learn.essay.scope-before-prompt"]',
    );
    assert.equal(card!.getAttribute("data-relevant-now"), "true");
  });

  test("FX610 per-session nudge cap persists across renders (counts in sessionStorage)", () => {
    const doc = env.dom.window.document;
    const hub = {
      activePlan: null,
      recentCheckpoints: [],
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/x.ts" },
      ],
      education: { enabled: true, proficiency: "beginner" },
    };
    const renderer = new LearnRenderer("learn");
    // First render: scope fires → card carries the relevant-now badge.
    renderer.render(hub);
    const first = doc.querySelector('[data-essay-anchor="learn.essay.scope-before-prompt"]');
    assert.equal(first!.getAttribute("data-relevant-now"), "true", "scope fires on first render");
    // Second render with same conditions: per-anchor cap (1) saturated.
    renderer.render(hub);
    const second = doc.querySelector('[data-essay-anchor="learn.essay.scope-before-prompt"]');
    assert.equal(
      second!.getAttribute("data-relevant-now"),
      "false",
      "scope should NOT re-surface on the second render (per-anchor cap exhausted)",
    );
    const storedCount = env.dom.window.sessionStorage.getItem(
      "fs-learn-nudge-count:learn.essay.scope-before-prompt",
    );
    assert.ok(
      storedCount && parseInt(storedCount, 10) >= 1,
      "the per-anchor count is persisted to sessionStorage after the render",
    );
  });
});
