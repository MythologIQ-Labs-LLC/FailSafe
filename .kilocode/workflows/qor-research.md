---
name: ql-research
description: >
  Secure Intent
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-research
description: Launch the QoreLogic Strategist agent to investigate a problem space, gather evidence, and produce a research brief before planning begins. Use when you need to understand what exists, evaluate feasibility, define user needs, assess competing approaches, or establish evidence-backed intent before the Governor architects a solution. This is the first step in any governed workflow â€” securing intent through investigation, not assumption.
---

# /qor-research - Secure Intent

<skill>
  <trigger>/qor-research</trigger>
  <phase>SECURE INTENT</phase>
  <persona>Strategist</persona>
  <agent>ql-strategist</agent>
  <output>.failsafe/governance/RESEARCH_BRIEF.md + META_LEDGER entry</output>
</skill>

## Purpose

Secure intent through evidence, not assumption. Before the Governor plans anything, the Strategist investigates the problem space: what exists, what's needed, what's been tried, what the constraints are. The output is a research brief that becomes the required input for `/qor-plan`.

## When to Use

- Before `/qor-plan` on any non-trivial feature
- When entering an unfamiliar area of the codebase
- When evaluating competing approaches or technologies
- When existing documentation doesn't answer the "what" and "why"
- When backlog items lack sufficient context to plan against
- When a previous attempt failed (check SHADOW_GENOME) and you need to understand why

## Execution Protocol

### Step 1: Define the Research Scope

Provide the Strategist with:

- **Topic**: What area or feature needs investigation
- **Trigger**: Why now? What prompted this research?
- **Key questions**: What specific unknowns need resolving?

If no specific questions are provided, the Strategist will derive them from the topic and current project state.

### Step 2: Agent Dispatch

Before investigating, check for prior research on this topic:

1. Read `docs/research/INDEX.md` (if it exists)
2. Scan for rows matching the current topic keywords
3. If a match exists, read the archived brief at `docs/research/{slug}.md`
4. Use prior findings as baseline â€” do not repeat resolved questions
5. Note in the new brief: "Builds on prior research: {slug} ({date})"

The Strategist agent (`ql-strategist`) investigates through:

1. **Codebase analysis** â€” read existing implementations, trace flows, assess current state
2. **Documentation review** â€” specs, backlog, shadow genome, changelogs
3. **External research** â€” standards, browser compat, library docs, competitive approaches
4. **Evidence synthesis** â€” findings table with sources, alternatives matrix, risk factors

### Step 3: Brief Delivery

The Strategist produces `.failsafe/governance/RESEARCH_BRIEF.md` containing:

- Intent statement (one sentence)
- Problem definition with evidence
- Current state assessment
- Key findings table
- Recommended direction with alternatives considered
- Explicit scope boundaries (in/out)
- Success criteria
- Risk factors
- Open questions for the Governor

### Step 4: Handoff

The brief is ledgered in META_LEDGER and handed to the Governor:

- **Clear direction** â†’ `/qor-plan` with the brief as input
- **No action needed** â†’ document why and close
- **More research needed** â†’ scope the next investigation

### Step 5: Archive the Brief

1. Create `docs/research/` directory if it doesn't exist
2. The brief is already in `.failsafe/governance/RESEARCH_BRIEF.md`
3. Append a row to `docs/research/INDEX.md`:
   `| {slug} | {date} | {title} | {outcome: plan-created / no-action / more-research} |`

## Constraints

- **NEVER** produce architecture plans â€” the brief informs the Governor, who plans
- **NEVER** declare intent without investigating current state first
- **NEVER** skip the evidence gathering step
- **ALWAYS** check SHADOW_GENOME for prior failures in the same area
- **ALWAYS** check BACKLOG for existing related items
- **ALWAYS** present alternatives even when one is clearly preferred
- **ALWAYS** ledger the research

## Integration with QoreLogic

This skill implements:

- **S.H.I.E.L.D. Secure Intent**: The "S" phase â€” research before architecture
- **Evidence-Based Intent**: No plan without a brief, no brief without evidence
- **Strategist Persona**: Product management + data analysis + logical reasoning
- **Governor Input Pipeline**: Research brief is the required input for `/qor-plan`


