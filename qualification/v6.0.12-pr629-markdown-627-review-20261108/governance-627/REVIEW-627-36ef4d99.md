# Review: #627 forward-only recovery proposal (`36ef4d99`) against native qor-logic 0.176.1

**Subject:** `.failsafe/governance/plans/plan-467-unrecoverable-veto-forward-recovery.md` at `36ef4d99`. It is the only file that commit changes over `ccbb7d97`.

**Method:**
- read-only reading of the frozen 0.176.1 wheel (`dd6eec66…`) installed in `FailSafe-rc611-qual/qor-venv`: skills, `references/doctrine-*.md`, `gates/chain.md`, `cli_handlers/reconcile.py`, `scripts/remediate_pattern_match.py`, `scripts/check_shadow_threshold.py`;
- FailSafe `AGENTS.md` and `GOVERNANCE.md`;
- the #467 record as quoted in `plan-v6012-governance-continuation.md` (`d2707332`).

**Not done:**
- no audit or `/qor-remediate` run;
- no shadow event written;
- no ledger, plan or issue changed;
- no October evidence created.

**This review is not a verdict on the plan.**

## Bottom line

**The native framework supports the proposal only in part.**
- **Native today:**
  - freezing evidence and publishing a gap statement, as documents;
  - prospective plan/audit sessions with real timestamps;
  - the stop conditions.
- **Not native in 0.176.1:** the core of the proposal (steps 3, 4 and 5). There is no mechanism for any of these:
  - an independent, signed and externally witnessed **governance recovery decision**;
  - an externally witnessed **checkpoint over the full ledger bytes**;
  - a **recovery verifier** that refuses edited Decision/Verdict text.

The native doctrine-change route cannot reach those steps either, because it starts from a classified shadow pattern and the missing evidence has none. The required change is therefore an **owner-authorized FailSafe governance amendment**, set out in §3. The frozen Qor-logic doctrine cannot be amended under current authority.

## 1. Step-by-step native support

| Step | Proposal | Native 0.176.1 support | Evidence |
|---|---|---|---|
| 1 | Freeze immutable evidence | **Yes**, as documentation; no gate needed. Already done read-only (`recovery/MANIFEST.md`, `a723b366`) | n/a |
| 2 | Gap statement labelling #610–#612 / `7126134e` UNKNOWN | **Document only.** The one native loss event, `governance-state-loss` (severity 3), is appended **only** by `qor-logic scripts governance_snapshot restore --from <dir>`. That needs a backup-on-write snapshot under `.agent/local-backup/governance/<sid>/`, and **none exists** anywhere under `C:\dev` (0 directories, checked 2026-11-08). Writing that event by hand would be synthetic | `doctrine-governance-enforcement.md` §16 |
| 3 | Independent, signed, externally witnessed recovery decision with owner acceptance and quorum | **No.** 0.176.1 has no decision-signing, quorum or third-party witness. The closest controls are each weaker: | `doctrine-provenance-binding.md`; `qor-audit` SKILL |
| | | • **Layer A** gate provenance: a per-session local HMAC. The doctrine itself says it is "impossible by construction" to make this non-forgeable against the repo owner | |
| | | • **Layer B** CI attestation: an HMAC keyed by `QOR_CI_ATTEST_SECRET`. It proves "verified by trusted CI", not independent human authority, and covers only sealed ledger entries | |
| | | • **Option B** audit: a fresh-context reviewer, not a signer or witness | |
| 4 | New externally witnessed checkpoint over the complete ledger bytes, including text | **No.** `content_hash` covers the artifact file, not entry prose (the #900 tamper negatives). The only native forward-only ledger append is `qor-logic reconcile` (Phase 119). `verify-ledger` honors it **only** for genuine duplicate-`previous_hash` residuals, "so it cannot launder content tampering". It does not apply to missing evidence | `doctrine-governance-enforcement.md` "Ledger reconciliation"; `cli_handlers/reconcile.py` |
| 5 | Falsification verifier (refuse changed text, reordering, a bad key, replay, a missing inclusion proof) | **No.** This is new FailSafe code (#467 G4), so it needs its own prospective plan and audit | n/a |
| 6 | Classify v6.0.12 code already written without a prior PASS; no backdating | **Partly.** 0.176.1 has **no retrospective-acceptance verdict**. Seal Step 7.8 (`gate_chain_completeness`) requires `plan/audit/implement/substantiate.json` for each sealed session (phase ≥ 52). Audit cannot be omitted for `feature`/`breaking` work; skipping it is allowed only for an L1 `hotfix` and emits a `gate_override`. **Two native-compatible options** (the owner or auditor must choose): | `gates/chain.md`; `qor-substantiate` Step 7.8; AGENTS.md |
| | | **(a)** Revert, then re-implement under new prospective plans | |
| | | **(b)** New sessions whose plan scope is *integrating* the existing, still-unmerged commits (#623 is not on `main`). This is audited now with true timestamps, and the audit text states the code already exists. Whether (b) satisfies AGENTS.md "Never implement without a PASS" is an interpretation for the owner; the framework neither permits nor forbids it explicitly | |
| 7 | Audit #463 / #475 / #505 / #476 only after recovery authorization | **The native code does not block these audits**; the block comes from the #467 owner rule. Details below this table | `doctrine-governance-enforcement.md` §10.4–10.5 |
| 8 | Stop conditions (no untruthful `reviews-remediate` subject, no bypass, stay NO-GO) | **Yes.** This matches §15 "No ungoverned path forward" and qor-audit Step 4.1 ("the ONLY trigger") | §15; `qor-audit` Step 4.1 |

**Step 7 in detail:**
- The cycle-count escalator (§10.4) is **per session**. It counts the local `.qor/gates/<sid>/audit*.json` history. The October VETO artifacts are absent here, so a new session would not trigger it.
- Even when it fires, it is **advisory**. The operator may proceed, and doing so records a severity-2 `orchestration_override` (§10.5).
- **The block is the #467 owner rule** ("No fourth ordinary plan/audit loop"; "Remediation must use preserved, hash-verified local artifacts"), not native code.
- Starting a fresh session merely to avoid the escalator would sidestep that rule, so it must not be done without an explicit owner decision.

## 2. Why the native doctrine-change route does not reach this

- **How doctrine changes natively:** `/qor-remediate` emits a `proposal_kind: doctrine` proposal. It is then accepted by an operator-explicit `/qor-audit reviews-remediate:<path>` PASS with a valid `closure_enforcer` (§10.1).
- **Why it fails here:** `/qor-remediate` only proposes for classified patterns (`remediate_pattern_match.PATTERN_RULES`): `aged-high-severity`, `hallucination`, `regression`, `repeated-veto-pattern`, `gate-loop`, session-scoped `plan-replay`, and `capability-shortfall` aggregation (three or more events). The missing October evidence exists in no shadow event on this machine. So there is nothing to classify, and **no truthful `remediate.json` can be produced for it**.
- **August proposal:** the August `ce7c36d8` proposal (`5b1d6106…`) is about plan-233 and cannot carry a #467 doctrine change.
- **Qor-logic doctrine files:** they ship in the frozen 0.176.1 wheel. Changing them requires a Qor-logic release, and that repository is frozen under the current rules.

## 3. The owner-authorized change that is actually required

Proceeding along the proposal requires the following decisions. Each is an explicit owner act; none is inferred here.

| # | Decision | Why it is needed |
|---|---|---|
| D1 | **Amend the #467 rule** "remediation must use preserved, hash-verified local artifacts". Either keep it, so #467 stays blocked until the artifacts surface, or replace it with an explicit **unrecoverable-evidence clause**. That clause records the gap as UNKNOWN permanently and moves to prospective controls without closing or exonerating the October VETOs | It cannot be satisfied now (`recovery/MANIFEST.md`). Native qor-logic has no rule to replace it |
| D2 | **Scope the "no fourth ordinary audit" rule.** State whether it covers only the plan or signature VETOed in October, or also new-scope plans (#463 in #627, #475, the G4 verifier, the D1 amendment) in new sessions | Native escalation would not fire. Only the owner rule decides whether those audits are permitted |
| D3 | **Adopt a FailSafe-local governance amendment** (`AGENTS.md`, plus a `.failsafe/governance` doctrine document) that defines: | Native 0.176.1 provides none of steps 3–5 (§1) |
| | • the recovery-decision authority, reviewer independence and quorum (today `GOVERNANCE.md` §Amendments says only "maintainer consensus") | |
| | • the witness and custody model (G4 key custody, external witness, cadence, expiry, rotation, revocation) | |
| | • that recovery decisions authorize *future review only* and make no historical claims | |
| D4 | **Route D3 through its own governed plan → independent audit.** It is a governance change, and FailSafe AGENTS.md requires a PASS before implementation | A self-approved doctrine would be an "ungoverned path forward" (§15) |
| D5 | **Choose option (a) or (b) for the existing v6.0.12 code** (§1 step 6) | 0.176.1 has no retrospective verdict |

D2 alone (an owner statement that new-scope plans in new sessions are not the forbidden fourth loop) would let the #463/#475 plan audits proceed natively today. It would not touch #467 itself, which remains P0 under D1 and D3.

## 4. Assessment of the proposal's own text

- **Accurate:**
  - the UNKNOWN status of the missing VETOs;
  - that August `reviews-remediate` cannot close #467;
  - that native checks do not cover prose;
  - that a retrospective review cannot backdate a PASS;
  - the stop conditions.
- **To make explicit:**
  - Steps 3–5 have **no native implementation in 0.176.1**. They depend on D3, and D3 must itself be planned and audited (D4).
  - The "applicable policy quorum" in step 3 does not exist yet: `GOVERNANCE.md` defines only maintainer consensus.
  - Step 2 should state that no native `governance-state-loss` event can truthfully be emitted, because no snapshot exists.
- **No contradiction** with native doctrine was found in the proposal.
