# Plan: populate Audit Log ledger `artifactHash` from already-read content (#367 tranche 3a)

**Process note (2026-08-23, post-hoc):** implementation for this slice was authored and merged into PR `FailSafe#434` before this plan document existed — a real process gap, not a deliberate skip. `FailSafe#367`'s two prior tranches (FX927, FX928-adjacent work) were also PR'd directly without a `/qor-plan` cycle, and `docs/FEATURE_INDEX.md`'s FX927 row disclosed that precedent explicitly. A maintainer review on PR #434 (2026-08-23) correctly identified that `AGENTS.md`'s "Never implement without a PASS verdict from `/qor-audit`" is a stronger, binding rule that precedent does not override. This plan is authored now, against the code as actually delivered, so the SHIELD `Plan -> Audit` lineage exists for this slice before the PR returns to ready-for-review. It documents the design that was implemented, not a forward-looking proposal.

## Open Questions

None outstanding for this narrow slice. The larger open question this slice deliberately does not answer — how to reintroduce content/pattern-based resolution supersession into `AuditResolutionProjector` — is `FailSafe#367`'s own stated follow-on and is explicitly out of scope here (see Non-Goals).

## Context

`AuditResolutionProjector.ts`'s module doc (landed under FX927, `#367` tranche 1) flagged `LedgerEntry.artifactHash` as "already-declared but currently-unwritten" on the Sentinel WARN/BLOCK/ESCALATE ledger-write path, and named populating it as one half of a two-part schema addition needed before content-based resolution supersession could be reintroduced (the other half — per-engine provenance / decision-driving-pattern persistence — is a separate, larger design question, untouched here).

`VerdictArbiter.evaluateFileEvent` already reads a file's content once, via `readFileContentSafe`, to feed the heuristic and LLM engines. That content was available and discarded rather than reaching the ledger write. This repo has an explicit, ledger-recorded aversion to redundant re-reads (`#233`'s `plan-233-read-ledger-once.md`, now on its fourth audit iteration over exactly this class of claim), so the only acceptable design was to thread the already-read content through, never to re-open the file.

## Non-Goals

- No reintroduction of content/pattern-based resolution supersession into `AuditResolutionProjector` (the disjoint-pattern-namespace and decision-driving-pattern problems FX927's review found remain unresolved; the projector does not consume `artifactHash` after this change).
- No ledger schema/column change — `artifactHash` already existed as a declared, optional `LedgerEntry` field; this slice only populates it on one previously-silent path.
- No renderer/UI change.
- No touch of `FailSafe#233`'s parked `plan-233-read-ledger-once.md` cycle, its staged audit record, or PR `#433`.

## Phase 1: Thread already-read content into the ledger write

### Affected Files

- `src/shared/types/sentinel.ts` — add `artifactHash?: string` to `SentinelVerdict`, alongside the existing `artifactPath?: string`.
- `src/sentinel/engines/VerdictEngine.ts` — `generateVerdict` gains a trailing optional `fileContent?: string` parameter; when present, hash it via the existing `ArtifactHasher` and set both `verdict.artifactHash` and the `ledgerManager.appendEntry(...)` call's `artifactHash`. Trailing-position placement is deliberate: every existing positional call site (7 call sites across `VerdictArbiter.ts` and test files) keeps compiling unchanged.
- `src/sentinel/VerdictArbiter.ts` — `evaluateFileEvent` forwards the `content` string it already reads via `readFileContentSafe` into the new `generateVerdict` parameter. `validateClaim` (the `AGENT_CLAIM` existence-check path) is unchanged — it never reads file content, so its call correctly continues to omit the parameter and `artifactHash` stays unset.
- `src/qorelogic/ledger/AuditResolutionProjector.ts` — module doc comment updated: this half of the FX927-disclosed follow-up is done; the projector does not yet consume `artifactHash` and no supersession inference is reintroduced by this change alone.

### Changes

`ArtifactHasher.hashArtifact(filePath, content: Buffer): { hash: string, ... }` already existed (used by `GovernanceRouter.ts`'s unrelated commit-gate path) and takes a `Buffer` the caller already has, rather than reading a file itself — exactly the shape this slice needed. `VerdictEngine` instantiates one `ArtifactHasher` per engine instance (matching its existing per-instance ownership of `TrustEngine`/`PolicyEngine` etc.) and calls `hashArtifact(filePath, Buffer.from(fileContent, 'utf8')).hash` only when `fileContent !== undefined`.

`readFileContentSafe` (`FileReader.ts`) decodes the file as UTF-8 (`buffer.toString('utf-8')`) before `VerdictArbiter` ever sees it. Re-encoding that string via `Buffer.from(fileContent, 'utf8')` round-trips losslessly for valid UTF-8 content, so the resulting hash matches a hash of the on-disk bytes for the overwhelming majority of real source files. It does **not** for a file containing invalid UTF-8 byte sequences: `toString('utf-8')` substitutes the Unicode replacement character for invalid sequences, and re-encoding that string does not reproduce the original bytes. This is disclosed as a known, deliberate limitation (both in the code comment and the `FEATURE_INDEX.md` entry) rather than claimed as a byte-exact content hash — the alternative, re-reading the file as raw bytes at hash time, would reintroduce the exact redundant-read class `#233`'s ledger-once thread exists to eliminate, for a benefit (byte-exact hashing of files already containing invalid UTF-8, which VS Code's own text-editing model does not represent well either) that does not justify the cost.

`artifactHash` correctly stays `undefined` on every path that has no real file content to hash: `FILE_DELETED` events (content is never read — `VerdictArbiter.ts`'s existing `if (event.type !== 'FILE_DELETED')` guard), oversized-file skips and read errors (`readFileContentSafe` returns `content: undefined`), the malformed-event-payload fallback (`filePath = 'unknown'`, short-circuits before any read), and `AGENT_CLAIM` existence checks (`validateClaim` never reads file content at all, `filePath` there is `artifacts[0] || 'claim_manifest'`).

### Unit Tests

- `src/test/sentinel/VerdictEngine.test.ts` (extended, +7 cases) — `fileContent` present sets `verdict.artifactHash` to its SHA-256 (computed independently in the test via `crypto`, not compared against a hardcoded string); absent `fileContent` leaves it `undefined`; identical content hashes identically across two otherwise-different calls (determinism); different content hashes differently; an empty string still hashes (distinct from "no content" — a real, deliberate edge case since `''` is falsy but not `undefined`); the ledger `appendEntry` call's `artifactHash` matches `verdict.artifactHash` when content is present, and is `undefined` when it is not.
- `src/test/sentinel/VerdictArbiter.artifact-hash.test.ts` (new, 5 cases, following the existing real-dependency pattern in `VerdictArbiter.malformed-payload.test.ts` — a real `VerdictArbiter`/`VerdictEngine`/`HeuristicEngine`/`ExistenceEngine`/`PolicyEngine` stack, only the vscode-dependent `ConfigManager` and leaf I/O (trust/ledger) faked) — a real temp file's content produces the correct end-to-end ledger `artifactHash`; a `FILE_DELETED` event on that same file produces `undefined`; a nonexistent file path (`read_error`) produces `undefined`; an `AGENT_CLAIM` event produces `undefined`; a malformed payload (missing `path`) produces `undefined`.

## CI Commands

- `tsc -p . --noEmit`
- `eslint src --ext ts`
- `mocha --ui tdd` against the compiled suites named above (this session's sandbox has no `vscode-test` extension host; exact-head CI's `npm test` job is the authoritative full-suite gate)
- `node scripts/check-test-runner-coverage.cjs`
