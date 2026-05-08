# Changelog

All notable changes to the MythologIQ FailSafe extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.0] - 2026-05-06

Minor release. Comprehensive E2E coverage methodology + release-class CI gate (B199 Phase 1) + Monitor B191 functional proof. GitHub community files, issue templates, and comprehensive Wiki.

### Added

- Comprehensive E2E coverage methodology with Playwright test harness.
- Release-class CI coverage gate for `feature` and `breaking` change classes.
- GitHub community files: FUNDING.yml, enhanced issue templates (bug, feature, security, docs, question), PR template.
- Comprehensive GitHub Wiki with 23 pages covering architecture, governance, configuration, and troubleshooting.
- Wiki initialization workflow (`wiki-init.yml`) for automated wiki population.

### Fixed

- Monitor never bootstrapped in production (missing `type="module"` on bootstrap script).
- SEAL phase rendered "Substantiate active" instead of "all four done".
- IDLE phase rendered "Plan active" instead of "all pending".

## [5.0.0] - 2026-04-25

Major release. Public reveal of the FailSafe / FailSafe Pro product split. The v4 bundled-skills installer is replaced by ingestion from the [`qor-logic`](https://pypi.org/project/qor-logic/) PyPI package. Skills now begin with `qor-` (was `ql-`). The Command Center reads workspace truth — META_LEDGER, BACKLOG, plan files, audit reports, and CHANGELOG — instead of showing empty placeholder state.

### Added (Round 3 — Voice & Brainstorm UX, 2026-05-06)

- Multilingual speech-to-text — Whisper model picker (tiny / base / small) and BCP-47 language selector in the Voice settings section. Default model switched from English-only `whisper-tiny.en` to multilingual `whisper-tiny`.
- Voice status badge — single-element DOM badge in the Brainstorm right panel surfacing the unified state stream (idle / listening / processing / speaking / error:*).
- Auto-match voice — when enabled, switching STT language auto-selects the matching Piper TTS voice from a 12-language catalog.
- TTS error transparency — Piper vendor presence failures (`piper_not_vendored`, `wrong_mime`, `init_failed`) now surface to the status badge instead of silent console.info.
- Brainstorm history limit — configurable (1-100, default 10) via Settings → Brainstorm; replaces the hardcoded 10-entry cap.
- Brainstorm export — JSON download filename now includes timestamp + timezone offset (`brainstorm-YYYY-MM-DD-HH-MM-SS±OOOO.json`); avoids same-session overwrites.
- Notifications severity gating — Settings → Notifications card lets operators silence info-tier toasts independently from error-tier toasts.

### Changed (Round 3)

- ConsoleServer decomposition — extracted `QoreRuntimeService` and four route handlers (`QoreRoute`, `FeatureStatusRoute`, `SkillsApiRoute`, `HookRoute`) from `ConsoleServer.ts`. Internal architectural refactor; no user-visible API change.
- Voice controller — multi-subscriber state and analyser fan-out with cache-and-replay on subscribe; late subscribers (badge, modal visualizer) now see current state on attach.

### Security (Round 3)

- HTML escape discipline applied across all settings and overview surfaces that interpolate store-derived or hub-derived values into innerHTML — closes XSS pathways in Voice settings, audio device data attributes, TTS voice picker, ticker bar (Sentinel mode), risk register cells, governance Sentinel card, and Settings Configuration card.
- Allowlist hardening — Whisper model id validated against `ALLOWED_WHISPER_MODELS` (3 entries) at construction and on swap; Piper voice id validated against `ALLOWED_PIPER_VOICES` (20 entries). Closes localStorage-XSS supply-chain pivot to arbitrary HuggingFace / Piper voice fetch.
- Voice substrate hardening — model swap reentry guard, idle/processing analyser cache invalidation, listener fan-out snapshot iteration, modal `onMicButton` wrapper restoration, idempotent destroy.

### Added (Round 2 — Install UX, 2026-05-05)

- Install transparency report (#49): every install action emits a structured `QorLogicInstallReport` with one invocation per phase (`python-probe`, `pip-install`, `qorlogic-install` per host, `provenance`, `refresh`). The Settings card renders the report inline; failed steps stay visible with command + stderr until the next run.
- Host/scope QuickPick (#50): the Settings card "Install QorLogic Skills" button now prompts for hosts (multi-select) and scope (`repo`|`global`) before installing; selections persist to workspace state and pre-check on re-run.
- New command palette entry "FailSafe: Install QorLogic Skills (defaults)" (`failsafe.installQorLogicSkillsDefaults`) — bypasses the QuickPick and installs `[claude, codex]` at `repo` scope.
- "Show Output" button on the Settings install card focuses the FailSafe (QorLogic) output channel via the new `POST /api/actions/show-output` route.

### Changed (Round 2)

- **Internal ABI break**: `ConsoleServer.setScaffoldCallback` parameter type updated to `() => Promise<QorLogicInstallReport | null>` (was `Promise<{scaffolded, skipped, error?}>`).
- Broadcast event `skills.install.progress` payload field renamed `step` → `invocation`. New shape: `phase`, `host`, `scope`, `command`, `interpreter`, `destination`, `installedCount`, `version`, `summary`, `error`, `stderrTail`.
- `createInstallSkillsHandler` signature: `(context: ExtensionContext, ingestor, callbacks?, mode='prompt')`. Mode `'defaults'` bypasses QuickPick.
- `QorLogicSkillIngestor` exposes `probePython`, `ensurePackageInstalled`, `installHost(host, scope)`, `getWorkspaceRoot`, `rescanWorkspace`.

### Added

- `qor-logic` package installer with auto-detected Python interpreter (setting → ms-python → probe).
- `QorLogicSkillIngestor` runs `qorlogic install --host claude --scope repo` and `--host codex` by default; supports `kilo-code` and `gemini` opt-in.
- Synthesized `SOURCE.yml` provenance for ingested skills (qor-logic does not ship per-skill provenance).
- `failsafe.openFailSafeProDownload` command and Settings panel "FailSafe Pro" card linking to <https://mythologiq.studio/products/failsafe-download>.
- `failsafe.bootstrap` and `failsafe.organize` commands (previously unregistered, fell through to misleading "not enabled in current configuration" message). Idempotent silent bootstrap on every activation.
- Always-visible "Install / Refresh QorLogic Skills" + "Bootstrap Workspace" buttons in Settings card.
- New setting `failsafe.qorlogic.pythonPath` for explicit Python override.
- Workspace-truth UI population:
  - `MetaLedgerReader` → Operations Phases stat (was 0/0); Recent Verdicts and Recent Completions strips backfilled from `docs/META_LEDGER.md`.
  - `BacklogReader` → Risks tab populated from `docs/BACKLOG.md` open items when `.failsafe/risks/risks.json` is absent.
  - `PlanFileReader` → `hub.activePlan` falls back to the most-recent `.failsafe/governance/plans/*.md` when PlanManager has none.
  - `SystemStateReader` → `bootstrapState.systemState` exposes version + chain status from `docs/SYSTEM_STATE.md`.
  - `AuditReportReader` → new Latest Audit card on Overview, parsed from `.failsafe/governance/AUDIT_REPORT.md`.
  - `ChangelogReader` → new Recent Releases card on Overview, parsed from `CHANGELOG.md`.
  - Transparency events surfaced in hub (newest-first) from `.failsafe/logs/transparency.jsonl`.
- New docs: `docs/v5/QORLOGIC_SKILL_INGESTION.md`, `docs/v5/PRO_INTEGRATION.md`.

### Changed

- "Install Skills" button label → "Install QorLogic Skills".
- The bundled `dist/extension/skills/` is no longer included in the VSIX.
- Extension `description` revised off the legacy "AI governance platform" framing.
- Skill IDs migrated from `ql-*` to `qor-*` (extension source references and project-local skill directories). `SkillParser` recognizes both prefixes during the v4 → v5 transition.
- Operations Phases stat now reflects META_LEDGER reality (was 0/0 theater); render capped at 10 cards plus a summary row.
- **Phase 1 ConsoleServer decomposition (B164/B165)** — extracted 4 portable, framework-agnostic modules: `WebSocketManager` (28L), `TransparencyLogger` (35L), `RiskRegisterManager` (30L), `EventSubscriptionManager` (185L; 12 EventBus listeners covering governance verdicts, sentinel events, transparency, and run lifecycle). ConsoleServer 1371→1177L (-194L). Foundation for the Phase 2 decomposition delivered in Round 3.
- `CheckpointStore` silent catches replaced with `console.warn` (observability only; behavior unchanged).
- "About FailSafe Pro" command + Settings card link now open the product/learn page <https://mythologiq.studio/products/failsafe-pro>; the download URL is reachable from that page rather than directly from the extension UI (#46).

### Fixed

- `failsafe.openFailSafeProAbout` opens the FailSafe Pro learn page (was: opened the download URL despite being labeled "About") (#46).
- Operations Phases stat normalized: `completed > planned` no longer renders as `4 / 0`; `planned` is floored to `completed` so each completion implies at least one plan (#47).
- Install QorLogic Skills button: progressive step display, button disables while running, hub refresh on completion, Get Started banner re-evaluates without page reload (#48).

### Removed

- v4 bundled-skill copy path (`bootstrapServers.ts` direct `dist/extension/skills` → `.claude/skills` copy). Existing user skills already on disk are not touched.

### Security

- All subprocess invocations use list-form `spawn(cmd, args)`; no shell strings. pip install bounded by 120 s timeout, qorlogic install per host by 180 s timeout.

## [4.9.9] - 2026-03-17

### Fixed

- Install Skills button now works — bundled skills path corrected from nonexistent `skills/` to `dist/extension/skills/` (B189). Also resolves stale global skill terminology leaking into new workspaces.
- Brainstorm Prep Bay (microphone, voice input, topology legend) now visible in the Command Center right panel when Mindmap sub-view is active (B188).
- Right panels for Operations, Transparency, and Skills sub-views are now properly surfaced through TabGroup pill navigation.

## [4.9.8] - 2026-03-17

### Fixed

- Error budget now excludes resolved verdicts — a VETO→PASS cycle no longer inflates the burn gauge to 100% (B187).

### Added

- Clickable blocker count and error budget gauge — click to navigate directly to governance audit in the Command Center (B185).
- SRE Activity Feed: scrollable audit event list with ALLOW/DENY/AUDIT badges, powered by the `agent-failsafe` adapter (B179).
- SRE SLO Dashboard: multi-SLI grid with error budget gauges, replacing the single-SLI card when adapter provides detailed metrics (B180).
- SRE Fleet Health: per-agent cards with status indicators, circuit breaker state badges, task count, and success rate (B180).
- Configurable adapter base URL via `adapterBaseUrl` in adapter config, replacing the hardcoded default (B178).

### Architecture

- Extracted `SentinelMonitor` class from `roadmap.js` (632→486 lines) into `sentinel-monitor.js` (185 lines) — reduces Monitor panel complexity (B186/D33).
- Extracted SRE type definitions to `SreTypes.ts` (60 lines) — v1 + v2 schema with optional backward-compatible fields (B178).

## [4.9.6] - 2026-03-16

### Added

- SRE panel: active policies and enforcement status, agent trust scores, OWASP ASI coverage map, and SLI compliance indicator — powered exclusively by the `agent-failsafe` REST bridge adapter (B167).
- SRE toggle button in the Monitor sidebar — switches between Monitor view and SRE panel view without reloading the sidebar (B168).
- `/api/v1/sre` proxy endpoint in ConsoleServer — relays AGT adapter snapshot data to the SRE panel with local-only access guard (B169).
- `agent-failsafe` REST bridge: `/sre/snapshot` FastAPI endpoint exposing policies, trust scores, SLI, and OWASP ASI coverage (Python `server` optional extra).

### Architecture

- SRE panel data is fully isolated to AGT adapter output — no FailSafe-internal data surfaces in the panel, enabling direct extraction as a standalone AGT VS Code component.

## [4.9.5] - 2026-03-16

### Added

- Agent Run Replay: full execution trace capture with step-by-step replay panel for post-mortem debugging of agent sessions (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization, mitigation suggestions, and adapter from raw sentinel events (B147).
- New command: `FailSafe: Show Run Replay` for accessing recorded agent sessions.
- New types: `GovernanceDecision`, `AgentRun`, `RunStep` with full TypeScript contracts in `shared/types/`.

### Security

- XSS fix: switched onclick handlers from `escapeHtml` to `escapeJsString` for JS string contexts.
- Path traversal fix: workspace folder validation in `handleViewFile`.
- Re-entrancy guard: `AgentRunRecorder` ignores its own `agentRun.*` events.

## [4.9.2] - 2026-03-13

### Added

- META_LEDGER file watcher: Monitor and Command Center now auto-refresh governance state when ledger changes on disk (B140).
- Shared hook sentinel utility: unified `.claude/hooks/disabled` file management for hook toggle across Console and VS Code settings (B107).
- Release pipeline verification tests: COMPONENT_HELP/PROCESS_GUIDE version markers, duplicate B-item detection, branch policy, CI gate ordering (B108/B137/B138/B139).

### Fixed

- GovernancePhaseTracker now recognizes SUBSTANTIATED verdict — Monitor no longer shows stale phase after session seal (B140).
- Recently Completed section in Monitor displays plan name when available instead of raw entry number (B140).
- Hook toggle in Console and VS Code settings now converge on sentinel file as single source of truth (B107).

## [4.9.0] - 2026-03-13

### Added

- Agent Run Replay: full execution trace capture with step-by-step replay panel for post-mortem debugging of agent sessions (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization, mitigation suggestions, and adapter from raw sentinel events (B147).
- New command: `FailSafe: Show Run Replay` for accessing recorded agent sessions.
- New types: `GovernanceDecision`, `AgentRun`, `RunStep` with full TypeScript contracts in `shared/types/`.

### Security

- XSS fix: switched onclick handlers from `escapeHtml` to `escapeJsString` for JS string contexts.
- Path traversal fix: workspace folder validation in `handleViewFile`.
- Re-entrancy guard: `AgentRunRecorder` ignores its own `agentRun.*` events.

## [4.8.0] - 2026-03-13

### Added

- Agent Execution Timeline: step-by-step visualization of agent actions with governance decision overlay (B142).
- Risk & Stability Indicators: real-time agent health status with observe-mode notification and fallback logic (B143).
- Shadow Genome Debugging Panel: interactive browser for failure patterns with filtering and pattern details (B144-B145).
- New commands: `FailSafe: Agent Health Status`, `FailSafe: Agent Execution Timeline`, `FailSafe: Shadow Genome Debugger`.

## [4.7.2] - 2026-03-11

### Fixed

- L3 escalation resilience: Added try/catch blocks around L3 queuing in `L3ApprovalService` and `VerdictRouter` to prevent potential crashes on connection failures.

### Performance

- Concurrent Folder Manifold Calculation: Shifted folder processing from sequential to concurrent using `Promise.all`, showing improved execution time during workspace initialization.

## [4.7.0] - 2026-03-10

Agent Marketplace and Microsoft Agent Governance Toolkit integration. Discover, install, and manage external agent repositories with HITL security gates and automated vulnerability scanning.

### Added

- **Agent Marketplace** — New Skills tab sub-section for discovering and managing external agent repositories. Curated catalog of 11 repositories across Autonomous/Multi-Agent (AutoResearch, AutoGen, TaskWeaver, Browser-Use), Safety/Red-Teaming (PyRIT, Garak, Promptfoo, Agent Audit), and UI/Orchestration (Dify, Vercel AI SDK, Langflow) categories.
- **HITL Security Gates** — Nonce-based approval tokens (5 min TTL) for installation confirmation. Modal shows repo URL, author, permissions, sandbox toggle, and scan options before any install proceeds.
- **Security Scanner Integration** — Garak and Promptfoo CLI integration for automated vulnerability scanning with L1/L2/L3 risk grades. Graceful degradation when scanners not installed with manual review prompts.
- **Trust Tiers** — Four-tier classification (unverified → scanned → approved → quarantined) with persistent state tracking in `~/.failsafe/marketplace/state.json`.
- **Microsoft Agent Governance Toolkit Adapter** — Python package (`agent-failsafe`) bridging FailSafe governance to agent-os, agent-mesh, agent-hypervisor, and agent-sre. REST API at `/api/adapter/*` for status, install, uninstall, health checks, and configuration.
- **Adapter Panel** — Dedicated UI in Marketplace tab for managing toolkit adapter lifecycle with real-time progress via WebSocket.

### Changed

- Skills tab now includes Skills/Marketplace view toggle.
- Connection module handles marketplace and adapter WebSocket events.
- Ledger types extended with `MARKETPLACE_INSTALL` and `MARKETPLACE_UNINSTALL` events.

## [4.6.6] - 2026-03-09

Workspace isolation and repository governance. Multiple VS Code windows can now run FailSafe independently, and external workspaces can be validated against governance standards.

### Added

- **Repository Governance as a Service** — New `RepoGovernanceService` validates target workspaces against `REPO_GOVERNANCE.md` standards: structure (src, tests, docs, .github), root files (README, LICENSE, CONTRIBUTING), GitHub config (issue templates, PR template, workflows), commit discipline (semantic format), and security posture (SECURITY.md, .gitignore, dependency scanning).
- **Compliance scoring with grades** — Automated grading (A-F) based on violations: errors -2 points, warnings -1 point. Thresholds: A (90-100%), B (80-89%), C (70-79%), D (60-69%), F (<60%).
- **Compliance metric in Monitor** — Workspace Health grid displays compliance grade with color-coded indicator, percentage bar, and violation tooltips.
- **S.H.I.E.L.D. phase tracker** — `GovernancePhaseTracker` parses META_LEDGER.md to detect current governance phase, recent completions, and context-aware next steps.
- **Multi-workspace server registry** — `ServerRegistry` tracks active FailSafe instances across VS Code windows with atomic writes and stale PID cleanup.
- **Workspace selector in Command Center** — Disconnection banner with dropdown to switch between active workspaces when server connection is lost.
- **Dynamic port propagation** — Sidebar and commands use actual server port instead of hardcoded 9376.

### Changed

- Hub snapshot now includes `workspaceName`, `workspacePath`, `serverPort`, and `repoCompliance` data.
- Command Center connection module supports `switchServer(port)` for workspace switching.

## [4.6.5] - 2026-03-10

Cross-agent skill consolidation. All SHIELD governance skills migrated to modern SDK conventions with automated transpilation support across Claude, Codex, Gemini, Copilot, and Cursor.

### Changed

- **Skills migrated to SKILL.md format** — 17 SHIELD skills + 3 personas now use `.claude/skills/qor-*/SKILL.md` with YAML frontmatter.
- **Agents separated** — 7 agent definitions moved to `.claude/agents/qor-*.md`. Claude Code loads these natively.
- **ModelAdapter output dirs corrected** — Claude (`.claude/skills/`), Codex (`.agents/skills/`), Gemini (`.gemini/skills/`), Copilot (`.github/skills/`), Cursor (`.cursor/rules/`).
- **getOutputPath simplified** — Directory-based `{name}/SKILL.md` is default; only Cursor uses flat files.
- **VSIX bundling de-complected** — Agents removed from bundle patterns. Directory-based skill bundling added for `skills/qor-*/SKILL.md`.
- **Scaffolding updated** — WorkspaceMigration targets `.claude/skills/` with parent directory name extraction.
- **Antigravity restructured** — Genesis/Qorelogic → `skills/qor-*/SKILL.md` + `agents/`.
- **Stale duplicates removed** — `FailSafe/Claude/` (20 files) deleted; 12 quarantined skills cleaned up.
- **`AGENTS.md` created** — Cross-agent root instruction file for Codex/Copilot/Cursor/Windsurf compatibility.

## [4.6.4] - 2026-03-09

Governance state integrity remediation. Trust data that was previously transient or fabricated is now persisted, verified, and kept in sync.

### Fixed

- **Trust state was transient** — Agent trust scores, quarantine status, and verification counts lived only in an init-time cache with no path back to the database after startup. All trust state is now event-driven: mutations persist to SQLite immediately and the cache rebuilds from DB on every trust update, quarantine, or release event.
- **Trust timestamps were fabricated** — `getTrustScore()` generated `new Date().toISOString()` at call time instead of returning the actual DB `updated_at`. Added `updatedAt` to `AgentIdentity` and mapped from the persisted column, so audit trails now reflect real mutation times.
- **Checkpoint chain validity was assumed** — `cachedChainValid` defaulted to `true` on startup without verification. Chain integrity is now verified against the database during initialization; failures set `false` and clear the timestamp.
- **Command Center version was hardcoded** — Hub snapshot reported `4.4.0` regardless of actual version. Now reads from `package.json` at module load.

### Added

- **Optimistic locking for trust persistence** — Concurrent agent trust writes use version-based concurrency control with `OptimisticLockError` detection and exponential backoff retry, preventing silent data loss from race conditions.
- **Three trust event types** — `qorelogic.trustUpdated`, `qorelogic.agentQuarantined`, `qorelogic.agentReleased` added to EventBus for cache invalidation and downstream consumers.

### Changed

- **TrustEngine Section 4 compliance** — Split 449-line monolith into three files: `TrustEngine.ts` (223L orchestration), `TrustPersistence.ts` (167L DB ops + optimistic locking), `TrustCalculator.ts` (40L pure computation).

## [4.6.3] - 2026-03-08

Incremental hotfix addressing Monitor and Command Center data parity issues discovered after v4.6.0's decomposition. Additional UI refinements and follow-up hardening are forthcoming.

### Fixed

- **Monitor sidebar now tracks active builds and debug sessions** — Added IDE lifecycle event forwarding (`bootstrapIdeActivity`) and `IdeActivityTracker` service. Build tasks and debug sessions surface in real-time as the active phase.
- **"Recently Completed" no longer stuck on "None Yet"** — Falls through to checkpoint history (`recentCompletions`) when no plan milestones or phases are available.
- **L3 approval queue auto-prunes expired items** — `pruneExpired()` enforces SLA deadlines on every queue read, eliminating unbounded growth of stale approval requests.
- **Command Center now reflects Sentinel critical alerts** — Hub snapshot includes `riskSummary` (high/medium/low threat counts). Overview tab renders verdict alert banner for BLOCK/ESCALATE/QUARANTINE. Operations tab mission strip turns red on critical verdicts.
- **Console Server assets now load** — `express.static` middleware was also missing `dotfiles: "allow"`, causing all CSS, JS, images, and vendor files to silently 404 even after v4.6.2's `sendFile` fix.
- **XSS hardening** — All innerHTML interpolations in Command Center overview sanitized via `esc()` helper.

## [4.6.2] - 2026-03-08

### Fixed

- **Console Server inaccessible** — Express `sendFile()` silently returned 404 when the extension install path contained a dotfile directory (`.vscode/`, `.antigravity/`). Added `{ dotfiles: "allow" }` to all `sendFile` calls. This was a latent bug affecting all versions since the Console Server was introduced.

## [4.6.1] - 2026-03-08

### Fixed

- **Missing sidebar icon** — Activity bar SVG icon (`failsafe-icon.svg`) was referenced in package.json but never created; sidebar showed blank icon in VS Code and Antigravity.
- **Release Pipeline branch policy** — Tag-based CI runs (detached HEAD from `v*` tag checkout) no longer fail branch naming validation.
- **Icon validation gate** — `validate-vsix.cjs` preflight now checks all icon references in package.json resolve to real files, preventing this class of bug in future releases.

## [4.6.0] - 2026-03-08

### Added

- **Section 4 Razor Decomposition** - ConsoleServer.ts decomposed from 3265L to 1124L with 5 extracted route modules and 7 service modules. stt-engine.js decomposed from 400L to 249L with 4 extracted modules. EnforcementEngine.ts decomposed from 250L to 122L with 4 enforcement evaluators.
- **Skill Discovery & Registry Services** - SkillParser, SkillFrontmatter, SkillRegistry, SkillDiscovery, and SkillRanker extracted as independent service modules from ConsoleServer.
- **Checkpoint Persistence** - CheckpointStore and CheckpointUtils extracted with hash-chain verification and SQLite persistence.
- **Hook Toggle UI** - Console Settings panel now shows governance hook status with enable/disable toggles (B107).
- **Release Gate Enhancements** - Backlog duplicate detection, version summary checks, and COMPONENT_HELP/PROCESS_GUIDE version validation (B108, B138, B139).

### Fixed

- **Brainstorm canvas graph mutations** - rAF batching prevents forced reflows during rapid node updates (B119).
- **Prep Bay TTS error handling** - Error messages now surface `err.message` instead of `[object Object]` (B120).
- **Heuristic extractor node taxonomy** - Nodes now carry typed categories: Idea, Decision, Task, Constraint (B125).
- **Prep Bay modal waveform** - Waveform visualizer renders via `onAnalyser` callback in modal context (B129).
- **Brainstorm server-side truncation** - BrainstormService logs truncation events for debugging (B132).
- **Socket.dev compliance** - Replaced deprecated `document.execCommand('copy')` with Clipboard API. Added post-build sanitization for `new Function` patterns from transitive dependencies (ajv, depd) and vendor libraries.
- **Test type errors** - Fixed TS2345 in AssistModeEvaluator and ObserveModeEvaluator test mocks.

### Changed

- **Governance doc storage** - All generated governance artifacts now stored in `.failsafe/governance/` (gitignored) instead of `.agent/staging/`. `/qor-organize` Phase 6 added for location compliance.
- **Circular dependency fix** - SkillRegistry ↔ SkillDiscovery re-export cycle eliminated via direct imports.

### Documentation

- Updated `docs/COMPONENT_HELP.md` and `docs/PROCESS_GUIDE.md` to reflect `v4.6.0`.

## [4.5.1] - 2026-03-07

### Fixed

- **Activation crash in Antigravity**: `LedgerQueryAPI` construction now guards against unavailable ledger database, preventing `Ledger DB not initialized` error on extension activation.
- **CI validator parameter mismatch**: `validate.ps1` now passes `-Version` (not `-RepoRoot`) to `validate-release-version.ps1`.

## [4.5.0] - 2026-03-07

### Added

- **Skill Discovery Tags** - Skills now carry normalized tags and source credit metadata. Console skill-scan extracts tags from frontmatter, filenames, and categories.
- **Tag-Based Skill Filter** - Skills panel replaces category chips with a type-ahead tag filter with autocomplete suggestions and clear control.
- **Governance Skill Cohesion** - All 19 QoreLogic skills now carry explicit next-step routing. Canonical skill routing table and proactive suggestion signals established.
- **/qor-document Skill** - New documentation authoring skill with RELEASE_METADATA mode for automated release notes and GENERAL mode for standalone technical writing. Integrated into `/qor-repo-release` Step 5.

### Changed

- **Brainstorm Module Cleanup** - Optional chaining replaces null guards; status messages consolidated into a lookup map; audio device handler uses named reference for cleanup.
- **STT Engine Refinements** - Improved silence timer handling and mic device switching in speech-to-text pipeline.
- **Ideation Buffer & Prep Bay** - Tightened buffer merge logic and prep bay staging flow for mindmap ideation.
- **CI Workflow Consolidation** - VSIX proprietary guardrails workflow now builds from single extension source and scans packaged VSIX for prohibited content patterns.

### Documentation

- Updated `docs/COMPONENT_HELP.md` and `docs/PROCESS_GUIDE.md` to reflect `v4.5.0`.


## [4.4.1] - 2026-03-06

### Changed

- **Activation Surface Hardening** - Replaced startup-wide activation with explicit command/view/chat activation events to reduce runtime exposure.
- **Socket Policy Enforcement** - Updated tracked Socket policy manifests to explicitly ignore accepted capability classes used by design.
- **Docs Badge Consistency** - Aligned Socket badge references across workspace documentation to `4.4.1`.
## [4.4.0] - 2026-03-06

### Added

- **Mindmap Runtime Modules** - Added ideation/runtime modules for extraction heuristics, node editing, prep bay flow, haptics support, voice settings, and local model status orchestration.
- **Audio Vault Service** - Added `AudioVaultService` for local audio artifact lifecycle support in roadmap ideation flows.
- **Mindmap Asset Pack** - Added dedicated UI assets for overview, operations, audit, risks, skills, laws, mindmap, and config surfaces.

### Changed

- **Version Synchronization** - Extension metadata, runtime version surfacing, packaged README/help docs, and validation scripts now align on `v4.4.0`.
- **Mindmap Labeling** - Command Center navigation now labels the ideation tab as `Mindmap` while retaining internal `brainstorm` routing IDs.

### Documentation

- Updated `README.md`, `docs/COMPONENT_HELP.md`, and `docs/PROCESS_GUIDE.md` to reflect current `v4.4.0` terminology and shipped capability scope.

## [4.3.2] - 2026-03-04

### Changed

- **Performance & Polish** - Checkpoint integrity verification moved to cached + on-demand flows with explicit `Verify Integrity` actions in Console UI surfaces.
- **Server Activation Robustness** - API and Console server startup now resolves available ports dynamically with graceful fallback behavior when preferred ports are occupied.
- **Webview Update Path** - Transparency and Economics panels now use message-driven updates after initial render to reduce full-HTML redraw churn.
- **Bundled Help Rewrite** - `docs/COMPONENT_HELP.md` and `docs/PROCESS_GUIDE.md` rewritten for unified Console UX and `v4.3.2` operator workflows.

### Documentation

- Clarified Brainstorm status: voice + manual workflows are shipped in `v4.3.2`, with vendor runtime prerequisites documented in `vendor/*/VENDOR.md`.

## [4.3.1] - 2026-03-03

### Fixed

- **SQL Injection Protection** — `SchemaVersionManager.hasColumn()` now validates table names against a strict whitelist before PRAGMA queries.
- **XSS Prevention** — `LivingGraphTemplate` tooltip and `RevertTemplate` result rendering now HTML-escape all dynamic values.
- **README Logo** — Corrected logo path to reference current FailSafe branding.

## [4.3.0] - 2026-03-02

### Added

- **Pre-Commit Guard** - `failsafe.installCommitHook` and `failsafe.removeCommitHook` install or remove an authenticated thin-client git hook that queries `GET /api/v1/governance/commit-check`.
- **Provenance Tracking** - FailSafe records AI authorship attribution as `PROVENANCE_RECORDED` SOA ledger events and exposes history through `GET /api/v1/governance/provenance/:artifactPath`.
- **CI Governance Context Export** - Release automation now exports public governance context with `tools/export-governance-context.sh` and uploads it as a non-blocking workflow artifact.
- **Bundled Operator Docs** - The packaged VSIX now includes component-level and process-level help guides for installed users.

### Changed

- Marketplace README, changelog, and package metadata now align on shipped `v4.3.0` behavior.
- `showGenesisHelp()` and inline component help text now use the current command set and clearer operator language.

### Fixed

- `v4.3.0` quality sweep remediation sealed: IPv6 private-range coverage in `GovernanceWebhook`, dead-code removal in `capabilities.ts`, and Razor compliance restoration in `SentinelRagStore.ts`.

## [4.2.1] - 2026-02-28

### Changed

- Marketplace README and package metadata corrected so published artifacts reflect the intended release content.

### Documentation

- Added the Build "42" release note to the v4.2.1 release notes.
- Added packaged-artifact inspection to the public release process and `/qor-repo-release`.

## [4.2.0] - 2026-02-27

> _"The Answer to the Ultimate Question of Life, the Universe, and Everything."_

### Added

- **Multi-Agent Governance Fabric** — Runtime detection and governance injection for Claude CLI, Copilot, Codex CLI, and Agent Teams via `SystemRegistry` terminal-based detection and `FrameworkSync` per-agent config injection.
- **Governance Ceremony** (`failsafe.onboardAgent`) — Single-command opt-in/opt-out to inject or remove governance files across all detected AI agents, with transparent diff preview.
- **First-Run Onboarding** — Surfaces multi-agent governance coverage options during initial setup with workspace vs global scope guidance.
- **Agent Coverage Dashboard** — Console route (`/console/agents`) showing detected agents, injection status, and compliance state.
- **Undo Last Attempt** (`failsafe.undoLastAttempt`) — Checkpoint-based rollback with integrity verification and user feedback.
- **Discovery Phase Governance** — DRAFT → CONCEIVED status gate with `DiscoveryGovernor` and ledger-tagged graduation markers.
- **Terminal Correlator** — Maps VS Code terminals to agent systems via name pattern matching for cross-agent audit correlation.
- **Workflow Run Model** — `WorkflowRunManager` with run/stage/gate/claim/evidence contracts aligned to governance lifecycle.
- **Agent Teams Detector** — Generates `.claude/agents/failsafe-governance.md` governance overseer peer agent.
- **AGENTS.md Injection** — Writes repo-root `AGENTS.md` with FailSafe governance rules consumed by Copilot and Codex.
- **Intent Schema v2** — `schemaVersion` field, `agentIdentity` metadata, and `planId` reference on Intent creation with migration from v1.
- **Verdict Replay Batch** — `replayBatch()` method for bulk verdict replay with timing-safe hash comparison.
- **CheckpointManager** — Bridges QoreLogic ledger and Sentinel substrates for checkpoint metrics.

### Changed

- `SystemRegistry` extended to 11 fields with 3 detection methods and 3 exported types.
- `FrameworkSync` now accepts optional `SystemRegistry` for per-agent config delegation.
- `RoadmapServer` gains `setSystemRegistry()` deferred setter (following `setConsoleDeps()` pattern).
- `QoreLogicSubstrate` interface extended with `systemRegistry: SystemRegistry` field.
- `VerdictReplayEngine` upgraded with timing-safe hash comparison and batch replay.
- Event types expanded with `DISCOVERY_RECORDED` and `DISCOVERY_PROMOTED`.

## [4.1.0] - 2026-02-27

### Added

- **Gap 1: Mode-Change Audit Trail** — All `governance.mode` configuration changes now recorded to SOA ledger with `USER_OVERRIDE` event type, including `previousMode` and `newMode` payload.
- **Gap 2: Break-Glass Protocol** — Time-limited governance overrides with:
  - `failsafe.breakGlass` command for emergency activation (10+ char justification required)
  - `failsafe.revokeBreakGlass` command for manual revocation
  - Configurable duration (1–480 minutes)
  - Auto-revert on expiry
  - Full audit trail in ledger (`break_glass.activated`, `break_glass.revoked`, `break_glass.expired`)
  - Event bus emissions for UI integration
- **Gap 3: Artifact Hash on Write** — SHA-256 hash of file content at save-time recorded in ledger for independent verification.
- **Gap 4: Verdict Replay Harness** — `failsafe.replayVerdict` command reconstructs inputs and re-executes past governance decisions for audit verification, with policy hash and artifact hash comparison.

### Changed

- Ledger payload now includes `policyHash` for replay fidelity.
- `LedgerManager.getEntryById()` added for verdict replay lookups.
- `PolicyEngine.getPolicyHash()` added for policy version tracking.

## [4.0.0] - 2026-02-27

### Added

- **Token Economics Dashboard** (`failsafe.showEconomics`): Real-time visibility into prompt token usage, RAG savings, and cost-per-action metrics.
- **Economics Service Layer** (`src/economics/`): Pure TypeScript module with zero VS Code dependencies — `CostCalculator`, `EconomicsPersistence`, `TokenAggregatorService`.
- **EventBus-Driven Telemetry**: Automatic tracking of `prompt.dispatch` and `prompt.response` events for token aggregation.
- **Economics Webview Panel** (`EconomicsPanel`, `EconomicsTemplate`): Interactive dashboard with hero metrics, donut chart (context sync ratio), and daily bar chart.
- **Governance Mode System**: Three modes — Observe, Assist, Enforce — selectable via `failsafe.governance.mode` setting or `FailSafe: Set Governance Mode` command.
- **Risk Register Panel**: Dedicated webview for tracking and managing project risks.
- **Transparency Stream Panel**: Real-time governance event stream in the sidebar.
- **Chat Participant**: `@failsafe` chat commands for intent, audit, trust, status, and seal operations.
- **220 Passing Tests**: Full test coverage for economics service layer (CostCalculator, EconomicsPersistence, TokenAggregatorService).

### Changed

- **UI Terminology**: "Operations Hub" renamed to "Command Center" across all surfaces.
- **Command Updates**: Hub commands now reference "Command Center" (`failsafe.openPlannerHub`, `failsafe.openPlannerHubEditor`).
- **API-First Service Isolation**: Economics module designed with zero vscode imports for future Tauri/Rust extraction readiness.

## [3.6.0] - 2026-02-17

### Changed

- **Marketplace Categories** - Updated from `["Other", "Linters", "Visualization"]` to `["Machine Learning", "Testing", "Visualization"]` for better discoverability in the VS Code Marketplace.
- **Keywords Expanded** - Added 8 new keywords: `ai safety`, `agent governance`, `code audit`, `risk management`, `compliance`, `deterministic governance`, `intent management`, `checkpoint`.
- **Documentation** - Added marketplace category badges to README files for transparency.

## [3.5.6] - 2026-02-12

### Changed

- Release metadata/version bump to 3.5.6 to start the Command Center UI overhaul sprint.

## [3.5.2] - 2026-02-11

### Fixed

- Marketplace sidebar screenshot now renders from packaged extension assets (`media/sidebar-ui-3.5.2.png`) instead of repo-relative documentation paths.

### Changed

- Release metadata/version bump to 3.5.2 across extension and distribution manifests.

## [3.5.1] - 2026-02-11

### Added

- Skills panel now includes an `All Installed` lane so phase relevance no longer hides available skills.
- Streamlined sidebar UI screenshot asset added for release documentation (`FailSafe/docs/images/sidebar-ui-3.5.1.png`).

### Changed

- Release metadata/version bump to 3.5.1 across extension manifests and README surfaces.
- Skill source tags now reflect location labels and first-party patterning (`Qore Workspace` for MythologIQ-owned skills).
- FailSafe skill discovery now uses deterministic extension-anchored roots to avoid false "No skills installed" states.
- First-party skill naming standardized to `qore-*` convention and aligned across `FailSafe/VSCode/skills` and `.agent/skills`.

## [3.5.0] - 2026-02-11

### Added

- UI-02 compact sidebar shell for the Operations Hub with FailSafe branding, favicon support, and standardized legal footer.
- Extended popout hub workflow coverage validated by Playwright smoke test (`Home`, `Run`, `Skills`, `Reports` baseline checks).
- Skill provenance ingestion via `SOURCE.yml` (creator/source repo/source path/source type/source priority/admission state).
- Phase-aware skill relevance APIs (`/api/skills`, `/api/skills/relevance`).
- SQLite-backed checkpoint ledger table (`failsafe_checkpoints`) with chain verification and summary APIs.

### Changed

- Compact sidebar feature counters now track `Recently Completed`, `Backlog`, `Wishlist`, and `Critical Features`.
- Operations Hub open action routes to external popout context from webpanel and command flows.
- VS Code Electron rebuild script now resolves nested archive layouts under `.vscode-test` to keep native module rebuilds deterministic during test runs.

### Documentation

- Added release documentation subtask pack for README/CHANGELOG integration with claim-to-source mapping (`FailSafe/extension/RELEASE_DOCS_SUBTASK.md`).
- Updated extension README command and quick-start sections to match currently contributed Operations Hub command surfaces.

### Validation

- End-to-end UI suite executed via `npm run test:ui` (Playwright).
- Build verification executed via `npm run compile`.
- Full extension quality gate executed via `npm run test:all` (lint + extension tests + Playwright UI tests).

## [3.0.1] - 2026-02-06

### Added

- New `/qor-repo-release` workflow for automated release discipline.
- `SentinelViewProvider` registration for consistent sidebar monitoring.
- Bootstrap modules (`bootstrapCore`, `bootstrapGovernance`, etc.) for clean extension lifecycle.

### Fixed

- Perpetual loading issue in Sentinel sidebar by registering missing provider.
- TypeScript errors in `PlanningHubPanel` and `CheckpointReconciler` by hardening event types.

### Changed

- **Architectural Refactor**: Decomposed `main.ts` from 761 lines to ~120 lines (Section 4 Simplicity Razor compliance).
- Flattened `DashboardPanel` constructor to improve readability and maintainability.

## [2.0.1] - 2026-02-05

### Added

- Webview template modules for Cortex Stream, Dojo, Dashboard, and Living Graph (Razor compliance).
- Shared tooltip helper with data-tooltip rendering across Genesis views.

### Fixed

- Cortex Stream search overlay text removed to eliminate redundant labels.
- Tooltips now display for advanced governance terminology and calculated metrics.

### Changed

- Documentation refreshed for the 2.0.1 release.

## [1.3.0] - 2026-02-05

### Added

- **Plan Navigation**: DojoViewProvider now links to Roadmap view
- **Governance Integration**: GovernanceRouter plan events for phase tracking
- **PlanManager Wiring**: Complete integration in main.ts activation

## [1.2.2] - 2026-02-05

### Fixed

- **Architecture Config**: Added `architecture.contributors` and `architecture.maxComplexity` config properties
- **Root Cleanup**: Removed orphan `tsconfig.json` from workspace root
- **Complexity Calculation**: Verified `calculateComplexity` exists in ArchitectureEngine

## [1.2.1] - 2026-02-05

### Added

- **BACKLOG.md Integration**: Unified source of truth for blockers, backlog, and wishlist items
- **7 Command Integrations**: Step hooks for ql-status, ql-bootstrap, ql-audit, ql-implement, ql-substantiate, ql-plan, ql-refactor

## [1.2.0] - 2026-02-05

### Added

- **UI Clarity Enhancements** (Navigator)
  - Improved section and metric spacing in DojoViewProvider
  - 6 info hints with tooltips for governance concepts
  - 6 filter tooltips in CortexStreamProvider
  - Collapsible Quick Start Guide with toggleGuide handler
- **New Shared Components**
  - `shared/styles/common.ts` - Reusable CSS styles
  - `shared/components/InfoHint.ts` - Tooltip component
  - `shared/content/quickstart.ts` - Guide content

## [1.1.1] - 2026-02-05

### Added

- **VSCode Chat Participant**: FailSafeChatParticipant.ts (239 lines)
  - Slash commands for governance queries
  - Trust stage helper method
- **Chat Integration**: package.json chat participant registration

## [1.1.0] - 2026-02-05

### Added

- **Event-Sourced Plan Management** (Pathfinder)
  - PlanManager.ts with event sourcing and YAML persistence
  - RoadmapViewProvider.ts with SVG-based visualization
  - Plan data model (types.ts, events.ts, validation.ts)
- **Three View Modes**: Roadmap, Kanban, Timeline
- **30 Test Cases**: Full PlanManager test coverage
- **GovernanceRouter Integration**: findPhaseForArtifact, setPlanManager methods

## [1.0.7] - 2026-02-05

### Fixed

- Excluded test files from extension package to reduce bundle size.
- Node.js version compatibility improvements.

## [1.0.6] - 2026-02-04

### Fixed

- Extension icon moved to root to improve marketplace display.

## [1.0.5] - 2026-02-04

### Changed

- Marketplace README wording updated for accuracy.

## [1.0.4] - 2026-02-04

### Fixed

- Marketplace icon now uses the packaged extension icon.

## [1.0.0] - 2026-02-04

### Added

- **Sentinel Daemon**: Real-time file monitoring with heuristic pattern analysis
- **Trust Engine**: Lewicki-Bunker progressive trust model (CBT → KBT → IBT stages)
- **SOA Ledger**: Merkle-chained audit trail with SQLite persistence
- **L3 Escalation**: Human-in-the-loop approval queue for security-critical paths
- **Dashboard Panel**: Main governance overview with real-time metrics
- **Living Graph**: Visual dependency and trust relationship explorer
- **Cortex Stream**: NLP command interface for governance queries
- **Enforcement Engine**: Three Prime Axioms for action validation
- **Shadow Genome**: Failure pattern archival for continuous learning
- **QoreLogic Integration**: Multi-agent framework synchronization

### Security

- Path traversal prevention with symlink resolution
- SSRF protection for LLM endpoint validation
- ReDoS protection for custom pattern definitions
- TOCTOU race condition mitigations
- Content size limits to prevent DoS

### Configuration

- Heuristic, LLM-assisted, and hybrid analysis modes
- Configurable Ollama endpoint and model selection
- Adjustable L3 SLA thresholds
- Strict mode for zero-tolerance governance
