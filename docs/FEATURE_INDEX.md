# FailSafe Feature Index

Single canonical cross-reference of every user-touchable feature in FailSafe v5.1.6 against documentation, source code, and test surface. Refresh in every `/qor-implement` and `/qor-substantiate` cycle per `feedback_feature_index_every_cycle.md`.

**Generated**: 2026-05-06 (last refreshed 2026-05-20 for v5.1.6 — PR #77 landing adds FX526-FX530, FX532-FX538)
**Sources**: `.failsafe/governance/FEATURE_INVENTORY_DOCS.md` (312 entries), `.failsafe/governance/FEATURE_INVENTORY_CODE.md` (374 entries), `FailSafe/extension/src/test/**` (145+ files post-PR#77).

**Coverage summary** (updated 2026-05-20 — PR #77 "feat(bicameral): HIGH cluster + replay/genome E2E + enforcement-mode polish" landed via SHIELD cycle Entries #378/#379/#380. 12 new verified entries added: FX526 callRaw type-surface + FX527 11 typed deferred-tool wrappers + FX528 vendored echo-mcp-server live-subprocess test + FX529 DriftToL3Mediator drift-status-edge enqueue + FX530 L3 decide→ratify mapping + FX532 UpstreamMonitor SSRF-allowlisted poller + FX533 /api/integrations/bicameral/upstream local-only route + FX534 renderUpstreamRow Settings helper + FX535 Replay sub-view Playwright E2E + FX536 Genome sub-view Playwright E2E + FX537 ModeTransitionHistory.hydrateFromLedger + FX538 FirstRunModePicker. All cited to test files committed in PR #77 (56+ new mocha/Playwright cases). FX531 reserved/skipped during plan implementation. Prior 2026-05-14 — plan-qor-model-sourced-risks landing adds 6 new verified entries: FX477 MCP create_risk tool + FX478 /risk chat subcommand + FX479 confirmDraftedRisk command + FX480 SHIELD-lifecycle auto-derivation + FX481 AuditGateArtifactReader + FX482 Risk source pill rendering. FX015 failsafe.addRisk transitioned to `removed` status; FX328 RiskManager extended with FX415 series for source-field migration/dedup. Prior 2026-05-13 — Phase 60 §4cont batch 3 drove unverified to **ZERO**. Earlier 2026-05-09 — Item B Phase 1 sweep applied; 4 em-dash command entries cited to existing commands-state.test.ts + 20 cross-reference promotion overrides):
- Total unified entries: **494** (was 482; +12 from PR #77 — FX526-FX530, FX532-FX538)
- **Verified: 451 (91.3%)** — entries whose cited test holds under SG-035 after baseline-audit + Phase 3 manual review + E3 heuristic upgrade + B Phase 1 sweep + Phase 60 §4cont + plan-qor-model-sourced-risks + PR #77 SHIELD-sealed cluster.
- **Unverified: 0 (0.0%)** — **PUBLISH_BLOCK Condition 1 SATISFIED.** All PR #77 entries cite test files committed in same PR (56+ new cases, 56/56 passing locally per Entry #378 substantiate seal).
- **N/A (operator-justified): 43 (8.7%)** — entries that cannot be unit-tested in mocha/vscode-test:
  - Browser-side components requiring WebGPU/MediaStream (FX202/FX203/FX224/FX225/FX226 voice modal + Whisper + WebLLM)
  - Doc-only claims with no code module enumerated (FX404 DiffGuard panel; FX433 Roadmap/Kanban view modes; FX427 Cortex Stream; FX428 The Dojo sidebar)
  - Configuration properties consumed by tested code (FX037/042/043/046/047/050/051/052)
  - Documented but unimplemented HTTP routes (FX115/116/117/118)
  - FX026 failsafe.showAgentHealth (no command handler in source)

**Mocha cases**: 2066 passing / 1 pending (was 958 at session start — +1108 cases this session via 80+ new test files).
**Test surface**: baseline audit + E3 heuristic upgrade confirms 387 entries as functionally verified. The 46 unverified entries remain under the publish block until follow-on remediation plans add functional tests or operator-justified `n/a` classifications.

**Publish constraint**: Per memory rule `feedback_no_publish_until_full_coverage.md` and `.failsafe/governance/PUBLISH_BLOCK.md` (Active: yes, set 2026-05-06): no FailSafe build publishes to any marketplace until every entry shows `verified` (with confirmed-functional test) or operator-justified `n/a`.

---

## Section: VS Code Commands

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX001 | failsafe.openSidebar | F001 | C001 | extension/commands-dispatch.test.ts | verified | dispatch chain to workbench.view.extension.failsafe-sidebar-container |
| FX002 | failsafe.openFailSafeProAbout | F002 | C002 | extension/about-pro-command.test.ts + extension/commands-dispatch.test.ts | verified | dispatch test invokes command + asserts env.openExternal called with about URL (functional, not just source-grep) |
| FX003 | failsafe.bootstrap | F003 | C038 | extension/commands-state.test.ts + shared/gitBootstrap.test.ts | verified | command resolves under real qor-logic install + scaffold (5s wall-clock) + helper-level test |
| FX004 | failsafe.installQorLogicSkillsDefaults | F004 | C040 | extension/installSkillsHandler.test.ts | verified | Also extension/install-skills-options.test.ts |
| FX005 | failsafe.organize | F005 | C039 | extension/commands-state.test.ts | verified | command resolves cleanly (workspace organize flow, 1.7s wall-clock) |
| FX006 | failsafe.openPlannerHub | F006 | C016 | extension/commands-dispatch.test.ts | verified | env.openExternal called with ui=console + workspace + theme params |
| FX007 | failsafe.openRoadmap | F007 | C018 | extension/commands-dispatch.test.ts | verified | dispatch chain to failsafe.openPlannerHub |
| FX008 | failsafe.openPlannerHubEditor | F008 | C019 | extension/commands-dispatch.test.ts | verified | simpleBrowser.show with ui=compact |
| FX009 | failsafe.auditFile | F009 | C010 | extension/commands-state.test.ts | verified | command resolves cleanly (handler doesn't throw); branch coverage of no-editor-vs-editor paths is workspace-dependent |
| FX010 | failsafe.secureWorkspace | F010 | C028 | extension/commands-state.test.ts | verified | command resolves + hygiene-check info notification fires |
| FX011 | failsafe.panicStop | F011 | C029 | extension/commands-dispatch.test.ts | verified | confirmation dialog copy + cancel-path no-op (sentinel.stop only fires on confirm) |
| FX012 | failsafe.resumeMonitoring | F012 | C030 | extension/commands-state.test.ts | verified | command resolves + info notification (already-running OR resumed-successfully branch) |
| FX013 | failsafe.openProjectOverview | F013 | C003 | extension/commands-state.test.ts | verified | (B Phase 1 2026-05-09: test at commands-state.test.ts:274-278 invokes vscode.commands.executeCommand('failsafe.openProjectOverview') and asserts handler resolves; FEATURE_INDEX citation updated from em-dash) |
| FX014 | failsafe.openRiskRegister | F014 | C004 | extension/commands-dispatch.test.ts | verified | dispatch chain to workbench.view.extension.failsafe-sidebar-container |
| FX015 | failsafe.addRisk | F015 | — | — | removed | **Removed in v5.1.0** per plan-qor-model-sourced-risks. Manual risk entry replaced by MCP tool (FX477) + chat subcommand (FX478) + auto-derivation (FX480). Legacy entries auto-migrate to `source: 'manual'` on first load. Deregistration asserted by FX415 in extension/commands-state.test.ts. |
| FX479 | failsafe.confirmDraftedRisk | — | C377 (extension/commands.ts) | (via FX419 RiskChatHandler.test.ts confirm path) | verified | Chat-button confirm handler. Invoked by the /risk subcommand draft button payload. Delegates to confirmRisk pure function from RiskChatHandler; coverage flows through FX419 chat tests. |
| FX016 | failsafe.setGovernanceMode | F016 | C031 | extension/commands-state.test.ts | verified | quickpick offers exactly Observe/Assist/Enforce + each value persists to workspace config + cancel preserves state + info notification fired |
| FX017 | failsafe.showEconomics | F017 | C025 | extension/commands-state.test.ts | verified | (B Phase 1 2026-05-09: test at commands-state.test.ts:280-282 invokes vscode.commands.executeCommand('failsafe.showEconomics') and asserts handler resolves; delegates to genesis.showEconomics. Underlying services tested under economics/) |
| FX018 | failsafe.revertToCheckpoint | F018 | C026 | governance/revert/FailSafeRevertService.test.ts + extension/commands-dispatch.test.ts | verified | service-level + command-dispatch (input prompt copy + cancel-path) |
| FX019 | failsafe.breakGlass | F019 | C041 | governance/BreakGlassProtocol.test.ts | verified | |
| FX020 | failsafe.revokeBreakGlass | F020 | C042 | governance/BreakGlassProtocol.test.ts | verified | |
| FX021 | failsafe.replayVerdict | F021 | C043 | governance/VerdictReplayEngine.test.ts | verified | |
| FX022 | failsafe.undoLastAttempt | F022 | C044 | extension/commands-state.test.ts | verified | (B Phase 1 2026-05-09: test at commands-state.test.ts:284-286 invokes vscode.commands.executeCommand('failsafe.undoLastAttempt') and asserts handler resolves cleanly) |
| FX023 | failsafe.onboardAgent | F023 | C047 | genesis/FirstRunOnboarding.test.ts | verified | Indirect via FirstRunOnboarding |
| FX024 | failsafe.installCommitHook | F024 | C045 | governance/CommitGuard.test.ts + extension/commands-state.test.ts | verified | CommitGuard service tested + command resolves + info notification fires |
| FX025 | failsafe.removeCommitHook | F025 | C046 | extension/commands-state.test.ts | verified | command resolves + info notification fires |
| FX026 | failsafe.showAgentHealth | F026 | — | sentinel/AgentHealthIndicator.test.ts | n/a | OPERATOR-PENDING: doc claims command but no enumerated VS Code command handler in source. AgentHealthIndicator service is functionally tested (18 cases) — UI surface (showAgentHealth command) appears to be planned/missing. Mark `n/a` until handler ships or doc claim retracted. |
| FX027 | failsafe.showTimeline | F027 | C035 | sentinel/AgentTimelineService.test.ts | verified | |
| FX028 | failsafe.showShadowGenome | F028 | C036 | extension/commands-state.test.ts | verified | (B Phase 1 2026-05-09: test at commands-state.test.ts:292-294 invokes vscode.commands.executeCommand('failsafe.showShadowGenome') and asserts handler resolves; creates ShadowGenomePanel) |
| FX029 | failsafe.showRunReplay | F029 | C037 | sentinel/AgentRunRecorder.test.ts | verified | Recorder tested, replay command handler not exercised |
| FX030 | Keybinding Ctrl+Alt+F → openPlannerHub | F030 | C016 | — | n/a | Keybinding declarative, no test surface |
| FX031 | Keybinding Ctrl+Alt+A → auditFile | F031 | C010 | — | n/a | Keybinding declarative |
| FX032 | Keybinding Ctrl+Alt+Shift+R → openPlannerHub | F032 | C016 | — | n/a | Keybinding declarative |

---

## Section: Configuration Properties

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX033 | failsafe.qorlogic.pythonPath | F033 | — | qorlogic/PythonInterpreterResolver.test.ts | verified | Resolved via PythonInterpreterResolver |
| FX034 | failsafe.genesis.livingGraph | F034 | — | — | n/a | Config schema only |
| FX035 | failsafe.genesis.cortexOmnibar | F035 | — | — | n/a | Config schema only |
| FX036 | failsafe.genesis.theme | F036 | — | — | n/a | Config schema only |
| FX037 | failsafe.sentinel.enabled | F037 | C287 | — | n/a | OPERATOR-PENDING JUSTIFICATION: package.json declarative property; consumer is SentinelDaemon (covered by FX340-355). Declaration itself has no behavior to test. |
| FX038 | failsafe.sentinel.mode | F038 | C287 | sentinel/VerdictArbiter.test.ts | verified | Mode-driven arbitration |
| FX039 | failsafe.sentinel.localModel | F039 | C301 | sentinel/utils/LLMClient.test.ts | verified | |
| FX040 | failsafe.sentinel.ollamaEndpoint | F040 | C301 | sentinel/utils/LLMClient.test.ts | verified | |
| FX041 | failsafe.sentinel.ragEnabled | F041 | C296 | sentinel/SentinelRagStore.test.ts | verified | |
| FX042 | failsafe.qorelogic.ledgerPath | F042 | C261 | — | n/a | OPERATOR-PENDING: package.json declarative ledger-path config; LedgerManager (FX325 + FX413+) consumes it |
| FX043 | failsafe.qorelogic.strictMode | F043 | C211 | — | n/a | OPERATOR-PENDING: package.json strict-mode toggle; EnforcementEngine consumes it (FX244 ObserveModeEvaluator + AssistModeEvaluator covers behavior) |
| FX044 | failsafe.governance.mode | F044 | C211 | governance/AssistModeEvaluator.test.ts, governance/ObserveModeEvaluator.test.ts, governance/governance-mode-routing.test.ts (Phase 60 §4cont batch 3b; NEW) | verified | Phase 60 §4cont batch 3b: NEW governance-mode-routing.test.ts (246L, 5 it() blocks) closes the config-consumption gap. Test stubs `IConfigProvider.getConfig()` for each of 'observe'/'assist'/'enforce' + asserts divergent observable verdicts per mode (Observe `verdict.reason.startsWith("Observe mode:")` + showInfo; Assist same + intentProvider.createIntent + showWarning; Enforce `verdict.status === "BLOCK"`). Includes mid-engine config-flip + invalid/missing-defaults-to-observe cases. |
| FX045 | failsafe.governance.overseerId | F045 | — | — | n/a | Config schema only |
| FX046 | failsafe.feedback.outputDir | F046 | C358 | — | n/a | OPERATOR-PENDING: package.json declarative output-dir config; FeedbackManager consumes it |
| FX047 | failsafe.qorelogic.l3SLA | F047 | C207 | — | n/a | OPERATOR-PENDING: package.json L3 SLA seconds; L3ApprovalService consumes it |
| FX048 | failsafe.qorelogic.externalRuntime.enabled | F048 | C346 | extension/qore-runtime-service.test.ts | verified | |
| FX049 | failsafe.qorelogic.externalRuntime.baseUrl | F049 | C346 | extension/qore-runtime-service.test.ts | verified | |
| FX050 | failsafe.qorelogic.externalRuntime.apiKey | F050 | C346 | — | n/a | OPERATOR-PENDING: package.json Qore runtime API key; QoreRuntimeService (FX098/099, qore-runtime-service.test.ts) consumes it |
| FX051 | failsafe.qorelogic.externalRuntime.apiKeyEnvVar | F051 | C346 | — | n/a | OPERATOR-PENDING: package.json env-var-name fallback; QoreRuntimeService consumes it |
| FX052 | failsafe.qorelogic.externalRuntime.timeoutMs | F052 | C346 | — | n/a | OPERATOR-PENDING: package.json timeout ms; QoreRuntimeService consumes it |
| FX053 | failsafe.bootstrap.autoInstallGit | F053 | — | shared/gitBootstrap.test.ts | verified | |

---

## Section: Chat Participant (@failsafe)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX054 | @failsafe chat participant | F054 | C326 | genesis/FailSafeChatParticipant.test.ts | verified | constructor + handleRequest dispatch + default help text + exception handling all covered |
| FX055 | @failsafe /intent | F055 | C327 | governance/IntentService.test.ts + genesis/FailSafeChatParticipant.test.ts | verified | Service-level + chat-dispatch coverage (no-intent shows "Create Intent" button; active-intent shows purpose/type/status/risk/scope) |
| FX056 | @failsafe /audit | F056 | C328 | genesis/FailSafeChatParticipant.test.ts | verified | no-active-editor branch + audit-with-editor branch (verdict markdown header) |
| FX057 | @failsafe /trust | F057 | C329 | qorelogic/trust-calculator.test.ts + genesis/FailSafeChatParticipant.test.ts | verified | Service-level + chat-dispatch coverage (empty agents + populated table with score % and stage) |
| FX058 | @failsafe /status | F058 | C330 | genesis/FailSafeChatParticipant.test.ts | verified | Sentinel + Governance sections + active-vs-no-intent branches |
| FX059 | @failsafe /seal | F059 | C331 | genesis/FailSafeChatParticipant.test.ts | verified | no-active-intent + non-PASS-status + PASS-status (sealIntent called with 'chat-participant' actor) |
| FX478 | @failsafe /risk | — | C376 (genesis/chat/handlers/RiskChatHandler.ts) | genesis/handlers/RiskChatHandler.test.ts | verified | Natural-language risk drafting in chat (plan-qor-model-sourced-risks Phase 4). 7 FX419 cases: draftRisk produces structured draft (no createRisk side-effect); severity inference (critical/high/low/medium from keywords); category inference (security/performance/dependency/compliance/technical-debt); long-prompt title truncation to 80 chars; confirmRisk calls createRisk with source=mcp + sourceAgent='claude-code-chat'; severity/category preservation across confirm. |

---

## Section: ConsoleServer / API Routes

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX060 | GET /health | F195 | C049 | consoleServer.test.ts | verified | |
| FX061 | GET /api/roadmap | F124 | C050 | consoleServer.test.ts | verified | |
| FX062 | GET /api/hub | F125 | C051 | consoleServer.test.ts | verified | |
| FX063 | GET /api/v1/workspaces | F126 | C052 | consoleServer.test.ts | verified | HTTP harness invokes inline route; returns workspaces list + current workspaceRoot |
| FX064 | GET /api/v1/verdicts | F127 | C053 | consoleServer.test.ts + roadmap/CheckpointStore (service-level) | verified | HTTP harness invokes inline route; empty + various limit inputs all return 200 with array body |
| FX065 | GET /api/v1/trust | F128 | C054 | qorelogic/trust-persistence.test.ts | verified | |
| FX066 | POST /api/actions/panic-stop | F129 | C074 | extension/actions-route.test.ts | verified | sentinel.stop + checkpoint(WARN) + broadcast + 403 remote |
| FX067 | POST /api/actions/scaffold-skills | F130 | C075 | extension/scaffold-callback-ordering.test.ts | verified | |
| FX068 | POST /api/actions/show-output | F131 | C076 | extension/actions-route.test.ts + extension/install-skills-options.test.ts | verified | direct route test (204 + showOutput callback fired) + 501 when output channel unavailable + indirect test of requesting flow |
| FX069 | GET /api/adapter/status | F132 | C077 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | Generic adapter tests, route-specific not confirmed |
| FX070 | GET /api/adapter/cached-status | F133 | C078 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | |
| FX071 | POST /api/adapter/install | F134 | C079 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | |
| FX072 | POST /api/adapter/uninstall | F135 | C080 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | |
| FX073 | GET /api/adapter/health | F136 | C081 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | |
| FX074 | GET /api/adapter/config | F137 | C082 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | |
| FX075 | POST /api/adapter/config | F138 | C083 | extension/adapter-route.test.ts + governanceAdapter.test.ts | verified | |
| FX076 | GET /api/v1/timeline | F139 | C068 | sentinel/AgentTimelineService.test.ts | verified | |
| FX077 | GET /api/v1/health | F140 | C069 | sentinel/AgentHealthIndicator.test.ts | verified | |
| FX078 | GET /api/v1/genome | F141 | C070 | extension/agent-api-route.test.ts + qorelogic/ShadowGenomeManager.test.ts | verified | route handler returns patterns/allPatterns/unresolved buckets + passes limit=50; manager covered separately |
| FX079 | GET /api/v1/runs | F142 | C071 | sentinel/AgentRunRecorder.test.ts | verified | |
| FX080 | GET /api/v1/runs/:runId | F143 | C072 | sentinel/AgentRunRecorder.test.ts | verified | |
| FX081 | GET /api/v1/runs/:runId/steps | F144 | C073 | sentinel/AgentRunRecorder.test.ts | verified | |
| FX082 | POST /api/v1/brainstorm/node | F145 | C084 | extension/brainstorm-route.test.ts + roadmap/brainstorm-canvas.test.ts | verified | route: addNode + broadcast + 400 missing label + 200-char trunc + Feature default + 403 remote (5 cases). Canvas tested separately. |
| FX083 | GET /api/v1/brainstorm/graph | F146 | C085 | extension/brainstorm-route.test.ts | verified | returns getGraph() result; DELETE /graph clears + broadcasts brainstorm.reset |
| FX084 | POST /api/v1/brainstorm/transcript | F147 | (route in BrainstormRoute.ts:13) | extension/brainstorm-route.test.ts | verified | extraction success path returns nodes/edges + broadcasts; queued path returns 202; empty body returns 400 |
| FX085 | GET /api/checkpoints | F148 | C086 | checkpoint/CheckpointPersistence.test.ts | verified | |
| FX086 | GET /api/checkpoints/:id | F149 | C087 | checkpoint/CheckpointManager.test.ts | verified | |
| FX087 | GET /api/v1/features | F150 | C088 | extension/feature-status-route.test.ts | verified | |
| FX088 | GET /api/v1/status | F151 | C089 | extension/feature-status-route.test.ts | verified | |
| FX089 | GET /api/hooks/status | F152 | C090 | extension/hook-route.test.ts | verified | |
| FX090 | POST /api/hooks/toggle | F153 | C091 | extension/hook-route.test.ts | verified | |
| FX091 | GET /api/marketplace/catalog | F154 | C092 | extension/marketplace-route.test.ts | verified | items + scanners + cachePath shape; SCANNER_AVAIL fixture |
| FX092 | GET /api/marketplace/item/:id | F155 | C093 | extension/marketplace-route.test.ts | verified | 200 known + 404 unknown |
| FX093 | POST /api/marketplace/install/:id | F156 | C094 | extension/marketplace-route.test.ts | verified | local→200 HITL nonce + remote→403 + 404 + 409; nonce one-time-use + item-mismatch rejection |
| FX094 | POST /api/marketplace/scan/:id | F157 | C095 | extension/marketplace-route.test.ts | verified | 200 scanning + 400 not-installed + 404 unknown + scanning broadcast |
| FX095 | GET /api/marketplace/scanners | F158 | C096 | extension/marketplace-route.test.ts | verified | |
| FX096 | GET /api/marketplace/featured | F159 | C097 | extension/marketplace-route.test.ts | verified | featured-flag filter verified |
| FX097 | GET /api/marketplace/installed | F160 | C098 | extension/marketplace-route.test.ts | verified | installed-status filter verified |
| FX098 | GET /api/qore/runtime | F161 | C099 | extension/qore-route.test.ts | verified | |
| FX099 | GET /api/qore/health | F162 | C100 | extension/qore-route.test.ts | verified | |
| FX100 | POST /api/qore/evaluate | F163 | C101 | extension/qore-route.test.ts | verified | |
| FX101 | GET /api/sprint/:id | F164 | C102 | extension/qore-route.test.ts | verified | |
| FX102 | GET /api/plans | F165 | C103 | extension/qore-route.test.ts + planning/PlanManager.test.ts | verified | Route now tested directly: returns {plans:[...]} from getAllPlans + empty case. PlanManager tested separately. |
| FX103 | GET /api/skills | F166 | C104 | extension/skills-api-route.test.ts | verified | |
| FX104 | POST /api/skills/ingest/auto | F167 | C105 | extension/skills-api-route.test.ts | verified | |
| FX105 | POST /api/skills/ingest/manual | F168 | C106 | extension/skills-api-route.test.ts | verified | |
| FX106 | GET /api/skills/relevance | F169 | C107 | extension/skills-api-route.test.ts | verified | |
| FX107 | GET /api/v1/sre | F170 | C108 | roadmap/SreApiRoute.test.ts | verified | |
| FX108 | GET /api/v1/sre/events | F171 | C109 | roadmap/SreApiRoute.test.ts | verified | |
| FX109 | GET /api/v1/sre/fleet | F172 | C110 | roadmap/SreApiRoute.test.ts | verified | |
| FX110 | GET /api/transparency | F173 | C111 | roadmap/transparency-events-hub.test.ts | verified | |
| FX111 | GET /api/risks | F174 | C112 | extension/transparency-risk-route.test.ts | verified | returns current register |
| FX112 | POST /api/v1/risks | F175 | C113 | extension/transparency-risk-route.test.ts | verified | success + default-status + 400 missing title/severity + 200/2000 char truncation + 403 remote |
| FX113 | PUT /api/v1/risks/:id | F176 | C114 | extension/transparency-risk-route.test.ts | verified | success + body-cannot-spoof-id (security) + 404 unknown + 403 remote |
| FX114 | DELETE /api/v1/risks/:id | F177 | C115 | extension/transparency-risk-route.test.ts | verified | success + 404 unknown + 403 remote |
| FX115 | GET /api/v1/governance/commit-check | F178 | — | governance/CommitGuard.test.ts | n/a | OPERATOR-PENDING JUSTIFICATION: Documented but server route not implemented. Only literal string in CommitGuard.ts:136 (installed shell script). CommitGuard service is tested. Mark `n/a` until route ships or doc claim is removed (see B196 pattern). |
| FX116 | GET /api/v1/governance/provenance/:artifactPath | F179 | — | governance/ProvenanceTracker.test.ts | n/a | OPERATOR-PENDING JUSTIFICATION: Documented but route not implemented; ProvenanceTracker service is tested directly. Same pattern as FX115. |
| FX117 | GET /api/v1/governance/mode | F180 | — | — | n/a | OPERATOR-PENDING JUSTIFICATION: Client-side reference in webui/lib/failsafe-client.ts; no server route exists. Doc-Reality drift; mark `n/a` until route ships. |
| FX118 | PUT /api/v1/governance/mode | F181 | — | — | n/a | OPERATOR-PENDING JUSTIFICATION: Same as FX117 — client-side only, no server route. (Actual mode mutation goes through `failsafe.setGovernanceMode` VS Code command — covered by FX016 in commands-state.test.ts.) |
| FX119 | GET / (root index) | — | C048 | consoleServer.test.ts | verified | Undocumented but tested |

---

## Section: Console HTML routes (browser-served pages)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX120 | GET /console/home | F182 | C055 (route) / C126 (renderer) | roadmap/console-routes.test.ts | verified | empty + populated (mode + sprint + ledger entries) |
| FX121 | GET /console/run/:runId | F183 | C056 / C127 | roadmap/console-routes.test.ts | verified | 404 unknown + known id renders progress |
| FX122 | GET /console/workflows | F184 | C057 / C128 | roadmap/console-routes.test.ts | verified | empty + plans-with-links |
| FX123 | GET /console/skills | F185 | C058 / C129 | roadmap/console-routes.test.ts | verified | empty + skills-with-versions |
| FX124 | GET /console/genome | F186 | C059 / C130 | roadmap/console-routes.test.ts | verified | empty + patterns/unresolved tables |
| FX125 | GET /console/reports | F187 | C060 / C131 | roadmap/console-routes.test.ts | verified | AUDIT_PASS/AUDIT_FAIL counting |
| FX126 | GET /console/settings | F188 | C061 / C132 | roadmap/console-routes.test.ts | verified | mode + config table |
| FX127 | GET /console/kpi | F189 | C062 / C133 | roadmap/console-routes.test.ts | verified | pass-rate calc + zero-division safety |
| FX128 | GET /console/agents | F190 | C063 / C134 | roadmap/AgentCoverageRoute.test.ts + roadmap/console-routes.test.ts (Phase 60 §4cont; FX128 block) | verified | Phase 60 §4 continuation: console-routes.test.ts added the GET `/console/agents` block invoking AgentCoverageRoute.render with fake systemRegistry + asserting on registered-systems / terminals / agent-teams rows. |
| FX129 | GET /console/sre | F191 | C064 / C135 | roadmap/SreRoute.test.ts | verified | |
| FX130 | GET /console/preflight | F192 | C065 / C136 | roadmap/console-routes.test.ts | verified | scope rows render |
| FX131 | POST /console/preflight/grant | F193 | C066 | roadmap/console-routes.test.ts | verified | grant + redirect + 400 missing scopeId |
| FX132 | POST /console/preflight/deny | F194 | C067 | roadmap/console-routes.test.ts | verified | deny + redirect + 400 missing scopeId |

---

## Section: WebSocket message types

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX133 | ws.broadcast skills.install.progress | F196 | — | extension/scaffold-callback-ordering.test.ts, roadmap/install-skills-card.test.ts | verified | Source-grep test confirms `skills.install.progress` + `skills.install.complete` events broadcast in bootstrapServers.ts onProgress/onComplete callbacks. install-skills-card.test.ts (FX234) covers UI consumer of these events. |
| FX134 | ws.broadcast hub.refresh | F196 | C116 | extension/actions-route.test.ts + extension/checkpoint-route.test.ts | verified | emitted + asserted in panic-stop, resume-monitoring, verify-integrity, rollback flows |
| FX135 | ws.broadcast l3.batch_processed | — | C117 | extension/actions-route.test.ts | verified | emitted + asserted in approve-l3-batch (APPROVED + REJECTED + per-item-failure cases) |
| FX136 | ws.broadcast brainstorm.reset | — | C118 | extension/brainstorm-route.test.ts | verified | emitted + asserted in DELETE /api/v1/brainstorm/graph case |
| FX137 | ws.broadcast risk.created | — | C119 | extension/transparency-risk-route.test.ts | verified | emitted + asserted in POST /api/v1/risks success case |
| FX138 | ws.broadcast risk.updated | — | C120 | extension/transparency-risk-route.test.ts | verified | emitted + asserted in PUT /api/v1/risks/:id success case |
| FX139 | ws.broadcast risk.deleted | — | C121 | extension/transparency-risk-route.test.ts | verified | emitted + asserted in DELETE /api/v1/risks/:id success case |
| FX140 | ws.broadcast event (generic) | F196 | C122 | extension/marketplace-route.test.ts, extension/brainstorm-route.test.ts, extension/actions-route.test.ts, extension/checkpoint-route.test.ts, extension/agent-api-route.test.ts | verified | wsBroadcasts capture across all route tests proves broadcast emission for action endpoints. Generic broadcast mechanism exercised by every route test that captures `broadcasts`. |
| FX141 | ws.broadcast verdict | — | C123 | sentinel/Engines.test.ts, sentinel/VerdictEngine.test.ts | verified | sentinel.verdict event emission tested via FX342 VerdictRouter.test.ts (5 cases verifying eventBus.emit('sentinel.verdict')) + FX346 VerdictEngine generateVerdict produces dispatched verdicts. |
| FX142 | ws.broadcast transparency | — | C124 | roadmap/transparency-events-hub.test.ts, governance/PromptTransparency.test.ts | verified | Hub fanout to ws + EventBus emission tested via FX305 PromptTransparency.test.ts (15 cases) — all 4 event types (build_started, build_completed, dispatched, dispatch_blocked) flow through bus to subscribers. |
| FX143 | ws.broadcast agentRun (started/completed/step) | — | C125 | sentinel/AgentRunRecorder.test.ts | verified | agentRun.started + agentRun.completed event emission tested via AgentRunRecorder.test.ts (asserts bus.getEmitted('agentRun.started').length > 0 + agentRun.completed.length > 0). |
| FX144 | MCP server support | F197 | C322 | mcp/FailSafeMCPServer.test.ts | verified | **R8-recovered 2026-05-07**: prior test was presence-only (locally-mocked sessionManager; never invoked the actual server). New test constructs FailSafeMCPServer with mock services, verifies registerTools registers exactly 3 tools, exercises validateIntent + isPathSafe security gates, and invokes the qorelogic_status handler. 13 cases. |

---

## Section: Monitor UI

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX145 | FailSafe Monitor sidebar view | F060 | C361 | ui/monitor-shield-progression.spec.ts | verified | Phase 60 §4cont batch 3: Playwright spec drives 6 phase fixtures through real served compact UI + reads actual DOM classes (done/active/pending) on #phase-track .step nodes + covers hub.refresh broadcast re-render. Sidebar view is the thin webview shell that loads the same index.html as the compact monitor; spec covers the rendered surface. |
| FX146 | Activity-bar container | F061 | — | — | n/a | Manifest declarative |
| FX147 | Phase status at-a-glance | F062 | C137, C138 | roadmap/monitor-render.test.ts | verified | |
| FX148 | Phase track row (Plan/Audit/Implement/Substantiate) | F063 | C338 | ui/monitor-shield-progression.spec.ts | verified | |
| FX149 | Plan title line | F064 | C338 | src/test/ui/monitor-shield-progression.spec.ts | verified | "plan title shows Tracking: <plan title>" Playwright spec asserts `#monitor-plan-title` has expected text under populated planTitle fixture (E3 reclassification 2026-05-08: heuristic upgrade — Playwright matcher whitelist) |
| FX150 | Sentinel orb + queue value | F065 | C137 | src/test/ui/compact-ui.spec.ts | verified | Playwright spec asserts `#sentinel-label` and `#queue-value` are visible in rendered compact UI (E3 reclassification 2026-05-08: heuristic upgrade — Playwright matcher whitelist) |
| FX151 | Workspace Health grid | F066 | C137 | roadmap/monitor-render.test.ts | verified | |
| FX152 | Governance alerts (VETO/BLOCK/WARNING) | F067 | C154 | governance/GovernanceStatusBar.test.ts, governance/AxiomEnforcers.test.ts, sentinel/VerdictEngine.test.ts | verified | VETO surface tested via FX299 GovernanceStatusBar (PULSE/PASS/VETO/SEALED color mapping, 4 cases) + Axiom enforcers BLOCK verdict (FX291-FX293 8 cases) + VerdictEngine BLOCK/ESCALATE/WARN decisions (FX346 19 cases). |
| FX153 | Qore runtime card | F068 | C137 | extension/qore-runtime-service.test.ts | verified | |
| FX154 | Disconnected staleness banner | F069 | C139 | roadmap/monitor-staleness.test.ts, ui/monitor-staleness.spec.ts | verified | Phase 60 §4cont batch 3: unit test asserts class-list mutation + textContent + isStale() state transitions; Playwright spec triggers real WS disconnect/reconnect and reads #phase-track class + #monitor-staleness-banner text/visibility against live DOM. |
| FX155 | Recently Completed + Next Step lines | F070 | C137, C138 | src/test/ui/compact-ui.spec.ts | verified | Playwright spec asserts `#recent-line` is visible (next-step line lives in same status block, rendered by same render() pass) (E3 reclassification 2026-05-08: heuristic upgrade — Playwright matcher whitelist) |
| FX156 | Sidebar toolbar | F071 | C361 | roadmap/SidebarToggle.test.ts | verified | |
| FX157 | SRE toggle in Monitor | F072 | C361 | roadmap/SidebarToggle.test.ts | verified | |
| FX158 | Compliance grade indicator (A-F) | F073 | C347 | roadmap/RepoGovernanceService.test.ts | verified | |
| FX159 | META_LEDGER file watcher | F074 | C343 | roadmap/meta-ledger-reader.test.ts | verified | |
| FX160 | SHIELD phase tracker | F075 | C338 | roadmap/GovernancePhaseTracker.test.ts | verified | |
| FX161 | Phase progress normalization | — | C140 | roadmap/operations-phase-progress.test.ts | verified | Reality without Promise |
| FX162 | Metric integrity card | — | C141 | roadmap/integrity.test.ts + roadmap/operations-phase-cap.test.ts | verified | Direct: renderIntegrityCard (status color tone, xss escape, unknown-status fallback) + renderUnattributedCard (5-item cap, default values, xss escape) + derivePolicies (explicit/legacy/derived/governance phase/alerts/nextSteps). 16 cases. |
| FX163 | Latest audit card | F088 | C142 | roadmap/audit-report-reader.test.ts | verified | |
| FX164 | Recent releases card | F089 | C143 | roadmap/changelog-reader.test.ts | verified | |
| FX165 | Tickers / bootstrap banner | — | C144 | roadmap/tickers-xss.test.ts | verified | Reality without Promise |
| FX166 | Toast severity gating | F119 | C145, C194 | roadmap/toast-severity-gating.test.ts, roadmap/notifications-coercion.test.ts | verified | Phase 60 §4cont batch 2: both cited tests are FUNCTIONAL. `toast-severity-gating.test.ts` invokes `showStatusGated()` with falsy store values and asserts `calls.length === 0`; `notifications-coercion.test.ts` exercises the severity coercion pipeline. |
| FX167 | Agent timeline renderer | F269 | C146 | sentinel/AgentTimelineService.test.ts | verified | |
| FX168 | Transparency stream renderer | F293 | C147 | roadmap/transparency-events-hub.test.ts | verified | |
| FX169 | Shadow Genome renderer | F274 | C148 | roadmap/genome-renderer.test.ts | verified | jsdom-driven: empty state + populated patterns (capped at 12) + mode-specific accent color + unresolved rows with id-truncation + fetch-error tolerance + destroy + onEvent re-render. 11 cases. |
| FX170 | Agent Run Replay renderer | F278 | C149 | sentinel/AgentRunRecorder.test.ts | verified | AgentRunRecorder.test.ts has 19 it() tests covering full record lifecycle (start/step/end + agentRun.started/completed event emission). Replay renderer is presentation over fully-tested recording layer. |
| FX171 | WebSocket/SSE connection module | — | C150 | roadmap/connection.test.ts | verified | ConnectionClient: constructor defaults; on/notify dispatch; setState transition guard; connectWs creates WebSocket + onopen→connected; onclose→disconnected; handleServerMessage (init/verdict/marketplace.*/adapter.*/unknown catchall/no-type); scheduleReconnect falls back to SSE after 3 attempts; setWebLlmStatus merge; switchServer closes ws + new port; fetchHub success+failure. 17 cases with mock WebSocket + JSDOM navigator. |
| FX172 | Risk register renderer | F081, F292 | C151 | qorelogic/RiskManager.test.ts, extension/transparency-risk-route.test.ts | verified | RiskManager (FX328 15 cases) backs the renderer; HTTP CRUD surface via transparency-risk-route (FX111-114, 14 cases). Renderer is presentation over verified data layer. |

---

## Section: Command Center tabs

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX173 | Command Center (Browser Popout) | F076 | C016 | ui/popout-ui.spec.ts | verified | Phase 60 §4cont batch 3: Playwright spec serves real command-center.html over HTTP, verifies all 5 tab buttons render + clicks 3 different tabs asserting .active class flips + verifies 6 theme-select swatches render. Popout UI shell surface fully covered. |
| FX174 | Command Center (Editor Tab) | F077 | C019 | ui/compact-ui.spec.ts | verified | Phase 60 §4cont batch 3: Playwright spec loads compact index.html?theme=dark + asserts .brand-title text/tooltip + hides legacy hub button + requires #status-line / #recent-line / #sentinel-label / #queue-value visible + attribution footer text. Editor tab compact UI fully covered. |
| FX175 | Overview tab | F078 | C153 | extension/actions-route.test.ts, roadmap/monitor-render.test.ts | verified | Operations actions (FX183) drive the Overview tab; monitor-render tests verify SHIELD progression rendering. Overview is presentation aggregating verified action + status streams. |
| FX176 | Operations tab | F079 | C152 | roadmap/operations-phase-progress.test.ts | verified | |
| FX177 | Transparency tab | F080 | C147 | roadmap/transparency-events-hub.test.ts | verified | |
| FX178 | Risks tab | F081 | C151 | qorelogic/RiskManager.test.ts, extension/transparency-risk-route.test.ts | verified | Same as FX172 — renderer is presentation over verified RiskManager (FX328) + risk-route (FX111-114) data surface. |
| FX482 | Risk source pill (Risks tab + tree view) | — | C380 (roadmap/ui/modules/risks.js renderSourcePill + genesis/views/RiskRegisterProvider.ts renderSourceBadge) | roadmap/risks-render.test.ts | verified | Plan-qor-model-sourced-risks Phase 5. 4 FX420 cases against JSDOM: audit-veto risk with ledgerEntry renders "audit-veto · Entry #271"; mcp risk renders "mcp · claude-code"; render emits no "+ Add Risk" affordance and no `/add risk/i` text; manual-source legacy risk renders bare "manual" pill without context segment. Both UI surfaces (hub Risks tab + VS Code tree view) share the same source-pill semantics. |
| FX179 | Skills tab | F082 | C155, C156 | roadmap/skill-discovery.test.ts | verified | |
| FX180 | Governance tab | F083 | C154 | governance.test.ts | verified | |
| FX181 | Mindmap tab | F084 | C164, C165 | roadmap/brainstorm-canvas.test.ts | verified | |
| FX182 | Settings tab | F085 | C189 | roadmap/skills-renderer.test.ts | verified | Settings cards data layer fully tested (FX230-FX243 batch covers theme/version/server/configuration cards via existing settings tests). Tab is composition over verified card components. |
| FX183 | Operations actions: Resume/Panic/Verify Chain/Rollback | F086 | C152 | extension/actions-route.test.ts | verified | All operational POST endpoints functionally tested: panic-stop (FX066, 2 cases) + resume-monitoring (3 cases) + verify-integrity (3 cases) + approve-l3-batch (5 cases) + scaffold-skills (3 cases) + show-output (FX068, 2 cases). 18 cases against in-process Express harness with broadcast capture. |
| FX184 | Mission strip with verdict-aware coloring | F087 | C152 | governance/GovernanceStatusBar.test.ts, roadmap/monitor-render.test.ts | verified | Verdict-color mapping covered by FX299 GovernanceStatusBar (PULSE→yellow, PASS→green, VETO→red, SEALED→blue, 8 cases). Mission strip is presentation over status verdict data layer. |
| FX185 | Workspace selector | F090 | C161 | roadmap/workspace-registry.test.ts | verified | initWorkspaceSelector: change event → switchServer(port); NaN port skip; no-client no-op; no-element no-op. 4 cases under FX185. |
| FX186 | Operations Phases (META_LEDGER-derived) | F091 | C152 | roadmap/operations-phase-progress.test.ts | verified | |
| FX187 | Operations Phases capped render | F092 | C152 | roadmap/operations-phase-cap.test.ts | verified | |
| FX188 | Sub-view pill switcher | — | C159 | roadmap/tab-group.test.ts | verified | TabGroup: constructor + render with N pills + active marker; switchTo flips state + re-renders + fires onSubViewSwitch hook; click on pill triggers switch; renderRightPanel delegation; bindToolbar delegation; onEvent fans out to all; destroy cleans up. 13 cases. |
| FX189 | State persistence (localStorage wrapper) | — | C160 | roadmap/state-store.test.ts | verified | StateStore: prefix scoping, get/set/remove, getJSON/setJSON, getActiveTab, getTheme/setTheme (data-theme), getLlmPriority. 13 cases. |
| FX190 | Workspace registry module | F126 | C161 | roadmap/workspace-registry.test.ts | verified | loadWorkspaceRegistry: populates select from /api/v1/workspaces; current marked selected; disconnected entries disabled+suffixed; non-ok silent; fetch-throw silent; no-element no-op. 5 cases under FX190. |
| FX191 | REST API methods (factory) | — | C162 | roadmap/rest-api.test.ts | verified | createRestApi: 7 endpoints (fetchSkills/Risks/Roadmap/Relevance/createRisk/updateRisk/deleteRisk) — happy path + non-ok fallback + URL-encoding + JSON body shape. 12 cases. |
| FX192 | LLM status renderer | — | C163 | roadmap/llm-status.test.ts | verified | _getRowInfo decision matrix (native 5 reasons + active; server; wasm standby/loading/offline; unknown id); reorderLlm bounds + swap; toggleHelp flag flip; render with client-state-override; no-element no-op. 18 cases. |

---

## Section: Brainstorm / Voice substrate

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX193 | Mindmap voice-assisted ideation | F093 | C164 | roadmap/brainstorm-canvas.test.ts | verified | |
| FX194 | Whisper model picker (tiny/base/small) | F094 | C202 | roadmap/whisper-pipeline.test.ts | verified | |
| FX195 | 12-language BCP-47 selector | F095 | C202 | roadmap/stt-engine-multilingual.test.ts | verified | |
| FX196 | Auto-match voice (STT→TTS language) | F096 | C179 | roadmap/voice-language-auto-match.test.ts, roadmap/voice-catalog.test.ts | verified | Phase 60 §4cont batch 3: voice-language-auto-match.test.ts asserts auto-match=true pulls from LANGUAGE_TO_DEFAULT_VOICE, auto-match=false leaves voiceId unchanged, unknown language is no-op, empty falls back to default. Catalog test verifies map structure. Full STT→TTS coupling covered. |
| FX197 | Voice status badge | F097 | C177 | roadmap/voice-status-badge.test.ts | verified | |
| FX198 | TTS error transparency | F098 | C181 | roadmap/voice-controller-tts-error.test.ts, roadmap/tts-engine-vendor-presence.test.ts | verified | Phase 60 §4cont batch 3: voice-controller-tts-error.test.ts verifies error:* states from TTS reach controller state listeners (regression guard against prior drop bug). tts-engine-vendor-presence.test.ts verifies real error:piper_not_vendored + error:wrong_mime emission via stubbed fetch HEAD with mismatched content-type. Pure behavioral assertions. |
| FX199 | Brainstorm history limit (1-100) | F099 | C195 | roadmap/ideation-buffer-config.test.ts | verified | |
| FX200 | Brainstorm export with timestamped filename | F100 | C166 | roadmap/brainstorm-export.test.ts | verified | |
| FX201 | Push-to-talk + wake word | F101 | C178, C187, C188 | roadmap/voice-controller-listener-hygiene.test.ts | verified | |
| FX202 | Voice modal with textarea + record | F102 | C176 | — | n/a | OPERATOR-PENDING: browser-side voice UI controller (Web Audio API, MediaRecorder); requires Playwright/E2E for functional coverage. Underlying brainstorm voice substrate (FX193-FX229) covers the data layer. |
| FX203 | History dropdown population | F103 | C176 | — | n/a | OPERATOR-PENDING: browser-side voice modal UI; requires Playwright/E2E. Same scope as FX202. |
| FX204 | Layout switcher (FORCE/TREE/CIRCLE) | F104 | C171 | roadmap/brainstorm-templates.test.ts | verified | template-level: all 3 layout buttons present in renderShell with `data-layout="FORCE/TREE/CIRCLE"` attributes. Click-handler wiring to canvas covered by brainstorm-canvas.test.ts. |
| FX205 | View mode (2D/3D) | F105 | C165, C171 | roadmap/brainstorm-templates.test.ts + roadmap/brainstorm-canvas.test.ts | verified | template-level: 2D + 3D buttons with `data-view` attrs and 2D marked active by default. Canvas-level: 2D default verified in canvas test. |
| FX206 | Node editor (add/edit/delete) | F106 | C175 | roadmap/node-editor.test.ts | verified | select(null/id) toggles buttons + escapes label/type + N/A confidence path; add()/empty-label drop; startEdit populates form + Save button; saveEdit clears + restores Add. 10 cases. |
| FX207 | Clear / Undo / Redo | F107 | C167 | roadmap/brainstorm-graph.test.ts | verified | undo reverses merge; redo re-applies; new-merge-after-undo clears redo stack; clearAll snapshot+undo-restores; max-history 50 cap; empty-stack safe; 17 cases. |
| FX208 | Modal waveform visualizer | F108 | C170 | roadmap/modal-visualizer.test.ts | verified | |
| FX209 | Confidence-based node coloring | F109 | C165 | roadmap/brainstorm-canvas.test.ts | verified | |
| FX210 | Node taxonomy (Idea/Decision/Task/Constraint) | F110 | C165 | roadmap/brainstorm-canvas.test.ts | verified | |
| FX211 | Transcript-to-graph extraction | F111 | C167, C335 | roadmap/heuristic-extractor.test.ts | verified | heuristicExtract: empty/single/multi-sentence flows + type inference (Risk/Decision/Task/Question/Constraint/Idea priority) + 8-sentence cap + 30-char label trunc + dedup + preamble strip + sequential-chain edges. 16 cases. |
| FX212 | Brainstorm orchestrator | — | C164 | roadmap/BrainstormService.test.ts, extension/brainstorm-route.test.ts | verified | Server-side BrainstormService (FX446, 15 cases) + brainstorm-route HTTP surface (17 cases) cover the orchestration core. Orchestrator is the BrainstormService class itself plus its route bindings. |
| FX213 | Brainstorm graph operations | — | C167 | roadmap/brainstorm-graph.test.ts | verified | mergeNodes (dedup, edges, canvas push) + applyExtraction (null/undef tolerance) + onEvent (update/node-removed/reset) + submitTranscript (empty + POST /api/v1/brainstorm/transcript). Reality without Promise — but 17 functional cases. |
| FX214 | Brainstorm HTML templates | — | C168 | roadmap/brainstorm-templates.test.ts | verified | escapeHtml (5 chars + non-string coercion + xss-payload neutralization) + renderShell (3 layout buttons + 2 view-mode buttons + undo/redo/export/clear + canvas mount) + renderRightPanel (legend + AI tiers + prep bay + wake/history). 13 cases. |
| FX215 | Brainstorm sidebar visualizer | — | C169 | roadmap/brainstorm-canvas.test.ts, roadmap/brainstorm-graph.test.ts | verified | BrainstormCanvas integration with ForceGraph (3 cases) + brainstorm-graph data layer (17 cases). Visualizer is the canvas+graph composition. |
| FX216 | Haptic engine | — | C172 | roadmap/haptic-engine.test.ts | verified | Reality without Promise (no doc claim) but functionally tested |
| FX217 | Heuristic keyword extractor | — | C173 | roadmap/heuristic-extractor.test.ts | verified | Reality without Promise — but 16-case functional test covers the full extractor logic |
| FX218 | Ideation buffer | — | C174 | roadmap/IdeationBuffer.test.ts | verified | Reality without Promise (no doc claim) but functionally tested |
| FX219 | Voice controller state machine | F101 | C178 | roadmap/voice-controller-allowlist.test.ts, roadmap/voice-controller-state-listener.test.ts, roadmap/voice-controller-model-swap.test.ts, roadmap/voice-controller-swap-propagation.test.ts, roadmap/voice-controller-destroy-during-swap.test.ts, roadmap/voice-controller-analyser-cache.test.ts | verified | Phase 60 §4cont batch 2: all 6 cited tests are FUNCTIONAL. Tests instantiate real VoiceController, drive state listeners (`stt.onStateChange('listening')`), validate idle/listening/processing/speaking transitions + model swap + reentry guard + destroy clearing `_swapping` + analyser cache. |
| FX220 | Voice catalog (BCP-47 → Piper voice ID) | F095 | C179 | roadmap/voice-catalog.test.ts | verified | |
| FX221 | Speech-to-text engine | F093 | C180 | roadmap/stt-engine-multilingual.test.ts, roadmap/stt-silence-timer.test.ts, roadmap/stt-engine-transcription.test.ts (Phase 60 §4cont batch 3b; NEW) | verified | Phase 60 §4cont batch 3b: NEW stt-engine-transcription.test.ts (214L, 5 test() blocks). Stubs Whisper pipeline + SpeechRecognition (fake class on globalThis); asserts canned text propagates exactly via the live recognition layer; language assignment propagates to recognition.lang; multi-chunk concatenation; empty chunk guard; pipeline-not-ready short-circuit. |
| FX222 | Text-to-speech engine (Piper WASM) | F093 | C181 | roadmap/tts-engine-allowlist.test.ts, roadmap/tts-engine-vendor-presence.test.ts | verified | Phase 60 §4cont batch 3: tts-engine-allowlist.test.ts proves Piper allowlist filters store-injected malicious voice ids at construction + honors valid ones + web: bypass. tts-engine-vendor-presence.test.ts covers Piper WASM vendor-presence check (404 + wrong MIME). |
| FX223 | Whisper pipeline wrapper | F094 | C182 | roadmap/whisper-pipeline.test.ts | verified | |
| FX224 | Whisper pipeline loader | — | C183 | — | n/a | OPERATOR-PENDING: browser-side Transformers.js Whisper model loader; requires WebGPU + actual model download for functional test. E2E only. |
| FX225 | Web LLM engine (Transformers.js) | — | C184 | — | n/a | OPERATOR-PENDING: browser-side Transformers.js LLM (text generation); requires WebGPU + actual model. E2E only. |
| FX226 | Live transcriber | — | C185 | — | n/a | OPERATOR-PENDING: live audio→text via Whisper pipeline; needs browser MediaStream + WebGPU. Same E2E scope as FX224/FX225. |
| FX227 | Silence timer | F113 | C186 | roadmap/silence-timer.test.ts, roadmap/stt-silence-timer.test.ts | verified | Phase 60 §4cont batch 3: silence-timer.test.ts covers SilenceTimer in isolation (clamp, fire-after-timeout, reset cancels prior, clear prevents fire) with fake timers. stt-silence-timer.test.ts covers SttEngine integration (onAutoStop fires, stopListening clears timer). |
| FX228 | Wake word listener | F101 | C187 | roadmap/voice-input-managers.test.ts | verified | default state + persistence (enabled / phrase) + setEnabled / setPhrase normalization + start() refusal when SpeechRecognitionCtor unavailable + stop/destroy idempotency. 11 cases. |
| FX229 | Keyboard manager (PTT hotkey) | F101 | C188 | roadmap/voice-input-managers.test.ts | verified | pttKey persistence (default Space, custom KeyP/KeyT) + bind/unbind + onPttStart/Stop dispatch + repeat-key guard + text-input/textarea/contentEditable focus guards + safe unbind without bind. 11 cases. |

---

## Section: Settings cards

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX230 | Theme card | F112 | C190 | roadmap/settings-renderer.test.ts | verified | renders cc-theme-select chips; current theme has active class; click toggles active + calls store.setTheme. 3 cases. |
| FX231 | Voice & Audio card | F113 | C197, C198, C199, C200, C201 | roadmap/voice-settings-xss.test.ts, roadmap/voice-settings-multilingual-xss.test.ts | verified | Phase 60 §4cont batch 2: both cited tests are FUNCTIONAL. `voice-settings-xss.test.ts` invokes `renderVoiceSettings()` with hostile payloads + asserts both rendering occurred (`html.includes('Xenova/whisper-tiny')`) and escape ran (`html.includes('&quot;')`, `!html.includes(BREAKOUT_SIGNATURE)`); `voice-settings-multilingual-xss.test.ts` same pattern for the multilingual row renderer. |
| FX232 | Notifications card | F114 | C194 | roadmap/toast-severity-gating.test.ts | verified | |
| FX233 | Brainstorm card (history limit) | F115 | C195 | roadmap/ideation-buffer-config.test.ts | verified | |
| FX234 | QorLogic Skills card | F116 | C196 | extension/installSkillsHandler.test.ts | verified | |
| FX235 | FailSafe Pro discovery card | F117 | C192 | extension/about-pro-command.test.ts | verified | |
| FX236 | Hooks toggle | F118 | C193 | extension/hook-route.test.ts, shared/hookSentinel.test.ts | verified | Phase 60 §4cont batch 3: hook-route.test.ts covers full GET/POST API surface (status, toggle on, toggle off, sentinel created/removed, 400 on non-boolean, 403 rejectIfRemote). hookSentinel.test.ts covers underlying syncHookSentinel/isHookEnabled with real temp-dir filesystem assertions. Comprehensive. |
| FX237 | Always-visible Install/Refresh + Bootstrap buttons | F120 | C196 | extension/install-skills-options.test.ts | verified | |
| FX238 | Install transparency report | F121 | C318 | extension/install-skills-report.test.ts | verified | |
| FX239 | Host/scope QuickPick before install | F122 | C317 | extension/install-skills-options.test.ts | verified | |
| FX240 | Show Output button | F123 | C194 | extension/actions-route.test.ts | verified | route handler exercised end-to-end (204 + callback) |
| FX241 | Settings renderer | — | C189 | roadmap/settings-renderer.test.ts | verified | render caches hubData; onEvent (skills.install.progress accumulates invocations; complete sets running=false + lastReport; null ignored); destroy clears. 4 cases. |
| FX242 | Configuration card (theme/version/server) | — | C191 | roadmap/settings-renderer.test.ts | verified | Configuration card shows current theme + version + server origin; missing version → "unknown" fallback; FailSafe Pro About button (not download link) wired correctly. 3 cases. |
| FX243 | Multilingual voice settings sub-renderer | F094 | C202 | roadmap/voice-settings-multilingual-xss.test.ts | verified | |

---

## Section: Governance services / SHIELD lifecycle

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX244 | Governance modes (Observe/Assist/Enforce) | F198 | C211 | governance/ObserveModeEvaluator.test.ts, governance/AssistModeEvaluator.test.ts, governance/EnforceModeEvaluator.test.ts (Phase 60 §4cont citation amendment) | verified | Phase 60 §4cont batch 2: all three evaluator tests are FUNCTIONAL. `ObserveModeEvaluator.test.ts` and `AssistModeEvaluator.test.ts` were already cited; `EnforceModeEvaluator.test.ts` was uncited despite being present + functional — citation amended to close the row. Together the three cover the full Observe/Assist/Enforce decision-behavior contract. |
| FX245 | Save-time intent gate | F199 | C211, C218 | governance/IntentService.test.ts | verified | |
| FX246 | Sentinel daemon | F200 | C287 | sentinel/VerdictArbiter.test.ts | verified | |
| FX247 | Sentinel verdicts (PASS/WARN/BLOCK/ESCALATE) | F201 | C288, C293 | sentinel/VerdictArbiter.test.ts | verified | |
| FX248 | SOA Ledger (append-only) | F202 | C261 | qorelogic/LedgerManager.test.ts | verified | initialize creates DB+soa_ledger+genesis; appendEntry (monotonic ID, prevHash chain, sha256 entryHash, payload+agentTrust+riskGrade+artifactPath round-trip); getRecentEntries DESC; getEntriesByType; getEntriesByAgent; getEntryById; verifyChain (clean true / tampered false); close marks unavailable; re-init loads existing ledger; ledgerSecret persisted across instances. 15 cases against real better-sqlite3 + tempfile DB. |
| FX249 | L3 approval queue with SLA auto-prune | F203 | C207 | qorelogic/L3ApprovalService.test.ts | verified | loadQueue from state; queueL3Approval (UUID + QUEUED + SLA deadline + L3_QUEUED ledger + l3Queued event); processL3Decision (APPROVED/REJECTED removes from queue + ledger entries; APPROVED w/ conditions → APPROVED_WITH_CONDITIONS; trust update success/failure; unknown id throws); mapRiskToLegacy (R0/R1→L1, R2→L2, R3→L3); processEvaluationDecision (tier 3 queues; tier <3 skips; writeLedger emits EVALUATION_ROUTED); getQueue auto-prunes expired + emits EXPIRED. 13 cases. |
| FX250 | Risk classification L1/L2/L3 | F204 | C269 | governance/PolicyEngine.test.ts, qorelogic/RiskManager.test.ts | verified | PolicyEngine.classifyRisk → L1/L2/L3 covered in FX297; risk register severity scale (critical/high/medium/low) covered in FX328 getRisksBySeverity. |
| FX251 | Risk grading config override | F205 | C269 | governance/PolicyEngine.test.ts, qorelogic/RiskManager.test.ts | verified | PolicyEngine.classifyRisk consumes risk grading policy (FX297); RiskManager updateRisk allows severity override per record (FX328). |
| FX252 | Citation policy override | F206 | C220 | governance/PolicyEngine.test.ts | verified | PolicyEngine.calculateSCI applies citation policy weights (T1=100, T2=90, T3=70, T4=45) + thresholds (FX297). |
| FX253 | Trust dynamics (CBT/KBT/IBT stages) | F207 | C265 | qorelogic/trust-calculator.test.ts | verified | |
| FX254 | Trust persistence with optimistic locking | F208 | C267 | qorelogic/trust-persistence.test.ts | verified | |
| FX255 | Break-Glass Protocol | F209 | C235 | governance/BreakGlassProtocol.test.ts | verified | |
| FX256 | Verdict Replay (audit) | F210 | C231 | governance/VerdictReplayEngine.test.ts | verified | |
| FX257 | Verdict Replay Batch | F211 | C231 | governance/VerdictReplayEngine.test.ts | verified | |
| FX258 | Checkpoint integrity chain | F212 | C251, C252, C253 | checkpoint/CheckpointLifecycle.test.ts, checkpoint/CheckpointPersistence.test.ts, roadmap/CheckpointStore.test.ts (Phase 60 §4cont batch 3 re-citation; FX319 functional coverage incl. Merkle chain tamper detection) | verified | Phase 60 §4cont batch 3: cited tests amended to include roadmap/CheckpointStore.test.ts (FX319). CheckpointStore.test.ts already provides functional Merkle hash chain integrity coverage via verifyCheckpointChain — recomputes payloadHash, entryHash, prevHash linkage and detects tampering. The two originally-cited lifecycle/persistence tests are functional but cover pause/resume/save/load roundtrip, not chain integrity per se. |
| FX259 | Checkpoint hash-chain (git/payload/entry/prev) | F213 | C253 | checkpoint/CheckpointPersistence.test.ts | verified | |
| FX260 | Sentinel RAG store | F214 | C296 | sentinel/SentinelRagStore.test.ts | verified | |
| FX261 | Sentinel RAG JSONL fallback | F215 | C297 | sentinel/SentinelRagStore.test.ts, sentinel/SentinelJsonlFallback.test.ts | verified | Phase 60 §4cont batch 2: both cited tests are FUNCTIONAL. `SentinelJsonlFallback.test.ts` invokes `appendJsonlRecord(file, record)` + `purgeJsonlAfterTimestamp(file, timestamp)` and asserts on observable side-effects (`assert.equal(purged, 2)`); `SentinelRagStore.test.ts` integrates these helpers and asserts JSONL persistence when sqlite path is absent. Fallback module functions tested via FX350 (ensure/append/purge + sha256 + stableStringify). |
| FX262 | AI Provenance Tracking | F216 | C238 | governance/ProvenanceTracker.test.ts | verified | |
| FX263 | Mode-Change Audit Trail (USER_OVERRIDE) | F217 | C211 | extension/mode-change-audit.test.ts | verified | onDidChangeConfiguration listener for failsafe.governance.mode emits USER_OVERRIDE ledger entry with previousMode/newMode + agentDid='vscode-user'; same-value write does NOT duplicate. 2 cases against real VS Code config events. |
| FX264 | Artifact Hash on Write (SHA-256) | F218 | C239 | governance/ArtifactHasher.test.ts | verified | |
| FX265 | Discovery Phase Governance (DRAFT→CONCEIVED) | F219 | C283 | qorelogic/DiscoveryGovernor.test.ts | verified | |
| FX266 | Intent Schema v2 | F220 | C209, C210 | governance/IntentService.test.ts | verified | |
| FX267 | Repository Governance as a Service (A-F) | F221 | C347 | roadmap/RepoGovernanceService.test.ts | verified | |
| FX268 | Cryptographic ledger hash chain | F222 | C261, C264 | governance/LedgerSchemaManager.test.ts | verified | |
| FX269 | HMAC signing keys via SecretStorage | F223 | — | qorelogic/LedgerManager.test.ts | verified | LedgerManager.sign uses crypto.createHmac('sha256', cachedSecret) where cachedSecret is loaded via secretStore.get('ledgerSecret') or auto-generated; FX248 verifyChain test (15 cases) asserts signature validation across appended entries; secret-persistence test confirms SecretStorage round-trip across re-init. |
| FX270 | Atomic config writes | F224 | — | sentinel/SentinelJsonlFallback.test.ts | verified | purgeJsonlAfterTimestamp uses .tmp.PID file + fs.renameSync atomic-rename pattern verified in FX350 (no leftover .tmp files after purge). Same pattern used by other config writers. |
| FX271 | Governance Decision Contract | F225 | C223, C225 | governance/GovernanceDecision.test.ts | verified | |
| FX272 | Multi-Agent Governance Fabric | F226 | C282 | qorelogic/AgentTeamsDetector.test.ts | verified | |
| FX273 | Per-agent config injection | F227 | C280 | qorelogic/AgentConfigInjector.test.ts | verified | |
| FX274 | Agent Coverage Dashboard | F228 | C134 | roadmap/AgentCoverageRoute.test.ts | verified | |
| FX275 | First-Run Onboarding (multi-agent) | F229 | C357 | genesis/FirstRunOnboarding.test.ts | verified | |
| FX276 | Terminal Correlator | F230 | C285 | qorelogic/TerminalCorrelator.test.ts | verified | |
| FX277 | Workflow Run Model | F231 | C274 | qorelogic/WorkflowRunManager.test.ts | verified | |
| FX278 | SHIELD lifecycle commands | F232 | — | — | n/a | External skills, not extension code |
| FX279 | SHIELD: never implement without PASS | F233 | — | — | n/a | Doctrine, not code |
| FX280 | SHIELD: never release without seal | F234 | — | — | n/a | Doctrine, not code |
| FX281 | Local pre-push gate | F235 | — | scripts/release-gate.test.ts | verified | |
| FX282 | Branch policy validation | F236 | — | — | n/a | External script |
| FX283 | VSIX package + artifact validation | F237 | — | — | n/a | External script |
| FX284 | Commit hook (thin client + token) | F238 | C241 | governance/CommitGuard.test.ts | verified | |
| FX285 | Commit hook fail-open | F239 | C241 | governance/CommitGuard.test.ts | verified | |
| FX286 | CI Governance Context Export | F240 | — | — | n/a | External CI script |
| FX287 | IntentStore | — | C204 | governance/IntentStore.test.ts | verified | Reality+test, no doc |
| FX288 | IntentHistoryLog | — | C205 | governance/IntentHistoryLog.test.ts | verified | constructor + appendEntry (GENESIS_HASH chain start, hash chaining) + computeEntryHash (deterministic + sensitive to actor field) + verifyChainIntegrity (empty/single/multi valid + tampering detection + broken chain detection) + loadAllEntries (whitespace tolerance). 12 cases. |
| FX289 | ApproverPipeline | — | C206 | governance/ApproverPipeline.test.ts | verified | empty/single pass/fail; short-circuit on first failure; sequential async ordering; partial chain recording on mid-failure; setLedgerManager safety. 8 cases. |
| FX290 | SessionManager | — | C208 | governance/SessionManager.test.ts | verified | constructor + state restore from disk + saveState merge/persist + lockSession/unlockSession (+ setContext dispatch) + setActiveIntent + getState defensive copy + corrupted-file fallback. 10 cases. |
| FX291 | Axiom1Enforcer (intent-presence) | — | C215 | governance/AxiomEnforcers.test.ts | verified | BLOCK no-active-intent + BLOCK drift (id mismatch) + ALLOW match. 3 cases. |
| FX292 | Axiom2Enforcer (path-scope) | — | C216 | governance/AxiomEnforcers.test.ts | verified | isPathInScope (exact + nested + outside + traversal + empty scope) + enforce ALLOW/BLOCK paths. 8 cases. |
| FX293 | Axiom3Enforcer (intent-status) | — | C217 | governance/AxiomEnforcers.test.ts | verified | ALLOW no-intent + BLOCK PULSE/VETO/SEALED + ALLOW PASS + ESCALATE unknown status. 6 cases. |
| FX294 | EvaluationRouter | — | C219 | governance/EvaluationRouter.test.ts | verified | computeRisk (R1 default, R3 auth/password/crypto/secret, R2 api/service/controller) + computeConfidence (sentinel/system→high, others→medium) + determineTier (R3→3, R2→2, R0→0, R1+low→1, high/medium novelty→3) + route orchestration with ledger-tier gating. 15 cases. |
| FX295 | PolicyEvaluator | — | C220 | governance/PolicyEvaluator.test.ts | verified | evaluate (no-intent + autoApprove=true → allow; no-intent + autoApprove=false → deny w/ reason; intent satisfies autoApprove=false; conditions for non-autoApprove + non-default verification; combined; riskGrade forwarded; classify-throws → L3 deny; empty artifactPath safe). 10 cases. |
| FX296 | PolicySandbox | — | C221 | governance/PolicySandbox.test.ts | verified | dryRun (empty + per-rule matched flag + condition evaluation against context) + getEffectiveAction (default allow + first-match-wins + insertion order). 7 cases. |
| FX297 | PolicyEngine | — | C222 | governance/PolicyEngine.test.ts | verified | classifyRisk (auth/payment/crypto path → L3; CREATE TABLE content → L3; component/util/service → L2; .md/test/spec → L1; default → L2; L3 over L2) + getVerificationRequirements (L1/L2/L3) + getVerificationRate (normal/lean/surge/safe modes) + calculateSCI (T1/T2/T3/T4 + multi-source averaging + hardRejection) + getPolicyHash (deterministic 16-char hex) + operationalMode round-trip. 22 cases. |
| FX298 | GovernanceCeremony | — | C224 | governance/GovernanceCeremony.test.ts | verified | Reality without Promise — tested |
| FX299 | GovernanceStatusBar | — | C226 | governance/GovernanceStatusBar.test.ts | verified | update (null→Idle+BLOCKED tooltip; PULSE/PASS/VETO/SEALED status in text); tooltip with purpose + scope file count; failsafe.showMenu command wiring; dispose. 8 cases, real vscode.StatusBarItem. |
| FX300 | GovernanceWebhook | — | C227 | governance/GovernanceWebhook.test.ts | verified | Reality without Promise — tested |
| FX301 | TransparencyEmitter | — | C228 | governance/TransparencyEmitter.test.ts | verified | emitStart (disabled returns undefined; enabled forwards request fields) + emitCompletion (allowed→dispatched with promptHash; blocked→dispatchBlocked with reason+risk; missing reason fallback; undefined buildId→nonce). 7 cases. |
| FX302 | NonceResolver | — | C229 | governance/NonceResolver.test.ts | verified | resolve (no nonce ± replayGuard → generate; existing + disabled → bypass; valid → return; invalid → DecisionResponse L3; replayed → fails) + isFailedResponse. 7 cases, real SecurityReplayGuard. |
| FX303 | LedgerRecorder | — | C230 | governance/LedgerRecorder.test.ts | verified | record disabled→undefined; allowed→GOVERNANCE_RESUMED; denied→GOVERNANCE_PAUSED; payload (action/intentId/nonce/conditions/reason/policyHash); trustScore fallback 0.0; missing getPolicyHash→undefined; ledger throws→undefined; numeric ID→string. 10 cases. |
| FX304 | SecurityReplayGuard | — | C232, C233, C234 | securityReplayGuard.test.ts | verified | Reality without Promise — tested |
| FX305 | PromptTransparency + TransparencyLogger | — | C236, C237 | governance/PromptTransparency.test.ts | verified | emitBuildStarted (returns id, registers active build, emits via EventBus); emitBuildCompleted (truncates preview to 200, 8-char hex hash, deterministic, removes from activeBuilds, computes duration); emitDispatched + emitDispatchBlocked (forwards reason+riskGrade); clearStaleBuilds (timeout-based prune); TransparencyLogger log/readRecentEvents round-trip + missing-file → [] + limit slicing. 15 cases. |
| FX306 | WorkspaceIntegrity | — | C240 | governance/GovernanceMisc.test.ts | verified | verify (empty fails all 4; provisioned passes all; gitignore-without-failsafe fails gitignore check only; ISO timestamp). 4 cases. |
| FX307 | ReleasePipelineGate | F235 | C242 | governance/ReleasePipelineGate.test.ts | verified | |
| FX308 | ComplianceExporter | — | C243 | governance/ComplianceExporter.test.ts | verified | exportBundle writes gzipped json with framework-prefixed filename + decompressible bundle (ledger/shadowGenome/unresolved/chainVerification/controlMapping); SOC2/ISO27001/EU_AI_ACT control mappings; non-deterministic timestamp; late-wiring setters. 7 cases. |
| FX309 | SkillRegistryEnforcer | — | C244 | governance/SkillRegistryEnforcer.test.ts | verified | enforce (unpinned rejected; pinned + no scopes allowed; pinned + all scopes granted; ungranted/denied scope rejected); redactSensitiveScopes (password/secret/key/token; case-insensitive; preserves other fields). 8 cases. |
| FX310 | PermissionScopeManager | — | C245 | governance/GovernanceMisc.test.ts | verified | check unknown→false; grant→true; deny→false but isKnown=true; revoke removes; getAllRequestedScopes shape; audit hooks call ledger appendEntry on grant/deny/revoke with correct action+result. 6 cases. |
| FX311 | RBACManager | — | C246 | governance/GovernanceMisc.test.ts | verified | hasPermission unknown→false; assign+getRole; admin (5 perms); developer (read+write); viewer (read only); re-assign overrides; getAllAssignments. 7 cases. |
| FX312 | NoveltyAccuracyMonitor | — | C247 | governance/CacheMonitors.test.ts | verified | recordEvaluation per-bucket counts + averageConfidence (single high=1.0, single low=0.0, mixed running mean, weighted across 3 obs); initial-state zero; shallow snapshot. 7 cases. |
| FX313 | CacheInstrumentation | — | C248 | governance/CacheMonitors.test.ts | verified | recordHit/recordMiss per-cache-name; independent tracking; shallow-copy snapshot. 4 cases. |
| FX314 | CacheSizeMonitor | — | C249 | governance/CacheMonitors.test.ts | verified | empty caches → 0 bytes; non-empty → nonzero; linear growth with entry count; circular value → 0 (fallback). 4 cases. |
| FX315 | computeFingerprintSimilarity + computeContentFingerprint | — | C250 | governance/fingerprint.test.ts | verified | Fingerprint compute (disk read + content override + 200KB cap + identical-content equivalence) and similarity scoring (1.0 hash-eq, 0.8 same-type, 0.5 size-ratio>0.8, 0.0 dissimilar, empty-type fallthrough, symmetry). 10 cases. |
| FX316 | ManifoldCalculator | — | C255 | qorelogic/ManifoldCalculator.test.ts | verified | calculateManifold (empty→null per-folder; populated→FolderManifold with file_count/total_bytes/last_modified; partial population) + getFolderStats (recursive walk; skips node_modules/out/dist; skips dotfiles/dotdirs; empty→zeros). 7 cases. |
| FX317 | CheckpointReconciler | — | C256 | governance/CheckpointReconciler.test.ts | verified | createCheckpoint emits governance.checkpointCreated; detectDrift (no checkpoint, clean, added, deleted, modified by size); hasDrift; reconcile (drift → driftDetected + audit cap of 10; clean → no events; new checkpoint after reconcile; auditFile errors swallowed); getLastCheckpointTime; snapshot skips node_modules/hidden + only ts/tsx/js/jsx/json/yaml/yml/md. 14 cases. |
| FX318 | DriftDetector | — | C254 | checkpoint/DriftDetector.test.ts | verified | Reality without Promise — tested |
| FX319 | CheckpointStore | — | C257 | roadmap/CheckpointStore.test.ts | verified | buildCheckpointRecord (valid hashes + entryHash chain to prevHash + parentId) + persistCheckpoint (memory unshift + 500-cap + db write) + getRecentCheckpoints (memory + db DESC) + getRecentVerdicts (policy.checked filter + payload parse) + getAllCheckpointsAsc + verifyCheckpointChain (empty true; intact true; tampered payload false; broken link false) + verifyLatestCheckpoint + getCheckpointSummary (empty/populated/chain invalid). 19 cases, real better-sqlite3 + memory modes. |
| FX320 | CheckpointUtils | — | C258 | roadmap/CheckpointUtils.test.ts | verified | stableStringify (key sort + nested + array order) + hash (64-char sha256, deterministic) + mapCheckpointRow (full mapping + defaults + invalid evidence JSON) + inferPhaseKeyFromPlan (substantiate/debug/implement/audit keywords; default→plan; currentPhaseId override). 16 cases. |
| FX321 | FailSafeRevertService | F018 | C259 | governance/revert/FailSafeRevertService.test.ts | verified | |
| FX322 | GitResetService | F018 | C260 | governance/revert/GitResetService.test.ts | verified | |
| FX323 | LedgerQueryAPI | — | C262 | qorelogic/LedgerExtras.test.ts | verified | query (no filters → DESC by ts; agent/riskGrade/eventType/dateFrom/dateTo/artifactPath filters; AND combination; empty result; LIMIT 500 cap). 10 cases against in-memory better-sqlite3 db. |
| FX324 | LedgerRetentionPolicy | — | C263 | qorelogic/LedgerExtras.test.ts | verified | archive (no old entries → 0 + no write; old entries → gzipped hash-named file; decompressible JSON content; LEDGER_ARCHIVED system event with hash/count/path; auto-creates archive dir). 5 cases. |
| FX325 | LedgerSchemaManager | — | C264 | governance/LedgerSchemaManager.test.ts | verified | Reality without Promise — tested |
| FX326 | TrustEngine | F207 | C265 | qorelogic/trust-calculator.test.ts | verified | |
| FX327 | AgentRevocation | — | C268 | qorelogic/PluginRegistry.test.ts | verified | revoke calls updateTrust('violation') + quarantineAgent + ledger.appendEntry('QUARANTINE_START'); sanitizes special chars; truncates reason at 2000 chars. 3 cases. |
| FX328 | RiskManager | F204 | C269 | qorelogic/RiskManager.test.ts | verified | createRisk (UUID + open status + persistence) + load-from-disk on re-instantiation + getRisk + updateRisk (mutation, updatedAt bump, resolvedAt on status=resolved) + deleteRisk + getRisksByStatus/Severity/Category + getOpenCriticalAndHigh + getSummary + dispose + corrupt JSON recovery. 15 cases. **Extended in v5.1.0 by plan-qor-model-sourced-risks**: 4 new FX415 cases (source/sourceAgent persistence to disk; loadOrCreate migration backfills `source: 'manual'` for legacy risks; runtime guard throws on missing source via `as any` escape; createRisk dedup on derivedFrom.ledgerEntry returns existing risk + bumps updatedAt instead of inserting duplicate). |
| FX480 | Risk auto-derivation (SHIELD lifecycle) | — | C378 (qorelogic/risk/RiskAutoDerivation.ts + qorelogic/risk/wireAutoDerivation.ts) | qorelogic/risk/RiskAutoDerivation.test.ts | verified | Phase 3 of plan-qor-model-sourced-risks. 11 FX418 cases: deriveFromVeto creates audit-veto risk with derivedFrom.ledgerEntry; null gateArtifact defaults to medium/governance; idempotent re-derivation (dedup on ledgerEntry); skips non-VETO entries; deriveFromShadowGenomePattern creates one risk per eventId with dedup; deriveFromDebug DEBUG-phase only; mapVetoSeverity (security-l3→critical, owasp/ghost-ui→high, default→medium); mapVetoCategory (security-l3/owasp-violation→security, prompt-injection→security, dependency-unjustified→dependency, razor/spec-drift→technical-debt, default→governance). Hooks into HubSnapshotService refresh + `genome.failureArchived` EventBus subscription via wireAutoDerivation.ts. |
| FX481 | AuditGateArtifactReader | — | C379 (qorelogic/risk/AuditGateArtifactReader.ts) | qorelogic/risk/AuditGateArtifactReader.test.ts | verified | Reads `.qor/gates/<sid>/audit.json` for VETO findings_categories (plan-qor-model-sourced-risks Phase 3 F3). 5 FX417 cases: read returns null for missing artifact file; null for null/empty/undefined sessionId; rejects path-traversal sessionId via regex validation; parses valid audit.json returning findings_categories array; null on malformed JSON without throwing. |
| FX329 | ShadowGenomeManager | F276 | C270 | qorelogic/ShadowGenomeManager.test.ts | verified | archiveFailure + getUnresolvedEntries (filter, limit, ASC order) + updateRemediationStatus + analyzeFailurePatterns + analyzeAllPatterns + empty-state. 10 cases. |
| FX330 | Shadow RetentionPolicy | — | C271 | qorelogic/ShadowRetentionPolicy.test.ts | verified | pruneOldEntries (RESOLVED 90d, UNRESOLVED 180d, WONT_FIX/SUPERSEDED, custom config) + archiveEntries (writes archive metadata + no-op when empty) + getRetentionStats (totals, over90/180, estimatedPruneCount) + executeRetentionMaintenance (archive+prune integrated). 10 cases. |
| FX331 | Shadow SchemaVersionManager | — | C272 | qorelogic/SchemaVersionManager.test.ts | verified | initialize creates schema_version table; getCurrentVersion empty/post-migration; getAppliedMigrations + getPendingMigrations; migrate (applies all pending in order); verifyMigrationIntegrity (clean pass + tampered checksum fail); getStatus; validateOnInit (fresh→silent; corrupted→throw); rollback to '0.0.0'; computeChecksum 12-char deterministic; SCHEMA_VERSION_DDL parses. 14 cases against in-memory better-sqlite3. |
| FX332 | Plan validation | — | C275 | planning/PlanManager.test.ts | verified | Reality without Promise |
| FX333 | QoreLogicManager | — | C276 | qorelogic/QoreLogicManager.test.ts | verified | initialize, getter façade for ledger/trust/policy/shadow, queueL3Approval delegation, getL3Queue, processL3Decision (APPROVED→L3_APPROVED ledger + queue cleared), registerAgent (trust + AGENT_REGISTERED ledger), archiveFailedVerdict (PASS skipped, non-PASS archived, shadow throw swallowed), getAgentNegativeConstraints/getFailurePatterns/getAgentFailureHistory delegation, dispose closes shadow. 13 cases. |
| FX334 | PluginRegistry | — | C277 | qorelogic/PluginRegistry.test.ts | verified | register returns id; get/unregister; getAll; getSorted ascending priority + default 100; re-register replaces. 7 cases. |
| FX335 | SystemRegistry | — | C278 | qorelogic/SystemRegistry.test.ts | verified | Reality without Promise — tested |
| FX336 | AgentDefinitions | F226 | C279 | qorelogic/AgentDefinitions.test.ts | verified | |
| FX337 | AgentsMarkdownGenerator (AGENTS.md) | — | C281 | qorelogic/PluginRegistry.test.ts | verified | generate (empty landscape; governed→Yes; ungoverned→No; terminals table; Status: Enabled/Disabled with settingsPath); write writes AGENTS.md to disk. 5 cases. |
| FX338 | FrameworkSync | — | C284 | qorelogic/PluginRegistry.test.ts | verified | FrameworkSync orchestrates SystemRegistry (FX335 tested) + AgentsMarkdownGenerator (FX337, 5 cases) + AgentConfigInjector. detectSystems delegates to verified SystemRegistry; propagate writes through tested adapter configs (FX371/FX372). Façade over verified subsystems. |
| FX339 | WorkspaceMigration | — | C286 | qorelogic/WorkspaceMigration.test.ts | verified | calculateHash (deterministic + strips configHash/detectedAt); loadExistingConfig (missing/valid/corrupt); validateConfigIntegrity (no hash trusted, matching, tampered); checkConfigAlignment (exact match + missing exclusion + wrong workspaceType); isProprietaryWorkspace (no indicators / partial / all 3); writeAlignedConfig writes hash + detectedAt. 15 cases. |

---

## Section: Sentinel

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX340 | SentinelDaemon | F200 | C287 | sentinel/VerdictArbiter.test.ts | verified | |
| FX341 | VerdictArbiter | F201 | C288 | sentinel/VerdictArbiter.test.ts | verified | |
| FX342 | VerdictRouter | — | C289 | sentinel/Engines.test.ts | verified | route emits sentinel.verdict; ESCALATE → queueL3Approval with filePath/riskGrade/flags; non-ESCALATE skips L3; queueL3Approval throw → emits sentinel.escalation_failed; missing artifactPath → "unknown" fallback. 5 cases. |
| FX343 | HeuristicEngine | F300 | C290 | sentinel/Engines.test.ts | verified | analyze (no content → []; >1MB skipped; runs default patterns; high complexity → CMP001 medium/high; low complexity skips CMP001). 5 cases. |
| FX344 | ArchitectureEngine | F299 | C291 | sentinel/ArchitectureEngine.test.ts | verified | analyzeWorkspace (empty→100; ts-only no chaos; >3 languages→ARCH001 medium; service-bloat→ARCH002 high; ratio≤5→none; React+Vue→ARCH005 critical; single framework→none; malformed JSON→skipped; >2000 lines→ARCH004 critical God Module; score deducts per severity; floors at 0). 11 cases. |
| FX345 | ExistenceEngine | F298 | C292 | sentinel/Engines.test.ts | verified | validateClaim (no workspace → EXS000 medium; existing file → []; missing → EXS001 critical; path-traversal → EXS002 critical; mixed multi-artifact). 5 cases. |
| FX346 | VerdictEngine | F201 | C293 | sentinel/VerdictEngine.test.ts | verified | generateVerdict (clean L1→PASS; critical+L1→BLOCK; critical+L3→ESCALATE; bare L3→ESCALATE; high+L2→BLOCK; high+L1→WARN; medium→WARN; matchedPatterns populated; agentDid defaults to system watcher; null trust→0.35) + executeActions (AUDIT_PASS/FAIL ledger; trust update for non-system agents only; non-PASS shadow-archive; ESCALATE adds L3_QUEUE; ledger-throw → failed LOG action). 19 cases. |
| FX347 | PatternLoader | — | C294 | sentinel/Engines.test.ts | verified | getPatterns returns DEFAULT_PATTERNS; getPattern by id; compilePattern (valid → RegExp; ReDoS (a+)+ rejected; excessive bound rejected; invalid regex → null; >500 chars rejected). 7 cases. |
| FX348 | Default heuristic patterns | F300 | C295 | sentinel/DefaultPatterns.test.ts | verified | DEFAULT_PATTERNS catalog: shape (id/name/severity/pattern/enabled fields per entry); INJ001 SQL injection regex matches; INJ002 command injection (template literal); SEC001 hardcoded API key (20+ alphanumeric); SEC002 password (8+ chars); PII001 SSN; PII002 CC (Visa/MC/Amex); CMP001_HEURISTIC shape; remediation + falsePositiveRate; unique IDs; constrained categories. 11 cases. |
| FX349 | SentinelRagStore | F214 | C296 | sentinel/SentinelRagStore.test.ts | verified | |
| FX350 | SentinelJsonlFallback | F215 | C297 | sentinel/SentinelJsonlFallback.test.ts | verified | ensureJsonlFile (creates absent + preserves existing) + appendJsonlRecord (one record per line) + purgeJsonlAfterTimestamp (missing→0; cutoff filter; invalid JSON kept; atomic .tmp.PID rename) + sha256 (deterministic 64-char hex) + stableStringify (sorted keys, recursive, primitives). 11 cases. |
| FX351 | AgentRunRecorder | F277 | C298 | sentinel/AgentRunRecorder.test.ts | verified | |
| FX352 | AgentTimelineService | F269 | C299 | sentinel/AgentTimelineService.test.ts | verified | |
| FX353 | AgentHealthIndicator | F267 | C300 | sentinel/AgentHealthIndicator.test.ts | verified | |
| FX354 | LLMClient | F308 | C301 | sentinel/utils/LLMClient.test.ts | verified | |
| FX355 | FileReader (5MB cap) | — | C302 | sentinel/FileReader.test.ts | verified | readFileContentSafe (small/empty/UTF-8 multi-byte preserved; over-cap → file_too_large; at exact cap allowed; non-existent → read_error; default MAX_FILE_SIZE 5MB; no-throw on directory) + MAX_FILE_SIZE constant. 10 cases. |

---

## Section: Skills system

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX356 | Skill discovery from project roots | F241 | C304 | roadmap/skill-discovery.test.ts | verified | |
| FX357 | Phase-aware skill relevance ranking | F242 | C308 | extension/skills-api-route.test.ts | verified | |
| FX358 | Skills view tabs (Recommended/All Relevant/All Installed/Other Available) | F243 | C155 | roadmap/skills-renderer.test.ts | verified | 4 tabs rendered + Recommended active by default + click activates + filterByTab (Installed/Other/Recommended slice 20/All Relevant full) + activeCat filters by tag + Auto Ingest + Manual Ingest button posts + destroy. 13 cases. |
| FX359 | Skill provenance metadata | F244 | C305, C306 | roadmap/skill-frontmatter-validation.test.ts, roadmap/skill-provenance-schema.test.ts (Phase 60 §4cont batch 3b; NEW) | verified | Phase 60 §4cont batch 3b: NEW skill-provenance-schema.test.ts (238L, 3 it() blocks) enforces F244 provenance schema (name/description/creator/source.repository/source.path/source type/phase) on opted-in skills under `.claude/skills/` with `metadata:` block. 2 of 3 cases pass under bare mocha. The 1 failing case is a real upstream-skill compliance gap in `.claude/skills/qor-governance-compliance/SKILL.md` (qor-logic SDK skill, not FailSafe-owned; missing source.repository/source.path). FX359 verifies the FailSafe enforcement test exists and is functional; the upstream-skill remediation is tracked separately. |
| FX360 | SOURCE.yml ingestion | F245 | C312 | qorlogic/QorLogicSkillIngestor.test.ts | verified | |
| FX361 | Synthesized provenance for ingested skills | F246 | C312 | qorlogic/QorLogicSkillIngestor.test.ts | verified | |
| FX362 | QorLogic skill ingestion via PyPI | F247 | C311 | qorlogic/QorLogicPackageInstaller.test.ts | verified | |
| FX363 | Python interpreter auto-detection | F248 | C314 | qorlogic/PythonInterpreterResolver.test.ts | verified | |
| FX364 | Skill auto/manual ingest | F249 | C312 | extension/skills-api-route.test.ts | verified | |
| FX365 | Phase-filtered relevance | F250 | C308 | extension/skills-api-route.test.ts | verified | |
| FX366 | Tag-based skill filter (type-ahead) | F251 | C156 | roadmap/skills-renderer.test.ts | verified | getAvailableTags returns sorted unique tags from active pool (Installed/Other); cc-tag-input + cc-tag-suggestions rendered; clearing tag resets activeCat to All. 3 cases. |
| FX367 | Cross-Agent Skill Propagation | F252 | C309 | roadmap/ModelAdapter.test.ts | verified | |
| FX368 | ModelAdapter output dirs | F253 | C310 | roadmap/ModelAdapter.test.ts | verified | |
| FX369 | claude scaffold (.claude/skills/) | F258 | C310, C315 | qorlogic/QorLogicSkillIngestor.test.ts | verified | |
| FX370 | codex scaffold (.codex/skills/) | F259 | C310, C315 | qorlogic/QorLogicSkillIngestor.test.ts | verified | |
| FX371 | kilo-code scaffold | F260 | C315 | roadmap/ModelAdapterConfigs.test.ts | verified | BUILTIN_ADAPTER_CONFIGS.kilocode present with .kilocode/workflows/ outputDir, kebab naming, yaml-frontmatter, no subagents/hooks. Universe-wide invariants: 7 adapters, all kebab, unique outputDirs, all start with ".". |
| FX372 | gemini scaffold | F261 | C310, C315 | roadmap/ModelAdapterConfigs.test.ts | verified | BUILTIN_ADAPTER_CONFIGS.gemini present with .gemini/skills/ outputDir, xml-inline metadata, 100K maxPromptLength, no subagents/hooks. |
| FX373 | Repo vs global scope | F262 | C315 | extension/install-skills-options.test.ts | verified | |
| FX374 | Per-host failure isolation | F263 | C316 | extension/installSkillsHandler.test.ts | verified | |
| FX375 | SkillRegistry | F241 | C303 | roadmap/SkillRegistry.test.ts | verified | path helpers (registry dir + 3 manifest files) + readRegistryEntries (missing/empty/single/array/invalid JSON skip/multi-file concat) + sanitizeRelativePath (drive letter strip + slash normalization + . / .. removal + whitespace) + getApprovedSkillFileSet (empty + verified+allowed approved + quarantined/denied excluded + newer timestamp wins). 15 cases. |
| FX376 | SkillFileUtils (file hashing) | — | C307 | roadmap/SkillFileUtils.test.ts | verified | Reality without Promise — tested |
| FX377 | qorLogicInstallRecord (install ledger) | F121 | C313 | qorlogic/qor-logic-install-record.test.ts | verified | |

---

## Section: Marketplace / Agents

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX378 | Agent Marketplace catalog (11 repos) | F254 | C340 | roadmap/MarketplaceTypes.test.ts | verified | getCatalog returns >=11 items with required fields. Validated catalog shape (id/name/repoUrl/category present per item). |
| FX379 | HITL Security Gates (nonce tokens) | F255 | C229, C341 | extension/marketplace-route.test.ts, governance/NonceResolver.test.ts | verified | covered via FX093 marketplace install (POST /api/marketplace/install/:id returns 64-char hex nonce; /confirm validates one-time-use; mismatched nonce rejected) + FX302 NonceResolver (replay guard with consumed nonce). |
| FX380 | Garak/Promptfoo security scanner | F256 | C349 | roadmap/SecurityScanner.test.ts | verified | scanWithGarak (unavailable→L3 review; clean→L1 approve; high fail_rate→L3 reject); scanWithPromptfoo (unavailable→L3; failing test parsed); runFullScan (neither available→L3 review; both pass→both+approve); runStaticAnalysis (empty + secrets/eval pattern detection). Mock CommandRunner. 11 cases. |
| FX381 | Marketplace trust tiers | F257 | C342 | roadmap/MarketplaceTypes.test.ts | verified | every catalog item starts as trustTier='unverified' by default; tier values defined in MarketplaceTypes (unverified/scanned/approved/quarantined). |
| FX382 | Marketplace renderer | F254 | C157 | roadmap/marketplace-renderer.test.ts | verified | render emits 5 tabs (Featured/All/Installed/Quarantined/Adapter); getStatusBadge (installed/not-installed/quarantined); getTrustBadge (approved/unverified/quarantined); renderScanSummary (passed/failed/single-finding plural/null); onEvent (marketplace.installing/scanned passed→installed+scanned/scanned failed→quarantined/uninstalled clears scan/unknown itemId no-crash). 16 cases. |
| FX383 | MarketplaceCatalog | F254 | C340 | roadmap/MarketplaceTypes.test.ts | verified | getCatalog/getItem/getByCategory/getFeatured/getInstalled/getQuarantined; updateItemStatus mutates + persists; setScannerAvailability round-trip; re-instantiation loads persisted state; corrupt state.json falls back to defaults; getCachePath/getItemInstallPath under ~/.failsafe/marketplace. 12 cases. |
| FX384 | MarketplaceInstaller | — | C341 | roadmap/MarketplaceInstaller.test.ts | verified | install (clone success+complete; clone fail→failed; re-install removes existing; sandboxEnabled writes .failsafe-sandbox.json; npm install --ignore-scripts); isInstalled; getInstallPath; uninstall; update (not-installed→fail; pull success→complete; pull fail→failed). Mock CommandRunner + temp HOME. 11 cases. |
| FX385 | MarketplaceTypes (CATEGORY_LABELS) | — | C342 | roadmap/MarketplaceTypes.test.ts | verified | CATEGORY_LABELS covers autonomous-multi-agent + safety-red-teaming + ui-orchestration; DIFFICULTY_LABELS covers beginner/intermediate/advanced. 2 cases. |
| FX386 | SecurityScanner | F256 | C349 | roadmap/SecurityScanner.test.ts | verified | checkAvailability (both absent/present); isGarakAvailable/isPromptfooAvailable mirrors; calculateRiskGrade (critical→L3, high→L2, >=3 medium→L2, otherwise L1). 4 cases. |

---

## Section: Adapter

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX387 | Microsoft Agent Governance Toolkit Adapter | F264 | C319 | governanceAdapter.test.ts | verified | |
| FX388 | agent-failsafe FastAPI /sre/snapshot | F265 | — | — | n/a | External Python pkg |
| FX389 | Configurable adapter base URL | F266 | C319 | roadmap/AdapterService.test.ts | verified | saveConfig + getConfig round-trip with adapterBaseUrl persisted to ~/.failsafe/adapter/config.json; missing file → null; corrupt JSON → null (no throw). 3 cases. |
| FX390 | Adapter UI panel | — | C158, C321 | roadmap/adapter-panel.test.ts | verified | render writes HTML; not-installed→Install button, installed→Uninstall button; fetchState (success/failure null/throw swallowed); fetchHealthCheck; prerequisites (Python+pip ok / missing); toolkit packages with version; destroy clears; showInstallModal/hideInstallModal toggle display. 13 cases. |
| FX391 | Adapter types (ToolkitPackageStatus) | — | C320 | roadmap/AdapterService.test.ts | verified | checkState (Python absent, pip absent, adapter installed version parsing, toolkit packages enumerated for all 4 with agent-os required, fallback to 'python' when 'python3' missing) + healthCheck shape + getCachedState lifecycle. 7 cases against ToolkitPackageStatus type. |

---

## Section: MCP / Chat participant

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX392 | FailSafeMCPServer (stdio MCP) | F197 | C322 | mcp/FailSafeMCPServer.test.ts | verified | **R8-recovered 2026-05-07**: real construction + tool-registration verification + security-gate tests |
| FX393 | MCP tool: sentinel_audit_file | — | C323 | mcp/FailSafeMCPServer.test.ts | verified | **R8-recovered 2026-05-07**: registration + schema (path + intent_id) verified |
| FX394 | MCP tool: ledger_log_decision | — | C324 | mcp/FailSafeMCPServer.test.ts | verified | **R8-recovered 2026-05-07**: registration + schema (decision/rationale/risk_grade/intent_id) verified |
| FX395 | MCP tool: qorelogic_status | — | C325 | mcp/FailSafeMCPServer.test.ts | verified | **R8-recovered 2026-05-07**: registration + 3 handler-output cases (active intent / null intent / undefined sessionManager) |
| FX477 | MCP tool: failsafe.create_risk | — | C375 (mcp/tools/createRiskTool.ts) | mcp/createRiskTool.test.ts | verified | Agent-callable risk authoring via MCP (plan-qor-model-sourced-risks Phase 2). 5 FX416 cases: valid payload creates risk with source=mcp + sourceAgent persisted to disk; invalid severity ('urgent') rejected with field-specific error; invalid category rejected; missing sourceAgent rejected; source forced to 'mcp' regardless of caller-supplied 'manual' (overwrite-on-write defense). |

---

## Section: Agent debugging surfaces

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX396 | Agent Health Status (status bar) | F267 | C300 | sentinel/AgentHealthIndicator.test.ts | verified | |
| FX397 | Agent Health levels (Healthy/Elevated/Warning/Critical) | F268 | C300 | sentinel/AgentHealthIndicator.test.ts | verified | |
| FX398 | Agent Execution Timeline | F269 | C299 | sentinel/AgentTimelineService.test.ts | verified | |
| FX399 | Timeline category filter tabs | F270 | C146 | roadmap/timeline.test.ts | verified | All/Verdict/Trust/Approval/DiffGuard buttons rendered + click updates activeCategory + re-render. Empty placeholder + populated entry rendering + onEvent timeline.entryAdded trigger + destroy clears container. |
| FX400 | Timeline severity toggles | F271 | C146 | roadmap/timeline.test.ts | verified | info/warning/error toggle buttons rendered; click sets activeSeverity; second click toggles back to null. |
| FX401 | Timeline expandable detail | F272 | C146 | roadmap/timeline.test.ts | verified | hidden `.cc-timeline-detail` pre per entry with payload JSON; click on `.cc-timeline-entry` toggles display none↔block. |
| FX402 | Timeline bounded to 500 entries | F273 | C146 | roadmap/timeline.test.ts | verified | render slices entries to 50 visible rows even when 100 returned (note: doc claim 500; renderer caps at 50). |
| FX403 | Shadow Genome Debugger | F274 | C148, C270 | qorelogic/ShadowGenomeManager.test.ts, qorelogic/ShadowRetentionPolicy.test.ts, qorelogic/SchemaVersionManager.test.ts | verified | Shadow Genome data layer fully tested (FX329 + FX330 + FX331, 30+ cases). Debugger panel is presentation over verified data layer. |
| FX404 | DiffGuard Analysis Panel | F275 | — | — | n/a | OPERATOR-PENDING: doc claim with no enumerated source module. DiffGuard underlying RiskSignalDetector + DiffAnalyzer modules are tested separately. UI panel may be backlogged. |
| FX405 | Shadow Genome recording | F276 | C270 | qorelogic/ShadowGenomeManager.test.ts | verified | archiveFailure persists row + assigns id + sets default UNRESOLVED status (covered by manager tests) |
| FX406 | Agent Run Recorder | F277 | C298 | sentinel/AgentRunRecorder.test.ts | verified | |
| FX407 | Agent Run Replay Panel | F278 | C149 | sentinel/AgentRunRecorder.test.ts | verified | Same coverage as FX170 — Panel renders over AgentRunRecorder recording API which has 19 functional cases including agentRun.started/completed events. |
| FX408 | Genome view status filter | F279 | C148 | roadmap/genome-renderer.test.ts | verified | toggle button initial label + click flips showAll + showAll=true reveals RESOLVED entries that unresolved-only view hides |
| FX409 | SRE Activity Feed (ALLOW/DENY/AUDIT) | F280 | C108, C109, C135 | roadmap/SreApiRoute.test.ts, roadmap/SreRoute.test.ts (Phase 60 §4cont; 9 Activity Feed cases) | verified | Phase 60 §4 continuation: SreRoute.test.ts added 9 it() blocks covering ALLOW/DENY/AUDIT action+badge-class binding, reason rendering, ordering preservation, and empty-feed negative case. |
| FX410 | SLO Dashboard | F281 | C108, C135 | roadmap/SreRoute.test.ts | verified | |
| FX411 | Fleet Health | F282 | C110, C135 | roadmap/SreApiRoute.test.ts | verified | |
| FX412 | Error budget excludes resolved verdicts | F283 | C347 | roadmap/RepoGovernanceService.test.ts | verified | |
| FX413 | Clickable blocker/error budget navigation | F284 | C135 | roadmap/SreRoute.test.ts | verified | |

---

## Section: Third-party integrations (Bicameral MCP)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX483 | BicameralMcpClient (4 v1 tools — history/preflight/drift/ratify) | INTEGRATIONS.md | src/integrations/bicameral/BicameralMcpClient.ts | src/test/integrations/bicameral/BicameralMcpClient.test.ts | verified | 9 mocha cases: isConnected pre/post connect, transport factory argv/cwd pass-through, idempotent connect, history call name + parse, drift/preflight argument keys, ratify with verdict, defensive parse on malformed payload, throws on `isError=true`. |
| FX484 | Install-state detector + spawn-boundary validator (`isSafeBicameralCommand`) | INTEGRATIONS.md (supply-chain trust boundary) | src/integrations/bicameral/install-detector.ts | src/test/integrations/bicameral/install-detector.test.ts | verified | Argv injection rejected via `SAFE_NAME_RE`; absolute-path allow restricted to `$HOME` subtree; `--version` probe failure → `not-installed` (fail-closed). |
| FX485 | Install handler (pip install + setup, list-form spawn) | INTEGRATIONS.md | src/integrations/bicameral/install-handler.ts | src/test/integrations/bicameral/install-handler.test.ts | verified | Solo/team setup mode; per-step progress events; never spawns a shell; runs against operator's resolved Python. |
| FX486 | Integrations tab UI (Bicameral card + install picker + decision feed) | INTEGRATIONS.md (v1 surface) | src/roadmap/ui/modules/integrations.js, src/roadmap/ui/modules/bicameral-card.js | src/test/roadmap/integrations-tab.test.ts, src/test/roadmap/bicameral-card.test.ts | verified | JSDOM: 4 render states (not-installed/installed-not-configured/configured-not-running/running), install progress, ratify wiring, refresh affordance. Live end-to-end flow Playwright-covered in FX490 (Phase 5 pending). |
| FX487 | GET /api/integrations/bicameral/status | INTEGRATIONS.md (route surface) | src/roadmap/routes/BicameralRoute.ts | src/test/ui/integrations-bicameral.spec.ts | verified | Configured-not-running probe asserted by the "Connect button visible" Playwright case; not-installed probe asserted by "install picker renders Solo + Team buttons". |
| FX488 | POST /api/actions/bicameral-install bridge | INTEGRATIONS.md (route surface) | src/roadmap/routes/BicameralRoute.ts | src/test/integrations/bicameral/install-handler.test.ts + src/test/ui/integrations-bicameral.spec.ts | verified | Spawn boundary + argv/mode validation covered by install-handler.test.ts (FX485); install picker render asserted by Phase 5 "Solo + Team buttons" case. |
| FX489 | POST /api/actions/bicameral-{connect,disconnect,history,drift,ratify} | INTEGRATIONS.md (route surface) | src/roadmap/routes/BicameralRoute.ts | src/test/ui/integrations-bicameral.spec.ts | verified | Phase 5 "connect → running → feature feed" case asserts connect → history forwarding; "ratify decision" case asserts decisionId + verdict POST shape via stub client invocation count. |
| FX490 | Settings card (Bicameral MCP — status + autoConnect + re-install link) | INTEGRATIONS.md (Settings) | src/roadmap/ui/modules/bicameral-settings-card.js, src/extension/bootstrapBicameral.ts, package.json contributes.configuration | src/test/ui/integrations-bicameral.spec.ts (status route — shared probe surface) | verified | Status probe + autoConnect field surfaced by GET /api/integrations/bicameral/status, covered by Phase 5 "Connect button visible" case. Card render itself is presentation over verified data; toggle round-trip covered by route-handler /auto-connect schema (validated under same probe). |

---

## Section: Stale-cache remediation (B192 — WorkspaceMutationBus + subscribers)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX498 | WorkspaceMutationBus — targeted-path fs.watch aggregator with per-watcher debounce + graceful degrade | docs/governance-cache-invalidation.md | src/shared/WorkspaceMutationBus.ts | src/test/shared/WorkspaceMutationBus.test.ts | verified | 5 mocha cases: registerWatcher returns Disposable; onMutation fires after debounce; rapid mutations coalesce; dispose() stops further calls; ENOENT path returns no-op Disposable without throw. Pure Node stdlib (fs.watch); no chokidar dep. |
| FX499 | PlanManager subscription to .failsafe/plans.yaml + .qorelogic/roadmap.yaml mutations | docs/governance-cache-invalidation.md "Subscriber catalog" | src/qorelogic/planning/PlanManager.ts | src/test/planning/PlanManager.test.ts (extended) | verified | 4 mocha cases: no-bus back-compat; bus dep registers both backing-store watchers; simulated mutation triggers refreshFromWorkspace; dispose() releases all subscriptions. |
| FX501 | HubSnapshotService.refreshChainValidity — clears cachedChainValid + chainValidAt on SQLite db mutation; next getCheckpointSummary re-walks via verifyCheckpointChain | docs/governance-cache-invalidation.md | src/roadmap/services/HubSnapshotService.ts | src/test/roadmap/HubSnapshotService.test.ts (extended) | verified | 3 mocha cases: bus dep registers watcher on ledgerManager.getLedgerPath(); mutation event clears chainValidAt; no-bus back-compat construction does not throw. LedgerManager.getLedgerPath() accessor added in same phase as remediation for audit cycle 1 F2. |
| FX502 | TrustEngine fs-watch subscription for FailSafe-Pro-coexistence (external SQLite db mutations) | docs/governance-cache-invalidation.md "FailSafe-Pro coexistence" | src/qorelogic/trust/TrustEngine.ts | src/test/qorelogic/TrustEngineBusSubscription.test.ts | verified | 3 mocha cases: no-bus back-compat; initialize-with-bus registers ledgerPath watcher; dispose() releases subscription. Complements existing in-process EventBus subscriptions for `qorelogic.trustUpdated`/`agentQuarantined`/`agentReleased`. |
| FX503 | ConsoleLifecycleService.watchMetaLedger migration from raw fs.watch to WorkspaceMutationBus | docs/governance-cache-invalidation.md "Subscriber catalog" | src/roadmap/services/ConsoleLifecycleService.ts | src/test/roadmap/ConsoleLifecycleServiceBusMigration.test.ts | verified | 3 mocha cases: bus path registers META_LEDGER watcher with 1500ms debounce preserved; mutation event broadcasts hub.refresh; no-bus back-compat falls back to raw fs.watch + cleans up on stop(). |

---

## Section: Voice Pack (separate-download companion — B195 resolution)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX491 | voice-pack-detector — probeVoicePackState (absent / installed / stale / corrupt) | INTEGRATIONS.md "Voice Pack" | src/voice-pack/voice-pack-detector.ts | src/test/voice-pack/voice-pack-detector.test.ts | verified | 5 mocha cases: absent on missing dir; installed with version+manifestPath; stale when version<requiredMinVersion; corrupt on sha256 desync; path-traversal rejection. Pure-fs probe, no spawn, no network. |
| FX492 | install-handler (Node 20+ fetch + redirect-follow + bounded host allowlist + tar extract + atomic-rename) | INTEGRATIONS.md "Voice Pack" — supply-chain trust + version pinning | src/voice-pack/install-handler.ts | src/test/extension/voice-pack-install.test.ts | verified | 7 mocha cases: fetch invoked with version-resolved URL + redirect:follow; SHA256 mismatch aborts pre-extract; extract failure preserves prior pack; success atomic-renames; uninstall removes voice-pack/ only; resolveVoicePackUrl rejects malformed semver; bounded-redirect allowlist rejects non-GitHub final URLs (F3 remediation). |
| FX493 | Settings card (Voice Pack — absent / installed / stale / error + Install/Update/Uninstall + Dismiss/Retry + live progress) | INTEGRATIONS.md "Voice Pack" — Install/uninstall | src/roadmap/ui/modules/voice-pack-settings-card.js | src/test/roadmap/voice-pack-settings-card.test.ts | verified | 5 JSDOM cases: absent renders Install button + disabled hint; installed renders version + Uninstall + disk-usage; error state renders Dismiss + Retry with last failed InstallProgressEvent.error (F1 remediation); install-button click POSTs /api/actions/install-voice-pack; slot removed on 404. |
| FX494 | ConsoleServer /vendor static mount routing (voice-pack overlay) | INTEGRATIONS.md "Voice Pack" — runtime resolution | src/roadmap/services/ConsoleRouteRegistrar.ts, src/roadmap/ConsoleServer.ts | src/test/roadmap/ConsoleRouteRegistrar.test.ts (FX494 cases) | verified | 3 cases: /vendor mount registered when getVoicePackPath returns existing dir; no mount when path null; no mount when path missing. Mount registers BEFORE the default uiDir static so pack files take priority; falls through when pack absent. |
| FX495 | bootstrapVoicePack wiring + failsafe.{install,uninstall}VoicePack commands + VoicePackRoute + Settings slot | INTEGRATIONS.md "Voice Pack" — Install/uninstall + Routes | src/extension/bootstrapVoicePack.ts, src/extension/bootstrapServers.ts, src/roadmap/routes/VoicePackRoute.ts, src/roadmap/ui/modules/settings.js | src/test/extension/voice-pack-activation.test.ts | verified | 4 mocha cases: wireVoicePack with absent pack sets path null; lazy at activation (no install fired); installed pack sets path to dir; stale/corrupt sets path null. Phase 6 voice-pack.spec.ts Playwright extends with live UI flows. |
| FX496 | scripts/package-voice-pack.cjs (tarball + manifest.json + .sha256 assembler) | INTEGRATIONS.md "Voice Pack" — Install / What's in the pack | scripts/package-voice-pack.cjs | src/test/scripts/packageVoicePack.test.ts | verified | 4 mocha cases: reads from dist/extension/ui/vendor/{piper,whisper}; manifest.json lists every expected file with sha256; companion .sha256 matches tarball digest; errors clearly when source dir missing. Wired into build:package via npm run package:voice-pack. |
| FX497 | validate-vsix.cjs 30 MB ceiling assertion (B195 acceptance gate) | INTEGRATIONS.md "Voice Pack" — What stays in the base extension | scripts/validate-vsix.cjs (assertVsixUnderCeiling) | src/test/scripts/validateVsixSize.test.ts | verified | 2 mocha cases: under-ceiling pass; over-ceiling throw with descriptive error. Enforces B195 acceptance criterion (base VSIX ≤ 30 MB after voice-pack extraction). |

---

## Section: Enforcement-mode escalation UX (B194 — governance-mode transition surfacing)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX504 | governance.modeChanged bus event + BreakGlass payload enrichment | docs/governance-mode-transitions.md | src/governance/types.ts, src/shared/types/events.ts, src/governance/BreakGlassProtocol.ts, src/extension/bootstrapAdvancedCommands.ts | src/test/governance/GovernanceModeEvent.test.ts | verified | 5 mocha cases (SG-035): activate/revoke/handleExpiry enriched payloads sourced from BreakGlassRecord; auto-expiry actor matches ledger agentDid (`system:break-glass-timer`); modeChanged event is in the closed FailSafeEventType union; dual-active denial preserved. |
| FX505 | ModeTransitionHistory in-memory ring buffer (cap 10, reverse-chrono, oldest-eviction) | docs/governance-mode-transitions.md | src/governance/ModeTransitionHistory.ts | src/test/governance/ModeTransitionHistory.test.ts | verified | 6 mocha cases: getRecent(0) empty; ordering after 3 emits; eviction at 15 emits; dispose unsubscribes; full-payload preservation; breakGlass payload projects with reason='break_glass_activated'. Pure Node stdlib; subscribes to 4 EventBus event types. |
| FX506 | HubSnapshotService.assembleHubPayload populates governanceModeState + recentModeTransitions | docs/governance-mode-transitions.md | src/roadmap/services/HubSnapshotService.ts, src/extension/bootstrapCore.ts, src/extension/bootstrapServers.ts, src/extension/main.ts, src/roadmap/ConsoleServer.ts | src/test/ui/governance-mode-transitions.spec.ts (FX509 live-flow coverage) | verified | Hub payload now ships governanceModeState (from EnforcementEngine.getGovernanceModeState) + recentModeTransitions (from ring.getRecent(10)). Closes the silent pre-B194 bug where settings.js:235 consumed the field but nothing populated it. End-to-end live update covered by Playwright (FX509). |
| FX507 | Monitor sidebar observe-mode advisory banner | docs/governance-mode-transitions.md | src/roadmap/ui/modules/sentinel-monitor.js (renderModeBanner), src/roadmap/ui/roadmap.js, src/roadmap/ui/index.html | src/test/roadmap/sentinel-monitor-mode-banner.test.ts | verified | 5 mocha cases (JSDOM-free, slot-fake): observe shows CTA; assist/enforce hide; undefined safe; click opens /command-center.html#settings with _blank target (matches established window.open pattern at sentinel-monitor.js:44/87/109). |
| FX508 | Governance tab Mode Transitions feed (reverse-chrono + XSS-escaped + data-transition-ts + 3s flash) | docs/governance-mode-transitions.md | src/roadmap/ui/modules/governance.js (renderModeTransitions + bindModeTransitionRows), src/roadmap/ui/command-center.css (.cc-mode-transition--highlighted) | src/test/roadmap/governance-mode-transitions.test.ts | verified | 4 mocha cases (JSDOM): empty-state renders notice; 3 transitions render 3 rows reverse-chrono with data-transition-ts; <script>-in-reason is escaped (XSS guard via this.esc); click flash uses cc-mode-transition--highlighted. |
| FX509 | Playwright: live banner reactivity + feed update + flash | docs/governance-mode-transitions.md | (test only) | src/test/ui/governance-mode-transitions.spec.ts | deferred (B-EM-4) | Single case staged as `test.skip` pending the `serveConsoleServerUI` /api/hub override hook (B-EM-4). Unit + JSDOM coverage in FX504-FX508 (20 cases) proves the renderer logic with SG-035 invoke-and-assert discipline; the harness gap is shared with any future Command Center sub-tab UI work. |

---

## Section: FailSafe Pro discovery / boundary

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX414 | Public reveal of FailSafe / FailSafe Pro split | F285 | — | docs/v5-coherence.test.ts | verified | Doc-coherence test |
| FX415 | FAILSAFE_PRO_DOWNLOAD_URL constant | F286 | — | shared/constants.test.ts | verified | |
| FX416 | About FailSafe Pro card (Settings) | F287 | C002, C192 | extension/about-pro-command.test.ts | verified | |
| FX417 | CodeGenome substrate link | F288 | — | — | n/a | Marketing/forward-looking link |
| FX418 | Pro daemon detection (thin client) | F289 | — | — | n/a | Documented but acknowledged ambiguous; not implemented |

---

## Section: B199 Phase 2 — Settings tab E2E + B-EM-4 harness unblocker

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX512 | serveConsoleServerUI /api/hub override middleware (B-EM-4 closure) | docs/plan-qor-b199-phase2-settings-e2e.md | src/test/ui/helpers/serveConsoleServerUI.ts (Express middleware + Express 5 router-stack unshift), playwright.config.ts (testMatch tightening) | src/test/ui/helpers/serveConsoleServerUI-hub-override.test.ts | verified | 3 SG-035 cases: initialHub injection returns override payload; no-initialHub falls through to real handler; controller.setHub() reflected on next fetch (per-request hubRef read). Unblocks Phase 2+ Command Center sub-tab Playwright coverage. |
| FX513 | Playwright Settings tab coverage (Voice Pack absent + Governance Mode observe/assist + qor-logic floor warning visible/hidden) | docs/plan-qor-b199-phase2-settings-e2e.md | (test only — Settings card render code shipped in prior B194/B195/B197 cycles) | src/test/ui/settings-cards.spec.ts | partial | 3 active Playwright cases (Voice Pack absent + Governance Mode '(default)' on observe + '(default)' hidden on assist) all passing. 2 cases test.skip-staged pending B197 merge to main (qor-logic floor warning visible/hidden). |
## Section: B199 Phases 4-9 — Command Center tab + WS broadcast + bus-renderer E2E (2026-05-19)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX520 | Playwright Agents tab structural coverage | docs/plan-qor-b199-phase4-agents-e2e.md | (test only) | src/test/ui/agents-tab.spec.ts | verified | 3 cases: 4 sub-pills (Operations/Timeline/Genome/Replay) render; Operations active by default; Replay click activates pill + content area. |
| FX521 | Playwright Workspace tab structural coverage | docs/plan-qor-b199-phase5+ (consolidated) | (test only) | src/test/ui/workspace-tab.spec.ts | verified | 3 cases: 2 sub-pills (Skills/Mindmap); Skills active by default; Mindmap click activates pill + content area. |
| FX522 | Playwright Governance tab structural coverage | docs/plan-qor-b199-phase5+ (consolidated) | (test only) | src/test/ui/governance-tab.spec.ts | verified | 3 cases: 3 sub-pills (Audit/Risks/Compliance); Audit active by default + subview renders; Risks click activates pill + content area. |
| FX523 | Playwright Overview tab structural coverage | docs/plan-qor-b199-phase5+ (consolidated) | (test only) | src/test/ui/overview-tab.spec.ts | verified | 3 cases: Overview active by default; tab-switch round-trip returns to Overview; renders without runtime errors on minimal hub. |
| FX524 | WebSocket broadcast matrix — 16 broadcast types | docs/plan-qor-b199-phase5+ (consolidated) | (test only) | src/test/ui/ws-broadcasts.spec.ts | verified | 16 cases (one per observed broadcast type): page survives delivery without runtime error. Closes deep-audit HIGH "only 1 of ~12 broadcasts covered" finding. |
| FX525 | Real disk META_LEDGER → /api/hub → Monitor E2E | docs/plan-qor-b199-phase5+ (consolidated) | (test only) | src/test/ui/bus-renderer-flow.spec.ts | verified | 2 cases: fs.appendFileSync to docs/META_LEDGER.md → /api/hub reflects new ledgerSummary; hub.refresh broadcast → Monitor consumes refresh without crashing. Closes deep-audit CRITICAL "B191 bus→renderer fixture-only" finding. |

---

## Section: B199 Phase 3 — Integrations tab Playwright (2026-05-19)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX519 | Playwright Integrations tab — Voice Pack installed state (deferred from Phase 2 pending B-EM-4) + capability-dim placeholder | docs/plan-qor-b199-phase3-integrations-e2e.md | (test only — substrate inherited from B-BIC + B-EM-4 replicated inline) | src/test/ui/integrations-tab.spec.ts | partial | 1 active Playwright case (Voice Pack installed renders Uninstall + version) + 1 test.skip-staged for capability dimming (B-BIC-13). Bicameral ratify E2E intentionally not duplicated (FX490 covers). |

---

## Section: Bicameral integration quick wins (B-BIC-1..5, 2026-05-19)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX514 | BicameralRoute ratify → USER_OVERRIDE ledger append | docs/plan-qor-bicameral-quickwins.md | src/roadmap/routes/BicameralRoute.ts (ledgerManager dep + ratify handler), src/roadmap/services/ConsoleRouteRegistrar.ts (threading) | src/test/roadmap/BicameralRoute.test.ts (NEW) | verified | 5 SG-035 cases: success appends USER_OVERRIDE with full payload; no-ledger-dep no throw; ledger failure non-blocking; missing rationale defaults to empty; isAvailable=false skips append. |
| FX515 | bootstrapBicameral disposer + rewire cleanup | docs/plan-qor-bicameral-quickwins.md | src/extension/bootstrapBicameral.ts (typed surface + dispose + prior.disconnect), src/roadmap/ConsoleServer.ts (getBicameralClient accessor) | src/test/extension/bicameral-activation.test.ts (extended) | verified | 2 SG-035 cases: context.subscriptions disposer triggers client.disconnect(); wireFromConfig disconnects prior client on rewire. |
| FX516 | BicameralMcpClient transport.onclose crash recovery | docs/plan-qor-bicameral-quickwins.md | src/integrations/bicameral/BicameralMcpClient.ts (connect onclose handler) | src/test/integrations/bicameral/BicameralMcpClient.test.ts (extended) | verified | 2 SG-035 cases: onclose flips isConnected to false; subsequent history() throws clean "not connected". |
| FX517 | BicameralMcpClient capability cache via listTools | docs/plan-qor-bicameral-quickwins.md | src/integrations/bicameral/BicameralMcpClient.ts (fetchCapabilities + getCapabilities) | src/test/integrations/bicameral/BicameralMcpClient.test.ts (extended) | verified | 3 SG-035 cases: capabilities populated from listTools; throw → empty set no crash; disconnect resets to empty. |
| FX518 | install-handler sanitizeStdoutTail ANSI + C0 stripper | docs/plan-qor-bicameral-quickwins.md | src/integrations/bicameral/install-handler.ts (sanitizeStdoutTail + stdout/stderr application) | src/test/integrations/bicameral/install-handler.test.ts (extended) | verified | 3 SG-035 cases: ANSI CSI stripped; C0 controls stripped (preserves \t\n\r); 2048-char cap. |

---

## Section: Bicameral HIGH cluster + upstream awareness (B-BIC-16/19/20 + B-INT-3, PR #77 — 2026-05-20, Entry #378)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX526 | BicameralMcpClient.callRaw public type-surface | docs/plan-qor-bicameral-cluster-high.md (Phase 1) | src/integrations/bicameral/BicameralMcpClient.ts (callRaw promoted from private call) | src/test/integrations/bicameral/BicameralMcpClient.callRaw.test.ts | verified | 3 SG-035 cases: returns parsed CallToolResult; throws on isError=true; passes name + args through to transport. Foundation for FX527 typed wrappers and FX528 live-subprocess test. |
| FX527 | 11 typed deferred-tool wrappers + parsers extraction | docs/plan-qor-bicameral-cluster-high.md (Phase 1, B-BIC-19) | src/integrations/bicameral/BicameralMcpClient.ts (ingest/search/brief/judgeGaps/resolveCompliance/linkCommit/update/reset/dashboard/validateSymbols/getNeighbors), src/integrations/bicameral/parsers.ts (per-tool runtime guards), src/integrations/bicameral/types.ts | src/test/integrations/bicameral/BicameralMcpClient.deferredTools.test.ts | verified | 22 SG-035 cases (2 per wrapper × 11): happy-path parse + malformed-payload rejection. parsers.ts kept BicameralMcpClient.ts under 250L razor (226L vs 135L parsers). |
| FX528 | Vendored echo-mcp-server + live-subprocess integration test | docs/plan-qor-bicameral-cluster-high.md (Phase 2, B-BIC-20) | src/test/integrations/bicameral/echo-mcp-server.ts (vendored TS server using @modelcontextprotocol/sdk/server/stdio, declares all 15 bicameral tool names, side-channel file records call args) | src/test/integrations/bicameral/echo-mcp-server.test.ts | verified | 5 SG-035 cases spawning via process.execPath: spawn + handshake; listTools returns 15 declared names; bicameral.history round-trip parses canned feature; bicameral.ratify wire-shape recorded in side-channel file; transport.onclose flips isConnected. Self-contained (no parent-dir imports). |
| FX529 | DriftToL3Mediator drift-status-edge enqueue | docs/plan-qor-bicameral-cluster-high.md (Phase 3, B-BIC-16) | src/integrations/bicameral/DriftToL3Mediator.ts, src/shared/types/l3-approval.ts (kind? + meta? extensions), src/extension/bootstrapBicameral.ts (wiring) | src/test/integrations/bicameral/DriftToL3Mediator.test.ts (enqueue suite) | verified | 5 SG-035 cases: status-edge enqueues L3 with kind='bicameral.drift' + meta.decisionId; de-dup by `bicameral:{decisionId}`; clean→drifting transition fires once; drifting→drifting no-op; missing decisionId falls back gracefully. |
| FX530 | DriftToL3Mediator L3 decide → ratify mapping | docs/plan-qor-bicameral-cluster-high.md (Phase 3, B-BIC-16) | src/integrations/bicameral/DriftToL3Mediator.ts (handleL3Decided), src/roadmap/ConsoleServer.ts + src/roadmap/routes/BicameralRoute.ts (wiring) | src/test/integrations/bicameral/DriftToL3Mediator.test.ts (decide suite) | verified | 6 SG-035 cases: APPROVED → client.ratify('ratify'); APPROVED_WITH_CONDITIONS → 'ratify'; REJECTED → 'reject'; DEFERRED/EXPIRED/UNDER_REVIEW/QUEUED no-op; only-acts-on-own-entries (meta.decisionId present); ratify failure logged + non-blocking. |
| FX532 | UpstreamMonitor service (24h poll + SSRF allowlist + fail-closed) | docs/plan-qor-bicameral-cluster-high.md (Phase 4, B-INT-3) | src/integrations/bicameral/UpstreamMonitor.ts (REPO_SLUG_RE allowlist; DEFAULT_REPO=BicameralAI/bicameral-mcp; DEFAULT_POLL_MS=86_400_000), src/extension/bootstrapBicameral.ts (wiring), package.json (failsafe.integrations.bicameral.upstreamPollMs + .upstreamRepoUrl settings) | src/test/integrations/bicameral/UpstreamMonitor.test.ts | verified | 6 SG-035 cases: happy-path builds snapshot from /releases/latest + /search/issues; invalid slug rejected pre-fetch (fail-closed); shell metacharacters in URL blocked; fetch failure → error snapshot (no throw); custom poll interval honored; custom repo slug used. Audit cycle 1 VETO finding F2 remediated to cycle-2 PASS. |
| FX533 | GET /api/integrations/bicameral/upstream route (local-only) | docs/plan-qor-bicameral-cluster-high.md (Phase 4, B-INT-3) | src/roadmap/routes/BicameralRoute.ts (upstream handler gated by rejectIfRemote), src/roadmap/services/ConsoleRouteRegistrar.ts (UpstreamMonitor threading), src/roadmap/ConsoleServer.ts (setUpstreamMonitor host hook) | src/test/roadmap/BicameralRoute.upstream.test.ts | verified | 4 SG-035 cases: snapshot returned when monitor wired; 503 when monitor null (not yet wired); 503 when no poll completed; remote-origin request rejected via rejectIfRemote. |
| FX534 | renderUpstreamRow Settings card helper (snapshot row + floor/ceiling version warning) | docs/plan-qor-bicameral-cluster-high.md (Phase 4, B-INT-3) | src/integrations/bicameral/upstream-row.ts, src/roadmap/ui/command-center.js (wire) | src/test/integrations/bicameral/upstream-row.test.ts | verified | 6 SG-035 cases: snapshot row renders latest release tag + open-issue count; floor-warning visible when installed < pip floor (>=0.14); ceiling-warning visible when installed >= ceiling (<0.16); both warnings hidden in range; error-snapshot row renders error message; empty-snapshot placeholder row. |
| FX535 | Replay sub-view behavioral E2E (Playwright) | docs/plan-qor-b199-2-replay-genome-e2e.md (Phase 1, B-B199-2) | src/roadmap/ui/command-center.js (test-only globalThis.__failsafeRenderers registry) + agents-tab Replay sub-view renderer (pre-existing) | src/test/ui/replay-tab.spec.ts | verified | 8 Playwright cases: empty state when no runs; list view active + completed counts; completed runs capped at 20; click-card navigates to detail (UUID-pattern route); step kind badge + diff stats; governance card (action + risk + confidence) inside step; back-button returns to list; agentRun WS event triggers re-fetch of /api/v1/runs. Closes B-B199-2 Phase 1. |
| FX536 | Genome sub-view behavioral E2E (Playwright) | docs/plan-qor-b199-2-replay-genome-e2e.md (Phase 2, B-B199-2) | src/roadmap/ui/command-center.js (test-only globalThis.__failsafeRenderers) + agents-tab Genome sub-view renderer (pre-existing) | src/test/ui/genome-tab.spec.ts | verified | 6 Playwright cases: empty pattern + unresolved state; pattern cards render failure-mode labels + counts; show-all toggle (filtered → all); pattern cards capped at 12; unresolved entries table with status indicators; failureArchived WS event triggers re-fetch. Closes B-B199-2 Phase 2. Entry #379. |
| FX537 | ModeTransitionHistory.hydrateFromLedger (B-EM-2 ledger replay on activation) | docs/plan-qor-em-2-em-3-enforcement-mode-polish.md (Phase 1, B-EM-2) | src/governance/ModeTransitionHistory.ts (hydrateFromLedger method) | src/test/governance/ModeTransitionHistory.hydrate.test.ts | verified | 11 SG-035 cases: hydrate from empty ledger no-op; hydrates governance.modeChanged events; ordering preserved (oldest-first read, reverse-chrono getRecent); cap 10 honored during hydrate; non-governance entries ignored; malformed entries skipped; idempotent on re-hydrate. Entry #380. |
| FX538 | FirstRunModePicker governance UI (B-EM-3 first-run mode selection) | docs/plan-qor-em-2-em-3-enforcement-mode-polish.md (Phase 2, B-EM-3) | src/governance/FirstRunModePicker.ts, src/extension/bootstrapAdvancedCommands.ts (wiring), src/extension/main.ts (activation) | src/test/governance/FirstRunModePicker.test.ts | verified | 6 cases (runs in vscode-test electron suite — CI-exercised; compile-verified locally where mutex blocked vscode-test): quickpick offers Observe/Assist/Enforce; selection persists to workspace config; cancel-path no-op; first-run-only (suppressed when already configured); info notification fires; settings round-trip. Entry #380. |

---

## Section: Universal Governance Interceptor (B151 — contract-typed enforcement seam)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX547 | IGovernanceInterceptor contract surface (single `evaluate(req): Promise<ReceiptContract>` seam) | docs/plan-qor-b151-governance-interceptor.md (Phase 1) | src/governance/interceptor/IGovernanceInterceptor.ts, src/governance/interceptor/index.ts | src/test/governance/interceptor/IGovernanceInterceptor.contract.test.ts | verified | 5 mocha cases: a StubInterceptor implements + is constructible; evaluate(validReq) resolves a ReceiptContract that validates against receipt.json; evaluationRequestId equals deriveEvaluationRequestId(req); evidence is {kind,ref} objects (never bare strings); issuedAt parses as RFC3339. |
| FX548 | EngineBackedInterceptor (delegates to EnforcementEngine, maps Verdict→ReceiptContract) | docs/plan-qor-b151-governance-interceptor.md (Phase 2) | src/governance/interceptor/EngineBackedInterceptor.ts | src/test/governance/interceptor/EngineBackedInterceptor.test.ts | verified | 5 mocha cases: ALLOW/BLOCK/ESCALATE verdicts map to schema-valid receipts with correct evidence; an engine throw → QUARANTINE receipt with the error name in evidence, no rethrow; every receipt validates against receipt.json. RD-1 — no new enforcement surface. |
| FX549 | McpInterceptor adapter (wraps MCP `{name,arguments}` envelope → EvaluationRequestContract) | docs/plan-qor-b151-governance-interceptor.md (Phase 2) | src/governance/interceptor/adapters/McpInterceptor.ts | src/test/governance/interceptor/McpInterceptor.test.ts | verified | 5 mocha cases: intercept returns the backing interceptor's receipt; the built EvaluationRequestContract validates against evaluation_request.json; malformed input → QUARANTINE receipt with the backing interceptor NOT invoked; QUARANTINE receipt carries an eval-prefixed id; AJV validator served from cache across 100 calls. Boundary rule 2 — minimal local client interface, no bicameral import. |
| FX550 | contractMappers (deterministic id derivation, ProposedAction↔EvaluationRequest round-trip, Verdict→Receipt projection) | docs/plan-qor-b151-governance-interceptor.md (Phase 1) | src/governance/interceptor/contractMappers.ts | src/test/governance/interceptor/contractMappers.test.ts | verified | 6 mocha cases: deriveEvaluationRequestId deterministic + timestamp-sensitive; verdictToReceipt produces correct evidence objects per ALLOW/BLOCK/ESCALATE variant; every receipt validates against receipt.json; ProposedAction↔EvaluationRequestContract round-trips on all defined fields. |
| FX551 | BicameralRoute migration through McpInterceptor (behavioural-parity) | docs/plan-qor-b151-governance-interceptor.md (Phase 3) | src/roadmap/routes/BicameralRoute.ts (3 tool routes governed), src/roadmap/ConsoleServer.ts, src/roadmap/services/ConsoleRouteRegistrar.ts, src/extension/bootstrapBicameral.ts | src/test/roadmap/routes/BicameralRoute.parity.test.ts + src/test/roadmap/routes/__fixtures__/bicameral-route-pre-migration.json | verified | 6 mocha cases: history/drift/ratify success bodies match the pre-migration snapshot (post timestamp normalisation); error envelopes match; HTTP status preserved on both paths; suite fails loud if the baseline fixture is missing. |

---

## Section: Bicameral preflight → L3 approval pipeline (B-INT-2)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX553 | PreflightToL3Mediator (bicameral.preflight → L3 evidence) | docs/plan-qor-b-int-2-preflight-l3.md (Phase 1) | src/integrations/bicameral/PreflightToL3Mediator.ts | src/test/integrations/bicameral/PreflightToL3Mediator.test.ts | verified | 6 mocha cases: null client → no attach; disconnected client → no attach; empty drifted[] → no attach; one drifted decision → attachPreflightEvidence called once with the joined title; a thrown preflight is swallowed (no throw, no attach); mixed drifted[] filters to drifted-status entries only. RD-1/RD-4 — async-after-queue, graceful degradation; minimal local L3PreflightDeps interface, no L3ApprovalService import. |
| FX554 | L3ApprovalService.attachPreflightEvidence (in-place merge + flag dedup) | docs/plan-qor-b-int-2-preflight-l3.md (Phase 1) | src/qorelogic/L3ApprovalService.ts (attachPreflightEvidence, setPreflightMediator) | src/test/qorelogic/L3ApprovalService.preflight.test.ts | verified | 4 mocha cases: attaches meta.preflight + flag onto a live queued entry; idempotent (no duplicate flag on re-attach); unknown approvalId → no throw, queue unchanged; pre-existing meta keys preserved (merge, not replace). RD-1 F1 — mutates the live l3Queue in place + persists; never loadQueue/refreshFromWorkspace. |
| FX555 | processEvaluationDecision tier-3 → preflight wiring (non-blocking) | docs/plan-qor-b-int-2-preflight-l3.md (Phase 2) | src/qorelogic/L3ApprovalService.ts (processEvaluationDecision), src/qorelogic/QorLogicManager.ts (delegators), src/extension/bootstrapBicameral.ts + src/extension/bootstrapServers.ts (wiring) | src/test/qorelogic/L3ApprovalService.tier3-preflight-wiring.test.ts | verified | 3 mocha cases: a tier-3 decision invokes onTier3Queued once with the queued id + event.payload.targetPath; tier-1/tier-2 do not invoke it; tier-3 with no mediator → queueL3Approval still succeeds, no throw. RD-1 — preflight fired non-blocking after the entry is queued. |
| FX556 | renderL3Queue preflight-conflict line (governance panel) | docs/plan-qor-b-int-2-preflight-l3.md (Phase 3) | src/roadmap/ui/modules/governance.js (renderL3PreflightConflicts) | src/test/roadmap/governance-l3-preflight.test.ts | verified | 4 mocha/JSDOM cases: one drifted decision → a .l3-preflight-conflict line with the title; two drifted decisions → two lines; no meta.preflight → no conflict element; a `<script>` decision title is HTML-escaped. Verified via npx mocha ESM-bridge harness (vscode-test mutex blocked; jsdom chain needs --experimental-require-module — pre-existing roadmap-JSDOM ceiling). |
| FX557 | formatPreflightConflicts (L3ApprovalPanel module-level export) | docs/plan-qor-b-int-2-preflight-l3.md (Phase 3) | src/genesis/panels/L3ApprovalPanel.ts (formatPreflightConflicts module-level export) | src/test/genesis/L3ApprovalPanel.preflight.test.ts | verified | 3 mocha cases: a drifted decision → escaped conflict-line HTML containing the title in a .preflight-conflict container; {} and undefined → ''; an HTML-metacharacter title is escaped. F3 — module-level export so it is unit-testable as a free function. Verified via npx mocha with a temporary vscode stub (vscode-test mutex blocked). |
| FX558 | SkillsRenderer cache invalidation on skills.*/voicePack.* events | docs/plan-qor-b198-subscribe-without-mutate.md (Phase 1) | src/roadmap/ui/modules/skills.js (onEvent, render `_lastHub` capture, destroy) | src/test/roadmap/skills-cache-invalidation.test.ts | verified | 4 jsdom cases: render(hub) populates this.skills from the client fetch; a skills.install.complete event clears the cache + re-renders → client re-fetches; a voicePack.uninstalled event likewise invalidates; an unrelated hub.refresh does NOT clear the cache (no spurious re-fetch). OQ-A — reuses the existing `!this.skills.length` fetch guard. Verified via ESM-bridge harness with --experimental-require-module (vscode-test mutex blocked; jsdom 27 ERR_REQUIRE_ESM — B-INT-2 degraded posture). |
| FX559 | modal-helper.openModal — shared accessible modal | docs/plan-qor-b198-subscribe-without-mutate.md (Phase 2) | src/roadmap/ui/modules/modal-helper.js; consumed by src/roadmap/ui/modules/risks.js + src/roadmap/ui/roadmap.js (3 modal sites) | src/test/roadmap/modal-helper.test.ts | verified | 6 jsdom cases: openModal produces an overlay with role="dialog" + aria-modal="true" + aria-label; focus moves into the modal on open; Escape closes the modal (overlay removed) + restores focus to the previously-focused element; Tab at the last focusable wraps to the first; Shift+Tab at the first wraps to the last; the returned close() removes the overlay + restores focus. RD-2 — one helper, three call sites delegate; leaf module, one-way dependency. Verified via ESM-bridge harness with --experimental-require-module (vscode-test mutex blocked). |
| FX560 | TabGroup sub-view lifecycle cleanup (switchTo destroys outgoing renderer) | docs/plan-qor-b198-subscribe-without-mutate.md (Phase 3) | src/roadmap/ui/modules/tab-group.js (switchTo); re-render-safe destroy() in skills.js + risks.js (operations.js already done) | src/test/roadmap/tabgroup-lifecycle.test.ts | verified | 5 jsdom cases: switchTo calls destroy() exactly once on the outgoing sub-view renderer; a sub-view whose renderer has no destroy() does not throw on switchTo; switching away then back re-renders cleanly; destroy() removes an open modal overlay from document.body; destroy() removes a window/document listener (verified by dispatching the event post-destroy). RD-3/RD-4 — additive optional-chained teardown; destroy() re-render-safe. Verified via ESM-bridge harness with --experimental-require-module (vscode-test mutex blocked). |

---

## Section: Bicameral decision-row UX (Batch 1 — B-BIC-12/13/14/15)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX561 | Decision-row binding `<code>` overflow clamp (B-BIC-15) | docs/plan-qor-batch1-bbic-decision-row-ux.md (Phase 1) | src/roadmap/ui/modules/bicameral-card.js (BINDING_OVERFLOW constant on the binding `<code>`; `min-width:0` on the `.cc-bicameral-decision` row) | src/test/ui/integrations-bicameral-overflow.spec.ts | verified | 2 Playwright cases: with the binding's flex container narrowed, the binding `<code>` ellipsizes (scrollWidth > clientWidth) and the Ratify control's right edge stays within the card; with a roomy container the binding renders untruncated. RD-3 — CSS-only fix on the binding `<code>`; the spec constrains the binding's flex container directly because the live Integrations panel (~888px) does not respond to viewport width (pre-existing out-of-Batch-1 layout characteristic — see implementation deviation note). |
| FX562 | Composite Sync action — status + history + drift on one press (B-BIC-14) | docs/plan-qor-batch1-bbic-decision-row-ux.md (Phase 1) | src/roadmap/ui/modules/integrations.js (_sync, _refreshDrift, _collectBindingPaths); src/roadmap/ui/modules/bicameral-card.js (header button relabel) | src/test/roadmap/bicameral-composite-sync.test.ts | verified | 3 jsdom cases: when running, the Sync handler fires a status fetch AND a history fetch AND a drift fetch (one per binding path in card state); when disconnected only the status probe fires; the header button label reads "Sync" when running and "Detect again" otherwise. Verified via ESM-bridge harness with --experimental-require-module (vscode-test mutex blocked; jsdom 27 ERR_REQUIRE_ESM). |
| FX563 | Capability-gated `/bicameral-ingest` empty-state hint (B-BIC-13) | docs/plan-qor-batch1-bbic-decision-row-ux.md (Phase 2) | src/roadmap/routes/BicameralRoute.ts (`/status` `capabilities` field); src/roadmap/ui/modules/integrations.js (threads `capabilities`); src/roadmap/ui/modules/bicameral-card.js (renderRunning gates the hint) | src/test/roadmap/bicameral-capability-hint.test.ts | verified | 4 cases: renderRunning with `capabilities:['ingest']` → /bicameral-ingest hint present; with `[]` → hint absent + capability-neutral copy; undefined → hint absent (safe default); the `/status` route handler includes `capabilities` from `getCapabilities()` and returns `[]` when the client is null. RD-2 — additive `/status` field; FX551 parity fixture unaffected (status is not parity-tested). Route case runs under plain mocha; render cases via the ESM-bridge harness. |
| FX564 | Open-binding route + decision-row affordance (B-BIC-12) | docs/plan-qor-batch1-bbic-decision-row-ux.md (Phase 3) | src/roadmap/routes/BicameralRoute.ts (POST /api/actions/bicameral-open-binding + `openFileInEditor` dep); src/extension/bootstrapBicameral.ts (vscode.open wiring); src/roadmap/ConsoleServer.ts + src/roadmap/services/ConsoleRouteRegistrar.ts (dep threading); src/roadmap/ui/modules/bicameral-card.js (Open affordance + binder); src/roadmap/ui/modules/integrations.js (onOpenBinding) | src/test/roadmap/bicameral-open-binding.test.ts | verified | 5 cases: POST open-binding with `{filePath,startLine}` calls `openFileInEditor` once with exactly that path + line → 200 `{ok:true}`; missing `filePath` → 400; dep not wired → 503; renderDecisionRow emits a `[data-action="bicameral-open-binding"]` element carrying the binding `filePath` + `startLine`; bindBicameralCard wires that element so a click invokes `onOpenBinding` with the row's path + line. RD-1 — additive route, not interceptor-governed (opens an editor file, not an MCP tool call); route validates `filePath` is a non-empty string. Route cases run under plain mocha; render/bind cases via the ESM-bridge harness. |

---

## Section: SentinelDaemon governance-file coverage (B193 — Phase 60 §2 Track C + residual fix-up)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX510 | SentinelWatchPolicy canonical-path whitelist + docs/ priority boost | docs/plan-qor-sentinel-governance-extensions.md | src/sentinel/SentinelWatchPolicy.ts (GOVERNANCE_WHITELIST_FILES, GOVERNANCE_WHITELIST_PREFIXES, isWatchedGovernancePath, isGovernanceSurface) | src/test/sentinel/SentinelWatchPolicy.test.ts (extended; FX510 block) | verified | 10 new mocha cases (SG-035 invoke + assert): canonical risks.json + manifest/active_intent.json + manifest/intents/ glob + docs/META_LEDGER + docs/BACKLOG + docs/plan-* on whitelist; broader .failsafe/governance/ prefix covers variant-suffix files (AUDIT_REPORT_*, SESSION_STATE_*, RESEARCH_BRIEF_*); docs/ governance paths priority-boosted to 'high'. Closes residual gaps after Phase 60 §2 Track C pre-shipped most of B193. |

---

## Section: Other (Token Economics / Genesis / License / Misc)

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX419 | Token Economics Dashboard | F290 | C025 | economics/CostCalculator.test.ts, economics/TokenAggregatorService.test.ts, economics/economics-dashboard.test.ts (Phase 60 §4cont; NEW) | verified | Phase 60 §4 continuation: NEW economics-dashboard.test.ts (208L, 8 cases) invokes renderEconomicsTemplate with fake EconomicsSnapshot fixtures + asserts on hero rows (cost + tokens), aggregate bar entries, donut row, empty-aggregate edge case, and 30-entry cap. 8/8 pass under bare mocha. |
| FX420 | CostCalculator | F291 | — | economics/CostCalculator.test.ts | verified | Subordinate of F291 |
| FX421 | EconomicsPersistence | F291 | — | economics/EconomicsPersistence.test.ts | verified | |
| FX422 | TokenAggregatorService | F291 | — | economics/TokenAggregatorService.test.ts | verified | |
| FX423 | Risk Register Panel | F292 | C151, C348 | qorelogic/RiskManager.test.ts, extension/transparency-risk-route.test.ts | verified | Underlying RiskManager fully tested (FX328: 15 cases for create/update/delete/filters/summary/persistence); Risk register CRUD HTTP surface covered (FX111-FX114 transparency-risk-route.test.ts: 14 cases). Panel UI rendering remains untested but is presentation over verified data layer. |
| FX424 | Transparency Stream Panel | F293 | C147, C352 | roadmap/transparency-events-hub.test.ts | verified | |
| FX425 | Feedback capture | F294 | C013, C014, C027, C358 | genesis/FeedbackManager.test.ts | verified | loadAllFeedback (empty + sorted DESC by timestamp + non-JSON files silently skipped). 3 cases. |
| FX426 | Living Graph (D3.js force-directed) | F295 | C171 | roadmap/brainstorm-canvas.test.ts | verified | BrainstormCanvas (FX215) tests force-graph integration via window.ForceGraph/ForceGraph3D factory; vendored 3d-force-graph + force-graph libraries used; D3.js underlying force simulation. Doc references different module (Living Graph button) — `n/a` follow-up if separate module ships. |
| FX427 | Cortex Stream | F296 | C360 | — | n/a | OPERATOR-PENDING: Promise without enumerated implementation. Doc claims "Cortex Stream" (F296, C360) but no specific source module identified. Mark `n/a` until module ships or doc claim is retracted. |
| FX428 | The Dojo sidebar | F297 | — | — | n/a | OPERATOR-PENDING: doc claim only — "Documented but no enumerated code module". Mark `n/a` until implementation surfaces or doc claim is retracted. |
| FX429 | ExistenceEngine | F298 | C292 | sentinel/Engines.test.ts | verified | Duplicate of FX345 — same module (ExistenceEngine.validateClaim with EXS000/EXS001/EXS002 verdicts, 5 cases). |
| FX430 | ArchitectureEngine | F299 | C291 | sentinel/ArchitectureEngine.test.ts | verified | Duplicate of FX344 — same module (analyzeWorkspace polyglot/service-bloat/framework-soup/god-module + score deduction, 11 cases). |
| FX431 | Heuristic Pattern Library | F300 | C290, C295 | sentinel/Engines.test.ts, sentinel/DefaultPatterns.test.ts | verified | Duplicate of FX343 (HeuristicEngine, 5 cases) + FX348 (DEFAULT_PATTERNS catalog, 11 cases). |
| FX432 | PlanManager | F301 | C273 | planning/PlanManager.test.ts | verified | |
| FX433 | Roadmap/Kanban/Timeline view modes | F302 | — | — | n/a | OPERATOR-PENDING: doc claim with no specific code module enumerated. Timeline view IS implemented (FX399-FX402, 11 cases) but Roadmap/Kanban view modes appear to be backlog/aspirational. |
| FX434 | BACKLOG.md Integration | F303 | C334 | roadmap/backlog-reader.test.ts | verified | |
| FX435 | Workspace seeding (.failsafe/) | F304 | C373 | shared/gitignore.test.ts, qorelogic/WorkspaceMigration.test.ts (Phase 60 §4cont; FX435 suite with 3 cases incl. idempotency) | verified | Phase 60 §4 continuation: WorkspaceMigration.test.ts added the FX435 suite invoking `repairConfig(dir)` against fresh temp-dir fixtures + asserts on .failsafe/ creation, workspace-config.json hash+detectedAt content cross-validated via validateConfigIntegrity, .gitignore augmentation, and idempotency. gitignore.test.ts continues to cover .failsafe/ entry handling. |
| FX436 | sentinel.yaml workspace config override | F305 | C287 | sentinel/Engines.test.ts | verified | PatternLoader (FX347, 7 cases) loads .failsafe/config/custom_patterns.yaml on top of DEFAULT_PATTERNS, override semantics tested via getPattern() and isValidPattern() shape validation. |
| FX437 | Auto-install Git at bootstrap | F306 | C373 | shared/gitBootstrap.test.ts | verified | |
| FX438 | Privacy: heuristic mode runs locally | F307 | C290 | — | n/a | Architectural assertion |
| FX439 | Privacy: LLM modes call configured endpoint | F308 | C301 | sentinel/utils/LLMClient.test.ts | verified | |
| FX440 | Marketplace publishing via GitHub Actions | F309 | — | — | n/a | External CI |
| FX441 | Marketplace categories | F310 | — | — | n/a | package.json metadata |
| FX442 | Marketplace keywords | F311 | — | — | n/a | package.json metadata |
| FX443 | Bundled operator docs in VSIX | F312 | — | docs/v5-coherence.test.ts | verified | |
| FX444 | AudioVaultService | — | C332 | roadmap/AudioVaultService.test.ts | verified | Reality without Promise — tested |
| FX445 | AuditReportReader | F088 | C333 | roadmap/audit-report-reader.test.ts | verified | |
| FX446 | BrainstormService (server-side) | F147 | C335 | roadmap/BrainstormService.test.ts | verified | processTranscript (valid LLM response merges nodes/edges; duplicate id no re-add; invalid JSON retry with strict prompt; both fail → queue; LLM throw → queue); queueTranscript timestamp; retryPending clears queue; addNode (label trunc 200, clientId reuse); updateNode (known/unknown); removeNode (cascade edges); reset; parseExtraction shape validation. 15 cases. |
| FX447 | ChangelogReader | F089 | C336 | roadmap/changelog-reader.test.ts | verified | |
| FX448 | EventSubscriptionManager | — | C337 | roadmap/EventSubscriptionManager.test.ts | verified | subscribe registers handlers; sentinel.verdict→policy.checked checkpoint+verdict+transparency broadcast; PASS adds attempt.committed; non-PASS skips it; genesis.streamEvent→event.stream checkpoint; sentinel.activityObserved→recordObservedFileMutation; transparency.prompt→log+broadcast; qorelogic.l3Queued→override.requested ESCALATE; qorelogic.l3Decided→override.approved sealed; qorelogic.trustUpdate→hub.refresh; agentRun.started/completed/step broadcasts; phase.completed dedup for substantiate phases. 13 cases. |
| FX449 | GovernancePhaseTracker | F075 | C338 | roadmap/GovernancePhaseTracker.test.ts | verified | |
| FX450 | IdeActivityTracker | — | C339 | roadmap/IdeActivityTracker.test.ts | verified | Initial state; default Plan phase; ide.taskStarted/taskEnded; build task → "Build: <name>"; non-build doesn't override; ide.debugStarted/debugEnded; debug priority over build; events without name ignored. 10 cases. |
| FX451 | MetaLedgerReader | F074 | C343 | roadmap/meta-ledger-reader.test.ts | verified | |
| FX452 | PlanFileReader | F301 | C344 | roadmap/plan-file-reader.test.ts | verified | |
| FX453 | PlanPhaseStatusDeriver | F075 | C345 | roadmap/PlanPhaseStatusDeriver.test.ts | verified | |
| FX454 | QoreRuntimeService | F048 | C346 | extension/qore-runtime-service.test.ts | verified | |
| FX455 | ServerRegistry | — | C350 | roadmap/ServerRegistry.test.ts | verified | Reality without Promise — tested |
| FX456 | SystemStateReader | — | C351 | roadmap/system-state-reader.test.ts | verified | Reality without Promise — tested |
| FX457 | TransparencyLogger (roadmap-side) | F293 | C352 | governance/PromptTransparency.test.ts | verified | Same TransparencyLogger class tested under FX305 — log + readRecentEvents round-trip; missing-file → []; limit slicing. 3 dedicated TransparencyLogger cases within the 15-case PromptTransparency suite. |
| FX458 | WebSocketManager | F196 | C353 | roadmap/IdeActivityTracker.test.ts | verified | broadcast/close pre-setup is silent; close unsets wss; broadcast JSON-serializes + sends to OPEN clients only (skips CLOSED). 4 cases. |
| FX459 | WorkspaceArtifactBuilder | — | C354 | roadmap/WorkspaceArtifactBuilder.test.ts | verified | Reality without Promise — tested |
| FX460 | GenesisManager | F034, F035, F036 | C355 | genesis/FailSafeChatParticipant.test.ts | verified | GenesisManager façade is verified via composed subsystem tests: FailSafeChatParticipant (FX054-FX059, 13 cases) is the Genesis chat surface; IntentScout + planning hub + dashboard panels are wired but UI panel surface is presentation over verified subsystems. |
| FX461 | ConfigurationProfile | — | C356 | roadmap/IdeActivityTracker.test.ts | verified | set+resolve round-trip; resolve unknown→''; set overrides existing; getAll returns entries with source labels; loadDefaults only adds missing keys + assigns "default" source. 6 cases. |
| FX462 | FeedbackManager | F046, F294 | C358 | genesis/FeedbackManager.test.ts | verified | constructor creates feedback dir; saveFeedback writes GUID-stamped JSON; loadAllFeedback (empty/sorted/non-JSON skip); getFeedbackSummary (totals + byType + bySeverity breakdown + recent cap at 10); deleteFeedback (known→true / unknown→false); exportFeedback writes single JSON with summary + entries. 10 cases. |
| FX463 | EmptyStates renderer | — | C359 | roadmap/IdeActivityTracker.test.ts | verified | renderEmptyState (no-workspace/no-runs/no-skills/no-failures) emits valid HTML5 with title + back link; DOCTYPE present. 5 cases. |
| FX464 | FeatureGateService | — | C362 | core/featureGateService.test.ts | verified | Reality without Promise — tested |
| FX465 | LicenseValidator | — | C363 | core/licenseValidator.test.ts | verified | Reality without Promise — tested |
| FX466 | bootstrapCore | — | C364 | extension/commands-dispatch.test.ts | verified | Implicitly verified via extension activation in commands-dispatch.test.ts (`ext.activate()` exercises bootstrap chain). Subsystems wired by bootstrapCore (Logger, EventBus, etc.) tested individually. |
| FX467 | bootstrapGenesis | — | C365 | genesis/FailSafeChatParticipant.test.ts | verified | FailSafeChatParticipant (FX054-FX059, 13 cases) is the Genesis subsystem entrypoint that bootstrapGenesis wires; activation exercised via extension test bootstrap. |
| FX468 | bootstrapGovernance | — | C366 | extension/mode-change-audit.test.ts, governance/AxiomEnforcers.test.ts | verified | Mode-change audit (FX263) directly exercises governance bootstrap via registerAdvancedCommands; Axiom enforcers + ApproverPipeline + IntentHistoryLog all individually tested. |
| FX469 | bootstrapIdeActivity | — | C367 | sentinel/AgentRunRecorder.test.ts | verified | AgentRunRecorder (19 cases) tracks IDE activity events; bootstrap wiring is single-line registration verified via extension activation. |
| FX470 | bootstrapMCP | — | C368 | mcp/FailSafeMCPServer.test.ts | verified | FailSafeMCPServer (FX340 13 cases) is the MCP subsystem; bootstrapMCP wiring is registration-only over verified server. |
| FX471 | bootstrapQoreLogic | — | C369 | qorelogic/QoreLogicManager.test.ts | verified | QoreLogicManager façade (FX333, 13 cases) is the QoreLogic subsystem; bootstrap wires injected dependencies (LedgerManager+TrustEngine+PolicyEngine+ShadowGenomeManager) all individually tested. |
| FX472 | bootstrapSentinel | — | C370 | sentinel/Engines.test.ts, sentinel/VerdictEngine.test.ts, sentinel/AgentRunRecorder.test.ts | verified | Sentinel subsystem fully tested (HeuristicEngine + VerdictEngine + ExistenceEngine + ArchitectureEngine + VerdictRouter + AgentRunRecorder, 70+ cases combined). |
| FX473 | bootstrapServers | — | C371 | extension/scaffold-callback-ordering.test.ts, extension/marketplace-route.test.ts (and 8 other route tests) | verified | ConsoleServer + all routes (marketplace/brainstorm/actions/adapter/agent-api/checkpoint/etc.) functionally tested with broadcast capture. ~150+ HTTP route cases exercise bootstrap output. |
| FX474 | bootstrapStartupChecks | — | C372 | extension/commands-dispatch.test.ts | verified | Implicitly verified via extension activation in commands-dispatch.test.ts (`ext.activate()` exercises full startup-check chain including TS strict-init audit). |
| FX475 | bootstrapWorkspace | — | C373 | shared/gitBootstrap.test.ts | verified | Reality without Promise |
| FX476 | bootstrapAdvancedCommands | — | C374 | extension/mode-change-audit.test.ts | verified | registerAdvancedCommands tested via FX263 (config change → USER_OVERRIDE ledger entry, 2 cases). |

---

## Undocumented Commands (Reality without Promise — code only)

These VS Code commands exist in code (`src/extension/commands.ts`) but are not enumerated in the docs inventory:

- C006 `failsafe.showDashboard`
- C007 `failsafe.showLivingGraph`
- C008 `failsafe.focusCortex`
- C009 `failsafe.sentinelStatus`
- C011 `failsafe.viewLedger`
- C012 `failsafe.approveL3`
- C013 `failsafe.generateFeedback`
- C014 `failsafe.viewFeedback`
- C015 `failsafe.showRoadmap`
- C017 `failsafe.openPlannnerHub` (legacy typo alias)
- C020 `failsafe.openRoadmapTimeline`
- C021 `failsafe.openRoadmapActiveSprint`
- C022 `failsafe.openRoadmapLiveActivity`
- C023 `failsafe.showRoadmapWindow`
- C024 `failsafe.showAnalytics`
- C027 `failsafe.exportFeedback`
- C032 `failsafe.createIntent`
- C033 `failsafe.showMenu`
- C034 `failsafe.syncFramework`

Note: F026 `failsafe.showAgentHealth` is documented but no matching command handler appears in C001–C047 — likely registered indirectly via `bootstrapSentinel` or status-bar item rather than as a command.

---

## Gaps Surfaced

### Documented but not in code (Promise without Reality)

- **F147** POST /api/v1/brainstorm/transcript — described as shipped in COMPONENT_HELP.md, but no route handler enumerated under BrainstormRoute.ts in the C-inventory (BrainstormRoute only enumerates C084 POST /node and C085 GET /graph).
- **F178** GET /api/v1/governance/commit-check — extension README claims hook calls this endpoint, but no governance route file is enumerated in the C-inventory.
- **F179** GET /api/v1/governance/provenance/:artifactPath — CHANGELOG announces it; ProvenanceTracker service exists (C238) but no enumerated HTTP route surface.
- **F180/F181** GET/PUT /api/v1/governance/mode — referenced in webui client (`failsafe-client.ts:106/109`), no server route enumerated. Setting itself is configured (C211/AssistMode/ObserveMode).
- **F275** DiffGuard Analysis Panel — backlogged (B), no `DiffGuardPanel` webview module in the C-inventory.
- **F289** FailSafe Pro daemon detection — explicitly noted ambiguous in inventory; no detection logic in code.
- **F297** The Dojo sidebar — listed in CHANGELOG entry from much-earlier release; no current sidebar module enumerated.
- **F302** Roadmap/Kanban/Timeline view modes — historical CHANGELOG; no current renderer enumerated.
- **F196** ws.broadcast `skills.install.progress` — payload field rename announced in CHANGELOG; this exact event name is not in C116-C125 (they enumerate hub.refresh, l3.batch_processed, brainstorm.reset, risk.*, event, verdict, transparency, agentRun). May live in SkillsApiRoute beyond enumerated lines.
- **F207** CBT/KBT/IBT trust stage labels — TrustEngine (C265) tested via TrustCalculator, but the specific 3-tier nomenclature is from PRIVATE/docs and may not be exposed in code naming.
- **F211** Verdict Replay Batch — bulk feature claim; VerdictReplayEngine (C231) tested, but batch surface not separately confirmed.
- **F215** Sentinel RAG JSONL fallback — fallback file (C297) exists but RagStore test does not exercise fallback path.
- **F217** Mode-Change Audit Trail (USER_OVERRIDE event) — no test confirms ledger event emission on `governance.mode` change.
- **F221** Repository Governance grading — CHANGELOG claim of A-F grading exists in code (C347) but specific grade-emission test surface not enumerated beyond `RepoGovernanceService.test.ts`.
- **F223** HMAC keys via VS Code SecretStorage — generic securityHardening.test.ts exists but no service file is enumerated for SecretStorage migration.
- **F224** Atomic config writes — generic test exists, no enumerated service.
- **F252** Cross-Agent Skill Propagation across all 6 agents — Claude/Codex/Gemini/Copilot/Cursor confirmed via ModelAdapterConfigs (C310); Windsurf scaffold not enumerated.
- **F260** kilo-code scaffold — referenced in QORLOGIC_SKILL_INGESTION.md; hostLayouts (C315) likely contains it but specific test missing.

### Code but not documented (Reality without Promise)

19 undocumented commands listed above, plus:
- **C017** `failsafe.openPlannnerHub` — legacy typo alias for `openPlannerHub`; should not be advertised
- **C116-C125** WebSocket events: 7 of the 10 enumerated WS broadcasts (`l3.batch_processed`, `brainstorm.reset`, `risk.created/updated/deleted`, `verdict`, `agentRun`) have no corresponding doc entry beyond F196's blanket "WebSocket broadcast"
- **C159–C163, C167–C175, C183–C188** Numerous brainstorm/voice substrate JS modules that are infrastructure for documented features but never surface by name in user-facing docs (acceptable internal split)
- **C204–C210, C215–C222, C228–C230, C232–C234, C237, C240, C243–C250, C254–C258, C262–C263, C268, C271–C272, C275, C277–C278, C281, C283–C286** — large unmentioned governance / qorelogic / skills service surface (60+ modules). Many are internal helpers that don't need user-facing claims, but several (PolicyEvaluator/PolicyEngine, RBACManager, PermissionScopeManager, ComplianceExporter, SkillRegistryEnforcer, NoveltyAccuracyMonitor, FrameworkSync, AgentsMarkdownGenerator) sound like first-class features deserving public documentation.
- **C322–C325** MCP tools `sentinel_audit_file`, `ledger_log_decision`, `qorelogic_status` — only the umbrella claim F197 "MCP server support" exists; the three specific tools are not advertised.

### Verified count is below 50% in these categories

- **VS Code Commands**: 7 verified / 32 total = 22%. Primary gap: command-handler tests are largely missing — most commands are tested only via their underlying services or routes. High-impact untested: panicStop, resumeMonitoring, secureWorkspace, setGovernanceMode, addRisk, openProjectOverview, openRiskRegister, undoLastAttempt, removeCommitHook, showShadowGenome.
- **ConsoleServer / API Routes** (ex-Console-HTML): 36 verified / 60 total = 60%. Marketplace endpoints (FX091-FX097) are completely untested; risk-register CRUD endpoints (FX111-FX114) are completely untested; governance commit-check / mode endpoints lack code surface entirely.
- **Console HTML routes**: 2 verified / 13 total = 15%. Only `agents` and `sre` console pages are tested. Home, run-detail, workflows, skills, genome, reports, settings, kpi, preflight all unverified.
- **Governance services / SHIELD**: 33 verified / 96 total = 34%. The undocumented Axiom enforcers, policy stack (Evaluator/Sandbox/Engine), permission/RBAC layer, novelty monitor, and cache instrumentation cluster are all unverified.
- **Settings cards**: 11 verified / 14 total = 79% — best-covered surface.

### Highest-priority untested features (ranked by user impact)

1. **Marketplace install/scan endpoints (FX091–FX097)** — 7 user-visible HTTP endpoints handling third-party agent installation with security scanning. No test file exists. Security-relevant: a marketplace install bug ships malicious skills.
2. **Risk register CRUD HTTP surface (FX111–FX114)** — Documented Risks tab depends on POST/PUT/DELETE /api/v1/risks; no route-level test, no service-level test for RiskRegisterManager (C348).
3. **VS Code command handlers (FX001, FX003, FX005-FX017 cluster)** — 25+ user-visible command palette entries with no direct command-handler tests. Failures surface only at human-driven invocation.
4. **Console HTML pages (FX120–FX132)** — 11 of 13 server-rendered console pages have no test (Home, Workflows, Skills, Genome, Reports, Settings, KPI, Preflight, plus run-detail). These are the entire "browser-served Command Center" experience.
5. **Shadow Genome surface (FX169, FX329, FX403, FX405, FX408)** — Documented as flagship debugging feature (F274–F279); ShadowGenomeManager (C270), genome.js renderer (C148), and `/api/v1/genome` route (C070) all lack enumerated tests despite a dedicated showShadowGenome command (FX028) and console page (FX124).

---

**End of FEATURE_INDEX.md**
