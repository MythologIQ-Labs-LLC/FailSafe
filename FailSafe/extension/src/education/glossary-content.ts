// FailSafe Educational Component — Phase 6: agentic-vocabulary glossary (1/2).
//
// RD-6 / RD-1: leaf data module — no runtime imports, no DOM. Carries the
// first six `'glossary'`-kind lesson literals so each content file stays
// under the Section-4 razor. `lessons.ts` concatenates GLOSSARY_LESSONS_A +
// GLOSSARY_LESSONS_B into the registry.
//
// Glossary lessons explain the FailSafe / agentic-coding vocabulary a PM/CX
// builder genuinely hits. Bodies are definitional, concise, plain-language —
// beginner = "what & why", intermediate = how it fits, advanced = terse
// reminder. Tech-stack / general coding education stays OUT of scope.
// Wording is draft-quality and owned by the operator.

import type { Lesson } from "./lessons";

/** Agentic-vocabulary glossary, part 1 of 2. All `kind: 'glossary'`. */
export const GLOSSARY_LESSONS_A: Lesson[] = [
  {
    id: "glossary-mcp-server",
    anchor: "glossary.mcp-server",
    kind: "glossary",
    term: "MCP server",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "An MCP server is a small helper program an AI agent can call to do " +
        "real work — read files, run a tool, look something up. MCP (Model " +
        "Context Protocol) is just the shared language they use to talk. " +
        "FailSafe watches what flows through these servers.",
      intermediate:
        "MCP servers extend an agent beyond pure text generation by exposing " +
        "tools and resources over a standard protocol. Each server is a " +
        "capability boundary — what it offers is what the agent can do. " +
        "FailSafe governs the calls crossing that boundary.",
      advanced:
        "MCP server = protocol-standard tool/resource provider for agents. " +
        "Capability surface; governed call boundary.",
    },
  },
  {
    id: "glossary-governance-interceptor",
    anchor: "glossary.governance-interceptor",
    kind: "glossary",
    term: "Governance interceptor",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "The governance interceptor is the checkpoint an AI action passes " +
        "through before it happens. It looks at what the agent wants to do, " +
        "applies your rules, and decides whether to allow, warn, or stop it.",
      intermediate:
        "The interceptor sits in the path between an agent's intent and its " +
        "effect. It evaluates each action against policy, then permits, " +
        "flags, or blocks — turning governance from after-the-fact review " +
        "into in-the-moment control.",
      advanced:
        "Interceptor = inline policy checkpoint on the intent->effect path. " +
        "Allow / warn / block per action.",
    },
  },
  {
    id: "glossary-risk-tiers",
    anchor: "glossary.risk-tiers",
    kind: "glossary",
    term: "Risk tiers (L1-L3) & L3 approval",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "FailSafe sorts actions by how risky they are. L1 is low risk and " +
        "routine, L2 is moderate, and L3 is high risk — something that could " +
        "do real damage. L3 actions need your explicit approval before they " +
        "run.",
      intermediate:
        "Risk tiers grade each action so governance can be proportionate: " +
        "L1/L2 typically proceed with a record, while L3 triggers an " +
        "approval gate. Tiering keeps low-risk work fast and reserves human " +
        "review for what actually matters.",
      advanced:
        "L1 low / L2 moderate / L3 high. L3 = human approval gate. " +
        "Proportionate governance by tier.",
    },
  },
  {
    id: "glossary-sentinel",
    anchor: "glossary.sentinel",
    kind: "glossary",
    term: "Sentinel",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Sentinel is FailSafe's always-on watcher. It keeps an eye on agent " +
        "activity in the background and raises a flag when something looks " +
        "off, so you do not have to monitor every step yourself.",
      intermediate:
        "Sentinel is the continuous-monitoring layer — it observes agent " +
        "behaviour against expected patterns and surfaces anomalies. It is " +
        "detection, not enforcement: it tells you something is wrong; the " +
        "interceptor decides what to do about it.",
      advanced:
        "Sentinel = continuous anomaly-detection layer. Observes + flags; " +
        "does not enforce.",
    },
  },
  {
    id: "glossary-decision-drift",
    anchor: "glossary.decision-drift",
    kind: "glossary",
    term: "Decision drift",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "Decision drift is when an agent slowly strays from what you " +
        "actually asked for — each small step looks fine, but the work ends " +
        "up somewhere you never intended. FailSafe watches for that drift.",
      intermediate:
        "Decision drift is cumulative divergence between stated intent and " +
        "actual behaviour across a run. No single action trips a rule, yet " +
        "the trajectory leaves scope. Catching drift means comparing the " +
        "path taken against the plan, not just each step.",
      advanced:
        "Decision drift = cumulative intent-vs-behaviour divergence. " +
        "Trajectory check, not per-step.",
    },
  },
  {
    id: "glossary-ledger",
    anchor: "glossary.ledger",
    kind: "glossary",
    term: "The ledger (META_LEDGER / Merkle chain)",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner:
        "The ledger is FailSafe's tamper-evident record of governance " +
        "decisions. Every entry is linked to the one before it, so if anyone " +
        "edits history, the chain breaks and the change is obvious.",
      intermediate:
        "The META_LEDGER is a Merkle-chained decision log: each entry " +
        "carries a hash of the previous one, so the whole record is " +
        "verifiable. You cannot quietly rewrite a past decision — altering " +
        "any entry invalidates every entry after it.",
      advanced:
        "Ledger = Merkle-chained decision log. Hash-linked entries; edit " +
        "breaks chain integrity.",
    },
  },
];
