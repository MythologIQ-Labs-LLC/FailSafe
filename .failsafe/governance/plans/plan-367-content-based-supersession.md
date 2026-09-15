# Plan: content-based resolution supersession, minus the vacuous-pass trap (#367 tranche 3c)

## Open Questions

None outstanding for this slice.

## Context

`AuditResolutionProjector.ts`'s module doc (FX927, tranche 1) disclosed two reasons
content/pattern-based supersession was removed as unsound:

1. **decision-driving-pattern problem**: `VerdictEngine.determineDecision` guarantees
   a PASS verdict can never carry the critical/high/medium pattern that drove an
   earlier WARN/BLOCK, so "later PASS, no pattern overlap" was true for virtually
   every real WARN/BLOCK regardless of whether the finding was actually re-verified.
2. **disjoint-pattern-namespace problem**: `validateClaim` (existence/claim-fabrication,
   pattern ids like `EXS001`) and `evaluateFileEvent` (content heuristics, a disjoint
   registry) can both log entries against the same `artifactPath`, with no
   schema-level way to scope a same-artifact comparison to "the same kind of check".

FX934 (tranche 3b) closed problem 2 by giving every ledger entry an accurate
`verificationMethod` (`'existence_claim'` vs `'sentinel_heuristic'`), but explicitly
did not reintroduce supersession, since problem 1 was still open.

Re-examining problem 1 while scoping this tranche: it is not actually fixable by
persisting "the decision-driving pattern" and checking whether a later PASS still
carries it, because a PASS **by definition** carries no critical/high/medium pattern
at all -- that check would be trivially true for literally every PASS, informative or
not. What that observation actually implies is the opposite conclusion: a later PASS
for the exact same `artifactPath` **and** the exact same `verificationMethod` (now
available via FX934) *is* real evidence that whatever that engine currently checks no
longer flags this artifact -- **provided the PASS reflects a real, non-empty check.**

That proviso is the one thing neither FX933 nor FX934 established, and tracing it
surfaced a genuine, previously-undocumented defect: `VerdictEngine.determineDecision`
also returns `PASS` when **zero heuristic checks ran at all**. Concretely:

- `HeuristicEngine.analyze(filePath, content)` returns `[]` immediately when
  `content` is falsy -- which is exactly what happens for `FILE_DELETED` events,
  oversized-file skips, and unreadable-content fallbacks (`VerdictArbiter.
  evaluateFileEvent`, `readFileContentSafe`).
- `ExistenceEngine.validateClaim(artifacts)` returns `[]` when `artifacts` is empty
  (an `AGENT_CLAIM` claiming nothing).
- In both cases, `determineDecision([])` falls through every severity branch to its
  final `return 'PASS'`.

The existing ledger payload (`{ matchedPatterns, summary }`) cannot distinguish this
vacuous PASS from a genuine "ran every check, nothing matched" PASS: `matchedPatterns`
is `[]` either way. Under a naive "later PASS, same path, same engine ⇒ superseded"
rule, **deleting a file that had an open BLOCK would silently clear that BLOCK** --
exactly the class of unsound inference this issue exists to prevent, just relocated
rather than fixed.

## Non-Goals

- No per-pattern / decision-driving-pattern persistence. Established above that it
  would not add anything a same-path-same-engine non-vacuous PASS doesn't already
  imply.
- No change to `ExistenceEngine` to report passing checks. `existence_claim` PASS
  entries stay permanently ineligible as supersession evidence under this rule
  (`heuristicsEvaluated` is always `0` for a clean claim) -- disclosed as a scoping
  limitation, not fixed, since it only ever makes supersession *less* available,
  never wrongly available.
- No use of `artifactHash` (FX933) as the correlation key. A genuine fix changes a
  file's content and therefore its hash; requiring hash equality would almost never
  fire for the case this targets. `artifactPath` remains the identity key, still
  excluding the synthetic `'unknown'`/`'claim_manifest'` values.
- No change to `ESCALATE` handling. Content-based supersession is scoped to
  `WARN`/`BLOCK` only; `ESCALATE` keeps its existing L3-only authority path
  (decision / `ESCALATED_UNDECIDED` / `LIVE`) untouched, so an inferred clean re-scan
  can never silently substitute for a pending human decision.
- No renderer/UI change.

## Phase 1: `payload.heuristicsEvaluated` on every ledger entry

### Affected Files

- `src/sentinel/engines/VerdictEngine.ts` -- `executeActions` adds
  `heuristicsEvaluated: verdict.heuristicResults.length` to the `appendEntry`
  payload, alongside the existing `matchedPatterns`/`summary`. `verdict.
  heuristicResults` is already carried on `SentinelVerdict`; no new parameter, no
  new call-site plumbing.

### Unit Tests

- `src/test/sentinel/VerdictEngine.test.ts` -- new cases: a verdict built from 3
  heuristic results (matched or not) logs `heuristicsEvaluated: 3`; a verdict built
  from `[]` logs `heuristicsEvaluated: 0`.

## Phase 2: consume it in the projector

### Affected Files

- `src/qorelogic/ledger/AuditResolutionProjector.ts`:
  - `ResolutionState` gains `"SUPERSEDED"`.
  - New helpers `heuristicsEvaluatedOf(entry)` (reads `payload.heuristicsEvaluated`,
    default `0`) and `isSyntheticArtifactPath(path)` (`undefined`/`'unknown'`/
    `'claim_manifest'`).
  - `projectOne` gains a third branch, after the existing decision/queued checks and
    before the final `LIVE` fallback, delegating to a new extracted helper
    `projectContentSupersession(source, later)`: for a `WARN`/`BLOCK` source entry
    (never `ESCALATE`) with a non-synthetic `artifactPath`, find the **earliest**
    later `AUDIT_PASS` entry with the same `artifactPath`, the same
    `verificationMethod`, and `heuristicsEvaluatedOf(entry) > 0`. If found, project
    `SUPERSEDED` with `resolvedByEntryId` set to that entry's id. Extracted into its
    own function (rather than left inline) specifically to keep `projectOne` from
    growing further past its pre-existing over-40-line length.
  - Module doc comment rewritten to describe the resolved state and the vacuous-pass
    finding, replacing the "deferred to a follow-up tranche" language from FX927/
    FX933/FX934.

### Unit Tests

`src/test/qorelogic/AuditResolutionProjector.test.ts`, new cases:

- same-path, same-engine, non-vacuous later PASS -> `SUPERSEDED`.
- same-path, same-engine later PASS with `heuristicsEvaluated: 0` -> stays `LIVE`
  (the regression pin for the defect this tranche exists to fix).
- an earlier vacuous PASS is skipped in favor of a later real PASS ->
  `resolvedByEntryId` is the real one, not the vacuous one.
- `ESCALATE` is never superseded by content evidence, even with a matching clean
  re-scan present.
- different `artifactPath` -> stays `LIVE`.
- synthetic `artifactPath` (`'unknown'`) -> stays `LIVE` even with a matching later
  PASS.
- order-independence for the new `SUPERSEDED` branch (mirrors the existing
  order-independence test for the decision path).
- the existing "no later evidence" test's comment is updated to state precisely why
  it still passes (the PASS fixture carries no `heuristicsEvaluated` at all, the
  same absent-field shape as before this tranche) rather than the now-superseded
  "pattern overlap" rationale; the existing cross-engine test is updated to set an
  explicit differing `verificationMethod` plus `heuristicsEvaluated: 42` on the PASS
  so it exercises the new engine-equality guard directly, rather than passing only
  because neither field was set.

## CI Commands

- `npx tsc -p . --noEmit`
- `npx eslint src/sentinel/engines/VerdictEngine.ts src/qorelogic/ledger/
  AuditResolutionProjector.ts src/test/qorelogic/AuditResolutionProjector.test.ts
  src/test/sentinel/VerdictEngine.test.ts --ext ts`
- `npm run compile && npx mocha --ui tdd` against the compiled
  `AuditResolutionProjector.test.ts` + `VerdictEngine.test.ts` + both
  `VerdictArbiter` suites + `Engines.test.ts` + `FileReader.test.ts` (repeated for
  determinism)
- `npm run test:node` (full `node --test` suite)
- `node scripts/check-test-runner-coverage.cjs`
- `node scripts/check-plan-citation-parity.cjs --structure-only`
