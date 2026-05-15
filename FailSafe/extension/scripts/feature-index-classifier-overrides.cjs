#!/usr/bin/env node
// FEATURE_INDEX baseline audit — manual override authority.
//
// Phase 62 of plan-qor-phase62-item-b-sweep-followups.md.
// Sibling of feature-index-classifier.cjs; carries the operator-authoritative
// MANUAL_OVERRIDES table and applyManualOverrides applier extracted from the
// classifier per Section 4 file-size cap.
//
// E2 + E4 manual override authority. Frozen lookup table keyed by entryId.
// Phase 3 of plan-feature-index-baseline-audit.md (Entry #302) reviewed each
// ambiguous entry under SG-035 and recorded a final_status. The table holds
// BOTH demotion overrides (E2: status:'unverified', overriding
// classifier-functional verdict on presence-only specs) AND promotion
// overrides (E4: status:'verified', overriding classifier-ambiguous verdict
// on functionally-correct tests using project-internal assertion shapes the
// heuristic does not recognize). The override is always operator-authoritative:
// applyManualOverrides() is the LAST step in the per-entry pipeline so
// classifier verdicts are advisory once an override is present. Operator must
// explicitly retest under E5+ to revise any override.
//
// Phase 62 Phase 2 (applied below): FX128 and FX359 removed as redundant per
// the E7 staleness detector's findings (classifier produces the same verdict
// without the override; the override was dead authority).

'use strict';

const MANUAL_OVERRIDES = Object.freeze({
  FX145: { status: 'unverified', reason: 'Phase 3: ui/monitor-shield-progression.spec.ts covers UI shell, not FailSafeSidebarProvider registration' },
  FX173: { status: 'unverified', reason: 'Phase 3: ui/popout-ui.spec.ts covers HTML shell, not failsafe.openPlannerHub command wiring' },
  FX174: { status: 'unverified', reason: 'Phase 3: ui/compact-ui.spec.ts covers HTML shell, not failsafe.openPlannerHubEditor command wiring' },
  FX165: { status: 'verified', reason: 'Phase 3 (Entry #302): roadmap/tickers-xss.test.ts directly invokes updateTickers() with hostile sentinelStatus.mode and asserts escaped DOM. Classifier heuristic does not recognize the assertion shape; override codifies operator review.' },
  FX243: { status: 'verified', reason: 'Phase 3 (Entry #302): roadmap/voice-settings-multilingual-xss.test.ts directly invokes renderMultilingualRows() and asserts escaped output. Classifier heuristic does not recognize the assertion shape; override codifies operator review.' },
  FX274: { status: 'verified', reason: 'Phase 3 (Entry #302): roadmap/AgentCoverageRoute.test.ts directly invokes AgentCoverageRoute.render() with landscape fixtures and asserts dashboard sections. Classifier heuristic does not recognize the assertion shape; override codifies operator review.' },
  // E8 (B Phase 2 sweep, 2026-05-09): promotion overrides for entries with documented cross-reference coverage in FEATURE_INDEX Notes column. Each cites a specific FX with case count proving downstream coverage.
  FX133: { status: 'verified', reason: 'B sweep: extension/scaffold-callback-ordering.test.ts + roadmap/install-skills-card.test.ts (FX234) source-grep confirms skills.install.progress + skills.install.complete event broadcast in bootstrapServers.ts callbacks; UI consumer covered.' },
  FX140: { status: 'verified', reason: 'B sweep: ws.broadcast generic mechanism — wsBroadcasts capture across extension/marketplace-route.test.ts + brainstorm-route + actions-route + checkpoint-route + agent-api-route proves broadcast emission for all action endpoints.' },
  FX141: { status: 'verified', reason: 'B sweep: sentinel.verdict event emission tested via FX342 VerdictRouter.test.ts (5 cases verifying eventBus.emit) + FX346 VerdictEngine generateVerdict produces dispatched verdicts.' },
  FX142: { status: 'verified', reason: 'B sweep: hub fanout to ws + EventBus emission tested via FX305 PromptTransparency.test.ts (15 cases) — all 4 event types flow through bus to subscribers.' },
  FX152: { status: 'verified', reason: 'B sweep: VETO surface tested via FX299 GovernanceStatusBar (4 PULSE/PASS/VETO/SEALED color cases) + Axiom enforcers BLOCK verdict (FX291-FX293, 8 cases) + VerdictEngine BLOCK/ESCALATE/WARN decisions (FX346, 19 cases).' },
  FX172: { status: 'verified', reason: 'B sweep: RiskManager (FX328 15 cases) backs the renderer; HTTP CRUD surface via transparency-risk-route (FX111-114, 14 cases). Renderer is presentation over verified data layer.' },
  FX175: { status: 'verified', reason: 'B sweep: Operations actions (FX183) drive the Overview tab; monitor-render tests verify SHIELD progression rendering. Overview is presentation aggregating verified action + status streams.' },
  FX178: { status: 'verified', reason: 'B sweep: same as FX172 — renderer is presentation over verified RiskManager (FX328) + risk-route (FX111-114) data surface.' },
  FX184: { status: 'verified', reason: 'B sweep: Verdict-color mapping covered by FX299 GovernanceStatusBar (PULSE-yellow, PASS-green, VETO-red, SEALED-blue, 8 cases). Mission strip is presentation over status verdict data layer.' },
  FX212: { status: 'verified', reason: 'B sweep: Server-side BrainstormService (FX446, 15 cases) + brainstorm-route HTTP surface (17 cases) cover the orchestration core. Orchestrator IS the BrainstormService class plus its route bindings.' },
  FX215: { status: 'verified', reason: 'B sweep: BrainstormCanvas integration with ForceGraph (3 cases) + brainstorm-graph data layer (17 cases). Visualizer is the canvas+graph composition.' },
  FX250: { status: 'verified', reason: 'B sweep: PolicyEngine.classifyRisk produces L1/L2/L3 covered in FX297; risk register severity scale covered in FX328 getRisksBySeverity.' },
  FX251: { status: 'verified', reason: 'B sweep: PolicyEngine.classifyRisk consumes risk grading policy (FX297); RiskManager updateRisk allows severity override per record (FX328).' },
  FX379: { status: 'verified', reason: 'B sweep: covered via FX093 marketplace install (POST /api/marketplace/install/:id returns 64-char hex nonce; /confirm validates one-time-use; mismatched nonce rejected) + FX302 NonceResolver replay guard with consumed nonce.' },
  FX403: { status: 'verified', reason: 'B sweep: Shadow Genome data layer fully tested (FX329 + FX330 + FX331, 30+ cases). Debugger panel is presentation over verified data layer.' },
  FX423: { status: 'verified', reason: 'B sweep: RiskManager fully tested (FX328: 15 cases create/update/delete/filters/summary/persistence); Risk register CRUD HTTP surface covered (FX111-FX114 transparency-risk-route, 14 cases). Panel is presentation over verified data layer.' },
  FX431: { status: 'verified', reason: 'B sweep: explicit duplicate of FX343 (HeuristicEngine, 5 cases) + FX348 (DEFAULT_PATTERNS catalog, 11 cases).' },
  FX468: { status: 'verified', reason: 'B sweep: Mode-change audit (FX263) directly exercises governance bootstrap via registerAdvancedCommands; Axiom enforcers + ApproverPipeline + IntentHistoryLog all individually tested.' },
  FX472: { status: 'verified', reason: 'B sweep: Sentinel subsystem fully tested (HeuristicEngine + VerdictEngine + ExistenceEngine + ArchitectureEngine + VerdictRouter + AgentRunRecorder, 70+ cases combined).' },
  FX473: { status: 'verified', reason: 'B sweep: ConsoleServer + all routes (marketplace/brainstorm/actions/adapter/agent-api/checkpoint/etc.) functionally tested with broadcast capture. ~150+ HTTP route cases exercise bootstrap output.' },
});

// Applies the MANUAL_OVERRIDES table as the last step in the per-entry
// pipeline. If the entry's id appears in the table, the classifier verdict is
// overridden and `manualOverride: true` + reason are attached. Entries not in
// the table pass through unchanged.
function applyManualOverrides(entry) {
  const override = MANUAL_OVERRIDES[entry.entryId];
  if (!override) return entry;
  return {
  ...entry,
  suggestedStatus: override.status,
  manualOverride: true,
  manualOverrideReason: override.reason,
  };
}

module.exports = { MANUAL_OVERRIDES, applyManualOverrides };
