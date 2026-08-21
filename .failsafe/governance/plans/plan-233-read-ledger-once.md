# Plan: read the META_LEDGER once per hub snapshot (#233 retargeted slice)

**change_class**: feature

**doc_tier**: standard

**terms_introduced**:
- term: MetaLedgerRead
  home: FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts

**boundaries**:
- limitations:
  - Reduces reads per `WorkspaceArtifactBuilder.build()` from 5 to **3**, not to 1. `MetaLedgerReader` and `SystemStateReader` each keep their own read; both are blocked on decisions recorded in ledger #591 and are explicitly out of scope here.
  - `HubSnapshotService.buildHubSnapshot` still constructs a fresh builder per call. This slice removes redundant reads *within* one build; it does not add cross-call caching.
- non_goals:
  - No caching, memoization, or mtime-keyed state. Rejected at plan time: it complects state with time on the `CommitCheckRoute` enforce path.
  - No parser unification. `GovernancePhaseTracker.parseMetaLedger` stays. Retiring it changes `getCurrentPhase`/`getActiveAlerts` shape — the same taxonomy-risk class deferred for `MetaLedgerReader` in #591.
  - No change to any artifact's classification semantics.
- exclusions:
  - `ConsoleServerHub.ts:79` — bounded 4 KB tail read, measured 0.4 ms vs 24.0 ms. Must stay bounded (#591 F3).
  - `GovernancePhaseTracker.ts`, `ConsoleLifecycleService.ts:98` — not consumers (#591 F1/F2).
  - `MetaLedgerReader.ts`, `SystemStateReader.ts` — #591 F4/F5.

## Open Questions

None blocking. One resolved at plan time by operator selection: slice depth is "share text + envelope, keep both parsers" (zero behavior change) rather than parser unification or an adapter-level cache.

**Correction carried forward**: the option preview shown at selection time said "reads: 5 -> 2". The true post-change count is **3** — `MetaLedgerReader` and `SystemStateReader` retain their reads. Savings restated below from the same measurements.

## Measured baseline (ledger #591, this repo, 1,751,562-byte ledger)

| Operation | Cost |
|---|---|
| `fs.readFileSync` (I/O only) | 7.7 ms |
| `parseMetaLedgerEntries` | 13.9 ms |
| `parseMetaLedger` (GovernancePhaseTracker) | 5.5 ms |
| `WorkspaceArtifactBuilder.build()` today | 5 reads, 8,715,735 bytes, 477 ms cold / ~120 ms warm |

Removed by this slice: read #2 I/O (7.7) + read #5 I/O (7.7) + read #5 parse (13.9) = **~29 ms warm**, on the path `CommitCheckRoute:33` blocks commits behind.

---

## Phase 1: One raw read, one ladder

Make the shared read *the* read, so equivalence with the current path is structural rather than asserted. `readMetaLedgerArtifact` is redefined in terms of the new seam — there is no second code path that could drift from it.

### Unit Tests (written first)

- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — `readMetaLedgerRaw` returns `{text, mtimeIso}` for a present ledger; `{text: null, mtimeIso: null, readError: undefined}` for an absent one; and `{text: null, mtimeIso: <iso>, readError: <msg>}` for a present-but-unreadable one (EISDIR via a directory at the ledger path). Confirms absent and unreadable stay distinguishable — the exact conflation `classifyMetaLedgerText`'s doc comment warns a naive catch-to-null seam introduces.
- `src/test/qorlogic/consumer/consumer-adapter.test.ts` — for each of the six `src/test/fixtures/qor-consumer/*` workspaces, `readMetaLedgerArtifact(root)` and `classifyMetaLedgerText(readMetaLedgerRaw(root).read, …)` return envelopes with equal `state`, `reason`, `provenance`, and `data` length. Confirms the refactor is behavior-preserving across `ok`/`malformed`/`stale`/`unsupported`/absent.

### Affected Files

- `src/qorlogic/consumer/consumer-adapter.ts` — export `MetaLedgerRead` + `readMetaLedgerRaw(root)`; redefine `readMetaLedgerArtifact` to call it.

### Changes

Locked Decision LD1 — `fsRead` already implements the correct absent-vs-unreadable contract; the new export reuses it rather than reimplementing.

> `grep -nE '^function fsRead' src/qorlogic/consumer/consumer-adapter.ts` -> `140:function fsRead(sourcePath: string): RawArtifactRead {`

Locked Decision LD2 — `classifyMetaLedgerText` already accepts a caller-supplied read and runs the shared ladder.

> `grep -nE '^export function classifyMetaLedgerText' src/qorlogic/consumer/consumer-adapter.ts` -> `184:export function classifyMetaLedgerText(`

```ts
export interface MetaLedgerRead {
  read: RawArtifactRead;
  sourcePath: string;
}

/** The single fs touch for docs/META_LEDGER.md. Callers that need both the raw text and a
 *  classified envelope read ONCE through this and pass the result to both consumers. */
export function readMetaLedgerRaw(root: string): MetaLedgerRead {
  const sourcePath = path.join(root, 'docs', 'META_LEDGER.md');
  return { read: fsRead(sourcePath), sourcePath };
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

- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — `buildConsumerDiagnostics(root, {ledger: env})` produces a `META_LEDGER` summary whose `state`/`reason`/`provenance` equal those of `buildConsumerDiagnostics(root)` on the same fixture, for the `supported` and `malformed` fixtures. Confirms injection changes cost, not output.
- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — passing a `ledger` envelope whose state is `malformed` yields `compatible === false`, and the injected envelope is used verbatim (asserted by supplying an envelope whose `reason` is a sentinel string absent from the fixture, then finding that exact `reason` in the output). Confirms the injected value is honored rather than silently re-read.
- `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` — with `fs.readFileSync` counted, `buildConsumerDiagnostics(root, {ledger: env})` performs **zero** reads of `META_LEDGER.md`, while the no-`ledger` call performs exactly one. Confirms the redundant read is actually eliminated, not merely bypassed in principle.

### Affected Files

- `src/qorlogic/consumer/diagnostics.ts` — `ConsumerDiagnosticsOptions` gains `ledger?`; `buildConsumerDiagnostics` prefers it.

### Changes

Locked Decision LD3 — the duplicate read lives at `diagnostics.ts:40`.

> `grep -nE 'readMetaLedgerArtifact\(root, opts\)' src/qorlogic/consumer/diagnostics.ts` -> `40:    readMetaLedgerArtifact(root, opts),`

Locked Decision LD4 — the options interface already extends `ConsumerReadOptions`, so the new field rides an existing extension point.

> `grep -nE 'export interface ConsumerDiagnosticsOptions' src/qorlogic/consumer/diagnostics.ts` -> `19:export interface ConsumerDiagnosticsOptions extends ConsumerReadOptions {`

```ts
export interface ConsumerDiagnosticsOptions extends ConsumerReadOptions {
  auditSessionId?: string;
  /** Pre-classified META_LEDGER envelope from the caller's own single read. When supplied,
   *  diagnostics does NOT re-read the ledger. Must come from the same `classifyRead` ladder
   *  (i.e. `readMetaLedgerArtifact` / `classifyMetaLedgerText`) or the reported state lies. */
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

## Phase 3: Builder reads once and shares

### Unit Tests (written first)

- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — with `fs.readFileSync` counted over a fixture workspace, `build()` reads `META_LEDGER.md` exactly **3** times (down from 5), and the residual two are attributable to `MetaLedgerReader` and `SystemStateReader`. Confirms the reduction empirically and pins the out-of-scope pair so a future slice can see them.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — on the `supported` fixture, every field of the returned `WorkspaceArtifactSnapshot` (`ledgerSummary`, `ledgerVerdicts`, `ledgerCompletions`, `shieldPhase`, `latestVerdict`, `qorConsumer`) deep-equals the pre-change output captured from the same fixture. Confirms zero behavior change, which is this slice's whole claim.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — on the `malformed` fixture, `ledgerSummary` is the empty summary AND `qorConsumer` reports `META_LEDGER` as `malformed` with `compatible === false`. Confirms the fail-visible gating still holds when the envelope is shared rather than recomputed.
- `src/test/roadmap/WorkspaceArtifactBuilder.test.ts` — with no `docs/META_LEDGER.md` present, `shieldPhase` is `"IDLE"` and `latestVerdict` is `undefined`. Confirms `readGovernanceState`'s absent-file posture survives losing its own `existsSync`.

### Affected Files

- `src/roadmap/services/WorkspaceArtifactBuilder.ts` — single raw read in `build()`; `readGovernanceState` takes text; `buildConsumerDiagnostics` receives the envelope.

### Changes

Locked Decision LD5 — the builder's current adapter call is the read to keep, and it becomes the shared one.

> `grep -nE 'const ledgerEnvelope = readMetaLedgerArtifact' src/roadmap/services/WorkspaceArtifactBuilder.ts` -> `79:    const ledgerEnvelope = readMetaLedgerArtifact(this.workspaceRoot);`

Locked Decision LD6 — `readGovernanceState` is the unlisted raw consumer (#591 F6, read #2) and is absorbed here.

> `grep -nE 'private readGovernanceState' src/roadmap/services/WorkspaceArtifactBuilder.ts` -> `103:  private readGovernanceState(): { shieldPhase: ShieldPhase; latestVerdict: string | undefined } {`

Locked Decision LD7 — the only production caller is `HubSnapshotService:191`, so no other call site changes.

> `grep -nE 'const artifacts = new WorkspaceArtifactBuilder' src/roadmap/services/HubSnapshotService.ts` -> `191:    const artifacts = new WorkspaceArtifactBuilder(d.workspaceRoot, qorLogicVersionStatus).build();`

```ts
build(): WorkspaceArtifactSnapshot {
  const rawLedger = readMetaLedgerRaw(this.workspaceRoot);
  const ledgerEnvelope = classifyMetaLedgerText(rawLedger.read, rawLedger.sourcePath);
  const ledgerReadable = ledgerEnvelope.state === "ok" || ledgerEnvelope.state === "stale";
  const ledger = new MetaLedgerReader(this.workspaceRoot);
  const { shieldPhase, latestVerdict } = this.readGovernanceState(rawLedger.read.text);
  // ... unchanged ...
  qorConsumer: buildConsumerDiagnostics(this.workspaceRoot, {
    versionStatus: this.qorLogicVersionStatus,
    ledger: ledgerEnvelope,
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
| FX893 | MODIFIED | `src/test/qorlogic/consumer/consumer-diagnostics.test.ts` | `buildConsumerDiagnostics(root, {ledger})` performs zero ledger reads and reports the injected envelope's state verbatim |
| FX892 | MODIFIED | `src/test/qorlogic/consumer/consumer-adapter.test.ts` | `readMetaLedgerArtifact` routed through `readMetaLedgerRaw` yields envelopes equal to the prior path across all six `qor-consumer` fixtures |

## Definition of Done

### Deliverable: single-read ledger consumption in `WorkspaceArtifactBuilder`

- **D1**: One hub-snapshot build touches `docs/META_LEDGER.md` once through the adapter's own ladder, instead of three times through three seams, with no change to any reported state.
- **D2**: `readMetaLedgerRaw(root: string): MetaLedgerRead` exported from `src/qorlogic/consumer/consumer-adapter.ts`; `readMetaLedgerArtifact` defined in terms of it; `ConsumerDiagnosticsOptions.ledger?: ArtifactEnvelope<MetaLedgerEntry[]>`; `WorkspaceArtifactBuilder.readGovernanceState(text: string | null)`.
- **D3**: Ledger entry citing brief `docs/research-brief-233-residual-ledger-consumers-2026-08-21.md` and #591; FEATURE_INDEX FX929 added with header counts reconciled (the #408 `header==reality` gate); FX892/FX893 rows updated.
- **D4**: `WorkspaceArtifactBuilder.test.ts` read-count test observes exactly 3 reads where the pre-change tree observes 5, and the deep-equal snapshot test passes on the `supported` fixture.

### Deliverable: absent-vs-unreadable fidelity preserved

- **D1**: Sharing one read must not collapse "no ledger" into "unreadable ledger" — the distinction the adapter's ladder depends on.
- **D2**: `readMetaLedgerRaw` returns `fsRead`'s result unmodified.
- **D3**: The non-goal is recorded in this plan's boundaries.
- **D4**: `consumer-adapter.test.ts` asserts `{text: null, mtimeIso: null}` for absent and `{text: null, mtimeIso: <iso>, readError: <msg>}` for a directory planted at the ledger path.

## CI Commands

- `npx tsc -p ./ --noEmit` — type-checks the new export and the changed signatures.
- `npm run compile` — required before any `.cjs` suite, which load compiled `out/` artifacts.
- `npm run lint` — repo lint gate.
- `npm run test:runner-coverage` — every test file is claimed by a runner (#404 gate).
- `npm test` — vscode-test suites, including `WorkspaceArtifactBuilder.test.ts` and the consumer suites.
- `npm run test:node` — the `node --test` `.cjs` suites.
- `node --test src/test/scripts/featureIndexClassifier.test.cjs` — `FEATURE_INDEX` header==reality after the FX929 row.
