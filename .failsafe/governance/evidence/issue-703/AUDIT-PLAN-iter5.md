# AUDIT REPORT

**Tribunal Date**: 2026-11-24T21:40:00Z
**Target**: `.failsafe/governance/plans/plan-703-delivery-review-refresh-race.md` (iteration 5, raw sha256 d1e14594f7d76611fb21a5948ec2f63d61b84b7536a7fa41030cb3888302b47f, equal to the plan gate `plan_sha256`; supersedes iteration 4 7cf505cd...)
**Scope audited**: PR #706 head c38f970d045bb0fddad53bcd5436f4c642690f23 (merge base origin/main b03e47b75a1e0c5f486e3b0a3051005e8719dd55, 0 behind / 19 ahead, 3 files +378/-22) plus the Phase 2 candidate `.failsafe/governance/evidence/issue-703/candidate-iter5.patch` (sha256 c3ae5645f1e4f7db2576c976c1565f12abcf513a34359ef737af0568cfb9ae9c, equal to the plan's statement)
**Session**: `2026-11-24T1904-4e594e`; plan gate `.qor/gates/2026-11-24T1904-4e594e/plan.json` (= plan-iter5.json)
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge (a fifth fresh-context independent subagent; did not author the plan, the candidate or any earlier audit). Mode: solo (`should_run_adversarial_mode()` False; no `external_reviewer` in `.qorlogic/config.json`; both capability shortfalls emitted). `audit_risk_score`: option_b_required true (flag config-file-cite); this fresh-context audit is the Option B independent review.
**Tooling**: qor-logic 0.176.1 as installed, QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Windows

---

## VERDICT: VETO

---

### Executive Summary

Iteration 5 closes both iteration-4 grounds, and the closures hold when re-run. Y13 is killed by the extended fallback test (review.test:124). X8 is killed by three of the four stale-listing variants (refresh.test:30-52). Every earlier ground is closed (table below). K1-K16, J1-J12, J16, J17, X1-X12, X15-X18, and Y1-Y5, Y7, Y8 and Y10-Y20 are all killed, as D4 states. J13-J15, X13, X14, Y6, Y9 and Y18 survive. The red-first counts (36/3 on the c38f970d renderer, 15/24 on origin/main), the assertion inventory (106 / 131, five replacements), the Razor figures and the full LD1-LD10 re-walk all reproduce. tsc gives rc 0. The Judge found no defect in the candidate source: it passes all seven Judge probes below.

The plan still cannot proceed. Three locked behaviours have no test that fails when the behaviour alone is broken. This is the rule all four earlier audits applied. Each surviving mutant was confirmed non-equivalent by a Judge probe that the candidate passes and the mutant fails.

- **V1 (Z14, Z21).** Every test of "the picked commit survives a repaint" (D1, LD10) runs on an intent that has a trusted VETO. Two mutants survive all 39 cases:
  - Z14 gates the commit restore on the form holding rework picks;
  - Z21 registers the form's `change` listeners only when rework picks exist.

  Under either, on the ordinary path (no VETO yet, two or more linked commits) a repaint resets the operator's older pick to the newest commit. A PASS then posts the newest commit.
- **V2 (Z8).** LD10 says each rework pick is restored "for that VETO id". If picks are restored by position instead, all 39 cases pass, because the VETO set is never changed between repaints. When a listed VETO leaves the list while another stays, the remaining VETO's pick is replaced by the departed one's.
- **V3 (X14 = Z20, and Z2).** D4 records X14 (note draft tagged with `renderer.selectedId`) as "equivalent in every reachable state". That is false. The intent picker writes `selectedId` synchronously and the old panel stays on screen and editable until the new view paints (renderer:280, :258). A note typed or a commit picked in that window is then tagged with the other intent. Its sibling for the form, Z2, survives for the same reason. PROBE-X14 and PROBE-Z2 fail under the mutants and pass on the candidate.

### Preflight and Step 0

- `qor-logic governance-health --profile skill-entry`: all 8 artifacts OK (META_LEDGER pre-anchor residuals disclosed and tolerated; post-anchor band clean).
- `python -c "import qor.reliability"`: OK.
- Step 0 prior artifact: found and valid (`plan.json`, errors []).
- Step 0.3 `plan_iteration_status_lint`: rc 0.
- Step 0.4 unchanged-plan: should_skip false (d1e14594... differs from the iteration-4 target 7cf505cd...).
- Step 0.5: `cce.check` and `cce.check_session_total` both None before this audit. The prior signatures are {coverage-gap, test-failure, razor-overage}, {coverage-gap, infrastructure-mismatch}, {coverage-gap} and {coverage-gap}.
- `current_phase_plan_path()` cannot resolve a phase branch on `fix/703-delivery-review-note-refresh-race` (as in iterations 1-4). Every plan-path lint was run with the explicit target plan path.
- Step 0.6 ladder (WARN-only). These are clean: plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint, delivery_branch_lint, plan_signature_widening_caller_lint, plan_data_round_trip_lint and plan_feature_tdd_lint. gate_schema_freeze_lint: 0 unjustified. Findings:
  - plan_grep_lint: the same 4 false-positive WARNs as iterations 2-4 (N1).
  - ci_coverage_lint: 1 WARN (oss-sast semgrep install, out of scope).
  - workspace_fragility_check: high, pre-existing.
  - plan_live_progress_lint: no finding in a delivery file.
  - publication_boundary_lint: 538 structural findings, pre-existing.
  - sg_closure_lint: crashed (FileNotFoundError on the repo-relative doctrine path), recorded as SKIP.
- Step 0.7 spec-delta: the plan declares no deltas, so the pass does not apply.
- Prompt Injection Pass: rc 0. The four `<script` code-span WARNs are in historical META_LEDGER text; the plan is clean.
- Version-Applicability Pass: `version_applicability.validate` raises FileNotFoundError on `pyproject.toml` (Node repository), recorded as SKIP. Manual check: `change_class: hotfix` at package 6.0.13 (highest tag v6.0.13). The non-goals exclude any bump. No finding.
- Runtime Contract Walk: 0 findings.
- Ledger: `qor-logic verify-ledger --post-anchor --boundary 382` reports post-anchor clean. Entry #979 recomputes: `ledger_hash.chain_hash(1de2ce45..., 2762f696...) = 5ef487766ea9e2dd46a1b00724de4044718e57df2f00a9016e37c417856c2064`, and the LF-normalized sha256 of AUDIT-PLAN-iter4.md equals its content hash.

### Empirical method

The Judge made its own detached worktree at c38f970d in its own scratch directory, with a junction to the main tree's `node_modules`. `wt703` was not touched, and nothing was written under the main tree's `FailSafe/`.

- LD1 reproduces: the three blobs, `rev-list --left-right --count` = `0 19`, the merge base, the diff stat (3 files, +378/-22), HEAD c38f970d and the patch sha256.
- `git apply --check` was clean, and after every mutant run `git apply -R --check` confirmed that the tree equals the candidate.
- Per-file diff hashes across candidate-iter2..iter5: the renderer, `delivery-dom.js`, `delivery-review-controls.js` and the old test file are byte-identical in all four. Only the refresh suite, the review suite and the fixture differ. This confirms plan:39 ("no source byte differs").

Results:

- Candidate: 39 passing, 0 failing (author's `run703.sh`).
- Red-first with the candidate tests:
  - c38f970d renderer: 36 passing, 3 failing (the picked-commit, commit-fallback and rework-per-VETO cases);
  - origin/main renderer: 15 passing, 24 failing.

  Both match D4 (plan:119).
- `npx tsc -p ./ --noEmit`: rc 0.
- `eslint --ext ts src/test/roadmap/`: 0 errors (24 warnings). `npm run lint` is `eslint src --ext ts`. The 5 `no-undef document` errors that eslint gives on the JS modules when they are named directly are a config artifact, and the c38f970d renderer gives the same.
- Assertion inventory (author's `asserts703.py`): 106 baseline and 131 new assertions. Exactly 5 baseline assertions are not verbatim, each one of the five C2 replacements. The two removed test names are the two parameterised names C2 records. Matches plan:119.
- Razor (author's `razor703.cjs`, re-run, plus `wc -l`): see the Razor table.
- Author mutants (`mutants703.py`): K1-K16 (18 mutants) all KILLED.
- Iteration-2 auditor mutants: J1-J12, J16 and J17 KILLED. J13-J15 SURVIVE (equivalent, as recorded).
- Iteration-3 auditor mutants: X1-X12 and X15-X18 KILLED. X8 is now killed by the selection-less, empty and invalid stale-listing variants. X13 and X14 SURVIVE. For X14, see V3.
- Iteration-4 auditor mutants: Y13 is now KILLED by the fallback test, and Y20 (= X8) is KILLED. The other Y mutants also reproduce iteration 4: Y1-Y5, Y7, Y8, Y10-Y12 and Y14-Y19 KILLED; Y6, Y9 and Y18 SURVIVE.
- Judge mutants Z1-Z21 of the Judge's own design (`.failsafe/governance/evidence/issue-703/zmut-iter5-auditor.py`, same calling convention as the earlier scripts). Each was run against the 39 cases, then again with the Judge probes:

| Mutant | Change (candidate file:line) | Against the 39 | With the probes |
| --- | --- | --- | --- |
| Z1 | review POST carries `renderer.selectedId` (controls:81) | survives | killed by PROBE-Z1 (pre-existing, N2) |
| Z2 | form tagged with `renderer.selectedId` (controls:104) | **SURVIVES** | killed by PROBE-Z2 (V3) |
| Z3 | message consumed on a paint of another intent (renderer:243-246) | killed (5) | - |
| Z4 | form cleared after a 200 review (renderer:358-361) | killed | - |
| Z5 | form cleared after any review completion (renderer:367) | killed | - |
| Z6 | click-time early return removed, disabled kept (controls:77) | killed | - |
| Z7 | note restore not run at build (controls:40) | killed (7) | - |
| Z8 | rework restore keyed by position, not VETO id (controls:55, :63) | **SURVIVES** | killed by PROBE-Z8 (V2) |
| Z9 | check after the detail GET moved after the candidates GET (renderer:219-220) | killed | - |
| Z10 | stale catch clears `selectedId` before its check (renderer:222-223) | survives | killed by PROBE-Z10 (insertion mutant, N3) |
| Z11 | selection written from a valid stale listing before its check (renderer:211-217) | killed | - |
| Z12 | submitted draft captured after a microtask (renderer:355) | killed | - |
| Z13 | in-flight flag not set on click (controls:78) | killed | - |
| Z14 | commit restore only when the form holds rework picks (controls:25) | **SURVIVES** | killed by PROBE-Z14 (V1) |
| Z15 | rework restore only when the form commit is the newest (controls:63) | killed (3) | - |
| Z16 | message shown on panels without a view (renderer:243) | survives | killed by PROBE-Z16 (N4) |
| Z17 | link 200 sets no message (renderer:424-425) | killed | - |
| Z18 | stale-listing check only on the invalid branch (renderer:212-213) | killed (3) | - |
| Z19 | draft clear ignores the posted text (renderer:359) | survives | equivalent (as J14: the identity clause implies the text) |
| Z20 | = X14: draft tagged with `renderer.selectedId` (controls:42) | **SURVIVES** | killed by PROBE-X14 (V3) |
| Z21 | form `change` listeners registered only when rework picks exist (controls:106) | **SURVIVES** | killed by PROBE-Z14 and PROBE-Z2 (V1) |

- Judge probes (`.failsafe/governance/evidence/issue-703/probe-iter5-auditor.test.ts`; run only in the scratch tree as `delivery-assessment-renderer.zprobe.test.ts`, then removed). The candidate passes all seven, giving 46 passing with the 39.
  - PROBE-Z14: two linked commits, no VETO. Pick the older commit and refresh; the older commit must still be picked. **Fails under Z14 and Z21.**
  - PROBE-Z8: VETOs #8 and #10. Pick a rework for #10 only. VETO #8 leaves the blocking list, then refresh. #10 must keep its pick. **Fails under Z8**, because #10 receives #8's empty pick.
  - PROBE-X14: two linkable intents. Change the intent picker to SEALED and hold SEALED's detail GET. While ACTIVE is still shown, type a note into its input, then release. SEALED must show no note, and ACTIVE must show it on return. **Fails under X14/Z20.**
  - PROBE-Z2: the same window, picking ACTIVE's older commit. SEALED must start at the newest commit, and ACTIVE must keep the pick. **Fails under Z2** (and under Z14/Z21).
  - PROBE-Z1: the same window, clicking Record PASS on the still-shown ACTIVE panel. The POST must carry ACTIVE. Fails under Z1 (N2).
  - PROBE-Z10: an old failed listing GET must not change `selectedId`. Fails under Z10 (N3).
  - PROBE-Z16: a completion message held for ACTIVE must not be consumed by an error panel. Fails under Z16 (N4).

### Earlier-VETO closure check

| Ground | Status | Evidence |
| --- | --- | --- |
| iter-1 V1 (repaint loses picked commit, note and rework) | Closed in code; see V1 for proof on the no-VETO path | LD10 implemented (controls:20-27, 52-72, 99-106); K11, K12, J2, J3, J8, J10, X1, Y13 killed |
| iter-1 V2 (generation checks untested) | Closed | check 231 deleted; K3-K6 each killed alone; X16, Y1, Y17, Z9, Z18 killed |
| iter-1 V3 (draft scoping, restore, link message scoping) | Closed | K8, K9, K9b, K10, K10b, K15, K16 killed |
| iter-1 V4 (file growth past 250) | Closed | `wc -l`: renderer 433, old test 296, new files 113, 15, 195, 146, 245; nesting max 3 |
| iter-1 N3 (fixed sleeps) | Closed | no sleeps in the candidate test files |
| iter-2 V1 (J2) | Closed | J2 killed (review.test:67) |
| iter-2 V2 (J1, J5, J16) | Closed | J1 killed by review.test:112-126; J5 by :128-154; J16 by :156-171 |
| iter-2 V3 (LD8 precedent) | Closed | `git cat-file -e c38f970d:FailSafe/extension/src/test/integrations/agent-cli/git-fixture.ts` succeeds |
| iter-3 V1 (X2, X3) | Closed | review.test:223-244; X2 and X3 killed at :236 |
| iter-3 V2 (X1) | Closed | review.test:140-142; X1 killed |
| iter-3 N4 (X8) | Closed | X8 killed by refresh.test:30-52 (invalid, empty and selection-less variants) |
| iter-3 N5/N7 (X13, X14 equivalent) | X13 closed; **X14 reopened** | X13 is equivalent (VETO ids are ledger entry ids, so no VETO id appears on two intents). X14 is not equivalent (PROBE-X14), see V3 |
| iter-4 V1 (Y13) | Closed | review.test:120-124; Y13 killed at :124 |
| iter-4 V2 (X8 reason inaccurate) | Closed | the D4 sentence is withdrawn (plan:42); X8 killed |
| iter-4 N2 (note on the default commit) | Closed | plan:43 |
| iter-4 N3 (Y6, Y9, Y18 equivalent) | Upheld with a qualification (N4) | Y9 and Y18 are equivalent. Y6 differs only on intent-less panels, which the Judge does not count as a claimed behaviour, consistent with iteration 4 |
| iter-4 C1, C2 | Met for Y13, X8 and the inventory | reproduced above; C1 is now incomplete for Z14, Z21, Z8, X14 and Z2 |
| C3 (all iterations) | Deferred to implement | not run by the Judge (N6) |

### Audit Results

#### Security Pass
**Result**: PASS. There are no auth placeholders, credentials, bypassed checks or mock returns. The UI in-flight guard is explicitly not the authority (LD9; `docs/FEATURE_INDEX.md:753` "the review lock is per window (fails closed)" reproduces). No server file is touched. Text reaches the DOM only through `textContent` (`delivery-dom.js:3-8`).

#### OWASP Top 10 Pass
**Result**: PASS.
- A03: relative URLs, with `encodeURIComponent` on the id (renderer:218).
- A04: `review()` keeps its catch (renderer:365) and resets in `finally` (:367-369). `post()` has no catch; this is pre-existing and disclosed (plan:12).
- A05, A08: not applicable.

#### Ghost UI Pass
**Result**: PASS. Every control maps to real logic (controls:75-88, 103-111). There is no progress element. A failed review re-enables retry and keeps the note (review.test:223-244).

#### Section 4 Razor Pass
**Result**: PASS

| Check | Limit | Candidate | Status |
| --- | --- | --- | --- |
| Max function lines | 40 | no added or changed function or test body over 40 (`razor703.cjs`); `suite()` callbacks 274 / 121 / 215, exempt and disclosed (plan:14, plan:63) | OK |
| Max file lines | 250 | new files 113, 15, 195, 146, 245 (`wc -l`); renderer 433 and old test 296, both below origin/main (482, 380), disclosed exclusion | OK |
| Max nesting depth | 3 | renderer 3, old test 3, others 1-2 | OK |
| Nested ternaries | 0 added | pre-existing only (plan:14); none in the new files | OK |

#### Self-Application Sub-Pass
**Result**: FAIL. `originating_remediation` is set ("FailSafe #703 (PR #706)"). The discipline #703 introduces is that a repaint or a late completion must never destroy or misattribute operator input, and that a race test must fail when the guard is broken. Applied to the plan:
- the picked-commit restore can be disabled on every intent without a VETO (V1);
- the rework restore can ignore the VETO id (V2);
- the draft and form intent tags can follow `selectedId` instead of the shown intent (V3).

In each case every planned test still passes. D4 also misstates one survivor as equivalent (V3), the same failure iteration 4 found for X8.

#### Test Functionality Pass
**Result**: FAIL (V1, V2, V3)

| Test description | Invokes unit? | Asserts on output? | Verdict |
| --- | --- | --- | --- |
| typed note survives a repaint, posts once, cleared after 200 (review.test:34) | yes | yes | PASS |
| older picked commit, note and rework survive a repaint and are posted (review.test:55) | yes | yes, but only with a VETO present (:57) | see V1 |
| note belongs to its commit (review.test:80) | yes | yes | PASS |
| note and pick belong to their intent (review.test:93) | yes | yes, but `show` (:99) awaits each switch, so `selectedId` always equals the shown intent when input happens | see V3 |
| picked commit no longer linked falls back and keeps the rework pick (review.test:112) | yes | yes (J1, Y3, Y13), with a VETO (:114) | PASS |
| each rework pick kept for its own VETO (review.test:128) | yes | yes for a stable VETO set (J5, X1, X18); the set never changes | see V2 |
| reviewing one commit keeps another commit's note (review.test:156) | yes | yes | PASS |
| later same-text / different-text edit survives a prior POST (review.test:173) | yes | yes | PASS |
| PASS and VETO cannot both submit (review.test:196) | yes | yes | PASS |
| rejected network / refused 409 POST keeps the note, re-enables review, retry posts it (review.test:223) | yes | yes | PASS |
| four stale listings (refresh.test:34) | yes | yes (K3, X8, Y1, Y20, Z11, Z18) | PASS |
| stale detail, delayed candidates, old failed GET (refresh.test:54, :78, :98) | yes | yes | PASS |
| late review / link result shown only on its own intent, once (refresh.test:116, 5 cases) | yes | yes | PASS |
| D1/LD10 picked commit kept across a repaint on an intent without a VETO | no killing test | - | VETO (V1) |
| LD10 rework restore by VETO id when the VETO set changes | no killing test | - | VETO (V2) |
| LD4/LD10 draft and form tagged with the shown intent during a pending intent switch | no killing test; D4's X14 equivalence statement is false | - | VETO (V3) |
| FX589 connect, wait for running, dashboard result | yes (Playwright, stub) | yes; the 250 ms delay alone cannot catch a regression, which plan:12 discloses | PASS |

`prose_test_lint --tests-dir tests` does not apply: there are no Python prose tests in scope.

#### Dependency Pass
**Result**: PASS. No dependency added.

#### Orphan Pass
**Result**: PASS

| File | Entry point connection | Status |
| --- | --- | --- |
| `delivery-dom.js` | imported by the renderer (renderer:26) and the controls module (controls:11) | Connected |
| `delivery-review-controls.js` | imported by the renderer (renderer:27), called in `stepCard` (renderer:349) | Connected |
| renderer | `src/roadmap/ui/command-center.js:26`, instantiated at :57 | Connected |
| new `.test.ts` suites | `vscodeTestConfigs.cjs:21` glob `out/test/!(extension-arch)/**/*.test.js` | Connected |
| `deliveryRendererFixture.ts` | imported by all three suites; compiled by tsc (rc 0); not matched by `*.test.js` | Connected |
| packaging | `copy-ui-js.cjs:38` mirrors every `.js` | Connected |

#### Macro-Level Architecture Pass
**Result**: PASS. There is no import cycle (renderer -> controls -> dom; renderer -> dom). The controls module reaches the renderer only through its parameter. The helpers are moved, not duplicated.

#### Feature Test Coverage Pass
**Result**: FAIL on substance for the first FX1010 row. Its descriptor is "the picked commit, rework picks and unsent note survive a repaint and are posted". The acceptance question fails for three variations:
- the picked commit on an intent without a VETO (V1);
- the rework picks when the VETO set changes (V2);
- input made during a pending intent switch (V3).

The second FX1010 row and the FX589 row pass.

#### Infrastructure Alignment Pass (full Locked Decision re-walk, iteration 5)
**Result**: PASS

- LD1: reproduces (above).
- LD2: c38f970d lines 195, 217, 222, 229, 231, 234, 239 reproduce; the candidate checks at 212, 219, 223, 228 reproduce.
- LD3: 194, 402, 403, 410, 411, 457 reproduce; candidate controls:77-86 and renderer:368.
- LD4: 193, 386, 391, 444, 447, 449 reproduce; candidate renderer:355-361 and controls:36-44.
- LD5: 254 reproduces; the candidate condition at renderer:243 matches the plan.
- LD6: spec 24, 29, 53, 72, 75, 87 reproduce; `playwright.config.ts:42  expect: { timeout: 5000 },` reproduces.
- LD7: every stated length reproduces (433, 113, 15, 195, 296, 146, 245; callbacks 274, 121, 215).
- LD8: `vscodeTestConfigs.cjs:21`, `adapter-panel.js:4`, `copy-ui-js.cjs:38` and the git-fixture precedent reproduce.
- LD9: `docs/FEATURE_INDEX.md:753` reproduces.
- LD10: implemented as written (controls:20-27, 52-72, 99-106). V1-V3 concern its proof, not its text.
- Callers (plan:94): at c38f970d, `reviewControls` / `reworkPicks` occur only at renderer 360, 365, 396-398, 421 and test 235; reproduces.
- Iteration history: the preserved plan-iter1..4.md hash to 80bd7180..., 59b15b1c..., 427eab02... and 7cf505cd..., as plan:18, 26, 33 and 39 state.
- Delivery-branch currency: no `pr_target`; 0 behind origin/main.

#### Filter-Stage Ordering Coherence
**Result**: PASS for the candidate code. In `refresh()` the stages run in this order: listing GET, check 212, invalid paint 213, no-intent paint 216, selection write 217, detail GET, check 219, candidates GET, check 228, paint. The order is topological, and the four stale-listing variants now pin the first check's position.

### Violations Found

| ID | Category | Location | Description |
| --- | --- | --- | --- |
| V1 | coverage-gap | delivery-review-controls.js:25, :106 (candidate); plan:66 (LD10), plan:116 (D1), plan:102 (unit test list), plan:119 (D4 C1); review.test:55-78 (VETO at :57), :112-126 (VETO at :114); plan gate FX1010 row 1 | The picked-commit restore across a repaint is proven only on intents that have a trusted VETO. Z14 (restore gated on rework picks) and Z21 (listeners registered only when rework picks exist) pass all 39 cases. On the common pre-review path, a repaint then resets the operator's older pick to the newest commit, and a PASS posts that commit |
| V2 | coverage-gap | delivery-review-controls.js:55, :63 (candidate); plan:66 (LD10 "the kept pick for that VETO id"), plan:12 (a superseded VETO's pick "disappears with that VETO"), plan:104; review.test:128-154; plan gate FX1010 row 1 | The rework restore "by VETO id" is proven only for a VETO set that never changes between repaints. Z8 (restore by position) passes all 39 cases. PROBE-Z8 shows a remaining VETO receiving a departed VETO's pick |
| V3 | coverage-gap | delivery-review-controls.js:42, :104 (candidate); renderer:280 (picker writes `selectedId` before the refresh), :258 (old panel stays until paint); plan:60 (LD4), plan:66 (LD10), plan:12 (each tagged with its intent), plan:119 (D4: "X13 and X14 (equivalent in every reachable state)"); review.test:93-110 | D4 records X14 as equivalent; PROBE-X14 falsifies that. During a pending intent switch, a note typed (X14) or a commit picked (Z2) on the still-shown panel is tagged with the other intent. Under the mutants it appears on the other intent and is lost from its own, and no planned test fails |

### Per-ground directives

#### Plan-text

**V1 (coverage-gap).** D1 (plan:116) says the picked commit survives any repaint on the same intent. LD10 (plan:66) says the commit is selected "if `reviewForm.intentId === I` and its `commitSha` is still linked". Neither depends on the intent having a VETO. The candidate does this (controls:25, :106).

The two tests that assert the commit pick after a repaint both configure a VETO:
- review.test:57 `vetoes([8, SHA2])`;
- review.test:114 `vetoes([8, SHA3])`.

The tests without a VETO either never repaint between pick and assertion (review.test:80-91, :156-171) or assert only the other intent (review.test:108). So the restore can be coupled to the presence of rework picks and every planned test still passes:
- Z14: `form && Object.keys(form.reworks).length && ...` at controls:25;
- Z21: `if (picks.length)` around the listener loop at controls:106, a plausible "only remember when there is something to remember" refactor.

This is the iteration-2 J2 / iteration-4 Y13 class: one input variation (no VETO) of a proven writer is never exercised. The plan must:
- name a test that fails under Z14 and Z21 (an intent with two linked commits and no VETO; pick the older; repaint; assert the pick, and that PASS posts it), and add both to D4; or
- narrow D1 and LD10.

**V2 (coverage-gap).** LD10 (plan:66) keys each kept rework pick by VETO id. The limitations (plan:12) say a superseded VETO's pick "disappears with that VETO", which implies the other picks stay with their own VETOs. The only multi-VETO test (review.test:128-154) keeps the same two VETOs in the same order across every repaint. So restoring by position (Z8: `Object.values(form.reworks)[idx]`, a natural array-shaped implementation) cannot be told apart from restoring by id.

The case is reachable. The panel lists only trusted, sealed VETOs (controls:54). The server lists a VETO row whose seal or payload no longer verifies as a different blocking kind with `commitTrusted: false` (`src/governance/delivery/deliveryReview.ts:522`, `:541`), so that VETO leaves the rework list while later ones remain. PROBE-Z8 fails under Z8. The plan must:
- name a test in which the VETO set changes between repaints (a VETO leaves while another with a kept pick remains), asserting the remaining pick, and add Z8 to D4; or
- narrow LD10 to a stable VETO set and say so in the limitations.

**V3 (coverage-gap).** LD4 (plan:60) and LD10 (plan:66) tag the note draft and the form with the intent whose controls were built (controls:42, :104 close over `intentId = view.intent.id`). The limitations (plan:12) say each is "tagged with its intent". D4 (plan:119) records X14 (draft tagged with `renderer.selectedId`) as "equivalent in every reachable state", following the iteration-3 audit's N5/N7.

That is not so. The intent picker's `change` handler sets `this.selectedId` synchronously and then refreshes (renderer:280). The previous intent's panel stays in the DOM and editable until the new view is painted (`target.replaceChildren(root)`, renderer:258). This is the same overlapping-refresh window #703 is about. Input in that window shows the difference:
- PROBE-X14: a note typed on the shown ACTIVE panel is, under X14, tagged SEALED. It is shown on SEALED and gone from ACTIVE.
- PROBE-Z2: a commit picked there is, under Z2 (form tagged with `selectedId`), applied to SEALED and lost from ACTIVE.

The candidate passes both probes. The only intent-scoping test (review.test:93-110) awaits every switch (`show`, :99) before any input, so `selectedId` always equals the shown intent and cannot separate the mutants. The plan must:
- withdraw the X14 equivalence sentence;
- name a test that edits the shown panel while an intent switch is pending (hold the new intent's detail GET) and asserts the note and pick stay with the shown intent;
- record X14 and Z2 as killed in D4.

Alternatively, narrow LD4, LD10 and the limitations accurately.

**Required next action:** Governor: amend plan text and the candidate patch's tests for V1-V3, re-record the patch sha256, then re-run `/qor-audit`. The Judge found no code defect, so no `/qor-debug` is required: all three grounds are missing proof, and V3 is also an inaccurate equivalence statement. See the Process Pattern Advisory first: this VETO is the third consecutive {coverage-gap} VETO in the session, so the legal next action is `/qor-remediate` before another audit round.

### Non-blocking notes

- **N1**: The 4 plan_grep_lint WARNs are false positives, as in iterations 2-4. `renderer:195` reproduces. `spec:42` is LD6's `playwright.config.ts:42`. `.test.js:21` is `vscodeTestConfigs.cjs:21`. `docs/FEATURE_INDEX.md:753` reproduces.
- **N2**: Z1 (the review POST carries `renderer.selectedId` instead of the shown intent) survives the 39 cases and is killed by PROBE-Z1 in the same pending-switch window as V3. The posted intent is pre-existing behaviour: c38f970d renderer:406 posts `view.intent.id`, and the plan moves it unchanged (D2 "no change to request URLs or bodies"). It is not a D1 or LD claim, so it is a note. The V3 test would naturally cover it.
- **N3**: Z10 (the stale catch clears `selectedId` before its check) survives and is killed by PROBE-Z10. It inserts a write that has no counterpart in the code, so it is not a misplacement of the guard. Recorded, not counted. The old-failed-GET test (refresh.test:98-114) could also assert `selectedId`, as the other stale tests do.
- **N4**: Z16 and the iteration-4 Y6 survive and are killed by PROBE-Z16. A held completion message is shown and consumed on an intent-less panel (error, invalid, empty). Consistent with iteration 4's N3, the Judge does not count an intent-less panel as "another intent" under D1. The limitations sentence "a completion message for intent A stays held until A is painted again" (plan:12) is, however, pinned by no test.
- **N5**: Z19, J13-J15, X13, Y9 and Y18 are equivalent. X13 is equivalent because VETO ids are ledger entry ids, so the same VETO id cannot appear on two intents.
- **N6**: The Judge did not run the full `npm test` (extension host), `npm run test:ui`, `prepush-validate.ps1` or the installed-VSIX check. D4 (C3) requires them at the final head.
- **N7**: `version_applicability.validate` and `sg_closure_lint` were recorded as SKIP (prerequisite absent); the manual version check is above.

### Conditions for any later PASS

- **C1**: The D4 mutant table adds Z14, Z21, Z8, X14 (moved from equivalent) and Z2, each KILLED by a named test at the exact Phase 2 tree, or the claims are narrowed accurately. K1-K16, J1-J12, J16, J17, X1-X12, X15-X18 and Y1-Y5, Y7, Y8, Y10-Y17, Y19, Y20 stay killed. J13-J15, X13, Y6, Y9, Y18 and Z19 stay recorded as equivalent or non-claimed, each with a verified reason.
- **C2**: The assertion inventory is re-run after the added tests.
- **C3**: Unchanged: `npm test` and `npm run test:ui` at the final head with no skip flags, counts recorded, plus the installed Windows VSIX observation.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

Cycle-count (Step 0.5): this is the fifth consecutive VETO on this plan in session `2026-11-24T1904-4e594e`. The signatures are:
- {coverage-gap, test-failure, razor-overage}
- {coverage-gap, infrastructure-mismatch}
- {coverage-gap}
- {coverage-gap}
- now {coverage-gap}

That is three consecutive same-signature VETOs, the escalator threshold (doctrine-governance-enforcement section 10.4). The legal next action is `/qor-remediate`, not another plan-and-audit round. Each round since iteration 2 has killed the mutants the previous auditor named and then fallen to the next writer or input variation nobody enumerated.

Iteration 4's advisory asked for an enumeration of every writer and every input variation of each D1 / LD clause, and iteration 5 answered only the two named mutants. The remediation should produce that enumeration before the next audit. For the form and draft, the writers are:
- commit change, rework change, note input;
- fallback, unlink, VETO set change;
- intent switch (pending and settled);
- review success and failure.

The input variations are:
- with and without a VETO;
- one and several VETOs, stable and changing;
- shown intent equal to and different from `selectedId`.

The alternative is to narrow D1 to exactly what the tests prove.

### Shadow Genome

The Shadow Genome entry for this VETO is appended to `docs/SHADOW_GENOME.md` as Failure Entry #341.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #980 and in the gate artifact `.qor/gates/2026-11-24T1904-4e594e/audit-iter5.json`.

---
_This verdict is binding. Gate LOCKED. Required next action: `/qor-remediate` (cycle-count escalation), then the Governor amends the plan and the candidate tests for V1-V3 and re-runs `/qor-audit`._
