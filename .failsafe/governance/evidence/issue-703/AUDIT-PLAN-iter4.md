# AUDIT REPORT

**Tribunal Date**: 2026-11-24T20:42:15Z
**Target**: `.failsafe/governance/plans/plan-703-delivery-review-refresh-race.md` (iteration 4, raw sha256 7cf505cd00e3e6f41e96208424d2ca5065f5910fc28a0cd0e59be722d283ec92, equal to the plan gate `plan_sha256`; supersedes iteration 3 427eab02...)
**Scope audited**: PR #706 head c38f970d045bb0fddad53bcd5436f4c642690f23 (merge base origin/main b03e47b75a1e0c5f486e3b0a3051005e8719dd55, 0 behind / 19 ahead, 3 files +378/-22) plus the Phase 2 candidate `.failsafe/governance/evidence/issue-703/candidate-iter4.patch` (sha256 fe1b63e90d1c95f2e9b5939846265a8f1b00ad95d8d45e72272699cacd351c21, equal to the plan's statement)
**Session**: `2026-11-24T1904-4e594e`; plan gate `.qor/gates/2026-11-24T1904-4e594e/plan.json` (= plan-iter4.json)
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge (a fourth fresh-context independent subagent; did not author the plan, the candidate or any earlier audit). Mode: solo (`should_run_adversarial_mode()` False; no `external_reviewer` in `.qorlogic/config.json`; both capability shortfalls emitted). `audit_risk_score`: option_b_required true (flag config-file-cite); this fresh-context audit is the Option B independent review.
**Tooling**: qor-logic 0.176.1 as installed, QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Node v24.19.0, Windows

---

## VERDICT: VETO

---

### Executive Summary

Iteration 4 closes both iteration-3 grounds, and the closures hold when re-run: X1, X2 and X3 are each killed by the test the plan names. Every earlier ground is closed (table below). K1-K16, J1-J12, J16, J17 and X1-X18 reproduce exactly as D4 states, with J13-J15, X8, X13 and X14 surviving. The red-first counts, the assertion inventory, the Razor figures and the full LD1-LD10 re-walk all reproduce. tsc, lint and the FX589 and workspace-delivery Playwright cases pass on the candidate. The Judge found no defect in the candidate source; with one probe per clause, the candidate behaves as D1 and LD10 say.

The plan still cannot proceed. Two locked behaviours have no test that fails when the behaviour alone is broken. This is the rule all three earlier audits applied. Each survivor was confirmed by a Judge probe that passes on the candidate and fails under the mutant.

- **V1 (Y13).** LD10 says each rework pick is restored by its VETO id, whatever happens to the picked commit. If rework picks are dropped whenever the picked commit is no longer linked (a natural "reset the whole form" refactor), all 36 cases still pass. Then an Unlink of the reviewed commit (by this panel or another client) silently resets the operator's "Reworked by" picks. This is the iteration-2 J1 fallback path combined with the iteration-3 X1 class: one writer of the form is proven and its interaction with the other is not.
- **V2 (X8).** D1 says an older GET never changes the selected intent or replaces a newer view. D4 records X8 (the listing check moved below `this.selectedId = chosen.id`) as surviving. It gives the reason "observable only in stale-listing paths where the older listing would choose a different intent than the newer selection, which the newer refresh then overwrites". That reason is wrong in two ways. First, under X8 a stale listing that reports invalid integrity, or no intents, repaints the newer view with stale content. Second, when the listing lacks the current selection, the stale refresh rewrites `selectedId`. Nothing overwrites that: in the plan's own test ordering the newer refresh has already finished, and in the other ordering the newer refresh adopts the stale selection. Three Judge probes kill X8; the planned 36 cases do not.

### Preflight and Step 0

- `qor-logic governance-health --profile skill-entry`: all 8 artifacts OK (META_LEDGER pre-anchor residuals disclosed and tolerated; post-anchor band clean).
- `python -c "import qor.reliability"`: OK.
- Step 0 prior artifact: found and valid (`plan.json`, errors []). Step 0.3 `plan_iteration_status_lint`: rc 0. Step 0.4 unchanged-plan: should_skip false (7cf505cd... differs from the iteration-3 target 427eab02...). Step 0.5: `cce.check` and `cce.check_session_total` both None. The three prior VETO signatures are {coverage-gap, test-failure, razor-overage}, {coverage-gap, infrastructure-mismatch} and {coverage-gap}.
- `current_phase_plan_path()` raises "Not on a phase branch" on `fix/703-delivery-review-note-refresh-race` (as in iterations 1-3). Every plan-path lint was run with the explicit target plan path.
- Step 0.6 ladder (WARN-only). The following are clean: plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint, delivery_branch_lint, plan_signature_widening_caller_lint, plan_data_round_trip_lint and plan_feature_tdd_lint. gate_schema_freeze_lint: 0 unjustified. Findings:
  - plan_grep_lint: 4 WARNs, the same false positives as iterations 2-3 (N1).
  - ci_coverage_lint: 1 WARN (the oss-sast semgrep install, out of scope).
  - workspace_fragility_check: high, pre-existing (49 branches and the disclosed pre-anchor residuals).
  - plan_live_progress_lint: 403 findings, none in a delivery file.
  - publication_boundary_lint: 538 structural findings, pre-existing.
  - sg_closure_lint: crashed (FileNotFoundError on the repo-relative `qor/references/doctrine-shadow-genome-countermeasures.md`), recorded as SKIP (prerequisite absent).
- Step 0.7 spec-delta: the plan declares no deltas, so the pass does not apply.
- Prompt Injection Pass: no ABORT-class canary (rc 0). The four `<script` code-span WARNs are in historical META_LEDGER text; the plan is clean.
- Version-Applicability Pass: `version_applicability.validate` raises FileNotFoundError on `pyproject.toml` (Node repository) and is recorded as SKIP. Manual check: `change_class: hotfix` at package 6.0.13 implies 6.0.14, above the highest tag v6.0.13; the non-goals exclude any bump. No finding.
- Runtime Contract Walk: completed, no findings.
- Ledger: `qor-logic verify-ledger --post-anchor --boundary 382` reports post-anchor clean. Entry #978 recomputes with `ledger_hash.chain_hash(85b30a35..., bc2097d9...) = 2762f6968608ad6d3e682f56664bfdeb947b3fc20cbd3fb6e6ffed9940980b33`, and the LF-normalized sha256 of AUDIT-PLAN-iter3.md equals its content hash.

### Empirical method

The Judge made its own detached worktree at c38f970d in its own scratch directory, with a junction to the main tree's `node_modules`. The existing `wt703` worktree was not touched, and nothing was written under the main tree's `FailSafe/`. LD1 reproduces exactly: the three blobs, `rev-list --left-right --count` = `0 19`, the diff stat, HEAD c38f970d and the patch sha256. `git apply --check` was clean. Compared with candidate-iter3.patch and candidate-iter2.patch, only the `delivery-assessment-renderer.review.test.ts` hunk differs. The other six file diffs are byte-identical, which confirms plan:33 and plan:43 ("no source byte differs").

Results:

- Candidate: 36 passing, 0 failing (author's `run703.sh`).
- Red-first with the candidate tests:
  - on the c38f970d renderer, 34 passing and 2 failing ("an older picked commit, its note and the rework pick survive a repaint and are posted"; "each rework pick is kept for its own VETO");
  - on the origin/main renderer, 16 passing and 20 failing. Both match D4 (plan:113).
- `npx tsc -p ./ --noEmit`: rc 0. `eslint --ext ts src/test/roadmap/`: 0 errors (24 warnings).
- `npm run compile`, then Playwright `bicameral-advanced-tools.spec.ts` (FX589) and `workspace-delivery.spec.ts` in the scratch tree: 5 passed. This is not the D4 (C3) full-suite run, which stays required (N6).
- Assertion inventory (author's `asserts703.py`): 106 baseline and 130 new assertions. Exactly 5 baseline assertions are not verbatim, each one of the five replacements C2 records. The two removed test names are the two parameterised names C2 records. Matches plan:113.
- Razor (author's `razor703.cjs`, re-run): see the Razor table.
- Author mutants (`mutants703.py`): K1-K16 (18 mutants) all KILLED.
- Iteration-2 auditor mutants (`jmut-iter2-auditor.py`, `jmut2-iter2-auditor.py`): J1-J12, J16 and J17 KILLED. J13, J14 and J15 SURVIVE and are equivalent, as D4 records.
- Iteration-3 auditor mutants (`xmut-iter3-auditor.py`): X1, X2 and X3 now KILLED:
  - X1 by "each rework pick is kept for its own VETO" (review.test:125, assertion :139);
  - X2 by the refused (HTTP 409) case (review.test:221, assertion :233);
  - X3 by the network case (same test, :233).
  - X4-X7, X9-X12 and X15-X18 KILLED. X8, X13 and X14 SURVIVE, as D4 records.
- Judge mutants Y1-Y20 of the Judge's own design (`.failsafe/governance/evidence/issue-703/ymut-iter4-auditor.py`, same calling convention), each run against the 36 cases:

| Mutant | Change (candidate file:line) | Result against the 36 |
| --- | --- | --- |
| Y1 | generation captured after the listing GET (renderer:207) | killed (stale listing) |
| Y2 | draft clear without the identity clause (renderer:358) | killed (2) |
| Y3 | unlinked picked commit falls back to the oldest (controls:25) | killed (fallback test) |
| Y4 | in-flight reset only on a settled POST, not on rejection (renderer:368) | killed (network retry) |
| Y5 | review non-200 sets no message (renderer:364) | killed (2) |
| Y6 | message scoped to `this.selectedId` instead of the painted view (renderer:243) | survives: equivalent except on the error, invalid and no-intent panels, which show no intent (N3) |
| Y7 | draft-clear null guard dropped (renderer:358) | killed |
| Y8 | refresh after review not awaited (renderer:369) | killed (6) |
| Y9 | form mutated in place instead of replaced (controls:104) | survives: equivalent; nothing retains a reference to the replaced form (N3) |
| Y10 | PASS reworks captured at paint time (controls:110-111) | killed (2) |
| Y11 | message consumed on every paint (renderer:245) | killed (5) |
| Y12 | posted note read from the draft, not the input (controls:81) | killed (2) |
| **Y13** | rework picks restored only while the form's commit is still linked (controls:63) | **SURVIVES** (V1) |
| Y14 | commit pick restored only when no note draft exists (controls:25) | killed |
| Y15 | in-flight guard released when the buttons are repainted (controls:85-86) | killed |
| Y16 | draft cleared on 200 for any draft of the same intent (renderer:358-359) | killed (3) |
| Y17 | stale catch paints before its check (renderer:223-224) | killed |
| Y18 | draft commit read via `options[selectedIndex]` | survives: equivalent by construction (same value as `select.value`) |
| Y19 | link refusal sets no message (renderer:426) | killed |
| **Y20** | = X8: listing check moved below `this.selectedId = chosen.id` (renderer:212-217) | **SURVIVES** (V2) |

- Judge probes (`.failsafe/governance/evidence/issue-703/probe-iter4-auditor.test.ts`, run only in the scratch tree and then removed). The candidate passes all five, giving 41 passing with the 36:
  - PROBE-Y13: three linked commits, a VETO on the middle one. Pick the newest as the review commit and the oldest as its rework, unlink the picked commit, refresh. The commit falls back to the newest still linked and the rework pick must be kept. **Fails under Y13.**
  - PROBE-X8-invalid, PROBE-X8-empty, PROBE-X8-lacks-selected: the stale-listing order of refresh.test:29 (the newer refresh selects SEALED and completes), but the held listing answers `{ integrity: 'invalid' }`, `{ intents: [] }`, or a listing without SEALED. The panel must not be replaced and `selectedId` must stay SEALED. **All three fail under X8 (Y20).** Under X8, the invalid and empty cases repaint the newer view with stale content, and the third rewrites `selectedId` to ACTIVE after the newer refresh has finished.
  - PROBE-N-default (informational): see N2.

### Earlier-VETO closure check

| Ground | Status | Evidence |
| --- | --- | --- |
| iter-1 V1 (repaint loses picked commit, note and rework) | Closed | LD10 implemented (controls:20-27, 52-72, 99-106); K11, K12, J2, J3, J8, J10, X1 killed |
| iter-1 V2 (generation checks untested) | Closed | Check 231 deleted; K3-K6 each killed alone by its named test; X16, Y1, Y17 killed |
| iter-1 V3 (draft scoping, restore, link message scoping) | Closed | K8, K9, K9b, K10, K10b, K15, K16 killed |
| iter-1 V4 (file growth past 250) | Closed | `wc -l`: renderer 433, old test 296, new files 113, 15, 194, 141, 242; nesting max 3 |
| iter-1 N3 (fixed sleeps) | Closed | 0 sleeps in the candidate test files |
| iter-2 V1 (J2 survives) | Closed | J2 killed (review.test:67) |
| iter-2 V2 (J1, J5, J16 survive) | Closed | J1 killed by review.test:112-123; J5 by :125-151; J16 by :153-168 |
| iter-2 V3 (LD8 non-existent precedent) | Closed | `git cat-file -e c38f970d:FailSafe/extension/src/test/integrations/agent-cli/git-fixture.ts` succeeds |
| iter-2 N2, N3 | Closed | nested ternaries pre-existing only; J7 and X7 killed by review.test:146-149 |
| iter-3 V1 (X2, X3: refused or failed review erases the note) | Closed | review.test:220-241 parameterised over network and HTTP 409; X2 and X3 killed at :233; the retry posts the note (:238) |
| iter-3 V2 (X1: a later commit change drops rework picks) | Closed | review.test:137-139 changes the commit after the rework picks and refreshes; X1 killed at :139 |
| iter-3 N2 (refresh suite callback 116) | Closed | plan:14, plan:57 now state 116; reproduces |
| iter-3 N6 (35 was all three suites) | Closed | plan:113 now says the three suites hold 36 cases; reproduces |
| iter-3 N4 (X8) | Not closed; reclassified | D4 records X8 as surviving with a reason the Judge's probes falsify (V2) |
| iter-3 N5, N7 (X13, X14, J13-J15 equivalent) | Closed | recorded in D4; the Judge agrees they are equivalent |
| iter-3 C1, C2 | Met for X1-X3 and the inventory | reproduced above; C1 is now incomplete for Y13 and X8 (see C1 below) |
| C3 (all iterations) | Deferred to implement | not run in full by the Judge (N6) |

### Audit Results

#### Security Pass
**Result**: PASS. No auth placeholders, credentials, bypassed checks or mock returns. The UI in-flight guard is explicitly not the authority (LD9; `docs/FEATURE_INDEX.md:753` "the review lock is per window (fails closed)" reproduces). No server file is touched. All text reaches the DOM through `textContent` (`delivery-dom.js:3-8`).

#### OWASP Top 10 Pass
**Result**: PASS. A03: relative URLs, with `encodeURIComponent` on the id (renderer:218). A04: `review()` keeps its catch (renderer:365) and resets in `finally` (:367-369); `post()` has no catch, which is pre-existing and disclosed (plan:12). A05, A08: not applicable.

#### Ghost UI Pass
**Result**: PASS. Every control maps to real logic (controls:75-88, 103-111). There is no progress element. A terminal review error re-enables retry and keeps the note (review.test:220-241).

#### Section 4 Razor Pass
**Result**: PASS

| Check | Limit | Candidate | Status |
| --- | --- | --- | --- |
| Max function lines | 40 | no added or changed function or test body over 40 (`razor703.cjs` re-run); `suite()` callbacks 274 / 116 / 212, exempt and disclosed (plan:14, plan:57) | OK |
| Max file lines | 250 | new files 113, 15, 194, 141, 242 (`wc -l`); renderer 433 and old test 296, both below origin/main (482, 380), disclosed exclusion | OK |
| Max nesting depth | 3 | renderer 3, old test 3, others 1-2 | OK |
| Nested ternaries | 0 added | pre-existing only (plan:14); none in the new or changed test files or the controls module | OK |

#### Self-Application Sub-Pass
**Result**: FAIL. `originating_remediation` is set ("FailSafe #703 (PR #706)"). The discipline #703 introduces has two parts. An async completion or a repaint must never destroy operator input or replace a newer view, and a race test must fail when the guard is broken. Applied to the plan:
- the rework-pick restore can be coupled to the picked commit's link state with every planned test passing (V1, Y13);
- the stale-listing guard can be moved past the selection write with every planned test passing, while the plan describes that survivor inaccurately (V2, X8).

#### Test Functionality Pass
**Result**: FAIL (V1, V2)

| Test description | Invokes unit? | Asserts on output? | Verdict |
| --- | --- | --- | --- |
| typed note survives a repaint, posts once, cleared after 200 (review.test:34) | yes | yes | PASS |
| older picked commit, note and rework survive a repaint and are posted (review.test:55) | yes | yes (K11, K12, J2, J8, J10, Y14) | PASS |
| note belongs to its commit (review.test:80) | yes | yes (K8, K9b, J9) | PASS |
| note and pick belong to their intent (review.test:93) | yes | yes (K9, K13) | PASS |
| picked commit no longer linked falls back to the newest (review.test:112) | yes | yes for the commit (J1, Y3); it has no VETO, so rework survival across the fallback is not exercised | see V1 |
| each rework pick kept for its own VETO, also after a later commit change; VETO posts no reworks; PASS posts only the picked (review.test:125) | yes | yes (K12, J5, J7, X1, X7, X18, Y10) | PASS |
| reviewing one commit keeps another commit's note (review.test:153) | yes | yes (J16, K7, K8, Y12, Y16) | PASS |
| later same-text / different-text edit survives a prior POST (review.test:170) | yes | yes (K7, X15, Y2) | PASS |
| PASS and VETO cannot both submit (review.test:193) | yes | yes (K1, J4a-c, K14, J17, X17, Y15) | PASS |
| rejected network / refused 409 POST keeps the note, re-enables review, retry posts it (review.test:220) | yes | yes (X2, X3, Y4, Y5) | PASS |
| stale listing (refresh.test:29) | yes | yes for a listing with the same content (K3, Y1); no case varies the stale listing's content | see V2 |
| stale detail, delayed candidates, old failed GET (refresh.test:49, :73, :93) | yes | yes (K4-K6, X16, Y17) | PASS |
| late review / link result shown only on its own intent, once (refresh.test:111, 5 cases) | yes | yes (K2, K10, K10b, K15, K16, J12, X4, X10, X11, Y11, Y19) | PASS |
| LD10 rework restore by VETO id when the picked commit is unlinked | no killing test | - | VETO (V1) |
| D1 "an older GET never changes the selected intent or replaces a newer view" for a stale listing whose content differs | no killing test; D4's survival reason is inaccurate | - | VETO (V2) |
| FX589 connect, wait for running, dashboard result | yes (Playwright, stub) | yes; passes on the candidate; the 250 ms delay alone cannot catch a regression, which plan:12 discloses | PASS |

`prose_test_lint --tests-dir tests` does not apply: there are no Python prose tests in scope.

#### Dependency Pass
**Result**: PASS. No dependency added.

#### Orphan Pass
**Result**: PASS

| File | Entry point connection | Status |
| --- | --- | --- |
| `delivery-dom.js` | imported by the renderer and the controls module (controls:11) | Connected |
| `delivery-review-controls.js` | imported by the renderer, called in `stepCard` (renderer:349) | Connected |
| renderer | `src/roadmap/ui/command-center.js:26`, instantiated at :57 | Connected |
| new `.test.ts` suites | `vscodeTestConfigs.cjs:21` glob `out/test/!(extension-arch)/**/*.test.js` | Connected |
| `deliveryRendererFixture.ts` | imported by all three suites; compiled by tsc (rc 0); not matched by `*.test.js` | Connected |
| packaging | `copy-ui-js.cjs:38` mirrors every `.js` (`npm run compile` mirrored 129 files in the scratch tree) | Connected |

#### Macro-Level Architecture Pass
**Result**: PASS. The imports form no cycle (renderer -> controls -> dom; renderer -> dom). The controls module reaches the renderer only through its `renderer` parameter. The helpers are moved, not duplicated.

#### Feature Test Coverage Pass
**Result**: FAIL on substance for two rows.
- The first FX1010 row's descriptor is "the picked commit, rework picks and unsent note survive a repaint and are posted". Would the cited test fail if the rework picks were silently dropped by the picked commit's fallback (Y13)? No. Counted under V1.
- The second FX1010 row's descriptor is "a stale listing/detail/candidates/failed GET neither repaints nor keeps fetching". Would it fail if a stale listing could repaint with its own invalid or empty result (X8)? No. Counted under V2.
- The FX589 row passes.

#### Infrastructure Alignment Pass (full Locked Decision re-walk, iteration 4)
**Result**: PASS

- LD1: reproduces (above).
- LD2: c38f970d 195, 217, 222, 229, 231, 234, 239 reproduce; candidate checks at 212, 219, 223, 228 reproduce.
- LD3: 194, 402, 403, 410, 411, 457 reproduce; candidate controls:77-86 and renderer:368.
- LD4: 193, 386, 391, 444, 447, 449 reproduce; candidate renderer:355-361.
- LD5: 254 reproduces; the candidate condition at renderer:243 matches the plan.
- LD6: spec 24, 29, 53, 72, 75, 87 reproduce; `playwright.config.ts:42  expect: { timeout: 5000 },` reproduces.
- LD7: every stated length reproduces (`wc -l` 433, 113, 15, 194, 296, 141, 242; callbacks 274, 116, 212).
- LD8: `vscodeTestConfigs.cjs:21`, `adapter-panel.js:4`, `copy-ui-js.cjs:38` and the precedent `src/test/integrations/agent-cli/git-fixture.ts` reproduce.
- LD9: `docs/FEATURE_INDEX.md:753` reproduces.
- LD10: implemented as written (controls:20-27, 52-72, 99-106). As written, rework restore is independent of the commit fallback (controls:63), which is the clause V1 finds unproven.
- Callers (plan:88): at c38f970d, `reviewControls` / `reworkPicks` occur only at renderer 360, 365, 396-398, 421 and test 235; reproduces.
- Iteration history: preserved plan-iter1/2/3.md hash to 80bd7180..., 59b15b1c... and 427eab02..., as plan:18, 26 and 33 state.
- Consumer trace: the cited symbols are reached from the Delivery surface (`command-center.js` -> renderer -> controls).
- Delivery-branch currency: no `pr_target`; 0 behind origin/main.

#### Filter-Stage Ordering Coherence
**Result**: PASS for the candidate code. In `refresh()` the stages run in this order: listing GET, check 212, selection write 217, detail GET, check 219, candidates GET, check 228, paint. The catch path runs check 223, then the error paint. The order is topological. V2 concerns the fact that no test pins this order, not an inversion in the candidate.

### Violations Found

| ID | Category | Location | Description |
| --- | --- | --- | --- |
| V1 | coverage-gap | delivery-review-controls.js:63 (candidate); plan:60 (LD10), plan:110 (D1), plan:97 and plan:98 (unit test list), plan:113 (D4 C1); review.test:112-123, :125-151; plan gate FX1010 row 1 | LD10's rework restore "by VETO id" across the picked commit's fallback is unproven. Coupling the rework restore to the form's commit still being linked (Y13) passes all 36 cases. An Unlink of the reviewed commit then resets every "Reworked by" pick |
| V2 | coverage-gap | delivery-assessment-renderer.js:211-217 (candidate); plan:52 (LD2), plan:110 (D1), plan:113 (D4 C1, the X8 sentence), plan:37; refresh.test:29-47; plan gate FX1010 row 2 | D1's "an older GET never changes the selected intent or replaces a newer view" is unproven for a stale listing whose content differs. X8 passes all 36 cases, and D4's stated reason for X8's survival is falsified by PROBE-X8-invalid, -empty and -lacks-selected |

### Per-ground directives

#### Plan-text

**V1 (coverage-gap).** LD10 (plan:60) says: "On rebuild for intent I: if `reviewForm.intentId === I` and its `commitSha` is still linked, that commit is selected, else the newest; each rework option is selected when its value equals the kept pick for that VETO id, else 'none'". So the rework restore does not depend on whether the form's commit is still linked. D1 (plan:110) says the rework picks survive any repaint on the same intent. The candidate does this (controls:63 reads `form.reworks[String(r.id)]` whenever the form belongs to the intent).

Two planned tests come close, and neither exercises the path:
- the fallback test (review.test:112-123) has no VETO, so it has no rework pick;
- the rework test (review.test:125-151) never unlinks a commit.

A natural refactor discards the whole form when its commit is gone, for example `form = ... && linked.some((e) => e.target === renderer.reviewForm.commitSha) ? renderer.reviewForm : null`. Under it, the operator picks "Reworked by" for a VETO, the reviewed commit is unlinked (the Unlink button in this panel at renderer:342, or another client's link change, which broadcasts `delivery.changed` at `DeliveryRoute.ts:110`), and the next repaint resets the rework pick to "none". A PASS then posts no rework claim. All 36 cases pass under Y13 (`ymut-iter4-auditor.py` Y13); PROBE-Y13 fails. This is the clause-by-clause rule of iteration-2 V2 (J1) and iteration-3 V2 (X1): the fallback writer is proven for the commit and not for the rework picks it carries. The plan must:
- name a test that fails under Y13 (a rework pick, then the picked commit is unlinked, then a repaint, asserting the commit falls back and the rework pick is kept), and add Y13 to the D4 mutant table; or
- narrow LD10 and D1.

**V2 (coverage-gap).** D1 (plan:110) says: "an older async GET or POST completion never changes the selected intent, replaces a newer view, keeps fetching ...". LD2 (plan:52) places the first generation check directly after the listing GET (candidate renderer:212), before the invalid-integrity paint (:213), the no-intent paint (:216) and the selection write (:217). D4 (plan:113) records X8, which moves that check below `this.selectedId = chosen.id`, as surviving: "observable only in stale-listing paths where the older listing would choose a different intent than the newer selection, which the newer refresh then overwrites". The Judge's probes falsify that reason:
- PROBE-X8-invalid: under X8, a stale listing answering `integrity: 'invalid'` replaces the newer, valid view with the invalid card.
- PROBE-X8-empty: a stale listing with no intents replaces the newer view with "No active or sealed intent". This is reachable when the first intent is created while the initial refresh is in flight.
- PROBE-X8-lacks-selected: a stale listing that predates the selected intent rewrites `selectedId` to ACTIVE after the newer refresh has finished. Nothing overwrites it, and the next refresh shows the wrong intent. In the other ordering, the newer refresh reads the rewritten `selectedId` at its own listing completion (renderer:215) and adopts the stale choice. So "the newer refresh then overwrites" holds in neither ordering.

The only stale-listing case (refresh.test:29-47) serves a held listing with the same content as the current one, so it cannot tell X8 from the candidate. The iteration-3 audit's N4 was incomplete, and the plan restated it inaccurately. The plan must:
- name a test that fails under X8 (a stale listing whose content differs: invalid, empty or lacking the selection; at least the selection and one paint path), and move X8 from the "surviving" list to the killed list in D4; or
- narrow D1 and replace the D4 sentence with an accurate statement.

**Required next action:** Governor: amend plan text (and the candidate patch's tests) for V1 and V2, re-record the patch sha256, then re-run `/qor-audit`. No `/qor-debug` is required: the Judge found no code defect in the candidate; both grounds are missing proof, and V2 is also an inaccurate disclosure.

### Non-blocking notes

- **N1**: plan_grep_lint's 4 WARNs are false positives, as in iterations 2-3. `renderer:195` reproduces. `spec:42` is LD6's `playwright.config.ts:42`, which reproduces. `.test.js:21` is `vscodeTestConfigs.cjs:21`, which reproduces. `docs/FEATURE_INDEX.md:753` reproduces by direct read.
- **N2**: PROBE-N-default (informational). A note typed on the default (newest) commit without any pick is hidden after a new commit is linked, because the picker moves to the new newest commit (form null -> newest, LD10). The draft is kept for its commit and comes back if that commit is picked again. This is consistent with LD10 as written and with the server rule that a PASS must be on a commit containing every linked commit (`deliveryReview.ts:857`, "review the newest one"). It is not a ground. The limitations (plan:12) could say so.
- **N3**: Y6 and Y9 are equivalent in reachable states:
  - Y6 differs only on the error, invalid and no-intent panels, which show no intent;
  - Y9 differs in nothing, because nothing retains a reference to the replaced form object. LD10's "never mutated" has no observable consequence.
  Y18 is equivalent by construction.
- **N4**: J13, J14, J15, X13 and X14 are equivalent, as D4 records; the Judge agrees.
- **N5**: The cycle-count escalator returned None before this audit. If iteration 5 is VETOed with the same {coverage-gap} signature, that will be the third consecutive same-signature VETO, and the legal next action becomes `/qor-remediate` (Process Pattern Advisory below).
- **N6**: The Judge ran the FX589 and workspace-delivery Playwright specs (5 passed) but not the full `npm test` (extension host), the full `npm run test:ui`, `prepush-validate.ps1` or the installed-VSIX check. D4 (C3) requires them at the final head.
- **N7**: `version_applicability.validate` and `sg_closure_lint` were recorded as SKIP (prerequisite absent); the manual version check is above.

### Conditions for any later PASS

- **C1**: The D4 mutant table adds Y13 and X8 (as killed), each KILLED by a named test at the exact Phase 2 tree, or the claims are narrowed accurately. K1-K16, J1-J12, J16, J17, X1-X7, X9-X12 and X15-X18 stay killed; J13-J15, X13 and X14 stay recorded as equivalent.
- **C2**: The assertion inventory is re-run after the added tests.
- **C3**: Unchanged: `npm test` and `npm run test:ui` at the final head with no skip flags, counts recorded, plus the installed Windows VSIX observation.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

Cycle-count note (Step 0.5, advisory): this is the fourth consecutive VETO on this plan in session `2026-11-24T1904-4e594e`. The signatures are {coverage-gap, test-failure, razor-overage}, {coverage-gap, infrastructure-mismatch}, {coverage-gap} and now {coverage-gap}. Two consecutive VETOs therefore share a signature, and the escalator threshold is three. The Judge recommends that iteration 5 does not stop at killing Y13 and X8. Instead, for every clause of D1, LD2, LD4 and LD10, it should list each writer of the state and each input variation:
- each writer: commit change, rework change, fallback, unlink;
- each input variation: same and different content of a stale response, every failure path.
It should derive the mutant for each pair and record each as killed or equivalent with a verified reason. The alternative is to narrow D1 to what is proven. Otherwise the next audit will likely trigger `/qor-remediate`.

### Shadow Genome

The Shadow Genome entry for this VETO is appended to `docs/SHADOW_GENOME.md` as Failure Entry #340.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #979 and in the gate artifact `.qor/gates/2026-11-24T1904-4e594e/audit-iter4.json`.

---
_This verdict is binding. Gate LOCKED. Required next action: the Governor amends the plan and the candidate tests for V1 and V2, then re-runs `/qor-audit`._
