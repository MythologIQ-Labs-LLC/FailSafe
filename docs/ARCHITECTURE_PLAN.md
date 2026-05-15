# Plan: Command Center Production Readiness (Amended)

**Current Version**: v4.9.2
**Target Version**: v4.9.3
**Change Type**: hotfix
**Risk Grade**: L2

## Open Questions

1. **Monitor Qore runtime section**: `roadmap.js` implements a full Qore runtime card (lines 373-392) but `index.html` has no HTML containers. Is this planned UI or dead code? **Recommendation**: Remove dead JS — Qore data already in Command Center overview.
2. **Monitor transparency/risk streams**: `roadmap.js` has `fetchTransparency()` and `fetchRisks()` (lines 652-746) targeting elements that don't exist in `index.html`. **Recommendation**: Remove dead JS — these belong in Command Center only.
3. **Dual transparency write**: Both ConsoleServer and TransparencyPanel write to `transparency.jsonl` without coordination. **Recommendation**: Single writer (ConsoleServer), TransparencyPanel reads only.

## Phase 1: Fix Disconnected Hub Data

Align Command Center renderers with actual `buildHubSnapshot()` output. Fix phantom data fields (rendered but never sent) and add missing fields.

### Affected Files

- `src/roadmap/ConsoleServer.ts` — Add `chainValid`, `risks` to hub snapshot (~2 lines)
- `src/roadmap/ui/modules/overview.js` — Fix `checkpoints` → `recentCheckpoints` field name
- `src/roadmap/ui/modules/operations.js` — Fix `checkpoints` → `recentCheckpoints` field name
- `src/roadmap/ui/modules/risks.js` — Fix `risks` consumption to handle both `risks` array and `riskSummary`
- `src/roadmap/ui/roadmap.js` — Remove dead code for missing Monitor elements (Qore runtime card, transparency stream, risk stream, verify-integrity button)

### Changes

**1a. Add missing fields to `buildHubSnapshot()`**

In `ConsoleServer.ts`, add to the return object (2 lines only):

```typescript
chainValid: this.cachedChainValid ?? null,
risks: this.getRiskRegister(),
```

**1b. Fix Overview renderer field name**

In `overview.js`, change `hubData.checkpoints` references to `hubData.recentCheckpoints`:

```javascript
const checkpoints = hubData.recentCheckpoints || [];
const recent = checkpoints.slice(0, 8);
```

**1c. Fix Operations renderer field name**

Same pattern — `hubData.checkpoints` → `hubData.recentCheckpoints`.

**1d. Fix Risks renderer**

`RisksRenderer.render()` should consume `hubData.risks` (now sent by server). The server returns the risk register array from `.failsafe/risks/risks.json`.

**1e. Remove dead Monitor code**

In `roadmap.js`, remove:
- Lines referencing `qore-runtime-state`, `qore-policy-version`, `qore-runtime-endpoint`, `qore-runtime-latency`, `qore-runtime-check` (5 orphaned element refs)
- `fetchTransparency()` method and its call in `DOMContentLoaded`
- `fetchRisks()` method and its call in `DOMContentLoaded`
- `renderTransparency()` method
- `renderRisks()` method
- `verify-integrity-btn` click handler
- `transparency-refresh` / `risk-refresh` click handlers

### Unit Tests

- `src/test/roadmap/ConsoleServer.test.ts` — Verify `buildHubSnapshot()` includes `chainValid` and `risks` fields
- `src/test/ui/user-stories.spec.ts` — Update any hub data fixtures to match new field names

## Phase 2: Wire B142/B143/B144 into Command Center

Expose AgentTimelineService, AgentHealthIndicator, and ShadowGenomeManager data through an extracted route module and render in Command Center modules.

### Affected Files

- `src/roadmap/routes/AgentApiRoute.ts` — NEW (~80 lines). Extracted route module for timeline, health, genome, and run replay API endpoints
- `src/roadmap/routes/types.ts` — Extend `ApiRouteDeps` with sentinel service accessors
- `src/roadmap/ConsoleServer.ts` — Accept 3 services via setters; call `setupAgentApiRoutes` in `setupRoutes()`; add services to `apiDeps`
- `src/extension/main.ts` — Pass sentinel services to ConsoleServer after both bootstraps complete
- `src/sentinel/AgentHealthIndicator.ts` — Make `buildMetrics()` public
- `src/roadmap/ui/command-center.html` — Add Timeline, Genome, and Replay tabs
- `src/roadmap/ui/modules/timeline.js` — NEW (~120 lines)
- `src/roadmap/ui/modules/genome.js` — NEW (~100 lines)
- `src/roadmap/ui/modules/overview.js` — Add health indicator card
- `src/roadmap/ui/command-center.js` — Register new renderers

### Changes

**2a. Extend `ApiRouteDeps` with sentinel accessors**

In `src/roadmap/routes/types.ts`, add:

```typescript
getTimelineEntries: (filter?: any) => any[];
getHealthMetrics: () => any | null;
getGenomePatterns: () => Promise<any[]>;
getGenomeUnresolved: (limit: number) => Promise<any[]>;
getActiveRuns: () => any[];
getCompletedRuns: () => any[];
getRun: (runId: string) => any | undefined;
loadRun: (runId: string) => any | null;
getRunSteps: (runId: string) => any[];
```

**2b. Create `AgentApiRoute.ts`**

New extracted route module (~80 lines) following established `setupXxxRoutes` pattern:

```typescript
import type { Application, Request, Response } from "express";
import type { ApiRouteDeps } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function setupAgentApiRoutes(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/v1/timeline", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const entries = deps.getTimelineEntries(req.query);
    res.json({ entries });
  });

  app.get("/api/v1/health", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const metrics = deps.getHealthMetrics();
    res.json({ metrics });
  });

  app.get("/api/v1/genome", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const patterns = await deps.getGenomePatterns();
    const unresolved = await deps.getGenomeUnresolved(50);
    res.json({ patterns, unresolved });
  });

  app.get("/api/v1/runs", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const active = deps.getActiveRuns();
    const completed = deps.getCompletedRuns();
    res.json({ active, completed });
  });

  app.get("/api/v1/runs/:runId", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const { runId } = req.params;
    if (!UUID_PATTERN.test(runId)) {
      res.status(400).json({ error: "Invalid run ID format" });
      return;
    }
    const run = deps.getRun(runId) ?? deps.loadRun(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    res.json({ run });
  });

  app.get("/api/v1/runs/:runId/steps", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const { runId } = req.params;
    if (!UUID_PATTERN.test(runId)) {
      res.status(400).json({ error: "Invalid run ID format" });
      return;
    }
    const steps = deps.getRunSteps(runId);
    res.json({ steps });
  });
}
```

**2c. Wire services to ConsoleServer**

Add setter methods (matches existing `setIdeTracker`, `setSystemRegistry` pattern):

```typescript
setAgentTimelineService(service: AgentTimelineService): void {
  this.agentTimelineService = service;
}
setAgentHealthIndicator(indicator: AgentHealthIndicator): void {
  this.agentHealthIndicator = indicator;
}
setAgentRunRecorder(recorder: AgentRunRecorder): void {
  this.agentRunRecorder = recorder;
}
```

In `setupRoutes()`, add after existing `setupAdapterRoutes` call:

```typescript
setupAgentApiRoutes(this.app, apiDeps);
```

Extend the `apiDeps` object with service delegates:

```typescript
getTimelineEntries: (filter) => this.agentTimelineService?.getEntries(filter) || [],
getHealthMetrics: () => this.agentHealthIndicator?.buildMetrics() || null,
getGenomePatterns: () => this.qorelogicManager.getShadowGenomeManager().analyzeFailurePatterns(),
getGenomeUnresolved: (limit) => this.qorelogicManager.getShadowGenomeManager().getUnresolvedEntries(limit),
getActiveRuns: () => this.agentRunRecorder?.getActiveRuns() || [],
getCompletedRuns: () => this.agentRunRecorder?.getCompletedRuns() || [],
getRun: (runId) => this.agentRunRecorder?.getRun(runId),
loadRun: (runId) => this.agentRunRecorder?.loadRun(runId) || null,
getRunSteps: (runId) => this.agentRunRecorder?.getRunSteps(runId) || [],
```

**2d. Wire services in `main.ts`**

In `main.ts`, after both `bootstrapSentinel` and `bootstrapServers` complete (after line 181):

```typescript
consoleServer.setAgentTimelineService(sentinel.agentTimelineService);
consoleServer.setAgentHealthIndicator(agentHealthIndicator);
consoleServer.setAgentRunRecorder(sentinel.agentRunRecorder);
```

This is correct because `main.ts` has access to both `sentinel` (from `bootstrapSentinel`) and `consoleServer` (from `bootstrapServers`), and `agentHealthIndicator` is created in `main.ts` itself at line 175.

**2e. Make `buildMetrics()` public on AgentHealthIndicator**

Change visibility from `private` to `public`:

```typescript
public buildMetrics(): HealthMetrics {
  // existing implementation unchanged
}
```

This is the existing method that already returns the correct `HealthMetrics` interface. No new fields or fabricated structures.

**2f. Add health metrics to hub snapshot**

In `buildHubSnapshot()` return object:

```typescript
agentHealth: this.agentHealthIndicator?.buildMetrics() || null,
```

**2g. Create `timeline.js` module**

New Command Center module (~120 lines). Renders:
- Category filter bar (All, Verdict, Trust, Approval, DiffGuard)
- Severity toggle (Info, Warning, Error)
- Timeline entries as a scrollable list with timestamp, category badge, summary
- Fetches from `/api/v1/timeline` on tab activation, passes filter query params

```javascript
export class TimelineRenderer {
  constructor(containerId) { this.container = document.getElementById(containerId); }

  async render() {
    const params = new URLSearchParams(this.activeFilters);
    const res = await fetch(`/api/v1/timeline?${params}`);
    const { entries } = await res.json();
    // Render filter bar + entry list
  }
}
```

**2h. Create `genome.js` module**

New Command Center module (~100 lines). Renders:
- Failure pattern cards (failureMode, count)
- Unresolved entries table with id, failureMode, remediationStatus
- Fetches from `/api/v1/genome` on tab activation

```javascript
export class GenomeRenderer {
  constructor(containerId) { this.container = document.getElementById(containerId); }

  async render() {
    const res = await fetch('/api/v1/genome');
    const { patterns, unresolved } = await res.json();
    // Render pattern cards + unresolved table
  }
}
```

**2i. Add health card to Overview**

In `overview.js`, add a 4th card to the top grid:

```javascript
const health = hubData.agentHealth;
const healthLevel = health?.level || 'healthy';
const levelColors = {
  healthy: 'var(--accent-green)',
  elevated: 'var(--accent-yellow)',
  warning: 'var(--accent-orange)',
  critical: 'var(--accent-red)',
};
const healthColor = levelColors[healthLevel] || 'var(--text-muted)';
```

Displays: health level, open critical/high risks, avg trust score.

**2j. Add tabs to `command-center.html`**

Add three sidebar nav items after existing tabs:

```html
<button class="tab-btn" data-target="timeline">Timeline</button>
<button class="tab-btn" data-target="genome">Genome</button>
<button class="tab-btn" data-target="replay">Replay</button>
```

Add corresponding tab panels:

```html
<div id="timeline" class="tab-panel"></div>
<div id="genome" class="tab-panel"></div>
<div id="replay" class="tab-panel"></div>
```

Add script imports:

```html
&lt;script type="module" src="/modules/timeline.js">&lt;/script&gt;
&lt;script type="module" src="/modules/genome.js">&lt;/script&gt;
&lt;script type="module" src="/modules/replay.js">&lt;/script&gt;
```

**2k. Register renderers in `command-center.js`**

Import and instantiate `TimelineRenderer`, `GenomeRenderer`, and `ReplayRenderer`. Add to the renderers object. Wire tab switching. Note: `command-center.js` is currently 275 lines (over 250). Extract `loadWorkspaceRegistry()` and workspace selector wiring (lines 225-274, ~50 lines) into `workspace-registry.js` to make room.

### Unit Tests

- `src/test/roadmap/ConsoleServer.test.ts` — Verify `/api/v1/timeline`, `/api/v1/health`, `/api/v1/genome`, `/api/v1/runs` return expected shapes
- `src/test/roadmap/AgentApiRoute.test.ts` — NEW. Verify UUID validation rejects path traversal (`../etc/passwd`), accepts valid UUIDs

## Phase 3: Fix Transparency Pipeline

Wire sentinel verdicts, governance decisions, and L3 events into the transparency audit stream. Fix dual-write race condition. Make the Audit tab show meaningful data.

### Affected Files

- `src/roadmap/ConsoleServer.ts` — Route sentinel/governance/L3 events to transparency log (~10 lines in existing handlers)
- `src/genesis/panels/TransparencyPanel.ts` — Remove file writes (read-only consumer)
- `src/shared/types/events.ts` — Add `transparency.prompt` to `FailSafeEventType` union

### Changes

**3a. Route all governance events to transparency log**

In ConsoleServer event subscriptions, add transparency logging for sentinel verdicts, L3 events, and governance events. These already have EventBus listeners — add `logTransparencyEvent()` calls:

For `sentinel.verdict` handler:
```typescript
this.logTransparencyEvent({
  type: 'sentinel.verdict',
  decision: (event as any).decision,
  riskGrade: (event as any).riskGrade,
  filePath: (event as any).filePath,
  timestamp: new Date().toISOString(),
});
```

For `qorelogic.l3Queued` handler:
```typescript
this.logTransparencyEvent({
  type: 'governance.l3Queued',
  ...event as Record<string, unknown>,
  timestamp: new Date().toISOString(),
});
```

For `qorelogic.l3Decided` handler:
```typescript
this.logTransparencyEvent({
  type: 'governance.l3Decided',
  ...event as Record<string, unknown>,
  timestamp: new Date().toISOString(),
});
```

**3b. Fix dual-write race condition**

In `TransparencyPanel.ts`, remove `TransparencyLogger.log()` calls. The panel should only READ from the file (via `readRecentEvents()`) and receive live events via EventBus subscription. ConsoleServer is the single writer.

**3c. Add event type to FailSafeEventType**

In `events.ts`, add `"transparency.prompt"` to the union type.

**3d. Broadcast sentinel/governance events to Command Center**

Add `broadcast({ type: "transparency", payload: event })` calls for sentinel verdict and L3 events so the TransparencyRenderer in the Command Center receives them in real-time.

**3e. Broadcast run lifecycle events**

Add EventBus subscriptions in ConsoleServer for run lifecycle events:

```typescript
this.eventBus.on("agentRun.started", (event) => {
  this.broadcast({ type: "agentRun", payload: { action: "started", ...event } });
});
this.eventBus.on("agentRun.completed", (event) => {
  this.broadcast({ type: "agentRun", payload: { action: "completed", ...event } });
});
this.eventBus.on("agentRun.stepRecorded", (event) => {
  this.broadcast({ type: "agentRun", payload: { action: "step", ...event } });
});
```

### Unit Tests

- `src/test/roadmap/TransparencyPipeline.test.ts` — NEW (~60 lines). Verify:
  - Sentinel verdict events reach transparency log
  - L3 queue/decide events reach transparency log
  - Events have required fields (type, timestamp)
  - Duplicate writes prevented (only ConsoleServer writes)

## Phase 4: Wire B146 — Agent Run Replay Module

Create Command Center Replay tab that displays agent run data from the API endpoints created in Phase 2.

### Affected Files

- `src/roadmap/ui/modules/replay.js` — NEW (~150 lines)

### Changes

**4a. Create `replay.js` module**

New Command Center module (~150 lines). Renders:
- Run list: active runs (with pulsing indicator) and recent completed runs
- Run detail view: step-by-step timeline with governance decision cards
- Step cards show: seq, kind badge (color-coded by `RunStepKind`), title, timestamp, diff stats if present
- GovernanceDecision cards show: action badge (ALLOW/BLOCK/MODIFY/ESCALATE/QUARANTINE), riskCategory, mitigation, confidence
- Click a run → fetches `/api/v1/runs/:runId` → renders step timeline
- Receives real-time `agentRun` WebSocket events to update run list

```javascript
export class ReplayRenderer {
  constructor(containerId) { this.container = document.getElementById(containerId); }

  async render() {
    const res = await fetch('/api/v1/runs');
    const { active, completed } = await res.json();
    this.renderRunList(active, completed);
  }

  async renderRun(runId) {
    const res = await fetch(`/api/v1/runs/${runId}`);
    const { run } = await res.json();
    this.renderStepTimeline(run);
  }

  onEvent(event) {
    if (event.type === 'agentRun') {
      this.render(); // Refresh on run lifecycle events
    }
  }
}
```

### Unit Tests

- `src/test/roadmap/AgentRunRecorder.test.ts` — Verify `getActiveRuns()`, `getCompletedRuns()`, `getRun()` return bounded arrays

## Summary

| File | Action | Est. Lines |
|------|--------|-----------|
| `src/roadmap/routes/AgentApiRoute.ts` | NEW | ~80 (extracted route module) |
| `src/roadmap/routes/types.ts` | EDIT | +9 (sentinel service accessors) |
| `src/roadmap/ConsoleServer.ts` | EDIT | +20 (3 setters, apiDeps delegates, hub fields, event routing) |
| `src/extension/main.ts` | EDIT | +3 (wire 3 services after both bootstraps) |
| `src/sentinel/AgentHealthIndicator.ts` | EDIT | ~1 (private → public on buildMetrics) |
| `src/roadmap/ui/modules/overview.js` | EDIT | +15 (health card, fix checkpoints field) |
| `src/roadmap/ui/modules/operations.js` | EDIT | ~3 (fix checkpoints field) |
| `src/roadmap/ui/modules/risks.js` | EDIT | ~5 (fix risks consumption) |
| `src/roadmap/ui/modules/timeline.js` | NEW | ~120 |
| `src/roadmap/ui/modules/genome.js` | NEW | ~100 |
| `src/roadmap/ui/modules/replay.js` | NEW | ~150 |
| `src/roadmap/ui/modules/workspace-registry.js` | NEW | ~50 (extracted from command-center.js) |
| `src/roadmap/ui/command-center.html` | EDIT | +12 (3 tabs, 3 panels, 3 imports) |
| `src/roadmap/ui/command-center.js` | EDIT | -35 (extract workspace, +15 register renderers) |
| `src/roadmap/ui/roadmap.js` | EDIT | -80 (remove dead code) |
| `src/genesis/panels/TransparencyPanel.ts` | EDIT | -5 (remove writes) |
| `src/shared/types/events.ts` | EDIT | +1 (add event type) |
| `src/test/roadmap/ConsoleServer.test.ts` | EDIT | +30 |
| `src/test/roadmap/AgentApiRoute.test.ts` | NEW | ~30 (UUID validation) |
| `src/test/roadmap/TransparencyPipeline.test.ts` | NEW | ~60 |
