---
name: ql-status
description: >
  Quick Lifecycle Check
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-status
description: /qor-status - Lifecycle Diagnostic
---

# /qor-status - Quick Lifecycle Check

<skill>
  <trigger>/qor-status</trigger>
  <phase>ANY</phase>
  <persona>Governor</persona>
  <output>Compact status with stage and next action</output>
</skill>

## Purpose

Quick, low-token diagnostic of project health. Read-minimal by design.

## Execution (Decision Tree)

### Step 1: Existence Checks Only

```
Glob: docs/META_LEDGER.md     -> has_ledger
Glob: docs/ARCHITECTURE_PLAN.md -> has_plan
Glob: .failsafe/governance/AUDIT_REPORT.md -> has_audit
```

**Do NOT read file contents yet.**

### Step 2: Determine State

```
IF !has_ledger:
  STATE = "UNINITIALIZED"
  NEXT = "/qor-bootstrap (first-time workspace setup only)"
  DONE (output immediately)

IF !has_plan AND user describes a new feature:
  STATE = "SECURE INTENT"
  NEXT = "/qor-research to investigate before planning"
  DONE

IF !has_plan:
  STATE = "ALIGN/ENCODE"
  NEXT = "/qor-research (non-trivial) or /qor-plan (straightforward)"
  DONE

IF !has_audit:
  # Only now read first 15 lines for Risk Grade
  Read: docs/ARCHITECTURE_PLAN.md (limit: 15)
  Extract: "Risk Grade: L[1-3]"

  IF L2 or L3:
    STATE = "GATED"
    NEXT = "/qor-audit"
  ELSE:
    STATE = "READY"
    NEXT = "/qor-implement"
  DONE

IF has_audit:
  # Read first 10 lines for verdict
  Read: .failsafe/governance/AUDIT_REPORT.md (limit: 10)

  IF contains "PASS":
    STATE = "IMPLEMENTING"
    NEXT = "Continue work, /qor-plan for new feature, or /qor-substantiate when done"
  ELSE IF contains "VETO":
    STATE = "BLOCKED"
    NEXT = "Address audit findings, re-run /qor-audit"
  DONE
```

### Step 2.5: Backlog Check

```
Glob: docs/BACKLOG.md -> has_backlog

IF has_backlog:
  Read: docs/BACKLOG.md (limit: 50)
  Extract: Unchecked items by category
  Count: security_blockers, dev_blockers, backlog, wishlist
```

### Important: New Feature vs New Workspace

| Scenario | Command | Description |
|----------|---------|-------------|
| **New workspace** (no META_LEDGER) | `/qor-bootstrap` | Initialize DNA, CONCEPT, ARCHITECTURE_PLAN, META_LEDGER |
| **New feature** (workspace exists) | `/qor-plan` | Create plan-*.md with phases, affected files, tests |
| **Resume work** (audit exists) | Continue or `/qor-status` | Check current state and next action |

**Note**: `/qor-bootstrap` is for **workspace initialization only**. For planning new features in an existing workspace, use `/qor-plan`.

### Step 3: Chain Spot-Check (Optional)

Only if user requests integrity check:
```
Read: docs/META_LEDGER.md (last 30 lines only via offset)
Check: Last entry has SHA256 hash format
Report: "Chain: OK" or "Chain: Verify with /qor-validate"
```

Full verification deferred to `/qor-validate`.

### Step 4: Output

```markdown
## Status: [STATE]

| Check | Result |
|-------|--------|
| Ledger | [exists/missing] |
| Plan | [exists/missing] |
| Audit | [PASS/VETO/pending] |
| Chain | [OK/unverified] |

### Outstanding Items

| Category | Count | Next Priority |
|----------|-------|---------------|
| Security Blockers | [n] | [first unchecked S#] |
| Dev Blockers | [n] | [first unchecked D#] |
| Backlog | [n] | [first unchecked B#] |
| Wishlist | [n] | (deferred) |

**Next**: [NEXT]
```

## Token Budget

- Skill load: ~1.5KB
- Max additional reads: <3KB
- Target total: <5KB context impact

## Constraints

- **NEVER** load persona files (identity is implicit)
- **NEVER** read entire files when partial suffices
- **NEVER** enumerate src/**/*
- **ALWAYS** use existence checks before content reads
- **ALWAYS** stop at first determination (short-circuit)

## Next Step

Status always routes to the detected next action:

| State | Successor |
|-------|-----------|
| UNINITIALIZED | `/qor-bootstrap` |
| SECURE INTENT | `/qor-research` |
| ALIGN/ENCODE | `/qor-research` (non-trivial) or `/qor-plan` (straightforward) |
| GATED | `/qor-audit` |
| IMPLEMENTING | `/qor-implement` or `/qor-substantiate` |
| BLOCKED | Fix violations, re-run `/qor-audit` |
| SEALED | `/qor-repo-release` or start new feature with `/qor-research` |

---
_Full verification: /qor-validate | Full details: ask for expanded status_
