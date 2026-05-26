// FX606 — Learn tab host renderer (FailSafe Learn v2A multimode + Phase 3
// visual rebuild). jsdom functional test. Reference sub-view renamed to
// Glossary in plan-learn-tab-visual-rebuild Phase 3. The trigger-engine
// integration suite (FX610) lives in the sibling `learn-tab-triggers.test.ts`;
// jsdom setup helper in `learn-tab-helpers.ts`.

import { strict as assert } from "assert";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { LearnRenderer } from "../../roadmap/ui/modules/learn.js";
import { setupDom, type LearnTabTestEnv } from "./learn-tab-helpers";

suite("Learn tab host renderer (FX606 v2A + Phase 3)", () => {
  let env: LearnTabTestEnv;
  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("FX606 mounts TabGroup with [read, glossary] sub-views; Read is the default active sub-view", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      activePlan: { phases: [] },
      recentCheckpoints: [],
      unattributedFileActivity: [],
      education: { enabled: true, proficiency: "beginner" },
    });
    // TabGroup chrome must render: pill bar with 2 pills, content container.
    // (Practice was removed in plan-learn-tab-visual-rebuild Phase 1; a follow-up
    // plan for the "zoom-in evaluator" Practice surface will re-add a third pill.)
    const pillBar = doc.querySelector(".cc-subview-bar");
    assert.ok(pillBar, "TabGroup pill bar must render");
    const pills = pillBar!.querySelectorAll(".cc-pill");
    assert.equal(pills.length, 2, "exactly two pills: read + glossary");
    const keys = [...pills].map((p) => (p as Element).getAttribute("data-key"));
    assert.deepEqual(keys, ["read", "glossary"]);
    // Read is the default active sub-view.
    assert.ok(pills[0].classList.contains("active"), "Read pill is active by default");
    // The essay list (Read sub-view content) must be rendered.
    assert.ok(
      doc.querySelector("#cc-learn-essay-list"),
      "essay list (Read sub-view) must render on first mount",
    );
    // The Glossary sub-view content must NOT be rendered yet (only active mounts).
    assert.equal(
      doc.querySelectorAll("#cc-learn-glossary").length,
      0,
      "Glossary sub-view must NOT mount until its pill is activated",
    );
  });

  test("FX606 essay list is gated off when education is disabled (Learn container cleared)", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      education: { enabled: false, proficiency: "beginner" },
    });
    // Education disabled clears the entire Learn container — no TabGroup, no pills.
    assert.equal(
      doc.querySelectorAll("#cc-learn-essay-list").length,
      0,
      "essay list must be absent when education.enabled is false",
    );
    assert.equal(
      doc.querySelectorAll(".cc-subview-bar").length,
      0,
      "TabGroup pill bar must be absent when education.enabled is false",
    );
  });

  test("FX606 missing education config still renders Read by default", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      activePlan: { phases: [] },
      recentCheckpoints: [],
      unattributedFileActivity: [],
    });
    assert.ok(doc.querySelector("#cc-learn-essay-list"), "Read must not blank when education field is absent");
  });

  test("FX606 renders five essay cards when enabled (Read sub-view)", () => {
    const doc = env.dom.window.document;
    new LearnRenderer("learn").render({
      activePlan: { phases: [] },
      education: { enabled: true, proficiency: "beginner" },
    });
    const cards = doc.querySelectorAll("article.cc-learn-essay-card");
    assert.equal(cards.length, 5, "expected 5 essay cards on the Read sub-view");
  });

  test("FX606 switching to Glossary pill mounts Glossary renderer + tears down Read", () => {
    const doc = env.dom.window.document;
    const renderer = new LearnRenderer("learn");
    renderer.render({
      education: { enabled: true, proficiency: "beginner" },
    });
    assert.ok(doc.querySelector("#cc-learn-essay-list"), "Read sub-view mounted initially");
    // Click the Glossary pill.
    const glossaryPill = doc.querySelector('.cc-pill[data-key="glossary"]') as HTMLButtonElement | null;
    assert.ok(glossaryPill);
    glossaryPill!.click();
    // Glossary sub-view now mounted; Read sub-view content cleared by TabGroup
    // destroy-on-switch contract (tab-group.js:48-55).
    assert.ok(
      doc.querySelector("#cc-learn-glossary"),
      "Glossary sub-view mounted after pill click",
    );
    assert.equal(
      doc.querySelectorAll("#cc-learn-essay-list").length,
      0,
      "Read sub-view content cleared by destroy-on-switch",
    );
  });

  test("FX606 the Read sub-view consumes nudge budget; the Glossary sub-view does NOT", () => {
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
    renderer.render(hub);
    // First render lands the Read sub-view → scope-before-prompt fires → count=1.
    const afterRead = env.dom.window.sessionStorage.getItem(
      "fs-learn-nudge-count:learn.essay.scope-before-prompt",
    );
    assert.equal(afterRead, "1", "Read sub-view render consumes one nudge unit for scope-before-prompt");
    // Switch to Glossary + send another hub tick.
    const glossaryPill = doc.querySelector('.cc-pill[data-key="glossary"]') as HTMLButtonElement | null;
    glossaryPill!.click();
    renderer.render(hub);
    // Counter must NOT have advanced — Glossary sub-view does not run triggers.
    const afterGloss = env.dom.window.sessionStorage.getItem(
      "fs-learn-nudge-count:learn.essay.scope-before-prompt",
    );
    assert.equal(afterGloss, "1", "Glossary sub-view render must NOT consume nudge budget");
  });
});
