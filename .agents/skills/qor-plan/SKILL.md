---
name: ql-plan
description: >
  Simple Made Easy Planning
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-plan
description: Planning protocol following Rich Hickey's "Simple Made Easy" principles for creating implementation plans. Use when: (1) Designing complex features, (2) Planning multi-phase implementations, (3) Architecting new components, or (4) Any work requiring systematic planning before implementation.
---

# /qor-plan - Simple Made Easy Planning

<skill>
  <trigger>/qor-plan</trigger>
  <phase>PLAN</phase>
  <persona>Governor</persona>
  <output>plan-*.md file with incremental phases and unit test descriptions</output>
</skill>

## Purpose

Create implementation plans following Rich Hickey's "Simple Made Easy" principles. This skill focuses on objective simplicity over subjective ease, avoiding complecting, and favoring composable, declarative, value-oriented designs.

## Core Principles

### Choose SIMPLE over EASY

Strive for un-braided, composable designs that minimize incidental complexity. Judge a tool, abstraction, or pattern by long-term properties: clarity, changeability, and robustness. "Easy to start" is not sufficient.

### Detect Complecting

Whenever you join concerns (state & time, data & behavior, configuration & code...), pause and seek an alternative that keeps them independent. Favor composition (placing things side-by-side) over interleaving.

### Prefer Values, Resist State

Immutable data is default. Mutable state must be narrowly scoped, well-named, and justified.

### Assess by Artifacts

Judge designs by what they produce: clarity, changeability, and robustness. Measure decisions by how much braid they remove, not how quickly they compile.

### Declarative > Imperative

Describe WHAT, not HOW. Lean on data, configuration, queries, and rule systems where possible.

### Polymorphism a la Carte

Separate data definitions, behavior specifications, and their connections. Avoid inheritance hierarchies that entangle unrelated facets.

### Guard-rails Are Not Simplicity

Tests, static checks, and refactors are valuable, but cannot compensate for complex design. Seek to remove complexity first.

## Execution Protocol

### Step 0: Version Discovery (MANDATORY)

**Before any planning**, determine the next version number:

```bash
git tag --sort=-v:refname | head -1
```

Parse the current version (e.g., `v4.6.5`) and determine the next version based on change type:

| Change Type | Version Bump | Branch Prefix | Example |
|-------------|--------------|---------------|---------|
| Bug fix / hotfix | PATCH (x.y.Z+1) | `hotfix/` | v4.6.5 → v4.6.6 |
| New feature | MINOR (x.Y+1.0) | `feature/` | v4.6.5 → v4.7.0 |
| Breaking change | MAJOR (X+1.0.0) | `release/` | v4.6.5 → v5.0.0 |
| Plan only (no impl) | No bump | `plan/` | v4.6.5 (unchanged) |

**Record in plan header**:
```markdown
**Current Version**: v4.6.5
**Target Version**: v4.6.6
**Change Type**: hotfix
```

### Step 1: Understand Goals

Ask clarifying questions to understand what to accomplish. If requirements are unclear, ask specific questions rather than making assumptions.

### Step 2: Research Existing Code

Use existing code as foundation for plan. Identify:

- Existing abstractions and patterns
- Naming conventions
- Test structure
- Integration points

### Step 3: Create Plan File

Create plan markdown file with specific requirements:

#### Plan Structure

```markdown
# Plan: [feature/component name]

**Current Version**: v[X.Y.Z]
**Target Version**: v[X.Y.Z+1]
**Change Type**: [hotfix|feature|breaking]
**Risk Grade**: L[1-3]

## Open Questions

[List any open questions or edge cases requiring clarification]

## Phase 1: [Phase Name]

### Affected Files

- [file path 1] - [concise change summary]
- [file path 2] - [concise change summary]

### Changes

[Specific code changes, minimal prose]

### Unit Tests

- [test file path] - [what it tests, why important]
```

#### Plan Requirements

- **Specific code changes** - Describe concisely with minimal surrounding prose
- **Incremental phases** - 2-3 logical phases that stack on each other
- **Well-typed interfaces** - Self-documenting, self-consistent with surrounding code
- **Unit test descriptions** - Grouped with relevant phases
- **Affected files summary** - At top of each phase

### Step 3.5: Register Backlog Items

If plan introduces new features or components:

```
Read: docs/BACKLOG.md
Edit: docs/BACKLOG.md
```

Add planned work to Backlog section:
```markdown
- [ ] [B#] [Plan name]: [Phase summary] (plan-[slug].md)
```

Example:
```markdown
- [ ] [B5] ql-status enhancement: Backlog display (plan-ql-status-enhancement.md)
```

### Step 4: Avoid Common Pitfalls

**Do NOT include:**

- Exploration steps (grep for X, consult docs)
- Backwards compatibility concerns
- Feature gating or release plans
- Concluding errata (future considerations, next steps)

**DO include:**

- Complex logic unit test descriptions
- Open questions flagged at TOP of plan
- Refactoring required for clean abstractions

### Step 4.5: Plan Branch Creation & Commit

**Create Feature Branch**:
```bash
git checkout -b plan/[plan-slug]
```

**Stage Plan File**:
```bash
git add docs/Planning/plan-[slug].md
```

IF backlog was updated:
```bash
git add docs/BACKLOG.md
```

**Commit Plan**:
```bash
git commit -m "plan: [plan-slug] - [brief description]"
```

**Push Branch** (if remote available):
```bash
git push -u origin plan/[plan-slug]
```

REPORT: "Plan branch created and pushed: plan/[plan-slug]"

### Step 5: Review Plan

Before finalizing, ensure:

- [ ] Plan is precise and consistent with itself
- [ ] Follows "Simple Made Easy" principles
- [ ] Open questions are clearly flagged
- [ ] No backwards compatibility concerns
- [ ] No concluding errata sections

## Success Criteria

A reader unfamiliar with code should be able to:

- Locate a part without untangling others
- Understand the change without reading surrounding code
- Replace a part without breaking other parts
- See the complete scope of work

## Constraints

- **NEVER** worry about backwards compatibility (prefer streamlined, clean codebase)
- **NEVER** add concluding errata (future considerations belong in next plan)
- **NEVER** include exploration steps (do research before writing plan)
- **ALWAYS** flag open questions at TOP of plan
- **ALWAYS** group unit tests with relevant phases
- **ALWAYS** prioritize SIMPLE over EASY

## Integration with QoreLogic

This skill implements:

- **Simple Made Easy**: Objective simplicity over subjective ease
- **Complecting Detection**: Identifies and removes braided concerns
- **Value-Oriented Design**: Prefers immutable data and composable abstractions
- **Incremental Planning**: Phased approach with clear deliverables

## Output Format

```markdown
## Plan Complete

**Plan File**: plan-[slug].md
**Phases**: [count]
**Estimated Complexity**: [assessment]

### Next Steps

1. Review plan for completeness
2. Begin Phase 1 implementation
3. Run unit tests after each phase
4. Proceed to next phase only after tests pass

---

_Plan follows Simple Made Easy principles_
```

---

**Remember**: Simple is not easy. Choose designs that minimize incidental complexity and maximize clarity, changeability, and robustness over time.
