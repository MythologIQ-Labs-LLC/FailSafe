// FX614/FX609 — Phase 1 of plan-learn-tab-multimode-redesign:
// `Lesson.body` per-level accepts `SectionBlock[] | string`. This suite
// invokes the `isSectionBlockBody` type guard and the round-trip lesson
// resolution to confirm both body shapes work end-to-end. SG-035 acceptance
// question: every assertion invokes the unit and checks output (not just
// shape existence).

import { strict as assert } from "assert";
import { isSectionBlockBody } from "../../education/lesson-types";
import { getLesson, getLessonBody, LESSONS } from "../../education/lessons";

suite("Lesson.body sectioned-shape type guard + registry round-trip", () => {
  test("isSectionBlockBody returns true for a non-empty array of well-formed SectionBlocks", () => {
    const valid = [
      { heading: "h", paragraphs: ["p1"] },
      { heading: "h2", paragraphs: ["p2", "p3"], pullQuote: "quote" },
    ];
    assert.equal(isSectionBlockBody(valid), true);
  });

  test("isSectionBlockBody returns false for a single string body (legacy shape)", () => {
    assert.equal(isSectionBlockBody("legacy string body" as any), false);
  });

  test("isSectionBlockBody returns false for undefined", () => {
    assert.equal(isSectionBlockBody(undefined), false);
  });

  test("isSectionBlockBody returns false for an empty array", () => {
    assert.equal(isSectionBlockBody([]), false);
  });

  test("isSectionBlockBody returns false for an array with an empty heading", () => {
    assert.equal(isSectionBlockBody([{ heading: "", paragraphs: ["p"] }] as any), false);
    assert.equal(isSectionBlockBody([{ heading: "   ", paragraphs: ["p"] }] as any), false);
  });

  test("isSectionBlockBody returns false for an array with zero paragraphs", () => {
    assert.equal(isSectionBlockBody([{ heading: "h", paragraphs: [] }] as any), false);
  });

  test("isSectionBlockBody returns false when paragraphs contains non-string entries", () => {
    assert.equal(
      isSectionBlockBody([{ heading: "h", paragraphs: ["ok", 42] }] as any),
      false,
    );
  });

  test("getLessonBody round-trips a sectioned essay body (Phase 1 essay anchors)", () => {
    // All 5 Phase 1 essays are authored as SectionBlock[]; the sectioned-
    // aware accessor (`getLessonBody`) must return them as arrays. The
    // legacy `getLesson` flattens to a single string (covered separately).
    const anchors = [
      "learn.essay.slow-down-to-speed-up",
      "learn.essay.scope-before-prompt",
      "learn.essay.acceptance-criteria",
      "learn.essay.choose-agent-option",
      "learn.essay.verify-output",
    ];
    for (const anchor of anchors) {
      const body = getLessonBody(anchor, "beginner");
      assert.ok(body !== undefined, `lesson missing for anchor: ${anchor}`);
      assert.equal(
        isSectionBlockBody(body),
        true,
        `body for ${anchor} must be SectionBlock[] after Phase 1 sectioning`,
      );
    }
  });

  test("getLesson flattens a sectioned body to a paragraph-joined string", () => {
    const anchor = "learn.essay.slow-down-to-speed-up";
    const flat = getLesson(anchor, "beginner");
    assert.equal(typeof flat, "string", "getLesson must flatten sectioned to string");
    // The flattened string must include text from every section's paragraphs.
    const raw = getLessonBody(anchor, "beginner");
    assert.ok(isSectionBlockBody(raw));
    for (const section of raw as Array<{ heading: string; paragraphs: string[] }>) {
      for (const p of section.paragraphs) {
        assert.ok(flat!.includes(p), `flattened body must include paragraph from "${section.heading}"`);
      }
    }
  });

  test("getLesson still resolves legacy string bodies (v1 governance-moment lesson)", () => {
    // The sole carry-forward `'moment'` lesson is `governance-mode`
    // (the three `shield.*` literals were dropped in v5.2.1; see
    // src/education/lessons.ts header note).
    const body = getLesson("governance-mode", "beginner");
    assert.ok(body !== undefined);
    assert.equal(typeof body, "string", "v1 moment lessons remain string-bodied");
    // And `getLessonBody` returns the same string (not a SectionBlock[]).
    const raw = getLessonBody("governance-mode", "beginner");
    assert.equal(typeof raw, "string");
    assert.equal(isSectionBlockBody(raw), false);
  });

  test("Phase 1 essays declare pullQuote on their first section (operator-binding convention)", () => {
    const anchors = [
      "learn.essay.slow-down-to-speed-up",
      "learn.essay.scope-before-prompt",
      "learn.essay.acceptance-criteria",
      "learn.essay.choose-agent-option",
      "learn.essay.verify-output",
    ];
    for (const anchor of anchors) {
      const body = LESSONS[anchor].body.beginner;
      assert.ok(isSectionBlockBody(body), `${anchor} beginner body must be sectioned`);
      const sections = body as Array<{ heading: string; paragraphs: string[]; pullQuote?: string }>;
      assert.ok(sections.length >= 1, `${anchor} must have at least 1 section`);
      assert.ok(
        typeof sections[0].pullQuote === "string" && sections[0].pullQuote.trim().length > 0,
        `${anchor} first section must declare a pullQuote (the mantra sentence)`,
      );
    }
  });

  test("Phase 1 essays declare an icon (clock / target / checklist / fork / magnifier)", () => {
    const expected: Record<string, string> = {
      "learn.essay.slow-down-to-speed-up": "clock",
      "learn.essay.scope-before-prompt": "target",
      "learn.essay.acceptance-criteria": "checklist",
      "learn.essay.choose-agent-option": "fork",
      "learn.essay.verify-output": "magnifier",
    };
    for (const [anchor, icon] of Object.entries(expected)) {
      assert.equal(
        LESSONS[anchor].icon,
        icon,
        `${anchor} must declare icon=${icon} (operator-binding default per plan Open Question #1)`,
      );
    }
  });
});
