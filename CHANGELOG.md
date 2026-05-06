# Changelog

All notable changes to FailSafe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- New command palette entry "FailSafe: Install QorLogic Skills (defaults)" (`failsafe.installQorLogicSkillsDefaults`) — bypasses the QuickPick and installs `[claude, codex]` at `repo` scope, intended for automation and the command palette quick path.
- "Show Output" button on the Settings install card focuses the FailSafe (QorLogic) output channel via the new `POST /api/actions/show-output` route.

### Changed (Round 2)

- **Internal ABI break**: `ConsoleServer.setScaffoldCallback` now expects `() => Promise<QorLogicInstallReport | null>` (was `Promise<{scaffolded, skipped, error?}>`). The single source-of-truth report type lives in `installSkillsReport.ts`.
- Broadcast event `skills.install.progress` payload field renamed `step` → `invocation`. The new shape carries `phase`, `host`, `scope`, `command`, `interpreter`, `destination`, `installedCount`, `version`, `summary`, `error`, `stderrTail`.
- `createInstallSkillsHandler` signature: `(context: ExtensionContext, ingestor, callbacks?, mode='prompt')`. Mode `'defaults'` bypasses the QuickPick.
- `QorLogicSkillIngestor` exposes `probePython`, `ensurePackageInstalled`, `installHost(host, scope)`, `getWorkspaceRoot`, `rescanWorkspace` for orchestrator-driven granular installs.

### Added

- `qor-logic` package installer with auto-detected Python interpreter (setting → ms-python → probe).
- `QorLogicSkillIngestor` runs `qorlogic install --host claude --scope repo` and `--host codex` by default; supports `kilo-code` and `gemini` opt-in.
- Synthesized `SOURCE.yml` provenance for ingested skills.
- `failsafe.openFailSafeProDownload`, `failsafe.bootstrap`, and `failsafe.organize` commands.
- Always-visible "Install / Refresh QorLogic Skills" + "Bootstrap Workspace" buttons in the Command Center Settings tab.
- Setting `failsafe.qorlogic.pythonPath` for explicit Python override.
- Workspace-truth UI: META_LEDGER backfills Operations Phases / Recent Verdicts / Recent Completions; BACKLOG populates Risks tab; new Latest Audit + Recent Releases cards on Overview.
- New docs: `FailSafe/extension/docs/v5/QORLOGIC_SKILL_INGESTION.md`, `FailSafe/extension/docs/v5/PRO_INTEGRATION.md`.

### Changed

- "Install Skills" button label → "Install QorLogic Skills".
- The bundled `dist/extension/skills/` is no longer included in the VSIX.
- Extension `description` revised off the legacy "AI governance platform" framing.
- Skill IDs migrated from `ql-*` to `qor-*` across source and project-local skill directories.
- Operations Phases stat now reflects META_LEDGER reality (was 0/0); render capped at 10 cards plus a summary row.
- **Phase 1 ConsoleServer decomposition (B164/B165)** — extracted 4 portable, framework-agnostic modules: `WebSocketManager` (28L), `TransparencyLogger` (35L), `RiskRegisterManager` (30L), `EventSubscriptionManager` (185L; 12 EventBus listeners covering governance verdicts, sentinel events, transparency, and run lifecycle). ConsoleServer 1371→1177L (-194L). Foundation for the Phase 2 decomposition delivered in Round 3.
- "About FailSafe Pro" command + Settings card open the product/learn page <https://mythologiq.studio/products/failsafe-pro> (was: opened the download URL despite being labeled "About") (#46).

### Fixed

- Operations Phases stat: `completed > planned` no longer renders as `4 / 0`; `planned` floored to `completed` so each completion implies at least one plan (#47).
- Install QorLogic Skills: progressive step display, button disables while running, hub refresh on completion (#48).

### Removed

- v4 bundled-skill copy path (`bootstrapServers.ts` direct `dist/extension/skills` → `.claude/skills` copy). Existing user skills already on disk are not touched.

### Security

- All subprocess invocations use list-form `spawn(cmd, args)`; no shell strings. pip install bounded by 120 s timeout, qorlogic install per host by 180 s timeout.

## [4.9.9] - 2026-03-17

### Fixed

- Install Skills button works — bundled skills path corrected (B189).
- Brainstorm Prep Bay visible in Command Center right panel (B188).
- TabGroup sub-view right panels surfaced for all 3 tab groups.

## [4.9.8] - 2026-03-17

### Fixed

- Error budget excludes resolved verdicts — VETO→PASS cycles no longer inflate burn gauge (B187).

### Added

- Clickable blocker/error budget navigation to Command Center audit log (B185).
- SRE Activity Feed with ALLOW/DENY/AUDIT badges (B179).
- SRE SLO Dashboard with multi-SLI grid and error budget gauges (B180).
- SRE Fleet Health with per-agent status, circuit breaker state, and success rate (B180).
- Configurable adapter base URL replacing hardcoded default (B178).

### Architecture

- Sentinel rendering extracted to `sentinel-monitor.js` (roadmap.js 632→486L) (B186/D33).
- SRE types extracted to `SreTypes.ts` with v2 schema (B178).

## [4.9.6] - 2026-03-16

### Added

- SRE panel: active policies, agent trust scores, OWASP ASI coverage, and SLI compliance indicator via `agent-failsafe` REST bridge (B167-B169).
- SRE toggle in Monitor sidebar for switching between Monitor and SRE views (B168).
- `agent-failsafe` Python package gains `server` optional extra with FastAPI `/sre/snapshot` endpoint.

## [4.9.5] - 2026-03-16

### Added

- Agent Run Replay: execution trace capture and step-by-step replay panel for agent session debugging (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization and sentinel event adapter (B147).
- Marketplace README repositioned as "AI Coding Safety" category.

### Security

- 3 XSS/path-traversal/re-entrancy fixes in replay panel and run recorder.

## [4.9.2] - 2026-03-13

### Added

- META_LEDGER file watcher for auto-refresh of governance state in Monitor (B140).
- Shared hook sentinel utility for unified hook toggle management (B107).
- Release pipeline verification test coverage (B108/B137/B138/B139).

### Fixed

- GovernancePhaseTracker recognizes SUBSTANTIATED verdict correctly (B140).
- Hook toggle convergence between Console and VS Code settings (B107).

## [4.9.0] - 2026-03-13

### Added

- Agent Run Replay: execution trace capture and step-by-step replay panel for agent session debugging (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization and sentinel event adapter (B147).
- Marketplace README repositioned as "AI Coding Safety" category.

### Security

- 3 XSS/path-traversal/re-entrancy fixes in replay panel and run recorder.

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

### Added

- Agent Marketplace: curated catalog of 11 external agent repositories with HITL security gates.
- Security Scanner integration: Garak/Promptfoo CLI for vulnerability scanning with risk grades.
- Microsoft Agent Governance Toolkit Adapter: Python bridge to agent-os, agent-mesh, agent-hypervisor, agent-sre.
- Trust tiers for marketplace items: unverified → scanned → approved → quarantined.

### Changed

- Skills tab extended with Marketplace view toggle.
- Connection module handles marketplace/adapter WebSocket events.
- Ledger types include MARKETPLACE_INSTALL and MARKETPLACE_UNINSTALL events.

## [4.6.6] - 2026-03-09

### Added

- Repository Governance as a Service: workspace compliance validation with grading (A-F) and remediation guidance.
- Multi-workspace server registry for independent FailSafe instances across VS Code windows.
- Compliance metric in Monitor UI with grade display and violation tooltips.
- S.H.I.E.L.D. phase tracker parsing META_LEDGER.md for governance state awareness.
- Workspace selector in Command Center for switching between active instances.

### Changed

- Hub snapshot enriched with workspace identity and compliance data.
- Dynamic port propagation replaces hardcoded 9376.

## [4.6.5] - 2026-03-10

### Changed

- Cross-agent skill consolidation: 200+ files across 7 locations → canonical `.claude/skills/` + `.claude/agents/` + automated transpilation.
- Skills migrated from flat `.claude/commands/ql-*.md` to directory-based `.claude/skills/ql-*/SKILL.md` with YAML frontmatter.
- Agent definitions separated to `.claude/agents/ql-*.md` with subagent frontmatter.
- ModelAdapter output directories corrected for Claude, Codex, Gemini, Copilot, and Cursor.
- VSIX bundling de-complected: agents removed from skill pipeline, directory-based patterns added.
- Antigravity restructured from Genesis/Qorelogic to skills/agents layout.
- `FailSafe/Claude/` (20 stale duplicate files) deleted.
- 12 quarantined skills cleaned up (9 superseded removed, 3 archived).
- `AGENTS.md` created at repo root for cross-agent compatibility.

## [4.6.4] - 2026-03-09

### Fixed

- Trust state was transient: event-driven invalidation via EventBus replaces stale init-only cache. Mutations persist to SQLite and cache rebuilds from DB on trust updates, quarantines, and releases.
- Trust timestamps fabricated: `getTrustScore()` now returns DB `updated_at` instead of `new Date()`. Audit trails reflect real mutation times.
- Checkpoint chain validity assumed on startup: now auto-verified during initialization; failures recorded.
- Command Center version hardcoded to 4.4.0: now reads from package.json.

### Added

- Trust persistence with optimistic locking, version-based concurrency control, and exponential backoff retry for concurrent agent trust updates.
- Three trust event types (`trustUpdated`, `agentQuarantined`, `agentReleased`) for EventBus cache invalidation.

### Changed

- TrustEngine decomposed: 449L → 3 files (223L + 167L + 40L) for Section 4 compliance.

## [4.6.3] - 2026-03-08

Incremental hotfix for Monitor & Command Center parity. Further refinements forthcoming.

### Fixed

- Console Server `express.static` missing `dotfiles: "allow"` — all CSS/JS/image assets silently 404'd under dotfile install paths.
- Monitor sidebar: active build/debug session tracking via IDE lifecycle events.
- "Recently Completed" falls through to checkpoint history when plan data is empty.
- L3 approval queue auto-prunes expired items on read (SLA enforcement).
- Command Center: verdict alert banner, live network activity, verdict-aware mission strip.
- XSS hardening on Command Center overview innerHTML interpolations.

## [4.6.2] - 2026-03-08

### Fixed

- Console Server 404 on dotfile install paths (`.vscode/`, `.antigravity/`). Latent bug in Express `sendFile()` dotfile protection.

## [4.6.1] - 2026-03-08

### Fixed

- Missing sidebar SVG icon in activity bar.
- Release Pipeline branch policy validation for tag-based CI.
- Icon reference validation added to release preflight gate.

## [4.6.0] - 2026-03-08

### Changed

- Section 4 Razor decomposition: ConsoleServer 3265L→1124L, stt-engine 400L→249L, EnforcementEngine 250L→122L with 16 extracted modules.
- Voice brainstorm bug fixes: rAF batching, TTS error handling, node taxonomy, waveform visualizer, truncation logging (B119, B120, B125, B129, B132).
- Hook toggle UI and release gate enhancements (B107, B108, B138, B139).
- Socket.dev compliance: deprecated API removal, post-build pattern sanitization.
- Governance doc storage migrated to `.failsafe/governance/`.

## [4.5.1] - 2026-03-07

### Fixed

- Activation crash when ledger database is unavailable
- CI validator parameter mismatch in `validate.ps1`

## [4.5.0] - 2026-03-07

### Changed

- Skill Discovery now carries tags and source credit; Skills panel uses type-ahead tag filter with autocomplete.
- Brainstorm, STT, and ideation modules refined for cleaner runtime behavior.
- CI VSIX guardrails workflow consolidated to single-source build with proprietary content scan.
- Governance skill lifecycle cohesion: 19 skills with next-step routing, canonical routing table, /ql-document authoring skill.

---

## [4.4.1] - 2026-03-06

### Changed

- Extension activation now uses explicit command/view/chat activation events instead of startup-wide activation.
- Socket policy manifests updated to ignore accepted capability classes used by design.
- Socket badge/version markers aligned to `4.4.1` across docs.

---

## [4.4.0] - 2026-03-06

### Changed

- Version synchronization with extension/package release markers and marketplace documentation.
- Mindmap terminology alignment across operator-facing documentation and Command Center navigation.

---

## [4.3.2] - 2026-03-04

> _"Performance & Polish"_

### Changed

- **Checkpoint Integrity Flow** - Full chain verification moved out of heartbeat-critical paths and exposed through explicit verify actions in Console UI.
- **Robust Local Server Startup** - API and roadmap server startup paths now resolve available ports within fallback ranges to reduce activation failures.
- **Message-Driven Webview Refresh** - Transparency and Economics panels now update incrementally via postMessage after initial render.
- **Operator Docs Rewrite** - Bundled extension help documents now align to the unified Console tab model and current command surface.

### Documentation

- Voice-brainstorm docs now reflect shipped voice + manual workflows and document runtime vendor prerequisites.

---

## [4.3.1] - 2026-03-03

> _"Security Hardening"_

### Fixed

- **SQL Injection Protection** — `SchemaVersionManager.hasColumn()` now validates table names against a strict whitelist (`shadow_genome`, `schema_version`, `soa_ledger`) before PRAGMA queries, preventing dynamic table name injection.
- **XSS Prevention in LivingGraphTemplate** — Graph tooltip and stats elements now HTML-escape all dynamic node data (`label`, `type`, `state`, `riskGrade`) before rendering. Stats element switched from `innerHTML` to `textContent` for numeric-only content.
- **XSS Prevention in RevertTemplate** — Revert result display now HTML-escapes step status, name, detail, and error messages before innerHTML assignment.
- **README Logo Path** — Corrected logo reference from root `icon.png` to `FailSafe/extension/icon.png` to display the current FailSafe branding.

---

## [4.3.0] - 2026-03-02

> _"Telemetry Loop"_

### Added

- **Pre-Commit Guard** (`failsafe.installCommitHook`, `failsafe.removeCommitHook`) - Installs an authenticated thin-client git hook that queries `GET /api/v1/governance/commit-check` before commit.
- **Provenance Tracking** - Records AI authorship attribution to the SOA ledger as `PROVENANCE_RECORDED` events and exposes artifact history via `GET /api/v1/governance/provenance/:artifactPath`.
- **CI Governance Context Export** - Adds `tools/export-governance-context.sh` and release workflow artifact upload so shipped builds retain public governance context.

### Changed

- Release documentation, README surfaces, and packaged extension metadata now align on `v4.3.0`.
- Bundled extension operator docs now ship with the VSIX for component-level and process-level guidance.

### Fixed

- Quality sweep remediation sealed for `v4.3.0`: IPv6 SSRF coverage in `GovernanceWebhook`, dead-code removal in `capabilities.ts`, and Razor compliance restoration in `SentinelRagStore.ts`.

## [4.2.0] - 2026-02-27

> _"The Answer to the Ultimate Question of Life, the Universe, and Everything."_

### Added

- **Multi-Agent Governance Fabric** — Runtime detection and governance injection for Claude CLI, Copilot, Codex CLI, and Agent Teams via `SystemRegistry` and `FrameworkSync`.
- **Governance Ceremony** (`failsafe.onboardAgent`) — Single-command opt-in/opt-out for governance injection across all detected AI agents.
- **First-Run Onboarding** — Multi-agent governance coverage options during initial setup.
- **Agent Coverage Dashboard** — Console route showing detected agents, injection status, and compliance state.
- **Undo Last Attempt** (`failsafe.undoLastAttempt`) — Checkpoint-based rollback with integrity verification.
- **Discovery Phase Governance** — DRAFT → CONCEIVED status gate with ledger-tagged graduation markers.
- **Terminal Correlator** — Maps terminals to agent systems for cross-agent audit correlation.
- **Workflow Run Model** — Run/stage/gate/claim/evidence contracts aligned to governance lifecycle.
- **Intent Schema v2** — `schemaVersion`, `agentIdentity`, and `planId` fields with v1 migration.
- **Verdict Replay Batch** — Bulk verdict replay with timing-safe hash comparison.
- **CheckpointManager** — Bridges QoreLogic ledger and Sentinel substrates for checkpoint metrics.

### Changed

- `SystemRegistry` extended with terminal-based agent detection.
- `RoadmapServer` gains `setSystemRegistry()` deferred setter.
- `QoreLogicSubstrate` interface extended with `systemRegistry` field.
- Event types expanded with `DISCOVERY_RECORDED` and `DISCOVERY_PROMOTED`.

---

## [4.1.0] - 2026-02-27

### Added

- **Gap 1: Mode-Change Audit Trail** — All `governance.mode` configuration changes now recorded to SOA ledger with `USER_OVERRIDE` event type.
- **Gap 2: Break-Glass Protocol** — Time-limited governance overrides with justification requirements, auto-revert, and full audit trail.
- **Gap 3: Artifact Hash on Write** — SHA-256 hash of file content at save-time recorded in ledger for verification.
- **Gap 4: Verdict Replay Harness** — `failsafe.replayVerdict` command for audit verification of past governance decisions.

### Changed

- Ledger payload now includes `policyHash` for replay fidelity.
- New methods: `LedgerManager.getEntryById()`, `PolicyEngine.getPolicyHash()`.

---

## [4.0.0] - 2026-02-27

### Added

- **Token Economics Dashboard** — Real-time visibility into prompt token usage, RAG savings, and cost-per-action metrics.
- **Economics Service Layer** — Pure TypeScript module with `CostCalculator`, `EconomicsPersistence`, `TokenAggregatorService`.
- **Governance Mode System** — Three modes (Observe, Assist, Enforce) selectable via settings or command.
- **Risk Register Panel** — Dedicated webview for tracking and managing project risks.
- **Transparency Stream Panel** — Real-time governance event stream in the sidebar.
- **Chat Participant** — `@failsafe` chat commands for intent, audit, trust, status, and seal operations.

### Changed

- UI terminology: "Operations Hub" renamed to "Command Center".
- API-first service isolation for future Tauri/Rust extraction.

---

## [3.6.0] - 2026-02-17

### Changed

- **Marketplace Categories** - Updated from `["Other", "Linters", "Visualization"]` to `["Machine Learning", "Testing", "Visualization"]` for better discoverability in the VS Code Marketplace.
- **Keywords Expanded** - Added 8 new keywords: `ai safety`, `agent governance`, `code audit`, `risk management`, `compliance`, `deterministic governance`, `intent management`, `checkpoint`.
- **Documentation** - Added marketplace category badges to README files for transparency.

### Added

- **Governance Modes** - Three modes to match workflow needs:
  - `observe` - No blocking, just visibility and logging. Zero friction.
  - `assist` - Smart defaults, auto-intent creation, gentle prompts. Recommended for most users.
  - `enforce` - Full control, intent-gated saves, L3 approvals. For compliance workflows.
- **Set Governance Mode Command** - `FailSafe: Set Governance Mode` to quickly switch between modes.
- **Auto-Intent Creation** - In Assist mode, FailSafe automatically creates intents when missing.
- **Default Governance Mode** - New installations default to `observe` mode for zero-friction onboarding.
- **EnforcementEngine** - Now respects governance mode setting for all enforcement decisions.

---

## [3.5.6] - 2026-02-12

### Changed

- Release metadata/version bump to 3.5.6 to start the Command Center UI overhaul sprint.

---

## [3.5.2] - 2026-02-11

### Fixed

- Marketplace/registry screenshot rendering fixed by moving sidebar image references to packaged extension media paths.

### Changed

- Release metadata/version bump to 3.5.2 across extension and distribution manifests.

---

## [3.5.1] - 2026-02-11

### Added

- Sidebar UI streamlining finalized (`Open Hub`, `Editor`, `Reload` shell controls + compact card alignment pass).
- `All Installed` skills lane added to Operations Hub skills surface to prevent phase-only visibility loss.
- Release screenshot artifact for streamlined sidebar UI added at `FailSafe/docs/images/sidebar-ui-3.5.1.png`.

### Changed

- First-party proprietary skill naming normalized to `qore-*` convention across FailSafe skill roots.
- Tauri skill packs adopted into FailSafe-owned skill library with `creator: MythologIQ Labs, LLC`.
- Skill discovery root resolution hardened to avoid false empty-catalog conditions.
- Documentation surfaces (root, extension, VSCode/OpenVSX package READMEs) updated to reflect 3.5.1 behavior and current commands.

---

## [3.0.1] - 2026-02-06

### Added

- **Release Discipline Enforcement** - New `/ql-repo-release` workflow artifact.
- **Sentinel Sidebar Monitoring** - Complete `SentinelViewProvider` and `SentinelTemplate`.
- **Structural Decomposition** - Decomposed `main.ts` into specialized bootstrap modules forSection 4 Simplicity.

### Fixed

- **Sentinel UI Hang** - Resolved perpetual loading by registering missing webview provider.
- **Type Solidification** - Hardened `FailSafeEventType` and `PlanningHubPanel` model mappings.

### Changed

- **KISS Refactor** - Flattened `DashboardPanel` constructor and templates to eliminate bloat.
- **Environment Parity** - Sync 3.0.1 graduation across VSCode, Claude, and Antigravity.

---

## [2.0.1] - 2026-02-05

### Added

- Webview template modules for Cortex Stream, Dojo, Dashboard, and Living Graph (Razor compliance).
- Shared tooltip helper with data-tooltip rendering across Genesis views.

### Fixed

- Cortex Stream search overlay text removed to eliminate redundant labels.
- Tooltips now display for advanced governance terminology and calculated metrics.

### Changed

- Documentation refreshed for the 2.0.1 release.

---

## [2.0.0] - 2026-02-05

### Added

- **Gold Standard Repository Skills**
  - `/ql-repo-audit` - Gap analysis against Gold Standard checklist
  - `/ql-repo-scaffold` - Generate missing community files (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GOVERNANCE)
  - `/ql-repo-release` - Release discipline enforcement
- **Ambient Integration** - Repository governance hooks in existing commands
  - `/ql-bootstrap` Step 2.5: Repository readiness check
  - `/ql-plan` Step 4.5: Plan branch creation
  - `/ql-audit` Pass 7 + Step 5.5: Repo governance audit
  - `/ql-implement` Step 12.5: Implementation staging
  - `/ql-substantiate` Step 9.5: Final staging & merge
- **GitHub API Integration** - `github-api-helpers.md` reference for gh CLI patterns
- **Template Library** - 9 templates in `docs/conceptual-theory/templates/repo-gold-standard/`
- **Self-Application** - FailSafe now has Gold Standard community files at root
- **Multi-Environment Sync** - v2.0.0 skills synced to Claude, Antigravity, VSCode
- **Specialized Agents**
  - `ql-technical-writer` - Documentation quality specialist
  - `ql-ux-evaluator` - UI/UX testing with optional Playwright

---

## [1.3.0] - 2026-02-05

### Added

- **Plan Navigation** - DojoViewProvider now links to Roadmap view
- **Governance Integration** - GovernanceRouter plan events at lines 91-107
- **PlanManager Wiring** - Complete integration in main.ts

---

## [1.2.2] - 2026-02-05

### Fixed

- **D1**: Verified `calculateComplexity` exists (ArchitectureEngine lines 120-142)
- **D2**: Added `architecture.contributors` and `architecture.maxComplexity` config properties
- **D3**: Removed orphan `tsconfig.json` from workspace root

---

## [1.2.1] - 2026-02-05

### Added

- **BACKLOG.md Integration** - Unified source of truth for blockers, backlog, and wishlist
- **7 Command Integrations**:
  - `/ql-status` - Step 2.5 backlog check, Outstanding Items output
  - `/ql-bootstrap` - Step 6.5 BACKLOG.md creation
  - `/ql-audit` - Step 5.5 blocker registration on VETO
  - `/ql-implement` - Step 10.5 mark blockers complete
  - `/ql-substantiate` - Step 3.5 blocker verification
  - `/ql-plan` - Step 3.5 register backlog items
  - `/ql-refactor` - Step 5.5 register tech debt

---

## [1.2.0] - 2026-02-05

### Added

- **UI Clarity Enhancements** (Navigator)
  - Improved section and metric spacing
  - 6 info hints with tooltips in DojoViewProvider
  - 6 filter tooltips in CortexStreamProvider
  - Collapsible Quick Start Guide with toggleGuide handler
- **New Shared Components**
  - `shared/styles/common.ts` (74 lines)
  - `shared/components/InfoHint.ts` (66 lines)
  - `shared/content/quickstart.ts` (87 lines)

---

## [1.1.1] - 2026-02-05

### Added

- **VSCode Chat Participant** - `FailSafeChatParticipant.ts` (239 lines)
  - Slash commands for governance queries
  - Trust stage helper method (V1 remediation)
- **Chat Integration** - package.json chat participant registration

---

## [1.1.0] - 2026-02-05

### Added

- **Event-Sourced Plan Management** (Pathfinder)
  - `PlanManager.ts` (218 lines) - Event sourcing with YAML persistence
  - `RoadmapViewProvider.ts` (217 lines) - SVG-based visualization
  - `types.ts`, `events.ts`, `validation.ts` - Plan data model
- **Three View Modes** - Roadmap, Kanban, Timeline
- **30 Test Cases** - Full PlanManager test coverage
- **GovernanceRouter Integration** - `findPhaseForArtifact`, `setPlanManager` methods

---

## [1.0.7] - 2026-02-05

### Fixed

- Excluded test files from extension package to reduce bundle size
- Node.js version compatibility improvements

---

## [1.0.6] - 2026-02-04

### Fixed

- Extension icon path for VS Code Marketplace listing

---

## [1.0.5] - 2026-02-04

### Fixed

- Marketplace listing copy and metadata improvements

---

## [1.0.4] - 2026-02-04

### Fixed

- **Node.js Version Compatibility:** Resolved NODE_MODULE_VERSION mismatch by implementing pre-built binary support for better-sqlite3. The extension now works reliably across different Node.js versions.

### Added

- **Node Version Pinning:** Added `.nvmrc` configuration (Node 20.18.1) to ensure consistent build environments.
- **Binary Configuration:** Implemented pre-built binary downloads for native dependencies, eliminating version mismatches during installation.

---

## [1.0.0] - 2026-01-22

### Added

**Phase 4: Genesis UI & Feedback Loop**

- Implemented **The Dojo** sidebar with interactive workflow tracking
- Enhanced **Living Graph** with D3.js force-directed visualization, risk-grading, and trust-scaling
- Refined **Cortex Stream** with real-time filtering, search, and UX-centric keyboard shortcuts
- Implemented **FeedbackManager** with JSON-backed community feedback persistence and export support

**Phase 3: Governance & Trust**

- Migrated **TrustEngine** from in-memory to SQLite persistence via LedgerManager
- Implemented **Shadow Genome** protocol for archival and learning from agent failures

**Phase 2: Sentinel Enforcement**

- Implemented **Heuristic Pattern Library** for active monitoring
- Added **ExistenceEngine** for structural claim verification
- Implemented **ArchitectureEngine** for Macro-KISS enforcement (Polyglot/Bloat detection)

---

## [0.2.0] - 2026-01-22

### Added

- **Ledger Hardening:** Implemented full cryptographic verification for hash chain
- **Secure Storage:** Migrated HMAC signing keys to VS Code SecretStorage
- **Atomic Config:** Implemented atomic writes for configuration files

### Fixed

- **Database Locks:** Fixed issue where SQLite database remained locked after extension reload
- **Genesis Block:** Replaced placeholder genesis hash/signature with computed values

---

## [0.1.0] - 2026-01-22

### Added

- Initial project scaffold
- Basic SQLite Ledger implementation

---

_For the full roadmap, see [ROADMAP.md](ROADMAP.md)._
