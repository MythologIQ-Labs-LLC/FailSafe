# Plan: job-level timeouts for the three PR workflows that lack one (#708)

**change_class**: hotfix
**doc_tier**: minimal
**terms**: none
**iteration**: 1
**Risk Grade**: L2
**Baseline**: protected `main@50a943c7d60c6b1f020014f1c28b2354ba827c76` (includes merged #721 and #737)
**Candidate**: local commit `5d8d8e1c` on `fix/708-ci-job-timeouts` = the existing candidate `candidate/708-ci-timeouts-unreviewed@b18741701384c08f179444fb344e6d3c841d602e` cherry-picked (`-x`) and rebased onto the baseline (not pushed)
**originating_remediation**: FailSafe #708 (owner decision 2026-11-17, option (c) on the #695 picomatch PR-CI scope)

**boundaries**:
- limitations: a timeout bounds a runaway job's minutes; it does not prevent the extglob cost itself (that is the #695 dependency lane); actionlint ran without its optional shellcheck and pyflakes script linters (absent on this host), so `run:` bodies are not linted; no repository test guards these values against later removal
- non_goals: triggers, matrix legs, `concurrency`, draft skips, permissions, steps or any other workflow content; the #695 dependency remediation; a regression test for the timeout values
- exclusions: none

## Authority and scope

Owner decision recorded in #708 (2026-11-17): add a job-level `timeout-minutes` to exactly `pr-full-test.yml` (`full-test`, 30), `repo-standards-enforcement.yml` (`standards`, 10) and `vsix-proprietary-guardrails.yml` (`verify-vsix-guardrails`, 10); leave everything else unchanged; `.github/workflows/**` is protected and this specific change is owner-approved; governance-class change needing its own native plan, independent audit, seal and local validation (actionlint or equivalent) before any push. Owner instruction (2026-11-25): recover the existing candidate, preserve its exact bounded scope, reconcile it with the integrated #721 workflow change, validate with actionlint, avoid unnecessary CI. actionlint use approved by the owner (2026-11-25).

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (recovery)**: `git diff origin/main...b18741701384c08f179444fb344e6d3c841d602e` at its original base and `git diff origin/main 5d8d8e1c` now both show exactly three added lines: `pr-full-test.yml:30 timeout-minutes: 30` under `full-test`, `repo-standards-enforcement.yml:27 timeout-minutes: 10` under `standards`, `vsix-proprietary-guardrails.yml:22 timeout-minutes: 10` under `verify-vsix-guardrails`. The rebase over #721 (which added a step to the `standards` job) applied without conflict.
- **LD2 (budgets vs observed)**: last successful runs from `gh run list`: Repo Standards up to 142 s after #721 (8dce7f54), VSIX Guardrails up to 103 s, PR Full Test up to 966 s; #708's own table (last 20 runs) 2 min, 1 min and 16 min maximum. Each limit is at least 1.8x the observed maximum.
- **LD3 (validation)**: rhysd/actionlint v1.7.12 (archive sha256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`, equal to the release's published checksums; record `.failsafe/governance/evidence/issue-708/ACTIONLINT-708.md`): exit 0, no findings, on the three files at `main@50a943c7` and at `5d8d8e1c`, and earlier on main 7863a29e, the original candidate and the #721 composition.
- **LD4 (other jobs)**: `grep -n timeout-minutes .github/workflows/*.yml` at `5d8d8e1c` -> `cross-platform-compile.yml:25 30`, `oss-sast.yml:21 30`, plus the three added; no existing value changes.

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
| T4 | Each limit leaves at least 1.8x headroom over the observed maximum successful duration | LD2 |
| T5 | The jobs run green under the new limits on the exact head | exact-head CI at the pushed head (recorded at substantiation) |

**Not claimed**: linting of `run:` bodies; a guard against later removal of the values; any effect on the #695 extglob exposure beyond bounding minutes.

- **D2**: three workflow files, one line each.
- **D3**: ledger entries for audit, implementation and seal under session `2026-11-26T0210-e0eb44` on this branch; evidence under `.failsafe/governance/evidence/issue-708/`.
- **D4**: actionlint re-run on the committed head; exact-head CI green under the limits (T5).

## CI Commands

- `actionlint .github/workflows/pr-full-test.yml .github/workflows/repo-standards-enforcement.yml .github/workflows/vsix-proprietary-guardrails.yml` (scratchpad binary, v1.7.12)
- `git diff --stat origin/main HEAD`
