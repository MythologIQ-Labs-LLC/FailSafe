# AUDIT REPORT

**Tribunal Date**: 2026-11-24T19:18:46Z
**Target**: `.failsafe/governance/plans/plan-703-delivery-review-refresh-race.md` (iteration 1, raw sha256 80bd7180578e38f8a72b7d7dd1877513b604e6816400a44013647164cdeed9d9, equal to the plan gate `plan_sha256`)
**Scope audited**: PR #706 head c38f970d045bb0fddad53bcd5436f4c642690f23 (merge base origin/main b03e47b75a1e0c5f486e3b0a3051005e8719dd55, 0 behind / 19 ahead, 3 files +378/-22) plus the planned Phase 2 refactor (not yet implemented)
**Session**: `2026-11-24T1904-4e594e`; plan gate `.qor/gates/2026-11-24T1904-4e594e/plan.json`
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge (fresh-context independent subagent; did not author the plan or the code). Mode: solo (codex-plugin and external reviewer absent; both capability shortfalls emitted). `audit_risk_score`: option_b_required true (flag config-file-cite); this fresh-context audit is the Option B independent review.
**Tooling**: qor-logic 0.176.1 as installed (frozen), QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Node v24.19.0, Windows

---

## VERDICT: VETO

---

### Executive Summary

The committed #706 source fixes most of the races it targets, and all ten new jsdom cases fail at origin/main and pass at head. The plan still cannot proceed, for four reasons. First, the defect class #703 fixes (operator input lost on a repaint) still happens at head. If the operator picks any linked commit other than the newest, a repaint resets the commit picker to the newest commit and blanks the typed note. D1 says the note "survives any repaint", and the boundaries do not disclose this case. Second, mutation M3 in the plan's own evidence (delete the generation check after the detail GET, expected to fail the stale-detail test) survives the whole suite at head. Phase 2 does not touch `refresh()`, so D4 cannot be met as written. Third, several behaviours the plan claims in LD4, LD5 and D1 (draft scoping by intent and commit, restoring the draft when the commit changes, intent-scoped link and unlink messages) have no test that fails when the behaviour is removed. Fourth, the plan's scope grows the test file from 380 to 691 lines and the renderer from 482 to 522, both well past the 250-line Razor. The exclusion covers only the "pre-existing" findings at origin/main and does not disclose this growth.

### Preflight and Step 0

- `qor-logic governance-health --profile skill-entry`: all 8 artifacts OK (META_LEDGER pre-anchor residuals disclosed and tolerated; post-anchor band clean).
- `python -c "import qor.reliability"`: OK.
- Step 0 prior artifact: found and valid (`plan.json`; `plan-iter1.json` present). Step 0.3 `plan_iteration_status_lint`: rc 0. Step 0.4 unchanged-plan: should_skip false (no prior audit, plan hash 80bd7180...). Step 0.5 cycle-count and session-total: none.
- `current_phase_plan_path()` raises InterdictionError, because the branch `fix/703-delivery-review-note-refresh-race` is not a phase branch. Every plan-path lint was run with the explicit target plan path.
- Step 0.6 ladder (WARN-only). plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint, delivery_branch_lint, plan_signature_widening_caller_lint, plan_data_round_trip_lint and plan_feature_tdd_lint are clean. gate_schema_freeze_lint: 0 unjustified. plan_grep_lint: 2 WARNs, both false positives (N1). ci_coverage_lint: 1 WARN (oss-sast semgrep install, out of scope). workspace_fragility_check: high, pre-existing (333 pre-anchor ledger chain failures, 4 dirty gate artifacts, 49 branches). plan_live_progress_lint: 403 findings, all pre-existing and outside the plan's files. publication_boundary_lint: 538 structural findings, pre-existing, none in the #706 diff. sg_closure_lint: crashed (FileNotFoundError on a repo-relative `qor/references/...` path) and is recorded as SKIP (prerequisite absent).
- Step 0.7 spec-delta: the plan declares no deltas, so not applicable.
- Prompt Injection Pass: no canary hit that ABORTs. The four `<script` code-span WARNs are all in historical META_LEDGER text. The plan is clean.
- Version-Applicability Pass: `version_applicability.validate` requires `pyproject.toml` (this is a Node repository) and is recorded as SKIP. Manual check: `change_class: hotfix` at 6.0.13 implies 6.0.14, which is greater than the highest tag v6.0.13, and the non-goals exclude any bump. No finding.
- Runtime Contract Walk: 0 findings.
- Ledger: `qor-logic verify-ledger --post-anchor --boundary 382` reports post-anchor clean. Entry #975's chain hash recomputes as `chain_hash(6191b7a3..., 81dba965...) = b9571093ac543c0e291850bfe05627da2e4e2e8cfbd584a68a60c9f031413510`.

### Empirical method

The renderer and test blobs were exported from c38f970d (and the renderer from origin/main) into an isolated scratch directory, with nothing written under `FailSafe/`. The test was transpiled with the extension's own TypeScript (transpileModule, CommonJS) and run with the extension's mocha (`--ui tdd`) and jsdom.

- Head: 25 passing, 0 failing.
- Red run (origin/main renderer, head tests): 15 passing, 10 failing. The 10 failures are exactly the ten #703 cases.
- Mutants of the head renderer (each run against the full 25-case file):

| Mutant | Change | Result |
| --- | --- | --- |
| M1 (plan) | remove the in-flight early return (402) and the disabled-on-paint lines (410-411) | killed: PASS/VETO overlap |
| M1a / M1b | each half alone | killed: PASS/VETO overlap |
| M2 (plan) | LD5 condition becomes `if (this.message)` | killed: both cross-intent cases |
| M2b | never consume the message | killed: both cross-intent cases |
| **M3 (plan)** | **delete the generation check after the detail GET (229)** | **SURVIVES (25 passing)** |
| M3a | delete the check after the listing GET (222) | SURVIVES |
| M3c | delete the check after the candidates GET (231) | SURVIVES |
| M3d | delete the check in `catch` (234) | killed: old failed GET |
| M3e | delete the check before paint (239) | SURVIVES |
| M3all | delete all five checks | killed: 3 stale-GET cases |
| M4 (plan) | clear the draft on every 200 | killed: both later-edit cases |
| M4b | compare draft by value instead of identity | killed: same-text later edit |
| M5 / M5b | drop or delay `reviewInFlight = false` | killed (3 tests) |
| M6 | remove the `catch` in `review()` | killed (2 tests) |
| M7 | drop the draft restore on paint | killed (3 tests) |
| **M8** | **drop `select.addEventListener('change', restoreDraft)` (393)** | **SURVIVES** |
| **M9** | **restore any draft regardless of intent and commit (387)** | **SURVIVES** |
| M10 / M11 | drop intentId from the review HTTP or thrown message | killed (1 test each) |
| **M12** | **drop intentId from the link success message (514)** | **SURVIVES** |

- Probe (scratch test, head renderer, two linked commits): select the older commit, type a note (input event), then `refresh()`. After the repaint the picker shows the newest commit and the note is `""`.
- Latency probe: with an 8 ms delay on every fetch in `setupDom`, the pre-existing test "Record PASS and Record VETO ... each post once" (test:195-217) fails at both origin/main and head, with different failure modes (see N3).

### Audit Results

#### Security Pass
**Result**: PASS. No auth placeholders, credentials, bypassed checks or mock returns. The UI in-flight guard is explicitly not the authority. The server-side per-window review lock and the bound modal confirmation (FX1010, FEATURE_INDEX:753) stay in place, and no server file is touched. All text reaches the DOM through `textContent` (renderer:94-97).

#### OWASP Top 10 Pass
**Result**: PASS. A03: no injection surface (relative fetch URLs, `encodeURIComponent` on the id, renderer:228). A04: `review()` now fails closed on a thrown POST: it shows an error, re-enables the controls and keeps the draft (renderer:454-458). The `post()` throw path is pre-existing and declared a non-goal (plan:13). A05 and A08: not applicable.

#### Ghost UI Pass
**Result**: PASS. Every new control state maps to real logic (renderer:401-411). Live-progress: no progress element. On a terminal error the retry control is re-enabled (test:493-528, killed by M5 and M6).

#### Section 4 Razor Pass
**Result**: FAIL (V4)

Function spans were measured inclusively with a brace walk. Nesting counts if/for/while/try/switch.

| Check | Limit | Blueprint proposes / baseline | Status |
| --- | --- | --- | --- |
| Max function lines | 40 | renderer at head: `reviewControls` 51 (365-415; 35 at origin/main), `refresh` 28, `paint` 28, `review` 19. Phase 2 splits `reviewControls` into about 15 + 9 + 16 + 17. Test bodies at head: 42 (353-394), 47 (398-444), 45 (447-491), which Phase 2 consolidates; the `suite` callback (115 to EOF, about 575 lines) is a changed function the plan neither measures nor exempts | OK after Phase 2 for named functions; suite wrapper undeclared (see V4) |
| Max file lines | 250 | test file 380 at origin/main, 691 at head (+311); renderer 482 at origin/main, 522 at head (+40); Phase 2 states no file-length result | FAIL (V4) |
| Max nesting depth | 3 | `refresh` 2, `review` 2, `reviewControls` 1; parameterised tests: for > try > if = 3 | OK |
| Nested ternaries | 0 | #706 adds none. Pre-existing ones remain at renderer:170, 312 and 514-515 (the inner `action === 'unlink' ? ...` inside the outer ternary, on lines #706 edits) and test:103-106 | OK for added code (N8) |

#### Self-Application Sub-Pass
**Result**: FAIL. `originating_remediation` is set (#703). The discipline it introduces is that an async completion or repaint must never destroy or misattribute operator input, and that a race test must fail when the guard is removed. Applied to the plan itself: operator input is still destroyed by a repaint (V1), and one of the plan's own named mutation proofs does not fail (V2).

#### Test Functionality Pass
**Result**: FAIL (V2, V3)

| Test description (plan:48-56) | Invokes unit? | Asserts on output? | Verdict |
| --- | --- | --- | --- |
| typed note survives a repaint, posts once, cleared after 200 | yes | yes (killed by M7, M4c) | PASS |
| stale detail / delayed candidates / old failed listing GET cannot repaint | yes | yes, but only M3d and M3all are killed; each of 222, 229, 231 and 239 is individually unguarded by any test | VETO (V2) |
| later same-text or different-text edit survives | yes | yes (M4, M4b) | PASS |
| successful or failed delayed POST shown only on its own intent, once | yes | yes (M2, M2b, M10, M11) | PASS |
| PASS and VETO cannot both submit across a repaint | yes | yes (M1, M1a, M1b, M5) | PASS |
| rejected network POST re-enables review | yes | yes (M5, M6) | PASS |
| FX589 connect, wait for running, dashboard result | yes (Playwright, stub client) | yes; the 250 ms delay is not falsifiable (N4) | PASS |
| Phase 2 mutation evidence M1-M4 | yes | M3 is predicted to fail and does not | VETO (V2) |

`prose_test_lint --tests-dir tests`: not applicable (no Python `tests/` prose tests in scope).

#### Dependency Pass
**Result**: PASS. No dependency added. jsdom, mocha and Playwright are already in use.

#### Orphan Pass
**Result**: PASS.

| File | Entry point connection | Status |
| --- | --- | --- |
| src/roadmap/ui/modules/delivery-assessment-renderer.js | `command-center.js:57` (single instance) | Connected |
| src/test/roadmap/delivery-assessment-renderer.test.ts | extension-host suite; listed under FX1010 (FEATURE_INDEX:753) | Connected |
| src/test/ui/bicameral-advanced-tools.spec.ts | `playwright.config.ts:35` testDir `src/test/ui`, :40 `**/*.spec.ts` | Connected |
| Phase 2 helpers and methods | file-local, called from the same file | Connected (planned) |

#### Macro-Level Architecture Pass
**Result**: PASS. All changes are file-local. There is no new module, no cycle and no layering change.

#### Feature Test Coverage Pass
**Result**: PASS on form. Both rows cite a test path and a behavioural descriptor. The FX1010 descriptor's "report under another intent" is honoured for review POSTs only; the link and unlink part is uncovered (V3).

#### Infrastructure Alignment Pass (full Locked Decision re-walk)
**Result**: PASS on citations (with notes N1, N2).

- LD1: the three blobs reproduce exactly (a455ab1d..., 3f8df229..., c1c6135b...), and `rev-list --left-right --count` gives `0 19`.
- LD2: `195`, `217`, `222`, `229`, `231`, `234`, `239` reproduce exactly.
- LD3: `194`, `403` and `457` reproduce (the plan collapses leading whitespace). The grep also returns `402`, `410` and `411`, which the plan describes in prose but omits from the quoted output (N2).
- LD4: `193` and `449` reproduce. The grep also returns 386, 391, 444 and 447, which the plan paraphrases. The identity-capture semantics are confirmed by M4b.
- LD5: `254` reproduces exactly.
- LD6: `53`, `75` and `87` reproduce in the spec; `playwright.config.ts:42  expect: { timeout: 5000 },` reproduces exactly.
- LD7: `reviewControls` 51 and 35 and the test-body lengths (42, 47, 45; others 29-36) reproduce exactly. `refresh` is 28 (plan 27), `review` 19 (plan 20) and `paint` 28 (plan 29) under the same inclusive count (N2).
- LD8: FX1010 lists the jsdom file. `playwright.config.ts:35,40` confirm discovery.
- LD9: FEATURE_INDEX:753 reads "the review lock is per window (fails closed)".
- Delivery-branch currency: 0 behind origin/main.

#### Filter-Stage Ordering Coherence
**Result**: PASS. `refresh()` stages are listing GET, selection, detail GET, candidates GET and paint. The generation check runs after every await and before any state write (`selectedId`, 227) or paint. The order is topological.

### Violations Found

| ID | Category | Location | Description |
| --- | --- | --- | --- |
| V1 | coverage-gap | renderer:379, 385-389, 391, 421-439; plan:12, 88 | A repaint still loses operator review input: picking a non-default commit and typing a note, then a repaint, resets the picker to the newest commit and blanks the note |
| V2 | test-failure | renderer:222, 229, 231, 239; test:249-317; plan:82, 91 | Mutation M3, the plan's own named proof, survives; D4 is unachievable; three more generation checks are each untested |
| V3 | coverage-gap | renderer:387, 391, 393, 514-515; plan:29, 30, 88 | Draft intent and commit scoping, draft restore on commit change, and intent-scoped link and unlink messages have no killing test (M8, M9, M12 survive) |
| V4 | razor-overage | test file 380 -> 691; renderer 482 -> 522; plan:14, 89 | Produced files far exceed 250 lines. The exclusion covers only pre-existing findings and does not disclose the +311 and +40 growth or the suite-wrapper status |

### Per-ground directives

#### Code-logic defect

**V1 (coverage-gap, code defect in scope).** `reviewControls` rebuilds the commit picker on every paint and forces `select.selectedIndex = linked.length - 1` (renderer:379). `restoreDraft` restores the note only when `draft.commitSha === select.value` (renderer:387). The input listener stamps the draft with the commit selected at typing time (renderer:391). If the operator selects an older linked commit and types a note, any repaint (a `delivery.changed` event, the Refresh button, another operation's completion) moves the picker back to the newest commit and shows an empty note. Reproduced in scratch at c38f970d with two linked commits: after `refresh()` the picker reads the newest commit and the note is `""`. The text survives only in memory; the operator sees the note vanish, and the selected commit has silently changed under them. The rework picks are likewise rebuilt to `none` on every paint (renderer:421-439), so a chosen rework disappears on repaint too. This is the #703 defect class (unsent operator input lost on an overlapping repaint). D1 (plan:88) states "an operator's unsent review note survives any repaint", and the limitations (plan:12) disclose only the single-slot and reload cases. The fixture has one linked commit (test:48), so no planned test can observe the path.

**Required next action:** `/qor-debug`

#### Plan-text

**V2 (test-failure).** Phase 2 (plan:82) predicts "(M3) delete the generation check after the detail GET -> the stale-detail test fails", and D4 (plan:91) requires "the mutation runs M1-M4 each fail at least one named test". At c38f970d, deleting renderer:229 alone leaves all 25 tests passing. In the stale-detail test the stale refresh is still stopped by the check before paint (239). In the same way, deleting 222, 231 or 239 alone survives; only the `catch` check (234) and the removal of all five are killed. Phase 2 does not change `refresh()`, so the prediction is false for the Phase 2 tree too, and D4 cannot be satisfied as written. LD2 (plan:27) presents each check as evidence, yet only one of the five is individually proven by a test. The plan must state mutation evidence that actually reproduces, with a test that kills each check it names, or narrow the claim to what is proven.

**V3 (coverage-gap).** LD4 (plan:29) and the code comment at renderer:192 claim that the draft "is scoped to its intent and commit". LD5 (plan:30) claims that `post()` (link and unlink) sets the originating intent id. D1 (plan:88) claims that no "older async GET or POST completion ... reports its result under another intent". None of these has a test that fails when the behaviour is removed. M9 (restore any draft regardless of intent and commit) survives, as do M8 (drop the restore on commit change) and M12 (drop the intent id from the link success message). The Phase 1 test list (plan:48-56) and the FX1010 descriptor do not cover them. A behaviour the plan locks as a decision must be proven by a test that a mutant cannot pass.

#### Section 4 Razor

**V4 (razor-overage).** The exclusion (plan:14) exempts "the pre-existing file-length findings at origin/main (`delivery-assessment-renderer.js` 482 lines, `delivery-assessment-renderer.test.ts` 380 lines)". The plan's own scope (plan:18, "every change in origin/main...c38f970d") grows the test file to 691 lines (+311, +82%) and the renderer to 522 (+40). Phase 2 states no resulting file length. Most of the 691 lines are new #703 content, not a pre-existing finding, and the plan does not disclose the growth. The plan also requires every function body it changes to meet 40 lines (plan:14), but it neither measures nor exempts the mocha `suite` callback (test:115 to EOF, about 575 lines), which #706 changes. D2 (plan:89) lists only renderer methods.

**Required next action:** `/qor-refactor` (the Governor then amends the exclusion text to match the result).

### Non-blocking notes

- **N1**: The two plan_grep_lint WARNs are false positives. "renderer:195" reproduces (`195:    this.refreshGeneration = 0;`). "spec:42" is the lint attaching LD6's `42:` to the spec path; the command in LD6 targets `playwright.config.ts`, whose line 42 reproduces exactly.
- **N2**: Citation precision. LD3 and LD4 quote abridged grep output (LD3 omits 402, 410 and 411; LD4 paraphrases four lines). LD7 is off by one for `refresh`, `review` and `paint`, which use a different count from the one used for `reviewControls`. None of these affects a verdict, because every function is under 40 lines.
- **N3**: The pre-existing test "Record PASS and Record VETO ... each post once" (test:195-217) relies on two fixed 20 ms sleeps. Under 8 ms of latency per fetch it fails at origin/main (the VETO is posted from the stale panel with the old note) and at head (the VETO click lands on the disabled pre-repaint button, so no VETO is posted). This is the same full-suite-load flake class as #703, and the plan neither treats nor discloses it.
- **N4**: FX589. The 250 ms delayed connect does exercise `waitForState(..., 'running')`, but the pre-change test would also pass with that delay, because Playwright's `toBeVisible` auto-waits up to 5 s. The change is hardening, not a falsifiable regression check. The Judge did not run `npm run test:ui`, because it writes results under `FailSafe/`. D4 requires that run at implement.
- **N5**: `post()` still has no `try`/`finally`. A thrown link or unlink POST leaves an unhandled rejection and a disabled button until the next repaint. This is pre-existing and declared a non-goal (plan:13).
- **N6**: Every `this.message` setter now supplies an intent id, so the `!this.message[2]` branch (renderer:254) is unreachable. It is harmless.
- **N7**: Intent scoping of the draft is mostly unobservable in production, because only the active intent is linkable and only linkable intents show review controls. Commit scoping is observable whenever two commits are linked (V1, V3).
- **N8**: The pre-existing nested ternaries at renderer:170, 312 and 514-515 and test:103-106 are not introduced by #706. Lines 514-515 were edited by #706 without removing the inner ternary.
- **N9**: The actual branch is `fix/703-delivery-review-note-refresh-race`. The plan does not name the branch.

### Conditions for any later PASS

- **C1**: Record the mutation evidence in the implementation report as killed or survived per mutant, against the exact Phase 2 tree. Every generation check named in LD2 must be killed by a named test, or the claim must be narrowed.
- **C2**: Prove the Phase 2 test consolidation by a mechanical comparison: the extracted `assert.*` statements and their message strings before and after, plus the case names and their count of 25.
- **C3**: Run `npm run test:ui` (FX589) and `npm test` at the final head with no skip flags, and record the counts.

### Documentation Drift

`doc_integrity.render_drift_section` returned an empty string (glossary clean for this plan's declared terms). No section emitted.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Shadow Genome

The Shadow Genome entry for this VETO is appended to `docs/SHADOW_GENOME.md` as Failure Entry #337.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #976 and in the gate artifact `.qor/gates/2026-11-24T1904-4e594e/audit.json`.

---
_This verdict is binding. Gate LOCKED. Required next action: `/qor-debug` for V1; the Governor amends the plan for V2 and V3; `/qor-refactor` for V4; then re-run `/qor-audit`._
