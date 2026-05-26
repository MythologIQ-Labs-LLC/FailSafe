// FailSafe Educational Component — SWE-craft essay content (Part A — essays 1-3).
//
// Sibling content module to lessons.ts (mirrors the glossary-content-*.ts split
// pattern). Type-only edge: imports the Lesson type from lessons.ts (which
// re-exports it from lesson-types.ts); lessons.ts imports SWE_ESSAY_LESSONS_A
// from here.
//
// Phase 1 of plan-learn-tab-multimode-redesign: essay bodies are authored as
// `SectionBlock[]` per proficiency level. Each essay's first section declares
// the `pullQuote` (the mantra sentence) — rendered as a visually-distinct
// callout above the first section's paragraphs. The renderer dispatches on
// body shape via `isSectionBlockBody`; legacy single-string bodies still
// render via the fallback single-section path.
//
// Source of truth for the prose: `.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md`
// (Phase 0 of plan-qor-failsafe-learn-swe-craft.md). All body wording is DRAFT —
// operator review gate per the v1 lesson-wording-review pattern. Templates
// (acceptance-criteria, option-evaluation) are rendered separately by
// learn-essay-list.js, not in these body literals.
//
// Icon assignments (plan Open Question #1, operator may reassign at implement):
//   slow-down-to-speed-up → clock; scope-before-prompt → target;
//   acceptance-criteria  → checklist (4-5 in -2.ts: fork; magnifier).

import type { Lesson } from "./lessons";

/** SWE-craft essays mounted on the Learn-tab Read sub-view (anchor prefix `learn.essay.`). */
export const SWE_ESSAY_LESSONS_A: Lesson[] = [
  {
    id: "essay-slow-down-to-speed-up",
    anchor: "learn.essay.slow-down-to-speed-up",
    term: "Slow down to speed up",
    icon: "clock",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: [
        {
          heading: "The speed trap",
          pullQuote: "Speed is a trap.",
          paragraphs: [
            "When you work with an AI coding agent, speed feels free. You type, code appears, things compile, you keep going. That speed is a trap.",
            "Most of the time you lose is not at the keyboard — it is later, when you cannot tell whether the code is right, when you have changed too many things at once to know which broke, when you cannot explain what you built.",
          ],
        },
        {
          heading: "Scope before each prompt",
          paragraphs: [
            "The cheapest move in software is to slow down at the start. Take thirty seconds before each prompt and write down — out loud, in your notes, anywhere — what you are about to change and why. That is scope.",
            "'Add a date picker to the booking form, default to today' is enough. If you cannot write that sentence, you are not ready to prompt yet.",
          ],
        },
        {
          heading: "Checkpoint discipline",
          paragraphs: [
            "Build the habit of stopping. Every twenty or thirty minutes, commit what you have, pause, and ask: can I summarize what I just did in one sentence? If yes, keep going. If no, stop — open the diff, read it, understand it.",
            "The minute you spend understanding now is the hour you don't spend untangling later.",
          ],
        },
      ],
      intermediate: [
        {
          heading: "Steering, not stopping",
          pullQuote: "The pace mistake is assuming an agent lets you skip the boring parts.",
          paragraphs: [
            "You already get code out of an agent. The question is whether you can steer. The pace mistake at this level is not absence of planning; it is the assumption that having an agent means you can skip the boring parts. You cannot.",
            "Scope, checkpoint, summarize — these are the boring parts, and they are also the difference between a session that ships and a session that has to be unwound.",
          ],
        },
        {
          heading: "Calibrate by reversibility",
          paragraphs: [
            "The trade-off: every minute spent slowing down has to earn its place. Don't write a five-page plan for a one-line change. The signal is reversibility — how hard is it to undo what you are about to do?",
            "If the answer is trivial, go fast. If the answer is 'I would have to rewrite this whole module,' that is the moment to slow down.",
          ],
        },
      ],
      advanced: [
        {
          heading: "Same discipline, smaller granularity",
          pullQuote: "Reversibility and blast radius are the only two questions that matter.",
          paragraphs: [
            "You already pace yourself in product work — you don't ship a feature without acceptance criteria, you don't promise a quarter without scope. Engineering is the same discipline at smaller granularity.",
            "Reversibility and blast radius are the only two questions that matter; the rest is hygiene.",
          ],
        },
      ],
    },
  },
  {
    id: "essay-scope-before-prompt",
    anchor: "learn.essay.scope-before-prompt",
    term: "Scope before prompt",
    icon: "target",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: [
        {
          heading: "What scope is",
          pullQuote: "Scope is the smallest useful change you can make.",
          paragraphs: [
            "Scope is the smallest useful change you can make. Smallest matters: you can always do another small change next. Useful matters too — a change that fixes nothing visible has no scope; you are tinkering.",
          ],
        },
        {
          heading: "The scope sentence",
          paragraphs: [
            "A good scope sentence has three parts: what is changing, for whom, so that what. 'Change the booking form to default the date to today, so the user does not have to click the picker.'",
            "Notice it does not say 'rewrite the booking form' or 'improve the booking flow.' Those are themes, not scope.",
          ],
        },
        {
          heading: "Patch, refactor, rewrite",
          paragraphs: [
            "A patch changes behavior without changing structure (fix a calculation). A refactor changes structure without changing behavior (split a function). A rewrite changes both — the most expensive option; earn the right to rewrite by trying a patch first.",
            "Pick one before you prompt. If you don't know which, you are not ready to scope yet.",
          ],
        },
      ],
      intermediate: [
        {
          heading: "Diff matches sentence",
          pullQuote: "The agent does what the prompt suggests; vague prompts get bloated diffs.",
          paragraphs: [
            "The signal you have scoped well is that the diff matches your sentence. When the diff is bigger than the sentence implied, two things may be true: the agent overreached, or your sentence was vague.",
            "Either way, the response is the same — revise the sentence, then re-prompt against it. The agent does what the prompt suggests; vague prompts get bloated diffs.",
          ],
        },
      ],
      advanced: [
        {
          heading: "PM-grade scope at file resolution",
          pullQuote: "Engineering scope is the same conversation at higher resolution.",
          paragraphs: [
            "A PM-grade scope discipline ports cleanly: smallest releasable unit, define done before you start, isolate risk. Engineering scope is the same conversation at higher resolution — files instead of features. Treat it the same way.",
          ],
        },
      ],
    },
  },
  {
    id: "essay-acceptance-criteria",
    anchor: "learn.essay.acceptance-criteria",
    term: "Acceptance criteria before code",
    icon: "checklist",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: [
        {
          heading: "Done is a definition",
          pullQuote: "Done is a definition, not a feeling.",
          paragraphs: [
            "Done is a definition, not a feeling. The reason agent-built code falls over is that 'looks like it works' is a feeling — yours, fresh, biased toward the path you just tested.",
            "Done is a list of observable conditions that anyone (including future-you) can check.",
          ],
        },
        {
          heading: "The template",
          paragraphs: [
            "Use the template visible on this card, every time. The non-goal line matters as much as the goal lines: 'It is done when the form submits AND the email field is unchanged' — that prevents the agent from 'improving' the email field while it was in the neighborhood.",
            "Keep the criteria visible while you work; check them at the end.",
          ],
        },
      ],
      intermediate: [
        {
          heading: "Tests as executable criteria",
          pullQuote: "The criteria are the only defense against bugs the prompt never asked about.",
          paragraphs: [
            "Tests are the executable form of acceptance criteria. You don't need them for every change, but you need some form of verification, and the template forces you to name it before the code exists.",
            "The most common AI-assisted bug class is one the original prompt never asked about — the criteria are the only defense against that.",
          ],
        },
      ],
      advanced: [
        {
          heading: "The PM gate, turned on yourself",
          pullQuote: "What's the acceptance test? Apply it to your own code.",
          paragraphs: [
            "This is the same gate you already enforce on PMs — what's the acceptance test? Apply it to your own code. The smaller the change, the more important the explicit criteria, because nothing else is documenting your intent.",
          ],
        },
      ],
    },
  },
];
