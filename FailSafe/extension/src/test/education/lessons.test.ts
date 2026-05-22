// FX591 — Educational Component Phase 1: lesson registry well-formedness.
// SG-035: invoke the unit, assert on real output.

import { strict as assert } from "assert";
import {
  LESSONS,
  PROFICIENCY_LEVELS,
  getLesson,
  type Lesson,
  type ProficiencyLevel,
} from "../../education/lessons";

const VALID_LEVELS = new Set<string>(PROFICIENCY_LEVELS);

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
    for (const lesson of lessons) {
      assert.ok(lesson.levels.length > 0, `lesson ${lesson.id} has no levels`);
      for (const level of lesson.levels) {
        const body = lesson.body[level];
        assert.ok(
          typeof body === "string" && body.trim().length > 0,
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

  test("FX591 getLesson returns the level-appropriate body", () => {
    for (const lesson of lessons) {
      for (const level of lesson.levels) {
        const resolved = getLesson(lesson.anchor, level);
        assert.equal(
          resolved,
          lesson.body[level],
          `getLesson(${lesson.anchor}, ${level}) mismatch`,
        );
      }
    }
  });

  test("FX591 getLesson returns undefined for an unknown anchor", () => {
    assert.equal(getLesson("no-such-anchor", "beginner"), undefined);
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
