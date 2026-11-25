# AUDIT REPORT

**Tribunal Date**: 2026-11-25T21:39:43Z
**Target**: `.failsafe/governance/plans/plan-721-governance-currency-glossary.md` (iteration 2, raw sha256 cc06448456946dfff09782493e5abd31f6c73e5b5adf6d30503eb60d4124e118, equal to the plan gate `plan_sha256`)
- Supersedes iteration 1 (3fee335b...), which is preserved at `evidence/issue-722/plan-iter1.md` with that hash.
**Scope audited**: bc3786a5d4d123375d2fd86e6ba967dfe95ef78f plus `.failsafe/governance/evidence/issue-722/candidate-iter2.patch` (sha256 97096e8a2c2e86014f13dc9f885a760ea7208cc7cf00bf92abba4a72449fee03, equal to the plan's statement)
**Session**: `2026-11-25T1958-4f4867`; plan gate `plan.json`, byte-identical to `plan-iter2.json` (payload iteration 2)
**Audit scope**: closure re-check of the iteration-1 grounds V1-V4 and notes (Entry #985), plus a regression check, under the bounded-claim rule
**Risk Grade**: L2
**Auditor**: The Qor-logic Judge. This is the same subagent that issued the iteration-1 VETO; it authored no plan, candidate or map. Mode: solo. `audit_risk_score`: option_b_required false.
**Tooling**: qor-logic 0.176.1 as installed, unmodified; QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Windows; Node v24.19.0

---

## VERDICT: VETO

---

### Executive Summary

All four iteration-1 grounds are closed in fact:

- **V1**: the candidate refuses every inherited option name.
- **V2**: J1, J2b and J7 are killed, and the vacuous-null branches are gone.
- **V3**: LD7 records the measured freshness census. The Risk Grade is restored, and the eight markerless files are narrowed by a recorded owner decision.
- **V4**: the counts are 21 and 7.

Nothing previously verified has regressed: G1, the census, LD3, LD4, the Razor, test:node and both mutation maps.

One new ground blocks. A Judge mutant K6 survives, does not behave like the candidate, and breaks G2 "exactly one row naming exactly `FailSafe/extension/package.json`". The mutant makes the FC006 comparison a prefix match (`startsWith`). The new near-miss test uses a path that is wrong at both ends (`legacy/...bak`), so it kills a substring match but not a prefix match. Under K6, a Tier-1 row naming `` `FailSafe/extension/package.json` and `package.json` (root) `` passes FC006. That row brings back the phantom root authority that #722 removed.

### Preflight and Step 0

- `governance-health --profile skill-entry`: 8/8 OK.
- Step 0 prior artifact: valid.
- Step 0.3 `plan_iteration_status_lint`: rc 0.
- Step 0.4: should_skip false. The hash cc064484... differs from the iteration-1 target 3fee335b....
- Step 0.5: `cce.check` and `cce.check_session_total` both None (one prior VETO).
- `current_phase_plan_path()` cannot resolve this non-phase branch, as in iteration 1, so the lints use the explicit plan path.
- Step 0.6 lint results:
  - Clean: plan_test_lint, plan_text_consistency_lint, plan_enumeration_lint, delivery_branch_lint, plan_feature_tdd_lint, plan_data_round_trip_lint, plan_signature_widening_caller_lint, gate_schema_freeze_lint.
  - plan_grep_lint: the same 4 false-positive WARNs, now at plan:38/40.
  - Runtime walk: the same 2 WARNs (installed package).
  - Repository-wide lints: unchanged from iteration 1.
- Prompt Injection: rc 0. The only hits are META_LEDGER code-span WARNs.
- Version-Applicability: SKIP (no pyproject.toml). Manual check: hotfix, no bump, 6.0.13 = v6.0.13.
- Ledger: post-anchor clean. Entry #985's chain hash 36d17bd8... is the previous hash for this entry.

### Empirical method

- The Judge made a fresh detached worktree at bc3786a5 in its scratch directory. `git apply --check` was clean.
- A `node_modules` junction was used only for test:node and removed afterwards.
- wt696, wt703, wt721, the main tree's `FailSafe/`, the plan and source were not touched.

| Check | Result | Plan statement |
| --- | --- | --- |
| Three suites | 31 tests: 30 pass, 1 skip (the file-symlink case), 0 fail. Census 7, publication 3, currency 21 | 7 / 21; one skip allowed |
| Frozen `parse_glossary`; `check_orphans`; strict `run_all_checks_from_plan` | 17; PASS; PASS | G1 |
| Currency CLI, repository root | v6.0.13 (2026-11-13), 0 errors, 0 warnings; `--enforce` rc 0 | LD2 |
| Inherited names (`constructor`, `--enforce toString`, `hasOwnProperty`, `--format json valueOf`, `__proto__`) | all rc 2 | V1 / C26 |
| `mutants721.py` (as updated) | 41 KILLED, C22/C23 SURVIVED; byte-identical to `mutation-map-721-iter2.txt` | D4 C1 |
| `jmut721-iter1-auditor.py` | 10 KILLED, J11 SURVIVED, J2/J5/J5b APPLY-FAIL; byte-identical to `jmut721-iter1-auditor-map-iter2.txt` | D4 C1 |
| Mechanical row cross-check (Judge script over plan rows G1-G9 against both runs) | every listed mutant KILLED; every killed mutant listed; only C5 is in two rows (G2, G4), as before | as stated |
| Judge iteration-2 mutants (`jmut721-iter2-auditor.py`) | K1 (`in` operator), K2 (guard dropped), K3, K4 (non-Git returns empty) KILLED; **K6 SURVIVED** | - |
| `npm run test:node` | 966 / 921 pass / 41 fail / 4 skip. The failure list is identical to the iteration-1 bc3786a5 baseline (environmental) | - |
| Census recount (Judge script) | 111 = 79 + 15 + 17, 0 unexplained; Tier 1 19, only the tracker absent | LD4 |
| `check-architecture-index.cjs` | PASS (49 rows) | LD7 |
| Razor (`razor703.cjs`) | functions <= 40 except the exempt `describe` callbacks (118, 46); files 188 / 185 / 141 / 78 / 242; nesting <= 3; 0 nested ternaries | D2 |

J2, J5 and J5b no longer apply: the early-return lines they targeted were replaced by `assert.equal(probe.status, 0, ...)`. The Judge's K3 and K4 replace that assertion with a silent empty result, and both are killed by the new non-Git refusal test. The rewrite therefore closes the vacuous path itself, not just the earlier mutant text.

### Closure of the iteration-1 grounds and notes

| Ground | Status | Evidence |
| --- | --- | --- |
| V1 (inherited options) | Closed | `Object.hasOwn(OPTIONS, argv[i])` (check:34). All five names rc 2. C26, K1 and K2 are killed by "rejects unknown args and duplicate options". |
| V2 J1 | Closed | R16 is killed by a planted "1 of the 4" vs "of the 3" fixture. |
| V2 J2/J2b, J5b | Closed | Both readers assert a Git checkout (readers:54, :143). The real-tree tests have no early return. R14, R15, J2b, K3 and K4 are all killed. |
| V2 J7 | Closed as worded | C27 and J7 are killed by the `legacy/FailSafe/extension/package.json.bak` row. The new prefix-only mutant K6 survives (ground W1 below). |
| V3 freshness census | Closed by record and owner narrowing | LD7 (plan:45-57). The Judge re-measured each marker at bc3786a5, and they match. The candidate updates ARCHITECTURE_PLAN to 2026-11-25. ARCHITECTURE_INDEX gains 2026-11-13 #687 (140b257f: "preserve 49 registry records, rebase 58 links") and 2026-11-25. The FEATURE_INDEX lead becomes 2026-11-25. The eight markerless files are narrowed under a recorded owner decision dated 2026-11-25 (plan:56, "Not claimed" plan:108). The Judge cannot independently see the owner's consent; it relies on the plan's record, as the bounded-claim rule allows. |
| V3 Risk Grade | Closed | ARCHITECTURE_PLAN regains `**Risk Grade:** L2` as the last audited baseline, with v6.1.0 changes graded by their own plans. The ledger confirms #707 at L3 (Entries #970-#975) and #703 at L2 (#976-#984). |
| V4 counts | Closed | FX939 cites census 7 and currency 21, and both match TAP. |
| N1 | Unchanged, non-blocking | grep-lint / runtime-walk false positives |
| N2, N3 | Closed by disclosure | "Not claimed" (plan:108) |
| N4 | Deferred to implement | D4 C3 |
| N5 | Unchanged | Owner GO before merge is a process gate |
| N6 | Unchanged | Historical local line not relied on. Entries #985 and #986 continue main's chain. |

### Ground

**W1: K6 survives and breaks G2. Category: coverage-gap.**
- K6 changes check:111 from `declared !== '`FailSafe/extension/package.json`'` to `!declared.startsWith('`FailSafe/extension/package.json`')`. All 31 cases pass.
- Judge probe:
  - With a Tier-1 cell `` `FailSafe/extension/package.json` and `package.json` (root) ``, the candidate gives `["FC006"]` and K6 gives `[]`.
  - With the plan's `.bak` cell, both give `["FC006"]`, which is why C27/J7 cannot separate them.
- G2 claims "exactly one row naming exactly `FailSafe/extension/package.json`" (plan:97). The listed FC006 tests do not prove that clause against a cell that adds text after the exact path.
- The input is the shape of the original #722 defect: a nested manifest plus a phantom root authority.
- G5's real-tree census would flag such a row on this repository. G5 is a separate claim about the repository, not about the checker G2 describes.

### Audit Results

#### Security Pass
**Result**: PASS. Unchanged; the checker is read-only.

#### OWASP Top 10 Pass
**Result**: PASS.
- A03: list-form `spawnSync`.
- A04: refusals exit 2. The non-Git path now fails loudly instead of passing.

#### Ghost UI Pass
**Result**: PASS (no UI).

#### Section 4 Razor Pass
**Result**: PASS (table above).

#### Self-Application Sub-Pass
**Result**: PASS.
- Every count or marker the candidate writes into a Tier-1 document matches measured source: census 7, currency 21, FX 823 classes, 49 registry rows, #687's 49 and 58.
- ARCHITECTURE_PLAN's "reviewed under the native plan-721 audit" becomes true only at seal (N7).

#### Test Functionality Pass
**Result**: VETO (W1). Every other listed test invokes the unit and asserts on output. None is presence-only.

#### Dependency Pass
**Result**: PASS. Node built-ins only. `Object.hasOwn` is available in Node 16.9 and later, which covers the 20.18.1 `.nvmrc` and the Node 22 CI.

#### Orphan Pass
**Result**: PASS. Unchanged.

#### Macro-Level Architecture Pass
**Result**: PASS.

#### Feature Test Coverage Pass
**Result**: PASS. The census descriptor now survives the acceptance question: no-Git and real-tree skips fail loudly.

#### Infrastructure Alignment Pass
**Result**: PASS.
- LD1-LD7 reproduce.
- The Phase 2 statement "same accepted grammar and refusals, inherited names refused" holds against the candidate.

#### Filter-Stage Ordering Coherence
**Result**: PASS. Unchanged.

#### Workflow (G8): structural review only
actionlint is not installed, so this was a manual structural review. The workflow diff is identical to iteration 1, and the previous finding stands: no finding.

### Non-blocking notes

- **N7**: ARCHITECTURE_PLAN.md:3 says "reviewed under the native plan-721 audit" before any PASS exists. It must stay true at implementation and seal; otherwise the seal must amend it.
- **N8**: The readers now fail outside a Git checkout. Any consumer running `test:node` from a non-Git tarball will see these two suites fail, which is the intended behaviour. No such consumer was found in the workflows.
- **N9**: J11 remains a recorded note (not claimed), as the plan states.

### Required next action (Governor; then re-run `/qor-audit`)

**W1**:
1. Add an FC006 case whose cell begins with the exact `` `FailSafe/extension/package.json` `` and then names a further path, for example `` `FailSafe/extension/package.json` and `package.json` (root) ``.
2. List K6 (or an equivalent own mutant) in G2.
3. Re-record the patch sha256 and the maps, including `jmut721-iter2-auditor.py`.

Narrowing G2's "naming exactly" is an equally valid fix.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #986 and in the gate artifact `.qor/gates/2026-11-25T1958-4f4867/audit-iter2.json`.

---
_This verdict is binding. Gate LOCKED. Next: the Governor closes W1 and re-runs `/qor-audit`._
