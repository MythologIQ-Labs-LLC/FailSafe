# FailSafe UI Component Manifest

**Version**: v3.0.2 (Dashboard Remediation)
**Last Updated**: 2026-02-06

---

## Overview

This document catalogs all UI components in the FailSafe extension, their current status, and planned enhancements.

---

## Panel Components

### 1. DashboardPanel (`genesis/panels/DashboardPanel.ts`)

**Status**: ACTIVE - Needs Enhancement
**Template**: `genesis/panels/templates/DashboardTemplate.ts`
**Command**: `failsafe.showDashboard` (Ctrl+Alt+F)

**Current Cards**:
| Card | Description | Tooltips | Status |
|------|-------------|----------|--------|
| Sentinel Status | Mode, Operational, Uptime, Files, Queue, LLM, Last Verdict | ✅ 3 tooltips | Working |
| QoreLogic Trust | Agents, Avg Trust, Trust Bar, Quarantined, Stages | ✅ 2 tooltips | Working |
| L3 Approval Queue | Pending approvals, Review button | ✅ 1 tooltip | Working |
| Quick Actions | Audit, Graph, Ledger, Cortex buttons | ❌ None | **NOT WORKING** |
| Evaluation Metrics | Novelty, Confidence, Cache stats | ✅ 5 tooltips | Working |

**Missing**:
- [ ] Roadmap Mini-View (B37)
- [ ] Quick Actions handler wiring (B40)

---

### 2. PlanningHubPanel (`genesis/panels/PlanningHubPanel.ts`)

**Status**: ACTIVE - Full Featured
**Template**: `genesis/panels/templates/PlanningHubTemplate.ts`
**Command**: `failsafe.showRoadmapWindow` (Ctrl+Alt+P)

**Features**:
| Feature | Component | Status |
|---------|-----------|--------|
| Roadmap SVG View | `RoadmapSvgView.ts` | ✅ Enhanced (160px) |
| Kanban View | `KanbanView.ts` | ✅ 4-column layout |
| Timeline View | `TimelineView.ts` | ✅ With milestones |
| Blocker Management | Inline actions | ✅ Request/Detour/Resolve |
| Phase Grid | Status cards | ✅ Color-coded |
| Sentinel Sidebar | Status metrics | ✅ With tooltips |
| Trust Sidebar | Agent summary | ✅ With tooltips |
| L3 Sidebar | Quick queue | ✅ Review button |
| Verdicts Sidebar | Recent decisions | ✅ Color-coded |
| Quick Actions | Command buttons | ✅ Working |

---

### 3. AnalyticsDashboardPanel (`genesis/panels/AnalyticsDashboardPanel.ts`)

**Status**: ACTIVE - v3.0.0
**Command**: `failsafe.showAnalytics` (Ctrl+Alt+T)

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| Token Tracking | Session token usage | ✅ |
| Cost Estimation | Model pricing calc | ✅ |
| Efficiency Metrics | Tokens saved by FailSafe | ✅ |
| Historical Charts | Trend visualization | ✅ |

---

### 4. LivingGraphPanel (`genesis/panels/LivingGraphPanel.ts`)

**Status**: ACTIVE
**Command**: `failsafe.showLivingGraph`

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| D3 Visualization | Force-directed graph | ✅ |
| Node States | Verified/Warning/Blocked/Pending | ✅ |
| Risk Grades | L1/L2/L3 coloring | ✅ |

---

### 5. LedgerViewerPanel (`genesis/panels/LedgerViewerPanel.ts`)

**Status**: ACTIVE
**Command**: `failsafe.viewLedger`

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| SOA Ledger Display | Statement of Authority entries | ✅ |
| Entry Details | Expandable rows | ✅ |

---

### 6. L3ApprovalPanel (`genesis/panels/L3ApprovalPanel.ts`)

**Status**: ACTIVE
**Command**: `failsafe.approveL3`

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| Queue List | Pending L3 approvals | ✅ |
| Approve/Reject | Action buttons | ✅ |
| Details View | Risk assessment | ✅ |

---

## Sidebar Views

### 1. DojoViewProvider — REMOVED

**Status**: REMOVED — manifest reconciled 2026-05-22 (Educational Component, Phase 0).
`genesis/views/DojoViewProvider.ts` and `genesis/views/templates/DojoTemplate.ts` are not present in current source, and the `failsafe.dojo` view id is registered nowhere in `src/`. This entry was stale documentation drift. The "Quick Start Guide / collapsible tutorial" intent it described is superseded by the v5.2.0 Educational Component — inline contextual micro-lessons at governance moments (see `docs/EDUCATION.md`).

---

### 2. SentinelViewProvider (`genesis/views/SentinelViewProvider.ts`)

**Status**: ACTIVE
**Template**: `genesis/views/templates/SentinelTemplate.ts`
**View ID**: `failsafe.sentinel`

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| Status Display | Running/Mode/Queue | ✅ |
| Recent Verdicts | Last 5 decisions | ✅ |
| Mode Toggle | Heuristic/LLM/Hybrid | ✅ |

---

### 3. CortexStreamProvider (`genesis/views/CortexStreamProvider.ts`)

**Status**: ACTIVE
**Template**: `genesis/views/templates/CortexStreamTemplate.ts`
**View ID**: `failsafe.stream`

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| Event Log | Live event stream | ✅ |
| Category Filters | Sentinel/QoreLogic/Genesis/User/System | ✅ |
| Severity Filters | Debug/Info/Warn/Error/Critical | ✅ |
| Event Details | Expandable cards | ✅ |

---

### 4. RoadmapViewProvider (`genesis/views/RoadmapViewProvider.ts`)

**Status**: ACTIVE (Sidebar mini-view)
**View ID**: `failsafe.roadmap`

**Features**:
| Feature | Description | Status |
|---------|-------------|--------|
| Mini Roadmap | Compact SVG view | ✅ |
| Phase List | Current/Completed | ✅ |
| Open Hub Button | Links to PlanningHub | ✅ |

---

## Shared Components

### 1. Tooltip System (`shared/components/Tooltip.ts`)

**Status**: NEEDS ENHANCEMENT (B38)

**Current**:
- `tooltipAttrs(text)` - Returns `data-tooltip="text"`
- `TOOLTIP_STYLES` - CSS for hover display

**Issues**:
- Tooltips not prominent enough
- No animation/arrow indicator
- Max-width may truncate text

---

### 2. InfoHint Component (`shared/components/InfoHint.ts`)

**Status**: ACTIVE

**HELP_TEXT Constants**:
| Key | Description |
|-----|-------------|
| `sentinelMode` | Heuristic/LLM-assisted/Hybrid explanation |
| `operationalMode` | NORMAL/LEAN/SURGE/SAFE explanation |
| `filesWatched` | Files monitored count |
| `queueDepth` | Pending audits count |
| `trustStages` | CBT/KBT/IBT explanation |
| `l3Queue` | High-risk approval queue |
| `avgTrust` | Average trust score |
| `verdictDecision` | PASS/WARN/BLOCK/ESCALATE/QUARANTINE |
| `riskGrade` | L1/L2/L3 classification |
| `noveltyLevels` | Novelty tier explanation |
| `avgConfidence` | Confidence score explanation |
| `cacheHits` | Cache hit explanation |
| `cacheMisses` | Cache miss explanation |
| `cacheSizes` | Cache size explanation |
| `influenceWeight` | Trust-derived weighting |
| `trustScore` | Trust score range |
| `checkpointGovernance` | Pause/Resume explanation |

---

### 3. View Components (`genesis/components/`)

| Component | File | Description | Status |
|-----------|------|-------------|--------|
| RoadmapSvgView | `RoadmapSvgView.ts` | Enhanced SVG roadmap (160px) | ✅ |
| KanbanView | `KanbanView.ts` | 4-column kanban board | ✅ |
| TimelineView | `TimelineView.ts` | Vertical timeline with milestones | ✅ |

---

## Commands

| Command | Title | Keybinding | Handler |
|---------|-------|------------|---------|
| `failsafe.showDashboard` | Open Dashboard | Ctrl+Alt+F | GenesisManager |
| `failsafe.showLivingGraph` | Open Living Graph | - | GenesisManager |
| `failsafe.focusCortex` | Focus Cortex Omnibar | Ctrl+Alt+C | GenesisManager |
| `failsafe.sentinelStatus` | Sentinel Status | - | Commands |
| `failsafe.auditFile` | Audit Current File | Ctrl+Alt+A | Commands |
| `failsafe.viewLedger` | View SOA Ledger | - | GenesisManager |
| `failsafe.approveL3` | Review L3 Queue | - | GenesisManager |
| `failsafe.showRoadmap` | Show Roadmap | Ctrl+Alt+R | Commands |
| `failsafe.showRoadmapWindow` | Planning Window | Ctrl+Alt+P | GenesisManager |
| `failsafe.showAnalytics` | Token Analytics | Ctrl+Alt+T | GenesisManager |
| `failsafe.secureWorkspace` | Secure Workspace | - | Commands |
| `failsafe.generateFeedback` | Generate Feedback | - | FeedbackManager |
| `failsafe.viewFeedback` | View Feedback | - | FeedbackManager |
| `failsafe.exportFeedback` | Export Feedback | - | FeedbackManager |
| `failsafe.syncFramework` | Sync Multi-Agent Framework | - | Commands |

---

## Remediation Tasks (v3.0.2)

| ID | Task | Status | Plan |
|----|------|--------|------|
| B37 | Add Roadmap Mini-View to Dashboard | PENDING | Phase 1 |
| B38 | Enhance Tooltip Visibility | PENDING | Phase 2 |
| B39 | Wire PlanManager to DashboardPanel | PENDING | Phase 3 |
| B40 | Fix Quick Actions Not Working | PENDING | Phase 4 |

---

## Visual Theme

**Color Variables** (VSCode Theme):
| Variable | Usage |
|----------|-------|
| `--vscode-charts-green` | Completed, Pass, Success |
| `--vscode-charts-blue` | Active, In Progress |
| `--vscode-charts-red` | Blocked, Error, Critical |
| `--vscode-charts-orange` | Warning, Skipped, Caution |
| `--vscode-charts-purple` | Milestone markers |
| `--vscode-charts-yellow` | Pending milestone |

---

_This manifest is auto-generated and should be updated when UI components change._
