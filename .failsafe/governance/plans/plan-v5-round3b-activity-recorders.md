# Plan: v5.0.0 Round 3b — Activity Recorders (Timeline / Audit Log / Replay)

**Issues closed:** #55 (Timeline), #56 (Audit Log), #58 (Replay)
**Tracker:** #63
**Plan author:** /qor-plan, 2026-04-27
**Status:** implementation-ready

## Open Questions

1. **Persistence directory** — issue #55 suggests `.failsafe/logs/timeline.jsonl`; #58 suggests `.failsafe/runs/active/<id>.json`. Confirm both directories sit under `.failsafe/`. Default: yes.
2. **Idle window for run-close** — #58 suggests `RUN_IDLE_CLOSE_MS = 30_000`. Confirm.
3. **Agent attribution confidence** — when no editor signal proves who edited (Claude Code vs Copilot vs human), record as `agentId: 'unknown-ai-or-user'` with low confidence. UI should show that honestly.
4. **`/api/timeline`, `/api/replay` endpoints** — keep as separate endpoints OR fold into `/api/hub`? Default: keep separate; both must read from the same recorder store as the hub snapshot (no dual-source-of-truth).

## Affected Surfaces

```text
NEW src/sentinel/TimelineRecorder.ts                 # canonical timeline entry recorder
NEW src/governance/AuditLogAggregator.ts             # transparency + META_LEDGER → AuditLogEntry
NEW src/sentinel/AgentRunLifecycle.ts                # idle-window close, persistence
NEW src/test/sentinel/timeline-recorder.test.ts
NEW src/test/governance/audit-log-aggregator.test.ts
NEW src/test/sentinel/agent-run-lifecycle.test.ts

MOD src/roadmap/services/IdeActivityTracker.ts       # emit canonical events to TimelineRecorder
MOD src/sentinel/AgentRunRecorder.ts                 # adopt AgentRunLifecycle
MOD src/roadmap/ConsoleServer.ts                     # canonical hub fields: timelineEntries, auditLogEntries, activeRuns, completedRuns
MOD src/roadmap/ui/modules/timeline.js
MOD src/roadmap/ui/modules/transparency.js           # rename or repurpose for audit-log render
MOD src/roadmap/ui/modules/replay.js (or current Replay UI module)
```

---

## Phase 1 — Timeline event pipeline (#55)

**Goal:** every `onDidSaveTextDocument` produces a TimelineEntry visible in the Timeline subview within 1-2 seconds. Entries persist in `.failsafe/logs/timeline.jsonl` and survive view refreshes.

### Unit Tests (write first)

- `src/test/sentinel/timeline-recorder.test.ts` (new)
  - `TimelineRecorder.append(event)` writes a JSON line with the canonical `TimelineEntry` shape.
  - Multiple appends in rapid succession all persist (no debounce loss).
  - `getRecent(limit)` returns entries newest-first.
  - Reading a workspace with an existing JSONL hydrates state without rewrite.
- `src/test/sentinel/ide-activity-tracker.test.ts` (extend if exists, else new)
  - `trackSave(document)` emits one `ide.file.saved` event on the EventBus.
  - The TimelineRecorder bound to the EventBus appends one entry.

### Changes

`src/sentinel/TimelineRecorder.ts` (new):

```ts
export interface TimelineEntry {
  id: string;
  type: 'file-save' | 'file-change' | 'agent-run-started' | 'agent-run-completed' | 'checkpoint' | 'verdict';
  title: string;
  detail?: string;
  path?: string;
  agentId?: string;
  timestamp: string;
  source: 'ide-activity' | 'agent-run-recorder' | 'ledger' | 'checkpoint-store';
}

export class TimelineRecorder {
  constructor(private readonly workspaceRoot: string) {}
  append(event: TimelineEntry): void;
  getRecent(limit: number): TimelineEntry[];
}
```

`src/roadmap/services/IdeActivityTracker.ts` — wire `onDidSaveTextDocument` → `EventBus.emit('ide.file.saved', { path, timestamp })` → `TimelineRecorder.append(...)`.

`src/roadmap/ConsoleServer.ts` — add `timelineEntries: this.timelineRecorder.getRecent(50)` to `buildHubSnapshot`.

`src/roadmap/ui/modules/timeline.js` — read `hubData.timelineEntries`; render newest-first; honest empty state ("No IDE activity recorded yet" + "Monitoring is enabled" / "Monitoring is disabled" depending on sentinel state).

### CI / validation

```bash
cd FailSafe/extension
npm test
```

Manual: save a file in a workspace → Timeline entry appears within 2 seconds with timestamp + path.

---

## Phase 2 — Audit log aggregation (#56)

**Goal:** Compliance / Audit subview shows a unified audit trail merging `transparency.jsonl` and META_LEDGER GATE TRIBUNAL entries, newest-first.

### Unit Tests (write first)

- `src/test/governance/audit-log-aggregator.test.ts` (new)
  - With `transparency.jsonl` having 5 events: aggregator returns 5 `AuditLogEntry` records of `eventType: 'transparency'`.
  - With META_LEDGER having 3 GATE TRIBUNAL entries: aggregator includes 3 records of `eventType: 'gate-tribunal'`.
  - With both: entries merged sorted newest-first.
  - Empty workspace: returns `[]`.
  - Verdict normalization: `Gate Verdict: PASS` line → `verdict: 'PASS', level: 'L2'` based on adjacent `Risk Grade` line.

### Changes

`src/governance/AuditLogAggregator.ts` (new):

```ts
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: 'transparency' | 'gate-tribunal' | 'verdict' | 'override' | 'release' | 'checkpoint';
  title: string;
  verdict?: 'PASS' | 'VETO' | 'WARN' | 'ALLOW' | 'BLOCK' | 'ESCALATE';
  level?: 'L1' | 'L2' | 'L3';
  source: 'transparency-log' | 'meta-ledger' | 'soa-ledger' | 'checkpoint-store';
  detail?: string;
}

export class AuditLogAggregator {
  constructor(
    private readonly transparency: TransparencyLogger,
    private readonly metaLedger: MetaLedgerReader,
  ) {}
  aggregate(limit?: number): AuditLogEntry[];
}
```

`src/roadmap/ConsoleServer.ts` — add `auditLogEntries: this.auditLogAggregator.aggregate(50)` to `buildHubSnapshot`.

`src/roadmap/ui/modules/transparency.js` (or rename to `audit-log.js`) — read `hubData.auditLogEntries`; render with verdict badge + source label per entry; empty state: "No audit events recorded yet."

### CI / validation

Manual on FailSafe repo workspace: Audit log shows historical META_LEDGER GATE TRIBUNAL entries (~120 records). After running a `/qor-audit`, new transparency events show at the top.

---

## Phase 3 — Replay run lifecycle (#58)

**Goal:** rapid file-save sequences produce an active run; idle-window timeout closes the run; both active and completed runs persist to disk and show in the Replay subview.

### Unit Tests (write first)

- `src/test/sentinel/agent-run-lifecycle.test.ts` (new)
  - First save → creates an active run with `status: 'active'`.
  - Second save within `RUN_IDLE_CLOSE_MS` → updates same run (no new run created).
  - Idle for `RUN_IDLE_CLOSE_MS + 1000` ms → run transitions to `status: 'completed'`.
  - Completed run persists to `.failsafe/runs/completed/<runId>.json`.
  - Active run persisted to `.failsafe/runs/active/<runId>.json` with `eventCount` incremented per edit.
  - Hub snapshot exposes `activeRuns` and `completedRuns` populated from disk.
- `src/test/sentinel/agent-run-recorder.test.ts` (extend if exists)
  - `handleFileEdit({ path, timestamp })` delegates to `AgentRunLifecycle`.
  - Returns `{ runId, status, eventCount }` so the timeline can correlate.

### Changes

`src/sentinel/AgentRunLifecycle.ts` (new):

```ts
export interface AgentRunSummary {
  runId: string;
  agentId: string;
  status: 'active' | 'completed' | 'failed' | 'aborted';
  startedAt: string;
  completedAt?: string;
  filesTouched: string[];
  eventCount: number;
  source: 'terminal-detection' | 'ide-activity' | 'manual' | 'governance';
}

export class AgentRunLifecycle {
  constructor(
    private readonly workspaceRoot: string,
    private readonly idleCloseMs: number = 30_000,
    private readonly clock: () => number = Date.now,
  ) {}
  handleEdit(event: { path: string; timestamp: string; agentId?: string }): AgentRunSummary;
  closeIdleRuns(): AgentRunSummary[];
  getActive(): AgentRunSummary[];
  getCompleted(limit?: number): AgentRunSummary[];
}
```

`src/sentinel/AgentRunRecorder.ts` — refactor `handleFileEdit` to call `AgentRunLifecycle.handleEdit`; periodic `closeIdleRuns()` invocation via setInterval (or on each new edit, sweep older idle ones).

`src/roadmap/ConsoleServer.ts`:

```ts
activeRuns: this.agentRunLifecycle.getActive(),
completedRuns: this.agentRunLifecycle.getCompleted(20),
```

Replay UI module reads exactly those two fields. Existing `/api/replay` route delegates to the same store.

### CI / validation

Manual: edit + save a file 3 times in 5 seconds → Replay shows 1 active run with `eventCount: 3`. Wait 30+ seconds → run moves to "Completed" section with the same runId.

---

## Aggregate verification

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Per-phase additions: +5, +6, +8 = **+19 new tests**.

CHANGELOG.md (root + extension) under v5.0.0 "Fixed":
- Timeline now records and renders IDE activity (was empty).
- Audit log unified from transparency events + META_LEDGER history (was empty).
- Replay captures active and completed runs from rapid file-save sequences (was empty).
