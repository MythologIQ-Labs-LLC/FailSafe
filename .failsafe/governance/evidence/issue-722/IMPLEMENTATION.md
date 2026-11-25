# IMPLEMENT report: plan-721 iteration 4 (#722, #702; PR #721)

**Session**: `2026-11-25T1958-4f4867`. **Plan**: `.failsafe/governance/plans/plan-721-governance-currency-glossary.md` iteration 4, sha256 7db0173ed2b634fd01b001b3ff0ea0d66debf81deb6eea2655cdad50a8d1fd69; audit PASS Entry #988 with record correction #989 (the report's Target line reformatted so `verdict_dialect` reads it; verdict unchanged); iterations 1-3 VETO Entries #985-#987 stand.

## Gate and lock

- `verdict_reconcile --report AUDIT-PLAN-iter4.md --artifact audit.json` -> 0 findings (after #989; the first run found `report-unreadable`, which was corrected by the auditor, not by the implementer).
- `intent_lock capture` -> `LOCKED: 2026-11-25T1958-4f4867` (re-captured after the correction).
- Baseline: HEAD `bc3786a5d4d123375d2fd86e6ba967dfe95ef78f` (two-parent merge of #721 `d208937c` and `main@7863a29e`); `candidate-iter4.patch` sha256 7fd46c9b7f6a0bd03f3d0c4e79c28a79dfa3a5ffbfa0a2471e87c1151845ebaa.

## Change

Commit `71edad8f` on `fix/702-close-sentry-glossary-fence-20261118`: `git apply --cached candidate-iter4.patch`, then `git checkout --` of exactly the 12 patched paths (the uncommitted audit records in `docs/META_LEDGER.md` and `docs/SHADOW_GENOME.md` were not touched); 12 files, +524/-391. Every staged blob equals the audited prototype (LF-normalized sha256 compared per file, 0 mismatches).

## Verification (Windows 11 Pro 10.0.26300, Node 24.19.0, worktree `.failsafe/worktrees/pr721`)

- Four governance suites: 31 tests, 30 pass, 1 skipped (the Windows file-symlink case), 0 fail.
- `npm run compile` exit 0; `npm run lint` 0 errors (138 pre-existing warnings).
- `tools/reliability/prepush-validate.ps1`, no skip flags:
  1. First run used a `node_modules` junction to the main checkout; the extension host failed to load Mocha (`Cannot read properties of undefined (reading 'describe')`, two Mocha instances through the junction and real path). Environmental; the junction was removed (`rmdir`, target untouched) and `npm ci` run in the worktree.
  2. Second run: lint 0 errors; extension host `npm test` 6228 passing, 34 pending, 2 failing; architecture host 19 passing. The two failures are `integrations/bicameral install-handler` cases whose trusted-executable resolver rejects every `pip` candidate because the worktree path contains `.failsafe/` (an excluded folder): environmental, caused by the worktree location; #721 changes no Bicameral code, and both cases passed in the main checkout's gate the same day (6230 passing, 0 failing). The gate stops at that step, so the rest was run directly: `test:node` 1198 tests, 1187 pass, 1 fail, 10 skipped (the failure is the pre-existing full-clone `g4Witness.test.cjs:110`, corrected by #696; +28 tests and +1 skip versus main's 1170/9); `test:ui` 264 passed, 4 skipped; `package-target.cjs --host` packaged (193 files, 7.47 MB) and `validate-vsix.cjs` PASS.
- `node FailSafe/extension/scripts/check-governance-currency.cjs --enforce` -> 0 errors, 0 warnings, exit 0; `check-architecture-index.cjs` PASS (49 rows).
- Frozen glossary parser on the committed tree: 17 entries; `check_orphans` and strict `run_all_checks_from_plan` PASS.
- actionlint 1.7.12 (archive sha256 verified) on `.github/workflows/repo-standards-enforcement.yml`: exit 0, no findings.

## D4

- C1: mutation maps at the committed tree equal `map-*-iter4.txt` (own 42 killed, C22/C23 equivalent; iteration-1 auditor set 10 killed, J11 note, J2/J5/J5b not applicable; iteration-2 set 5/5; iteration-3 set 4/4).
- C2: four suites pass as above.
- C3: counts above; exact-head CI pending the checkpoint push.

This is not a seal, merge or release.
