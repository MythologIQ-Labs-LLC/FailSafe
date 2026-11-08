# Plan: v6.0.12 governance continuation (#467 remediation path, G4, release seal)

**2026-11-08 applicability correction:** This is the original 2026-11-06 conditional plan, preserved for traceability. Subsequent exhaustive recovery found neither the October operator-local #610–#612 VETO artifacts nor event `7126134e`. Accordingly, Steps 2–4 below cannot be assumed executable for #467; in particular, reviewing the unrelated August `remediate.json` would not close October #467. The newer, **unadopted** forward-only proposal is `plan-467-unrecoverable-veto-forward-recovery.md`. It keeps those events UNKNOWN/UNRESOLVED, requires distinct prospective technical audit and dated sole-owner authorization (not a second vote), and rejects any retroactive pre-implementation PASS. D4's solo-maintainer correction is explicit owner direction; active `GOVERNANCE.md` has not yet been amended. No release gate is waived.

**Issues:** #467 (P0), #463 (P0), #475 (P0); AGENTS.md SHIELD lifecycle.

**Plan author:** native qualification session, 2026-11-06.

**Status:** **DECISION RECORD AND PROPOSAL ONLY.** Nothing here is an audit, a PASS, a seal or an authorization. No ledger entry was written, and no historical entry was changed.

## Rules that bind this plan

- **AGENTS.md:** "Never implement without a PASS verdict from /qor-audit; never release without a session seal from /qor-substantiate."
- **Frozen qor-logic 0.176.1 `/qor-remediate`** (`qor/skills/sdlc/qor-remediate/SKILL.md`):
  - It carries `qor:governance-health-exempt`, so it may run on DAMAGED or INCOMPLETE state.
  - It produces **only** a process proposal (`skill | agent | gate | doctrine`), never code.
  - It writes `.qor/gates/<sid>/remediate.json` and sets matched shadow events to `addressed_pending: true`.
  - **Step 6** (the flip to `addressed: true`) runs only inside an **operator-explicit** `/qor-audit reviews-remediate:<path>` that reaches PASS, with a valid `closure_enforcer`.
- **#467 record (2026-10-20/21):**
  - The three VETOs are **parked operator-local `/qor-audit` VETOs numbered #610–#612**. They are not the committed main entries of the same numbers, which are a v6.0.6 PASS, implementation and seal.
  - "No fourth ordinary plan/audit loop."
  - Remediation must use preserved, hash-verified local artifacts.

## Current state (verified 2026-11-06 on `497c0821`)

- **Native integrity:** `governance-health` 8/8 OK; `verify-ledger --post-anchor` clean at #382; `check-ledger-anchor` exit 0. The external-record cross-check against the v6.0.11 tag and #467 comment 6513152200 is 8/8. Receipts are in `qualification/v6.0.12-rc-497c0821/governance/`.
- **Ledger:** `docs/META_LEDGER.md` is byte-identical to v6.0.11; its last entry is #914. **No v6.0.12 change has an audit PASS or a substantiate seal.**
- **Native prose coverage:** native verification does not hash entry prose. A copy with #900's Verdict PASS→VETO, or its Decision text rewritten, still verifies clean.
- **Shadow genome (committed):** 7 groups not yet `addressed`.
  - A read-only dry run of `/qor-remediate` Steps 1–3, on a disposable copy, left the file hash unchanged. It produced **one** proposal: `repeated-veto-pattern → doctrine` for event `ce7c36d8…` (already `addressed_pending: true`).
- **Missing #467 inputs:** the #467-specific local-only event `7126134e` and the parked #610–#612 VETO artifacts are **not present on this machine** or in the repository. `.qor/gates` here ends in September.

## Determination: the exact permitted continuation

1. **Preserve inputs first (no governance authority needed; read-only).**
   - Locate the operator-local machine that holds the parked VETO artifacts, the `7126134e` event, the original ledger/config snapshot and the installed skills.
   - Produce a sha256 manifest of each, stored outside the repository. Anything not found is listed as UNKNOWN.
2. **Run native `/qor-remediate` there**, under its documented health exemption, with the verified 0.176.1 wheel (`dd6eec66…`).
   - Output: a real `remediate.json` citing event ids, with each proposal declaring a `closure_enforcer`.
   - Events stay `addressed_pending`. **This step is permitted without a new audit.** It must not edit the ledger, plans or code.
   - If `7126134e` cannot be produced, the remediation covers only the committed events (today: one doctrine proposal). The #610–#612 history is then recorded as **UNKNOWN, not remediated**.
3. **Close the remediation loop:** one **owner-authorized** `/qor-audit reviews-remediate:.qor/gates/<sid>/remediate.json`.
   - It reviews the remediation proposal only.
   - It is the review the skill's Step 6 requires, not an ordinary plan audit.
   - It needs **explicit owner authorization**, because the owner has not yet authorized any fresh audit.
4. **Then, and only then, the ordinary SHIELD path for v6.0.12 work**, each step needing owner authorization:
   - `/qor-audit` of `plan-463-qorlogic-exact-pin.md`, `plan-475-windows-write-containment.md` and the already-implemented v6.0.12 changes.
   - Implementation of PASSed plans.
   - A release-class `/qor-substantiate` seal on the exact release candidate.
5. **G4 (#467, comment 6698980891, NOT APPROVED):** blocked until the owner selects all of:
   - signing key custody (non-exportable, outside the repository);
   - an independent append-only or timestamped public witness;
   - cadence;
   - revocation and recovery.

   Implementation after that needs its own plan and audit. The falsifiers listed in that comment become its negative controls:

   PASS→VETO, Decision edit, hash change, missing entry, order change, revoked key, expired witness and offline witness.

## Explicit approvals required (none exist today)

| # | Approval | Unblocks |
|---|---|---|
| A1 | Owner identifies or provides the operator-local VETO artifacts and event `7126134e`, or accepts that they are UNKNOWN | Step 1 completeness |
| A2 | Owner authorizes `/qor-audit reviews-remediate:<path>` | Step 6 closure of the remediation |
| A3 | Owner authorizes `/qor-audit` of the #463, #475 and v6.0.12 change plans | any production change for #463 / #475 |
| A4 | Owner selects G4 custody, witness, cadence, revocation and recovery | G4 plan |
| A5 | Owner authorizes a release-class `/qor-substantiate` on an exact candidate | any v6.0.12 release |

## What will not be done

- No fourth ordinary audit.
- No edit, renumbering or rehash of historical ledger entries.
- No adjusted boundary described as a repair.
- No positive receipt (PASS or seal) without a real audit and seal.
