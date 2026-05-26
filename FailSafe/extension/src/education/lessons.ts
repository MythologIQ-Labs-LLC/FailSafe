// FailSafe Educational Component — lesson registry + accessors.
//
// RD-1: this is a leaf registry module — no DOM, no runtime-code imports
// beyond the sibling content modules (glossary-content*, lessons-content-swe-
// essays*). Type definitions live in `./lesson-types` (Section 4 razor split,
// Phase 1 of plan-learn-tab-multimode-redesign) and are re-exported below for
// existing-caller compatibility.
//
// Lessons are opt-in, dismissible, plain-language micro-explanations. They are
// NOT training content — no quizzes, no scoring, no blocking. Wording in
// sibling content files is draft-quality and is owned by the operator at the
// content-review gate.
//
// Registry composition:
//   (1) the v1 governance-moment lessons (LESSON_LIST below) — mount on the
//       Settings governance-mode card + Monitor SHIELD phase-tracker
//       (v1 carry-forward; NOT primary Learn-tab content).
//   (2) the v2 SWE-craft essays (SWE_ESSAY_LESSONS) — primary Learn-tab Read
//       sub-view content; anchor prefix `learn.essay.`.
//   (3) the Phase 6 + Phase 2A glossary lessons (GLOSSARY_LESSONS) — Learn-tab
//       Reference sub-view; anchor prefix `glossary.`. Phase 2A adds the
//       SWE-domain glossary; the legacy 12 FailSafe entries are tagged
//       `domain: 'failsafe'` at registry-join time (no per-entry edit churn).

import type { Lesson, LessonKind, ProficiencyLevel, GlossaryDomain, SectionBlock } from "./lesson-types";
import { PROFICIENCY_LEVELS, isSectionBlockBody } from "./lesson-types";
import { GLOSSARY_LESSONS } from "./glossary-aggregator";
import { SWE_ESSAY_LESSONS_A } from "./lessons-content-swe-essays";
import { SWE_ESSAY_LESSONS_B } from "./lessons-content-swe-essays-2";

// Re-export types for existing callers (`glossary-content*.ts`,
// `lessons-content-swe-essays*.ts`, `educationConfig.ts`) — type-only edge.
export type { Lesson, LessonKind, ProficiencyLevel, GlossaryDomain, SectionBlock };
export { PROFICIENCY_LEVELS, isSectionBlockBody };

/** FailSafe Learn v2 SWE-craft essays — Learn-tab primary content. */
const SWE_ESSAY_LESSONS: Lesson[] = [...SWE_ESSAY_LESSONS_A, ...SWE_ESSAY_LESSONS_B];

/**
 * v1 lesson content. Beginner = "what & why", intermediate = trade-offs,
 * advanced = terse reminder. All four anchors author every level so the
 * fallback below is exercised only on registry gaps, not by design.
 */
const LESSON_LIST: Lesson[] = [
  {
    id: "lesson-governance-mode",
    anchor: "governance-mode",
    term: "Governance Mode",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Governance mode decides how strict FailSafe is with AI agents. " +
        "Observe just watches and records what an agent does. Assist warns " +
        "you before something risky happens but still lets it through. " +
        "Enforce stops risky actions until you approve them. Start with " +
        "Observe to learn what your agents do, then tighten up when ready.",
      intermediate:
        "The three modes trade safety against momentum. Observe keeps a " +
        "full record with zero friction — best while you build trust. " +
        "Assist surfaces warnings so you can intervene without being " +
        "blocked. Enforce adds an approval gate: safer, but it interrupts " +
        "the agent. Match the mode to how much you currently trust the work.",
      advanced:
        "Observe = record-only. Assist = warn, non-blocking. Enforce = " +
        "block-until-approved. Raise the mode as trust drops.",
    },
  },
  // The three v1 SHIELD-phase lesson literals (`shield.plan`, `shield.audit`,
  // `shield.substantiate`) were removed in v5.2.1 — the v5.2.0 cycle stripped
  // the Monitor SHIELD lesson expander (operator: "What does this mean? looks
  // awful"), orphaning the entries. The Settings governance-mode card still
  // surfaces `governance-mode` above; the SHIELD anchors had no remaining
  // consumer, so the dead entries were dropped to keep the lesson-anchor
  // coherence check honest. To re-introduce SHIELD micro-lessons in a future
  // surface, re-add the literals here AND add a renderLesson() call (or
  // PHASE_LESSON_ANCHORS table) in the consuming module so the coherence test
  // can see the mount.
];

/**
 * Apply read-time defaults for glossary lessons that omit `domain`. Phase 2A
 * back-compat: the legacy 12 FailSafe-glossary entries do NOT declare
 * `domain: 'failsafe'`; this stamp is applied at registry-join so the SWE
 * filter in the Reference sub-view works uniformly.
 */
function withGlossaryDomainDefault(lesson: Lesson): Lesson {
  if (lesson.kind === "glossary" && !lesson.domain) {
    return { ...lesson, domain: "failsafe" };
  }
  return lesson;
}

/**
 * The lesson registry, keyed by stable `anchor`. Anchors are unique across
 * all groups.
 */
export const LESSONS: Record<string, Lesson> = [
  ...LESSON_LIST,
  ...SWE_ESSAY_LESSONS,
  ...GLOSSARY_LESSONS.map(withGlossaryDomainDefault),
].reduce(
  (acc, lesson) => {
    acc[lesson.anchor] = lesson;
    return acc;
  },
  {} as Record<string, Lesson>,
);

/**
 * Read-time `kind` normalization (audit A1). A lesson literal MAY omit `kind`
 * — the four v1 `'moment'` lessons do. The default is applied here, on read,
 * never written onto the literal.
 */
export function lessonKind(lesson: Lesson): LessonKind {
  return lesson.kind ?? "moment";
}

/**
 * The `'glossary'`-kind lessons — the Phase 6 + Phase 2A vocabulary entries
 * that mount on the Learn-tab Reference sub-view. Uses the read-time `kind ??
 * 'moment'` default, so a literal that omits `kind` is treated as `'moment'`
 * and is correctly excluded here.
 */
export function glossaryLessons(): Lesson[] {
  return Object.values(LESSONS).filter((l) => lessonKind(l) === "glossary");
}

/**
 * Resolve a lesson body for an `anchor` at a given proficiency `level` as a
 * single string. Sectioned bodies (`SectionBlock[]`) are flattened to a
 * paragraph-joined string so existing callers (governance + onboarding
 * surfaces, monitor lesson surfaces, lesson-fallback tests) keep a uniform
 * `string | undefined` contract.
 *
 * Sectioned-aware callers (the Learn-tab essay renderer) bypass this by
 * inspecting `lesson.body[level]` directly via `isSectionBlockBody`.
 *
 * Fallback policy:
 *  1. If no lesson exists for `anchor` → return `undefined`.
 *  2. If the lesson has a body for the requested `level` → return it.
 *  3. Otherwise fall back preferring simpler levels first.
 *  4. If the lesson has no authored body at all → return `undefined`.
 */
export function getLesson(anchor: string, level: ProficiencyLevel): string | undefined {
  const body = resolveBodyValue(anchor, level);
  return body === undefined ? undefined : flattenToString(body);
}

/**
 * Sectioned-aware accessor — returns the raw body value (`string` or
 * `SectionBlock[]`), or `undefined`. Used by the Learn-tab essay renderer
 * to dispatch on body shape.
 */
export function getLessonBody(
  anchor: string,
  level: ProficiencyLevel,
): string | SectionBlock[] | undefined {
  return resolveBodyValue(anchor, level);
}

function resolveBodyValue(
  anchor: string,
  level: ProficiencyLevel,
): string | SectionBlock[] | undefined {
  const lesson = LESSONS[anchor];
  if (!lesson) return undefined;
  const direct = lesson.body[level];
  if (hasBody(direct)) return direct;
  const order: ProficiencyLevel[] = [level, "beginner", "intermediate", "advanced"];
  for (const candidate of order) {
    const body = lesson.body[candidate];
    if (hasBody(body)) return body;
  }
  return undefined;
}

function hasBody(body: string | SectionBlock[] | undefined): boolean {
  if (typeof body === "string") return body.trim().length > 0;
  if (isSectionBlockBody(body)) return true;
  return false;
}

function flattenToString(body: string | SectionBlock[]): string {
  if (typeof body === "string") return body;
  return body.map((s) => s.paragraphs.join(" ")).join(" ");
}
