# Plan: v3.0.0 UI Consolidation & Fixes

## Open Questions

1. **Pop-out Window Limitation**: VSCode's API does not support opening external browser windows. `vscode.window.createWebviewPanel` creates editor tabs only. Options:
   - A) Accept editor panel (current behavior) but make it feel "full-screen" with proper UX
   - B) Investigate VSCode Simple Browser extension pattern (still editor-based)
   - **Recommendation**: Option A - accept VSCode limitation, optimize panel UX

2. **Sidebar Deprecation**: Should sidebar views (Dojo, Sentinel, Cortex Stream, Roadmap) be removed entirely once consolidated panel is complete, or kept for quick glance?

---

## Phase 1: Consolidated Planning Panel (Replace RoadmapPanelWindow)

### Affected Files

- `FailSafe/extension/src/genesis/panels/PlanningHubPanel.ts` - NEW (replaces RoadmapPanelWindow)
- `FailSafe/extension/src/genesis/panels/templates/PlanningHubTemplate.ts` - NEW
- `FailSafe/extension/src/genesis/GenesisManager.ts` - Update to use new panel
- `FailSafe/extension/src/extension/main.ts` - Update command registration

### Changes

**1.1 Create PlanningHubPanel.ts**

Consolidates ALL sidebar features into single full-panel view:

```typescript
// Required data sources (inject via constructor)
- SentinelDaemon (for status, verdicts)
- QoreLogicManager (for trust, L3 queue)
- PlanManager (for roadmap, blockers, milestones)
- EventBus (for live updates)

// View sections (tabbed or collapsible)
- Roadmap Visualization (graphical SVG with blockers/risks/detours)
- Kanban View (phase cards)
- Timeline View (Gantt-style)
- Sentinel Status (all metrics + tooltips from HELP_TEXT)
- Trust Summary (agents, avg trust, stages)
- L3 Queue (with inline approval actions)
- Recent Verdicts (last 5)
- Quick Actions (all wired to commands)

// Message handlers for all actions
- auditFile, showGraph, showLedger, focusCortex
- approveL3, resolveBlocker, takeDetour, requestApproval
- setViewMode (roadmap/kanban/timeline)
```

**1.2 Create PlanningHubTemplate.ts**

Template with:
- Grid layout: 2/3 roadmap visualization, 1/3 sidebar metrics
- All tooltips from `HELP_TEXT` constant
- Consistent styling with existing DashboardTemplate
- Responsive design for editor panel width

**1.3 Wire Quick Actions**

Each button posts message to extension:
```typescript
case 'auditFile':
  vscode.commands.executeCommand('failsafe.auditFile');
  break;
case 'showGraph':
  vscode.commands.executeCommand('failsafe.showLivingGraph');
  break;
// ... all actions
```

### Unit Tests

- `PlanningHubPanel.test.ts` - Verify all message handlers execute correct commands
- `PlanningHubTemplate.test.ts` - Verify template renders all sections with mock data

---

## Phase 2: Enhanced Roadmap Visualization

### Affected Files

- `FailSafe/extension/src/genesis/components/RoadmapSvgView.ts` - Major enhancement
- `FailSafe/extension/src/genesis/components/index.ts` - Update exports

### Changes

**2.1 Enlarge and Enhance SVG Roadmap**

Current: 60px height, minimal visual indicators
Target: 200px+ height, prominent visual language

```typescript
// Enhanced dimensions
const SVG_HEIGHT = 200;
const ROAD_HEIGHT = 60;
const PHASE_GAP = 4;

// Visual enhancements
- Larger phase blocks with embedded icons
- Blocker overlay: red diagonal stripes with "BLOCKED" text
- Detour path: dashed curved line showing alternate route
- Risk markers: larger triangles with severity colors + hover details
- Milestone diamonds: positioned above road at target points
- Current position: animated pulsing circle with "YOU ARE HERE" label
- Completed phases: checkmark overlay
```

**2.2 Add Detour Visualization**

When blocker has `detourPhaseId`:
```typescript
function renderDetourPath(fromPhase, toPhase, scale): string {
  // Curved dashed line from blocked phase to detour target
  return `<path d="M ${fromX} ${fromY} Q ${midX} ${controlY} ${toX} ${toY}"
    stroke="var(--vscode-charts-orange)" stroke-dasharray="4,2" fill="none"/>
    <text>Detour</text>`;
}
```

**2.3 Interactive Elements**

- Click phase to expand details
- Click blocker to show resolution options
- Click risk marker to show mitigations

### Unit Tests

- `RoadmapSvgView.test.ts` - Verify SVG output includes all visual elements for given plan state

---

## Phase 3: Automatic Checkpoint Governance (Remove Pause/Resume)

### Affected Files

- `FailSafe/extension/src/governance/CheckpointReconciler.ts` - NEW
- `FailSafe/extension/src/governance/GovernanceRouter.ts` - Add checkpoint detection
- `FailSafe/extension/src/genesis/panels/templates/DashboardTemplate.ts` - Remove Pause/Resume card
- `FailSafe/extension/package.json` - Remove pause/resume commands (keep as internal)

### Changes

**3.1 Create CheckpointReconciler.ts**

Silent background service that:

```typescript
export class CheckpointReconciler {
  private lastKnownState: WorkspaceSnapshot;
  private reconciliationInterval: NodeJS.Timeout;

  // Called automatically after governance commands complete
  createCheckpoint(): void {
    this.lastKnownState = {
      files: this.snapshotWorkspaceFiles(),
      intents: this.intentService.getActiveIntents(),
      timestamp: Date.now()
    };
  }

  // Called on file change detection or before governance resumes
  detectDrift(): DriftReport {
    const current = this.snapshotWorkspaceFiles();
    return {
      addedFiles: [...],
      modifiedFiles: [...],
      deletedFiles: [...],
      ungoverned: true // Changes made outside governance
    };
  }

  // Silently reconcile drift
  async reconcile(): Promise<void> {
    const drift = this.detectDrift();
    if (drift.ungoverned) {
      // Log drift event
      this.eventBus.emit('governance.driftDetected', drift);
      // Queue modified files for audit
      for (const file of drift.modifiedFiles) {
        await this.sentinel.auditFile(file);
      }
      // Create new checkpoint
      this.createCheckpoint();
    }
  }
}
```

**3.2 Integrate with GovernanceRouter**

```typescript
// Before any /qor-* command execution
async beforeCommand(): Promise<void> {
  await this.checkpointReconciler.reconcile();
}

// After any /qor-* command completion
afterCommand(): void {
  this.checkpointReconciler.createCheckpoint();
}
```

**3.3 Remove Manual Pause/Resume from UI**

- Remove `renderGovernanceCard()` from DashboardTemplate
- Keep commands internally (for programmatic use) but remove from package.json `commands` array
- Remove keybindings if any

### Unit Tests

- `CheckpointReconciler.test.ts` - Verify drift detection and reconciliation logic

---

## Phase 4: Cleanup & Integration

### Affected Files

- `FailSafe/extension/src/genesis/panels/RoadmapPanelWindow.ts` - DELETE (replaced by PlanningHubPanel)
- `FailSafe/extension/src/genesis/panels/AnalyticsDashboardPanel.ts` - Keep as separate panel
- `FailSafe/extension/package.json` - Update commands
- `docs/BACKLOG.md` - Update completion status

### Changes

**4.1 Delete Obsolete Files**

- Remove `RoadmapPanelWindow.ts` (replaced by `PlanningHubPanel.ts`)

**4.2 Update package.json Commands**

```json
{
  "command": "failsafe.showPlanningHub",
  "title": "FailSafe: Planning Hub"
}
```

Remove:
- `failsafe.showRoadmapWindow` (replaced)
- `failsafe.pauseGovernance` (internal only)
- `failsafe.resumeGovernance` (internal only)

**4.3 Update Keybindings**

```json
{
  "command": "failsafe.showPlanningHub",
  "key": "ctrl+alt+p",
  "mac": "cmd+alt+p"
}
```

### Unit Tests

- Integration test: Verify Planning Hub opens and displays all sections

---

## Summary

| Phase | Description | Files Changed |
|-------|-------------|---------------|
| 1 | Consolidated Planning Panel | 4 files |
| 2 | Enhanced Roadmap SVG | 2 files |
| 3 | Automatic Checkpoint Governance | 4 files |
| 4 | Cleanup & Integration | 3 files |

**Total Estimated Changes**: 13 files (4 new, 8 modified, 1 deleted)

---

_Plan follows Simple Made Easy principles: consolidation over fragmentation, automatic over manual, visual clarity over text density._
