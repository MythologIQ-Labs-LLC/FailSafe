---
name: ql-organize
description: >
  Adaptive Workspace Organization
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-organize
description: Adaptive workspace organization with isolation enforcement. Reads .qorelogic/workspace.json to enforce protected paths, isolation boundaries, and locked structures before proposing changes. Supports software repos, monorepos, and custom workspace architectures.
---

# /qor-organize - Adaptive Workspace Organization

<skill>
  <trigger>/qor-organize</trigger>
  <phase>ORGANIZE</phase>
  <persona>Governor</persona>
  <output>Context-aware reorganization proposal, optional execution, FILE_INDEX.md audit trail</output>
</skill>

## Purpose

Intelligently organize workspaces by **detecting project archetype**, **analyzing existing conventions**, and **proposing adaptive restructuring**.

## Core Philosophy

1. **Detect, Don't Assume** - Analyze before proposing
2. **Conventions Over Configuration** - Follow ecosystem standards
3. **Propose, Don't Prescribe** - User approves before execution
4. **🔒 ISOLATION MANDATORY** - Workspace directories and application source are NEVER reorganized without explicit logic

---

## ⛔ Phase -1: Workspace Isolation Enforcement

**CRITICAL: Before ANY organization, check for workspace-specific protection rules.**

```
Read: .qorelogic/workspace.json
```

### If workspace.json exists with `customStructure: true`:

Parse and enforce these fields:

```json
{
  "customStructure": true,
  "confidence": "locked",
  "lockedBy": "user-specification",

  "structure": {
    "workspaceRoot": "./",
    "appContainer": "[YourAppSourceDir]/",
    "isolation": {
      "workspace": [".agent/", ".Codex/", "docs/"],
      "app": ["[YourAppSourceDir]/"]
    }
  }
}
```

### Enforcement Logic:

1. **Load Isolation Boundaries** - Defines boundaries between workspace and application domains.
2. **Enforce neverReorganize** - Paths defined in workspace config are **ABSOLUTELY OFF-LIMITS**.
3. **Check Lock Status** - If `confidence: "locked"`, structure is immutable.

---

## Phase 0: Archetype Cache Check

**Before detection, check for established archetype:**
`Glob: .qorelogic/workspace.json`

---

## Phase 1: Workspace Detection

### Step 1.1: Scan for Archetype Indicators

Scan root for: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`, `.sln`, `pom.xml`, `.ipynb`, `mkdocs.yml`, `.Codex/`, `.qorelogic/`.

📖 **See**: `ql-organize-reference.md` for full indicator mapping.

---

## Phase 2: Convention Analysis

For the detected archetype, analyze how well the workspace follows conventions.

- **node-app**: Check `src/`, `test/`, `dist/`
- **python-package**: Check `src/[pkg]/`, `tests/`
- **ai-workspace**: Check `docs/`, `.agent/`, `META_LEDGER.md`

---

## Phase 3: Organization Proposal

Generate targeted proposals based on archetype deviations. Focus on **High Priority** (convention violations) first.

**STOP and ask user to confirm before executing.**

---

## Phase 4: Execution (After Approval)

1. **Create Movement Log**: Initialize tracking.
2. **Execute Changes**: Move files, create directories, verify destinations.
3. **Generate FILE_INDEX.md**: Create a permanent audit trail of movements.

---

## Phase 5: Privacy Configuration Review

### Step 5.1: Privacy Audit

Scan current `.gitignore` for standard AI governance patterns.

📖 **See**: `ql-organize-reference.md` for required privacy patterns.

### Step 5.2: Apply Privacy Updates

If missing required patterns, add them. Use `.failsafe/workspace-config.json` or `.qorelogic/config.json` to identify workspace-specific privacy requirements.

---

## Phase 6: Governance Document Location Audit

### Step 6.1: Verify `.failsafe/governance/` is canonical

All AI-generated governance artifacts MUST live under `.failsafe/governance/`:

```
.failsafe/governance/
├── AUDIT_REPORT.md       # Current gate verdict
├── RESEARCH_BRIEF.md     # Current research brief
├── IMPLEMENTATION_REPORT.md
└── plans/                # Active plan files

.failsafe/archive/
├── plans/                # Completed/historical plans
├── reports/              # Past audit & implementation reports
└── responses/            # Archived agent responses
```

### Step 6.2: Scan for misplaced governance artifacts

Check these locations for governance docs that should be in `.failsafe/`:

```
Glob: .agent/staging/AUDIT_REPORT.md
Glob: .agent/staging/RESEARCH_BRIEF.md
Glob: .agent/staging/IMPLEMENTATION_REPORT.md
Glob: .agent/staging/plan-*.md
```

If ANY governance artifacts are found outside `.failsafe/governance/`, flag as **HIGH PRIORITY** violation and propose migration.

### Step 6.3: Verify `.failsafe/` is gitignored

```
Grep: ".failsafe/" in .gitignore
```

If `.failsafe/` is NOT in `.gitignore`, flag as **CRITICAL** — governance artifacts must never reach public remotes.

### Step 6.4: Report

```markdown
### Governance Document Location Audit

| Check | Status |
|-------|--------|
| `.failsafe/governance/` exists | [OK/MISSING] |
| No governance docs in `.agent/staging/` | [OK/VIOLATION] |
| No governance docs in root directory | [OK/VIOLATION] |
| `.failsafe/` in `.gitignore` | [OK/MISSING] |
```

---

## Success Criteria

- [ ] Archetype correctly detected
- [ ] Proposals align with archetype conventions
- [ ] Isolation rules enforced (workspace config followed)
- [ ] All movements logged in `FILE_INDEX.md`
- [ ] Privacy configuration reviewed and verified
- [ ] Governance docs in `.failsafe/governance/` (not `.agent/staging/`)
- [ ] `.failsafe/` is gitignored

## Next Step

After organization completes, return to the phase that triggered it. If triggered standalone, run `/qor-status` to determine current lifecycle position.

---

_Organized using /qor-organize with Adaptive Archetype Detection_
