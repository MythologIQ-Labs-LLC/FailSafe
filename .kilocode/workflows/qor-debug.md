---
name: ql-debug
description: >
  Diagnostic Fixer
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-debug
description: Launch the QoreLogic Fixer agent for structured, surgical debugging that proves root cause before proposing any fix. Prevents the cascading damage typical of AI debugging (guess fix â†’ break something else â†’ chase new error â†’ repeat) by enforcing four mandatory analysis layers before any code change. Use when investigating failures, runtime errors, cascading bugs, non-deterministic behavior, or after significant code changes to formally verify logic integrity.
---

# /qor-debug - Diagnostic Fixer

<skill>
  <trigger>/qor-debug</trigger>
  <phase>IMPLEMENT / SUBSTANTIATE / GATE</phase>
  <persona>Fixer</persona>
  <agent>ql-fixer</agent>
  <output>Four-layer diagnosis with root-cause analysis and recommended fix</output>
</skill>

## Purpose

Bring surgical precision to debugging. AI coding agents typically pull a thread and watch the codebase unravel â€” guessing at fixes, introducing regressions, chasing cascading failures. The Fixer enforces a formal methodology: **prove the root cause first, then propose the minimal fix.** No code changes until the cause-effect chain is established with evidence.

## When to Use

- Runtime errors with unclear origin or misleading stack traces
- Non-deterministic failures (works sometimes, fails others)
- Cascading failures after refactoring
- Proactive verification after significant logic changes
- Test failures requiring formal root-cause analysis
- Structural defects blocking phase transitions

## Execution Protocol

### Step 1: Describe the Problem

Provide the Fixer with:

- **Symptom**: What is failing? Error message, unexpected behavior, test output.
- **Context**: What changed recently? Which files are involved?
- **Reproduction**: How to trigger the failure (if known).

If invoking proactively (no specific failure), state which files or logic paths were changed.

### Step 2: Agent Dispatch

The Fixer agent (`ql-fixer`) is launched and proceeds through four sequential layers:

1. **DIJKSTRA** â€” Static analysis: invariants, control flow, type soundness, concurrency hazards
2. **HAMMING/SHANNON** â€” Data integrity: flow tracing, entropy detection, boundary analysis, error propagation
3. **TURING/HOPPER** â€” Root-cause analysis: distributed tracing, hypothesis generation and elimination
4. **ZELLER** â€” Delta debugging: input minimization, state isolation, cause-effect chain proof

### Step 3: Diagnosis & Handoff

The Fixer produces a final diagnosis with:

- Root cause location and explanation
- Cause-effect chain
- Recommended fix with regression risk assessment
- Related issues discovered during analysis

**Handoff rules:**

- Straightforward fix: Fixer proposes exact code changes
- Architectural changes needed: hand off to `/qor-plan` for Governor review
- Implementation ready: hand off to `/qor-implement` for the Specialist
- Test validation needed: hand off to `/qor-substantiate` for the Judge

## Constraints

- **NEVER** apply a fix without completing at least Layers 1-3
- **NEVER** propose a fix that only addresses the symptom
- **ALWAYS** distinguish symptom from root cause
- **ALWAYS** check for similar patterns elsewhere in the codebase
- **ALWAYS** document findings with line numbers and evidence

## Integration with QoreLogic

This skill implements:

- **S.H.I.E.L.D. Diagnostic Service**: On-demand across IMPLEMENT, SUBSTANTIATE, and GATE phases
- **Four-Layer Architecture**: Formal reasoning methodology, not guesswork
- **Evidence-Based Fixes**: Every conclusion backed by code evidence
- **Cross-Agent Handoff**: Routes results to appropriate next agent/skill


