// FailSafe Educational Component — Phase 6: agentic-vocabulary glossary (2/2).
//
// RD-6 / RD-1: leaf data module — no runtime imports, no DOM. Carries the
// remaining six `'glossary'`-kind lesson literals so each content file stays
// under the Section-4 razor. See `glossary-content.ts` for part 1 + the full
// authoring conventions; `lessons.ts` concatenates both parts.

import type { Lesson } from "./lessons";

/** Agentic-vocabulary glossary, part 2 of 2. All `kind: 'glossary'`. */
export const GLOSSARY_LESSONS_B: Lesson[] = [
  {
    id: "glossary-shadow-genome",
    anchor: "glossary.shadow-genome",
    kind: "glossary",
    term: "Shadow Genome",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "The Shadow Genome is the behavioural fingerprint FailSafe builds " +
        "for an agent — a picture of how it normally works. With that " +
        "baseline, FailSafe can tell when an agent is acting unlike itself.",
      intermediate:
        "The Shadow Genome is a learned model of an agent's characteristic " +
        "behaviour. It gives anomaly detection a reference point: deviations " +
        "from the genome are what Sentinel flags. It describes patterns, it " +
        "does not score the operator.",
      advanced:
        "Shadow Genome = learned behavioural baseline per agent. Reference " +
        "for anomaly detection.",
    },
  },
  {
    id: "glossary-bicameral",
    anchor: "glossary.bicameral",
    kind: "glossary",
    term: "Bicameral",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Bicameral means \"two chambers\". FailSafe can split a decision " +
        "between two independent reviewers — one proposes, the other checks " +
        "— so no single voice waves something through unchecked.",
      intermediate:
        "A bicameral arrangement separates proposal from review: one " +
        "reasoning process suggests an action, a second independently " +
        "evaluates it. The separation reduces the chance a single flawed " +
        "judgement carries straight to effect.",
      advanced:
        "Bicameral = two-chamber separation of propose vs. review. " +
        "Independent second judgement.",
    },
  },
  {
    id: "glossary-receipt-verdict-evaluation",
    anchor: "glossary.receipt-verdict",
    kind: "glossary",
    term: "Receipt / verdict / evaluation",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "When FailSafe checks an action it produces three things: an " +
        "evaluation (the review it ran), a verdict (the allow/warn/block " +
        "outcome), and a receipt (the proof it all happened). The receipt is " +
        "your record after the fact.",
      intermediate:
        "Evaluation is the assessment process, verdict is its decision, and " +
        "the receipt is the durable artifact recording both. Together they " +
        "make a governance decision auditable — you can show what was " +
        "checked, what was decided, and that it occurred.",
      advanced:
        "Evaluation = the check. Verdict = the decision. Receipt = the " +
        "durable proof artifact.",
    },
  },
  {
    id: "glossary-enforcement-engine",
    anchor: "glossary.enforcement-engine",
    kind: "glossary",
    term: "Enforcement Engine",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "The Enforcement Engine is the part of FailSafe that actually acts " +
        "on a decision. Once a verdict says \"block\", the Enforcement " +
        "Engine is what makes the block real.",
      intermediate:
        "The Enforcement Engine carries a verdict into effect — it is where " +
        "a block stops being advice and starts being a barrier. In Observe " +
        "mode it only records; in Enforce mode it applies the verdict and " +
        "halts the action.",
      advanced:
        "Enforcement Engine = applies the verdict. Advice->barrier; " +
        "mode-gated effect.",
    },
  },
  {
    id: "glossary-shield",
    anchor: "glossary.shield",
    kind: "glossary",
    term: "SHIELD (lifecycle overview)",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "SHIELD is FailSafe's step-by-step way of working: Secure intent, " +
        "Hypothesize, Interrogate, Execute, Lock proof, Deliver. It walks a " +
        "change from idea to release with a checkpoint at each stage.",
      intermediate:
        "SHIELD is the governance lifecycle spine — plan, audit, implement, " +
        "substantiate, release — with each phase gating the next. It makes " +
        "progress visible and auditable instead of trusting that the work " +
        "simply got done.",
      advanced:
        "SHIELD = Secure / Hypothesize / Interrogate / Execute / Lock / " +
        "Deliver. Gated lifecycle spine.",
    },
  },
  {
    id: "glossary-agent",
    anchor: "glossary.agent",
    kind: "glossary",
    term: "Agent / agentic coding",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "An AI agent is software that can take actions on its own toward a " +
        "goal, not just answer questions. Agentic coding means letting such " +
        "an agent write, change, and run code. FailSafe is the governance " +
        "around that.",
      intermediate:
        "An agent plans and acts in a loop — deciding next steps, calling " +
        "tools, reacting to results. Agentic coding hands real authorship to " +
        "that loop, which is exactly why a governance layer between intent " +
        "and effect matters.",
      advanced:
        "Agent = goal-directed acting loop (plan->tool->observe). Agentic " +
        "coding = agent-authored code; governed.",
    },
  },
];
