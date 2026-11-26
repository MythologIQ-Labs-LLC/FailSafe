# Plan: job-level timeouts for the three PR workflows that lack one (#708)

**change_class**: governance
**doc_tier**: minimal
**terms**: none
**iteration**: 2
**Risk Grade**: L2
**Baseline**: protected `main@50a943c7d60c6b1f020014f1c28b2354ba827c76` (includes merged #721 and #737)
**Candidate**: local commit `5d8d8e1c` on `fix/708-ci-job-timeouts` = the existing candidate `candidate/708-ci-timeouts-unreviewed@b18741701384c08f179444fb344e6d3c841d602e` cherry-picked (`-x`) and rebased onto the baseline (not pushed)
**originating_remediation**: FailSafe #708 (owner decision 2026-11-17, option (c) on the #695 picomatch PR-CI scope)

**boundaries**:
- limitations: the `full-test` budget is thin at the observed tail (30 min against a 1531 s = 25.5 min maximum successful run, 1.18x; p95 1150 s, 1.57x), and the job's step retries the whole suite once on a transport error (`.github/workflows/pr-full-test.yml:42-60`), so a late transport failure plus its retry can exceed 30 minutes and end `timed_out`; that retry path has never been measured; the limits also apply to these workflows' push and `workflow_dispatch` runs; a timeout bounds a runaway job's minutes; it does not prevent the extglob cost itself (that is the #695 dependency lane); actionlint ran without its optional shellcheck and pyflakes script linters (absent on this host), so `run:` bodies are not linted; no repository test guards these values against later removal
- non_goals: triggers, matrix legs, `concurrency`, draft skips, permissions, steps or any other workflow content; the #695 dependency remediation; a regression test for the timeout values
- exclusions: none

## Iteration history

Iteration 1 (sha256 4cf9368435f5029e34f48b61c09dd44884a9268fe64c72c2d6d91bafc0f44abe, preserved at `.failsafe/governance/evidence/issue-708/plan-iter1.md`) received an independent VETO, Entry #996 (this branch), report `AUDIT-PLAN-iter1.md`, on plan text only. Iteration 2 answers it without changing the candidate:

- **V1** (`hotfix` contradicted #708's governance class): `change_class` is `governance`, the repository's class for a protected-workflow change; no version bump.
- **V2** (false 1.8x headroom; PR Full Test maximum understated): LD2 and T4 restate the measured window and the real maxima; the `full-test` margin is 1.18x at the maximum and is disclosed as thin.
- **V3** (retry and long tail omitted): the transport retry and long tail are in limitations, and monitoring for `timed_out` conclusions after adoption is a post-merge condition (T6).
- **Notes**: N1 (bare file names) corrected in LD citations; N4 (push and `workflow_dispatch` runs) in limitations.

## Authority and scope

Owner decision recorded in #708 (2026-11-17): add a job-level `timeout-minutes` to exactly `pr-full-test.yml` (`full-test`, 30), `repo-standards-enforcement.yml` (`standards`, 10) and `vsix-proprietary-guardrails.yml` (`verify-vsix-guardrails`, 10); leave everything else unchanged; `.github/workflows/**` is protected and this specific change is owner-approved; governance-class change needing its own native plan, independent audit, seal and local validation (actionlint or equivalent) before any push. Owner instruction (2026-11-25): recover the existing candidate, preserve its exact bounded scope, reconcile it with the integrated #721 workflow change, validate with actionlint, avoid unnecessary CI. actionlint use approved by the owner (2026-11-25).

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (recovery)**: `git diff origin/main...b18741701384c08f179444fb344e6d3c841d602e` at its original base and `git diff origin/main 5d8d8e1c` now both show exactly three added lines: `.github/workflows/pr-full-test.yml:30 timeout-minutes: 30` under `full-test`, `.github/workflows/repo-standards-enforcement.yml:27 timeout-minutes: 10` under `standards`, `.github/workflows/vsix-proprietary-guardrails.yml:22 timeout-minutes: 10` under `verify-vsix-guardrails`. The rebase over #721 (which added a step to the `standards` job) applied without conflict.
- **LD2 (budgets vs observed)**: `gh run list --workflow <name> -L 100` (window 2026-11-19T19:42Z to 2026-11-26T00:59Z), successful runs only, wall-clock seconds:
  - PR Full Test (`full-test`, limit 1800 s): 46 runs, min 791, median 914, p95 1150, max 1531 (run 45221551410: about 10 min setup and 15 min test step, no retry). Headroom 1.18x at the maximum, 1.57x at p95. The other 54 runs ended `cancelled` (39, concurrency) or `failure` (15); none timed out (no limit existed).
  - Repo Standards (`standards`, limit 600 s): 96 runs, min 81, median 129, p95 142, max 150. Headroom 4.0x.
  - VSIX Guardrails (`verify-vsix-guardrails`, limit 600 s): 96 runs, min 37, median 77, p95 98, max 116. Headroom 5.2x.
  The values 30/10/10 are the owner-approved ones in #708 (its 2026-11-23 comment keeps 30 while flagging the tail).
- **LD3 (validation)**: rhysd/actionlint v1.7.12 (archive sha256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`, equal to the release's published checksums; record `.failsafe/governance/evidence/issue-708/ACTIONLINT-708.md`): exit 0, no findings, on the three files at `main@50a943c7` and at `5d8d8e1c`, and earlier on main 7863a29e, the original candidate and the #721 composition.
- **LD4 (other jobs)**: `grep -n timeout-minutes .github/workflows/*.yml` at `5d8d8e1c` -> `.github/workflows/cross-platform-compile.yml:25 30`, `.github/workflows/oss-sast.yml:21 30`, plus the three added; no existing value changes.

## Phase 1: the recovered change (no edits)

### Affected Files

- `.github/workflows/pr-full-test.yml`, `.github/workflows/repo-standards-enforcement.yml`, `.github/workflows/vsix-proprietary-guardrails.yml` - one job-level `timeout-minutes` line each

### Changes

None beyond `5d8d8e1c`.

## Definition of Done

### Deliverable: PR workflow timeouts

- **D1**: exactly these claims:

| Row | Claim | Proof |
|---|---|---|
| T1 | `full-test` has `timeout-minutes: 30`; `standards` and `verify-vsix-guardrails` have `timeout-minutes: 10`, each at job level | readback (LD1) and actionlint parse |
| T2 | Nothing else in any workflow changes: the diff from main is exactly those three lines; triggers, matrix, concurrency, draft skips, permissions and steps are unchanged | `git diff --stat origin/main 5d8d8e1c` = 3 files, 3 insertions; `git diff` content |
| T3 | The three workflows are valid for actionlint 1.7.12 before and after (no findings, exit 0) | LD3 |
| T4 | Each limit exceeds the maximum successful duration in the LD2 window: `full-test` 1800 s over 1531 s (1.18x, thin, disclosed), `standards` 600 s over 150 s (4.0x), `verify-vsix-guardrails` 600 s over 116 s (5.2x) | LD2 |
| T5 | The jobs run green under the new limits on the exact head | exact-head CI at the pushed head (recorded at substantiation) |
| T6 | After adoption, `timed_out` conclusions of these three jobs are watched; any one is reported on #708 with its run id rather than silently re-run | post-merge condition, recorded in the closure comment |

**Not claimed**: that `full-test` cannot time out (the retry path and the long tail can exceed 30 minutes); linting of `run:` bodies; a guard against later removal of the values; any effect on the #695 extglob exposure beyond bounding minutes.

- **D2**: three workflow files, one line each.
- **D3**: ledger entries for audit, implementation and seal under session `2026-11-26T0210-e0eb44` on this branch; evidence under `.failsafe/governance/evidence/issue-708/`.
- **D4**: actionlint re-run on the committed head; exact-head CI green under the limits (T5).

## CI Commands

- `actionlint .github/workflows/pr-full-test.yml .github/workflows/repo-standards-enforcement.yml .github/workflows/vsix-proprietary-guardrails.yml` (scratchpad binary, v1.7.12)
- `git diff --stat origin/main HEAD`
