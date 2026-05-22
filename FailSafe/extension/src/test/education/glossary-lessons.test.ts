// FX599 — Educational Component Phase 6a/6b: glossary lesson class.
//
// Asserts the read-time `kind` default (audit A1), the `glossaryLessons()`
// selector returns exactly the `'glossary'`-kind entries, and every glossary
// lesson is well-formed. SG-035: invoke the unit, assert on real output.

import { strict as assert } from "assert";
import {
  LESSONS,
  PROFICIENCY_LEVELS,
  glossaryLessons,
  lessonKind,
  type Lesson,
} from "../../education/lessons";

const VALID_LEVELS = new Set<string>(PROFICIENCY_LEVELS);
const ALL_LEVELS: ReadonlyArray<string> = ["beginner", "intermediate", "advanced"];

suite("Education glossary lessons (FX599)", () => {
  const allLessons: Lesson[] = Object.values(LESSONS);
  const glossary: Lesson[] = glossaryLessons();

  test("FX599 A1 — the four 'moment' lessons OMIT the kind literal", () => {
    // A1: the existing literals must not have been edited to carry `kind`.
    for (const anchor of ["governance-mode", "shield.plan", "shield.audit", "shield.substantiate"]) {
      const lesson = LESSONS[anchor];
      assert.ok(lesson, `${anchor} present in registry`);
      assert.equal(
        lesson.kind,
        undefined,
        `${anchor} literal must omit kind (read-time default, not written)`,
      );
    }
  });

  test("FX599 A1 — kind defaults to 'moment' at read time", () => {
    // lessonKind() applies the `kind ?? 'moment'` default. A literal that
    // omits `kind` reads as 'moment'.
    for (const anchor of ["governance-mode", "shield.plan", "shield.audit", "shield.substantiate"]) {
      assert.equal(
        lessonKind(LESSONS[anchor]),
        "moment",
        `${anchor} must read-time-default to 'moment'`,
      );
    }
  });

  test("FX599 glossaryLessons() returns exactly the 'glossary'-kind entries", () => {
    const selectorIds = new Set(glossary.map((l) => l.id));
    const expectedIds = new Set(
      allLessons.filter((l) => l.kind === "glossary").map((l) => l.id),
    );
    assert.deepEqual(
      [...selectorIds].sort(),
      [...expectedIds].sort(),
      "selector output must equal the 'glossary'-kind registry subset",
    );
    // Nothing 'moment' leaks into the glossary selector.
    for (const lesson of glossary) {
      assert.equal(lessonKind(lesson), "glossary", `${lesson.id} must be glossary-kind`);
    }
  });

  test("FX599 the glossary is non-empty (~12 agentic-vocabulary terms)", () => {
    assert.ok(glossary.length >= 10, `expected >= 10 glossary lessons, got ${glossary.length}`);
  });

  test("FX599 every glossary lesson has non-empty id/anchor/term", () => {
    for (const lesson of glossary) {
      assert.ok(
        typeof lesson.id === "string" && lesson.id.trim().length > 0,
        `glossary lesson missing id: ${JSON.stringify(lesson)}`,
      );
      assert.ok(
        typeof lesson.anchor === "string" && lesson.anchor.startsWith("glossary."),
        `glossary lesson ${lesson.id} anchor must be a glossary.* key`,
      );
      assert.ok(
        typeof lesson.term === "string" && lesson.term.trim().length > 0,
        `glossary lesson ${lesson.id} missing term`,
      );
    }
  });

  test("FX599 every glossary lesson authors all three proficiency levels", () => {
    for (const lesson of glossary) {
      assert.deepEqual(
        [...lesson.levels].sort(),
        [...ALL_LEVELS].sort(),
        `glossary lesson ${lesson.id} must author all three levels`,
      );
      for (const level of lesson.levels) {
        assert.ok(VALID_LEVELS.has(level), `${lesson.id} declares invalid level ${level}`);
        const body = lesson.body[level];
        assert.ok(
          typeof body === "string" && body.trim().length > 0,
          `glossary lesson ${lesson.id} missing body for level ${level}`,
        );
      }
    }
  });

  test("FX599 glossary anchors are unique and registry-keyed", () => {
    const seen = new Set<string>();
    for (const lesson of glossary) {
      assert.ok(!seen.has(lesson.anchor), `duplicate glossary anchor: ${lesson.anchor}`);
      seen.add(lesson.anchor);
      assert.equal(
        LESSONS[lesson.anchor].id,
        lesson.id,
        `${lesson.anchor} must be keyed to its own lesson in LESSONS`,
      );
    }
  });

  test("FX599 the v1 agentic vocabulary is covered", () => {
    // The Phase 6b term set the plan calls for — assert each is present so a
    // dropped term is caught.
    const anchors = new Set(glossary.map((l) => l.anchor));
    const required = [
      "glossary.mcp-server",
      "glossary.governance-interceptor",
      "glossary.risk-tiers",
      "glossary.sentinel",
      "glossary.decision-drift",
      "glossary.ledger",
      "glossary.shadow-genome",
      "glossary.bicameral",
      "glossary.receipt-verdict",
      "glossary.enforcement-engine",
      "glossary.shield",
      "glossary.agent",
    ];
    for (const anchor of required) {
      assert.ok(anchors.has(anchor), `glossary must cover ${anchor}`);
    }
  });
});
