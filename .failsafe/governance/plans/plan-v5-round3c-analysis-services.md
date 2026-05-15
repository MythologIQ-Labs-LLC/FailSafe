# Plan: v5.0.0 Round 3c — Analysis & Service Refactors

**Issues closed:** #57 (Genome pattern analysis), #59 (Compliance provenance), #60 (Brainstorm snapshot)
**Tracker:** #63
**Plan author:** /qor-plan, 2026-04-27
**Status:** implementation-ready

## Open Questions

1. **Genome eligible-event taxonomy** — issue #57 lists `agent-run-failure | tool-error | governance-veto | rollback | repeated-edit-failure | test-failure`. Confirm this is the v5.0.0 set; expansions in v5.0.1+.
2. **Genome analysis debounce window** — #57 suggests 1000 ms. Confirm.
3. **Compliance "unavailable" copy** — when `status: 'unavailable'`, what text appears? Default: `"Source not initialized: <reason>"`.
4. **Brainstorm refresh broadcast** — issue #60 wants `hub.refresh` after Prep Bay creates nodes. Default: yes; broadcast `{ type: 'hub.refresh', reason: 'brainstorm-updated' }`.

## Affected Surfaces

```text
NEW src/qorelogic/shadow/GenomeEventClassifier.ts
NEW src/governance/ComplianceSnapshotBuilder.ts
NEW src/test/qorelogic/genome-event-pipeline.test.ts
NEW src/test/governance/compliance-snapshot.test.ts
NEW src/test/roadmap/brainstorm-snapshot.test.ts

MOD src/qorelogic/shadow/ShadowGenomeManager.ts          # debounced analyzeAllPatterns; signal recording
MOD src/roadmap/services/BrainstormService.ts            # canonical getSnapshot()
MOD src/roadmap/ConsoleServer.ts                         # 3 new hub fields: genomePatterns, complianceSnapshot, brainstorm
MOD src/roadmap/ui/modules/genome.js                     # read hubData.genomePatterns
MOD src/roadmap/ui/modules/compliance.js (or current name) # render ProvenancedMetric states
MOD src/roadmap/ui/modules/brainstorm-graph.js (or mindmap.js) # read hubData.brainstorm
MOD src/extension/commands.ts                            # FailSafe: Analyze Shadow Genome Now
MOD package.json                                         # new diagnostic command
```

---

## Phase 1 — Genome event pipeline (#57)

**Goal:** failure events recorded by sentinel/agent-run/governance trigger debounced `analyzeAllPatterns()`. Resulting patterns persist and surface on the Genome subview. Empty state appears only when no eligible events have been captured.

### Unit Tests (write first)

- `src/test/qorelogic/genome-event-pipeline.test.ts` (new)
  - `GenomeEventClassifier.classify(event)` returns one of `agent-run-failure | tool-error | governance-veto | rollback | repeated-edit-failure | test-failure | null` based on event shape.
  - `ShadowGenomeManager.recordSignal(event)` adds to the signal store; `scheduleAnalysis()` debounces to 1000 ms.
  - After debounce, `analyzeAllPatterns()` runs once and persists patterns.
  - Hub snapshot includes `genomePatterns` and `unresolvedGenomePatterns` shaped as the canonical `GenomePatternSummary[]`.
  - With zero captured signals: both arrays empty; UI shows "No failure patterns captured yet."

### Changes

`src/qorelogic/shadow/GenomeEventClassifier.ts` (new):

```ts
export type GenomeSignalSource =
  | 'agent-run-failure' | 'tool-error' | 'governance-veto'
  | 'rollback' | 'repeated-edit-failure' | 'test-failure';

export function classify(event: Record<string, unknown>): GenomeSignalSource | null;
```

`src/qorelogic/shadow/ShadowGenomeManager.ts`:

```ts
recordSignal(event): void {
  const signalSource = classify(event);
  if (!signalSource) return;
  this.appendSignal({ ...event, signalSource });
  this.scheduleAnalysis();
}

scheduleAnalysis(): void {
  clearTimeout(this.pendingAnalysis);
  this.pendingAnalysis = setTimeout(() => {
    this.analyzeAllPatterns().catch((err) => console.warn('[ShadowGenome] analysis failed', err));
  }, 1000);
}
```

`src/roadmap/ConsoleServer.ts`:

```ts
genomePatterns: this.shadowGenome.getAllPatterns(),
unresolvedGenomePatterns: this.shadowGenome.getUnresolvedPatterns(),
```

`src/roadmap/ui/modules/genome.js` — read both fields; render with severity badges; empty state distinguishes "no signals captured" from "all patterns resolved".

`src/extension/commands.ts` — register diagnostic command:

```ts
context.subscriptions.push(
  vscode.commands.registerCommand('failsafe.analyzeShadowGenomeNow', async () => {
    await shadowGenomeManager.analyzeAllPatterns();
    consoleServer.broadcast({ type: 'hub.refresh', reason: 'genome-analysis-complete' });
  }),
);
```

`package.json` adds:

```json
{ "command": "failsafe.analyzeShadowGenomeNow", "title": "FailSafe: Analyze Shadow Genome Now" }
```

### CI / validation

Manual: simulate a captured failure event (or run the diagnostic command on existing data) → Genome subview shows the pattern.

---

## Phase 2 — Compliance provenance (#59)

**Goal:** every Compliance metric carries `{ value, status, source, lastUpdated, reason }`. UI renders three distinct states (available / empty / unavailable) per metric. No hardcoded defaults masquerading as governance telemetry.

### Unit Tests (write first)

- `src/test/governance/compliance-snapshot.test.ts` (new)
  - Builder with all sources empty: returns metrics with `status: 'empty'` (where source exists) or `'unavailable'` (where source missing).
  - Builder with META_LEDGER having PASS/VETO entries: `recentVerdicts.status === 'available'`, `value` populated, `source: 'meta-ledger'`.
  - Builder with risks register present: `highRiskCount.value === N`, `source: 'risk-register'`.
  - Builder with `l3Queue` empty + queue manager initialized: `status: 'empty'`, `source: 'soa-ledger'`.
  - Builder with no `qorelogicManager`: `l3QueueCount.status === 'unavailable'`.

### Changes

`src/governance/ComplianceSnapshotBuilder.ts` (new):

```ts
export interface ProvenancedMetric<T> {
  value: T | null;
  status: 'available' | 'empty' | 'unavailable';
  source: 'soa-ledger' | 'meta-ledger' | 'transparency-log' | 'checkpoint-store' | 'risk-register' | 'none';
  lastUpdated?: string;
  reason?: string;
}

export interface ComplianceSnapshot {
  highRiskCount: ProvenancedMetric<number>;
  l3QueueCount: ProvenancedMetric<number>;
  recentVerdicts: ProvenancedMetric<GovernanceVerdict[]>;
  auditLogEntries: AuditLogEntry[];   // shares Round 3b shape
}

export class ComplianceSnapshotBuilder {
  constructor(
    private readonly metaLedger: MetaLedgerReader,
    private readonly transparency: TransparencyLogger,
    private readonly riskRegister: RiskRegisterManager,
    private readonly qorelogicManager: QoreLogicManager | null,
  ) {}
  build(): ComplianceSnapshot;
}
```

`src/roadmap/ConsoleServer.ts`:

```ts
complianceSnapshot: this.complianceSnapshotBuilder.build(),
```

`src/roadmap/ui/modules/compliance.js` — render each ProvenancedMetric:
- `available`: `<value>` + small source label
- `empty`: "No events recorded yet" + source label
- `unavailable`: dimmed; reason text shown

### CI / validation

Manual on FailSafe repo workspace: Compliance shows `recentVerdicts` populated from META_LEDGER GATE TRIBUNAL entries. `highRiskCount` populated from BACKLOG fallback (per Round 3a). `l3QueueCount` shows `status: 'empty'` (queue exists, no items).

Manual on a fresh workspace: Compliance shows `unavailable` for fields whose source is missing; `empty` where source exists but no events.

---

## Phase 3 — Brainstorm snapshot service (#60)

**Goal:** the Mindmap subview reads a canonical `brainstorm` snapshot from the hub. New nodes via Prep Bay refresh without page reload. Empty state is explicit, not a blank canvas.

### Unit Tests (write first)

- `src/test/roadmap/brainstorm-snapshot.test.ts` (new)
  - `BrainstormService.getSnapshot()` on empty workspace returns `{ nodes: [], edges: [], sessions: [], source: 'empty' }`.
  - With on-disk persisted graph: returns nodes/edges/sessions populated.
  - Adding a node via `BrainstormService.appendNode(node)` updates the snapshot; subsequent `getSnapshot()` includes it.
  - Hub snapshot exposes `brainstorm: BrainstormSnapshot`.
  - `/api/v1/brainstorm/graph` returns the same data shape.

### Changes

`src/roadmap/services/BrainstormService.ts` — refactor to expose `getSnapshot(): Promise<BrainstormSnapshot>`. The existing endpoint backs onto this method.

```ts
export interface BrainstormSnapshot {
  nodes: Array<{ id: string; label: string; type?: string; x?: number; y?: number }>;
  edges: Array<{ source: string; target: string; label?: string }>;
  sessions: Array<{ id: string; createdAt: string; nodeCount: number; transcriptPreview?: string }>;
  source: 'brainstorm-service' | 'disk' | 'empty';
  lastUpdated?: string;
}
```

`src/roadmap/ConsoleServer.ts` — add `brainstorm: await this.brainstormService.getSnapshot()` to `buildHubSnapshot`. Broadcast `{ type: 'hub.refresh', reason: 'brainstorm-updated' }` after node creation routes complete.

`src/roadmap/ui/modules/brainstorm-graph.js` (or `mindmap.js`) — read `hubData.brainstorm.nodes/edges`; render explicit empty-state panel when both `nodes.length === 0 && sessions.length === 0`.

### CI / validation

Manual: capture a brainstorm transcript via Prep Bay → Mindmap shows resulting nodes within 2 seconds (no page reload).

---

## Aggregate verification

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Per-phase additions: +5, +5, +5 = **+15 new tests**.

CHANGELOG.md (root + extension) under v5.0.0 "Fixed":
- Genome pattern analysis triggers on captured failure events (was always-empty).
- Compliance subview metrics carry provenance and never render hardcoded defaults.
- Brainstorm Mindmap reflects Prep Bay sessions immediately (was disconnected).
