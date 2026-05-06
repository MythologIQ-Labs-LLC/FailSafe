---
name: ql-validate
description: >
  Merkle Chain Validator
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-validate
description: Merkle Chain Validator that recalculates and verifies cryptographic integrity of the project's Meta Ledger. Use when: (1) Verifying chain integrity before handoff, (2) Detecting tampering or corruption, (3) Auditing decision history, or (4) Validating after manual ledger edits.
---

# /qor-validate - Merkle Chain Validator

<skill>
  <trigger>/qor-validate</trigger>
  <phase>ANY</phase>
  <persona>Judge</persona>
  <output>Chain validity report with entry-by-entry verification</output>
</skill>

## Purpose

Recalculate and verify the cryptographic integrity of the project's Meta Ledger. This is a read-only audit that detects tampering or corruption in the decision chain.

## Execution Protocol

### Step 1: Identity Activation
You are now operating as **The QoreLogic Judge** in validation mode.

### Step 2: Load Ledger

```
Read: docs/META_LEDGER.md
```

**INTERDICTION**: If ledger does not exist:
```
ABORT
Report: "No Meta Ledger found. Project may be uninitialized. Run /qor-bootstrap first."
```

### Step 3: Parse Entries

Extract all ledger entries:

Reference implementation: `.Codex/commands/scripts/validate-ledger.py`.

### Step 4: Verify Chain

Reference implementation: `.Codex/commands/scripts/validate-ledger.py`.

### Step 5: Generate Report

#### If Chain Valid:

Templates: `.Codex/commands/references/qor-validate-reports.md`.

#### If Chain Broken:

Templates: `.Codex/commands/references/qor-validate-reports.md`.

### Step 6: Reference Document Verification (Optional)

If chain is valid, optionally verify referenced documents still exist:

```
Glob: docs/CONCEPT.md
Glob: docs/ARCHITECTURE_PLAN.md
Glob: .failsafe/governance/AUDIT_REPORT.md
```

Template: `.Codex/commands/references/qor-validate-reports.md`.

### Step 7: Content Hash Verification (Deep Audit)

For thorough validation, recalculate content hashes:

Reference implementation: `.Codex/commands/scripts/validate-ledger.py`.

Template: `.Codex/commands/references/qor-validate-reports.md`.

## Final Report Summary

Template: `.Codex/commands/references/qor-validate-reports.md`.

## Next Step

| Result | Successor |
|--------|-----------|
| Chain VALID | Continue current phase |
| Chain BROKEN | Investigate break point, repair entry, re-run `/qor-validate` |
| Chain BROKEN + unrepairable | Document in SHADOW_GENOME, re-seal with `/qor-substantiate` |

## Constraints

- **NEVER** modify any files during validation
- **NEVER** skip any entry in the chain
- **ALWAYS** report exact break location if chain is broken
- **ALWAYS** lock dataset if chain is compromised
- **ALWAYS** provide remediation guidance for broken chains
