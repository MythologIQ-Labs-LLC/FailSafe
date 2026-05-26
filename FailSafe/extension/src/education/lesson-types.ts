// FailSafe Educational Component — Lesson type definitions (Section 4 razor split).
//
// RD-1: leaf type module — no runtime imports, no DOM. Extracted from
// `lessons.ts` (which was at the 249-line hard ceiling) to make room for
// the SectionBlock body-shape extension and the Phase 2A `domain` field
// without breaching the 250-line razor.
//
// The split mirrors the existing `lesson-anchor-coherence-helpers.ts`
// pattern from the test suite. `lessons.ts` re-exports `Lesson`,
// `ProficiencyLevel`, `LessonKind`, and `PROFICIENCY_LEVELS` from this
// file, so all existing callers (`glossary-content.ts`, `glossary-content-2.ts`,
// `lessons-content-swe-essays{,-2}.ts`, `educationConfig.ts`) continue to
// import from `./lessons` unchanged. The re-export is a type-only edge —
// no runtime cycle.

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
 * - `'glossary'` a Phase 6 agentic-vocabulary entry that mounts on the
 *                Learn-tab Reference sub-view (v2A: SWE + FailSafe domains).
 */
export type LessonKind = "moment" | "glossary";

/**
 * Glossary domain (Phase 2A). Optional; default `'failsafe'` applied at
 * registry-join time in `lessons.ts` for the legacy 12 entries that omit it.
 * - `'swe'`      general software-development vocabulary (new in Phase 2A).
 * - `'failsafe'` FailSafe / agentic-coding product vocabulary (v1 carry-forward).
 */
export type GlossaryDomain = "swe" | "failsafe";

/**
 * A single sectioned-essay block. Phase 1: essay bodies may be authored as
 * either a single `string` (legacy) or an array of `SectionBlock` (sectioned)
 * per proficiency level. The renderer (`learn-essay-list.js`) dispatches on
 * the body shape via `isSectionBlockBody`.
 * - `heading`     short H4-level heading (4-8 words).
 * - `paragraphs`  one or more body paragraphs (non-empty array; each ~60-120 words).
 * - `pullQuote`   OPTIONAL one-sentence callout rendered above the section's
 *                 paragraphs as a visually-distinct block. By convention, only
 *                 the first section in an essay declares a `pullQuote`.
 */
export interface SectionBlock {
  heading: string;
  paragraphs: string[];
  pullQuote?: string;
}

/**
 * A single micro-lesson.
 * - `id`     stable unique identifier (kebab-case).
 * - `anchor` stable key the lesson is mounted against. For `'moment'` lessons
 *            this is a governance-moment key (e.g. `governance-mode`,
 *            `shield.plan`); for `'glossary'` lessons it is a plain
 *            `glossary.<term>` key. Unique across LESSONS.
 * - `term`   the short human-readable label of the vocabulary being taught.
 * - `levels` the subset of proficiency levels this lesson authored a body for.
 * - `body`   per-level explanation. A level present in `levels` MUST have a
 *            corresponding non-empty body. Phase 1: each level may be either
 *            `string` (legacy single-paragraph) OR `SectionBlock[]` (sectioned
 *            essay). Renderer dispatches on shape via `isSectionBlockBody`.
 * - `kind`   OPTIONAL discriminator. Omitting it defaults to `'moment'` at
 *            read time in `lessonKind()`. The v1 lesson literals omit `kind`.
 * - `domain` OPTIONAL glossary domain (Phase 2A). Read-time default
 *            `'failsafe'` for `kind === 'glossary'` literals that omit it.
 *            Ignored on non-glossary lessons.
 * - `icon`   OPTIONAL icon registry key (Phase 1). Recognized values are
 *            defined in `learn-essay-list.js` (`clock` | `target` |
 *            `checklist` | `fork` | `magnifier`). Used only by sectioned
 *            essays; ignored elsewhere.
 */
export interface Lesson {
  id: string;
  anchor: string;
  term: string;
  levels: ProficiencyLevel[];
  body: Partial<Record<ProficiencyLevel, string | SectionBlock[]>>;
  kind?: LessonKind;
  domain?: GlossaryDomain;
  icon?: string;
}

/**
 * Type guard: does this body value carry the sectioned-essay shape?
 *
 * Returns true iff `value` is a non-empty array whose every element is a
 * SectionBlock-shaped object (`heading: string`, `paragraphs: string[]`).
 * Used by the renderer to dispatch on body shape. Returns false for legacy
 * `string` bodies, for `undefined`, and for malformed arrays (empty heading,
 * zero paragraphs).
 */
export function isSectionBlockBody(
  value: string | SectionBlock[] | undefined,
): value is SectionBlock[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const section of value) {
    if (!section || typeof section !== "object") return false;
    if (typeof section.heading !== "string" || section.heading.trim().length === 0) {
      return false;
    }
    if (!Array.isArray(section.paragraphs) || section.paragraphs.length === 0) {
      return false;
    }
    for (const p of section.paragraphs) {
      if (typeof p !== "string") return false;
    }
  }
  return true;
}
