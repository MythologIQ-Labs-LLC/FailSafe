// FailSafe Educational Component — SWE-craft essay content (Part B — essays 4-5).
//
// Sibling content module to lessons.ts (mirrors the glossary-content-*.ts split
// pattern). Type-only edge: imports the Lesson type from lessons.ts; lessons.ts
// imports SWE_ESSAY_LESSONS_B from here.
//
// Source of truth for the prose: `.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md`
// (Phase 0 of plan-qor-failsafe-learn-swe-craft.md). All body wording is DRAFT —
// operator review gate per the v1 lesson-wording-review pattern.

import type { Lesson } from "./lessons";

/** SWE-craft essays Part B — anchor prefix `learn.essay.`. */
export const SWE_ESSAY_LESSONS_B: Lesson[] = [
  {
    id: "essay-choose-agent-option",
    anchor: "learn.essay.choose-agent-option",
    term: "Choosing between agent suggestions",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "The agent wants to be helpful. Helpful is not the same as correct. " +
        "When you have a choice, the choice itself is information — which " +
        "option has the smallest cost if it is wrong? That is almost always " +
        "the option to pick. Use the six-question table on this card to " +
        "compare options: which is smallest, which touches the fewest files, " +
        "which adds dependencies or config, which can you verify clearly, " +
        "which can you explain back, which is easiest to reverse. If you " +
        "cannot answer all six for an option, ask the agent for two simpler " +
        "ones.",
      intermediate:
        "When the agent gives only one option, your job is to ask for two " +
        "more. 'What are two simpler ways to do this?' is the most " +
        "undervalued prompt in AI-assisted coding. The act of forcing the " +
        "agent to enumerate alternatives is what surfaces blast-radius " +
        "information you would never see from one over-confident path.",
      advanced:
        "In product reviews you already do this — 'what are the tradeoffs?' " +
        "Bring it to code. Confidence is a tone, not a signal. Three options " +
        "and a tradeoff table is the answer to 'is this right?'",
    },
  },
  {
    id: "essay-verify-output",
    anchor: "learn.essay.verify-output",
    term: "Verify before you believe",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Generated code is a claim. The agent says 'this fixes it.' Until you " +
        "verify, that claim is unproven. The cheapest professional habit you " +
        "can adopt is a six-step verification loop, and the cheapest place to " +
        "install it is before you trust an agent's output. Read the diff " +
        "first. Not skim — read. Every file. Every change. If anything was " +
        "changed that you did not ask for, that is your first signal. Stop " +
        "and ask the agent why. Then run it. Then run whatever tests exist. " +
        "Then reproduce the original problem — confirm it is gone. Then think " +
        "about one edge case the prompt did not mention. Empty input. The " +
        "other tenant. The page-reload-in-the-middle case. Anything. When the " +
        "change is risky, end with one more prompt: 'What could go wrong with " +
        "this change? What did you not test?' The agent will often surface " +
        "real risks if you give it permission to.",
      intermediate:
        "Validation is not optional, but it is also not infinite. Calibrate " +
        "effort to reversibility. A throwaway script gets minutes of " +
        "validation; a payments change gets days. The verification loop stays " +
        "the same; the depth varies.",
      advanced:
        "You already enforce evidence over claims in product. Same move, " +
        "smaller surface. Diff-read literacy is the one technical skill worth " +
        "investing in; everything else compounds from it.",
    },
  },
];
