# AUDIT REPORT

**Tribunal Date**: 2026-11-26T02:19:45Z
**Target**: `.failsafe/governance/plans/plan-708-ci-job-timeouts.md` (iteration 2, raw sha256 30f2a5e9b21456dae858c664409d9823cfcac13845d572fef2445700c725597d, equal to the plan gate `plan_sha256`; supersedes iteration 1 (4cf93684...), preserved at `evidence/issue-708/plan-iter1.md` with that hash)
**Scope audited**: baseline origin/main 50a943c7d60c6b1f020014f1c28b2354ba827c76; candidate 5d8d8e1cc86ea414cdce0009e7440689b94a4fdd, unchanged since iteration 1 (HEAD is 5d8d8e1c; origin/main..HEAD is still 3 files, +3/-0)
**Session**: `2026-11-26T0210-e0eb44`. The plan gate `plan.json` is byte-identical to `plan-iter2.json` (iteration 2, `supersedes_plan_sha256` 4cf93684...).
**Audit scope**: a closure re-check of iteration-1 grounds V1-V3 and notes N1-N5 (Entry #996), plus a regression check, under the bounded-claim rule
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge, the same subagent that issued Entry #996. It authored no plan or candidate. Mode: solo. `audit_risk_score`: option_b_required false.
**Tooling**: qor-logic 0.176.1 as installed and unmodified; QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; actionlint 1.7.12 (scratchpad binary, exe sha256 54ca21be...); gh CLI read-only

---

## VERDICT: VETO

---

### Executive Summary

V1 and V3 are closed in fact, and N1 and N4 are addressed. V2 is only partly closed. The maxima and the T4 ratios are now correct, but iteration 2 adds statistics to LD2 that the stated command and window do not reproduce.

- **V1 closed.** `change_class: governance` appears at plan:3 and in the gate, with no version bump.
- **V3 closed.** The retry, the long tail, the fact that the retry path is unmeasured, and the push/`workflow_dispatch` scope are all in limitations (plan:13) and in the gate. T6 (plan:68) adds post-adoption `timed_out` monitoring, and Not claimed (plan:70) adds "cannot time out".
- **V2 partly closed.** T4 (plan:66) is now true: 1800/1531 = 1.18x, 600/150 = 4.0x, 600/116 = 5.2x.
- **V4 (infrastructure-mismatch, regression of the V2 class).** LD2 (plan:38) and the limitations (plan:13) state PR Full Test "p95 1150 s, 1.57x" and "median 914".
  - From the stated `gh run list --workflow pr-full-test.yml -L 100` over the stated window, the 46 successful runs give p95 1028 s by nearest rank (1023 inclusive, 1295 exclusive), not 1150 under any standard method, and a median of 911.5.
  - The single window label (plan:37) is right only for PR Full Test. Repo Standards' 100 runs span 2026-11-21T17:33:13Z..2026-11-26T00:59:24Z, and VSIX's span 2026-11-20T11:13:41Z..2026-11-26T02:10:06Z.

The candidate is unchanged and still holds. Nothing else regressed.

### Preflight and Step 0

- `governance-health --profile skill-entry`: 8/8 OK.
- Prior artifact: valid.
- `plan_iteration_status_lint`: rc 0.
- Step 0.4: should_skip false (new hash 30f2a5e9...).
- Step 0.5: `cce.check` and `cce.check_session_total` are both None.
- The plan path was passed explicitly (`fix/` branch).
- Lints:
  - plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint and plan_feature_tdd_lint are clean.
  - plan_grep_lint WARNs on the LD4 citations, which it parses as `github/workflows/...` (it drops the leading dot). This is a lint parsing artifact: the cited lines exist at `.github/workflows/cross-platform-compile.yml:25` and `.github/workflows/oss-sast.yml:21`.
- Prompt Injection: rc 0.
- Version-Applicability: `governance` is the version-not-applicable class by contract. `validate` itself cannot run (no pyproject.toml).
- Ledger: Entry #996's chain hash 7876b639... is the previous hash for this entry.
- Plan delta from iteration 1 (`plan-iter1.md` sha256 4cf93684..., which matches):
  - plan: change_class, iteration, the Iteration history section, limitations, the LD1/LD4 path prefixes, LD2 rewritten, T4 restated, T6 added, Not claimed extended;
  - gate: change_class, two limitations, iteration, `supersedes_plan_sha256`.
  - Every other line and gate field is unchanged.

### Empirical verification

| Check | Result | Plan statement |
| --- | --- | --- |
| Candidate | HEAD 5d8d8e1c; `git diff --numstat origin/main..HEAD` gives 1/0 on each of the 3 workflow files | T1, T2 |
| actionlint 1.7.12 on the 3 files at HEAD | exit 0, no output (the baseline was exit 0 in iteration 1) | T3 |
| PR Full Test, `-L 100` | window 2026-11-19T19:42:03Z..2026-11-26T00:59:24Z; 46 success / 39 cancelled / 15 failure; successful runs: min 791, median 911.5, **p95 1028 (nearest rank; 1023 inclusive, 1295.15 exclusive)**, max 1531 | LD2 says 46 / 791 / 914 / **1150** / 1531 |
| Sorted top of PR Full Test successes | ..., 983, 988, 1008, 1028, 1439, 1531 | LD2 p95 |
| Repo Standards, `-L 100` | window 2026-11-21T17:33:13Z..2026-11-26T00:59:24Z; 96 success / 4 failure; min 81, median 129, p95 142, max 150 | LD2 matches, except the window |
| VSIX Guardrails, `-L 100` | window 2026-11-20T11:13:41Z..2026-11-26T02:10:06Z (the newest run is 45740595247, a main push); 96 success / 4 failure; min 37, median 77, p95 98, max 116 | LD2 matches, except the window |
| T4 ratios | 1800/1531 = 1.18, 600/150 = 4.0, 600/116 = 5.2 | T4 true |

### Closure of the iteration-1 grounds and notes

| Ground / note | Status | Evidence |
| --- | --- | --- |
| V1 (change class) | Closed | plan:3 `governance`; gate `change_class` governance; no bump in D1-D4. |
| V2 (false headroom) | Partly closed | The T4 maxima and ratios are true (plan:66). LD2's p95, median and window are not reproducible (V4). |
| V3 (retry, tail, monitoring) | Closed | Limitations plan:13 (retry at `.github/workflows/pr-full-test.yml:42-60`, which I confirmed; unmeasured; thin tail); gate limitations; T6 plan:68; Not claimed plan:70. |
| N1 (bare names) | Closed | LD1 and LD4 (plan:36, plan:43) use full paths. |
| N2 (retry unmeasured) | Closed | Disclosed in plan:13. |
| N3 (actionlint record base) | Unchanged, non-blocking | LD3 cites the re-runs at 50a943c7 and 5d8d8e1c, which the Judge reproduced. |
| N4 (push / dispatch scope) | Closed | plan:13 and the gate. |
| N5 (session pointer) | Unchanged, non-blocking | - |

### Ground

**V4, infrastructure-mismatch (plan-text): LD2's added statistics do not reproduce from the stated command and window.**

- plan:38 states "median 914, p95 1150 ... 1.57x at p95", and plan:13 repeats "p95 1150 s, 1.57x".
- The stated command over the stated window (the PR Full Test window matches to the second, and no newer PR Full Test run exists) yields 46 successes with median 911.5 and p95 1028 by nearest rank. Linear inclusive gives 1023 and exclusive gives 1295.15. No standard method gives 1150.
- 914 is the upper of the two middle values, an unstated convention.
- plan:37 attributes one window to all three workflows, but the Repo Standards and VSIX 100-run windows differ (see the table).
- The error is conservative: true p95 headroom is 1.75x, not 1.57x. It changes no T-row. But the plan's own iteration-1 remedy was a named, reproducible sample, and the seal will recompute these figures. A locked evidence figure that cannot be reproduced is the same class as the V2 ground. Under the binary rule this is not a warning.

### Audit Results

| Pass | Result |
| --- | --- |
| Security (L3) | PASS. Unchanged. |
| OWASP Top 10 | PASS. Unchanged. |
| Ghost UI | PASS (no UI). |
| Section 4 Razor | PASS. Unchanged. |
| Self-Application (FailSafe #708) | PASS. Governance class; bounded scope; the evidence qualifications from #708's comments are carried. |
| Test Functionality | PASS. No unit tests are claimed. T6 is a post-merge process condition, not a test. |
| Dependency | PASS. |
| Macro-Level Architecture | PASS. |
| Feature Test Coverage | PASS (empty, exempt). |
| Infrastructure Alignment | VETO (V4). LD1, LD3 and LD4 re-walked and true; T4 true; LD2's p95, median and window are not reproducible. |
| Filter-Stage Ordering | n/a. |
| Orphan Detection | PASS. |
| CLAUDE.md "GitHub Actions budget" | PASS. Unchanged candidate, not pushed. |
| #708 acceptance coverage | PASS. Jobs, values, scope, actionlint, class, headroom basis, retry, tail and monitoring are all covered. |

### Required actions (Governor, plan text only; no source change)

1. **V4**: in LD2 (plan:37-40) and limitations (plan:13):
   - correct PR Full Test p95 to the value the stated method gives (nearest rank 1028 s, 1.75x), naming the percentile method;
   - state the median as 911.5 or name the upper-median convention;
   - give each workflow its own window. Repo Standards: 2026-11-21T17:33:13Z..2026-11-26T00:59:24Z. VSIX: 2026-11-20T11:13:41Z..2026-11-26T02:10:06Z, or pin the VSIX sample to before 45740595247 and say so.
2. Re-run `/qor-audit` as iteration 3.

### Non-blocking notes

- **N6**: plan_grep_lint drops the leading `.` in `.github/workflows/...` citations. This is a lint parsing artifact; the lines exist.
- **N7**: T6 commits to reporting on #708 after adoption. It can only be shown at or after merge, so substantiation can record the commitment but not its fulfilment.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #997. The gate artifact `.qor/gates/2026-11-26T0210-e0eb44/audit-iter2.json` (also audit.json) records the plan path, the verdict and findings_categories `infrastructure-mismatch`. Shadow Genome Failure Entry #348.

---
_This verdict is binding. Gate CLOSED. Next phase: Governor corrects LD2 and limitations (V4) and re-runs `/qor-audit` as iteration 3. No change to 5d8d8e1c is required. Do not push or open a PR on this verdict._
