# AUDIT REPORT - plan-233-read-ledger-once.md (iteration 3)

**Session**: 2026-08-21T2030-233res
**Auditor**: The Qor-logic Judge
**Mode**: Option B adversarial - `audit_risk_score` returned `option_b_required: true` (flag `high-citation-surface`). Operator-authorized `code-reviewer` subagent receiving only the plan and repo, with no exposure to the author's reasoning.
**Target**: `plan-233-read-ledger-once.md`
**Target content hash**: `6291b528dfadcb5b56ebfcf4ec7ac9a2ad82565bbd66eb98a2a0e08ed18f0966`
**Risk Grade**: L2

---

# VERDICT: VETO (third consecutive) - routed to `/qor-remediate`, not a fourth plan iteration

**Findings categories**: `coverage-gap`, `test-failure`

Ledger: **#594** (verdict + escalation) and **#595** (addendum B3, which arrived from the reviewer after #594 was sealed and is recorded separately rather than folded back).

---

## Iteration-2 findings: resolved

| # | Finding | Status |
|---|---|---|
| V3 | `applyVersionFloor` typed on `ConsumerReadOptions` but honored only `versionStatus` | **RESOLVED** - parameter narrowed to `versionStatus?: QorLogicVersionStatus`, making the wrong call a compile error rather than a documented hazard. Reviewer verified the corrected `@ts-expect-error` pin is sound in BOTH directions: TS2345 (missing required members) under the narrowed type; TS2578 (unused directive) under a widened one. |
| V4 | Fixture-equivalence test drove no options, so `stale`/`unsupported` were unreachable | **PARTIALLY RESOLVED** - the two named states are now driven correctly, but see B2. |

## B2 - the corrected test still cannot reach `unavailable` (`coverage-gap`) - BLOCKING

The test claims five-state coverage over the six `qor-consumer` fixtures. **All six ship a `META_LEDGER.md`** (verified by enumeration); `missing-optional` and `partial-migration` lack `FEATURE_INDEX.md`, not the ledger. Four states are reachable, not five, and `unavailable` passes without ever being exercised. The subsidiary count is also wrong: a bare no-options call reaches **two** states, not the stated three.

Sharper rationale than the count alone: the redefinition is **compositionally identical** to what it replaces - old `classifyFile` and new `classifyMetaLedgerText(fsRead(p), p, opts)` reach the same `classifyRead` with the same arguments. So the six-fixture test has exactly ONE real failure mode - a `readMetaLedgerRaw` that botches absent-vs-unreadable discrimination - and no fixture can reach it. FX892's descriptor would lock a test with no failing mode into FEATURE_INDEX.

## B3 - the "parsed once" half of the deliverable has no falsifying check (`test-failure`) - BLOCKING

The plan asserts the parse reduction in five places. **Every check it declares counts `fs.readFileSync` and nothing else.**

Empirically confirmed against the compiled adapter and a materialized `supported` fixture: replacing the Phase-3 overlay with a second `classifyMetaLedgerText(raw.read, raw.sourcePath, {versionStatus})` yields **2 parses vs 1**, **byte-identical envelopes**, and an **identical read count of 3** - because `classifyMetaLedgerText` consumes an already-attempted `RawArtifactRead` and touches no fs. The substitution passes 100% of the plan's tests while costing +13.9 ms of the 29.3 ms claimed (~47% of the deliverable) on the `CommitCheckRoute:33` commit-blocking path, and deletes the only stated reason `applyVersionFloor` exists.

Countermeasure verified feasible: `parseMetaLedgerEntries` is emitted as a plain CommonJS export with `writable=true configurable=true`, so a parse-count spy installs exactly as the read-count spies do.

## B1 - RETRACTED

The reviewer reported the `@ts-expect-error` pin as still carrying an `as never` cast. That defect was real but had already been self-caught and fixed in `01b2253c` before the reviewer re-read; the surviving text is a parenthetical explaining why that form is wrong. Its reasoning corroborates the fix. **Not counted.**

## Non-blocking (six, all verified)

Phase 3's import change is unstated while the plan calls out the identical gap for `diagnostics.ts` - its own standard applied asymmetrically; `opts` signature residue in prose and DoD D2; `readMetaLedgerRaw` return shape misstated in one test line and one DoD line (`{read, sourcePath}`, so assertions must target `.read`); "rewound mtime" misapplied to `classifyMetaLedgerText`, which takes a caller-supplied `RawArtifactRead.mtimeIso` and has no file to `utimesSync`; the new `ledger?` injection point has no root affinity; two citation line imprecisions.

---

## Why this escalated rather than iterated

**Seven instances of one signature across three iterations**, each a check asserted to prove something without exercising what would falsify it: V1 (evidence the lint could not parse - 0 citations truth-checked, passing by non-recognition), V2 (a dropped option), V3 (an option type honored halfway), V4 (test states unreachable), the `as never` pin (discriminated nothing), B2 (a state unreachable from the fixture set), B3 (a deliverable defended by a proxy measurement).

`cycle_count_escalator` did not fire: it keys on identical recorded category strings, which varied (`specification-drift` -> `+coverage-gap` -> `coverage-gap`+`test-failure`) while the underlying failure did not. **The mechanical check missing the pattern is itself an instance of the pattern.** Routed on substance.

## Verified correct - do not relitigate

All 9 LD citations resolve exactly. `QorLogicVersionStatus` genuinely imported at `consumer-adapter.ts:19`. The narrowed helper faithfully reproduces `classifyRead` for what it accepts, across every rung including the `undefined` case. Read counts empirically measured on both branches: `supported` 5->3, `malformed` 4->2, with `MetaLedgerReader` reading once (`parseEntries` caches) and `SystemStateReader` genuinely firing (no fixture ships `SYSTEM_STATE.md`). Parse count 2->1. B197 gating preserved. `readGovernanceState(text)` degradation identity holds.

## Reviewer-declared limits

No execution tool: the wall-clock figures and on-disk ledger size were marked **not verified**. The read counts, by contrast, were empirically measured this cycle and are no longer author-assertion.

---

_Verdict: VETO. Required next action: `/qor-remediate`. The target is the authoring and self-review habit, not a fourth patch. The #233 slice's design survives intact and is recoverable from this plan._
