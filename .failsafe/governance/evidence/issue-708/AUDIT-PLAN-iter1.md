# AUDIT REPORT

**Tribunal Date**: 2026-11-26T02:15:00Z
**Target**: `.failsafe/governance/plans/plan-708-ci-job-timeouts.md` (iteration 1, raw sha256 4cf9368435f5029e34f48b61c09dd44884a9268fe64c72c2d6d91bafc0f44abe, equal to the plan gate `plan_sha256`)
**Scope audited**: baseline origin/main 50a943c7d60c6b1f020014f1c28b2354ba827c76; candidate 5d8d8e1cc86ea414cdce0009e7440689b94a4fdd (local, not pushed; cherry-pick of b18741701384c08f179444fb344e6d3c841d602e)
**Session**: `2026-11-26T0210-e0eb44` (plan gate `.qor/gates/2026-11-26T0210-e0eb44/plan.json`, iteration 1)
**Audit scope**: the closed claim table T1-T5 against #708 (body and all 10 comments), under the bounded-claim rule. T5 is a substantiation-time condition.
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge, fresh context, independent of the plan and candidate. Mode: solo (`should_run_adversarial_mode` false). `audit_risk_score`: option_b_required false.
**Tooling**: qor-logic 0.176.1 as installed and unmodified; QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; actionlint 1.7.12 (scratchpad binary, exe sha256 54ca21be3de4c7cfa26914aa8b61bd76bf573ef3caac5f80d110558cdf241718, equal to the ACTIONLINT-708.md record); gh CLI read-only

---

## VERDICT: VETO

---

### Executive Summary

The candidate holds. The plan text does not.

- **Candidate holds.** `git diff origin/main..5d8d8e1c` has 3 files and 3 insertions, with no deletions. The changed lines are `pr-full-test.yml:30`, `repo-standards-enforcement.yml:27` and `vsix-proprietary-guardrails.yml:22`, and the values are 30/10/10, as #708 asks. actionlint 1.7.12 exits 0 with no findings on both baseline and candidate. The change composes with #721's step (`repo-standards-enforcement.yml:53-56`).
- **V1 (specification-drift).** The plan declares `change_class: hotfix` (plan:3; gate `change_class`). #708 says this is a governance-class change. The plan's own Authority section says so too (plan:22). A #708 comment (2026-11-24) also warns against reclassifying governance as hotfix.
- **V2 (infrastructure-mismatch).** LD2 (plan:30) and T4 (plan:51) claim at least 1.8x headroom over the observed maximum, with PR Full Test "up to 966 s". This is false. In the last 100 successful runs, the maximum is 1531 s (run 45221551410; job 25.43 min). 30 min over that is 1.18x. #708 itself records this tail.
- **V3 (coverage-gap).** The plan omits the bounded-retry envelope and the long-tail risk that #708 records. It also omits the post-adoption `timed_out` monitoring that #708 asks for.

The values 30/10/10 are not disputed. #708 records them as owner-approved and asks that they not be changed. The remedy is plan text only. No source or workflow change is required.

### Preflight and Step 0

- `governance-health --profile skill-entry`: 8/8 OK.
- Step 0 prior artifact: found and valid (no errors).
- Step 0.3 `plan_iteration_status_lint`: rc 0.
- Step 0.4: should_skip false (first audit of this plan).
- Step 0.5: `cce.check` and `cce.check_session_total` are both None.
- `current_phase_plan_path()` raises InterdictionError on the `fix/` branch (it is not a phase branch), so the plan path was passed explicitly, as in the #696 precedent.
- Step 0.6 lints (WARN-only):
  - plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint, delivery_branch_lint and plan_feature_tdd_lint are clean.
  - plan_grep_lint gives 5 WARNs. The basename `file:line` citations at plan:25 and plan:33 lack a `.github/workflows/` prefix. The Judge confirmed every line with grep: `timeout-minutes` sits at cross-platform-compile.yml:25, oss-sast.yml:21, pr-full-test.yml:30, repo-standards-enforcement.yml:27 and vsix-proprietary-guardrails.yml:22.
  - ci_coverage_lint gives 1 WARN: oss-sast semgrep install, out of scope.
- Prompt Injection: rc 0. There are 4 `<script` code-span WARNs in META_LEDGER, which are pre-existing.
- prose_test_lint `--enforce`: rc 0.
- Version-Applicability: `validate` raises FileNotFoundError (no root pyproject.toml; Qor-logic #534). For a `hotfix` class this matters: it is a release class, which implies a target above the current tag. That is the V1 consequence.
- Ledger: Entry #995's chain hash 2d777ace1916aadeaee236cfefeafee9091d0233c003e2c2edc802cdd3aa0da8 recomputes from its content and previous hashes (`ledger_hash.chain_hash`). It is the previous hash for this entry.

### Empirical verification

| Check | Result | Plan row |
| --- | --- | --- |
| `git rev-parse HEAD origin/main` | 5d8d8e1c..., 50a943c7... | Baseline / Candidate |
| `git diff --numstat origin/main..HEAD` | 1/0 for each of the 3 workflow files; no other path | T2, D2 |
| Changed lines (`+`/`-` only) | `+    timeout-minutes: 30`, `+    timeout-minutes: 10`, `+    timeout-minutes: 10`; no deletions | T1, T2 |
| Placement | full-test pr-full-test.yml:30, standards repo-standards-enforcement.yml:27 and verify-vsix-guardrails vsix-proprietary-guardrails.yml:22. Each is at four-space job level, directly after `runs-on`. | T1 |
| Triggers, concurrency, permissions, env, steps | Unchanged. The only hunks are the three insertions (pr-full-test.yml:11-24 `on`/`concurrency`/`permissions`; repo-standards-enforcement.yml:3-22; vsix-proprietary-guardrails.yml:3-17). No matrix exists in these jobs, and pr-full-test.yml has no draft skip to preserve. | T2 |
| #721 composition | The `standards` job keeps the #721 governance regression step (repo-standards-enforcement.yml:51-56, four node suites). The baseline blob for this file at main is d100d270, as #708's 2026-11-25 comment expects. | T2 |
| actionlint 1.7.12, candidate (worktree) | exit 0, no output | T3 |
| actionlint 1.7.12, baseline (`git show origin/main:<path>` to scratch) | exit 0, no output | T3 |
| `grep -n timeout-minutes .github/workflows/*.yml` | the 3 added lines plus cross-platform-compile.yml:25 and oss-sast.yml:21 (30 each), as in LD4 | LD4 |
| PR Full Test, 100 latest successful runs (`gh run list --workflow pr-full-test.yml --status success -L 100`) | median 896 s. Top values are 1008, 1028, 1034, **1439** (44782442602), **1531** (45221551410). The latest 20 runs top out at 1028 s, not 966. | LD2, T4 |
| Run 45221551410 jobs | attempt 1, success. Job 16:53:30Z to 17:18:56Z (25.43 min). The test step took 15.05 min, so the tail came from roughly 10 min of setup; no retry was measured. | LD2, T4 |
| Repo Standards, 100 latest successful | max 150 s; the latest post-#721 run is 144 s (45732609977, fbeeda57), against the 142 s in the plan. 600/150 = 4.0x. | LD2 |
| VSIX Guardrails, 100 latest successful | max 116 s (44853061381), against "up to 103 s" in the plan. 600/116 = 5.2x. | LD2 |
| PR Full Test conclusions (last 100) | 46 success, 39 cancelled, 15 failure. The longest failure is 683 s, and none is `timed_out` (there is no limit at main). | - |

### Grounds

**V1, specification-drift (plan-text): change_class contradicts #708 and the plan's own Authority section.**

- plan:3 and gate `change_class` say `hotfix`.
- #708 body: "It is a governance-class change and needs its own native plan..."
- plan:22 repeats "governance-class change".
- #708 comment 2026-11-24 (complete-workflow parse): "don't ... reclassify governance as hotfix".
- The schema enum (`plan.schema.json` `change_class`) includes `governance`, the non-release / version-not-applicable class. `hotfix` is a release class: under `version_applicability` and substantiate it implies a patch bump above the current tag, which this plan never declares. D3 records no bump either.
- Repository precedent for a protected-workflow change: plan-v6012-634-release-runner-pin.md declares `governance (protected CI workflow correction; no product source change)`.

**V2, infrastructure-mismatch (plan-text): the T4 headroom claim and the LD2 maxima are false against measured CI history.**

- plan:30 states "PR Full Test up to 966 s ... Each limit is at least 1.8x the observed maximum", and T4 (plan:51) claims ">= 1.8x headroom over the observed maximum successful duration".
- Independent re-measurement found successful runs of 1531 s (job 25.43 min) and 1439 s (job 23.92 min). That gives 1800/1531 = 1.18x.
- #708's comment of 2026-11-23 records the same tail ("two successful Full Test runs exceeded 23 minutes ... only 4.57m / ~18% above the longest measured successful job"). Its 2026-11-24 comment repeats that this tail "remains authoritative for cap risk".
- The plan names no sample window, and its maxima for Repo Standards (142 vs 144-150 s) and VSIX (103 vs 116 s) are also understated. Those two ratios still hold.
- As written, T4 cannot be substantiated, so the closed table contains a false claim.

**V3, coverage-gap (plan-text): the plan omits #708's recorded retry-envelope and long-tail conditions.**

- #708 comment 2026-11-18 marks a P0 boundary to audit before locking 30. The full-test step retries the complete suite once on a transport signature (pr-full-test.yml:42-60). A late first-attempt failure followed by a full retry can exceed 30 min, so the comment says to justify 30 or record the risk.
- #708 comment 2026-11-23 keeps 30 as owner-approved, but conditions it: "flag long-tail sensitivity", "monitor for newly introduced `timed_out` conclusions after adoption", and "do not shrink it blindly".
- The plan's boundaries and Not claimed list (plan:11-13, plan:54) say nothing about either point. A legitimate retry that the 30-min cap could cut off is neither claimed nor disclosed as a limitation. The plan also has no post-adoption monitoring condition.
- Under the bounded-claim rule, an omitted #708 condition is blocking.

### Audit Results

| Pass | Result |
| --- | --- |
| Security (L3) | PASS. No auth or secret surface. `permissions: contents: read` is unchanged in all three files. |
| OWASP Top 10 | PASS. No new `run:` content. A08 n/a. The change bounds A04 resource exhaustion (#695 extglob minutes). |
| Ghost UI | PASS (no UI). |
| Section 4 Razor | PASS. One YAML key per file; no functions, nesting or ternaries added. |
| Self-Application (FailSafe #708) | VETO (V1, V3). The discipline #708 introduces is "governance-class, bounded, evidence-qualified timeouts". The plan misclassifies the class and omits the qualifications. |
| Test Functionality | PASS. No unit tests are claimed. The regression test is a declared non-goal (plan:12), and proof is by readback, actionlint and CI. |
| Dependency | PASS. No dependency added. actionlint is a local, checksum-verified validation tool that is not committed, installed globally or added to CI. |
| Macro-Level Architecture | PASS. |
| Feature Test Coverage | PASS. `feature_inventory_touches` is empty, which is exempt for CI-config-only work. |
| Infrastructure Alignment | VETO (V2). LD1, LD3 and LD4 verified; LD2 is false. |
| Filter-Stage Ordering | n/a. |
| Orphan Detection | PASS. All three files are existing, active workflows. |
| Version-Applicability | SKIP (no pyproject.toml). V1 covers the class consequence. |
| CLAUDE.md "GitHub Actions budget" | PASS for the candidate. No added triggers, matrix legs or `push` patterns. No removal of `concurrency` (pr-full-test.yml:17-19), draft skips or existing timeouts. The change is owner-approved in #708 and has not been pushed. The rules require validating locally before pushing: done for actionlint; T5 is owed after a push. |
| #708 acceptance coverage | VETO. The 3 jobs, values and scope-only rule are covered (T1, T2). actionlint is covered (T3). The class (V1), the measured-headroom basis (V2) and the retry/tail/monitoring conditions (V3) are not. |

### Required actions (Governor, plan text only; no source change)

1. **V1**: set `**change_class**: governance` at plan:3 and in the plan gate, with a parenthetical in the form of repository precedent. Remove any implied release bump.
2. **V2**:
   - Restate LD2 with a named sample window (for example, the 100 latest successful runs on a stated date). Include the true maxima: PR Full Test 1531 s run / 25.43 min job (45221551410). Cite the #708 comment of 2026-11-23.
   - Rewrite T4 to a claim the evidence supports. For example, Standards and VSIX at 4x or more, and full-test at 1.18x over the longest successful job, accepted by the owner's 30-min decision as recorded in #708.
3. **V3**: add to boundaries/limitations and to Not claimed:
   - the one-retry full-suite path (pr-full-test.yml:42-60) can exceed 30 min, and a timeout there fails a run that would otherwise have recovered;
   - the long-tail headroom is about 18%.
   Also add a post-adoption condition, either a D-row or a substantiation note, to watch for `timed_out` conclusions. Do not change the 30/10/10 values.
4. Re-run `/qor-audit` as iteration 2.

### Non-blocking notes

- **N1**: plan_grep_lint WARNs. The basename citations at plan:25 and plan:33 omit `.github/workflows/`. The Judge confirmed every cited line.
- **N2**: Run 45221551410's tail came from setup (about 10 min before the test step), not from a retry. The retry envelope has never been measured, and #708 says the same.
- **N3**: The plan's actionlint record (`ACTIONLINT-708.md`) covers main 7863a29e and the original candidate. The Judge re-ran actionlint on main 50a943c7 and on 5d8d8e1c: both exit 0. shellcheck and pyflakes are absent here too, so `run:` bodies are not linted, as already disclosed.
- **N4**: Repo Standards also runs on `push` to `fix/**` (repo-standards-enforcement.yml:11-17), and VSIX Guardrails on `push` to main and on `workflow_dispatch`. The job-level timeout applies to those events too, as #708's 2026-11-18 comment notes. This is not a scope change.
- **N5**: The worktree has an uncommitted `.qor/session/current` (the session pointer). It is not part of the candidate.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #996. The gate artifact `.qor/gates/2026-11-26T0210-e0eb44/audit.json` records the plan path, the verdict and findings_categories `specification-drift`, `infrastructure-mismatch` and `coverage-gap`. Shadow Genome Failure Entry #347.

Judge scratch artifacts are not committed evidence: run lists `runs-*.yml.txt` and the baseline blobs `base708/` in the Judge scratchpad.

---
_This verdict is binding. Gate CLOSED. Next phase: Governor amends the plan text (V1-V3) and re-runs `/qor-audit` as iteration 2. No change to 5d8d8e1c is required. Do not push or open a PR on this verdict._
