# Plan: v4.9.7 Diagnostic Fixes — Amended v2

**Current Version**: v4.9.6
**Target Version**: v4.9.7
**Change Type**: hotfix
**Risk Grade**: L2
**Prior Verdict**: VETO (Entry #247) → **Amended v2**

## Amendments from VETO

| Violation | Resolution |
|-----------|------------|
| V1/D31: Ghost Path — `getGenomeAllPatterns` not in ApiRouteDeps | Added to Phase 3 Affected Files: types.ts declaration |
| V2/D32: Ghost Path — Missing delegate wiring | Added to Phase 3: ConsoleServer.ts wiring |
| V3/D33: Razor — roadmap.js at 632L | Phase 5 deferred to v4.9.8; roadmap.js decomposition required first |

## Open Questions

None — root causes identified via `/qor-debug` four-layer analysis.

---

## Phase 1: Governance Mode Configuration Gap (P0)

**Root Cause**: `EnforcementEngine.getGovernanceMode()` reads `config.governance?.mode` but `FailSafeConfig` type only has `overseerId` — mode is never read from VS Code settings, always defaults to `"observe"`.

### Affected Files

- `FailSafe/extension/src/shared/types/config.ts` — add `mode` to governance type
- `FailSafe/extension/src/shared/ConfigManager.ts` — read `failsafe.governance.mode` setting

### Changes

**config.ts:51-54** — Add `mode` to governance interface:

```typescript
governance?: {
  mode?: "observe" | "assist" | "enforce";
  overseerId: string;
};
```

**ConfigManager.ts:44-74** — In `getConfig()`, add governance section with mode:

```typescript
governance: {
  mode: sentinelYaml?.governance?.mode ?? config.get<"observe" | "assist" | "enforce">("governance.mode", "observe"),
  overseerId: sentinelYaml?.governance?.overseerId ?? config.get<string>("governance.overseerId", "did:myth:overseer:local"),
},
```

### Unit Tests

- `ConfigManager.test.ts` — verify `getConfig().governance.mode` returns VS Code setting value
- `EnforcementEngine.test.ts` — verify `getGovernanceMode()` returns mode from config, not hardcoded default

---

## Phase 2: Agent Run Capture for External Agents (P1)

**Root Cause**: `AgentRunRecorder` only triggers on `ide.taskStarted` from VS Code tasks. External agents (Claude Code, Copilot) don't emit VS Code task events.

### Affected Files

- `FailSafe/extension/src/sentinel/AgentRunRecorder.ts` — detect external agent sessions via file operation patterns
- `FailSafe/extension/src/extension/bootstrapGovernance.ts` — emit synthetic `ide.taskStarted` on rapid file edits

### Changes

**AgentRunRecorder.ts** — Add file-based session detection:

```typescript
// Add property
private lastFileEditTime = 0;
private rapidEditThreshold = 5000; // 5 seconds

// Add method
handleFileEdit(filePath: string, agentDid: string): void {
  const now = Date.now();
  const timeSinceLastEdit = now - this.lastFileEditTime;
  this.lastFileEditTime = now;

  // If no active run and rapid edits detected, start implicit run
  if (this.activeRuns.size === 0 && timeSinceLastEdit < this.rapidEditThreshold) {
    this.startRun(agentDid || "external-agent", "file-edit", "implicit");
  }

  // Record file edit as step if run is active
  if (this.activeRuns.size > 0) {
    const step: RunStep = {
      seq: 0,
      kind: "file_edit",
      timestamp: new Date().toISOString(),
      title: `File edit: ${path.basename(filePath)}`,
      artifactPath: filePath,
    };
    for (const run of this.activeRuns.values()) {
      run.steps.push({ ...step, seq: run.steps.length + 1 });
    }
  }
}
```

**bootstrapGovernance.ts:113-123** — Wire file edit detection:

```typescript
// In onWillSaveTextDocument handler, after handleFileOperation:
if (core.agentRunRecorder) {
  core.agentRunRecorder.handleFileEdit(event.document.uri.fsPath, "vscode-user");
}
```

### Unit Tests

- `AgentRunRecorder.test.ts` — verify rapid file edits start implicit run
- `AgentRunRecorder.test.ts` — verify file edits recorded as steps when run active

---

## Phase 3: Genome View Data Visibility (P2)

**Root Cause**: `analyzeFailurePatterns()` only queries `WHERE remediation_status = 'UNRESOLVED'`. If all entries resolved or none exist, view shows empty.

### Affected Files

- `FailSafe/extension/src/qorelogic/shadow/ShadowGenomeManager.ts` — add method for all patterns
- `FailSafe/extension/src/roadmap/routes/types.ts` — add `getGenomeAllPatterns` to ApiRouteDeps interface **(V1 fix)**
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — wire delegate for `getGenomeAllPatterns` **(V2 fix)**
- `FailSafe/extension/src/roadmap/routes/AgentApiRoute.ts` — expose both filtered and all patterns
- `FailSafe/extension/src/roadmap/ui/modules/genome.js` — show all patterns with status filter

### Changes

**ShadowGenomeManager.ts** — Add `analyzeAllPatterns()` method:

```typescript
async analyzeAllPatterns(): Promise<FailurePattern[]> {
  if (!this.db) { return []; }
  const rows = this.db.prepare(`
    SELECT
      failure_mode,
      remediation_status,
      COUNT(*) as count,
      GROUP_CONCAT(DISTINCT agent_did) as agent_dids,
      GROUP_CONCAT(causal_vector, '|||') as causes
    FROM shadow_genome
    GROUP BY failure_mode, remediation_status
    ORDER BY count DESC
  `).all() as Array<{ failure_mode: FailureMode; remediation_status: RemediationStatus; count: number; agent_dids: string | null; causes: string | null }>;

  return rows.map(row => ({
    failureMode: row.failure_mode,
    count: row.count,
    agentDids: row.agent_dids ? row.agent_dids.split(',') : [],
    recentCauses: row.causes ? row.causes.split('|||').slice(0, 3) : [],
    remediationStatus: row.remediation_status,
  }));
}
```

**types.ts:30-31** — Add to ApiRouteDeps interface **(V1 fix)**:

```typescript
getGenomePatterns: () => Promise<any[]>;
getGenomeAllPatterns: () => Promise<any[]>;  // NEW
getGenomeUnresolved: (limit: number) => Promise<any[]>;
```

**ConsoleServer.ts:394-395** — Wire delegate in `buildApiRouteDeps()` **(V2 fix)**:

```typescript
getGenomePatterns: () => this.qorelogicManager.getShadowGenomeManager().analyzeFailurePatterns(),
getGenomeAllPatterns: () => this.qorelogicManager.getShadowGenomeManager().analyzeAllPatterns(),  // NEW
getGenomeUnresolved: (limit) => this.qorelogicManager.getShadowGenomeManager().getUnresolvedEntries(limit),
```

**AgentApiRoute.ts:29-34** — Return both pattern sets:

```typescript
app.get("/api/v1/genome", async (req: Request, res: Response) => {
  if (deps.rejectIfRemote(req, res)) return;
  const patterns = await deps.getGenomePatterns();
  const allPatterns = await deps.getGenomeAllPatterns();
  const unresolved = await deps.getGenomeUnresolved(50);
  res.json({ patterns, allPatterns, unresolved });
});
```

**genome.js** — Add toggle for showing all vs unresolved:

```javascript
// Add property in constructor
this.allPatterns = [];
this.showAll = false;

// In fetchGenome(), capture allPatterns
this.allPatterns = data.allPatterns || [];

// Add toggle button in render()
<button class="cc-btn cc-genome-toggle" style="margin-bottom:12px">
  ${this.showAll ? 'Show Unresolved Only' : 'Show All Patterns'}
</button>

// Bind toggle after render
this.container.querySelector('.cc-genome-toggle')?.addEventListener('click', () => {
  this.showAll = !this.showAll;
  this.render();
});

// In renderPatternCards(), use appropriate set
const displayPatterns = this.showAll ? this.allPatterns : this.patterns;
```

### Unit Tests

- `ShadowGenomeManager.test.ts` — verify `analyzeAllPatterns()` returns all statuses
- `genome.test.js` — verify toggle switches between pattern sets

---

## Phase 4: Timeline Entry Expansion (P2)

**Root Cause**: `TimelineRenderer.renderEntries()` creates static HTML with no click handlers or expandable detail sections.

### Affected Files

- `FailSafe/extension/src/roadmap/ui/modules/timeline.js` — add click-to-expand functionality

### Changes

**timeline.js:71-86** — Add expandable detail like transparency.js:

```javascript
renderEntries() {
  if (!this.entries.length) {
    // ... empty state unchanged
  }
  const rows = this.entries.slice(0, 50).map(e => {
    const sevColors = { error: 'var(--accent-red)', warning: 'var(--accent-gold)', info: 'var(--accent-cyan)' };
    const color = sevColors[e.severity] || 'var(--text-muted)';
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
    return `
      <div class="cc-timeline-entry" style="display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-left:3px solid ${color};
        background:rgba(0,0,0,0.12);border-radius:4px;margin-bottom:6px;cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="cc-badge" style="background:${color};color:#fff;font-size:0.65rem;min-width:50px;text-align:center">${esc(e.category || 'event')}</span>
          <div style="flex:1">
            <div style="font-size:0.83rem;color:var(--text-main)">${esc(e.summary || e.type || 'Event')}</div>
            ${e.agentDid ? `<div style="font-size:0.7rem;color:var(--text-muted)">Agent: ${esc(e.agentDid.slice(0, 12))}...</div>` : ''}
          </div>
          <span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${esc(time)}</span>
        </div>
        <pre class="cc-timeline-detail" style="display:none;margin:0;font-size:0.7rem;
          overflow-x:auto;color:var(--console-text);background:var(--console-bg);
          padding:8px;border-radius:6px">${esc(JSON.stringify(e.payload || e, null, 2))}</pre>
      </div>`;
  }).join('');
  return `<div style="max-height:600px;overflow-y:auto">${rows}</div>`;
}
```

**timeline.js:89-102** — Add entry click binding:

```javascript
bindFilters() {
  // ... existing filter bindings

  // Bind entry expansion
  this.container.querySelectorAll('.cc-timeline-entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const detail = entry.querySelector('.cc-timeline-detail');
      if (detail) {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      }
    });
  });
}
```

### Unit Tests

- `timeline.test.js` — verify click toggles detail visibility
- `timeline.test.js` — verify payload JSON is escaped and displayed

---

## Phase 5: DEFERRED to v4.9.8

**Original Scope**: Clickable blocked message navigation from Monitor to Audit log with highlighting.

**Reason for Deferral**: `roadmap.js` is at 632 lines (2.5x over 250L Razor limit). Adding navigation code without decomposition would worsen technical debt. Phase 5 requires prior extraction of sentinel rendering into a dedicated module.

**Deferred Work**:
- B185: Clickable blocked message navigation → moved to v4.9.8
- D33: roadmap.js Razor remediation → prerequisite for B185

---

## Summary

| Phase | Priority | Files Changed | Complexity | Status |
|-------|----------|---------------|------------|--------|
| 1. Governance Mode | P0 | 2 | Low | Active |
| 2. Agent Run Capture | P1 | 2 | Medium | Active |
| 3. Genome View | P2 | 5 | Medium | Active (V1/V2 fixed) |
| 4. Timeline Expand | P2 | 1 | Low | Active |
| 5. Blocked Navigation | P2 | 3 | Medium | **DEFERRED** |

**Active Scope**: 10 file changes, 4 unit test files
**Deferred**: B185, D33

---

## Backlog Updates

Move B185 to v4.9.8 section and add roadmap.js decomposition as prerequisite:

```markdown
### v4.9.7 Diagnostic Fixes (plan-v497-diagnostic-fixes.md)

- [ ] [B181] Phase 1: Governance mode config gap — add mode to FailSafeConfig, read from VS Code settings | v4.9.7
- [ ] [B182] Phase 2: Agent run capture for external agents — file-based session detection, implicit run creation | v4.9.7
- [ ] [B183] Phase 3: Genome view data visibility — show all patterns with status filter toggle | v4.9.7
- [ ] [B184] Phase 4: Timeline entry expansion — click-to-expand detail sections | v4.9.7
- [x] [B185] ~~Phase 5: Clickable blocked message navigation~~ — DEFERRED to v4.9.8 (D33 prerequisite)

### v4.9.8 Blocked Navigation + Razor (plan-v498-blocked-navigation.md)

- [ ] [B186] Phase 0: Extract sentinel rendering from roadmap.js into sentinel-monitor.js (D33 resolution) | v4.9.8
- [ ] [B185] Phase 1: Clickable blocked message navigation — direct audit log linking with highlighting | v4.9.8
```

---

_Plan follows Simple Made Easy principles — each phase is independent and can be implemented/tested in isolation._

_Amended v2 resolves VETO violations V1, V2, V3 per Entry #247._
