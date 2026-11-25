# AUDIT REPORT

**Tribunal Date**: 2026-11-25T20:29:46Z
**Target**: `.failsafe/governance/plans/plan-721-governance-currency-glossary.md` (iteration 1, raw sha256 3fee335b07e9bb805f0eed1596af9fbe6fb1239c0f0ffc029cee6b02f0407534, equal to the plan gate `plan_sha256`)
**Scope audited**: local merge bc3786a5d4d123375d2fd86e6ba967dfe95ef78f (parents: PR #721 head d208937c235567b4f05982859e94ecc882f78b24 and origin/main 7863a29e15a4ef06c185b6ba34a1a2053a7bfd8a) plus the Phase 2 candidate `.failsafe/governance/evidence/issue-722/candidate-iter1.patch` (sha256 f6178e2327d677ef0cc2044c92b9f3080dad1b10e564f9b866bc4bf9e9096b86, equal to the plan's statement)
**Session**: `2026-11-25T1958-4f4867`; plan gate `.qor/gates/2026-11-25T1958-4f4867/plan.json` (= `plan-iter1.json`, payload iteration 1)
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge, fresh context. It wrote none of the plan, the candidate or the evidence. Mode: solo. `should_run_adversarial_mode()` is False and no `external_reviewer` is configured, so a capability_shortfall event was emitted (b2250a79...). `audit_risk_score`: option_b_required false.
**Tooling**: qor-logic 0.176.1 as installed (doc_integrity.py sha256 88eb6be6..., unmodified); QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Windows; local Node v24.19.0 (CI pins 22)

---

## VERDICT: VETO

---

### Executive Summary

Most of the plan checks out when re-run:
- The baseline lineage holds: the two parents, `0 21`, and the merge tree equals git's own clean merge (40f77042).
- G1 holds: the frozen parser finds 16 glossary entries on main and 17 on bc3786a5 and on the candidate. `check_orphans` and strict `run_all_checks_from_plan` pass on all three.
- The LD3 and LD4 facts reproduce.
- The census reproduces: 111 = 79 + 15 + 17, 0 unexplained. Tier 1 has 19 paths, and only the disclosed tracker is absent at bc3786a5.
- The plan's 38-mutant map reproduces byte for byte, and both recorded equivalences (C22, C23) hold.
- The Razor limits hold.

The plan still fails on four grounds, which are not stylistic:

1. **V1**: the candidate's new option table accepts unknown options. This breaks G3 and the plan's "same accepted grammar and refusals" statement.
2. **V2**: four non-equivalent Judge mutants survive and break G2, G5 and G6.
3. **V3**: the closed claim table leaves out something #722's acceptance requires: the Tier-1 freshness census against the last sealed ledger entry, and the reconciliation of the ARCHITECTURE_PLAN Risk Grade registration.
4. **V4**: the candidate writes a count into the Tier-1 Feature Index that does not match the source it counts.

### Preflight and Step 0

- `qor-logic governance-health --profile skill-entry`: all 8 artifacts OK. `import qor.reliability`: OK.
- Step 0 prior artifact: found and valid (errors []).
- `current_phase_plan_path()` raises "Not on a phase branch" on `fix/702-close-sentry-glossary-fence-20261118`. Every plan-path lint was therefore run with the explicit plan path, as in the #703 precedent.
- Step 0.3 `plan_iteration_status_lint`: rc 0.
- Step 0.4 unchanged-plan: should_skip false (no prior audit).
- Step 0.5: `cce.check` and `cce.check_session_total` both None.
- Step 0.6 ladder (WARN-only):
  - Clean: plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint, delivery_branch_lint, plan_signature_widening_caller_lint, plan_data_round_trip_lint, plan_feature_tdd_lint. gate_schema_freeze_lint: 0 unjustified.
  - plan_grep_lint: 4 WARNs, all false positives (N1).
  - ci_coverage_lint: 1 WARN (oss-sast semgrep install, out of scope).
  - Runtime Contract Walk: 2 WARNs, because `qor.scripts.doc_integrity` is the installed package and not repository source (N1).
  - Repository-wide lints, none touching a file in the #721 diff or the candidate:
    - workspace_fragility_check: high (333 pre-anchor chain failures, 4 dirty gate artifacts, 50 branches).
    - plan_live_progress_lint: 19 findings.
    - publication_boundary_lint: 558 findings.
    - sg_closure_lint crashed (FileNotFoundError on the repo-relative `qor/references/doctrine-shadow-genome-countermeasures.md`) and is recorded as SKIP (prerequisite absent).
- Prompt Injection Pass: rc 0. There are 4 `<script` WARNs inside META_LEDGER code spans, and none in the plan.
- Version-Applicability: `validate` needs `pyproject.toml`, so it is recorded as SKIP. Manual check: this is a hotfix with no bump; the manifest is 6.0.13, the highest tag is v6.0.13, and no v6.1.0 release or tag exists. No finding.
- Ledger: `verify-ledger --post-anchor --boundary 382` reports post-anchor clean. `chain_hash` recomputes Entry #984 (46a75e87...), which is the previous hash for this entry. This worktree's META_LEDGER and SHADOW_GENOME are byte-identical to origin/main, so nothing is imported from the historical local line (issue-699, issue-698, line-696, issue-701).

### Empirical method

- The Judge made its own detached worktree at bc3786a5 in its scratch directory. `git apply --check` was clean, and the patch was applied there.
- A second detached worktree at origin/main was made for the G1 baseline.
- A `node_modules` junction was used only for `test:node` and was removed before the worktree.
- wt703, wt721, the main checkout's `FailSafe/`, the plan and source were not touched.
- After every mutant run the candidate sha256s were unchanged: checker 45366cca..., readers 0e6d2a23....

| Check | Result | Plan statement |
| --- | --- | --- |
| Frozen `parse_glossary` | main 16 (no `Sentry import outcome`); bc3786a5 17; candidate 17 | LD1/G1: 16 / 17 |
| `check_orphans`, `run_all_checks_from_plan(plan, strict=True)` | PASS on main, bc3786a5 and candidate | PASS |
| Glossary diff | exactly the closing fence and a blank line after `Quarantined change set` | LD1 |
| Currency CLI at repository root | bc3786a5 and candidate: `v6.0.13 (2026-11-13)`, 0 errors, 0 warnings, `--enforce` rc 0; from `FailSafe/extension`: rc 2 | LD2 |
| Three suites, candidate | 29 tests: 28 pass, 1 skip (the file-symlink case), 0 fail. Junction cases run. | D4 C2 |
| Three suites, bc3786a5 (two files) | 27 pass, 0 skip (the symlink case returned early and was counted as a pass) | - |
| `npm run test:node`, bc3786a5 vs candidate (same scratch tree, no `out/`) | 962 / 918 pass / 41 fail / 3 skip vs 964 / 919 / 41 / 4. The failure lists are identical (environmental: no compiled `out/`, local g4Witness) | - |
| Census (Judge's own Python recount) | origin/main and bc3786a5: 111 rows = 79 tracked + 15 private + 17 shapes, 0 unexplained. Tier 1: 19 paths; origin/main is missing `package.json` and the tracker, bc3786a5 only the tracker. FX: 823 distinct rows = 765 verified, 40 n/a, 15 removed, 2 partial, 1 superseded. | LD4 |
| LD3 | package.json 6.0.13; CHANGELOG `## [6.0.13] - 2026-11-13`; v6.0.13 has 10 assets, 8 VSIX; both `.nvmrc` are 20.18.1, workflows use "22"; `install-handler.ts:23` and `agent-containment.ts:7` match; `agent-cli-command.ts:152,179` gate before any run | LD3 |
| `mutants721.py` on the Judge tree | 36 KILLED, 2 SURVIVED (C22, C23). Identical to `mutation-map-721.txt` | D4 C1 |
| Row cross-check | every listed mutant is killed by a test its row names (C5 also by G2's stale-architecture test; C19 by currency-suite cases) | as stated |
| Judge mutants (`jmut721-iter1-auditor.py`, 14) | 7 KILLED (J3, J4, J5, J6, J10, J12, J13), 7 SURVIVED (J1, J2, J2b, J5b, J7, J9, J11) | - |
| `check-architecture-index.cjs` | PASS (49 rows) | - |
| `system-state-currency.test.cjs` | 5 pass | - |

Equivalences stated by the plan:
- **C23 holds.** `lstat` never reports a link (POSIX symlink or Windows junction) as a directory, so the `isSymbolicLink()` clause at check:47 is redundant.
- **C22 holds.** The root is realpath'd, and every component below it is lstat-checked for links. A Windows mount point or AppExecLink is reported as a link, and other reparse kinds keep their own path, so `rel` cannot leave the root. `rel === ''` is unreachable, because every REL path has components.

### Grounds

**V1: the candidate accepts unknown options (G3; Phase 2 bullet plan:54). Category: specification-drift.**
- The cause is in `check-governance-currency.cjs:24-28` and `:34-39`. `OPTIONS` is a plain frozen object literal, and it is indexed with `OPTIONS[argv[i]]`. An inherited key such as `constructor`, `toString`, `hasOwnProperty` or `valueOf` therefore resolves to a function.
- That function's `.apply` is `Function.prototype.apply`, which, called with an undefined value, raises nothing. `i += undefined` then makes the loop index NaN and ends parsing.
- Executed on the candidate, each of these exits **0** and reports: `constructor`, `--enforce toString`, `hasOwnProperty`, and `--format json valueOf`. `__proto__` exits 2 only through a TypeError.
- At bc3786a5 every one of them exits 2 with the usage refusal.
- G3 claims that "unknown ... options" are refused. Phase 2 claims "same accepted grammar and refusals". Both are false for the candidate, and the candidate is a regression from #721's own head.
- The plan's C17 mutant passes only because the test uses `--something-unsafe`.

**V2: non-equivalent Judge mutants survive and break listed rows. Category: coverage-gap.** Each mutant below was run with the plan's own harness, and each was shown non-equivalent by a concrete input.
- **J1** (readers:94) drops `|| published[0][2] !== patterns[0][2]`.
  - With it, an index stating "17 of the **110** are of that kind" beside "79 of the 111" passes.
  - Judge probe: a planted fixture saying "of the 4" for 3 rows. The original code refuses it ("Missing or inconsistent"); the mutant returns the counts.
  - This breaks **G6** ("publication totals stated in the Governance Index equal the FX939 recount"). No listed test plants two disagreeing totals.
- **J2 / J2b** (readers:142-143) make `committedModes` return null (J2b does so only for the repository itself).
  - The only real-tree proof of **G5** ("Every backticked Tier-1 first-cell path is a regular blob in committed HEAD ...") is census test 1, and it returns early on null (census:27). G5 then passes without checking anything.
  - The synthetic test 2 does not read the repository.
  - This is the repository's own "Vacuous pass" failure mode. Its realistic trigger is a git probe that fails only for the checkout, such as a `safe.directory` / dubious-ownership refusal on a CI container. The plan neither claims nor discloses this skip.
- **J5b** (readers:53-54) makes `trackedFiles` return null for the repository only.
  - The real-tree census (census:71) and FX939 test 1 (publication:37) then return early. That breaks **G6** and **G7** for the real index.
  - The plan's J5-like kill comes only from the staged-only fixture, which calls `trackedFiles(tmp)`.
- **J7** (check:111) replaces the exact equality with `declared.includes('FailSafe/extension/package.json')`.
  - With it, a Tier-1 authority row naming `` `legacy/FailSafe/extension/package.json.bak` `` gives no FC006. Probe: the original gives `["FC006"]`, the mutant `[]`.
  - This breaks **G2** ("exactly one row naming `FailSafe/extension/package.json`"). The listed tests try only `package.json` and a missing row.

Survivors that break no row (notes only): J9 (reading SYSTEM_STATE beyond 12000 characters makes the check stricter, and no claim covers it) and J11 (`git ls-tree` failure tolerated; cannot be reached on a host where HEAD is readable).

**V3: the claim table omits something #722's acceptance requires. Category: coverage-gap.**
- #722 acceptance step 2 requires a census of "Tier 1 freshness dates versus last sealed ledger entry". Step 3 requires that every tier assignment be reconciled against the versioned source. The 2026-11-18 comment limits #722's core to "its registry/freshness census and truthful publication counts".
- The Governance Index's own Drift Detection Contract (`docs/GOVERNANCE_INDEX.md:289`) makes any Tier-1 freshness marker older than the most recent sealed ledger entry a drift bug.
- The plan never records that census. LD4 is publication counts and FX classes only. G2/FC004 measures against the release date, not the last seal, and neither "Not claimed" nor the boundaries name the gap.
- Measured at bc3786a5 against the last seal, #984 (2026-11-25):
  - `ARCHITECTURE_INDEX.md:3` is Last Updated 2026-10-20.
  - `docs/ARCHITECTURE_PLAN.md:3` is Last Updated 2026-11-20 and calls itself "native governance review pending".
  - D3 refreshes only the Governance Index, so the review this plan performs would leave that marker stale.
- Second, #721 removes the current `**Risk Grade:** L2` header (origin/main `docs/ARCHITECTURE_PLAN.md:6`) and keeps L2 only as history (bc3786a5 `:117`). It states no current risk applicability.
  - The Tier-1 registry still defines the document as "Current architecture baseline + Risk Grade" (`docs/GOVERNANCE_INDEX.md:108`).
  - The owner's #722 comment asked to "distinguish last audited L2 historical record from the active 6.1 L3 planning lane", not to drop it.
  - This is a Tier-1 registration/source contradiction inside the reconciliation #722 asks for, and the claim table does not cover it.

**V4: a count the candidate writes into a Tier-1 document is wrong. Self-application of #722's "refresh counts only from measured source". Category: specification-drift.**
- The candidate's FX939 row (`docs/FEATURE_INDEX.md:691`) says the currency suite has "19 cases".
- The candidate's `governanceCurrency.test.cjs` defines 20 top-level `test(` cases, and TAP runs 20.
- The census (6) and publication (3) counts are correct.

### Audit Results

#### Security Pass
**Result**: PASS. No auth placeholders, credentials, bypasses or mock returns. The checker is read-only, and the tests write only to mkdtemp fixtures.

#### OWASP Top 10 Pass
**Result**: PASS.
- A03: every `spawnSync` uses list-form argv with no shell.
- A04: refusals exit 2. The V1 acceptance of unknown options is a specification defect (no security event is dropped, and the report is read-only), so it is graded under V1, not here.
- A08: no deserialization beyond `JSON.parse` of the manifest and `yaml.safe_load` in the frozen parser.

#### Ghost UI Pass
**Result**: PASS (no UI).

#### Section 4 Razor Pass
**Result**: PASS (TS-AST measurement with `razor703.cjs`)

| Check | Limit | Candidate | Status |
| --- | --- | --- | --- |
| Max function lines | 40 | No added or changed function or test body over 40. `describe` callbacks 110 (census) and 47 (publication) are exempt and disclosed. Down from checkCurrency 42 and describe 153 at bc3786a5. | OK |
| Max file lines | 250 | checker 187, readers 183, census 132, publication 78, currency 229 | OK |
| Max nesting depth | 3 | checker 3 (was 4), readers 2, tests 1-2 | OK |
| Nested ternaries | 0 | 0 | OK |

#### Self-Application Sub-Pass
**Result**: VETO (V4).
- #722's discipline is that Tier-1 counts and markers come only from measured source.
- The GI census sentence passes: it says 79/111/15/17 on main@7863a29e, and the Judge measured the same.
- The FX939 currency-suite count does not (V4).

#### Test Functionality Pass
**Result**: VETO (V2).
- Every listed test invokes the checker or the readers and asserts on findings, exit codes or thrown errors. None is presence-only.
- The rows G2, G5 and G6 still claim more than their tests prove (J1, J2/J2b, J5b, J7).
- `prose_test_lint`: not applicable (no Python `tests/`).

#### Dependency Pass
**Result**: PASS. Only Node built-ins are used, and no package is added.

#### Orphan Pass
**Result**: PASS.
- `governance-index-census.test.cjs` is found by `run-node-tests.cjs` (`*.test.cjs`) and listed in the workflow step.
- `governanceIndexReaders.cjs` is required by both governance suites.
- The checker is required by its suite, and the real-tree guard runs it.

#### Macro-Level Architecture Pass
**Result**: PASS. Readers are shared, not duplicated. There is no cycle (suites -> readers; suite -> checker), and the checker has no test imports.

#### Feature Test Coverage Pass
**Result**: VETO (V2).
- Both FX939 rows name a concrete test path and a behavioural descriptor.
- The census descriptor ("every Tier-1 authority path is a regular committed blob and the stated publication totals equal the recount from committed HEAD") fails the acceptance question under J2b and J5b: with the Git read silently skipped, the artifact still exists and the test still passes.

#### Infrastructure Alignment Pass
**Result**: VETO.
- LD1-LD6 reproduce, except that LD6's "122 at origin/main" was not re-measured.
- The Phase 2 claim that `parseArgs` keeps the "same accepted grammar and refusals" is false against the candidate (V1).
- The plan_grep_lint and runtime-walk WARNs are false positives (N1).

#### Filter-Stage Ordering Coherence
**Result**: PASS.
- The census classifier order (shape, then tracked, then private, then unexplained) is unchanged from bc3786a5 (publication:95-98 there).
- FC006 isolates the Tier 1 section before selecting rows (J3 and J4 are killed).

#### Workflow (G8): structural review only
actionlint is not installed, so this was a manual structural review.
- The diff from origin/main adds one `run` step after `npm ci`. Triggers (`pull_request` to main and `release/**`; `push` to `plan/**`, `feat/**`, `fix/**`, `release/**`, `hotfix/**`), `permissions: contents: read`, the single ubuntu job and the pinned action SHAs are unchanged.
- The step uses `working-directory: FailSafe/extension` and lists the three suites by path. This works on Node 22's `node --test` file arguments, avoiding the glob form Node 20 does not honour.
- `actions/checkout` sets `safe.directory`, so the git probes resolve on the hosted runner. The vacuous-pass branch (V2) is the regression risk elsewhere.
- No concurrency or `timeout-minutes` exists at origin/main either. Neither is removed, and the missing timeout is #708's scope.
- No finding against G8 as worded.

### Non-blocking notes

- **N1**: The plan_grep_lint WARNs are false positives. `qor.scripts.doc_integrity` is the installed package. The three file:line citations reproduce: `install-handler.ts:23`, `agent-containment.ts:7`, and `agent-cli-command.ts:152` (and `:179`). The runtime walk WARNs have the same cause.
- **N2**: `realRepositoryRoot` checks only the root's last component. A linked ancestor of `--repo-root` is resolved and accepted. This is not claimed (G3 says "a linked root").
- **N3**: The currency check does not read the root or extension README `Current Release` markers or the extension CHANGELOG, all of which are Tier-1 rows. They sit outside the plan's stated limitations and are covered elsewhere: `release-gate.cjs` checks the extension README, and FX938 checks SYSTEM_STATE.
- **N4**: The Judge did not run `npm test`, `npm run lint` or `prepush-validate.ps1`. Lint is `eslint src --ext ts` and does not reach the changed `.cjs` files. D4 C3 keeps these for implementation.
- **N5**: Owner GO before merge (#722 step 6) is outside the plan's D-list. This is a process gate and not graded.
- **N6**: The historical local lineage (#699/#698/#696/#701 seals in `.failsafe/worktrees/*`) is recorded only as context. The plan relies on none of it. This entry (#985) continues main's chain from #984.

### Required next actions (Governor; then re-run `/qor-audit`)

1. **V1**: amend the candidate so that only own keys of `OPTIONS` are accepted, for example with `Object.hasOwn(OPTIONS, argv[i])` or a null-prototype table. Add refusal cases for at least `constructor` and a trailing `toString`. Add a mutant that drops the own-key guard to the G3 row.
2. **V2**:
   - Add tests that kill J1 (two disagreeing "of the N" totals), J7 (a near-miss authority path) and J2b/J5b (the repository's Git read unavailable must not pass silently). Alternatively, narrow G2, G5, G6 and G7 and disclose the no-Git skip under limitations and "Not claimed".
   - List the new mutants in their rows.
   - Re-record the patch sha256 and the mutation map, including the Judge script `jmut721-iter1-auditor.py`.
3. **V3**:
   - Record a measured Tier-1 freshness census against the last sealed ledger entry, with a disposition per document. Then claim it in the table, or record an explicit owner-authorized scope narrowing in the plan.
   - Reconcile the ARCHITECTURE_PLAN Risk Grade with its Tier-1 registration (`GOVERNANCE_INDEX.md:108`), using source evidence and the owner's L2-history versus 6.1-L3-lane distinction.
   - Resolve the "native governance review pending" marker the seal would leave stale.
4. **V4**: correct the FX939 currency-suite count to the measured value (20, or whatever the amended suite contains).

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #985 and in the gate artifact `.qor/gates/2026-11-25T1958-4f4867/audit-iter1.json`.

---
_This verdict is binding. Gate LOCKED. Next: the Governor amends the plan and candidate for V1-V4 and re-runs `/qor-audit`._
