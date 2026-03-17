# Plan: ConsoleServer Decomposition for Pro Extraction Readiness

**Current Version**: v4.9.9
**Target Version**: v4.10.0
**Change Type**: feature (internal restructuring)
**Risk Grade**: L2

## Open Questions

None — all extraction targets identified from structural analysis.

---

## Phase 1: Extract WebSocketManager + TransparencyLogger + RiskRegisterManager

Extract the three simplest, most independent modules first. Zero behavioral change — ConsoleServer delegates to the new modules.

### Affected Files

- `FailSafe/extension/src/roadmap/services/WebSocketManager.ts` — **NEW**: WebSocket setup, broadcast, ledger file watcher
- `FailSafe/extension/src/roadmap/services/TransparencyLogger.ts` — **NEW**: transparency.jsonl read/write
- `FailSafe/extension/src/roadmap/services/RiskRegisterManager.ts` — **NEW**: risks.json read/write
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — remove extracted methods, import and delegate

### Changes

**WebSocketManager.ts** (~55 lines):

```typescript
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import * as path from "path";
import type { Server } from "http";

export class WebSocketManager {
  private wss: WebSocketServer | null = null;

  setup(server: Server): void {
    this.wss = new WebSocketServer({ server });
  }

  broadcast(data: Record<string, unknown>): void {
    if (!this.wss) return;
    const msg = JSON.stringify(data);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  watchMetaLedger(workspaceRoot: string, onUpdate: (snapshot: unknown) => void): fs.FSWatcher | null {
    const ledgerPath = path.join(workspaceRoot, "docs", "META_LEDGER.md");
    try {
      return fs.watch(ledgerPath, { persistent: false }, () => {
        setTimeout(() => onUpdate(null), 1500);
      });
    } catch { return null; }
  }

  close(): void {
    this.wss?.close();
    this.wss = null;
  }
}
```

**TransparencyLogger.ts** (~45 lines):

```typescript
import * as fs from "fs";
import * as path from "path";

export class TransparencyLogger {
  constructor(private workspaceRoot: string) {}

  getEvents(limit = 50): unknown[] {
    const filePath = path.join(this.workspaceRoot, ".failsafe", "transparency.jsonl");
    // Read last 4KB, parse JSONL lines, return parsed objects
  }

  log(event: Record<string, unknown>): void {
    const filePath = path.join(this.workspaceRoot, ".failsafe", "transparency.jsonl");
    // Append JSON line
  }
}
```

**RiskRegisterManager.ts** (~40 lines):

```typescript
import * as fs from "fs";
import * as path from "path";

export class RiskRegisterManager {
  constructor(private workspaceRoot: string) {}

  getRisks(): unknown[] {
    const filePath = path.join(this.workspaceRoot, ".failsafe", "risks", "risks.json");
    // Read and parse, return empty array on failure
  }

  writeRisks(risks: unknown[]): void {
    const filePath = path.join(this.workspaceRoot, ".failsafe", "risks", "risks.json");
    // Atomic write with mkdir -p
  }
}
```

**ConsoleServer.ts** — Replace inline methods with delegation:

- Remove `setupWebSocket()`, `broadcast()`, `watchMetaLedger()` — delegate to `this.wsManager`
- Remove `getTransparencyEvents()`, `logTransparencyEvent()` — delegate to `this.transparencyLogger`
- Remove `getRiskRegister()`, `writeRiskRegister()` — delegate to `this.riskRegisterManager`
- Update `buildApiRouteDeps()` to pass logger/register instances instead of bound methods
- Update `start()` to call `this.wsManager.setup(server)`
- Update `stop()` to call `this.wsManager.close()`

**Estimated reduction**: ~135 lines removed from ConsoleServer.

### Unit Tests

- `src/test/roadmap/WebSocketManager.test.ts` — broadcast delivers to all open clients; watchMetaLedger returns watcher
- `src/test/roadmap/TransparencyLogger.test.ts` — log appends JSONL line; getEvents returns parsed array; handles missing file
- `src/test/roadmap/RiskRegisterManager.test.ts` — getRisks reads JSON; writeRisks atomic-writes; handles missing directory

---

## Phase 2: Extract EventSubscriptionManager

The 12 EventBus subscriptions (sentinel verdicts, governance events, transparency logging, run lifecycle) form a cohesive event-wiring module. This is the highest-value extraction for Pro — the event orchestration IS the governance engine's nervous system.

### Affected Files

- `FailSafe/extension/src/roadmap/services/EventSubscriptionManager.ts` — **NEW**: all EventBus subscriptions
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — remove `subscribeToEvents()`, `subscribeToQorelogicEvents()`, and event helper methods

### Changes

**EventSubscriptionManager.ts** (~140 lines):

Accepts dependencies via constructor:

```typescript
export interface EventSubscriptionDeps {
  eventBus: EventBus;
  recordCheckpoint: (record: Partial<CheckpointRecord>) => void;
  broadcast: (data: Record<string, unknown>) => void;
  logTransparencyEvent: (event: Record<string, unknown>) => void;
  inferPhaseKey: (plan: unknown) => string;
  planManager: { getActivePlan(): unknown };
}

export class EventSubscriptionManager {
  private disposables: Array<() => void> = [];

  constructor(private deps: EventSubscriptionDeps) {}

  subscribe(): void {
    // Wire all 12 EventBus listeners
    // sentinel.verdict → recordCheckpoint + broadcast + logTransparencyEvent
    // qorelogic.l3Queued/Decided → broadcast + logTransparencyEvent
    // qorelogic.trustUpdate → broadcast
    // qorelogic.agentQuarantined → recordCheckpoint + broadcast
    // agentRun.started/completed/stepRecorded → broadcast
    // checkpoint.recorded → broadcast
  }

  dispose(): void {
    for (const d of this.disposables) d();
    this.disposables = [];
  }
}
```

Extract from ConsoleServer:
- `subscribeToEvents()` (lines 689-731) → `EventSubscriptionManager.subscribe()` sentinel/agent listeners
- `subscribeToQorelogicEvents()` (lines 733-784) → `EventSubscriptionManager.subscribe()` qorelogic listeners
- `recordVerdictCheckpoint()` (lines 786-800) → private method in EventSubscriptionManager
- `maybeRecordAuditPassCheckpoint()` (lines 807-822) → private method in EventSubscriptionManager
- `maybeRecordSubstantiateCompletion()` (lines 824-863) → private method in EventSubscriptionManager
- `extractEventPayload()` (lines 802-805) → private method in EventSubscriptionManager

**ConsoleServer.ts** — Replace with:

```typescript
this.eventSubscriptionManager = new EventSubscriptionManager({
  eventBus: this.eventBus,
  recordCheckpoint: (r) => this.recordCheckpoint(r),
  broadcast: (d) => this.wsManager.broadcast(d),
  logTransparencyEvent: (e) => this.transparencyLogger.log(e),
  inferPhaseKey: (p) => this.inferPhaseKeyFromPlan(p),
  planManager: this.planManager,
});
this.eventSubscriptionManager.subscribe();
```

**Estimated reduction**: ~175 lines removed from ConsoleServer.

### Unit Tests

- `src/test/roadmap/EventSubscriptionManager.test.ts`:
  - `sentinel.verdict PASS records checkpoint with decision=PASS`
  - `sentinel.verdict BLOCK records checkpoint and broadcasts`
  - `qorelogic.l3Queued broadcasts to WebSocket clients`
  - `agentRun.started broadcasts run lifecycle event`
  - `dispose removes all listeners`

---

## Phase 3: Extract QoreRuntimeService + Inline Route Consolidation

Extract the Qore runtime integration, then consolidate the remaining inline route registrations into their own modules.

### Affected Files

- `FailSafe/extension/src/roadmap/services/QoreRuntimeService.ts` — **NEW**: Qore runtime snapshot fetching
- `FailSafe/extension/src/roadmap/routes/FeatureStatusRoute.ts` — **NEW**: feature gate, hub snapshot, verdict routes
- `FailSafe/extension/src/roadmap/routes/SkillsApiRoute.ts` — **NEW**: skills discovery/ingest/relevance routes
- `FailSafe/extension/src/roadmap/routes/HookRoute.ts` — **NEW**: hook enable/disable routes
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — remove extracted methods, delegate to new modules

### Changes

**QoreRuntimeService.ts** (~80 lines):

```typescript
export class QoreRuntimeService {
  constructor(private options: { endpoint?: string; apiKey?: string }) {}

  async fetchSnapshot(): Promise<QoreRuntimeSnapshot | null> { /* ... */ }
  async fetchJson(path: string): Promise<unknown> { /* ... */ }
}
```

**FeatureStatusRoute.ts** (~70 lines) — Extracts `registerFeatureAndStatusRoutes()` + `registerVerdictAndTrustRoutes()`.

**SkillsApiRoute.ts** (~50 lines) — Extracts `registerSkillRoutes()`.

**HookRoute.ts** (~20 lines) — Extracts `registerHookRoutes()`.

**ConsoleServer.ts** — Replace inline route registration with:

```typescript
setupFeatureStatusRoutes(this.app, featureStatusDeps);
setupSkillsApiRoutes(this.app, skillsDeps);
setupHookRoutes(this.app, hookDeps);
```

**Estimated reduction**: ~220 lines removed from ConsoleServer.

### Unit Tests

- `src/test/roadmap/QoreRuntimeService.test.ts` — fetchSnapshot returns null on network error; returns parsed JSON on success
- `src/test/roadmap/FeatureStatusRoute.test.ts` — hub endpoint returns snapshot; verdict endpoint returns recent verdicts
- `src/test/roadmap/SkillsApiRoute.test.ts` — installed-skills returns array; ingest validates payload

---

## Summary

| Phase | Extracted Module | Lines Out | ConsoleServer After |
|-------|-----------------|-----------|-------------------|
| 1 | WebSocketManager + TransparencyLogger + RiskRegisterManager | ~135 | ~1236 |
| 2 | EventSubscriptionManager | ~175 | ~1061 |
| 3 | QoreRuntimeService + FeatureStatusRoute + SkillsApiRoute + HookRoute | ~220 | ~841 |

**Final ConsoleServer.ts**: ~841 lines — still above 250L Razor limit but now a thin orchestrator with:
- Constructor + dependency injection (~170 lines)
- Lifecycle: start/stop/port (~80 lines)
- Route coordinator: `setupRoutes()` calling extracted modules (~60 lines)
- Hub snapshot: `buildHubSnapshot()` orchestrating 15+ data sources (~180 lines)
- Checkpoint wrappers delegating to CheckpointStore (~100 lines)
- Setters for lazy-initialized services (~60 lines)
- Config/utility helpers (~90 lines)

Each extracted module is independently testable and portable to FailSafe Pro without Express dependency (the services are framework-agnostic; only the route modules need Express).
