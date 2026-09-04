# Plan: per-engine verification provenance on ledger entries (#367 tranche 3b)

## Open Questions

None outstanding for this narrow slice. This tranche does not attempt to reintroduce
content/pattern-based resolution supersession into `AuditResolutionProjector` — that
remains blocked on a second, larger open question (decision-driving pattern
persistence, not the full matched-pattern set) that this plan does not answer. See
Non-Goals.

## Context

`AuditResolutionProjector.ts`'s module doc (FX927, `#367` tranche 1) disclosed two
independent reasons content/pattern-based supersession was removed as unsound:

1. `VerdictEngine.determineDecision` guarantees a PASS verdict can never carry the
   critical/high/medium pattern that drove an earlier WARN/BLOCK, so "later PASS, no
   pattern overlap" was true for virtually every real WARN/BLOCK regardless of
   whether the finding was actually re-verified (the decision-driving-pattern
   problem — untouched by this tranche).
2. `VerdictArbiter.validateClaim` (existence/claim-fabrication checks, pattern ids
   like `EXS001`) and `evaluateFileEvent` (content heuristics, a disjoint pattern
   registry) can both log `AUDIT_FAIL` entries against the same `artifactPath`, but
   `LedgerEntry.verificationMethod` is hardcoded to the literal `'sentinel_heuristic'`
   in `VerdictEngine.executeActions` for **both** paths — there is no schema-level way
   to scope a same-artifact comparison to "the same kind of check" (the per-engine
   provenance problem — this tranche closes it).

FX933 (`#367` tranche 3a) populated `LedgerEntry.artifactHash` but explicitly left
both problems above unresolved and did not touch `verificationMethod`.

`VerdictArbiter.evaluateEvent` already unambiguously routes every event to exactly
one engine before `VerdictEngine.generateVerdict` is ever called: `AGENT_CLAIM`
events go to `validateClaim` (existence/claim-fabrication engine); every other event
type goes to `evaluateFileEvent` (content-heuristic engine). `event.type` is already
a parameter of `generateVerdict`, so this distinction is available for free at the
exact point `verificationMethod` is currently hardcoded — no new call-site plumbing,
no new field, no schema change.

## Non-Goals

- No reintroduction of content/pattern-based resolution supersession into
  `AuditResolutionProjector`. The decision-driving-pattern problem (FX927 reason 1
  above) is untouched; the projector continues to project only the explicit L3
  escalation/decision path after this change.
- No change to `determineDecision`, the pattern registries, or `matchedPatterns`.
- No renderer/UI change.
- No touch of the `artifactHash` plumbing from tranche 3a.

## Phase 1: Derive `verificationMethod` from the routing the caller already did

### Affected Files

- `src/sentinel/engines/VerdictEngine.ts` — `generateVerdict` computes
  `verificationMethod` from `event.type === 'AGENT_CLAIM' ? 'existence_claim' :
  'sentinel_heuristic'` and passes it to `executeActions`, which uses it in the
  `ledgerManager.appendEntry(...)` call instead of the hardcoded literal.
- `src/qorelogic/ledger/AuditResolutionProjector.ts` — module doc comment updated:
  the per-engine-provenance half of FX927's disclosed blocker is resolved; the
  decision-driving-pattern half is not, so no supersession inference is reintroduced
  by this change alone.
- `docs/FEATURE_INDEX.md` — register FX934.

### Changes

`executeActions(verdict: SentinelVerdict)` gains a second parameter,
`verificationMethod: string`, supplied by its one call site inside `generateVerdict`.
No other internal or test call site calls `executeActions` directly (it is private),
so this is a zero-blast-radius signature change.

### Unit Tests

- `src/test/sentinel/VerdictEngine.test.ts` — new case: `generateVerdict(EVT({ type:
  'AGENT_CLAIM' }), ...)` produces a ledger `appendEntry` call with
  `verificationMethod: 'existence_claim'`. Existing/extended case: every other event
  type (the suite's existing default, `'file.modified'` via `EVT()`) continues to
  produce `verificationMethod: 'sentinel_heuristic'` — a regression pin on the
  pre-existing behavior tranche 3a and earlier tests already relied on implicitly.

## CI Commands

- `tsc -p . --noEmit`
- `eslint src --ext ts`
- `mocha --ui tdd` against the compiled `VerdictEngine.test.ts` suite (this sandbox
  has no `vscode-test` extension host; exact-head CI's `npm test` job is the
  authoritative full-suite gate)
- `node scripts/check-test-runner-coverage.cjs`
