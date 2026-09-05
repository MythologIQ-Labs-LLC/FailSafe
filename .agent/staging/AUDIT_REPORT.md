# Audit Report — plan-233d-ledger-anchor.md

**Session**: 2026-09-05T0051-e48e6d
**Iteration**: 2
**Auditor**: The Qor-logic Judge (solo; `audit_risk_score` reports `option_b_required: false`)
**Risk Grade**: L2
**Target content hash**: see `.qor/gates/2026-09-05T0051-e48e6d/audit-iter2.json`

## VERDICT: PASS

V1 closed. Implementation is unlocked for `plan-233d-ledger-anchor.md` **at iteration 2 only** — this verdict certifies that content hash and no other.

---

## V1 (iteration 1) — CLOSED

The decaying `>= 200` threshold is replaced by two assertions that do not decay:

- **assertion 4** pins the declared anchor to the measured value `340`, so any bump fails and must be a deliberate edit carrying fresh justification;
- **assertion 5** asserts the protected surface is non-empty and reports its count.

Together these keep the anti-ratchet property independent of ledger length, which was the whole of the finding. The audit-bound security constraint is also now written into `### Changes`: the anchor is validated as an integer in JavaScript before it is passed.

## Verification of the closure

Not taken on the plan's word — the runner-reachability trap from Scope A's V3 was re-checked explicitly. All five FX946 assertions live in `ledgerAnchor.test.cjs` and the FX940 assertions in `qorlogic-config.test.cjs`; both are `.test.cjs`, both are discovered by `run-node-tests.cjs`, and `npm run test:node` is in `## CI Commands`. **Every declared assertion has a runner.** No repeat of the Scope A defect.

## Passes

| pass | result |
|---|---|
| Prompt injection | PASS — `prompt_injection_canaries` exit 0 |
| Security (L3) | PASS — the SG-Phase47-A surface is now closed in plan text: integer validation in JS before the value reaches Python, argv passing, `shell: false`, fixed `-c` script |
| OWASP Top 10 | PASS — A03 closed by the validation above; A04 closed by assertion 3 (an absent declaration errors rather than falling back to auto-detect); A08 no deserialization beyond `JSON.parse` of a repo-local config |
| Test functionality | PASS — every assertion invokes the runner and asserts on its exit code; none presence-only |
| Infrastructure alignment | PASS — the `qor.scripts.ledger_hash` flag is an adjudicated consumer-side false positive (installed, not vendored); import, `site-packages` `__file__`, and the `verify_post_anchor(ledger_md, boundary_entry=None) -> int` signature independently confirmed |
| Feature test declaration | PASS — FX946 and FX940 declare `test_path` + `test_descriptor`, and the FX946 descriptor was updated to match the amended assertion set |
| Ghost UI / Live-progress / Filter-stage / Runtime-principal | n/a |
| Section 4 Razor | PASS |

## Binding constraints on implementation

The seal must show these were honored.

1. **Anchor validation** — the declared anchor is validated as an integer in JavaScript before use and rejected otherwise; it reaches Python as an argv value, never interpolated into the `-c` source (SG-Phase47-A). Validation is the mitigation, not argv passing alone.
2. **No auto-detect fall-back, ever** — an absent, malformed, or non-integer declaration is a non-zero exit. Falling back to `boundary_entry=None` would silently restore the one-entry-deep behaviour while reporting clean.
3. **No mutation of the live ledger** — every assertion runs against a temp copy. `docs/META_LEDGER.md` must be byte-identical before and after the suite.
4. **Fail-closed above, tolerant below** — the runner propagates upstream's exit code unchanged; it must not soften a failure into a warning.
5. **Assertion 1 must be shown red against auto-detect** — the finding rests on it. Demonstrate that the same tamper passes under `boundary_entry=None` and fails under the declared anchor.

## What this plan got right

- **It proved the defect before proposing a fix.** Every number in `## Baselines` came from running the real verifier, including the decisive pair: `#500` tampered is invisible under auto-detect (`rc=0`) and caught under a declared anchor (`rc=1`).
- **It chose its central constant by measurement**, not preference — `340` is the lowest anchor at which the live ledger passes, which maximises the protected surface (268 entries, up from 1) without shipping a red gate.
- **It uses upstream's existing `boundary_entry` parameter** rather than reimplementing chain arithmetic. Third consecutive cycle where the correct answer was "the mechanism exists; enforcement over it does not."
- **Assertion 3** — an absent declaration must be an error, not a fall-back — is the strongest in the plan, and closes the exact way this fix could silently un-ship itself.
- **It refuses to adopt `verify()`** and says why: 278 tainted entries and 2 BREAKs would block every seal today. The pre-anchor residue keeps its existing disclosed status rather than being quietly redefined as acceptable.

## Lint ladder (iteration 2)

`plan_iteration_status_lint` 0 · `plan_test_lint` 0 · `plan_text_consistency_lint` 0 · `plan_feature_tdd_lint` 0 · `prompt_injection_canaries` 0 · `audit_risk_score` `option_b_required: false` · `plan_grep_lint` 1 `infrastructure-mismatch`, adjudicated above as a verified false positive.

---

_Gate unlocked. `/qor-implement` may proceed against iteration 2._
