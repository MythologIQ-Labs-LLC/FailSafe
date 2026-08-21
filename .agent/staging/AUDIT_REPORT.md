# AUDIT REPORT — plan-233-read-ledger-once.md (iteration 2)

**Session**: 2026-08-21T2030-233res
**Auditor**: The Qor-logic Judge
**Mode**: **adversarial / Option B** — `audit_risk_score` returned `option_b_required: true` (flag `high-citation-surface`). Independent reviewer dispatched as a `code-reviewer` subagent receiving only the plan + repo, with no exposure to the author's reasoning. Operator authorized the subagent route explicitly for this audit.
**Target**: `plan-233-read-ledger-once.md`
**Target content hash**: `238f4c2cd4b374be827a7a0bf2ea7cdc07840e17878f3e328f447853b623155e`
**Risk Grade**: L2

---

# VERDICT: VETO

**Findings categories**: `specification-drift`, `coverage-gap`

Two blocking findings. Iteration 1's V1 and V2 are both **resolved and verified resolved**. These are new, introduced by V2's own fix.

**The Option B mandate earned its cost.** V4 below was found by the independent reviewer and missed by the author, on the second consecutive audit of a plan the author had already been VETOed on once. That is precisely the SG-007 author-momentum bias the mandate exists to catch.

---

## Iteration-1 findings: verified resolved

| # | Finding | Status |
|---|---|---|
| V1 | 0 citations truth-checked (evidence format unreadable to the lint) | **RESOLVED** — `plan_grep_lint` now reports **9 citation(s) truth-checked** against 9 Locked Decisions (count parity checked, not just exit code). Root cause was `_LD_HEADING_RE`: the scanner only enters regions under a heading matching "locked decision"/"citation inventory"; the LDs were inline text, so the region was never entered. Now under explicit headings. Independent reviewer verified all nine (LD0–LD8) resolve to the exact cited line, indentation and text, each pattern matching exactly one line per file. |
| V2 | `versionStatus` dropped from the shared envelope | **RESOLVED** — `build()` now derives a floor-aware envelope via `applyVersionFloor` and passes it to diagnostics, while the floor-blind envelope continues to gate `ledgerReadable`, preserving the B197 render contract at `WorkspaceArtifactBuilder.ts:78`. Reviewer confirmed the routing is correct and the precedence (floor before content) is preserved. |

---

## V3 — `applyVersionFloor` honors half of the type it accepts (`specification-drift`) — BLOCKING

`ConsumerReadOptions` has two fields (`consumer-adapter.ts:22-27`). `classifyRead` consumes **both**: the version floor at `:101-104` and staleness at `:127-133`. The plan's helper reads `opts` only through `unsupportedReason` and `opts?.versionStatus?.installed`. It has no stale rung.

```
applyVersionFloor(classifyMetaLedgerText(read, p), {maxAgeMs: 1})  -> 'ok',    reason null
classifyMetaLedgerText(read, p, {maxAgeMs: 1})                     -> 'stale', reason "...older than maxAgeMs=1..."
```

Every other branch **is** equivalent — independently confirmed field by field by both the author's trace and the reviewer's: provenance construction (including the `opts === undefined` case), the floor branch's `artifact`/`state`/`data`/`reason`, floor-before-content precedence, and the `readError -> malformed` / `no-readError -> unavailable` / parse-throw / parses-empty / `ok` rungs (none of which read `opts`, so `{...env, provenance}` preserves them).

**Why blocking despite being latent.** Production output today is unaffected — no `build()` call site passes `maxAgeMs`, and the only production `buildConsumerDiagnostics` caller is `WorkspaceArtifactBuilder.ts:97`. The defect is the **locked contract**, not the current output: this is a *new exported API* typed on `ConsumerReadOptions` that silently honors one of its two fields, its doc comment (plan Phase 1) claims it "reproduc[es] `classifyRead`'s precedence" without qualification, and plan line 263 writes that unqualified equivalence into `FX930`'s permanent FEATURE_INDEX descriptor. `maxAgeMs` is live and exercised (`consumer-adapter.test.ts:118-131`). A future caller passing it gets a wrong state from an API whose recorded contract says otherwise.

**Required next action:** Governor: either add the staleness rung to `applyVersionFloor`, or narrow its parameter type so `maxAgeMs` is unrepresentable (`QorLogicVersionStatus` is already imported at `consumer-adapter.ts:19`) and restate the FX930 descriptor to the narrowed claim. Then re-run `/qor-audit`.

## V4 — the equivalence test cannot reach two of the five states it claims (`coverage-gap`) — BLOCKING

Plan Phase 1's fixture-equivalence test calls `readMetaLedgerArtifact(root)` with **no opts**, while the plan claims it confirms behavior preservation "across `ok`/`malformed`/`stale`/`unsupported`/absent".

Both `stale` and `unsupported` are unreachable without opts, and the existing suite proves it:

- `consumer-adapter.test.ts:109` — reaching `unsupported` requires `{ versionStatus: BELOW_FLOOR }`.
- `consumer-adapter.test.ts:118-121` — reaching `stale` requires `{ maxAgeMs: 1 }` **plus** an `fs.utimesSync` mtime rewind.

Real coverage is `ok` / `malformed` / `unavailable` only. The `stale` and `unsupported-version` fixtures would be materialized and then classified as `ok`, and the assertion would pass.

Compounding, and why this pairs with V3: the FX930 equivalence matrix is `{below-floor, meets-floor, undefined}` — its `opts` axis never carries `maxAgeMs`, so **it passes against the very implementation that drops it**. The plan bills that test as "the anti-drift assertion that makes deriving the second envelope safe"; it does not pin that drift. Net effect: no test anywhere in the plan drives `maxAgeMs` through either new seam, while the plan's central promise is proven-zero-behavior-change.

This finding was produced by the independent reviewer and **missed by the author**.

**Required next action:** Governor: pass the state-producing opts (and the `utimesSync` rewind for `stale`) in the fixture-equivalence test so all five named states are actually reached, and add a `maxAgeMs` axis to the FX930 matrix so it fails against a floor-only helper. Then re-run `/qor-audit`.

---

## Non-blocking findings (fix in iteration 3; none alone justifies a cycle)

1. **`MetaLedgerRead` shape vs. its own acceptance criteria.** The plan declares `MetaLedgerRead { read, sourcePath }`, but two D4 criteria and the Phase 1 test assert the inner `{text, mtimeIso}` shape directly, and one says `readMetaLedgerRaw` "returns `fsRead`'s result unmodified" — it *wraps* it. Two DoD criteria are wrong as written.
2. **Phase 2 snippet does not compile.** It uses `MetaLedgerEntry` in `diagnostics.ts`; that file's imports (`diagnostics.ts:10-17`) do not include it and the plan's Affected Files does not add it. Verified directly.
3. **"three seams" vs "5 -> 3".** Phase-3 prose says the build touches the ledger "once … instead of three times through three seams" while the header table says 5 → 3; also only two of the three go through the ladder (`WorkspaceArtifactBuilder.ts:79`, `diagnostics.ts:40`) — `readGovernanceState` is a raw `readFileSync`.
4. **Two measurement instants.** The plan states a 1,751,562-byte ledger, but 8,715,735 / 5 = 1,743,147 exactly. Harmless — the ledger grew between measurements as this session appended entries — and the exact divisibility independently corroborates five whole-file reads.
5. **Title overstates scope.** `buildGovernancePhase` (`HubSnapshotService.ts:180` → `ConsoleServerHub.ts:79-82`) also touches the ledger in the same snapshot, so "once per hub snapshot" is not literally true. Disclosed in the plan's own limitations, but the title should not outrun them.
6. **Path imprecision in an exclusion.** The exclusions cite `ConsoleServerHub.ts:79` without a path; the file is at `src/roadmap/`, not `src/roadmap/services/`.
7. **Read-count caveat.** 5 → 3 holds on a fixture whose ledger classifies `ok`/`stale`. On the `malformed` fixture it is 4 → 2, because `MetaLedgerReader` is skipped when `ledgerReadable` is false. The plan's read-count test names no fixture.

---

## Pass Inventory

| Pass | Result | Note |
|---|---|---|
| Step 0.3 plan-iteration lint | PASS | exit 0; `**iteration**: 2` carries no draft/pre-audit marker |
| Step 0.4 unchanged-plan short-circuit | PASS | content hash differs from iteration 1 |
| Step 0.5 cycle-count escalation | PASS | 2 consecutive VETOs; threshold is 3 same-signature. Signatures differ (iter 1 `specification-drift`; iter 2 `specification-drift` + `coverage-gap`). Not yet escalated to `/qor-remediate` — **iteration 3 is the last before escalation.** |
| Step 0.6 lint ladder | PASS | `plan_grep_lint` **9/9 truth-checked**; `plan_text_consistency_lint` exit 0; `plan_test_lint`, `delivery_branch_lint`, `plan_signature_widening_caller_lint`, `plan_data_round_trip_lint`, `plan_feature_tdd_lint` all clean |
| Prompt Injection | PASS (WARN) | three `'<script'` canary WARNs in `docs/META_LEDGER.md` — code-span quotations of the governance-file XSS guard test |
| Security L3 | PASS | read-path only |
| OWASP Top 10 | PASS | no subprocess, deserialization, or fail-open introduced |
| Ghost UI / Live-Progress | N/A | no UI surface |
| Section 4 Razor | PASS | `build()` ~40 lines, `applyVersionFloor` 7, `readGovernanceState` 8; nesting ≤2 |
| Self-Application (Step 3.5) | **PASS** | V1 resolved and mechanically proven: 9 LDs, 9 truth-checked, count parity verified |
| Test Functionality | PASS | all 13 described tests invoke the unit and assert on output or observed read counts; none presence-only |
| Closed-enum inverse coverage | N/A | no `CANONICAL_*_VALUES` / `normalize*` pair |
| **Coverage (state reachability)** | **VETO** | V4 |
| Dependency Audit | PASS | zero new dependencies |
| Macro-Level Architecture | PASS | no new boundary; helper sits beside its ladder |
| Feature Test Coverage | PASS (with V4 caveat) | FX929/FX930 NEW, FX892/FX893 MODIFIED all carry failing-if-broken descriptors; FX892's descriptor is *overclaimed* per V4, which is charged there rather than double-counted |
| **Infrastructure Alignment** | **VETO** | V3 (interface-contract mismatch against `classifyRead`); all 9 LD citations independently verified correct by the reviewer |
| Runtime Contract Walk | WARN-only (V2 ramp) | not binding |
| Filter-Stage Ordering | N/A | no pipeline-shaped function |
| Orphan Detection | PASS | no new files |

## Documentation Drift

`doc_tier: standard`, two declared terms (`MetaLedgerRead`, `applyVersionFloor`), populated boundaries. No glossary divergence. Advisory only.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->
Two consecutive VETOs on this plan, with **differing signatures** (iter 1: evidence-format + dropped option; iter 2: incomplete option handling + unreachable test states). The escalator's 3-consecutive-same-signature threshold is not met, so `/qor-remediate` is not yet the legal next action. Iteration 3 is the last before escalation applies.

Worth naming rather than burying: iterations 1 and 2 are the *same underlying failure in two costumes* — a claim of completeness (`ConsumerReadOptions` handled; five states covered) asserted without exercising the thing that would falsify it. V1 was evidence the lint couldn't read; V3/V4 are options and states the tests don't reach. If iteration 3 produces a third variant of "claimed coverage that isn't", that is a process signal, not a plan defect, and should route to `/qor-remediate`.

## What survives (do not relitigate)

- The retarget, the exclusions (#591 F1–F6, re-verified against source by the reviewer), and rejecting the mtime memo.
- **Read count 5 → 3: CORRECT.** Independently traced. Notably `MetaLedgerReader` reads *once*, not three times — `parseEntries` caches, so the three call sites share one read. `SystemStateReader` genuinely fires (its `CHAIN_STATUS_RE` `^##` anchor does not match this repo's `_Chain Status: …_` line, so the ledger fallback is reached).
- **Parse count 2 → 1: CORRECT.** `applyVersionFloor` performs no parse; `opts?.ledger ??` short-circuits `diagnostics.ts:40`.
- **All 9 LD citations hold** — line, indentation, and text exact; each pattern resolves to exactly one line.
- `readGovernanceState(text)` preserves degradation exactly: `fsRead` returns `text === null` for both absent and unreadable, both → `IDLE`, matching the prior `existsSync` + `try/catch` posture. No error path dropped.
- Envelope routing (floor-blind gates `ledgerReadable`, floor-aware to diagnostics) is correct against the B197 contract.
- No missing callers; `ledger?` is optional; data-array aliasing between the two envelopes is harmless (neither consumer mutates; `summarize` drops `data`).

## Reviewer-declared limits

The independent reviewer explicitly recorded as **not verified** (no execution tool in its session): the wall-clock figures (7.7 / 13.9 / 5.5 / 477 / ~120 ms), the on-disk ledger size, and the text of ledger entries #591/#592. It verified the six #591 exclusions directly against source instead. Those timings were measured by the author with instrumented runs recorded in #591; they remain author-measured and independently unconfirmed.

---

_Verdict: VETO. Required next action: `/qor-plan` iteration 3 (V3 helper contract, V4 test reachability, plus the seven non-blocking items), then re-run `/qor-audit`._
