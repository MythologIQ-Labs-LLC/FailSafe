// FailSafe Educational Component — Phase 1: lesson data model + v1 content.
//
// RD-1: this is a leaf data module — no DOM, no runtime-code imports beyond
// the sibling glossary-content modules (see RD-1 split below). It defines the
// `Lesson` shape, the `LESSONS` registry keyed by stable `anchor`, and a
// `getLesson` accessor with a documented level-fallback policy.
//
// Lessons are opt-in, dismissible, plain-language micro-explanations of
// FailSafe governance vocabulary. They are NOT training content — no
// quizzes, no scoring, no blocking. Wording here is draft-quality and is
// owned by the operator at the Phase 1 confirmation gate.
//
// RD-1 split: Phase 6's 12 glossary lesson literals live in the sibling
// content files `glossary-content.ts` (6) + `glossary-content-2.ts` (6) so
// every module stays under the Section-4 razor. Those files import only the
// `Lesson` TYPE from here (a type-only edge — no runtime cycle).

import { GLOSSARY_LESSONS_A } from "./glossary-content";
import { GLOSSARY_LESSONS_B } from "./glossary-content-2";

/** The full Phase 6 agentic-vocabulary glossary, both content parts joined. */
const GLOSSARY_LESSONS: Lesson[] = [...GLOSSARY_LESSONS_A, ...GLOSSARY_LESSONS_B];

/** Proficiency levels a lesson body can be authored for. */
export type ProficiencyLevel = "beginner" | "intermediate" | "advanced";

/** The set of valid proficiency levels — exported for validation/tests. */
export const PROFICIENCY_LEVELS: readonly ProficiencyLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
];

/**
 * The two lesson classes:
 * - `'moment'`   a micro-lesson mounted at a governance moment (the v1 four).
 * - `'glossary'` a Phase 6 agentic-vocabulary entry that mounts on the single
 *                Settings "FailSafe Glossary" surface, not at a moment.
 */
export type LessonKind = "moment" | "glossary";

/**
 * A single micro-lesson.
 * - `id`     stable unique identifier (kebab-case).
 * - `anchor` stable key the lesson is mounted against. For `'moment'` lessons
 *            this is a governance-moment key (e.g. `governance-mode`,
 *            `shield.plan`); for `'glossary'` lessons it is a plain
 *            `glossary.<term>` key. Unique across LESSONS.
 * - `term`   the short human-readable label of the vocabulary being taught.
 * - `levels` the subset of proficiency levels this lesson authored a body for.
 * - `body`   per-level plain-language explanation. A level present in
 *            `levels` MUST have a corresponding non-empty `body` entry.
 * - `kind`   OPTIONAL discriminator (audit A1). Omitting it means `'moment'`
 *            — the default is applied at READ TIME (`kind ?? 'moment'`) in the
 *            selectors below, NOT written onto the literals. The four v1
 *            lesson literals omit `kind` and are unaffected.
 */
export interface Lesson {
  id: string;
  anchor: string;
  term: string;
  levels: ProficiencyLevel[];
  body: Partial<Record<ProficiencyLevel, string>>;
  kind?: LessonKind;
}

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
  {
    id: "lesson-shield-plan",
    anchor: "shield.plan",
    term: "Plan (SHIELD)",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Plan is the first SHIELD phase. Before any code is written, you " +
        "write down what you intend to change and why. It turns a vague " +
        "idea into a checkable list, so everyone — including the AI — knows " +
        "what 'done' looks like.",
      intermediate:
        "Planning up front costs a little time but prevents scope drift " +
        "later. A clear plan gives the audit phase something concrete to " +
        "check against; a thin plan makes every later phase harder to " +
        "verify. Invest enough detail to make the work auditable.",
      advanced:
        "Plan = stated intent + scope, written before code. The audit " +
        "baseline. Thin plan = weak audit.",
    },
  },
  {
    id: "lesson-shield-audit",
    anchor: "shield.audit",
    term: "Audit (SHIELD)",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Audit is the SHIELD phase that reviews the plan before work " +
        "begins. It asks 'is this plan safe, complete, and sensible?' and " +
        "can send the plan back for changes. It catches problems while " +
        "they are still cheap to fix.",
      intermediate:
        "Audit is a gate, not a rubber stamp. A strict audit costs a " +
        "revision cycle now but avoids reworking shipped code later. A " +
        "lenient audit moves faster but lets risk through. The right " +
        "strictness depends on how much the change can break.",
      advanced:
        "Audit = pre-work review gate against the plan. Can VETO. Strict " +
        "now, cheap; lenient now, expensive later.",
    },
  },
  {
    id: "lesson-shield-substantiate",
    anchor: "shield.substantiate",
    term: "Substantiate (SHIELD)",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Substantiate is the SHIELD phase where you prove the work is " +
        "actually done. Instead of trusting a claim, you collect evidence " +
        "— passing tests, checks, results — that shows the change works " +
        "as promised.",
      intermediate:
        "Substantiation closes the gap between 'I think it works' and 'it " +
        "is shown to work'. Gathering evidence takes effort, but a claim " +
        "without proof is just a claim. The depth of evidence should match " +
        "the risk of the change.",
      advanced:
        "Substantiate = evidence that the claim holds (tests, checks). No " +
        "proof = not done. Depth scales with risk.",
    },
  },
];

/**
 * The lesson registry, keyed by stable `anchor`. Holds both the four
 * `'moment'` lessons (above) and the Phase 6 `'glossary'` lessons (folded in
 * from `glossary-content.ts`). Anchors are unique across BOTH classes —
 * governance-moment keys never collide with `glossary.*` keys.
 */
export const LESSONS: Record<string, Lesson> = [
  ...LESSON_LIST,
  ...GLOSSARY_LESSONS,
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
 * The `'glossary'`-kind lessons — the Phase 6 agentic-vocabulary entries that
 * mount on the single Settings "FailSafe Glossary" surface. Uses the read-
 * time `kind ?? 'moment'` default, so a literal that omits `kind` is treated
 * as a `'moment'` lesson and is correctly excluded here.
 */
export function glossaryLessons(): Lesson[] {
  return Object.values(LESSONS).filter((l) => lessonKind(l) === "glossary");
}

/**
 * Resolve a lesson body for an `anchor` at a given proficiency `level`.
 *
 * Fallback policy (documented):
 *  1. If no lesson exists for `anchor` → return `undefined`.
 *  2. If the lesson has a body for the requested `level` → return it.
 *  3. Otherwise fall back along the chain advanced→intermediate→beginner
 *     and beginner→intermediate→advanced, preferring the simpler level
 *     first, then the next-available authored body.
 *  4. If the lesson somehow has no authored body at all → return `undefined`.
 *
 * The fallback guarantees that as long as a lesson authored ANY level, an
 * operator at any proficiency still sees an explanation.
 */
export function getLesson(
  anchor: string,
  level: ProficiencyLevel,
): string | undefined {
  const lesson = LESSONS[anchor];
  if (!lesson) return undefined;

  const direct = lesson.body[level];
  if (direct && direct.trim().length > 0) return direct;

  // Preference order: requested level first, then simplest-available.
  const order: ProficiencyLevel[] = [level, "beginner", "intermediate", "advanced"];
  for (const candidate of order) {
    const body = lesson.body[candidate];
    if (body && body.trim().length > 0) return body;
  }
  return undefined;
}
