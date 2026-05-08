# SHIELD Lifecycle Workflow

The SHIELD lifecycle is FailSafe's physical governance workflow for AI-assisted development. It maps six phases to concrete actions, artifacts, and verifiable gates.

## Overview

```
S ── SECURE INTENT     →  /qor-bootstrap
H ── HYPOTHESIZE       →  /qor-plan
I ── INTERROGATE       →  /qor-audit
E ── EXECUTE           →  /qor-implement
L ── LOCK PROOF        →  /qor-substantiate
D ── DELIVER           →  /qor-release
```

Each phase produces specific artifacts and has entry/exit criteria. Skipping a phase or proceeding without a required gate is a governance violation.

## Phase Details

### S — SECURE INTENT (`/qor-bootstrap`)

**Purpose**: Seed project DNA. Document the Why, encode the architecture, initialize the Merkle chain.

**Actions**:
- Capture project purpose and constraints
- Initialize SOA Ledger with genesis block
- Create Q-DNA (project governance DNA) document
- Set up workspace governance directories
- Repository readiness check (Git initialization)

**Exit Criteria**: Genesis block written to ledger, Q-DNA documented.

### H — HYPOTHESIZE (`/qor-plan`)

**Purpose**: Create implementation blueprints with risk grades, file contracts, and Section 4 complexity limits.

**Actions**:
- Define implementation plan with risk grades for each artifact
- Assign file contracts (what changes, risk grade, approval requirement)
- Apply Section 4 Razor: max 40 lines/function, 250 lines/file, nesting ≤3
- Register backlog items
- Create plan branch (`plan/<slug>`)

**Exit Criteria**: Plan file written with risk-graded file contracts.

### I — INTERROGATE (`/qor-audit`)

**Purpose**: Adversarial tribunal. The Judge audits the plan for security, correctness, and drift.

**Actions**:
- Multi-pass audit: security, correctness, spec compliance, complexity
- Verify plan against Q-DNA and Core Axioms
- Check for drift from original intent
- Register blockers on VETO
- Repository governance audit (community files, branch policy)

**Exit Criteria**: **PASS** verdict (allows implementation) or **VETO** (return to HYPOTHESIZE).

> **Critical Rule**: Never implement without a PASS verdict from /qor-audit.

### E — EXECUTE (`/qor-implement`)

**Purpose**: Build under KISS constraints after a PASS verdict.

**Actions**:
- Implement changes per the audited plan
- Enforce Section 4 Razor at save-time via EnforcementEngine
- Record each change to the SOA Ledger
- Mark blockers complete as they are resolved
- Implementation staging

**Constraints**:
- Functions must be under 40 lines
- Files must be under 250 lines
- Nesting must not exceed 3 levels
- No `console.log` in production code

**Exit Criteria**: All plan items implemented, all blockers resolved.

### L — LOCK PROOF (`/qor-substantiate`)

**Purpose**: Verify Reality matches Promise. Cryptographically seal the session with Merkle hash verification.

**Actions**:
- Compare implementation against plan (reality vs. promise)
- Verify Merkle hash chain integrity
- Run blocker verification
- Record session seal to SOA Ledger
- Final staging and merge

**Exit Criteria**: Session sealed with valid Merkle hash, all checks pass.

> **Critical Rule**: Never release without a session seal from /qor-substantiate.

### D — DELIVER (`/qor-release`)

**Purpose**: Deploy, inspect packaged artifacts before publish, hand off with traceability, and monitor for operational drift.

**Actions**:
- Release preflight checks (VSIX validation, icon references, version sync)
- Inspect packaged artifacts
- Create release tag
- Deploy to marketplace
- Monitor for operational drift
- Record release to SOA Ledger

**Exit Criteria**: Artifact published, release tagged, ledger updated.

## Governance State Tracking

The SHIELD lifecycle is tracked through:

1. **META_LEDGER.md** — Workspace-level governance state document
2. **SOA Ledger** — Cryptographic audit trail of all governance events
3. **Monitor UI** — Real-time SHIELD phase progression display
4. **Command Center** — Governance tab with audit log, verdicts, and completions

## Workflow Rules

| Rule | Enforcement |
|------|-------------|
| Never implement without a PASS verdict | EnforcementEngine blocks saves |
| Never release without a session seal | Release pipeline gate |
| All L3 changes require mandatory audit | L3ApprovalService enforces SLA |
| Section 4 Razor applied at save-time | EnforcementEngine checks complexity |
| Branch-first, PR-first development | Branch policy validation |

## Event Types

The SOA Ledger records these SHIELD-related event types:

| Event | Phase | Description |
|-------|-------|-------------|
| `BOOTSTRAP_INITIATED` | S | Bootstrap started |
| `QDNA_SEALED` | S | Project DNA documented |
| `PLAN_CREATED` | H | Implementation plan written |
| `AUDIT_PASS` | I | Audit passed |
| `AUDIT_FAIL` | I | Audit failed (VETO) |
| `IMPLEMENTATION_STARTED` | E | Implementation begun |
| `SUBSTANTIATED` | L | Session sealed |
| `RELEASE_PUBLISHED` | D | Artifact published |

## Related Pages

- [[Governance Modes]] — How SHIELD interacts with governance mode settings
- [[QoreLogic Governance Layer]] — The engine that drives SHIELD
- [[Ledger & Checkpoints]] — How SHIELD phases are recorded
- [[Contributing Guide]] — SHIELD workflow for contributors
