# IMPLEMENT report: plan-708 iteration 3 (#708)

**Session**: `2026-11-26T0210-e0eb44`. **Plan**: `.failsafe/governance/plans/plan-708-ci-job-timeouts.md` iteration 3, sha256 4b025dc6c63dcdf2cf10485a170630546afc2a089f0a9ffe238e052fbda124c4; audit PASS L2 Entry #998; iterations 1-2 VETO Entries #996-#997 stand.

## Gate and lock

- `verdict_reconcile --report AUDIT-PLAN-iter3.md --artifact audit.json` -> 0 findings.
- `intent_lock capture` -> `LOCKED: 2026-11-26T0210-e0eb44`.

## Change

No new source commit. The audited candidate is `5d8d8e1cc86ea414cdce0009e7440689b94a4fdd` on `fix/708-ci-job-timeouts` (parent `main@50a943c7`): the existing `candidate/708-ci-timeouts-unreviewed@b1874170` cherry-picked (`-x`) and rebased. `git diff --numstat origin/main HEAD`: `pr-full-test.yml` 1/0, `repo-standards-enforcement.yml` 1/0, `vsix-proprietary-guardrails.yml` 1/0 (`timeout-minutes` 30, 10, 10 at job level).

## Verification

- actionlint 1.7.12 (archive sha256 verified; `ACTIONLINT-708.md`) on the three files at the committed head: exit 0, no findings.
- Job-duration evidence: `job-durations-snapshot.json` (from `runs-<workflow>.json` via `jobdur708.py`), as stated in plan LD2.
- No product source changed, so the extension test suites are not affected; `npm run test:node` is re-run before the push as the records-commit guard.
- Exact-head CI under the new limits (T5) and post-adoption `timed_out` watch (T6) remain conditions.

This is not a seal, merge or release.
