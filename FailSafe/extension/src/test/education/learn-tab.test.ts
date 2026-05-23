// FX606 — Learn tab host renderer (FailSafe Learn v2 host composition).
// jsdom functional test. Replaces the v3 Guided Dev Cycle composition tests.
// The trigger-engine integration suite (FX610) lives in the sibling
// `learn-tab-triggers.test.ts`; the jsdom setup helper lives in
// `learn-tab-helpers.ts`. Both splits hold the Section 4 razor.

import { strict as assert } from "assert";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { LearnRenderer } from "../../roadmap/ui/modules/learn.js";
import { setupDom, type LearnTabTestEnv } from "./learn-tab-helpers";

suite("Learn tab host renderer (FX606 v2)", () => {
  let env: LearnTabTestEnv;
  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("FX606 composes the essay list (primary) and the glossary (secondary)", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      activePlan: { phases: [] },
      recentCheckpoints: [],
      unattributedFileActivity: [],
      education: { enabled: true, proficiency: "beginner" },
    });
    assert.ok(
      doc.querySelector("#cc-learn-essay-list"),
      "essay list (primary content) must render",
    );
    assert.ok(
      doc.querySelector("details#cc-edu-glossary"),
      "FailSafe glossary (secondary reference) must render",
    );
  });

  test("FX606 the essay list is gated off when education is disabled", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      education: { enabled: false, proficiency: "beginner" },
    });
    assert.equal(
      doc.querySelectorAll("#cc-learn-essay-list").length,
      0,
      "essay list must be absent when education.enabled is false",
    );
    assert.equal(
      doc.querySelectorAll("details#cc-edu-glossary").length,
      0,
      "glossary must also be absent when education.enabled is false",
    );
  });

  test("FX606 renders five essay cards when enabled", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      activePlan: { phases: [] },
      education: { enabled: true, proficiency: "beginner" },
    });
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    assert.equal(cards.length, 5, "expected 5 essay cards on the Learn tab");
  });
});
