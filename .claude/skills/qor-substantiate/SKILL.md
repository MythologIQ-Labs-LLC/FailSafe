---
name: ql-substantiate
description: >
  Session Seal
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-substantiate
description: S.H.I.E.L.D. Substantiation and Session Seal that verifies implementation against blueprint and cryptographically seals the session. Use when: (1) Implementation is complete, (2) Ready to verify Reality matches Promise, (3) Need to seal session with Merkle hash, or (4) Preparing to hand off completed work.
---

# /ql-substantiate - Session Seal

<skill>
  <trigger>/ql-substantiate</trigger>
  <phase>SUBSTANTIATE</phase>
  <persona>Judge</persona>
  <output>Updated META_LEDGER.md with final seal, SYSTEM_STATE.md snapshot</output>
</skill>

## Purpose

The final phase of the S.H.I.E.L.D. lifecycle. Verify that implementation matches the encoded blueprint (Reality = Promise), then cryptographically seal the session.

## Execution Protocol

### Step 1: Identity Activation
You are now operating as **The QoreLogic Judge** in substantiation mode.

Your role is to prove, not to improve. Verify what was built matches what was promised.

### Step 2: State Verification

```
Read: docs/META_LEDGER.md
Read: docs/ARCHITECTURE_PLAN.md
Read: .failsafe/governance/AUDIT_REPORT.md
```

**INTERDICTION**: If no PASS verdict exists:
```
ABORT
Report: "Cannot substantiate without PASS verdict. Run /ql-audit first."
```

**INTERDICTION**: If no implementation exists:
```
ABORT
Report: "No implementation found. Run /ql-implement first."
```

### Step 2.5: Version Validation (MANDATORY)

**Verify version consistency** between plan and current state:

```bash
git tag --sort=-v:refname | head -1
```

```
Read: Plan file (docs/Planning/plan-*.md or docs/ARCHITECTURE_PLAN.md)
Extract: Target Version from plan header
```

**INTERDICTION**: If Target Version ≤ Current Tag:
```
ABORT
Report: "Version mismatch: Target v[X.Y.Z] already shipped (current tag: v[A.B.C]).
         Bump version in plan before substantiating."
```

**INTERDICTION**: If SYSTEM_STATE.md or META_LEDGER.md reference wrong version:
```
PAUSE
Report: "Version drift detected in governance files.
         Expected: v[Target]
         Found: v[Wrong]
         Fix version references before sealing."
```

**Log validation**:
```
"Version validated: Current tag v[A.B.C] → Target v[X.Y.Z] (change type: [hotfix|feature|breaking])"
```

### Step 3: Reality Audit

Compare implementation against blueprint:

```
Read: All files in src/
Compare: Against docs/ARCHITECTURE_PLAN.md file tree
```

Template: `.claude/commands/references/ql-substantiate-templates.md`.

**Findings**:
- **MISSING**: Planned but not created -> FAIL
- **UNPLANNED**: Created but not in blueprint -> WARNING (document in ledger)
- **EXISTS**: Matches -> PASS

### Step 3.5: Blocker Verification

```
Read: docs/BACKLOG.md
```

Check for open Security Blockers:

```
IF any unchecked Security Blockers exist:
  WARNING: "Open security blockers detected. Consider addressing before seal."
  List: [unchecked S# items]
```

Check for open Development Blockers related to current implementation:

```
IF related Dev Blockers exist:
  WARNING: "Implementation may have unresolved blockers."
  List: [related D# items]
```

### Step 4: Functional Verification

#### Test Audit
```
Glob: tests/**/*.test.{ts,tsx,js}
Read: Test files
```

Template: `.claude/commands/references/ql-substantiate-templates.md`.

#### Visual Silence Verification (if frontend)
```
Grep: "color:" in src/**/*.{css,tsx}
Grep: "background:" in src/**/*.{css,tsx}
```

Check for violations:
Template: `.claude/commands/references/ql-substantiate-templates.md`.

#### Console.log Artifacts
```
Grep: "console.log" in src/**/*
```

Template: `.claude/commands/references/ql-substantiate-templates.md`.

### Step 4.5: Skill File Integrity Check

If any skill files (`.claude/commands/ql-*.md`) were modified during this session:

1. List modified skill files from git diff
2. For each modified skill:
   - Verify it still has required sections: `<skill>` block, `## Execution Protocol`, `## Constraints`, `## Next Step`
   - Verify the `## Next Step` section references valid successor skills
   - Log in ledger: "Skill file [name] modified — structure verified"

If any skill is missing required sections after modification:

```
PAUSE
Report: "Skill [name] missing required section: [section]. Fix before sealing."
```

### Step 4.6: Skill Admission Evidence Check (B49)

> Deferred — `validate-skill-admission.ps1` not yet implemented. This step is a no-op until `tools/reliability/` scripts are created.

### Step 4.7: Gate-to-Skill Matrix Evidence Check (B50)

> Deferred — `validate-gate-skill-matrix.ps1` not yet implemented. This step is a no-op until `tools/reliability/` scripts are created.

### Step 4.8: Reliability Integrity Gate

> Deferred — `validate-reliability-run.ps1` not yet implemented. This step is a no-op until `tools/reliability/` scripts are created.

### Step 5: Section 4 Razor Final Check

Template: `.claude/commands/references/ql-substantiate-templates.md`.

### Step 6: Sync System State

Map the final physical tree:

```
Glob: src/**/*
Glob: tests/**/*
Glob: docs/**/*
```

Create/Update `docs/SYSTEM_STATE.md`:

Template: `.claude/commands/references/ql-substantiate-templates.md`.

### Step 7: Final Merkle Seal

Calculate session seal:

Reference implementation: `.claude/commands/scripts/calculate-session-seal.py`.

Update `docs/META_LEDGER.md`:

Template: `.claude/commands/references/ql-substantiate-templates.md`.

### Step 8: Cleanup Staging

Clear: .failsafe/governance/

Preserve only the final AUDIT_REPORT.md (or archive it).

### Step 9: Final Report

Template: `.claude/commands/references/ql-substantiate-templates.md`.

### Step 9.5: Final Commit & Push

**Stage All Artifacts**:
```bash
git add docs/CONCEPT.md
git add docs/ARCHITECTURE_PLAN.md
git add docs/META_LEDGER.md
git add docs/SYSTEM_STATE.md
git add docs/BACKLOG.md
git add src/
```

**Commit Session Seal**:
```bash
git commit -m "seal: [plan-slug] - Session substantiated

Merkle seal: [chain-hash]
Verdict: PASS
Files: [file-count]"
```

**Push to Remote**:
```bash
git push origin [current-branch]
```

REPORT: "Session committed and pushed to [current-branch]"

### Step 9.6: Merge Options

PROMPT user:

```
Session sealed. Ready to complete workflow.

Options:
1. Merge to main (if on feature branch)
   git checkout main && git merge --no-ff [branch] -m "Merge [branch]: [summary]"

2. Create PR (if remote available)
   gh pr create --title "[summary]" --body "[from META_LEDGER decision]"

3. Skip (stay on branch)

Select option [1/2/3]:
```

IF option 1 (Merge):
```bash
git checkout main
git merge --no-ff [branch] -m "Merge [branch]: [summary]"
```

IF option 2 (Create PR):
```bash
gh pr create --title "[summary]" --body "[from META_LEDGER decision]"
```

**Tag Prompt** (if version changed in SYSTEM_STATE.md):
```
Version changed: [old] -> [new]
Create tag v[new_version]?

Options:
1. Yes - git tag -a v[X.Y.Z] -m "Release [X.Y.Z]"
2. No - skip tagging
```

IF yes:
```bash
git tag -a v[X.Y.Z] -m "Release [X.Y.Z]: [summary]"
```

REPORT: "Session sealed. [Action taken: merged/PR created/branch only]"

## Failure Scenarios

### If Reality != Promise:

Template: `.claude/commands/references/ql-substantiate-templates.md`.

## Constraints

- **NEVER** seal a session with Reality != Promise
- **NEVER** skip any verification step
- **NEVER** seal with Section 4 violations present
- **NEVER** seal with version mismatch (Target ≤ Current Tag)
- **ALWAYS** validate version before sealing
- **ALWAYS** update SYSTEM_STATE.md before sealing
- **ALWAYS** calculate proper chain hash
- **ALWAYS** document any unplanned files in ledger
- **ALWAYS** verify chain integrity before sealing
