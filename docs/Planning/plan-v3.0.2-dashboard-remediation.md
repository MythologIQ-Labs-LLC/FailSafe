# Plan: v3.0.2 Dashboard Remediation

## Open Questions

1. Should the Dashboard roadmap be full-size (like PlanningHubPanel) or a compact mini-view?
   - **Decision**: Compact mini-view that links to full Planning Hub

2. Should we merge Dashboard and PlanningHub into one unified panel?
   - **Decision**: Keep separate. Dashboard = quick status. PlanningHub = deep planning.

---

## Phase 1: Add Roadmap Mini-View to Dashboard

### Affected Files

- `genesis/panels/templates/DashboardTemplate.ts` - Add roadmap card with mini SVG
- `genesis/panels/DashboardPanel.ts` - Add PlanManager dependency, pass plan data
- `shared/types.ts` - Export Plan type for Dashboard (if not already)

### Changes

**DashboardTemplate.ts**:

1. Add `plan` and `planProgress` to `DashboardViewModel`:
```typescript
export type DashboardViewModel = {
  // existing fields...
  plan: Plan | null;
  planProgress: { completed: number; total: number; blocked: boolean } | null;
};
```

2. Add `renderRoadmapCard()` function:
```typescript
function renderRoadmapCard(model: DashboardViewModel): string {
  if (!model.plan) {
    return `<div class="card"><div class="card-title">Active Plan</div>
      <div class="muted">No active plan. Use <code>/qor-plan</code> to create one.</div>
      <button class="action-btn secondary" onclick="showPlanningHub()">Open Planning Hub</button>
    </div>`;
  }
  const pct = model.planProgress
    ? Math.round((model.planProgress.completed / model.planProgress.total) * 100)
    : 0;
  const blockedBadge = model.planProgress?.blocked
    ? '<span class="badge-blocked">BLOCKED</span>'
    : '';
  // Import mini SVG from RoadmapSvgView (simplified version)
  const miniSvg = renderMiniRoadmapSvg(model.plan);
  return `<div class="card roadmap-card">
    <div class="card-title">Active Plan ${blockedBadge}</div>
    <div class="plan-name">${escapeHtml(model.plan.title)}</div>
    <div class="progress-row">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span>${pct}%</span>
    </div>
    ${miniSvg}
    <button class="action-btn" onclick="showPlanningHub()">View Details</button>
  </div>`;
}
```

3. Add `renderMiniRoadmapSvg()` helper (simplified 40px height version):
```typescript
function renderMiniRoadmapSvg(plan: Plan): string {
  const phases = plan.phases;
  if (phases.length === 0) return '';
  const total = phases.length;
  const segWidth = 100 / total;
  const rects = phases.map((p, i) => {
    const fill = p.status === 'completed' ? 'var(--vscode-charts-green)'
      : p.status === 'active' ? 'var(--vscode-charts-blue)'
      : p.status === 'blocked' ? 'var(--vscode-charts-red)'
      : 'var(--vscode-disabledForeground)';
    return `<rect x="${i * segWidth}%" width="${segWidth - 1}%" height="20" fill="${fill}" rx="2"/>`;
  }).join('');
  return `<svg class="mini-roadmap" viewBox="0 0 100 24" style="width:100%;height:24px;margin:8px 0;">${rects}</svg>`;
}
```

4. Add `showPlanningHub()` to script section and message handler

5. Add card to cards array (insert after Trust card):
```typescript
const cards = [
  renderSentinelCard(model),
  renderTrustCard(model),
  renderRoadmapCard(model),  // NEW
  renderL3Card(model),
  renderActionsCard(),
  renderMetricsCard(model),
].join('');
```

**DashboardPanel.ts**:

1. Add PlanManager import and field:
```typescript
import { PlanManager } from '../../qorelogic/planning/PlanManager';
private planManager?: PlanManager;
```

2. Add setter method:
```typescript
setPlanManager(pm: PlanManager): void {
  this.planManager = pm;
}
```

3. Update `getHtmlContent()` to include plan data:
```typescript
const plan = this.planManager?.getActivePlan() ?? null;
const planProgress = plan ? this.planManager?.getPlanProgress(plan.id) ?? null : null;

return renderDashboardTemplate({
  // existing fields...
  plan,
  planProgress,
});
```

4. Add message handler case:
```typescript
case 'showPlanningHub':
  vscode.commands.executeCommand('failsafe.showRoadmapWindow');
  break;
```

### Unit Tests

- `test/dashboard.test.ts` - Verify renderRoadmapCard returns valid HTML with/without plan
- `test/dashboard.test.ts` - Verify mini SVG renders correct segment count

---

## Phase 2: Enhance Tooltip Visibility

### Affected Files

- `shared/components/Tooltip.ts` - Enhance tooltip styling for better visibility
- `genesis/panels/templates/DashboardTemplate.ts` - Add more tooltips to key metrics

### Changes

**Tooltip.ts**:

1. Update `TOOLTIP_STYLES` for better visibility:
```typescript
export const TOOLTIP_STYLES = `
[data-tooltip] {
  position: relative;
  cursor: help;
  border-bottom: 1px dotted var(--vscode-descriptionForeground);
}
[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 12px;
  background: var(--vscode-editorHoverWidget-background);
  border: 1px solid var(--vscode-editorHoverWidget-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--vscode-editorHoverWidget-foreground);
  white-space: nowrap;
  max-width: 300px;
  white-space: normal;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  animation: tooltipFade 0.15s ease-out;
}
[data-tooltip]:hover::before {
  content: '';
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--vscode-editorHoverWidget-border);
  z-index: 1001;
}
@keyframes tooltipFade {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;
```

**DashboardTemplate.ts**:

2. Add tooltips to additional metrics not yet covered:
```typescript
// In renderSentinelCard - add to Uptime and Events Processed
<span class="metric-label" ${tooltipAttrs(HELP_TEXT.filesWatched)}>Files Watched</span>
<span class="metric-label" ${tooltipAttrs(HELP_TEXT.queueDepth)}>Queue Depth</span>

// In renderTrustCard - add to Quarantined
<span class="metric-label" ${tooltipAttrs('Agents isolated due to trust violations or suspicious behavior')}>Quarantined</span>
```

3. Add new HELP_TEXT entries to InfoHint.ts:
```typescript
eventsProcessed: 'Total file change events processed since Sentinel started.',
uptime: 'Time elapsed since Sentinel daemon was activated.',
quarantined: 'Agents isolated due to trust violations or suspicious behavior.',
planProgress: 'Percentage of plan phases completed. Blocked phases are excluded from count.',
```

### Unit Tests

- `test/tooltip.test.ts` - Verify tooltip CSS includes animation keyframes
- `test/infohint.test.ts` - Verify all HELP_TEXT keys are defined

---

## Phase 3: Wire PlanManager to DashboardPanel

### Affected Files

- `genesis/GenesisManager.ts` - Pass PlanManager to DashboardPanel
- `extension/main.ts` - Ensure PlanManager is set before Dashboard opens

### Changes

**GenesisManager.ts**:

1. Update `showDashboard()` to pass PlanManager:
```typescript
showDashboard(): void {
  if (this.dashboardPanel) {
    this.dashboardPanel.reveal();
  } else {
    this.dashboardPanel = DashboardPanel.createOrShow(
      this.context.extensionUri,
      this.sentinel,
      this.qorelogic,
      this.eventBus
    );
    // Wire up PlanManager if available
    if (this.planManager) {
      this.dashboardPanel.setPlanManager(this.planManager);
    }
  }
}
```

2. Update existing DashboardPanel when PlanManager is set:
```typescript
setPlanManager(planManager: PlanManager): void {
  this.planManager = planManager;
  // Update existing dashboard if open
  if (this.dashboardPanel) {
    this.dashboardPanel.setPlanManager(planManager);
  }
}
```

### Unit Tests

- `test/genesisManager.test.ts` - Verify Dashboard receives PlanManager when set

---

---

## Phase 4: Fix Quick Actions Not Working

### Affected Files

- `genesis/panels/templates/DashboardTemplate.ts` - Verify Quick Actions wiring
- `genesis/panels/DashboardPanel.ts` - Verify message handlers exist

### Changes

**Problem Analysis**: Quick Actions buttons call JS functions like `auditFile()`, `showGraph()`, etc. but the message handlers may be missing or mismatched.

**DashboardTemplate.ts** - Verify script section has all functions:
```typescript
<script nonce="{{NONCE}}">
    const vscode = acquireVsCodeApi();
    function auditFile() { vscode.postMessage({ command: 'auditFile' }); }
    function showGraph() { vscode.postMessage({ command: 'showGraph' }); }
    function showLedger() { vscode.postMessage({ command: 'showLedger' }); }
    function focusCortex() { vscode.postMessage({ command: 'focusCortex' }); }
    function showL3Queue() { vscode.postMessage({ command: 'showL3Queue' }); }
    function showPlanningHub() { vscode.postMessage({ command: 'showPlanningHub' }); }
</script>
```

**DashboardPanel.ts** - Verify all handlers in `setupMessageHandlers()`:
```typescript
private setupMessageHandlers(): void {
  this.panel.webview.onDidReceiveMessage((message) => {
    switch (message.command) {
      case 'auditFile':
        vscode.commands.executeCommand('failsafe.auditFile');
        break;
      case 'showGraph':
        vscode.commands.executeCommand('failsafe.showLivingGraph');
        break;
      case 'showLedger':
        vscode.commands.executeCommand('failsafe.viewLedger');
        break;
      case 'focusCortex':
        vscode.commands.executeCommand('failsafe.focusCortex');
        break;
      case 'showL3Queue':
        vscode.commands.executeCommand('failsafe.approveL3');
        break;
      case 'showPlanningHub':
        vscode.commands.executeCommand('failsafe.showRoadmapWindow');
        break;
    }
  }, null, this.disposables);
}
```

**Remove obsolete handlers** (pauseGovernance/resumeGovernance already removed):
- Verify no dead code references

### Unit Tests

- `test/dashboard.test.ts` - Mock postMessage and verify handler dispatch

---

## Summary

| Phase | Files Modified | Lines Added | Lines Removed |
|-------|----------------|-------------|---------------|
| 1 | 2 | ~60 | 0 |
| 2 | 2 | ~40 | ~15 |
| 3 | 1 | ~10 | 0 |
| 4 | 2 | ~5 | ~5 |
| **Total** | **5** | **~115** | **~20** |

**Section 4 Razor Compliance**:
- DashboardTemplate.ts: ~192 + 60 = ~252 lines (CAUTION - may need extraction)
- If exceeds 250, extract `renderRoadmapCard` and `renderMiniRoadmapSvg` to separate file

---

_Plan follows Simple Made Easy principles: composable card functions, value-oriented view model, declarative template rendering._
