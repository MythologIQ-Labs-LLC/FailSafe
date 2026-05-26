// FX591 — Educational Component Phase 1: lesson registry well-formedness.
// SG-035: invoke the unit, assert on real output.

import { strict as assert } from "assert";
import {
  LESSONS,
  PROFICIENCY_LEVELS,
  getLesson,
  getLessonBody,
  isSectionBlockBody,
  type Lesson,
  type ProficiencyLevel,
} from "../../education/lessons";

const VALID_LEVELS = new Set<string>(PROFICIENCY_LEVELS);

// Phase 1 of plan-learn-tab-multimode-redesign extended `Lesson.body[level]`
// to `string | SectionBlock[]`. This helper accepts both shapes for the
// "non-empty body" assertion: strings must be non-empty after trim; sectioned
// bodies must pass the `isSectionBlockBody` guard (which requires at least
// one well-formed section with paragraphs).
function isNonEmptyBody(body: unknown): boolean {
  if (typeof body === "string") return body.trim().length > 0;
  return isSectionBlockBody(body as any);
}

suite("Education lessons registry (FX591)", () => {
  const lessons: Lesson[] = Object.values(LESSONS);

  test("FX591 registry is non-empty", () => {
    assert.ok(lessons.length > 0, "expected at least one lesson");
  });

  test("FX591 every lesson has non-empty id/anchor/term", () => {
    for (const lesson of lessons) {
      assert.ok(
        typeof lesson.id === "string" && lesson.id.trim().length > 0,
        `lesson missing id: ${JSON.stringify(lesson)}`,
      );
      assert.ok(
        typeof lesson.anchor === "string" && lesson.anchor.trim().length > 0,
        `lesson ${lesson.id} missing anchor`,
      );
      assert.ok(
        typeof lesson.term === "string" && lesson.term.trim().length > 0,
        `lesson ${lesson.id} missing term`,
      );
    }
  });

  test("FX591 every lesson has a non-empty body for each declared level", () => {
    // Phase 1 multimode redesign: body may be `string` (legacy) or
    // `SectionBlock[]` (sectioned essay). Both shapes satisfy non-empty.
    for (const lesson of lessons) {
      assert.ok(lesson.levels.length > 0, `lesson ${lesson.id} has no levels`);
      for (const level of lesson.levels) {
        const body = lesson.body[level];
        assert.ok(
          isNonEmptyBody(body),
          `lesson ${lesson.id} missing body for level ${level}`,
        );
      }
    }
  });

  test("FX591 anchors are unique", () => {
    const seen = new Set<string>();
    for (const lesson of lessons) {
      assert.ok(
        !seen.has(lesson.anchor),
        `duplicate anchor: ${lesson.anchor}`,
      );
      seen.add(lesson.anchor);
      // Registry key must equal the lesson's own anchor.
      assert.equal(LESSONS[lesson.anchor].id, lesson.id);
    }
  });

  test("FX591 every declared level is a valid proficiency level", () => {
    for (const lesson of lessons) {
      for (const level of lesson.levels) {
        assert.ok(
          VALID_LEVELS.has(level),
          `lesson ${lesson.id} declares invalid level ${level}`,
        );
      }
    }
  });

  test("FX591 getLesson returns the level-appropriate body (string-flattened)", () => {
    // Phase 1 multimode: `getLesson` flattens sectioned bodies to a single
    // paragraph-joined string so existing consumers keep a `string | undefined`
    // contract. For sectioned bodies, equality is against the flattened form;
    // for string bodies, equality is against the literal. `getLessonBody`
    // returns the raw shape for sectioned-aware callers.
    for (const lesson of lessons) {
      for (const level of lesson.levels) {
        const resolved = getLesson(lesson.anchor, level);
        const raw = lesson.body[level];
        if (typeof raw === "string") {
          assert.equal(resolved, raw, `getLesson(${lesson.anchor}, ${level}) mismatch`);
        } else if (isSectionBlockBody(raw)) {
          // Resolved must be a non-empty string containing every paragraph.
          assert.equal(typeof resolved, "string", `getLesson(${lesson.anchor}, ${level}) must flatten to string`);
          for (const section of raw) {
            for (const p of section.paragraphs) {
              assert.ok(
                resolved!.includes(p),
                `flattened body must include paragraph from section "${section.heading}"`,
              );
            }
          }
          // `getLessonBody` returns the raw sectioned shape.
          const rawBody = getLessonBody(lesson.anchor, level);
          assert.equal(isSectionBlockBody(rawBody), true, `getLessonBody(${lesson.anchor}, ${level}) must return SectionBlock[]`);
        }
      }
    }
  });

  test("FX591 getLesson returns undefined for an unknown anchor", () => {
    assert.equal(getLesson("no-such-anchor", "beginner"), undefined);
  });

  // --- v2 SWE-craft essay assertions (plan v4 Phase 1) ---

  const SWE_ESSAY_ANCHORS = [
    "learn.essay.slow-down-to-speed-up",
    "learn.essay.scope-before-prompt",
    "learn.essay.acceptance-criteria",
    "learn.essay.choose-agent-option",
    "learn.essay.verify-output",
  ];

  test("FX591 v2: the 5 SWE-craft essay anchors are present with all 3 tier bodies", () => {
    // Phase 1 multimode: bodies are SectionBlock[] (sectioned essay shape).
    for (const anchor of SWE_ESSAY_ANCHORS) {
      const lesson = LESSONS[anchor];
      assert.ok(lesson, `SWE-craft essay anchor missing from registry: ${anchor}`);
      const levels: ProficiencyLevel[] = ["beginner", "intermediate", "advanced"];
      for (const level of levels) {
        const body = lesson.body[level];
        assert.ok(
          isNonEmptyBody(body),
          `${anchor} missing tier body: ${level}`,
        );
      }
    }
  });

  test("FX591 v2: getLesson resolves each SWE-craft essay at each tier", () => {
    for (const anchor of SWE_ESSAY_ANCHORS) {
      assert.ok(getLesson(anchor, "beginner")!.length > 0, `${anchor} beginner body`);
      assert.ok(getLesson(anchor, "intermediate")!.length > 0, `${anchor} intermediate body`);
      assert.ok(getLesson(anchor, "advanced")!.length > 0, `${anchor} advanced body`);
    }
  });

  test("FX591 v2: v1 governance-moment anchors carry forward (Settings + Monitor depend on them)", () => {
    // Plan v4 §Anchor table marks governance-mode-card.js + monitor-render.js
    // SHIELD wiring as "carries unchanged" — they consume these anchors.
    const V1_CARRY_FORWARD = ["governance-mode", "shield.plan", "shield.audit", "shield.substantiate"];
    for (const anchor of V1_CARRY_FORWARD) {
      assert.ok(
        LESSONS[anchor],
        `v1 carry-forward anchor missing from registry: ${anchor}`,
      );
    }
  });

  test("FX591 getLesson falls back when the requested level is absent", () => {
    // Synthetic lesson with only an intermediate body — exercises the
    // documented fallback chain without depending on registry gaps.
    const partial: Lesson = {
      id: "fixture-partial",
      anchor: "fixture-partial",
      term: "Fixture",
      levels: ["intermediate"],
      body: { intermediate: "only-intermediate-body" },
    };
    LESSONS[partial.anchor] = partial;
    try {
      const levels: ProficiencyLevel[] = ["beginner", "intermediate", "advanced"];
      for (const level of levels) {
        assert.equal(
          getLesson(partial.anchor, level),
          "only-intermediate-body",
          `fallback failed for requested level ${level}`,
        );
      }
    } finally {
      delete LESSONS[partial.anchor];
    }
  });
});
