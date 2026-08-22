# Plan: collapse WorkspaceArtifactBuilder's redundant META_LEDGER reads (#233 retargeted slice)

**FX ID COLLISION (2026-08-21, post-park)**: PR #413 landed FX929 for the enforce-default upgrade-notice fix (#412). This plan reserved FX929/FX930 while it was in flight. If resumed, renumber to the next free ids and re-verify against docs/FEATURE_INDEX.md before audit -- the id-free check in ledger #594 is stale.

**iteration**: 3 (iter 1 VETOed — ledger #592, V1 evidence-format + V2 versionStatus drop; iter 2 VETOed — ledger #593, V3 half-honored option type + V4 unreachable test states)

**change_class**: feature

**doc_tier**: standard

**terms_introduced**:
- term: MetaLedgerRead
  home: FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts
- term: applyVersionFloor
  home: FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts

**boundaries**:
- limitations:
  - Reduces reads per `WorkspaceArtifactBuilder.build()` from 5 to **3**, not to 1. `MetaLedgerReader` and `SystemStateReader` each keep their own read; both are blocked on decisions recorded in ledger #591 and are explicitly out of scope here.
  - `HubSnapshotService.buildHubSnapshot` still constructs a fresh builder per call. This slice removes redundant reads *within* one build; it does not add cross-call caching.
- non_goals:
  - No caching, memoization, or mtime-keyed state. Rejected at plan time: it complects state with time on the `CommitCheckRoute` enforce path.
  - No parser unification. `GovernancePhaseTracker.parseMetaLedger` stays.
  - No change to any artifact's classification semantics — including the B197 version-floor verdict, which iteration 1 dropped (V2) and this iteration preserves explicitly.
- exclusions:
  - `src/roadmap/ConsoleServerHub.ts:79` — bounded 4 KB tail read, measured 0.4 ms vs 24.0 ms. Must stay bounded (#591 F3). Also touches the ledger in the same hub snapshot via `HubSnapshotService.ts:180`, so this slice does not make the snapshot literally single-read.
  - `GovernancePhaseTracker.ts`, `ConsoleLifecycleService.ts:98` — not consumers (#591 F1/F2).
  - `MetaLedgerReader.ts`, `SystemStateReader.ts` — #591 F4/F5.

## Open Questions

None. Both iteration-1 VETO findings are resolved below; the decision V2 forced is made explicitly in Phase 3, grounded in an existing in-code statement of intent.

## Resolution of iteration-1 VETO findings

**V1 (self-application — 0 citations truth-checked).** All Locked-Decision evidence is rewritten in the canonical single-span form `git show HEAD:<path> | grep -nE '<pattern>' -> NN:<observed text>` per `plan_evidence.py`'s `_EVIDENCE_STMT_RE`. Acceptance is no longer "the lint exits 0" but "the lint reports a truth-checked count equal to the number of Locked Decisions" — the failure mode was a matcher that recognized nothing and exited success.

**V2 (`versionStatus` dropped from the shared envelope).** Iteration 1 injected an opts-free envelope into `buildConsumerDiagnostics`, which today classifies `META_LEDGER` *with* `versionStatus`, degrading a below-floor install's diagnostics row from `unsupported` + real `qorVersion` to `ok` + `null`.

The decision this forced — whether `ledgerReadable` gating may change — is answered by intent already recorded in the file being modified.

#### Citation Inventory

LD0 — the existing B197 contract states that below-floor installs keep rendering the ledger.

> `git show HEAD:FailSafe/extension/src/roadmap/services/WorkspaceArtifactBuilder.ts | grep -nE 'below-floor installs keep today' -> 78:    // below-floor installs keep today's hub behavior (B197 warning UX).`

#### Consequence

Ledger rendering must **not** be suppressed on a below-floor install; the floor is surfaced in diagnostics instead. So the two consumers legitimately need differently-classified envelopes:

| consumer | envelope | why |
|---|---|---|
| `ledgerReadable` gating | classified **without** `versionStatus` | preserves the B197 render intent above |
| `qorConsumer` diagnostics | classified **with** `versionStatus` | preserves the `unsupported` row + real `qorVersion` |

Naively that is two classifications, i.e. two parses — which would give back most of what this slice buys. Instead the second is *derived* from the first by an exported overlay, `applyVersionFloor`, so the file is read once and parsed once. The overlay reuses the existing `unsupportedReason` predicate rather than restating the floor rule, and Phase 1's equivalence test pins the derivation against the real `classifyRead` path so the two cannot drift.

## Resolution of iteration-2 VETO findings

**V3 (`applyVersionFloor` honored half the type it accepted).** The helper took `ConsumerReadOptions` but consumed only `versionStatus`, so a caller passing `maxAgeMs` would get `ok` where `classifyRead` (line 127) gives `stale`. Fixed by **narrowing the parameter to `versionStatus?: QorLogicVersionStatus`** rather than by adding a stale rung: the overlay exists to reproduce the *floor* short-circuit against an already-classified envelope, and staleness is a property of the read that a derivation cannot honestly recompute. The narrowed type makes the wrong call a compile error instead of a documented hazard, and Phase 1 adds a `@ts-expect-error` pin so widening it back fails the build. `QorLogicVersionStatus` is already imported at `consumer-adapter.ts:19`. FX930's descriptor is restated to the narrowed claim.

**V4 (equivalence test could not reach two of the five states it claimed).** The fixture test called `readMetaLedgerArtifact(root)` with no options while claiming `ok`/`malformed`/`stale`/`unsupported`/absent coverage; the existing suite proves `unsupported` needs `{versionStatus}` and `stale` needs `{maxAgeMs}` plus an mtime rewind. Fixed by driving each state with the options that actually reach it. The read-count test now also names its fixtures and asserts both branches (`supported` 5→3, `malformed` 4→2).

## Measured baseline (ledger #591, this repo, 1,751,562-byte ledger)

| Operation | Cost |
|---|---|
| `fs.readFileSync` (I/O only) | 7.7 ms |
| `parseMetaLedgerEntries` | 13.9 ms |
| `parseMetaLedger` (GovernancePhaseTracker) | 5.5 ms |
| `WorkspaceArtifactBuilder.build()` today | 5 reads, 8,715,735 bytes, 477 ms cold / ~120 ms warm |

The 1,751,562-byte figure and the 8,715,735-byte total were taken at different instants (this session appended ledger entries between them); 8,715,735 / 5 = 1,743,147 exactly, which independently corroborates five whole-file reads. Timings are author-measured and were explicitly **not** independently verified by the iteration-2 reviewer, which had no execution tool.

After this slice: **3 reads, 1 `parseMetaLedgerEntries`** (was 2). Removed: read #2 I/O (7.7) + read #5 I/O (7.7) + read #5 parse (13.9) = **~29 ms warm**, on the path `CommitCheckRoute:33` blocks commits behind.

---

## Phase 1: One raw read, one ladder, one floor rule

Make the shared read *the* read: `readMetaLedgerArtifact` is redefined in terms of the new seam, so equivalence with the current path is structural rather than asserted.

### Unit Tests (written first)

- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — `readMetaLedgerRaw` returns `{text: <contents>, mtimeIso: <iso>}` for a present ledger, `{text: null, mtimeIso: null}` with no `readError` for an absent one, and `{text: null, mtimeIso: <iso>, readError: <msg>}` for a present-but-unreadable one (directory planted at the ledger path). Confirms absent and unreadable stay discriminated — the conflation a naive catch-to-null seam introduces.
- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — for each of the six `src/test/fixtures/qor-consumer/*` workspaces, `readMetaLedgerArtifact(root, opts)` returns an envelope whose `state`, `reason`, `provenance`, and `data` length equal those of the pre-change implementation, **with each state driven by the options that actually reach it**: `unsupported` via `{versionStatus: BELOW_FLOOR}` (mirroring the existing case at `consumer-adapter.test.ts:109`), `stale` via `{maxAgeMs: 1}` plus an `fs.utimesSync` mtime rewind (mirroring `:118-121`), and `ok`/`malformed`/absent with no options. Confirms the redefinition is behavior-preserving across all five states — a bare no-options call reaches only three of them and would classify the `stale` and `unsupported-version` fixtures as `ok` while passing.
- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — `applyVersionFloor(classifyMetaLedgerText(read, path), versionStatus)` deep-equals `classifyMetaLedgerText(read, path, {versionStatus})` across `versionStatus` ∈ {below-floor, meets-floor, undefined} × read ∈ {ok, malformed, absent}. Confirms the overlay reproduces the real ladder for the options it accepts.
- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — `applyVersionFloor` does not accept `maxAgeMs`. The pin is `// @ts-expect-error` immediately above a bare `applyVersionFloor(env, { maxAgeMs: 1 })` — **no cast**. `QorLogicVersionStatus` is `{installed, minimum, meetsFloor}`, all required (`qorLogicInstallRecord.ts:38-42`), so the literal errors on both missing members and the excess property, and the directive consumes that error. Widening the parameter back to `ConsumerReadOptions` removes the error, which makes the directive unused — itself a compile error — so the pin fails the build in exactly the direction it is meant to guard. (A `as never` cast would defeat this: `never` is assignable to every type, so the call would type-check, the directive would be unused, and the build would fail immediately while proving nothing.) Paired assertion: `classifyMetaLedgerText(read, path, {maxAgeMs: 1})` on a rewound mtime returns `stale`, proving the state the overlay cannot express is still reachable through the full ladder.
- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — with a below-floor `versionStatus`, `applyVersionFloor` returns `state: 'unsupported'`, `data: null`, and `provenance.qorVersion` equal to the installed version; with a meets-floor `versionStatus` over an `ok` read it returns `state: 'ok'` and the same non-null `qorVersion`. Confirms the overlay carries the floor verdict and the provenance, not just one of them.

### Affected Files

- `src/qorlogic/consumer/consumer-adapter.ts` — export `MetaLedgerRead`, `readMetaLedgerRaw(root)`, `applyVersionFloor(env, opts)`; redefine `readMetaLedgerArtifact` in terms of them.

### Changes

#### Locked Decisions

LD1 — `fsRead` already implements the absent-vs-unreadable contract; the new export reuses it rather than reimplementing.

> `git show HEAD:FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts | grep -nE '^function fsRead' -> 140:function fsRead(sourcePath: string): RawArtifactRead {`

LD2 — `classifyMetaLedgerText` already accepts a caller-supplied read and runs the shared ladder.

> `git show HEAD:FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts | grep -nE '^export function classifyMetaLedgerText' -> 184:export function classifyMetaLedgerText(`

LD3 — `unsupportedReason` is the single existing predicate for the B197 floor; the overlay reuses it instead of restating the rule.

> `git show HEAD:FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts | grep -nE '^function unsupportedReason' -> 57:function unsupportedReason(opts?: ConsumerReadOptions): string | null {`

#### Implementation

```ts
export interface MetaLedgerRead {
  read: RawArtifactRead;
  sourcePath: string;
}

/** The single fs touch for docs/META_LEDGER.md. Callers needing both raw text and a
 *  classified envelope read ONCE through this and pass the result to both consumers. */
export function readMetaLedgerRaw(root: string): MetaLedgerRead {
  const sourcePath = path.join(root, 'docs', 'META_LEDGER.md');
  return { read: fsRead(sourcePath), sourcePath };
}

/** Overlay the B197 version-floor verdict onto an envelope classified WITHOUT options,
 *  reproducing `classifyRead`'s floor precedence (the floor short-circuits ahead of content
 *  state). Lets one read+parse serve both a floor-blind consumer and a floor-aware one.
 *
 *  Accepts ONLY `versionStatus`, deliberately NOT `ConsumerReadOptions`. `classifyRead` also
 *  branches on `maxAgeMs` (:127) to yield `stale`, and this overlay has no stale rung — a
 *  caller passing `maxAgeMs` would silently get `ok` where the real ladder gives `stale`.
 *  The narrowed parameter makes that call unrepresentable rather than merely undocumented.
 *  A consumer needing staleness must classify through `classifyMetaLedgerText` with full
 *  options instead of deriving. */
export function applyVersionFloor<T>(
  env: ArtifactEnvelope<T>,
  versionStatus?: QorLogicVersionStatus,
): ArtifactEnvelope<T> {
  const provenance = { ...env.provenance, qorVersion: versionStatus?.installed ?? null };
  const reason = unsupportedReason({ versionStatus });
  if (reason) return { artifact: env.artifact, state: 'unsupported', data: null, provenance, reason };
  return { ...env, provenance };
}

export function readMetaLedgerArtifact(
  root: string,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<MetaLedgerEntry[]> {
  const { read, sourcePath } = readMetaLedgerRaw(root);
  return classifyMetaLedgerText(read, sourcePath, opts);
}
```

`classifyFile` is untouched; the other three artifact readers keep using it.

---

## Phase 2: Diagnostics accepts a pre-read envelope

### Unit Tests (written first)

- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — for the `supported` and `malformed` fixtures, the `META_LEDGER` summary from `buildConsumerDiagnostics(root, {ledger: env})` has `state`/`reason`/`provenance` equal to those from `buildConsumerDiagnostics(root)`. Confirms injection changes cost, not output.
- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — supplying a `ledger` envelope whose `reason` is a sentinel string absent from the fixture yields that exact `reason` in the output. Confirms the injected value is used verbatim rather than silently re-read.
- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — with a below-floor `versionStatus` and a `ledger` envelope produced by `applyVersionFloor`, the `META_LEDGER` row reports `state: 'unsupported'` with non-null `provenance.qorVersion`, and `compatible` is `false`. This is the V2 regression pin: it fails against iteration 1's opts-free injection.
- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — counting `fs.readFileSync` calls, `buildConsumerDiagnostics(root, {ledger: env})` performs **zero** reads of `META_LEDGER.md` while the no-`ledger` call performs exactly one. Confirms the redundant read is eliminated, not merely bypassed in principle.

### Affected Files

- `src/qorlogic/consumer/diagnostics.ts` — `ConsumerDiagnosticsOptions` gains `ledger?`; `buildConsumerDiagnostics` prefers it; add `type MetaLedgerEntry` to the existing `./consumer-adapter` import (diagnostics.ts line 10-17 does not import it today, so the snippet below does not compile without this).

### Changes

#### Locked Decisions

LD4 — the duplicate read lives at `diagnostics.ts` line 40 and today receives `opts`, which is why V2 mattered.

> `git show HEAD:FailSafe/extension/src/qorlogic/consumer/diagnostics.ts | grep -nE 'readMetaLedgerArtifact\(root, opts\),' -> 40:    readMetaLedgerArtifact(root, opts),`

LD5 — the options interface already extends `ConsumerReadOptions`, so the new field rides an existing extension point.

> `git show HEAD:FailSafe/extension/src/qorlogic/consumer/diagnostics.ts | grep -nE 'export interface ConsumerDiagnosticsOptions' -> 19:export interface ConsumerDiagnosticsOptions extends ConsumerReadOptions {`

#### Implementation

```ts
export interface ConsumerDiagnosticsOptions extends ConsumerReadOptions {
  auditSessionId?: string;
  /** Pre-classified META_LEDGER envelope from the caller's own single read. When supplied,
   *  diagnostics does NOT re-read the ledger. MUST already carry this call's version-floor
   *  verdict (see applyVersionFloor) — an envelope classified without `versionStatus` would
   *  under-report a below-floor install as `ok`. */
  ledger?: ArtifactEnvelope<MetaLedgerEntry[]>;
}

const artifacts = [
  opts?.ledger ?? readMetaLedgerArtifact(root, opts),
  readFeatureIndexArtifact(root, opts),
  readTrackerManifestArtifact(root, opts),
  readAuditGateArtifact(root, opts?.auditSessionId, opts),
].map(summarize);
```

---

## Phase 3: Builder reads once and shares two views

### Unit Tests (written first)

- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — counting `fs.readFileSync` over the **`supported`** fixture, `build()` reads `META_LEDGER.md` exactly **3** times (down from 5), the residual two attributable to `MetaLedgerReader` and `SystemStateReader`; and over the **`malformed`** fixture exactly **2** (down from 4), because `MetaLedgerReader` is skipped when `ledgerReadable` is false. Confirms the reduction empirically on both branches and pins the out-of-scope pair.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — on the `supported` fixture, every field of the returned snapshot (`ledgerSummary`, `ledgerVerdicts`, `ledgerCompletions`, `shieldPhase`, `latestVerdict`, `qorConsumer`) deep-equals the pre-change output captured from the same fixture. Confirms zero behavior change.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — with a **below-floor** `versionStatus`, `ledgerSummary` still reports the real entry counts (rendering NOT suppressed) while `qorConsumer`'s `META_LEDGER` row reports `unsupported` and `compatible` is `false`. Confirms both halves of the B197 contract at line 78 simultaneously — the exact pair iteration 1 broke.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — on the `malformed` fixture, `ledgerSummary` is the empty summary AND `qorConsumer` reports `META_LEDGER` `malformed` with `compatible === false`. Confirms fail-visible gating still holds when the envelope is shared.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — with no `docs/META_LEDGER.md`, `shieldPhase` is `"IDLE"` and `latestVerdict` is `undefined`. Confirms `readGovernanceState`'s absent-file posture survives losing its own `existsSync`.

### Affected Files

- `src/roadmap/services/WorkspaceArtifactBuilder.ts` — single raw read in `build()`; two envelope views; `readGovernanceState` takes text.

### Changes

#### Locked Decisions

LD6 — the builder's current adapter call is the read to keep, and it becomes the shared one. It is opts-free today, which is what preserves ledger rendering on below-floor installs.

> `git show HEAD:FailSafe/extension/src/roadmap/services/WorkspaceArtifactBuilder.ts | grep -nE 'const ledgerEnvelope = readMetaLedgerArtifact' -> 79:    const ledgerEnvelope = readMetaLedgerArtifact(this.workspaceRoot);`

LD7 — `readGovernanceState` is the unlisted raw consumer (#591 F6, read #2) and is absorbed here.

> `git show HEAD:FailSafe/extension/src/roadmap/services/WorkspaceArtifactBuilder.ts | grep -nE 'private readGovernanceState' -> 103:  private readGovernanceState(): { shieldPhase: ShieldPhase; latestVerdict: string | undefined } {`

LD8 — the only production caller is `HubSnapshotService` line 191, and it supplies `versionStatus`, so the floor overlay is live in production rather than test-only.

> `git show HEAD:FailSafe/extension/src/roadmap/services/HubSnapshotService.ts | grep -nE 'const artifacts = new WorkspaceArtifactBuilder' -> 191:    const artifacts = new WorkspaceArtifactBuilder(d.workspaceRoot, qorLogicVersionStatus).build();`

#### Implementation

```ts
build(): WorkspaceArtifactSnapshot {
  const rawLedger = readMetaLedgerRaw(this.workspaceRoot);
  // Floor-BLIND view: gates ledger rendering. Opts-free by design — see line 78's B197
  // contract, below-floor installs keep rendering the ledger.
  const ledgerEnvelope = classifyMetaLedgerText(rawLedger.read, rawLedger.sourcePath);
  const ledgerReadable = ledgerEnvelope.state === "ok" || ledgerEnvelope.state === "stale";
  // Floor-AWARE view: derived, not re-read and not re-parsed.
  const ledgerForDiagnostics = applyVersionFloor(ledgerEnvelope, this.qorLogicVersionStatus);
  const ledger = new MetaLedgerReader(this.workspaceRoot);
  const { shieldPhase, latestVerdict } = this.readGovernanceState(rawLedger.read.text);
  // ... unchanged ...
  qorConsumer: buildConsumerDiagnostics(this.workspaceRoot, {
    versionStatus: this.qorLogicVersionStatus,
    ledger: ledgerForDiagnostics,
  }),
}

/** Takes the text from build()'s single read; null (absent or unreadable) -> IDLE, matching
 *  the prior existsSync + catch posture. */
private readGovernanceState(text: string | null): { shieldPhase: ShieldPhase; latestVerdict: string | undefined } {
  if (text === null) return { shieldPhase: "IDLE", latestVerdict: undefined };
  try {
    const entries = parseMetaLedger(text);
    return { shieldPhase: getCurrentPhase(entries), latestVerdict: entries[0]?.verdict };
  } catch {
    return { shieldPhase: "IDLE", latestVerdict: undefined };
  }
}
```

`fs` and `path` imports in `WorkspaceArtifactBuilder.ts` are dropped if no other use remains.

---

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX929 | NEW | `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` | `build()` reads `docs/META_LEDGER.md` exactly 3 times (was 5) while every snapshot field deep-equals the pre-change output on the `supported` fixture |
| FX930 | NEW | `src/test/qorlogic/consumer/consumer-adapter.test.ts` | `applyVersionFloor(env, versionStatus)` deep-equals `classifyMetaLedgerText(read, path, {versionStatus})` across {below-floor, meets-floor, undefined} x {ok, malformed, absent}; the narrowed parameter makes a `maxAgeMs` call a compile error, and `stale` stays reachable through the full ladder |
| FX893 | MODIFIED | `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` | with a below-floor `versionStatus`, the injected-`ledger` path still reports `META_LEDGER` `unsupported` + non-null `qorVersion` and `compatible === false` |
| FX892 | MODIFIED | `src/test/qorlogic/consumer/consumer-adapter.test.ts` | `readMetaLedgerArtifact` routed through `readMetaLedgerRaw` yields envelopes equal to the prior path across all six `qor-consumer` fixtures |

## Definition of Done

### Deliverable: single-read ledger consumption in `WorkspaceArtifactBuilder`

- **D1**: One `WorkspaceArtifactBuilder.build()` reads `docs/META_LEDGER.md` 3 times instead of 5, collapsing the three seams it owns (the adapter gate, `readGovernanceState`'s raw read, and diagnostics' second adapter call) into one read and one `parseMetaLedgerEntries`, with no change to any reported state.
- **D2**: `readMetaLedgerRaw(root: string): MetaLedgerRead` and `applyVersionFloor<T>(env, opts)` exported from `src/qorlogic/consumer/consumer-adapter.ts`; `readMetaLedgerArtifact` defined in terms of them; `ConsumerDiagnosticsOptions.ledger?: ArtifactEnvelope<MetaLedgerEntry[]>`; `WorkspaceArtifactBuilder.readGovernanceState(text: string | null)`.
- **D3**: Ledger entry citing brief `docs/research-brief-233-residual-ledger-consumers-2026-08-21.md` (#591) and the iteration-1 VETO (#592); FEATURE_INDEX FX929 + FX930 added with header counts reconciled (the #408 `header==reality` gate); FX892/FX893 rows updated.
- **D4**: `WorkspaceArtifactBuilder.test.ts` read-count test observes exactly 3 reads where the pre-change tree observes 5, and the deep-equal snapshot test passes on the `supported` fixture.

### Deliverable: B197 version-floor semantics preserved on both consumers

- **D1**: A below-floor install keeps rendering the ledger (line 78's contract) *and* keeps reporting `META_LEDGER` as `unsupported` in `qorConsumer` — the pair iteration 1 broke.
- **D2**: `applyVersionFloor` reuses `unsupportedReason`; `build()` derives the diagnostics envelope from the gating envelope with no second read and no second parse.
- **D3**: The V2 finding and its resolution are recorded in the seal entry, not silently patched.
- **D4**: The Phase 1 equivalence-matrix test and the Phase 3 below-floor test both pass; the Phase 3 test fails against iteration 1's opts-free injection.

### Deliverable: absent-vs-unreadable fidelity preserved

- **D1**: Sharing one read must not collapse "no ledger" into "unreadable ledger".
- **D2**: `readMetaLedgerRaw` wraps `fsRead`'s result unmodified as `{read, sourcePath}` — the `read` field is `fsRead`'s return value, passed through without alteration.
- **D3**: Recorded in this plan's boundaries.
- **D4**: `consumer-adapter.test.ts` asserts `{text: null, mtimeIso: null}` for absent and `{text: null, mtimeIso: <iso>, readError: <msg>}` for a directory planted at the ledger path.

## CI Commands

- `npx tsc -p ./ --noEmit` — type-checks the new exports and the changed signatures.
- `npm run compile` — required before any `.cjs` suite, which load compiled `out/` artifacts.
- `npm run lint` — repo lint gate.
- `npm run test:runner-coverage` — every test file is claimed by a runner (#404 gate).
- `npm test` — vscode-test suites, including `WorkspaceArtifactBuilder.test.ts` and the consumer suites.
- `npm run test:node` — the `node --test` `.cjs` suites.
- `node --test src/test/scripts/featureIndexClassifier.test.cjs` — `FEATURE_INDEX` header==reality after the FX929/FX930 rows.
