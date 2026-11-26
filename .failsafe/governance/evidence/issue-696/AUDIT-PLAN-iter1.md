# AUDIT REPORT

**Tribunal Date**: 2026-11-25T23:54:28Z
**Target**: `.failsafe/governance/plans/plan-696-g4-witness-fixtures.md` (iteration 1, raw sha256 2c6de0dea600f054b41ab9af15fcaed9d9ade9567f13f9b2c7a06ad29617dc5e, equal to the plan gate `plan_sha256`)
**Scope audited**: baseline origin/main 0550c4135c1d6d29aa03b2107f7b16aa78d08422; candidate local commit e32bb62f6f373a9eb4dab872d45b720f0ca5baf0 (`git cherry-pick -x 834607018a3166a59351f59261d67cbbb7c6ef98`, one test file)
**Session**: `2026-11-25T2335-247ff7`. Gate read: `.qor/gates/2026-11-25T2335-247ff7/plan.json` (iteration 1, valid).
**Audit scope**: closed claim table H1-H4 under the bounded-claim rule: a surviving non-equivalent mutant blocks only against a listed row; an omitted #696 acceptance criterion blocks
**Risk Grade**: L3
**Auditor**: The Qor-logic Judge, fresh context, independent of the plan, candidate and mutation map. Mode: solo (codex-plugin shortfall emitted). `audit_risk_score`: option_b_required false.
**Tooling**: qor-logic 0.176.1 as installed and unmodified; QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Windows 11; Node v24.19.0; OpenSSL 3.5.7

---

## VERDICT: VETO

---

### Executive Summary

The recovered change itself checks out. Every item the caller asked me to verify holds:
- LD1 recovery is exact.
- The suite is red on main and green with the candidate on this host.
- Both new tests run the real CLI on disposable fixtures. One asserts a positive diagnostic PASS, the other an explicit negative BLOCKED.
- The verifier, library, witness evidence and owner-key tooling are untouched.
- The diagnostic PASS is never presented as release verification.
- Teardown refuses every decoy outside its temp root, including a junction escape.
- The Razor holds.
- All 7 planner mutants and 8 of 11 Judge mutants are killed by the target suite. The 3 survivors violate no listed row, and the wider G4 suite kills them.

The VETO is on plan text only. The closed claim table H1-H4 leaves out three elements of the #696 acceptance criteria, and the plan records no owner narrowing for any of them:
- V1: the "approved Node22 environment" for red/green (#696 step 5).
- V2: "reliable teardown on Windows" (#696 step 1).
- V3: determinism across clean clones, worktrees, OSes and shallow or complete history (#696 step 4).

Under the plan's own closed-table rule, an element with no row is neither claimed nor proven.

### Preflight and Step 0

- `governance-health --profile skill-entry`: 8/8 OK.
- Prior artifact: found and valid.
- `plan_iteration_status_lint`: rc 0.
- Step 0.4: should_skip false (first audit; plan hash 2c6de0de...).
- Step 0.5: `cce.check` and `cce.check_session_total` both None.
- Explicit plan path. `current_phase_plan_path` raises InterdictionError on the non-phase branch `fix/696-g4-witness-fixtures`, as in the #721 precedent.
- Lints (all WARN-only):
  - Clean: plan_test_lint, plan_enumeration_lint, plan_grep_lint (0 citations truth-checked), plan_text_consistency_lint, delivery_branch_lint, plan_signature_widening_caller_lint, plan_data_round_trip_lint, plan_feature_tdd_lint, gate_schema_freeze_lint.
  - ci_coverage_lint: 1 out-of-scope WARN (oss-sast semgrep).
  - Repo-wide pre-existing findings: workspace_fragility_check, plan_live_progress_lint (19), publication_boundary_lint (558).
  - sg_closure_lint: could not run (relative doctrine path not found).
- Prompt Injection: rc 0. Four `<script` code-span WARNs in historical ledger text; no canary in the plan.
- Version-Applicability: SKIP (no pyproject.toml; Qor-logic #534). Manual check: hotfix, test-only, no bump; package 6.0.13 = tag v6.0.13.
- Ledger: Entry #991's chain hash e13a6e28... recomputes as SHA256(content|previous). Pre-anchor residuals are tolerated by governance-health.

### Empirical method

- Red run: a Judge scratch worktree, detached at 0550c413, under the Judge scratchpad. It has since been removed.
- Green, mutation and teardown runs: the pr696 worktree at e32bb62f.
- Every mutant edit was restored byte-exact. sha256 of `g4-verify-checkpoint.cjs`, `lib/g4/verify.cjs` and `g4Scenario.cjs` was re-checked OK after each batch, and `git status` shows only the pre-existing `.qor/session/current` change.
- Not touched: FailSafe/ (net), the plan, other worktrees, wt696/wt703/wt721/jsub-*.

| Check | Result | Plan statement |
| --- | --- | --- |
| LD1 blobs | origin/main = 83460701^ = ba8e5de7; 83460701 = e32bb62f = bafc818b = 59abc40d; g4Scenario e8eebce1 on both; verifier, lib, g4Scenario and g4TestPki diff 83460701^..origin/main empty; origin/main..e32bb62f is one file, +32/-6; e32bb62f^ = 0550c413 | LD1 |
| Red on main (0550c413) | 10 tests / 9 pass / 1 fail. "the CLI never reports PASS for the real repository..." fails: exit 0, `PASS OK: 1 checkpoint(s) verified to g4-000001`, diagnostic mode | LD2 |
| Green (e32bb62f) | 11 / 11 pass, 0 skip | H3 "11/11" |
| Temp hygiene | `g4-falsify-*` under %TEMP%: 40 before, 40 after (no leak from the green run) | Affected Files |
| `mutants696.py` | M1-M7 all KILLED. The output equals `mutation-map-696.txt` after CR stripping | D1 |
| Judge mutants `jmut696.py`, g4Witness only | J1, J2, J3, J4, J5, J6, J9, J10 KILLED; J7, J8, J11 SURVIVED | - |
| J7, J8, J11 against all 15 `g4*.test.cjs` | all KILLED (release-mode, CRL and merge-rollback denial cases) | (#696 step 3, preserved) |
| Teardown decoys `jteardown696.py` | T1 (outside %TEMP%, right prefix), T2 (%TEMP% child, wrong prefix) and T3 (a `g4-falsify-*` junction in %TEMP% pointing outside): guard assertion fires, run fails, sentinel kept. T4 control (a real `g4-falsify-*` child): deleted | not a row |

Judge mutants, and the row each bears on:
- J1: diagnostic label reads "release" (H2). KILLED.
- J2: the library always reports release mode (H2). KILLED.
- J3: an empty checkpoint set is not refused, so it falls to INTERNAL_ERROR (H1 code). KILLED.
- J4: the library always sees no checkpoints (H2). KILLED.
- J5: the CLI ignores `--repo-root`, so it verifies the real witnessed repository (H1/H3 independence). KILLED.
- J6: a forged PASS line is added on BLOCKED (H1 "no PASS line"). KILLED.
- J7: exit code from checkpoint count, not verdict. SURVIVED. No row claims REFUSED-after-verification.
- J8: REFUSED exits 0. SURVIVED. No row claims REFUSED.
- J9: the fixture builder writes no checkpoints (H2 fixture validity). KILLED.
- J10: the CLI exit code is discarded (H1). KILLED.
- J11: PASS for any failure after a verified checkpoint. SURVIVED. Library-level; no row claims it.

### Audit Results

| Pass | Result |
| --- | --- |
| Security (L3) | PASS. The test-only change has no auth or security stub. The disposable test PKI and TSA come from `g4TestPki.cjs`; no owner key is touched; no TPM key is created. |
| OWASP Top 10 | PASS. `spawnSync` uses list-form argv with no shell (g4Witness.test.cjs:128, :136). Teardown fails closed: assertions run before `rmSync` (:34-37). No deserialization added. |
| Ghost UI | PASS (no UI). |
| Section 4 Razor | PASS. File 163 lines (<= 250). Added bodies: before 3, after 7, H1 test 9, H2 test 7 lines (<= 40). Nesting <= 2. 0 nested ternaries (`found ? false : "..."` is single). |
| Self-Application (originating_remediation FailSafe #696) | PASS for the code: it removes the ambient-state assumption, and J5 proves real-repository independence. The plan text fails the discipline it introduces (see V3). |
| Test Functionality | PASS. Both tests invoke the real CLI subprocess and assert on exit code and stdout verdict and mode lines (:124-140). Neither is presence-only. |
| Dependency | PASS. Node built-ins only; `g4Scenario.cjs` is an existing in-repo helper. |
| Orphan | PASS. The suite is in `src/test/scripts`, discovered by `run-node-tests.cjs` (test:node). |
| Macro-Level Architecture | PASS. Test -> scenario helper -> verifier library; no reverse import. |
| Feature Test Coverage | PASS. The single `n/a-justified` row names the suite and a behavioural descriptor (exit 2 / exit 0). |
| Infrastructure Alignment | PASS. LD1-LD3 re-walked. CLI exit map at g4-verify-checkpoint.cjs:94, mode line at :64/:90, verdict line at :92; `NO_CHECKPOINTS` at lib/g4/verify.cjs:69. `S.buildBase`, `S.initRepo` and `S.copyRepo` exist (g4Scenario.cjs:61, :89, :166). |
| Filter-Stage Ordering | n/a (no pipeline change). |
| #696 acceptance-criteria coverage (bounded-claim rule) | FAIL: V1-V3. |

### Violations Found

| ID | Category | Location | Description |
| --- | --- | --- | --- |
| V1 | coverage-gap | plan:30 (LD2), plan:53 (H3) | #696 step 5 requires red before and green after "on the same approved Node22 environment". H3 says only "on the same host". LD2 records Windows 11 and OpenSSL 3.5.7 but no Node version. This host runs Node v24.19.0, not 22 (CI pins `node-version: "22"`; the historical line qualified on Node 22.23.5). The plan neither binds H3 to Node 22 nor records an owner narrowing of that requirement. The owner instruction it quotes (plan:19, "on one environment") does not say Node22 is waived. |
| V2 | coverage-gap | plan:37 (Affected Files) vs plan:49-54 (D1) | #696 step 1 requires "reliable teardown on Windows". The guard appears only as design prose in Affected Files, with no row, proof or mutant in the closed table. Under the bounded-claim rule it is not claimed. The Judge's decoy probe T1-T4 shows the mechanism works, so this is a missing claim, not a defect. One case to settle when adding the claim: if `buildBase` throws after `mkdtempSync`, `scenario` stays unset and the temp root is left behind (g4Witness.test.cjs:29, :33). |
| V3 | coverage-gap | plan:53 (H3) | #696 step 4 requires determinism "across clean clones, worktrees, OSes, shallow/complete history and future witness increments". H3 claims only independence from the real repository's witness state, which covers future witness increments (J5 KILLED). The rest goes unclaimed: shallow vs complete history, a different OS, a clean clone. Clone depth is the original defect's own shape: on a full clone the stale test fails, while a depth-1 CI checkout cannot resolve g4-000001's commit. D4 records "exact-head CI counts" (Linux, Node 22, depth-1 checkout) but binds them to no row. |

### Per-ground directives (if VETO)

#### Plan-text

- **V1.** Either bind H3 and LD2 to a recorded Node 22 runtime (red on 0550c413 and green on e32bb62f, both under the same Node 22.x binary, with `node --version` recorded), or record the owner's explicit narrowing of #696 step 5 to the Node v24.19.0 host.
  **Required next action:** Governor: amend plan text, re-run `/qor-audit`
- **V2.** Add a claim row for teardown: it removes only a `g4-falsify-*` direct child of the real OS temp dir; it refuses an outside root, a wrong prefix and a junction escape; and it leaves no temp root on a green run. Give it a proof and decoy mutants (for example, dropping the dirname assertion, dropping the prefix assertion, or using the unresolved path instead of `realpathSync.native`). Either cover or explicitly not-claim the buildBase-failure leak. Or record an owner narrowing.
  **Required next action:** Governor: amend plan text, re-run `/qor-audit`
- **V3.** Add a claim row for cross-environment determinism: the two CLI cases pass in a depth-1 clone and a full clone, plus the exact-head Linux/Node 22 CI run. Or list those environments under "Not claimed" with a recorded owner narrowing.
  **Required next action:** Governor: amend plan text, re-run `/qor-audit`

### Non-blocking notes

- **N1**: J7, J8 and J11 survive `g4Witness.test.cjs` alone, but no H row claims REFUSED handling. The wider G4 suite kills all three, so the #696 step 3 denial cases are preserved. If iteration 2 adds rows, do not cite g4Witness alone for REFUSED behaviour.
- **N2**: The candidate commit message cites bafc818b, while the plan cites 83460701. All three blobs (bafc818b, 83460701, e32bb62f) are 59abc40d, so the reference is consistent, not a mismatch.
- **N3**: The Judge did not run `npm run test:node`, `npm test`, `npm run lint` or `prepush-validate.ps1`. D4 keeps them for implementation and substantiation.
- **N4**: The candidate commit predates this audit. It is a recovery under the owner instruction the plan records (plan:19), it is local only, and the plan claims no historical verdict. The owner GO of #696 step 6 still applies before push or merge.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #992. The gate artifact `.qor/gates/2026-11-25T2335-247ff7/audit.json` records the plan path and verdict.

Judge scripts and outputs are in the Judge scratchpad and are not committed evidence: `jmut696.py`, `jteardown696.py`, `jmap696.txt`, `jmap696-allg4.txt`, `jteardown696.txt`, `red.txt`, `green.txt`.

---
_This verdict is binding. Gate CLOSED. Next: Governor amends the plan (V1-V3) and re-runs `/qor-audit` as iteration 2. The candidate e32bb62f needs no source change for these grounds._
