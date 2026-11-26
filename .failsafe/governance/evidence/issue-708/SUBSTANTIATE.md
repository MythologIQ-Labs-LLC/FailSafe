# SUBSTANTIATION REPORT: plan-708-ci-job-timeouts (iteration 3)

**Timestamp**: 2026-11-26T02:51:15Z
**Phase**: SUBSTANTIATE
**Judge**: The Qor-logic Judge, a fresh-context independent subagent. It authored none of the plan, candidate, snapshot, script, audits or implementation record.
**Session**: `2026-11-26T0210-e0eb44`
**Target**: draft PR #738 (issue #708), branch `fix/708-ci-job-timeouts`, `origin/main...19767723d865cd25b48766b3fc6f76417e4e5713` (origin/main 50a943c7d60c6b1f020014f1c28b2354ba827c76, re-fetched; it is the merge base and the PR base). Implementation commit 5d8d8e1cc86ea414cdce0009e7440689b94a4fdd (`cherry-pick -x` of b18741701384c08f179444fb344e6d3c841d602e; parent 50a943c7), records commit 19767723 (PR head, pushed; `git ls-remote` and `gh pr view 738` agree).
**Plan**: `.failsafe/governance/plans/plan-708-ci-job-timeouts.md` iteration 3, raw sha256 and LF-normalized `content_hash` both 4b025dc6c63dcdf2cf10485a170630546afc2a089f0a9ffe238e052fbda124c4 (equal to `implement.json` `plan_sha256`)
**Authority chain**: #996 VETO, #997 VETO (both stand), #998 PASS L2 (`AUDIT-PLAN-iter3.md`), #999 IMPLEMENT (`IMPLEMENTATION.md`, content hash ae3b55b7... recomputed)
**Risk Grade**: L2
**change_class**: governance (version-not-applicable: no bump, no tag)
**Tooling**: qor-logic 0.176.1 (installed, not modified), QOR_SKILL_ACTIVE=substantiate, QOR_MODEL_FAMILY=claude; rhysd/actionlint 1.7.12 scratchpad binary (`actionlint.exe` sha256 54ca21be3de4c7cfa26914aa8b61bd76bf573ef3caac5f80d110558cdf241718, equal to `ACTIONLINT-708.md`); gh CLI read-only; the Judge's own recompute script (`t4.py`, scratchpad, `python -I`); Windows 11 Pro 10.0.26300
**Skill followed**: installed `qor-substantiate/SKILL.md`

---

## VERDICT: PASS (SESSION SEAL, Entry #1000)

Reality matches Promise. T1-T4 were re-executed by the Judge on the committed tree, the committed snapshot and the live jobs API, not read from records. T5 concluded green: every exact-head workflow at 19767723 succeeded, and the three affected jobs ran under the new limits well inside them. T6 is a post-merge condition and is recorded, not claimed. No ABORT-class gate fails in a way this repository has not already declared inapplicable; skips and deviations are disclosed below.

Seal: content hash 4b025dc6... (the plan), previous hash 66aeb59b... (#999), chain hash **d6f4979f41add36c897ca853a4809a8c3234065df601527c2453f89e60586b90**, Entry ID `07d407ee49aa`.

---

## Custody and Reality vs Promise

- `git diff --stat origin/main 5d8d8e1c`: 3 files, 3 insertions, 0 deletions. Content: `timeout-minutes: 30` at `.github/workflows/pr-full-test.yml:30` (job `full-test`, name `Full Test Suite (test:all)`), `timeout-minutes: 10` at `.github/workflows/repo-standards-enforcement.yml:27` (job `standards`), `timeout-minutes: 10` at `.github/workflows/vsix-proprietary-guardrails.yml:22` (job `verify-vsix-guardrails`). Each line sits at job-key indentation directly after `runs-on`, i.e. job level, not step level.
- `git diff 5d8d8e1c 19767723 -- .github FailSafe` is empty: the records commit changes no workflow or product source. Outside the plan, `evidence/issue-708/` and `.qor/gates/2026-11-26T0210-e0eb44/`, `origin/main..19767723` touches only `.qor/intent-lock/2026-11-26T0210-e0eb44.*`, `docs/META_LEDGER.md` and `docs/SHADOW_GENOME.md` (governance records).

| Planned (Phase 1) | Actual at 19767723 | Status |
|---|---|---|
| `.github/workflows/pr-full-test.yml` | +1 line, `timeout-minutes: 30` under `full-test` | EXISTS |
| `.github/workflows/repo-standards-enforcement.yml` | +1 line, `timeout-minutes: 10` under `standards` | EXISTS |
| `.github/workflows/vsix-proprietary-guardrails.yml` | +1 line, `timeout-minutes: 10` under `verify-vsix-guardrails` | EXISTS |

Missing: none. Unplanned source: none. `ledger_commitment`: OK (3 touched artifacts checked).

## Definition of Done

### D1: claim rows

| Row | Judge re-execution | Result |
|---|---|---|
| T1 | Readback of the three files at HEAD (above); `grep -n timeout-minutes .github/workflows/*.yml` -> `cross-platform-compile.yml:25 30`, `oss-sast.yml:21 30` (pre-existing, unchanged) plus exactly the three added; actionlint parses all three with no finding | HOLDS |
| T2 | Diff from main is exactly the three insertions; no trigger, matrix, `concurrency`, draft skip, permission or step line changed (no deletion, no other insertion). The `pr-full-test.yml` transport-retry step (lines 42-60) is unchanged | HOLDS |
| T3 | actionlint 1.7.12 (binary hash above; `-version` 1.7.12, go1.26.1 windows/amd64), `-no-color`, on the three files: at HEAD (worktree) exit 0, no output; at main 50a943c7 (blobs written with `git show` into a scratch tree) exit 0, no output | HOLDS |
| T4 | Recomputed from the committed `job-durations-snapshot.json` and `runs-<workflow>.json` with the plan's conventions (nearest-rank p95 = ceil(0.95 n)-th smallest; median = mean of the two middle values): for each workflow the snapshot row set equals the run list's `success` set exactly (no duplicates, no extras) and every row's `seconds` equals `completed_at - started_at`. `pr-full-test`: 100 runs = 46 success / 39 cancelled / 15 failure, window 2026-11-19T19:42:03Z..2026-11-26T00:59:24Z, min 787, median 900, p95 1024, max 1526 (run 45221551410), 1800/1526 = 1.18x, 1800/1024 = 1.76x. `standards`: 96 success / 4 failure, window 2026-11-21T17:33:13Z..2026-11-26T00:59:24Z, min 78, median 125, p95 138, max 145, 4.14x. `verify-vsix-guardrails`: 96 / 4, window 2026-11-20T11:13:41Z..2026-11-26T02:10:06Z, min 33, median 73.5, p95 94, max 111, 5.41x. All equal LD2 and the snapshot's stored stats. Live jobs-API spot check (6 rows, all attempt 1, success, times equal to the snapshot): 45221551410 16:53:30-17:18:56 = 1526 s (full-test max); 45730044400 = 854 s; 45224217350 = 145 s (standards max); 45732603370 = 111 s; 44853061381 = 111 s (VSIX max); 45740595247 = 70 s | HOLDS |
| T5 | Exact-head CI at 19767723 (read only; nothing triggered, re-run or cancelled; triggered by the push and draft PR #738). The pull_request runs use merge commit c8f67df1 (parents 50a943c7, 19767723) whose tree 81c2bf8f equals 19767723's tree, so the job definitions carrying the three `timeout-minutes` lines are the ones that ran. Affected jobs, latest attempt 1, conclusion success: PR Full Test 45743739447 `Full Test Suite (test:all)` 02:38:18Z-02:50:35Z = **737 s** of 1800 s (no transport retry fired; extension host 6249 passing, 15 pending; architecture host 19 passing; test:node 1199 tests, 1164 pass, 0 fail, 35 skipped; test:ui 264 passed, 4 skipped); Repo Standards Enforcement 45743739537 (pull_request) `standards` 02:38:17Z-02:39:52Z = **95 s** of 600 s, and 45743732222 (push) = **116 s** of 600 s; VSIX Proprietary Guardrails 45743739416 `verify-vsix-guardrails` 02:38:17Z-02:39:33Z = **76 s** of 600 s. Other workflows success: Cross-platform compile 45743739496 (ubuntu, windows, macos), OSS SAST 45743739455, Dependency Review 45743739432 | HOLDS |
| T6 | Post-merge commitment, not verifiable before adoption. Recorded: after merge, `timed_out` conclusions of `full-test`, `standards` and `verify-vsix-guardrails` are watched, and any one is reported on #708 with its run id rather than silently re-run; the closure comment must carry this | RECORDED (condition) |

### D2, D3, D4

- **D2**: three workflow files, one line each (above). Section 4 Razor: no functions, nesting or ternaries are introduced (three scalar YAML keys); no stub, TODO, dependency or `console.log`. PASS.
- **D3**: ledger #996-#999 recomputed: each Content Hash equals `ledger_hash.content_hash` of its report and each Chain Hash equals `chain_hash(content, previous)`; #996 links to #995 (2d777ace...). Evidence lives under `.failsafe/governance/evidence/issue-708/`.
- **D4**: actionlint re-run on the committed head by the Judge (T3); exact-head CI (T5).

## Protocol steps

| Step | Result |
|---|---|
| Governance health preflight | 8/8 OK |
| 0 gate check | `check_prior_artifact("substantiate")` found, valid (resolved `implement-iter1.json`, byte-identical to `implement.json`) |
| 2 state | audit.json PASS L2 (#998); implement.json present, `source_revision` = `audited_source_revision` = 5d8d8e1c |
| 2.5 version | `change_class: governance` -> version-not-applicable (GH #282); latest tag v6.0.13; Steps 7.5, 7.6 and 9.5.5 SKIP (no bump, no CHANGELOG stamp, no tag) |
| 3.5 blockers | `docs/BACKLOG.md` Security and Development Blockers: no open item |
| 4 test audit | no test added or changed this phase (the plan's Not claimed excludes a regression test for the values); presence-only gate therefore has nothing to refuse. No DB path (runtime-principal gate inapplicable). Not frontend; no `console.log` |
| 4.5 skill integrity | no skill file modified |
| 4.6 ladder | `substantiate_gates --skill <installed SKILL.md>` 10 gates, order verified; intent_lock VERIFIED; skill_admission ADMITTED; gate_skill_matrix 32 skills, 156 handoffs, 0 broken; session_id_lint rc 0; secret_scanner rc 0; procedural_fidelity rc 0; dod_check rc 0; merge_velocity rc 0 (`strained`, action narrow_scope); skill_size_budget WARN only (SKILL.md 37.0 KB); data_api_acl SKIP (no SQL migrations), `gate_skipped_prerequisite_absent` event ecb62a05 emitted and closed at emission by the declared permanent skip; continuity_gate rc 0 (no `execution_continuity` declared); install_drift OK |
| 4.6.14 publication_boundary_lint | rc 1: 565 findings, the same count recorded at #995 for the tree now on main; none in `evidence/issue-708/`, the plan or this session's gate directory (disclosure N1) |
| 4.7 doc_integrity strict | PASS (`minimal` tier, no terms) |
| 4.7.5 governance-index enforce | rc 0 after a hand-prepended 2026-11-26 Last Reviewed line (the top line was already dated 2026-11-26, so `--advance-last-reviewed` alone would only re-date #696's line, as handled at #616/#995) |
| 6 FEATURE_INDEX | Total 805 / verified 765 / unverified 0 / n/a 40; `feature_index_verify --snapshot 2026-11-25T2335-247ff7` rc 0; surface lint WARN FX922 (pre-existing; degradation event emitted) |
| 6 ac_close_guard | `--issues 708`: WARN, no machine-checkable acceptance criteria |
| 6.5 doc currency | no warnings |
| 6.8 hash gate | `validate_sha256` passed for merkle_seal, content_hash, previous_hash, chain_hash |
| 7.4 SSDF | `PS.2.1, RV.2.1` (disclosure N3) |
| 7.7 seal_entry_check | rc 1 `no parseable latest entry` after the plan-filename WARN (non-phase-tagged plan, ledger dialect), inapplicable here as at #984, #991 and #995; verified directly: Entry #1000 Content Hash = `content_hash(plan)` 4b025dc6..., Previous Hash = #999 Chain Hash 66aeb59b..., Chain Hash recomputed d6f4979f..., `previous_hash` unique; `ledger_hash verify` reports the same 2 pre-existing BREAKs (#341, #382) at main and here and no new break (#996-#1000 only TAINTED by that inheritance) |
| 7.7.5 seal_artifacts | governance class (release-only check exempt); plan filename has no numeric phase |
| 7.8 gate_chain_completeness | rc 0 but inspected 0 sessions (no phase-numbered seals), a vacuous pass; this session's `plan.json`, `audit.json`, `implement.json` and `substantiate.json` (with provenance) confirmed present directly |
| 7.9 spec_fold | no deltas declared |
| 8 staging cleanup | not performed: `.agent/staging/` holds tracked historical reports owned by other cycles |
| 8.5 dist_compile | SKIP: no `qor/skills` source in this consumer repository |
| 9.5-9.8 | not performed by the Judge: no commit, push, tag, merge or session rotation (caller's constraints) |

## Non-blocking disclosures

- **N1** `publication_boundary_lint` rc 1 with 565 pre-existing findings (same count as the #995 seal tree now merged to main); this cycle adds none. This report avoids absolute paths.
- **N2** `ACTIONLINT-708.md` records its runs at main 7863a29e, the original candidate b1874170 and the #721 composition, while plan LD3 and `IMPLEMENTATION.md` also claim exit 0 at main 50a943c7 and 5d8d8e1c without a table row for those trees; its closing "Limits" sentence still carries the superseded createdAt-based maxima (141 s, 103 s, 966 s), not LD2's job-execution figures. The Judge re-ran actionlint at both 50a943c7 and the committed head (T3), so T3 rests on the Judge's run; the stale sentence is evidence-file drift, not a claim row.
- **N3** `ssdf_tagger` argparse accepts only `feature|breaking|hotfix` and refuses `governance` (rc 2); it was run with `--change-class hotfix` (the non-release class nearest to governance; the tag set depends on changed files) and printed `PS.2.1, RV.2.1`.
- **N4** The plan's Candidate line still says "(not pushed)"; 5d8d8e1c is now on the pushed branch under PR #738 head 19767723. Append-only: recorded here, not edited.
- **N5** `qor-logic scripts substantiate_gates` needs `--skill`, and `current_phase_plan_path()` refuses this non-phase branch, so the plan path was passed explicitly.
- **N6** `docs/PROCESS_SHADOW_GENOME.md` gains two events from the gates: the data_api_acl skip (ecb62a05) and the FX922 surface-lint degradation.
- **N7** Uncommitted `.qor/session/current` (points at this session) predates this substantiation.
- **N9** `docs/META_LEDGER.md` hash-chain verify carries two pre-existing BREAKs (#341, #382) and undeclared gaps [158, 298], identical at origin/main; governance-health tolerates them as disclosed pre-anchor residuals. This seal adds no break.
- **N8** The `full-test` budget is thin (1.18x at the observed maximum) and the transport-retry path is unmeasured; both are the plan's own disclosed limitations and Not-claimed items, and they make T6 a load-bearing post-merge condition.

## Disposition

SEALED at Entry #1000 (chain hash d6f4979f...). Not merged, released or tagged; no version bump (governance class). Owner GO remains outstanding for any merge. Post-merge condition T6 (watch and report `timed_out` conclusions of the three jobs on #708 with run ids, no silent re-run) must be carried into the #708 closure comment.
