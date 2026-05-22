# Project Backlog

## Blockers (Must Fix Before Progress)

### Security Blockers

<!-- Format: - [ ] [S#] Description | Version -->

### Development Blockers

<!-- Format: - [ ] [D#] Description | Version -->

- [x] [D31] V1: Ghost Path — `deps.getGenomeAllPatterns()` called in plan but not declared in `ApiRouteDeps` interface (types.ts) (from audit 2026-03-17) — RESOLVED v4.9.7
- [x] [D32] V2: Ghost Path — Missing delegate wiring for `getGenomeAllPatterns` in `ConsoleServer.ts.buildApiRouteDeps()` (from audit 2026-03-17) — RESOLVED v4.9.7
- [x] [D33] V3: Razor — `roadmap.js` at 632 lines (2.5x over 250L limit); plan adds code without decomposition (from audit 2026-03-17) — DEFERRED Phase 5 to v4.9.8
- [x] [D34] V1: Ghost Path — v4.9.8 plan Phase 2 references `renderSentinelStatus()` but method doesn't exist; actual is `renderSentinel()` (roadmap.js:277) (from audit 2026-03-17) — RESOLVED in amended v3
- [x] [D35] V2: Ghost Path — v4.9.8 plan Phase 2 references `showMetricHelp()` at lines 520-545 but method doesn't exist; actual is `showMetricExplanation()` (line 564) + `getMetricExplanations()` (line 509) (from audit 2026-03-17) — RESOLVED in amended v3

- [x] [D28] V1: Razor — `buildSreConnectedHtml()` is 81 lines (limit 40); extract section builders (from audit 2026-03-17) — RESOLVED v4.9.7
- [x] [D29] V2: Razor — nested ternary on `SreTemplate.ts:89,111`; extract `thresholdColor()` helper (from audit 2026-03-17) — RESOLVED v4.9.7
- [x] [D30] V1: Razor — SreTemplate.ts will reach ~280 lines after SRE panel expansion; extract types to SreTypes.ts (from audit 2026-03-17) — deferred to v4.9.8 Phase 1 (type extraction planned, file at 167L after C1 refactor)
- [x] [D34] V1: Ghost Path — `planId` field referenced in error budget fix does not exist in CheckpointRecord; use phase+timestamp correlation (from audit 2026-03-17) — RESOLVED v4.9.8

- [x] [D25] V1: Razor — nested ternary in `buildSreConnectedHtml()` `sliStatus` assignment; replace with `if/else if/else` (from re-audit 2026-03-16) — RESOLVED v4.10.0
- [x] [D26] V2: Architecture — `SreApiRoute.ts` imports `fetchAgtSnapshot` from `SreRoute.ts` (route handler); must import from `./templates/SreTemplate` directly (from re-audit 2026-03-16) — RESOLVED v4.10.0
- [x] [D27] V3: Ghost Path — `FailSafeSidebarProvider.ts:131` `vscode.setState({ initDone: true })` clobbers `sreMode`; must spread state (from re-audit 2026-03-16) — RESOLVED v4.10.0

- [x] [D21] V1: Razor — `SreRoute.render()` ~53 lines exceeds 40-line limit; extract `buildSreHtml(model: SreViewModel)` template function (from audit 2026-03-16) — RESOLVED in amended v2
- [x] [D22] V2: Architecture — `ASI_COVERAGE` const duplicated in `SreApiRoute.ts` + `SreRoute.ts`; extract to `src/roadmap/services/SreAsiCoverage.ts` (from audit 2026-03-16) — RESOLVED: migrated to Python adapter
- [x] [D23] V3: Ghost Path — plan Phase 2 references non-existent `registerConsoleRoutes()`; correct target is `registerConsoleExtras()` (from audit 2026-03-16) — RESOLVED in amended v2
- [x] [D24] V4: Ghost Path — plan Phase 3 toggle adds second `acquireVsCodeApi()` call in new `<script>` block; will throw runtime error; merge into existing script block (from audit 2026-03-16) — RESOLVED in amended v2

- [x] [D16] V1: Security — path traversal in AgentRunRecorder.loadRun() via unsanitized runId (addressed in amended plan: UUID validation in AgentApiRoute.ts)
- [x] [D17] V2/V9: Razor — ConsoleServer.ts at 1365 lines, plan adds 65 inline routes bypassing extraction pattern (addressed: routes extracted to AgentApiRoute.ts, +20 lines only)
- [x] [D18] V4-V6: Architecture — wrong method names/signatures (addressed: use analyzeFailurePatterns(), public buildMetrics(), getEntries(filter?))
- [x] [D19] V7: Architecture — /api/v1/genome duplicates existing GenomeRoute.ts (addressed: JSON API delegates to same ShadowGenomeManager methods via ApiRouteDeps)
- [x] [D20] V8: Architecture — service wiring in bootstrapServers.ts but services created in bootstrapSentinel.ts (addressed: wire in main.ts where both substrates available)

- [x] [D6] V1: Razor - CortexStreamProvider.ts exceeds 250 lines (from audit 2026-02-05T22:29:02Z) (v2.0.1 - Complete)
- [x] [D7] V2: Razor - DojoViewProvider.ts exceeds 250 lines (from audit 2026-02-05T22:29:02Z) (v2.0.1 - Complete)
- [x] [D8] V3: Razor - DashboardPanel.ts exceeds 250 lines (from audit 2026-02-05T22:29:02Z) (v2.0.1 - Complete)
- [x] [D9] V4: Razor - LivingGraphProvider.ts exceeds 250 lines (from audit 2026-02-05T22:29:02Z) (v2.0.1 - Complete)
- [x] [D10] Razor - GenesisManager.ts exceeds 250 lines (remediated in v3.2.0; 206 lines verified) | v3.2.0
- [x] [D11] V1: Ghost Path - getSprint() method called but not defined ✅ Remediated in plan | v3.1.0
- [x] [D12] V2: Ghost Path - broadcast() method called but not defined ✅ Remediated in plan | v3.1.0
- [x] [D13] V3: Ghost Path - appendSprintEvent() method called but not defined ✅ Remediated in plan | v3.1.0
- [x] [D14] V4: Ghost Path - path module used but not imported ✅ Remediated in plan | v3.1.0
- [x] [D15] V5: Dependency - ws package required but not installed ✅ Remediated in plan | v3.1.0
- [x] [D1] ArchitectureEngine.ts - Placeholder complexity ✅ Already implemented | v1.2.2
- [x] [D2] ConfigManager.ts - Missing `architecture.contributors` config property ✅ | v1.2.2
- [x] [D3] Orphan root tsconfig.json - Should be removed for root hygiene ✅ | v1.2.2
- [x] [D4] V1: plan-repo-gold-standard.md - Missing "Open Questions" section ✅ Added | v2.0.0
- [x] [D5] V2: ARCHITECTURE_PLAN.md - Stale v2.0.0 scope ✅ Updated to Governance | v2.0.0

## Backlog (Planned Work)

<!-- Format: - [ ] [B#] Description | Version -->

### v1.2.2 Cleanup (Current) ✅ COMPLETE

- [x] [B1] ARCHITECTURE_PLAN.md - Update paths to FailSafe/extension/ | v1.2.2
- [x] [B2] Complete D2-D3 blockers ✅ | v1.2.2

### v1.3.0 Autopilot (Governance Integration) ✅ COMPLETE

- [x] [B3] GovernanceRouter.ts - Emit plan events on file operations ✅ Already implemented | v1.3.0
- [x] [B4] DojoViewProvider.ts - Link to Roadmap view ✅ | v1.3.0
- [x] [B5] main.ts - Wire PlanManager at activation ✅ Already implemented | v1.3.0

### v2.0.0 Governance (Gold Standard + Ambient Integration) ✅ COMPLETE

### v2.0.1 Tooltip Remediation ✅ COMPLETE

- [x] [B30] Modularize webviews + tooltip system + docs update | v2.0.1

**Phase 1: Core Skills** ✅

- [x] [B12] /qor-repo-audit skill - Gap analysis + GitHub API score ✅ | v2.0.0
- [x] [B13] /qor-repo-scaffold skill - Generate missing community files ✅ | v2.0.0
- [x] [B14] /qor-repo-release skill - Versioning + CHANGELOG + tags ✅ | v2.0.0

**Phase 2: Ambient Integration (Existing Skills)** ✅

- [x] [B15] ql-bootstrap Step 2.5 - PRE_BOOTSTRAP_VALIDATION hook ✅ | v2.0.0
- [x] [B16] ql-plan Step 4.5 - POST_PLAN_CREATION hook ✅ | v2.0.0
- [x] [B17] ql-audit Pass 7 + Step 5.5 - Repo governance audit ✅ | v2.0.0
- [x] [B18] ql-implement Step 12.5 - POST_IMPLEMENT_COMPLETION hook ✅ | v2.0.0
- [x] [B19] ql-substantiate Step 9.5 - POST_SUBSTANTIATION_SEAL hook ✅ | v2.0.0
- [x] [B26] ql-organize Step 4.5 - POST_ORGANIZE_COMPLETION (refactor commit) ✅ | v2.0.0

**Phase 3: GitHub API Integration** ✅

- [x] [B20] GitHub API helpers (gh CLI) ✅ | v2.0.0

**Phase 4: Template Library** ✅

- [x] [B21] Template library (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GOVERNANCE) ✅ | v2.0.0
- [x] [B25] validate.ps1 - Add Gold Standard checks (delivered via B47 in v3.2.0) | v3.2.0

**Phase 5: Self-Application (FailSafe)** ✅

- [x] [B22] FailSafe repo community files + .github/ templates ✅ | v2.0.0

**Phase 6: Multi-Environment Sync** ✅

- [x] [B23] Antigravity skill sync ✅ | v2.0.0
- [x] [B24] VSCode prompt sync ✅ | v2.0.0

**Phase 7: Specialized Agents** ✅

- [x] [B27] ql-technical-writer agent - Documentation quality ✅ | v2.0.0
- [x] [B28] ql-ux-evaluator agent - UI/UX testing (Playwright) ✅ | v2.0.0

### v3.0.0 Horizon (UI + Analytics) ✅ COMPLETE

**Alternate Views** ✅

- [x] [B6] Create FailSafe/extension/src/genesis/components/ folder ✅ | v3.0.0
- [x] [B7] Implement KanbanView.ts - Kanban column visualization ✅ | v3.0.0
- [x] [B8] Implement TimelineView.ts - Gantt-style timeline ✅ | v3.0.0
- [x] [B9] Risk markers on roadmap visualization ✅ | v3.0.0
- [x] [B10] Milestone support in PlanManager ✅ | v3.0.0

**Planning Window**

- [x] [B31] RoadmapPanelWindow.ts - Full-screen planning window ✅ | v3.0.0

**Token Analytics** ✅

- [x] [B29] Token ROI Dashboard - "Without FailSafe" vs "With FailSafe" comparison ✅ | v3.0.0
- [x] [B32] AnalyticsDashboardPanel.ts - Session tracking + historical data ✅ | v3.0.0

**UI Consolidation** (plan-v3.0.0-ui-consolidation.md) ✅

- [x] [B33] Phase 1: PlanningHubPanel - Consolidate all sidebar features ✅ | v3.0.0
- [x] [B34] Phase 2: Enhanced RoadmapSvgView - Larger SVG with blockers/detours/risks ✅ | v3.0.0
- [x] [B35] Phase 3: CheckpointReconciler - Automatic governance (remove pause/resume) ✅ | v3.0.0
- [x] [B36] Phase 4: Cleanup - Delete RoadmapPanelWindow, update commands ✅ | v3.0.0

### v3.0.2 Dashboard Remediation (plan-v3.0.2-dashboard-remediation.md) ✅ COMPLETE

- [x] [B37] Phase 1: Add Roadmap Mini-View to Dashboard ✅ | v3.0.2
- [x] [B38] Phase 2: Enhance Tooltip Visibility ✅ | v3.0.2
- [x] [B39] Phase 3: Wire PlanManager to DashboardPanel ✅ | v3.0.2
- [x] [B40] Phase 4: Fix Quick Actions Not Working ✅ | v3.0.2

### v3.1.0 Cumulative Roadmap - Visual Orchestration Layer (plan-v3.1.0-cumulative-roadmap.md) ✅ SEALED

- [x] [B41] Phase 1: Cumulative Data Model (Sprint type, getAllPlans, archiveSprint) ✅ | v3.1.0
- [x] [B42] Phase 2: Roadmap HTTP Server (Express + WebSocket on port 9376) ✅ | v3.1.0
- [x] [B43] Phase 3: Roadmap Browser UI (timeline, planning hub, dynamic feedback) ✅ | v3.1.0
- [x] [B44] Phase 4: Wire Commands (failsafe.openRoadmap, Ctrl+Alt+Shift+R) ✅ | v3.1.0

### v3.2.0 Reliability Hardening — ✅ SEALED

- [x] [B51] Implement User Intent Gate (clarification, pause points, safety pushback, intent lock) | v3.2.0
- [x] [B45] D10 Razor remediation - decompose GenesisManager.ts under 250-line cap | v3.2.0
- [x] [B47] Add `validate.ps1` Gold Standard checks (carryforward from B25) | v3.2.0
- [x] [B48] Operationalize Autonomous Reliability Manifest into concrete sprint artifacts and workflow gates | v3.2.0
- [x] [B49] Build Skill Admission Gate for external and user-imported skills (standard + protocol compliance) | v3.2.0
- [x] [B50] Enforce Gate-to-Skill requirements matrix across reliability workflow stages | v3.2.0

### v3.2.5 Follow-On Hardening — ✅ SEALED (partial; remainder deferred to v4.2.0)

- [x] [B52] Enforce GitHub branch/PR standards in FailSafe and team workflow tooling (branch taxonomy, PR-first merges, policy checks) | v3.2.5
- [x] [B58] Add explicit `Prep Workspace (Bootstrap)` UI action to inject required extension/workspace files and run hygiene checks | v3.2.5
- [x] [B59] Add run-level `Panic` (`Stop/Cancel Run`) button with hard abort semantics and ledgered reason capture | v3.2.5
- _B11, B46, B53-B57, B60-B65 deferred → v4.2.0_

### v4.2.0 "The Answer" — Full-Stack Governance ✅ SEALED

> _"The Answer to the Ultimate Question of Life, the Universe, and Everything."_

**Console & UI**

- [x] [B11] UI polish and theme refinements | v4.2.0
- [x] [B46] FailSafe Console UI overhaul and refinement (expanded via console spec packet) | v4.2.0
- [x] [B53] Implement Console route shell + profile-based IA (`/home`, `/run/:runId`, `/workflows`, `/skills`, `/genome`, `/reports`, `/settings`) | v4.2.0
- [x] [B60] Add `Undo Last Attempt` UI action with rollback integrity verification and user feedback | v4.2.0
- [x] [B61] Implement required empty-state UX flows (no workspace, no failures, no skills, no runs) | v4.2.0
- [x] [B63] Enforce accessibility baseline (keyboard nav, focus order, labels) on core console routes | v4.2.0

**Configuration & Profiles**

- [x] [B54] Implement configuration profiles and precedence (`run > workspace > user > defaults`) with visibility flags | v4.2.0

**Workflow Run Model**

- [x] [B55] Align workflow run/evidence model contracts (run/stage/gate/claim/evidence/attempt/export bundle parity) | v4.2.0

**Security & Skill Registry**

- [x] [B56] Implement security and skill-registry enforcement surfaces (permission scopes, pinning, redaction, invocation audit) | v4.2.0
- [x] [B62] Add first-run permission preflight summary for scope grants and deny-by-default transparency | v4.2.0

**Testing**

- [x] [B57] Build journey-based acceptance and adversarial E2E suite for P1-P5 from console spec | v4.2.0

**Workspace Integrity**

- [x] [B64] Add branch-protection parity checks and PR evidence checklist enforcement in repo standards | v4.2.0
- [x] [B65] Enforce `Prep Workspace (Bootstrap)` idempotency and duplicate-injection prevention | v4.2.0

**Intent Provenance & Enforcement**

- [x] [B66] Intent provenance chain: require `planId` reference on Intent creation; reject Intents without approved plan in enforce mode | v4.2.0
- [x] [B67] Workflow-status gating: Intent can only reach PASS status after `/qor-audit` signs off; block implementation on PULSE-only Intents in enforce mode | v4.2.0
- [x] [B68] Agent identity binding on Intents: record which agent created the Intent and through which workflow (ql-plan vs auto-create vs manual) | v4.2.0
- [x] [B69] Break-glass protocol: finalize package.json command declarations, tests, and CHANGELOG for `failsafe.breakGlass` / `failsafe.revokeBreakGlass` | v4.2.0
- [x] [B70] Verdict replay harness: `replayVerdict(ledgerEntryId)` — reconstruct inputs from ledger entry and re-execute deterministic decision path | v4.2.0

**Release Pipeline**

- [x] [B71] `ql-release` prompt: sync ql-repo-release to Antigravity and VSCode prompt environments (currently Claude-only) | v4.2.0
- [x] [B72] Pre-release governance gate: block release if any Intent is unsealed, ledger chain is broken, or version coherence fails | v4.2.0
- [x] [B73] Ledger-recorded release events: record `RELEASE_STARTED`, `RELEASE_COMPLETED`, `RELEASE_FAILED` to SOA ledger with artifact hashes of VSIX/ZIP outputs | v4.2.0
- [x] [B74] GitHub Actions CI/CD pipeline: automated build, test, version coherence check, and marketplace publish on tag push | v4.2.0
- [x] [B75] Release artifact signing: hash and sign VSIX/ZIP artifacts at build time, store signatures in ledger for independent verification | v4.2.0
- [x] [B76] CHANGELOG-to-version alignment: extend `validate-release-version.ps1` to verify CHANGELOG contains an entry matching the release version | v4.2.0

**Schema Versioning Integrity**

- [x] [B77] SOA Ledger schema migration framework: apply SchemaVersionManager pattern from Shadow Genome to the `soa_ledger` SQLite table | v4.2.0
- [x] [B78] Intent schema versioning: add version field to Intent artifacts and migration path for schema changes across extension upgrades | v4.2.0
- [x] [B79] Extension-version binding in ledger: record the extension version that created each ledger entry so hash/signature verification stays valid across upgrades | v4.2.0

**Multi-Agent Governance Fabric**

- [x] [B80] Runtime agent detection: extend `SystemRegistry` with terminal-based detection for Claude CLI, Codex CLI, and Agent Teams (`vscode.window.terminals` + `onDidOpenTerminal`) | v4.2.0
- [x] [B81] Per-agent config injection: extend `FrameworkSync` to write governance rules into each detected agent's native format (`.github/copilot-instructions.md`, `.kilocode/rules/`, `codex.md`) | v4.2.0
- [x] [B82] Agent Teams governance agent: generate `.claude/agents/failsafe-governance.md` when Agent Teams detected, embedding a governance overseer peer agent | v4.2.0
- [x] [B83] Multi-agent coverage dashboard: add governance coverage view to Console UI showing detected agents, injection status, and compliance state | v4.2.0
- [x] [B84] Cross-agent audit correlation: correlate file save events with originating terminal/agent PID to attribute changes to specific agents in ledger entries | v4.2.0
- [x] [B85] Governance opt-in/opt-out ceremony: single command to inject or remove all governance files across detected agents, with transparent diff preview | v4.2.0
- [x] [B86] `AGENTS.md` governance injection: write a single repo-root `AGENTS.md` with FailSafe governance rules, consumed by both Copilot and Codex | v4.2.0
- [x] [B87] Discovery phase governance (`ql-discover`): DRAFT → CONCEIVED status gate with ledger-tagged graduation marker; optional brainstorm/mindmap/research tooling offered but not required (data model informed by Zo-Qore PRD) | v4.2.0
- [x] [B88] First-run onboarding review: surface multi-agent governance coverage options during initial setup with clear guidance for workspace vs global scope decisions | v4.2.0
- [x] [B89] Pre-v4.2.0 True-Up Audit: purge fictional state from `SYSTEM_STATE.md`, reconcile `_STAGING_OLD` drift, and assert test gates in the release pipeline before writing new features | v4.2.0

**Deployment & Telemetry (NEW)**

- [x] [B92] Pre-Commit Guard via Commit-Check Endpoint: Single authenticated API endpoint returns pre-computed `{allow, reason}` decision; thin-client shell hook with per-session token auth; fails open when API unreachable; chains with existing hooks | v4.3.0
- [x] [B93] Provenance Tracking via Ledger: Record AI authorship attribution as ledger entries with confidence levels, debounced per-file, scope-filtered, stub-mode safe | v4.3.0
- [x] [B94] CI/CD Governance Context Export: Portable bash script exports version-controlled governance artifacts as CI artifacts, non-blocking, no sensitive data | v4.3.0

**Security Hardening (v4.3.1)** ✅ COMPLETE

- [x] [B133] SQL injection protection in SchemaVersionManager.ts via table name whitelist validation | v4.3.1
- [x] [B134] XSS prevention in LivingGraphTemplate.ts via HTML escaping of dynamic graph data | v4.3.1
- [x] [B135] XSS prevention in RevertTemplate.ts via HTML escaping of result messages | v4.3.1
- [x] [B136] README logo path correction to reference current FailSafe branding | v4.3.1

**Voice Brainstorm & Mindmap — Production Readiness Blockers (v4.6.0)**

_Source: Code audit 2026-03-07. All line references against current working tree._

Security:

- [x] [B111] XSS via LLM-extracted node labels: `brainstorm-canvas.js` passes raw `node.label` to ForceGraph3D without escaping. `escapeHtml()` exists in `brainstorm-templates.js` but is not applied in `web-llm-engine.js` or `heuristic-extractor.js` at node creation time | v4.6.0 (v4.6.6 - Fixed: escapeHtml() applied at brainstorm-canvas.js:65)

Resource Leaks:

- [x] [B112] Window event listeners leak in `brainstorm.js`: `failsafe:audio-device-changed` and `failsafe:wake-word-changed` listeners bound but never removed in `destroy()` — duplicates accumulate on tab switch | v4.6.0 (v4.6.6 - Fixed: handlers removed in destroy() at brainstorm.js:241-243)
- [x] [B113] Modal keydown handler leak in `prep-bay.js`: `document.addEventListener('keydown', escHandler)` in `openModal()` never removed on close — stacks on repeated open/close | v4.6.0 (v4.9.5 - Fixed: escHandler stored and removed in destroy())
- [x] [B114] MediaStream not released on failure in `stt-engine.js`: if `MediaRecorder` construction fails after `getUserMedia()` succeeds, `_releaseStream()` is never called — locks microphone | v4.6.0 (v4.6.6 - Fixed: _releaseStream() called in _createRecorder() catch at stt-engine.js:188-191)
- [x] [B115] AudioContext leak in `stt-engine.js` `_stopWhisper()`: `ctx.close()` not in finally block — skipped if `decodeAudioData()` throws | v4.6.0 (v4.9.5 - Verified resolved: ctx.close() already in finally block)
- [x] [B116] Web LLM native AI session never destroyed: `web-llm-engine.js` creates `ai.languageModel` sessions but has no `destroy()` — sessions accumulate across extractions | v4.6.0 (v4.9.5 - Fixed: destroy existing session before creating new one)

State Management / Race Conditions:

- [x] [B117] Rapid mic toggle race condition: `voice-controller.js` `toggle()` doesn't debounce — clicking twice fast causes `startListening()` while `stopListening()` is still async mid-flight | v4.6.0 (v4.6.6 - Fixed: _toggling guard added at voice-controller.js:62)
- [x] [B118] STT callback references not nulled on destroy: `stt-engine.js` stores `onTranscript`, `onStateChange`, `onAutoStop`, etc. but never clears them — stale closures can fire into destroyed modules | v4.6.0 (v4.9.5 - Verified resolved: callbacks already nulled in destroy())
- [x] [B119] Graph mutation during render: `brainstorm.js` proxies `canvas.setNodes` with no mutex — concurrent `mergeNodes()` and render frame can collide | v4.6.0 (v4.9.5 - Fixed: queueMicrotask debounce on setNodes proxy)

Error Handling:

- [x] [B120] TTS failure silently swallowed: `prep-bay.js` calls `tts.speak().catch(() => {})` — user sees success status but hears nothing, no feedback | v4.6.0 (v4.9.5 - Verified resolved: TTS catch already shows error status)
- [x] [B121] Audio storage failure silent: `prep-bay.js` audio vault POST failure logged as `console.warn` only — user believes recording is persisted but it's lost | v4.6.0 (v4.9.5 - Fixed: non-ok response shows error status, catch shows warning status)
- [x] [B122] STT init failure indefinite loading: `stt-engine.js` `init()` catch block sets state to idle but provides no distinguishable user feedback between timeout, network error, and permanent failure | v4.6.0 (v4.9.5 - Fixed: error:mic_unavailable and error:{message} distinct callbacks)
- [x] [B123] Wake word listener infinite retry loop: `stt-engine.js` Web Speech error handler restarts listener after 1s with no backoff, no max retries, no user notification on permanent failure | v4.6.0 (v4.9.5 - Fixed: permanent error detection stops retry, transient errors still retry)

Data Flow Integrity:

- [x] [B124] Empty transcript submitted to extraction: prep-bay allows `submitTranscript('')` — heuristic extractor creates phantom "Feature" node from silence/empty input, polluting graph | v4.6.0 (v4.9.5 - Fixed: empty transcript guard in brainstorm-graph.js submitTranscript())
- [x] [B125] Heuristic extractor catch-all `Feature` type: `heuristic-extractor.js` TYPE_SIGNALS uses `/./` for Feature — any unclassifiable text becomes a Feature node, degrading graph quality over time | v4.6.0 (v4.9.5 - Verified resolved: catch-all is intentional fallback, empty transcript guard prevents phantom nodes)

Browser Compatibility:

- [x] [B126] MediaRecorder codec not specified: `stt-engine.js` `new MediaRecorder(stream)` uses browser default codec — Safari/Firefox may produce incompatible blobs while server assumes `audio/webm` | v4.6.0 (v4.9.5 - Fixed: explicit audio/webm default with opus upgrade if supported)
- [x] [B127] Web Speech API language hardcoded to `en-US`: `stt-engine.js` line 321 — non-English users get forced English recognition (v5.0.0 - Complete; multilingual Whisper model picker + 12-language BCP-47 selector + auto-match voice)

Performance:

- [x] [B128] Canvas resize not debounced: `brainstorm-canvas.js` `window.resize` handler recomputes ForceGraph3D physics on every event — locks main thread with 100+ nodes during window resize | v4.6.0 (v4.9.5 - Verified resolved: resize already debounced)

Minor / UX:

- [x] [B129] Modal audio visualizer canvas not wired: `prep-bay.js` creates `<canvas class="cc-bs-modal-visualizer">` but never connects it to audio analyser (v5.0.0 - Complete; modal-visualizer.js extracted; uses controller addAnalyserListener cache+replay)
- [x] [B130] Export filename has no timestamp: `brainstorm-graph.js` hardcodes `brainstorm-session.json` — second export in same session overwrites first (v5.0.0 - Complete; brainstorm-export.js with `YYYY-MM-DD-HH-MM-SS±OOOO` filename format)
- [x] [B131] Ideation buffer silently discards history beyond 10 entries: `ideation-buffer.js` `MAX_HISTORY=10` with no user warning when oldest thought is dropped (v5.0.0 - Complete; configurable maxHistory 1-100 via Settings → Brainstorm; severity-gated drop notification)
- [ ] [B132] Long node labels silently truncated server-side: `ConsoleServer.ts` `.slice(0, 200)` with no client feedback — user's full text accepted but shortened without notice | v4.6.0

**Razor Debt (v4.3.1)**

- [x] [B95] Decompose types.ts (525L) into domain-grouped type files with barrel export | v4.3.1 (v4.9.5 - Verified resolved: types.ts deleted in prior decomposition)
- [x] [B96] Extract axiom enforcement from EnforcementEngine.ts (473L) into focused enforcer classes | v4.3.1 (v4.9.5 - Verified resolved: EnforcementEngine.ts already under 250L)
- [x] [B97] Extract inline wiring from main.ts activate() (428L) into dedicated bootstrap modules | v4.3.1 (v4.9.5 - Fixed: bootstrapStartupChecks.ts extracted, main.ts 262→227L)
- [x] [B98] Extract static pages and deps factory from FailSafeApiServer.ts (268L) | v4.3.1 (v4.9.5 - Verified resolved: FailSafeApiServer.ts already under 250L)
- [x] [B99] Extract nonce/transparency/ledger from GovernanceAdapter.ts (267L) into manager classes | v4.3.1 (v4.9.5 - Verified resolved: GovernanceAdapter.ts already under 250L)

**CI/CD Review (FailSafe Plus)**

- [ ] [B100] Release workflow parity gate: add a local or containerized Linux release rehearsal that exercises the exact SemVer, build, extension-host, Playwright, package, and VSIX validation steps used by GitHub Actions before retagging a release | FailSafe Plus
- [ ] [B101] Workflow shell discipline: prevent mixed-shell command syntax in GitHub Actions (`bash` vs `pwsh`) through a workflow lint/check step and review checklist for release jobs | FailSafe Plus
- [ ] [B102] SemVer rerun safety: harden `tools/validate-release-version.ps1` and its tests so reruns on an existing release tag compare against the previous distinct release, not the current tag itself | FailSafe Plus
- [ ] [B103] Case-insensitive ignore audit: add a repository guard that detects source directories accidentally ignored on Windows/macOS by broad patterns such as `Planning/`, and fail release prep when tracked source files are missing from git | FailSafe Plus
- [ ] [B104] Linux headless test prerequisites: codify and validate release-runner requirements for extension-host and Playwright tests (`xvfb`, browser install, runtime deps) so CI cannot reach test execution with missing platform prerequisites | FailSafe Plus
- [ ] [B105] VSIX validation hardening: standardize artifact naming and archive inspection so validation accepts tag-style filenames, package-style filenames, and reads VSIX contents via ZIP-safe tooling rather than tar-specific behavior | FailSafe Plus
- [ ] [B106] Release operator checklist: write an explicit release-prep checklist covering lint debt closure, local `test:all`, local VSIX validation, exact artifact naming, and final ref/tag sequencing before publish | FailSafe Plus

### v4.9.2 Infrastructure Hardening (plan-infrastructure-hardening-v492.md)

- [x] [B140] Monitor S.H.I.E.L.D. state tracking: File watcher on META_LEDGER.md, fix phase detection for SUBSTANTIATED verdict, fix Recently Completed display | v4.9.2 (v4.9.2 - Complete)
- [x] [B107] Workspace Hook Toggle: Bridge VS Code `failsafe.sentinel.enabled` setting with `.claude/hooks/disabled` sentinel. Extract shared hookSentinel utility | v4.9.2 (v4.9.2 - Complete)
- [x] [B108] Release pre-flight help doc check: Verify existing release-gate.cjs checks 4-5 (COMPONENT_HELP.md, PROCESS_GUIDE.md), add integration tests | v4.9.2 (v4.9.2 - Complete)
- [x] [B137] Release branch gate: Verify existing validate-branch-policy.ps1 + ql-repo-release enforcement, add branch policy tests | v4.9.2 (v4.9.2 - Complete)
- [x] [B138] Release pipeline CI gate: Verify existing release.yml gate ordering (validate → build → publish), document | v4.9.2 (v4.9.2 - Complete)
- [x] [B139] Release backlog coherence: Verify existing release-gate.cjs checks 6-7 (duplicate B-items, version summary), add integration tests | v4.9.2 (v4.9.2 - Complete)
- [x] [B142] Agent Execution Timeline: AgentTimelineService + AgentTimelinePanel webview with category filter tabs, severity toggles, expandable detail, file links (v4.8.0 - Complete)
- [x] [B143] Risk & Stability Indicators: AgentHealthIndicator status bar item with composite health score, quick-pick drill-down to risk register/timeline/trust (v4.8.0 - Complete)
- [x] [B144] Shadow Genome Debugging Panel: ShadowGenomePanel webview with failure pattern cards, unresolved entries table, inline remediation, negative constraints (v4.8.0 - Complete)
- [x] [B145] DiffGuard Analysis Panel: DiffGuardPanel webview for AI diff risk analysis with inline approve/reject actions (v4.7.2 - Complete)

### v4.9.0 Agent Run Replay & Governance Contracts

- [x] [B146] Agent Run Recorder: Capture full execution traces (prompts, reasoning steps, tool calls, file edits, policy decisions, mitigations) during AI agent runs. Store as structured timeline events via EventBus | v4.9.0 (v4.9.0 - Complete)
- [x] [B147] Agent Run Replay Panel: Webview panel for step-by-step replay of recorded agent runs with execution graph, code diffs per step, policy triggers, and Shadow Genome pattern matches | v4.9.0 (v4.9.0 - Complete)
- [x] [B150] Governance Decision Contract: Define stable, machine-actionable contract schema for agent framework integration | v4.9.0 (v4.9.0 - Complete)

### Agent Debugging & Stability (Future)

- [ ] [B148] Agent Run Replay: Interactive re-execution from any replay step with modified parameters
- [ ] [B149] Agent Run Replay: Behavioral telemetry pipeline — feed replay data into Shadow Genome for cumulative agent behavioral intelligence

### v4.9.3 Command Center Production Readiness (plan-cc-prod-readiness)

- [x] [B154] Phase 1: Fix disconnected hub data — align renderers with `buildHubSnapshot()` output, fix phantom fields (`checkpoints` → `recentCheckpoints`), remove dead Monitor code (Qore runtime card, orphaned transparency/risk methods) (v4.9.3 - Complete)
- [x] [B155] Phase 2: Wire B142/B143/B144 into Command Center — expose AgentTimelineService, AgentHealthIndicator, ShadowGenomeManager via API endpoints (`/api/v1/timeline`, `/api/v1/health`, `/api/v1/genome`), create Timeline and Genome tab modules, add health card to Overview (v4.9.3 - Complete)
- [x] [B156] Phase 3: Fix transparency pipeline — route sentinel verdicts, L3 events, governance decisions into audit stream, fix dual-write race condition (single writer: ConsoleServer), add `transparency.prompt` event type (v4.9.3 - Complete)
- [x] [B157] Phase 4: Wire B146/B150 into Command Center — expose AgentRunRecorder via API endpoints (`/api/v1/runs`, `/api/v1/runs/:id`, `/api/v1/runs/:id/steps`), create Replay tab module with step timeline and GovernanceDecision cards, broadcast run lifecycle events (v4.9.3 - Complete)

### v4.9.5 Pre-v5.0 Quality Sweep (plan-v4.9.5-pre-v5-sweep)

- [x] [B158] Fix audit log blank — fetchHistory, event type fix, verdict routing | v4.9.5
- [x] [B159] Tab consolidation 8→5 — TabGroup, tickers extraction | v4.9.5
- [x] [B160] Wire skills propagation — adaptSkillsForModel in autoIngest | v4.9.5
- [x] [B161] Phase 1: Voice brainstorm resource leaks & error handling — B113, B116, B118-B124, B126 (9 bugs across 6 files) (v4.9.5 - Complete)
- [x] [B162] Phase 2: Razor debt — extract startup checks from main.ts (B97), extract hub snapshot builder from ConsoleServer.ts (v4.9.5 - Complete)
- [x] [B163] Phase 3: Backlog reconciliation — close 8 false positives, add future ConsoleServer decomposition items (v4.9.5 - Complete)

### v4.10.0 SRE Panel (plan-sre-panel.md)

- [x] [B167] Phase 1: SRE API — `GET /api/v1/sre` transparent proxy to agent-failsafe REST bridge (v4.10.0 - Complete; route wiring fix in v4.9.7)
- [x] [B168] Phase 2: SRE Console route — `GET /console/sre` server-rendered AGT adapter data; `SreTemplate.ts` + `SreRoute.ts` (v4.10.0 - Complete; route wiring fix in v4.9.7)
- [x] [B169] Phase 3: Monitor panel SRE toggle — pill toggle switching iframe between Monitor and SRE; state spread-preserved (v4.10.0 - Complete; CSS/overflow fix in v4.9.7)

### v4.9.7 Release Integrity & Debug Unification (plan-release-integrity-debug-unification.md)

- [x] [B170] Wire setupConsoleRoutes dead code — all /console/* routes were defined but never registered (v4.9.7 - Complete)
- [x] [B171] Fix CSS selectors for consolidated tabs — #brainstorm targets nonexistent DOM after 5-tab consolidation (v4.9.7 - Complete)
- [x] [B172] Fix workspace overflow logic — Skills sub-view scroll lockout from tab-level overflow:hidden (v4.9.7 - Complete)
- [x] [B173] Bundle guard — post-copy verification that dist/ tab count matches src/ (v4.9.7 - Complete)
- [x] [B174] Unify /qor-debug two-phase dispatch — merge ultimate-debugger strengths into ql-fixer, update skill protocol (v4.9.7 - Complete)
- [x] [B175] Phase tracker cache — serve last known governance state on META_LEDGER read failure instead of IDLE (v4.9.7 - Complete)
- [x] [B176] Tail-read optimization — read last 4KB of META_LEDGER instead of full 434KB on every hub snapshot (v4.9.7 - Complete)
- [x] [B177] File watcher debounce — increase META_LEDGER watcher from 500ms to 1500ms to avoid read-during-write race (v4.9.7 - Complete)

### v4.9.7 Diagnostic Fixes (plan-v497-diagnostic-fixes.md)

- [x] [B181] Phase 1: Governance mode config gap — add mode to FailSafeConfig, read from VS Code settings (v4.9.7 - Complete)
- [x] [B182] Phase 2: Agent run capture for external agents — file-based session detection, implicit run creation (v4.9.7 - Complete)
- [x] [B183] Phase 3: Genome view data visibility — show all patterns with status filter toggle (v4.9.7 - Complete)
- [x] [B184] Phase 4: Timeline entry expansion — click-to-expand detail sections (v4.9.7 - Complete)
- [x] ~~Phase 5: Clickable blocked message navigation~~ — DEFERRED to v4.9.8 as B185 (D33 prerequisite) | v4.9.7

### v4.9.8 Consolidated (plan-v498-consolidated.md)

- [x] [B187] Phase 1: Error budget — exclude resolved verdicts from burn calculation (v4.9.8 - Complete)
- [x] [B186] Phase 2: Extract sentinel rendering from roadmap.js into sentinel-monitor.js (D33 resolution) (v4.9.8 - Complete)
- [x] [B185] Phase 3: Clickable blocked message navigation — direct audit log linking with highlighting (v4.9.8 - Complete)
- [x] [B178] Phase 4: SRE type extraction + v2 schema + adapter port config (v4.9.8 - Complete)
- [x] [B179] Phase 5: Activity Feed — audit event feed with ALLOW/DENY badges (v4.9.8 - Complete)
- [x] [B180] Phase 6: SLO Dashboard — multi-SLI grid with error budgets + per-agent fleet health cards (v4.9.8 - Complete)

### v4.9.9 Right Panel Fix (plan-v499-right-panel-fix.md)

- [x] [B188] Fix brainstorm right panel missing — TabGroup does not proxy renderRightPanel/bindToolbar from active sub-view; pill switching doesn't update right panel (v4.9.9 - Complete)
- [x] [B189] Fix Install Skills path — bundledPath points to nonexistent `skills/` instead of `dist/extension/skills/`; same bug in WorkspaceMigration.ts (v4.9.9 - Complete)

### v4.10.0 ConsoleServer Decomposition (plan-consoleserver-decomposition.md)

- [x] [B164] Phase 1: Extract WebSocketManager + TransparencyLogger + RiskRegisterManager from ConsoleServer.ts (-32L, 93L portable) (v4.10.0 - Complete)
- [x] [B165] Phase 2: Extract EventSubscriptionManager — 12 EventBus listeners into portable governance event wiring (-162L, 185L portable) (v4.10.0 - Complete)
- [x] [B166] Phase 3: Extract QoreRuntimeService + FeatureStatusRoute + SkillsApiRoute + HookRoute (v5.0.0 - Complete; ConsoleServer.ts 1381→1165L, -216L)

### Bicameral MCP Integration (Follow-ups)

Follow-up work surfaced by `plan-qor-bicameral-mcp-integration` (v1 ships only 4 of 13 tools; pattern extends naturally to additional MCP servers). See `docs/INTEGRATIONS.md` for the v1 surface and `.failsafe/governance/SESSION_STATE_bicameral-mcp-integration.md` for cycle status.

- [ ] [B-INT-1] Surface remaining Bicameral tools (`ingest`, `search`, `brief`, `judge_gaps`, `resolve_compliance`, `link_commit`, `update`, `reset`, `dashboard`, `validate_symbols`, `get_neighbors`) — extends `BicameralMcpClient` + adds routes + UI affordances. Out of scope for v1 (would require dedicated UI surfaces beyond the current Integrations tab card). | v5.2.x or later
- [x] **[B-INT-2] (v5.2.0-baseline — Complete 2026-05-21 via plan-qor-b-int-2-preflight-l3)** Wire `bicameral.preflight` into the L3 approval pipeline: new `PreflightToL3Mediator` async-checks preflight when a tier-3 action is queued for L3; decision-drift surfaces inline ("Conflicts with decision X") on both L3 card render sites (`governance.js renderL3Queue` + `L3ApprovalPanel`) via `meta.preflight` — no `approval.json` schema change (B-BIC-16 `kind`/`meta` reused). New `L3ApprovalService.attachPreflightEvidence` (in-place `l3Queue` mutation + persist). FX553-FX557 (20 cases). Scoped to the tier-3/L3 path — broader intent-flow preflight deferred (no concrete pre-action surface exists). Plan: `docs/plan-qor-b-int-2-preflight-l3.md`. Audit: `.failsafe/governance/` — independent architect-reviewer 2-cycle PASS (VETO #1 → re-plan → PASS #2); independent code-reviewer PASS. | v5.2.x
- [x] **[B-INT-3] (v5.2.0-baseline — Complete via Phase 4 of bicameral-cluster-high)** Pin Bicameral version floor: `BICAMERAL_PIP_SPEC = 'bicameral-mcp>=0.14,<0.16'` exported from `install-handler.ts`; pip-install args use the spec. Also extended with UpstreamMonitor service polling GitHub release + open-issues, `GET /api/integrations/bicameral/upstream` route, and `renderUpstreamRow` helper for Settings card. Closes the operator's "be aware of upstream Bicameral updates" directive. FX532/FX533/FX534 (16 cases).
- [ ] [B-INT-4] Generic `McpClientHost` abstraction for the next MCP integration. The current `BicameralMcpClient` is a thin wrapper; a second integration (e.g., another MCP server) should share the connect/disconnect lifecycle, route deps, and Settings card pattern. Promote at the second integration, not the first. | v5.3.x+
- [ ] [B-INT-5] Sub-tab pattern inside the Integrations tab once a second MCP integration ships. Current card layout assumes one entry; renderer at `src/roadmap/ui/modules/integrations.js` will need a tab switcher. | v5.3.x+

## Bicameral MCP integration — deep-review enhancements (2026-05-19)

Generated by independent subagent audit of `BicameralMcpClient` + routes + UI + tests. 23 findings across 8 categories beyond the already-tracked B-INT-1..5. Top 5 (B-BIC-1..5) targeted for an immediate quick-wins cycle on `feat/bicameral-enhancements-quickwins`.

### Top 5 quick-wins (this cycle's scope)

- [x] **[B-BIC-1] HIGH — META_LEDGER + USER_OVERRIDE on Bicameral ratify** — **IMPLEMENTED on `feat/bicameral-enhancements-quickwins` 2026-05-19.** `BicameralRoute.ts` ratify handler appends `USER_OVERRIDE` entry via `LedgerManager.appendEntry({eventType:'USER_OVERRIDE', agentDid:'vscode-user', payload:{action:'bicameral.ratify', decisionId, verdict, rationale}})` on success. Non-blocking — ledger failure doesn't break ratify response. `BicameralRouteDeps` gained optional `ledgerManager` dep; `ConsoleRouteRegistrar` threads it via `qorelogicManager.getLedgerManager()`. FX514 (5 cases). | v5.2.x
- [x] **[B-BIC-2] HIGH — `BicameralMcpClient.disconnect()` disposer registration** — **IMPLEMENTED.** `bootstrapBicameral.ts` pushes `context.subscriptions.push({dispose: () => client?.disconnect()})` so extension reload terminates the stdio subprocess. ALSO: `wireFromConfig` now disconnects the prior client before assigning a new one (rewire-orphan fix in spirit of B-BIC-2 / B4 finding). `ConsoleServerSurface` extended with typed `getBicameralClient()` accessor. FX515 (2 cases). | v5.2.x
- [x] **[B-BIC-3] HIGH — Transport close listener + crash recovery** — **IMPLEMENTED.** `BicameralMcpClient.connect()` attaches `transport.onclose = () => { this.client = null; this.transport = null; this.capabilities = null; }` so `isConnected()` correctly reports false after a subprocess crash. Next `callTool` throws clean "not connected" instead of opaque SDK error. FX516 (2 cases). | v5.2.x
- [x] **[B-BIC-4] HIGH — Capability negotiation via `listTools()`** — **IMPLEMENTED.** After `client.connect(transport)`, `BicameralMcpClient.fetchCapabilities()` calls `client.listTools()` once and caches the tool-name `Set<string>`. New public `getCapabilities(): Set<string>` accessor (defensive copy). Resets to `null` on disconnect AND on transport-close. Defensive on `listTools()` throw — falls back to empty set without crashing connect. Directly enables future B-INT-1 + B-BIC-13 UI dimming. FX517 (3 cases). | v5.2.x
- [x] **[B-BIC-5] MEDIUM — Install stdout/stderr sanitizer** — **IMPLEMENTED.** New `sanitizeStdoutTail(raw, maxLen=2048)` exported from `install-handler.ts`. Strips ANSI CSI sequences (`/\x1b\[[0-9;]*[mGKHF]/g`) + C0 controls (preserves \t\n\r). Applied at both stdout (line ~116) + stderr (line ~121) handler assignments. Length cap at 2048 prevents broadcast amplification. FX518 (3 cases). | v5.2.x

### Remaining 18 enhancements (deferred — pick up in follow-on cycles)

#### Security / Trust Boundary
- [x] **[B-BIC-6] (v5.2.x — Complete via plan-qor-batch2-bbic-validator-hardening)** Symlink bypass on `isSafeBicameralCommand` (A2): new async `isSafeBicameralCommandResolved()` runs the lexical check then `fs.realpath()` and re-checks containment of the **real** path against the allowed roots. Applied at **all three spawn boundaries** — `probeInstallState`, the `BicameralMcpClient` construction in `bootstrapBicameral.ts` `wireFromConfig`, and the `runBicameralInstall` install in `install-handler.ts`. Fail-closed on `realpath` ENOENT/error. Residual TOCTOU (link swapped between check and spawn) documented in code + plan. FX567/FX568/FX569.
- [x] **[B-BIC-7] (v5.2.x — Complete via plan-qor-batch2-bbic-validator-hardening)** Windows path allowlist gap (A1): `defaultExtraRoots()` accepts `%ProgramData%`-anchored chocolatey (`chocolatey\bin`) + scoop (`scoop\shims`) shim roots **automatically on win32** (zero caller changes; empty off-Windows so the POSIX accept-set is unchanged). A `failsafe.integrations.bicameral.extraCommandRoots` setting + `options.extraRoots` parameter add genuinely configurable extra roots, threaded through `wireFromConfig` and the auto-connect probe. `isUnderAnyRoot` lower-cases on win32 to avoid false rejection of case-variant paths. FX565/FX566.
- [x] **[B-BIC-8] (v5.2.0-baseline — Complete via plan-qor-bicameral-safety-concurrency)** connect() concurrency race: `connectPromise: Promise<void> | null` field caches in-flight calls. `Promise.all([connect(), connect()])` shares one transport spawn. Promise cleared on settle so retry-after-failure works. FX540 (4 cases).

#### Lifecycle / Resilience
- [x] **[B-BIC-9] (v5.2.0-baseline — Complete via plan-qor-bicameral-safety-concurrency)** Idle disconnect TTL: `IdleScheduler` helper owns timer + inflight counter; long-running calls suppress fire (no spurious disconnect); `lastActivityAt` updates after response (not entry); `transport.onclose` + `disconnect()` cancel pending fire. VS Code setting `failsafe.integrations.bicameral.idleDisconnectMs` (default 900000ms / 15min, 0 disables). FX544 (5 cases).
- [x] **[B-BIC-10] (v5.1.5 — closed by B-BIC-2)** Config-change rebuild orphans prior subprocess (B4): resolved by the B-BIC quickwins cycle. `bootstrapBicameral.ts:38-44` now captures `const prior = consoleServer.getBicameralClient()` and fires `void prior?.disconnect().catch(() => undefined)` before assigning the new client.

#### Observability
- [x] **[B-BIC-11] (v5.2.0-baseline — Complete via plan-qor-bicameral-safety-concurrency)** Structured isError payload surfacing: callRaw now extracts `result.content[0].text` when `isError === true` and includes (capped at 200 chars) in the thrown Error message. Operator sees the upstream-reported failure detail instead of a generic message. Broadcast-event integration deferred to a follow-up (no consoleServer dependency in BicameralMcpClient yet). Tested in FX526 extension.

#### UI / UX
- [x] **[B-BIC-12] (v5.2.0-baseline — Complete 2026-05-21 via plan-qor-batch1-bbic-decision-row-ux)** "Open binding in editor" affordance on decision rows: new `POST /api/actions/bicameral-open-binding` route + injected `openFileInEditor` dep (wired to `vscode.open` in bootstrap); decision rows render a `data-action="bicameral-open-binding"` affordance carrying `filePath`+`startLine`. FX564. | v5.2.x
- [x] **[B-BIC-13] (v5.2.0-baseline — Complete 2026-05-21 via plan-qor-batch1-bbic-decision-row-ux)** Capabilities-driven empty-state copy: `/api/integrations/bicameral/status` now exposes `capabilities: string[]` (from `getCapabilities()`); `bicameral-card.js renderRunning` gates the `/bicameral-ingest` hint on `capabilities` including `ingest`. FX563. | v5.2.x
- [x] **[B-BIC-14] (v5.2.0-baseline — Complete 2026-05-21 via plan-qor-batch1-bbic-decision-row-ux)** Composite Sync button: when connected, the header Sync action composes status + history + drift fetches (drift iterates in-state binding paths); button relabels Detect again/Sync by connection state. FX562. | v5.2.x
- [x] **[B-BIC-15] (v5.2.0-baseline — Complete 2026-05-21 via plan-qor-batch1-bbic-decision-row-ux)** Narrow-viewport overflow on decision rows: binding `<code>` span clamped (`overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block`) + `min-width:0` on the row so the flex item shrinks; Ratify stays on-screen. FX561 (Playwright). | v5.2.x

#### Integration with FailSafe substrates
- [x] **[B-BIC-16] (v5.2.0-baseline — Complete via Phase 3 of bicameral-cluster-high)** Drifted decisions → L3 approval auto-enqueue (E1): new `DriftToL3Mediator` enqueues L3 entry with `kind:'bicameral-drift-resolution'` + `meta:{decisionId}` on drift-status-edge transition (de-dup by `bicameral:{decisionId}`). On L3 decide: APPROVED/APPROVED_WITH_CONDITIONS → `client.ratify('ratify')`; REJECTED → `'reject'`; DEFERRED/EXPIRED no-op. L3ApprovalRequest gained optional `kind?`/`meta?` fields. FX529/FX530 (11 cases) + FX531-equivalent bootstrap wiring.
- [x] **[B-BIC-17] (v5.2.0-baseline — Complete 2026-05-21 via Batch 4 of plan-qor-batch4-bbic-governance-integration)** Bicameral verdict events through SentinelWatchPolicy (E3): new shared `bicameral.verdict` event (own `drifted`/`in-sync`/`ratified` enum) emitted by the BicameralRoute drift/ratify handlers; new pure `SentinelWatchPolicy.classifyBicameralVerdict` maps `drifted`→`{priority:'high',notify:true}`, `ratified`/`in-sync`/unknown→`{priority:'normal',notify:false}`; bootstrap subscribes a classifier that broadcasts a `bicameral.verdict.classified` event for notifying verdicts. Classification-only (RD-2) — no `SentinelEvent`/`VerdictArbiter`. FX580/FX581 (7 cases). Plan: `docs/plan-qor-batch4-bbic-governance-integration.md`.
- [x] **[B-BIC-18] (v5.2.0-baseline — Complete 2026-05-21 via Batch 4 of plan-qor-batch4-bbic-governance-integration)** Risks Register mirror for drifted decisions (E4): new `RiskRegisterManager.upsertRisk`/`closeRisk` give keyed idempotent create + close-by-id over the untyped risk store; new `DriftToRiskMediator` consumes `bicameral.verdict` — `drifted` upserts a risk keyed `bicameral:{decisionId}`, `ratified` closes it, exception-isolated. No `risks.json` storage-format change. FX582/FX583 (9 cases). Plan: `docs/plan-qor-batch4-bbic-governance-integration.md`.

#### Test coverage
- [x] **[B-BIC-19] (v5.2.0-baseline — Complete via Phase 1 of bicameral-cluster-high)** Type-surface deferred tools (F1): promoted private `call()` to public `callRaw(name, args)` on `BicameralMcpClient`. Added 11 typed wrapper methods (ingest/search/brief/judgeGaps/resolveCompliance/linkCommit/update/reset/dashboard/validateSymbols/getNeighbors) each backed by a per-tool runtime guard (`isIngestResult`, etc. in `parsers.ts`). Extracted parsers + guards to keep `BicameralMcpClient.ts` under 250-line razor. FX526 (3 cases) + FX527 (22 cases).
- [x] **[B-BIC-20] (v5.2.0-baseline — Complete via Phase 2 of bicameral-cluster-high)** Live-subprocess MCP stdio test (F2): vendored TypeScript echo-mcp-server at `src/test/integrations/bicameral/echo-mcp-server.ts` using `@modelcontextprotocol/sdk/server/stdio`. Declares all 15 tool names; canned JSON satisfies Phase 1 runtime guards; side-channel file records received name + args. `echo-mcp-server.test.ts` (5 cases) spawns the server via `process.execPath` and exercises real `BicameralMcpClient + StdioClientTransport` framing.
- [x] **[B-BIC-21] (v5.2.0-baseline — Complete via plan-qor-bicameral-safety-concurrency)** Concurrent connect/disconnect race tests: FX540 covers Promise.all-share-one-spawn, connect→disconnect→connect cycle, rejection-clears-cached-promise-for-retry, 5-way concurrent connect coherent state.

#### Protocol awareness
- [x] **[B-BIC-22] (v5.2.0-baseline — Complete via plan-qor-bicameral-safety-concurrency)** MCP protocol/version floor assertion: `assertBicameralProtocolFloor(client)` runs at the end of `doConnect()`; reads `client.getServerVersion()?.version`; rejects when missing/empty OR below `MIN_BICAMERAL_VERSION` (re-used from install-handler — single source of truth). On rejection: tears down client + transport + capabilities before throwing. FX541 (5 cases).

#### Architectural debt
- [x] **[B-BIC-23] (v5.2.0-baseline — Complete via plan-qor-bicameral-safety-concurrency)** Runtime type guard on callTool return: new `isToolCallResult(v)` in parsers.ts narrows `unknown` MCP responses to `ToolCallResult`. Accepts either `content[]` OR `structuredContent`; `isError` must be boolean if present. Rejects strings, numbers, null, undefined, bare arrays, missing-both-fields. `callRaw` calls the guard before any field access. FX542 (13 cases).

### Runtime Architecture (Future)

- [x] **[B151] (v5.2.0-baseline — Complete via plan-qor-b151-governance-interceptor)** Universal Governance Interceptor: drop-in `IGovernanceInterceptor` seam (`evaluate(EvaluationRequestContract): Promise<ReceiptContract>`) consuming the B190 contracts. Ships `EngineBackedInterceptor` (wraps `EnforcementEngine.evaluateAction`, maps `Verdict`→`ReceiptContract`, engine-throw→QUARANTINE), `McpInterceptor` adapter (MCP `{name,arguments}`→`EvaluationRequestContract`, AJV-validated, malformed→QUARANTINE), `contractMappers` (deterministic `deriveEvaluationRequestId`, `ProposedAction↔EvaluationRequest` round-trip, `Verdict→Receipt` evidence projection), and a cached `Ajv2020` instance. The 3 `BicameralRoute` tool endpoints (history/drift/ratify) migrated to govern through `McpInterceptor`; FX551 snapshot-parity proves byte-identical pre/post behaviour. Free-tier scope per `LICENSING_POSTURE.md` amendment 2026-05-20 (observe/assist verdicts + local Shadow Genome = free; enforce-mode OS hard-block + org-wide aggregation = Pro). 30 functional cases FX547-FX552. MCP adapter only; LangChain/AutoGen/CrewAI deferred to follow-up cycles. Unlocks B152. Plan: `docs/plan-qor-b151-governance-interceptor.md`. Audit: `.failsafe/governance/AUDIT_REPORT_b151-governance-interceptor.md` (audit #2 PASS after 1 VETO+re-plan). | v5.2.x
- [x] **[B152] — MOVED TO FailSafe-Pro REPO 2026-05-20.** Runtime Execution Layer: extract the governance engine into a standalone `failsafe run` daemon that agents route through. Pro-tier per `PRIVATE/docs/LICENSING_POSTURE.md`; per the repo-boundary rule, Pro daemon/runtime work is tracked in the FailSafe-Pro repository, not the extension BACKLOG. Tracked as **FailSafe-Pro#18**. Unblocked by B151.
- [x] **[B153] — MOVED TO FailSafe-Pro REPO 2026-05-20.** Standard Telemetry Export: OpenTelemetry spans + Prometheus metrics endpoints exposing FailSafe-collected data for external observability tooling. Pro-tier per `PRIVATE/docs/LICENSING_POSTURE.md`; tracked in the FailSafe-Pro repository as **FailSafe-Pro#19**. Depends on B152.
- [x] **[B190] (v5.2.0-baseline — Complete via plan-qor-b190-governance-contracts)** Governance Decision Contract Schema Import: 8 JSON Schema files (`evaluation_request`, `ledger_entry`, `intent`, `failure_mode`, `approval`, `checkpoint`, `receipt`, `governance_config`) at `src/contracts/` using JSON Schema 2020-12 dialect + canonical `$id: https://failsafe.mythologiq.studio/contracts/<name>.json`. Hand-written TS mirror in `types.ts` + `index.ts` re-export with `CONTRACT_VERSIONS` map. Schemas only — no engine wiring (B151 consumes these in future cycle). copy-ui-js.cjs extended to mirror .json files in contracts/ subtree to out/. AJV 8.x added to devDependencies (was transitive via @modelcontextprotocol/sdk). FX545 (10 cases: well-formedness, dialect, $id, type, additionalProperties, AJV compile) + FX546 (9 cases: each contract validates a representative in-repo fixture, malformed-missing-required rejected). Unlocks B151.
- [x] **[B191] (v5.2.0-baseline — Complete 2026-05-20; verify-and-close cycle — substantive fix shipped via B192 `PlanManager.refreshFromWorkspace`+WorkspaceMutationBus + B193 SentinelDaemon governance-file watching + v5.0.0 Monitor workspace-artifact sourcing; E2E gap closed by strengthening B199 Phase 9 FX525 `bus-renderer-flow.spec.ts` case 2 — dead pageerror listener fixed, real DOM assertion added proving `#phase-title`→SUBSTANTIATE + 3 `.step.done` on an on-disk META_LEDGER entry; 2/2 Playwright green)** — Monitor sidebar does not reflect SHIELD lifecycle activity: User reports running v4.9.9 across multiple complete implementation cycles (Plan → Audit → Implement → Substantiate via Claude skills) with the FailSafe Monitor never changing state. Root cause (verified 2026-05-06): `ConsoleServer.buildHubSnapshot()` mixes in-memory state (PlanManager.getActivePlan, SentinelDaemon.getStatus, checkpointSummary, errorBudget, policyTrend) with workspace-artifact reads (latestAudit, recentReleases, recentCompletions, ledgerSummary). The Monitor's compact UI surfaces (Phase track, Sentinel orb/queue, Workspace Health metrics) render IN-MEMORY fields exclusively — these never update from Claude-driven file writes to docs/META_LEDGER.md, BACKLOG.md, or plan files. The `watchMetaLedger()` file watcher fires `hub.refresh` correctly, but PlanManager/SentinelDaemon do not re-read external files on hub rebuild. **In v4.9.9 the gap is total** — the workspace-truth readers (MetaLedgerReader, AuditReportReader, BacklogReader, etc.) did not exist; only Command Center Overview cards in v5.0.0+ surface fresh workspace data. **Fix scope**: (a) refactor PlanManager and SentinelDaemon to expose `refreshFromWorkspace()` that re-reads plan files / audit reports on each hub rebuild; (b) source Monitor Phase track, completions, and Sentinel state from workspace-artifact reads instead of in-memory caches; (c) backport whichever fix lands to v4.9.x as a hotfix line if any v4.9.x users exist beyond the operator's own workspace. **Impact**: false sense of "Monitor isn't seeing my work" — undermines core product trust. **Severity**: HIGH (P0 for any operator running SHIELD via Claude skills). | v5.0.x or v5.0.0+
- [x] **[B192] HIGH — Stale-cache pattern across governance services** — **IMPLEMENTED on `feat/stale-cache-remediation` 2026-05-18 (audit cycle 2 PASS; substantiate-sealed at Entry #372 federated).** New WorkspaceMutationBus substrate lets PlanManager / HubSnapshotService / TrustEngine subscribe to fs mutations on their backing files; `ConsoleLifecycleService.watchMetaLedger` migrated to the shared bus. New `LedgerManager.getLedgerPath()` accessor + `HubSnapshotService.refreshChainValidity()` chain-validity invalidation. L3ApprovalService intentionally dropped from scope (Memento-backed, no fs path; deferred as B-SC-6). FailSafe-Pro-coexistence addressed via shared-filesystem trust posture. 18 new functional cases (FX498/499/501/502/503). 2280 mocha pass / 17 baseline failing. Plan: `docs/plan-qor-stale-cache-remediation.md`. Audit: `.failsafe/governance/AUDIT_REPORT_stale-cache-remediation.md` 2-cycle PASS. ORIGINAL: 
- [x] [_b192_orig] **HIGH — Stale-cache pattern across governance services (B191 family)**: Same anti-pattern as B191 confirmed in additional services. `PlanManager.getActivePlan()` returns `this.plans` Map populated only at construction (`PlanManager.ts:30-42`); `L3ApprovalService.loadQueue()` reads stateStore once with no event subscription (`L3ApprovalService.ts:39-41`); `CheckpointStore` has no in-memory invalidation hook for external sqlite mutations (relevant for FailSafe Pro coexistence). **Fix scope**: each in-memory governance service exposes a canonical `refreshFromWorkspace()` invoked from `buildHubSnapshot()`; OR services subscribe to a single workspace-watcher event bus. **Origin**: qor-deep-audit Phase 1 GAP-BE-01/03/04. | v5.0.0+
- [x] **[B193] HIGH — SentinelDaemon governance-file extensions** — **IMPLEMENTED via Phase 60 §2 Track C (pre-shipped) + B193 residual fix-up cycle 2026-05-19.** Phase 60 §2 Track C extracted watch classification into `SentinelWatchPolicy.ts`, added `.md`/`.yaml`/`.yml`/`.json` to watched extensions, removed the blanket `.failsafe/**` exclusion (only transient `runtime/cache/archive` subtrees remain ignored), and added a governance whitelist. Residual fix-up cycle (branch `feat/sentinel-governance-extensions`): corrected stale aspirational whitelist paths to canonical fs locations (`.failsafe/risks/risks.json` per `RiskRegisterManager.ts:20`; `.failsafe/manifest/active_intent.json` + `manifest/intents/` glob per `IntentStore.ts:15-17`); added `docs/META_LEDGER.md` + `docs/BACKLOG.md` to whitelist files and `docs/plan-` to whitelist prefixes (actual repo canonical paths); broadened `.failsafe/governance/` to a blanket prefix entry covering 70+ on-disk variant files (`AUDIT_REPORT_*.md`, `RESEARCH_BRIEF_*.md`, `SESSION_STATE_*.md`) the suffix-equality match dropped silently; extended `isGovernanceSurface` priority-boost so `docs/META_LEDGER.md`/`docs/BACKLOG.md`/`docs/plan-*.md` mutations arrive at the verdict pipeline as `'high'` priority instead of `'normal'`; broadened `isWatchedGovernancePath` semantics so `docs/` governance whitelist is first-class. 10 new functional cases (FX510); 2391 mocha pass / 17 baseline failing — zero regressions beyond the intentional `.failsafe/governance/*.ts` semantic flip (now blanket-watched, matching real on-disk governance content). Plan: `docs/plan-qor-sentinel-governance-extensions.md`. Audit: 1-cycle PASS via independent architect-reviewer (SG-007 Option B; 2 minor findings remediated in-cycle). META_LEDGER Entry #376 (federation-reconciled from branch-local #375). **Origin**: qor-deep-audit Phase 1 GAP-BE-02. | v5.2.x
- [x] **[B194] HIGH — EnforcementEngine defaults to observe-only with no escalation prompt** — **IMPLEMENTED on `feat/enforcement-mode-escalation-ux` 2026-05-18 (audit 4-cycle PASS via independent architect-reviewer per SG-007 Option B; substantiate pending).** Resolved via the governance-mode transition surfacing pattern. New `governance.modeChanged` event + `ModeTransitionHistory` in-memory ring (cap 10) + populated `hub.governanceModeState` + `hub.recentModeTransitions` + Monitor observe-mode advisory banner + Command Center Governance tab "Mode Transitions" feed. BreakGlass payloads enriched with full transition context (previousMode/newMode/reason/requestedBy/timestamp). Plan: `docs/plan-qor-enforcement-mode-escalation-ux.md`. Doc: `docs/governance-mode-transitions.md`. Features FX504-FX509 verified. META_LEDGER Entry #375. **Origin**: qor-deep-audit Phase 1 GAP-BE-11. | v5.2.x
- [ ] **[B-EM-1] LOW — `sentinel.mode` vs `GovernanceMode` name collision in UI**: `governance.js:102`, `integrity.js:66`, `operations.js:38,188`, `tickers.js:9` render `sentinel.mode` (heuristic/hybrid/llm) where operator might expect `governanceMode` (observe/assist/enforce). Deferred from B194 V1 scope per operator boundary. **Fix scope**: rename UI labels to disambiguate (e.g., "Sentinel evaluator: heuristic" vs "Governance: observe"). | v5.2.x or later
- [x] **[B-EM-2] (v5.2.0-baseline — Complete via plan-qor-em-2-em-3-enforcement-mode-polish)** Cross-session persistence for mode-transition history: `ModeTransitionHistory.hydrateFromLedger(ledger)` projects the most recent 10 USER_OVERRIDE entries (governance_mode_changed + break_glass_*) into the ring on startup. Race-protected: live events queue during async hydration, drain on completion. Wired in main.ts post-bootstrapQorLogic. FX537 (11 cases) verified directly via mocha.
- [x] **[B-EM-3] (v5.2.0-baseline — Complete via plan-qor-em-2-em-3-enforcement-mode-polish)** First-run governance-mode onboarding wizard: new `FirstRunModePicker` class shows three-option QuickPick (Observe / Assist / Enforce with explanatory descriptions); selection persists to `failsafe.governance.mode` at Global scope; dismissal marks `failsafe.onboarded.mode` true (no re-prompting). Wired in bootstrapAdvancedCommands alongside existing FirstRunOnboarding. FX538 (6 cases) runs via vscode-test electron suite (CI).
- [x] **[B-EM-4] LOW — Playwright `serveConsoleServerUI` /api/hub override hook** — **IMPLEMENTED via B199 Phase 2 cycle 2026-05-19 (bundled as Phase 2 enabling substrate).** Express middleware mounted before WS attach + router-stack unshift (Express 5 first-match-wins workaround — newer Express renamed `app._router` to `app.router`) injects `hubRef.current` for GET `/api/hub` when `fixtures.initialHub` is set; falls through to real handler otherwise. Per-request hubRef read so `controller.setHub()` updates surface on the next fetch. `playwright.config.ts` testMatch tightened to `**/*.spec.ts` so mocha `.test.ts` helpers in `src/test/ui/` are not picked up by Playwright. 3 new FX512 functional cases. Closes B-EM-4 + unblocks Phase 2+ Command Center sub-tab Playwright coverage.
- [x] **[B195] HIGH — VSIX size 47.6 MB approaches marketplace cap** — **IMPLEMENTED on `feat/voice-substrate-extraction` 2026-05-18 (audit cycle 2 PASS; pending substantiate seal).** Resolved via the voice-pack separate-download companion per the 2026-05-18 disposition decision ([[feedback-voice-separate-download]]). Plan: `docs/plan-qor-voice-substrate-extraction.md`. Implementation: 6 phases delivered — substrate (`src/voice-pack/`), ConsoleServer /vendor static-mount overlay, bootstrap wiring + 2 VS Code commands + Settings card + VoicePackRoute, build pipeline (`scripts/package-voice-pack.cjs`) + `.vscodeignore` exclusions + `validate-vsix.cjs` 30 MB ceiling assertion, docs (`docs/INTEGRATIONS.md` Voice Pack section + FEATURE_INDEX FX491–FX497 + CHANGELOG [Unreleased]), Playwright spec (`voice-pack.spec.ts`). 18 new mocha cases + 4 new Playwright cases, all passing. **Audit**: `.failsafe/governance/AUDIT_REPORT_voice-substrate-extraction.md` 2-cycle PASS. **Origin**: qor-deep-audit Phase 1 GAP-CFG-01. | v5.2.x
- [x] **[B196] HIGH — FailSafe Pro daemon detection NOT implemented despite docs claim** — **MOVED TO FailSafe-Pro REPO 2026-05-18.** Per scope decision, FailSafe Pro daemon/runtime issues are tracked in the FailSafe-Pro repository, not in the FailSafe (extension) repo. The docs-claim-vs-code gap in `PRIVATE/docs/LICENSING_POSTURE.md` will be reconciled in the Pro-side cycle that implements the detection surface (or in a doc-only retraction here if it ships later). No further action in this repo. **Origin**: qor-deep-audit Phase 1 GAP-DEPS-09.
- [x] **[B197] HIGH — qor-logic Python package version unpinned and unverified post-install** — **IMPLEMENTED via installer-side already shipped + B197 residual surfacing cycle 2026-05-19.** Installer (`QorLogicPackageInstaller.ts:82-86`) already pinned `qor-logic>=0.31.1` with `--upgrade`; `verifyInstalledVersion()` (line 99-108) already returned `{installed, minimum, meetsFloor}`; 20 tests covered the pinning + verification paths. Residual surfacing cycle (branch `feat/qor-logic-version-pinning`): extended `QorLogicInstallStatus` with optional `installedVersion`/`minimumVersion`/`meetsFloor` fields; `getQorLogicInstallStatus()` accepts an optional `versionStatus` arg; `WorkspaceArtifactBuilder` constructor accepts a resolved version status; `HubSnapshotService.buildHubSnapshot` resolves the verifier once per hub rebuild (with try/catch graceful-degrade), threads the result through; `bootstrapServers.ts` wires `getQorLogicVerifier: () => packageInstaller.verifyInstalledVersion()` via forward-reference closure; `install-skills-card.js` renders a `cc-qorlogic-floor-warning` block above the host grid when `meetsFloor === false` + `installedVersion` present. 6 new FX511 cases (3 install-record + 3 Settings card); 2416 mocha pass / 18 failing (17 baseline + 1 pre-existing FX263 unrelated to B197; verified on main). Plan: `docs/plan-qor-logic-version-pinning.md`. Audit: 1-cycle PASS via independent architect-reviewer with 3 minor amendments (construction site + async boundary + escape helper name) remediated in-cycle. **Origin**: qor-deep-audit Phase 1 GAP-DEPS-04. | v5.2.x
- [x] **[B198] (v5.2.0-baseline — Complete 2026-05-21 via plan-qor-b198-subscribe-without-mutate) — Subscribe-without-mutate UI remediation**: RESOLVED. Research verified 3 of 6 cited defects already fixed (`brainstorm.js` heartbeat `document.hidden` guard, `brainstorm-visualizer.js` rAF cancel, `monitor-staleness.js`). This cycle fixed the still-present subset: `skills.js` cache invalidation on `skills.*`/`voicePack.*` events; new shared accessible `modal-helper.js` (`role="dialog"`/`aria-modal`/focus-trap/Escape/focus-restore) adopted by all 3 modals (`risks.js` + 2 `roadmap.js` modals); `TabGroup.switchTo` destroys the outgoing sub-view renderer; re-render-safe `destroy()` across `skills.js`/`risks.js`/`operations.js` (`operations.js` `_destroyed`-flag idempotence bug fixed). FX558-FX560 (15 cases). Plan v2: audit 2-cycle PASS (independent architect-reviewer); independent code-reviewer PASS. Plan: `docs/plan-qor-b198-subscribe-without-mutate.md`. ORIGINAL: Multiple UI module renderers cache first hub response and never invalidate (Skills tab `skills.js:84-88`, Operations roadmap `operations.js:13-17`); modal overlays missing focus trap / Escape handler / aria-modal (`roadmap.js:364-398`, `risks.js:89-128`); 30s heartbeat re-renders even when tab hidden (`brainstorm.js:65-67`); rAF loop in sidebar visualizer never cancels (`brainstorm-visualizer.js:15`); listener leak across tab nav cycles (no `destroy()` on tab switch). Combined with no Monitor staleness indicator (`roadmap.js:69-77`), user has no signal dashboard is stale. **Fix scope**: needs its own focused plan; not a one-line fix. **Origin**: qor-deep-audit Phase 1 GAP-FE-04 through FE-28. | v5.0.x
- [ ] **[B199] CRITICAL — Comprehensive Playwright + integration test coverage for v5.0.0 surface**: Operator audit 2026-05-06 surfaced systemic gap: 958 unit tests pass (logic in isolation with mocks) but provide weak proof at the FEATURE level. Many features I claimed "work" via unit tests are unverified end-to-end. Specific examples: (1) B191 Monitor visibility — derivePlanPhaseStatuses logic verified, but Monitor sidebar update on real Claude `/qor-*` invocation NOT verified; (2) Voice substrate — VoiceController state machine verified, but Whisper download / multilingual transcription / Piper audio playback NOT verified; (3) Settings cards — render functions tested with fake DOM, but actual mount/persist/toggle behavior NOT verified; (4) qor-debug XSS hardening — `escapeHtml` output verified, but live page rendering with poisoned localStorage NOT verified. **Inventory** (~150-200 distinct test cases): Monitor compact UI (~12 elements), Command Center 9 tabs × N controls, Brainstorm voice/modal/history/export/canvas, Settings 7 cards, VS Code sidebar 3 toolbar buttons + Monitor/SRE toggle, ~30 VS Code commands, ~60 ConsoleServer routes, ~12 WebSocket broadcast types, voice substrate live behavior, cross-host install (claude/codex/kilo-code/gemini). **Fix scope**: Playwright already configured (`playwright.config.ts`); 3 specs exist (compact-ui, popout-ui, user-stories). Add specs for every UI surface; vscode-test for extension-host commands; integration tests for ConsoleServer routes. CI gate (release-class only per Option C, 2026-05-06): `change_class: feature` or `breaking` BLOCKS commit if src/ change touches a UI/route/command surface without corresponding `.spec.ts` change; `hotfix` exempt. **Origin**: 2026-05-06 operator review. **Severity**: CRITICAL — without this, "tests pass" is weaker proof than it appears. | v5.0.x (multi-cycle effort, 2-3 weeks engineering) **Phase 1 status (2026-05-06, Entries #283 + #284, lands in v5.1.0)**: Methodology + CI gate + Monitor B191 proof shipped — `serveCompactUI`/`ledgerFixtures` helpers, `monitor-shield-progression.spec.ts` (8 cases), `monitor-staleness.spec.ts` (1 lifecycle), `check-e2e-coverage.cjs` gate wired into pre-push validator on `change_class∈{feature,breaking}`. Phase 1 surfaced 3 latent UI bugs (Monitor never bootstrapped in prod due to missing `type="module"`, SEAL/IDLE phase-track misrendering) — all fixed. **Phase 2 (2026-05-19, on `feat/b199-phase2-settings-e2e`)**: Settings tab E2E + B-EM-4 harness unblocker (Express /api/hub override via app.use + router-stack unshift). 3 active FX512 + 3 active FX513 Playwright cases + 2 deferred-skip pending B197 merge. **Phase 3 (2026-05-19, on `feat/b199-phase3-integrations-e2e`)**: Integrations + Voice Pack installed state. Branched off `feat/bicameral-enhancements-quickwins` to inherit B-BIC-1 + B-BIC-4; B-EM-4 harness substrate replicated inline (~20 LOC). FX519: 1 active Playwright case (Voice Pack installed state — the case Phase 2 explicitly deferred pending B-EM-4 substrate) + 1 test.skip-staged (capability-driven UI dimming, deferred until B-BIC-13). Bicameral ratify E2E intentionally NOT duplicated (already FX490; B-BIC-1 ledger-append covered by FX514 mocha). Phases 4–8 (Brainstorm, Agents, Workspace, Risks, ~30 commands, ~60 routes, ~12 WS broadcasts, voice live) still outstanding. **Phase 4 (2026-05-19, on `feat/b199-phase4-agents-e2e`)**: Agents tab structural coverage. FX520 (3 cases). **Phase 5 (`feat/b199-phase5-workspace-e2e`)**: Workspace tab structural — Skills/Mindmap sub-pills. FX521 (3 cases). **Phase 6 (`feat/b199-phase6-risks-e2e`)**: Governance tab structural — Audit/Risks/Compliance sub-pills (Risks was originally a top-level concept; lives under Governance). FX522 (3 cases). **Phase 7 (`feat/b199-phase7-overview-e2e`)**: Overview tab structural + tab-switching round-trip + no-error baseline. FX523 (3 cases). **All 6 top-level Command Center tabs now have structural Playwright coverage.** **Phase 8 (`feat/b199-phase8-ws-broadcasts-e2e`)**: WebSocket broadcast matrix — 16 cases (one per observed broadcast type: hub.refresh / event / verdict / transparency / agentRun / bicameral.{connected,disconnected} / brainstorm.reset / risk.{created,updated,deleted} / skills.install.{progress,complete} / voicePack.install.{complete,error} / voicePack.uninstalled). FX524 closes the deep-audit HIGH-severity "only 1 of ~12 broadcast types covered" finding. **Phase 9 (`feat/b199-phase9-bus-renderer-e2e`)**: real disk META_LEDGER → /api/hub → Monitor E2E flow. FX525 (2 cases). Closes the deep-audit CRITICAL "B191 bus→renderer fixture-only" finding. **Phases 10+ deferred to follow-on cycles** — captured as B-B199-* sub-items below.

### Remaining B199 gaps (B-B199-1..6, surfaced by 2026-05-19 deep audit)

- [x] **[B-B199-1] (v5.2.0-baseline — Complete via plan-qor-b199-1-brainstorm-e2e)** Brainstorm behavioral E2E (shell + interactive button scope): BrainstormRenderer shell renders 11 toolbar + canvas elements; /api/v1/brainstorm/graph fetched; 2D default + 3D toggle active states; TREE layout inline border-color indicator; UNDO/REDO/EXPORT/RESET click handlers verified via window.__failsafeRenderers spy installation; confirm(accept) → graph.clearAll, confirm(dismiss) → no-op; empty graph response renders shell error-free. FX539 (10 cases). NOTE: voice-input live behavior + 3D canvas content rendering remain deferred to B-B199-3 (voice) and future canvas-rendering work — both impractical to E2E without Whisper/Piper/WebGL stacks.
- [x] **[B-B199-2] (v5.2.0-baseline — Complete via plan-qor-b199-2-replay-genome-e2e)** Agents Replay + Genome behavioral E2E (current-surface scope): ReplayRenderer list/detail/empty/step-kind/diff-stats/governance-card/back/WS-agentRun → FX535 (8 cases); GenomeRenderer pattern-cards/show-all-toggle/empty/slice-cap/unresolved-table/WS-failureArchived → FX536 (6 cases). Production hook: 4-line test-only `globalThis.__failsafeRenderers` in command-center.js for WS-event synthesis. NOTE: timeline scrubbing, time-travel state restoration, snapshot diff content rendering mentioned in the original backlog claim are FUTURE features (B146-B149 marquee project) not present in current UI; new E2E backlog item will open when those ship.
- [x] **[B-B199-3] MEDIUM — Voice substrate live behavior** — **RESOLVED as documented trade-off via Batch 3 cycle 2026-05-21 (`plan-qor-batch3-b199-coverage-gaps.md`).** Research confirmed the supply-chain-relevant logic (`resolveVoicePackUrl` version validation + `ALLOWED_REDIRECT_HOSTS` redirect allowlist + SHA-256 verify) is ALREADY unit-covered in `voice-pack-install.test.ts`. Real Whisper/Piper E2E is impractical without the ~86 MB vendor binaries that ship as a separate download (B195) — building a live-Whisper harness would re-introduce the size problem B195 solved. Proportionate resolution: new `docs/TEST_COVERAGE_TRADEOFFS.md` records the accepted residual risk explicitly; `voice-pack.spec.ts` carries a STUB-ONLY header banner; `docs/INTEGRATIONS.md` Voice Pack section gained a "Test coverage" note. | v5.2.x
- [x] **[B-B199-4] MEDIUM — Cross-host install E2E** — **RESOLVED via Batch 3 cycle 2026-05-21 (`plan-qor-batch3-b199-coverage-gaps.md`, Phase 2).** Live install against 4 real hosts needs Python + the `qor-logic` PyPI package + network — impractical for CI. Research surfaced the genuine gap: `qor-logic-install-record.test.ts`'s `writeRecord` helper hardcoded the base dir as `.${host}` (correct only for claude/codex), so the `kilo-code` (`.kilo` base) and `gemini` (`.gemini/commands` layout) install-record round-trips were untested. Added a layout-correct `writeRecordForHost` helper sourcing paths from `HOST_INSTALL_LAYOUTS` + 4 new FX575 cases covering both uncovered host layouts incl. a regression-guard that a record at the wrong `.kilo-code` path is NOT picked up. Live cross-host `pip install` documented as a trade-off in `docs/TEST_COVERAGE_TRADEOFFS.md`. | v5.2.x
- [x] **[B-B199-5] MEDIUM-HIGH — CI gate hardening** — **IMPLEMENTED via Batch 3 cycle 2026-05-21 (`plan-qor-batch3-b199-coverage-gaps.md`, Phase 1).** `check-e2e-coverage.cjs` rewritten: (1) `[no-e2e]` override is now per-file scoped via `[no-e2e: <path-fragment> — <reason>]` — a token excuses only files whose path contains the fragment; the legacy unscoped form no longer grants a blanket pass; blanket override is now opt-in and explicit via `[no-e2e: * — <reason>]`. (2) New `mode:'release'` checks a merge-commit range (`FAILSAFE_RELEASE_BASE`/`HEAD`, fallback `origin/main`) instead of the staged index — and FAILS CLOSED when the range is unresolvable. (3) New `[e2e-gate] AUDIT:` line names every excused/bypassed file (incl. `FAILSAFE_GATE_BYPASS`), giving the previously-absent `--no-verify`-equivalent audit trail. 12 new FX570-574 regression cases (32 total gate cases pass via `node --test`). CI-workflow wiring of `release` mode is a deliberate follow-up. | v5.2.x
- [x] **[B-B199-6] LOW — Stub-only specs giving false confidence** — **RESOLVED as documented trade-off via Batch 3 cycle 2026-05-21 (`plan-qor-batch3-b199-coverage-gaps.md`, Phase 3).** `integrations-bicameral.spec.ts` + `voice-pack.spec.ts` both gained explicit STUB-ONLY header banners pointing at `docs/TEST_COVERAGE_TRADEOFFS.md`, which records what each spec covers, what it deliberately does not (would not pass against real installs), and the accepted residual risk. The real install/connect paths are covered by the unit tests under `src/test/integrations/bicameral` and `voice-pack-install.test.ts`. The false-confidence risk is now visible at the point of reading the test. | v5.2.x

### Test infrastructure (B-FIX-*, surfaced during v5.1.5 publish 2026-05-19/20)

- [x] **[B-FIX-1] (v5.1.5 2026-05-19 — Complete via b59a44b) HIGH — Activation race: duplicate-command-registration crash**: `main.ts` activate() registered `failsafe.breakGlass` via `bootstrapAdvancedCommands.registerAdvancedCommands`. When two extension hosts shared a workbench (dual-host vscode-test race), the second activate threw "command 'failsafe.breakGlass' already exists" and tanked 17 unrelated tests with a commands-not-found cascade. **Fix**: outer try/catch in `activate()` tolerates `/command '.*' already exists/` and EADDRINUSE; module-level `__failsafeActivated` flag handles within-process re-entry; deactivate resets the flag. Verified: 17 failing → 0 failing on clean runs.
- [x] **[B-FIX-2] (v5.1.5 2026-05-19 — Complete via 4c27e1b) HIGH — vscode-test dual-host spawn caused by ambient Code.exe**: qor-debug Phase 2 traced consistent dual extension-host spawn (visible in every test log) to ambient `Code.exe` processes on the operator's machine racing against `vscode-test`'s spawned host on the shared `--user-data-dir`. The VS Code single-instance mutex collided. `@vscode/test-cli@0.0.11` + `@vscode/test-electron@2.3.8` source has exactly ONE `cp.spawn(code.exe)`; the second host was external. **Fix**: pin per-invocation unique `--user-data-dir` under `os.tmpdir()` in `.vscode-test.mjs` `launchArgs`; delete shadowing `.vscode-test.json`; set `mocha.ui = 'tdd'` to match test files' `suite`/`test` syntax. Verified: 1 extension host (was 2), 2476 mocha passing in 23s (was 33-45s), 80 Playwright passing. Side discoveries deferred: `src/test/runTest.ts` + compiled output is dead code; `.vscode-test/` cache has 13 stale electron versions worth pruning.

- [x] **[B200] (v5.1.6-baseline 2026-05-09 — Complete) HIGH — ShadowGenomeManager init-order bug: security columns missing on first run**: `ShadowGenomeManager.initialize()` runs `schemaVersionManager.migrate()` at line 125 BEFORE `initSchema()` at line 138. Migrations 1.1.0 (adds `did_hash`, `signature`, `signature_timestamp`) and 1.2.0 (adds audit-trail columns) use `ALTER TABLE shadow_genome ADD COLUMN`, which fails silently with "no such table: shadow_genome" because `initSchema()` hasn't created it yet. The migration is recorded as failed (not applied), but no error is thrown. Migration 1.0.0 succeeds because it's a no-op (the V1 DDL is run by `initSchema()` afterward). On the SECOND init (next extension session), the table exists and pending migrations finally apply. **Impact**: brand-new FailSafe installs run V1.0 schema (no security columns) until the extension restarts. P0 security hardening (DID hash, signature verification) is silently disabled for the first session. Verified via `qorelogic/ShadowGenomeManager.test.ts` (FX329) which had to call `initialize()` twice to get the production-after-first-session schema state. **Fix scope**: swap the order — call `initSchema()` immediately after `schemaVersionManager.initialize()` (creates schema_version table) and before `migrate()` (which depends on shadow_genome existing). Two-line change in `ShadowGenomeManager.ts:119-138`. **Origin**: surfaced 2026-05-07 during B199 Phase 5 test authoring. **Severity**: HIGH (P0 security feature silently disabled on first run; recovers on session restart). | v5.1.x

## Wishlist (Nice to Have)

- [ ] [B90] CLI Overseer Lite Feasibility Extraction: Explore creating a lightweight, CLI-compatible version of FailSafe for direct website integration | v5.0.0
- [ ] [B91] Formal Security Hardening Roadmap Document: Define the 3-phase security implementation plan (Foundation, Advanced, Resilience) with milestone criteria and a dependency graph | v5.0.0

<!-- Earlier wishlist items promoted to Backlog with version tags -->

---

## Version Summary

| Version      | Codename                       | Status         | Description                                                                                                           |
| ------------ | ------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| v1.0.7       | Beta                           | ✅ RELEASED    | Current marketplace                                                                                                   |
| v1.1.0       | Pathfinder                     | ✅ IMPLEMENTED | Event-sourced Plans                                                                                                   |
| v1.2.0       | Navigator                      | ✅ IMPLEMENTED | Roadmap View                                                                                                          |
| v1.2.2       | Cleanup                        | ✅ COMPLETE    | Blockers D1-D3, B1-B2                                                                                                 |
| v1.3.0       | Autopilot                      | ✅ COMPLETE    | B3-B5 all done                                                                                                        |
| v2.0.0       | Governance                     | ✅ COMPLETE    | Gold Standard + ambient (B12-B28)                                                                                     |
| v2.0.1       | Tooltip Remediation            | ✅ COMPLETE    | Template modularization + tooltips (B30)                                                                              |
| v2.0.2       | Marketplace Fix                | ✅ COMPLETE    | README corrections for both marketplaces                                                                              |
| v3.0.0       | Horizon                        | ✅ COMPLETE    | UI + Analytics (B6-B36)                                                                                               |
| v3.0.2       | Dashboard Remediation          | ✅ COMPLETE    | Roadmap card, tooltips, wiring (B37-B40)                                                                              |
| v3.1.0       | Orchestration                  | ✅ SEALED      | Cumulative Roadmap, External Browser (B41-B44)                                                                        |
| v3.2.0       | Reliability Hardening          | ✅ SEALED      | B45/B47/B48/B49/B50/B51 substantiated with executable gate evidence                                                   |
| v3.2.5       | Console Overhaul               | ✅ SEALED      | Partial delivery (B52/B58/B59); remainder deferred to v4.2.0                                                          |
| v4.0.0       | Economics                      | ✅ SEALED      | Token economics, governance modes, risk register, transparency stream                                                 |
| v4.1.0       | Governance Gaps                | ✅ SEALED      | Mode-change audit trail, break-glass, artifact hash, verdict replay (Gaps 1-4)                                        |
| **v4.2.0**   | **The Answer**                 | ✅ SEALED      | Full-stack governance: console, release pipeline, schema hardening, multi-agent fabric, and discovery workflow delivery |
| **v4.3.0**   | **Telemetry Loop**             | ✅ SEALED      | Commit guard, AI provenance tracing, CI governance context export, and post-substantiation quality sweep remediation   |
| **v4.3.1**   | **Security Hardening**         | ✅ SEALED      | SQL injection protection, XSS prevention, README logo correction (B133-B136)                                          |
| **v4.4.0**   | **Mindmap Evolution**          | ✅ SEALED      | Mindmap surface upgrade, UI asset expansion, console integration depth                                                |
| **v4.4.1**   | **Screenshot Refresh**         | ✅ SEALED      | UI screenshots, socket hardening, activation event tightening                                                         |
| **v4.5.0**   | **Skill Discovery**            | ✅ RELEASED    | Skill discovery tags, tag filter, governance skill cohesion, /qor-document skill, CI/CD hardening                      |
| **v4.5.1**   | **Hotfix**                     | ✅ RELEASED    | Fix activation crash when ledger DB unavailable, fix validate.ps1 parameter mismatch                                 |
| **v4.6.0**   | **Section 4 Razor**            | ✅ RELEASED    | Section 4 decomposition, voice brainstorm fixes, hook toggle UI, release gate enhancements                            |
| **v4.6.1**   | **Hotfix**                     | ✅ RELEASED    | Missing sidebar SVG icon, release pipeline branch policy for tag CI, icon validation gate                             |
| **v4.6.2**   | **Hotfix**                     | ✅ RELEASED    | Fix Console Server 404 on dotfile install paths (.vscode/, .antigravity/)                                             |
| **v4.6.3**   | **Hotfix**                     | ✅ RELEASED    | Fix express.static missing dotfiles:allow — CSS/JS/image assets silently 404'd                                        |
| **v4.6.4**   | **Hotfix**                     | ✅ RELEASED    | Governance state integrity — trust persistence, event-driven cache, checkpoint chain verification, version display fix |
| **v4.6.5**   | **Skill Consolidation**        | ✅ RELEASED    | Cross-agent skill consolidation, SDK-standard directory layout, ModelAdapter + bundler + scaffolding updates           |
| **v4.6.6**   | **Workspace Isolation**        | ✅ RELEASED    | Multi-workspace support, Repository Governance as a Service, compliance scoring in Monitor, S.H.I.E.L.D. phase tracker |
| **v4.7.0**   | **Agent Marketplace**          | ✅ RELEASED    | Agent Marketplace with HITL security gates, Garak/Promptfoo scanning, Microsoft Agent Governance Toolkit Adapter      |
| **v4.7.2**   | **GitHub Resilience**          | ✅ RELEASED    | GitHub API resilience, concurrent manifold calculation, DiffGuard analysis panel                                       |
| **v4.8.0**   | **Agent Debugging Suite**      | ✅ RELEASED    | Agent Execution Timeline, Risk & Stability Indicators, Shadow Genome Debugging Panel (B142-B145)                      |
| **v4.9.0**   | **Agent Run Replay**           | ✅ RELEASED    | Agent Run Replay, Governance Decision Contracts, marketplace README repositioning (B146/B147/B150)                    |
| **v4.9.2**   | **Infrastructure Hardening**   | ✅ RELEASED    | Monitor state tracking, hook toggle completion, release pipeline verification (B107-B108, B137-B140)                  |
| **v4.9.3**   | **Command Center Readiness**   | ✅ SEALED      | Fix disconnected hub data, wire B142-B144/B146/B150 into Command Center, fix transparency pipeline (B154-B157)        |
| **v4.9.5**   | **Pre-v5.0 Quality Sweep**     | ✅ RELEASED    | Voice brainstorm fixes, Razor debt extraction, backlog reconciliation (B113-B128, B95-B99, B161-B163)                |
| **v4.9.6**   | **SRE Panel**                  | ✅ RELEASED    | SRE panel via AGT adapter, OWASP ASI coverage, SLI compliance indicator, Monitor sidebar toggle (B167-B169)          |
| **v4.9.7**   | **Diagnostic Fixes**           | ✅ RELEASED    | Governance mode config, external agent capture, genome visibility, timeline expansion (B181-B184)                    |
| **v4.9.8**   | **SRE Expansion**              | ✅ RELEASED    | Error budget fix, sentinel extraction, clickable nav, SRE type extraction, activity feed, SLO dashboard (B178-B180, B185-B187) |
| **v4.9.9**   | **UI Bugfixes**                | ✅ RELEASED    | Install Skills path fix, brainstorm right panel proxy, TabGroup sub-view panels (B188-B189)                                    |
| **v5.0.0**   | **v5 Reveal**                  | ✅ RELEASED    | Public reveal of the FailSafe / FailSafe Pro product split; v5.0.0 baseline for VS Code Marketplace + Open VSX                 |
| **v5.1.0**   | **OpenVSX Alignment**          | ✅ RELEASED    | Marketplace + Open VSX both at v5.0.0 baseline; B199 Phase 1 methodology + CI e2e-coverage gate + Monitor B191 proof           |
| **v5.1.5**   | **Bicameral Integration**      | ✅ RELEASED    | Bicameral MCP integration (v1), stale-cache remediation (B192), voice substrate extraction (B195), enforcement-mode UX (B194) |
| **v5.1.6**   | **Bicameral HIGH Cluster**     | ✅ RELEASED    | Bicameral HIGH cluster (B-BIC-16/19/20) + safety/concurrency batch + upstream awareness (B-INT-3) + B-B199-2 + B-EM-2/3       |
| **v5.1.7**   | **Governance Interceptor**     | ✅ RELEASED    | Universal governance interceptor (B151), bicameral.preflight→L3 (B-INT-2), subscribe-without-mutate UI (B198), B-BIC batches  |

---

_Updated by /qor-\* commands automatically_
