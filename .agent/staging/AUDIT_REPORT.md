# AUDIT REPORT — plan-ledger-fork-guard (iteration 5)

**Target**: `.failsafe/governance/plans/plan-ledger-fork-guard.md`
**Session**: `2026-08-23T1722-ledgerc`
**Date**: 2026-08-23
**Judge**: Qor-logic Judge
**Risk Grade**: L2
**Mode**: Option B — independent reviewer (mandated by `audit_risk_score`: `option_b_required: true`, flags `high-citation-surface`)

## VERDICT: **PASS**

0 blocking. 3 non-blocking residuals, none holding up implementation. `findings_categories`: none.

Gate artifact: `.qor/gates/2026-08-23T1722-ledgerc/audit-iter2.json`.

---

## Trajectory

| iteration | blocking | class |
|---|---|---|
| 1 | 5 | doctrine signature (B1/B3/B4/B5) |
| 2 | 2 | mode-scoping contradiction |
| 3 | 1 | mode-scoping contradiction |
| 4 | 1 | doctrine signature (B9) |
| 5 | **0** | — |

The escalation cap was never reached: the longest consecutive run of the doctrine signature is one. That classification was made by the independent reviewer, on request, and deliberately not by the author.

---

## Why the PASS is not a fifth-attempt concession

The reviewer named, in advance, what would still have drawn a VETO and did not occur: if Case 2's mutation had left any coverage pin unfired; if `{form, value}` had broken `groupByPreviousHash`; if the live-mode cases had derived their expected values from a guard run rather than external measurement; or if any of the four coverage pins had failed to reproduce against the artifact. All four were checked and none holds.

---

## B9 — CLOSED (the iteration-4 blocking finding)

`--repo-root` is the mode CI executes (`npm run governance:ledger-fork`), and until iteration 5 no declared test invoked it productively — only the usage-error path, which exits before doing any work. Everything the cycle built to fix B1's circularity was verified as *values returned by `coverage()`* and never as anything that gates an exit code.

Two declared cases close it, and they compose:

- **Case 1 — parser check.** `main(['--repo-root', <tmp with verbatim ledger copy>])` exits 0 and asserts `inspected == 614`. A degraded parser produces a wrong count and fails here.
- **Case 2 — wiring check.** The same copy with one sentinel line replaced by `7f3a9b2e…` exits non-zero naming the failed pin. Verified empirically by the Judge before it was written into the plan: `labels` 595 (unchanged), `sentinel` 63 → **62**, `recovered` 528 → **529**, `unclassified` unchanged. Two pins fire independently.

Neither case substitutes for the other. An implementation that computes all four counts and never wires them into the exit code passes Case 1 and fails Case 2.

Incidental: the identity still holds across the mutation (595 = 529 + 62 + 4), which is a live demonstration that it is the tautology LD3 says it is.

Case 1 also covers something neither pass had named — nothing previously asserted that null-valued entries are excluded from grouping. Had `groupByPreviousHash` grouped on `value: null`, the 63 sentinels plus 4 unclassified would form one false 67-member group and Case 1's exit 0 would fail.

---

## N15 — CLOSED

`classifyPreviousHash(line) -> {form, value}`, `value` being the full hex run for the two hash forms and `null` otherwise. Every declared consumer traced: `coverage` buckets on `form` (so the matching-shape stub is bucketed as a genuine sentinel); `groupByPreviousHash` needs `value`, and because both hash forms return the *full* run, `#259` (inline, 66-hex) and `#262` (backtick, same 66-hex) group — an assertion that would fail under a prefix-truncating shape. `value: null` for sentinel/unclassified is load-bearing: all 63 sentinels share the literal `pending-runtime-tooling` and would otherwise form one false 63-member group.

## N16, N17 — CLOSED

The pinned-64 removal is re-justified on the ground that still holds. D2 carries both the `coverage` parameter and the classifier return shape as contract; D4 demonstrates RULE S in both columns.

---

## Non-blocking residuals

- **N18** — RULE S's original taxonomy sorted *quantities* when mode-scoping follows the *assertion*. **Reworded in iteration 5** after the reviewer's verdict was authored: assertions are now classified by where the expected value comes from (live artifact / input under test / literal / relation). Zero current consequence either way — all seven rows were correctly scoped as written.
- **N19** — a corroborating symptom of N18 (the missing symmetric `inspected == 614` live pin). Subsumed by the N18 rewording; the pin is now declared.
- **N20** — Case 2's mutation value was unspecified as absent from the artifact. **Closed in iteration 5**: it reuses `7f3a9b2e…`, already verified absent and `is_placeholder_pattern`-clean across all five heuristics.

---

## Author errors corrected in this record

- The iteration-1 report claimed the reviewer's dialect sub-counts (249/24/21/2) did not reproduce. They do — `grep -E '[0-9a-f]{N}'` matches runs of **at least** N, so those are cumulative thresholds decomposing to 225/3/19/2. Verified: `{64}`→249, `{65}`→24, `{66}`→21, `{67}`→2. The Judge misread the framing; the reviewer's evidence is sound in full.
- The Judge quoted 401 as the highest `PREV_HASH_BASELINE` member. It is **330**; 401 sits in `[397,401]`, the attested group LD7 excludes from the baseline.

---

## Independent review — measured value

Solo pass found 2 of the 5 iteration-1 blocking findings. The independent reviewer found B1 (circular baseline), B3 (unrunnable falsifier triple), B5, B9 and N18. Two were unreachable by the author in principle: **B9**, because the author wrote the `--file` fix that created the gap, and **N18**, because it is a defect in the rule the author authored. The reviewer also recorded B9 against itself as a miss carried since iteration 2 rather than letting it read as an iteration-4 regression.

---

## Ledger hold

**No META_LEDGER entry is written for this verdict.** LD11 holds allocation until PR #432 merges and takes `#597`. `docs/META_LEDGER.md` remains at head #596.

---

## Required next action

`/qor-implement`. Implementation is unlocked.
