# RESEARCH BRIEF: Skill Lifecycle Management & QoreLogic Cohesion

**Date**: 2026-03-07
**Phase**: SECURE INTENT
**Author**: Strategist
**Topic**: Skill Lifecycle Management — next-step guidance, proactive suggestion, scaffolding, integrity protection, and overall skill suite cohesion

## Intent Statement

Audit the full QoreLogic skill suite for cohesion gaps, establish universal skill exit patterns (next-step guidance), define skill scaffolding at bootstrap, and leverage the existing skill registry for integrity protection against drift and hallucination.

## Problem Definition

The QoreLogic S.H.I.E.L.D. governance system has 27 unique skill files (19 commands, 7 agents, 3 persona duplicates) totaling 4,451 lines. While architecturally sound, the suite has accumulated inconsistencies that reduce operational reliability:

**Evidence of gaps:**

1. **6 skills BLOCKED on missing reference files**: `/ql-implement`, `/ql-refactor`, `/ql-substantiate`, `/ql-validate`, `/ql-organize`, `/ql-repo-scaffold` all reference template/example files in `.claude/commands/references/` and `.claude/commands/scripts/` that do not exist on disk.

2. **3 duplicate persona files**: `ql-governor-persona.md`, `ql-judge-persona.md`, `ql-specialist-persona.md` duplicate content already in `agents/ql-governor.md`, `agents/ql-judge.md`, `agents/ql-specialist.md` — creating maintenance drift risk.

3. **Inconsistent next-step guidance**: Only 10 of 19 command skills explicitly document their successor action. `/ql-status`, `/ql-help`, `/ql-compliance`, `/ql-validate` exit without routing the user.

4. **No skill scaffolding**: `/ql-bootstrap` creates governance docs (CONCEPT, ARCHITECTURE_PLAN, META_LEDGER, BACKLOG) but does NOT generate workspace-specific skills. Skills must be manually created or ingested.

5. **No proactive skill suggestion at runtime**: The extension's `skills.js` UI has `fetchRelevance(phase)` for phase-based ranking but no context-aware suggestion engine that detects "you should run /ql-research before /ql-plan here."

6. **Skill lifecycle incomplete beyond admission**: B49 (admission gate) and B50 (gate-to-skill matrix) are COMPLETE, but no policy exists for skill updates, deprecation, removal, or version migration.

## Current State Assessment

### What Exists

| Asset | Location | Purpose | Status |
|-------|----------|---------|--------|
| 19 command skills | `.claude/commands/ql-*.md` | SHIELD lifecycle phases | 13 READY, 6 BLOCKED |
| 7 agent specs | `.claude/commands/agents/ql-*.md` | Subagent specializations | All READY |
| 3 persona files | `.claude/commands/ql-*-persona.md` | Persona definitions | DUPLICATE of agents |
| Skill admission gate | `tools/reliability/admit-skill.ps1` | Entry gate for new skills | COMPLETE (B49) |
| Gate-to-skill matrix | `tools/reliability/gate-skill-matrix.json` | Maps gates to required capabilities | COMPLETE (B50) |
| Intent gate | `tools/reliability/validate-intent-gate.ps1` | User intent validation | COMPLETE (B51) |
| Skill registry | `.failsafe/skill-registry/*.json` | SHA1-based admission records with trust tiers | FUNCTIONAL (4 test entries) |
| Skill UI | `FailSafe/extension/src/roadmap/ui/modules/skills.js` | Discovery, browsing, auto/manual ingest | FUNCTIONAL |
| Skill discovery | `ConsoleServer.ts` lines 1590-2300 | Scans 8 skill root directories | FUNCTIONAL |
| Bootstrap command | `.claude/commands/ql-bootstrap.md` | Creates governance docs + Merkle genesis | COMPLETE |
| Reference files dir | `.claude/commands/references/` | Templates/patterns for skills | EXISTS but files MISSING |
| Scripts dir | `.claude/commands/scripts/` | Validation/calculation scripts | EXISTS but files MISSING |

### What Is Missing

| Gap | Impact | Severity |
|-----|--------|----------|
| 4 reference files (implement-patterns, refactor-examples, substantiate-templates, validate-reports) | 6 skills reference them but they don't exist; skills improvise without them | HIGH |
| 2 Python scripts (validate-ledger.py, calculate-session-seal.py) | Chain validation and seal calculation done manually | MEDIUM |
| Universal next-step exit pattern | Users don't know what to do after 9 of 19 skills complete | HIGH |
| Skill scaffolding at bootstrap | New workspaces have no project-specific skills generated | MEDIUM |
| Skill integrity hash tracking | Registry uses SHA1 path hashes but not content hashes; drift undetectable | HIGH |
| Proactive skill suggestion engine | Extension doesn't recommend skills based on context | MEDIUM |
| Skill update/deprecation policy | No mechanism to evolve or retire admitted skills | LOW |

### What Is Broken

The 3 persona files (`ql-governor-persona.md`, `ql-judge-persona.md`, `ql-specialist-persona.md`) overlap with agent files in `agents/`. The persona files are shorter (75-130 lines) than their agent counterparts (126-220 lines), creating ambiguity about which is authoritative. The agent files are more comprehensive and are the ones actually referenced by skills.

## Key Findings

### Finding 1: Reference File Gap Is the Highest-Priority Fix

6 of 19 command skills are marked BLOCKED because they reference template and pattern files that do not exist:

| Missing File | Referenced By | Purpose |
|-------------|-------------|---------|
| `references/ql-implement-patterns.md` | `/ql-implement` (Steps 5, 6, 7, 8, 10) | TDD-Light patterns, Section 4 checklist, code patterns, cleanup checklist, handoff template |
| `references/ql-refactor-examples.md` | `/ql-refactor` (multiple steps) | Refactoring examples and patterns |
| `references/ql-substantiate-templates.md` | `/ql-substantiate` (Steps 3-9) | Reality audit template, test audit, razor check, system state, seal, final report |
| `references/ql-validate-reports.md` | `/ql-validate` (Steps 5-7) | Validation report templates |
| `scripts/validate-ledger.py` | `/ql-validate` (Step 3) | Merkle chain validation logic |
| `scripts/calculate-session-seal.py` | `/ql-substantiate` (Step 7) | SHA256 session seal calculation |

**Impact**: These skills currently work because the executing agent (Claude) improvises the missing templates from context. But this makes outputs inconsistent across sessions and agents — exactly the drift problem FailSafe is designed to prevent.

**Recommendation**: Create all 6 missing files. The reference files should contain the templates currently inline in the skill definitions (extracted and deduplicated), and the scripts should formalize the hash calculations currently done ad-hoc in Python one-liners.

### Finding 2: Next-Step Guidance Pattern

Current state of next-step documentation across all 19 command skills:

| Skill | Has Next Step | Successor |
|-------|--------------|-----------|
| `/ql-research` | YES | `/ql-plan` with brief as input |
| `/ql-bootstrap` | YES | `/ql-audit` (L2/L3) or `/ql-implement` (L1) |
| `/ql-plan` | YES | "Review plan, begin Phase 1" |
| `/ql-audit` | YES | `/ql-implement` (PASS) or fix+resubmit (VETO) |
| `/ql-implement` | YES | `/ql-substantiate` handoff |
| `/ql-refactor` | YES | `/ql-substantiate` or continue |
| `/ql-substantiate` | YES | `/ql-repo-release` or new feature |
| `/ql-repo-release` | YES | Pipeline triggered, ledger updated |
| `/ql-debug` | YES | Return to calling phase |
| `/ql-repo-audit` | YES | `/ql-repo-scaffold` for remediation |
| `/ql-repo-scaffold` | YES | Commit + continue |
| `/ql-status` | NO | Should route to detected next command |
| `/ql-help` | NO | Reference only — acceptable |
| `/ql-compliance` | NO | Should route to remediation |
| `/ql-validate` | NO | Should route to fix action if chain broken |
| `/ql-organize` | NO | Should route to next phase |
| `/ql-governor-persona` | N/A | Persona definition, not executable |
| `/ql-judge-persona` | N/A | Persona definition, not executable |
| `/ql-specialist-persona` | N/A | Persona definition, not executable |

**Pattern to enforce**: Every executable skill must end with a `## Next Step` section that:
1. Names the successor skill explicitly
2. States the condition for proceeding (e.g., "if PASS, proceed to...")
3. Names the fallback action if the skill's output is negative

**Exception**: `/ql-help` is a reference lookup, not a workflow step — no successor needed.

### Finding 3: Skill Registry Already Has Integrity Infrastructure

The FailSafe extension has a functional skill registry with:

- **Three registry manifests**: `app-manifest.json` (canonical), `personal-manifest.json` (user), `registry.json` (legacy)
- **Trust tiers**: `verified`, `conditional`, `quarantined`
- **Runtime eligibility**: `allowed`, `blocked`
- **Admission pipeline**: `admit-skill.ps1` runs validation, creates registry entry
- **Path-based SHA1 IDs**: `SHA1(skillFilePath).slice(0, 12)`

**Gap**: The registry tracks skill *identity* (path hash) but not skill *content* (content hash). A skill file could be modified after admission and the registry would not detect the change.

**Recommendation**: Add content hash (SHA256 of file content) to registry entries. On skill load, compare current content hash against registered hash. If mismatch detected:
- In `observe` mode: log warning
- In `assist` mode: prompt user to re-admit or approve change
- In `enforce` mode: block execution until re-admitted

This extends the existing registry infrastructure — no new system needed.

### Finding 4: Skill Scaffolding Should Be Layered

Bootstrap currently creates governance docs but no skills. Skill scaffolding should be a separate concern from project bootstrapping, implemented as a layer:

**Layer 1 — Universal skills** (always created):
- `/ql-status` routing is always needed
- Release skill template (workspace-specific, based on detected project type)

**Layer 2 — Project-type detection** (conditional):
- Node.js project → npm-based release script, test runner patterns
- Python project → PyPI release, pytest patterns
- Rust project → cargo publish, cargo test patterns
- VS Code extension → vsce/ovsx patterns (like our `release-gate.cjs`)

**Layer 3 — User customization** (prompted):
- CI/CD provider (GitHub Actions, GitLab CI, etc.)
- Deployment targets (marketplace, registry, CDN)
- Confirmation gate preferences (strict vs relaxed)

**Implementation approach**: Add a `--scaffold-skills` flag to `/ql-bootstrap` that generates workspace-specific skill files based on detection + prompts, then registers them in the skill registry with content hashes.

### Finding 5: Proactive Skill Suggestion

The extension already has `fetchRelevance(phase)` in `skills.js` for phase-based ranking. Proactive suggestion needs two additional signals:

1. **Context signal**: What the user just did (e.g., finished editing ARCHITECTURE_PLAN.md → suggest `/ql-audit`)
2. **State signal**: What governance artifacts exist/are missing (e.g., no RESEARCH_BRIEF → suggest `/ql-research` before `/ql-plan`)

**Implementation approach**: The `/ql-status` skill already performs state detection (UNINITIALIZED → ALIGN/ENCODE → GATED → IMPLEMENTING → SUBSTANTIATING → SEALED). This same logic can power proactive suggestions in the extension UI:
- After file save → check if saved file is a governance artifact → suggest next skill
- After command completion → check lifecycle state → suggest successor
- On workspace open → run status check → suggest current phase skill

### Finding 6: Shadow Genome Patterns Relevant to Skill Integrity

Two shadow genome entries directly inform skill integrity design:

- **Entry #69 (BOOTSTRAP_ORDER_VIOLATION)**: Dependencies wired in wrong scope. For skills: a generated skill must not reference helpers/services that don't exist in the target workspace.
- **Entry #100 (Hallucinated Method)**: Plan referenced `CheckpointReconciler.revertToLatest()` which doesn't exist. For skills: generated skills must be validated against actual workspace capabilities before admission.

**Recommendation**: Skill scaffolding should include a validation pass that checks all referenced file paths, commands, and scripts exist in the target workspace before admitting the generated skill.

## Recommended Direction

### Approach: Three-Phase Skill Lifecycle Enhancement

**Phase 1 — Cohesion Repair** (immediate):
- Create 4 missing reference files + 2 missing scripts
- Consolidate 3 persona duplicates (delete persona files, keep agent files)
- Add `## Next Step` sections to 4 skills missing them (`/ql-status`, `/ql-compliance`, `/ql-validate`, `/ql-organize`)
- Fix `/ql-status` to suggest `/ql-research` in its routing logic when entering non-trivial features

**Phase 2 — Integrity Protection** (near-term):
- Add content hash (SHA256) to skill registry entries alongside existing path hash
- Implement drift detection: compare content hash on skill load
- Add skill hash verification to `/ql-substantiate` evidence checks
- Add skill registry verification to `/ql-repo-release` pre-flight

**Phase 3 — Scaffolding & Suggestion** (future):
- Add `--scaffold-skills` to `/ql-bootstrap` with project-type detection
- Implement proactive suggestion signals in extension UI
- Create skill template library for common project types

## Scope Boundaries

**In scope:**
- Missing reference file creation (4 files)
- Missing script creation (2 files)
- Persona duplicate consolidation (3 files)
- Next-step guidance pattern enforcement (4 skills)
- `/ql-status` routing enhancement (suggest `/ql-research`)
- Content hash addition to skill registry
- Drift detection mechanism design
- Skill scaffolding specification
- Proactive suggestion specification

**Out of scope:**
- Voice brainstorm blockers B111-B132 (separate track, already substantiated)
- Agent-specificity leakage refactoring (separate track from prior session)
- Extension UI redesign for skills browser
- Skill marketplace or sharing infrastructure
- Cross-workspace skill synchronization

## Success Criteria

1. All 19 command skills are READY (zero BLOCKED)
2. All executable skills have explicit `## Next Step` sections
3. No duplicate persona files exist
4. Skill registry entries include content hashes
5. Drift detection fires when a registered skill file is modified
6. `/ql-status` suggests `/ql-research` when appropriate
7. Skill scaffolding specification ready for implementation

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reference file content is improvised incorrectly | Medium | High | Extract from actual session transcripts where skills were executed successfully |
| Persona consolidation breaks skill loading | Low | Medium | Verify no skill references persona files directly (they reference agents/) |
| Content hash check creates false positives during development | Medium | Medium | Only enforce in `enforce` governance mode; warn in `assist` mode |
| Skill scaffolding generates invalid skills for unfamiliar project types | Medium | High | Validate generated skills against workspace before admission (Shadow Genome #100 pattern) |
| Proactive suggestions become annoying | Low | Low | Respect governance mode — only suggest in `assist`/`enforce`, silent in `observe` |

## Open Questions

1. Should the missing reference files contain full templates or just structural outlines that the executing agent fills in? (Full templates = more consistent but more rigid; outlines = more flexible but more drift-prone)
2. Should persona files be deleted entirely or converted to a different purpose (e.g., persona activation prompts for non-Claude agents)?
3. Should content hash verification be a hard block or a soft warning in the default governance mode?
4. What project types should skill scaffolding support in v1? (Node.js only, or also Python/Rust?)
