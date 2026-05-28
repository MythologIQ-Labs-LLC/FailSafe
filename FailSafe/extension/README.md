# FailSafe — Safety layer for AI coding agents

Prevent runaway AI edits, hallucinated dependencies, and destructive refactors before they break your codebase.

FailSafe runs locally inside VS Code and Cursor. It monitors what AI agents do, applies deterministic policy checks at the editor boundary, and gives you full visibility into every decision — before code ships.

---

## 🚀 Introducing FailSafe Pro — Now Available

**FailSafe Pro is the desktop-native, higher-tier application for full-stack AI governance.** Where this open extension guards your editor, **FailSafe Pro guards your entire SDLC** — OS-level enforcement, file locking, team workflows, remote orchestration, and managed runtime operations that go beyond the editor boundary.

[**→ Learn more**](https://mythologiq.studio/products/failsafe-pro) · [**Download FailSafe Pro**](https://mythologiq.studio/products/failsafe-download)

---

**Current Release**: v5.3.0 (2026-05-28)

![FailSafe Banner](https://raw.githubusercontent.com/MythologIQ/FailSafe/main/FailSafe/extension/FailSafe%20Banner.png)

## What's New in v5.3.0

Feature release. v5.3.0 doubles FailSafe's integration surface — Open Design joins Bicameral as a first-class MCP peer — and adds a WARN-only governance substrate for substantiate-time signals (secret scanning, FEATURE_INDEX coverage, model-pinning lint).

- **Open Design integration (v1 + v1.1)** — FailSafe now attributes agent runs that touch Open Design artifacts (file-path provenance detector + "Open Design" origin pill on the Agents → Replay sub-view), AND ships an MCP adapter + per-run SSE attach + daemon-liveness probe so the Open Design local daemon at `127.0.0.1:7456` is governable alongside Bicameral. New `failsafe.openDesign.registerMcp` Command Palette entry walks operators through the registration. Opt-in via `failsafe.integrations.openDesign.{enabled,mcpEnabled,sseEnabled}` (all default `false`). Write tools (`create_artifact`, `write_file`, `delete_file`, `delete_project`) are read-only-blocked this release; L3-gated exposure deferred to v1.2.
- **Governance substrate (WARN-only)** — new `FailSafe: Run Governance Substrate Checks` Command Palette entry runs three substantiate-time governance signals on demand: gitleaks-backed secret scanning over staged content, FEATURE_INDEX coverage verification, and model-pinning lint. Findings stream to a dedicated FailSafe Substrate Output channel + summary toast. WARN-only posture: never blocks operator workflow.
- **Integrations tab** now renders an Open Design Settings card alongside the existing Bicameral card.

## What's New in v5.2.2

Hotfix release. v5.2.1 was tagged but its publish pipeline failed at Build & Test on a latent Playwright harness regression (introduced when v5.2.0 added LearnRenderer with cross-directory ESM imports that `popout-ui.spec.ts`'s legacy static-file harness couldn't resolve); the marketplace publish jobs were skipped, so v5.2.1 was never installable either. **v5.2.2 is the first v5.2.x build that actually ships to the marketplaces.**

**Zero feature changes from v5.2.1 (or v5.2.0)** — the FailSafe Learn rebuild, the Ollama probe fix, and the global a11y baseline below ship verbatim. The hotfix migrates `popout-ui.spec.ts` to the modern `serveConsoleServerUI` harness used by every other v5.2.0+ Playwright spec.

## What's New in v5.2.1

Hotfix release. v5.2.0 was tagged but its publish pipeline failed at Build & Test (5 unit-test failures from three orphaned SHIELD-anchor lesson literals + an FX615 tag-filter test race); the VS Code Marketplace + Open VSX publish jobs were skipped, so v5.2.0 was never installable. **v5.2.1 was the next attempt — also failed (see v5.2.2 above for the harness regression).**

**Zero feature changes from v5.2.0** — the FailSafe Learn rebuild, the Ollama probe fix, and the global a11y baseline below ship verbatim. The hotfix only resolves the test regressions that blocked publish.

## What's New in v5.2.0

The v5.2.0 release delivers on the learning promise: a Learn tab that teaches the software-development craft to non-traditional builders, with a redesigned visual surface and accessibility baseline.

- **Learn tab is now a two-sub-tab `TabGroup`**: `[Read][Glossary]`. Read is default active.
- **Read sub-view**: sectioned essays with per-essay accent rail, inline-SVG icon, read-time chip, pull-quote callout, H4 sub-sections. Sticky horizontal jump-strip (FX619) for at-a-glance navigation + relevant-now dots. Acceptance-criteria template gains a **Copy** button.
- **Glossary sub-view** (renamed from Reference): search input + tag-filter buttons + A-Z/Z-A sort. ~60 unified terms (48 SWE-craft + 12 FailSafe + 1 Bicameral integration partner).
- **Global a11y baseline** in `command-center.css`: `prefers-reduced-motion` honored, global `:focus-visible` on interactive surfaces, `.visually-hidden` SR-label utility, prose `max-width: min(68ch, 100%)`. Closes WCAG 2.3.3 + 2.4.7 + 1.4.4.
- **Fixed: Mindmap "Ollama (Server)" false-positive "Connected"** — the panel previously hardcoded a Connected status with no probe. Now actually probes `http://localhost:11434/api/tags` with 30s TTL and reflects reality (`Connected ✓` / `Not Running` / `Checking…` / `Unavailable`).

See [CHANGELOG.md](../../CHANGELOG.md) for the full v5.2.0 release notes and `docs/EDUCATION.md` / `docs/LEARN_TAB.md` for component documentation.

## What's New in v5.1.8

- **Bicameral Advanced-tools surface** (B-INT-1): the 11 remaining Bicameral MCP tools are reachable via `POST /api/actions/bicameral-<tool>` routes (`bicameralToolRoutes.ts` factory — state-changing tools governed through the B151 `McpInterceptor`, query tools direct) plus a styled, collapsible **"Advanced tools"** card section — query/mutation grouping, per-row loading state, labelled success/error results.
- **Sentinel-evaluator vs Governance-mode UI disambiguation** (B-EM-1): `sentinelModeValue()` corrects the invalid `'observe'` fallback; five UI sites relabelled (`integrity.js` `Governance Mode:` → `Sentinel Mode:`, etc.).
- **Brainstorm node-label truncation feedback** (B132): `BrainstormRoute.ts` returns additive `labelTruncated` fields; the UI surfaces a dismissible `.bs-truncation-notice`.
- **B199 test-coverage epic closed**: the CRITICAL Playwright + integration-coverage epic verified complete; FX539 retro-indexed.
- **Activation-test regression fix**: three `bicameral-activation.test.ts` cases made async-aware (B-BIC-6's async validator); full `vscode-test` suite restored to green.

See root [CHANGELOG.md](../../CHANGELOG.md) for the full v5.1.8 release notes.

## What's New in v5.1.7

- **Universal governance interceptor** (B151): an `IGovernanceInterceptor` single-`evaluate` seam — `EngineBackedInterceptor` maps engine verdicts to schema-valid receipts, `McpInterceptor` adapts MCP `{name,arguments}` envelopes; `BicameralRoute` history/drift/ratify migrated through it with a behavioural-parity fixture. Opens the B190 → B151 → B152 → B153 architecture chain.
- **Bicameral preflight → L3** (B-INT-2): `PreflightToL3Mediator` attaches drifted-decision evidence to queued tier-3 L3 approvals; a preflight-conflict line surfaces on the approval card.
- **Subscribe-without-mutate UI remediation** (B198): shared accessible `modal-helper`, event-driven `SkillsRenderer` cache invalidation, and `TabGroup` sub-view lifecycle cleanup.
- **Bicameral hardening**: `isSafeBicameralCommandResolved` symlink-containment + `extraRoots` allowlist (B-BIC-6/7); decision-row UX — open-binding route, capability-gated ingest hint, composite Sync, overflow clamp (B-BIC-12/13/14/15); `bicameral.verdict` events feed `SentinelWatchPolicy` + the Risks Register via `DriftToRiskMediator` (B-BIC-17/18).
- **Test-coverage hardening** (B-B199-3/4/5/6): per-file-scoped E2E coverage-gate overrides, cross-host install-record coverage, documented voice/stub trade-offs.

See root [CHANGELOG.md](../../CHANGELOG.md) for the full v5.1.7 release notes.

## What's New in v5.1.6

- **Bicameral MCP — HIGH cluster**: 11 typed wrappers for the deferred bicameral tools (ingest, search, brief, judgeGaps, resolveCompliance, linkCommit, update, reset, dashboard, validateSymbols, getNeighbors) + `callRaw` public surface + per-tool runtime guards (B-BIC-19).
- **Live-subprocess integration test**: vendored TypeScript echo-mcp-server spawned via `process.execPath` exercises the real `@modelcontextprotocol/sdk` transport handshake — closes the prior gap where Bicameral tests stubbed the transport (B-BIC-20).
- **DriftToL3Mediator**: bicameral drift status-edges enqueue L3 approvals; L3 decisions ratify upstream (APPROVED + APPROVED_WITH_CONDITIONS → `ratify`, REJECTED → `reject`, DEFERRED/EXPIRED no-op). De-dup by `bicameral:{decisionId}` (B-BIC-16).
- **Upstream awareness**: pip floor pin `bicameral-mcp>=0.14,<0.16` + `UpstreamMonitor` service (default 24h poll; regex-allowlisted owner/repo slug; fail-closed before any `httpFetch`) + `GET /api/integrations/bicameral/upstream` local-only route + Settings card `renderUpstreamRow` helper with floor/ceiling warnings. 2 new settings: `failsafe.integrations.bicameral.upstreamPollMs` + `.upstreamRepoUrl` (B-INT-3).
- **B-B199-2 Replay + Genome behavioral E2E**: 14 new Playwright cases cover the Agents-tab Replay (8 cases: empty state, list view, slice cap 20, click-to-detail nav, step badges, governance card, back navigation, WS-event refresh) and Genome (6 cases: empty pattern, pattern cards, show-all toggle, slice cap 12, unresolved table, WS-event refresh) sub-views.
- **B-EM-2/B-EM-3 enforcement-mode polish**: `ModeTransitionHistory.hydrateFromLedger` replays governance.modeChanged events from META_LEDGER on activation (11 cases); `FirstRunModePicker` quickpick offers Observe/Assist/Enforce on initial install with persistence + cancel-path safety (6 cases).

## What's New in v5.1.5

- **Bicameral MCP — Integrations tab**: full v1 surface (install bridge, settings card, history/preflight/drift/ratify) plus 5 quick-win hardening fixes (B-BIC-1..5): ratify → META_LEDGER USER_OVERRIDE; extension-deactivate disposer; transport.onclose crash recovery; capability cache; install stdout/stderr ANSI sanitizer. Solo / team install picker drives `pip install bicameral-mcp` + `bicameral-mcp setup`; nothing bundled in the VSIX. See `docs/INTEGRATIONS.md`.
- **B199 Command Center E2E coverage**: structural Playwright specs for all 6 top-level tabs (Settings, Overview, Skills, Agents, Workspace, Governance) + 16-broadcast WebSocket matrix + real-disk META_LEDGER → /api/hub → Monitor renderer end-to-end (FX511–FX525).
- **B197 qor-logic version-floor surfacing**: hub payload carries `installedVersion` + `meetsFloor`; Settings card surfaces a floor warning when below `MIN_QOR_LOGIC_VERSION`.
- **B194 enforcement-mode escalation UX**: observe-mode advisory banner + Governance tab "Mode Transitions" feed with reverse-chronological history.
- **B193 SentinelDaemon governance-file coverage**: governance markdown/yaml/json watched; canonical fs paths; `.failsafe/governance/` blanket-prefix match.
- **B192 stale-cache remediation**: `WorkspaceMutationBus` substrate routes filesystem mutations to PlanManager + HubSnapshotService + TrustEngine + ConsoleLifecycleService subscribers. Closes the FailSafe-Pro-coexistence concern. See `docs/governance-cache-invalidation.md`.
- **B195 voice substrate extraction**: heavy Piper TTS + Whisper STT vendor binaries (~86 MB uncompressed) moved out of the base VSIX into a separate `failsafe-voice-pack-<version>.tar.gz` companion download. Voice features become opt-in: run `FailSafe: Install Voice Pack`. Base extension drops below the 30 MB marketplace ceiling. See `docs/INTEGRATIONS.md` Voice Pack section.
- **Test isolation hardening**: `vscode-test` now pins a unique `--user-data-dir` per invocation to eliminate dual extension-host races against ambient editor processes — pre-push gate becomes fully deterministic.

## What's New in v5.1.0

Minor release: B199 Phase 1 ships the comprehensive E2E coverage methodology and the release-class CI gate (Option C) that blocks UI-surface commits without a corresponding `.spec.ts`. Surfaced and fixed three latent Monitor bugs that unit tests could not catch — including a missing `type="module"` on the Monitor's bootstrap script that meant the compact UI never actually rendered in production.

### Added

- **Comprehensive E2E coverage methodology** — `serveCompactUI` test harness + `ledgerFixtures` builder + `monitor-shield-progression.spec.ts` (8 cases) + `monitor-staleness.spec.ts` (1 lifecycle). Covers all 6 SHIELD phases (IDLE / PLAN / GATE / IMPLEMENT / SUBSTANTIATE / SEALED) plus plan-title rendering and WS-disconnect staleness handling.
- **Release-class CI coverage gate** — `scripts/check-e2e-coverage.cjs` invoked from the pre-push hook when the active plan's `change_class` is `feature` or `breaking`. Blocks pushes whose staged surface files (UI, ConsoleServer routes, commands) lack a corresponding `*.spec.ts`, unless a `[no-e2e: <reason>]` token appears in a commit message in the push range. Hotfix is exempt.

### Fixed

- **Monitor never bootstrapped in production** (root mechanism behind B191's user-visible "Monitor doesn't see my work"). The compact UI's `<script src="roadmap.js">` was missing `type="module"` despite using ES module imports — the script silently failed to execute. No prior unit test exercised UI JS execution, so this was invisible. Fixed.
- **SEAL phase rendered "Substantiate active" instead of "all four done"** — `PHASE_INDEX_MAP['SEALED']` was 4 (same as SUBSTANTIATE) in `monitor-render.js`. Bumped to 5 so SEAL correctly marks all four steps `done`.
- **IDLE phase rendered "Plan active" instead of "all pending"** — added an IDLE early-return branch in `getPhaseInfo` that fires only when no other phase signal exists; preserves existing IDLE+runState and IDLE+recentCompletions fallthrough.

## What's New in v5.0.0

Major release: skills ingested from the [`qor-logic`](https://pypi.org/project/qor-logic/) PyPI package, public reveal of the FailSafe / FailSafe Pro product split, and the Command Center now reads workspace truth (META_LEDGER, BACKLOG, plans, audit, changelog) instead of empty placeholder state.

### Added

- **QorLogic skill ingestion** — `Install QorLogic Skills` button installs the `qor-logic` Python package and runs `qorlogic install --host claude --scope repo` (and codex). Skills land at `.claude/skills/` and `.codex/skills/` with synthesized provenance.
- **Python interpreter auto-detection** — Resolves Python in priority order: `failsafe.qorlogic.pythonPath` setting → VS Code Python extension (`ms-python.python`) → probe `python3` → `python` → `py -3`.
- **`failsafe.bootstrap` and `failsafe.organize` commands** — Idempotent workspace-readiness gate; runs in silent mode on every activation, full bootstrap (incl. `pip install qor-logic`) on user trigger.
- **Always-visible Settings card** — "Install / Refresh QorLogic Skills" + "Bootstrap Workspace" buttons; no longer gated on a brittle "is something on disk" heuristic.
- **FailSafe Pro discovery** — New `FailSafe: About FailSafe Pro` command and a Settings panel card link to <https://mythologiq.studio/products/failsafe-download>.
- **Workspace-truth UI** — Operations Phases stat reflects META_LEDGER history (was 0/0); Risks tab shows BACKLOG open items when no `risks.json` exists; Overview gains Latest Audit + Recent Releases cards parsed from `.failsafe/governance/AUDIT_REPORT.md` + `CHANGELOG.md`.
- See `docs/v5/QORLOGIC_SKILL_INGESTION.md` and `docs/v5/PRO_INTEGRATION.md`.

### Changed

- The v4 bundled `dist/extension/skills/` is no longer shipped in the VSIX. Existing user skills under `.claude/skills/` are not touched on upgrade.
- "Install Skills" UI label renamed to "Install QorLogic Skills".
- Skill IDs migrated from `ql-*` to `qor-*` across source and project-local skill directories. `SkillParser` recognizes both prefixes during the v4→v5 transition.
- Operations Phases render capped at 10 cards plus a summary row (was: would render 120 cards on a populated workspace).

### Round 2 — Install UX (2026-05-05)

- Install transparency report: every QorLogic install action emits a structured per-phase invocation list (python-probe, pip-install, qorlogic-install per host, provenance, refresh). Failed steps stay visible with command + stderr until the next run.
- Host/scope QuickPick prompts before installing; selections persist to workspace state.
- New command palette entry "FailSafe: Install QorLogic Skills (defaults)" — bypasses the QuickPick for automation.
- "Show Output" button focuses the FailSafe (QorLogic) output channel.

### Round 3 — Voice & Brainstorm UX (2026-05-06)

- **Multilingual voice** — Whisper model picker (tiny / base / small) and 12-language BCP-47 selector. Default model switched to multilingual; English-only fallback removed.
- **Voice status badge** — surfaces unified voice state (listening / processing / speaking / errors) in the Brainstorm right panel.
- **TTS error transparency** — Piper vendor presence failures now surface to the badge instead of silent failure.
- **Brainstorm history limit** — configurable via Settings → Brainstorm (was hardcoded to 10).
- **Notifications severity gating** — independent toggles for info-tier and error-tier toasts in Settings → Notifications.
- **Security hardening** — XSS escape discipline applied across all settings/overview innerHTML interpolation; Whisper model and Piper voice allowlists close supply-chain pivot risks.
- **Internal architecture** — ConsoleServer decomposition (`QoreRuntimeService` + 4 route extractions). No user-visible API change.

### About FailSafe Pro

FailSafe Pro is the desktop native application for SDLC visibility and governance — OS-level enforcement, file locking, team workflows, and remote connections beyond the editor boundary. The open extension remains the editor surface; pair it with Pro for full SDLC operations.

Learn more: <https://mythologiq.studio/products/failsafe-pro>
Download: <https://mythologiq.studio/products/failsafe-download>

Or open the Command Center Settings tab and choose "About FailSafe Pro".

## What's New in v4.9.9

Bugfix release: Install Skills button now works, and the Brainstorm Prep Bay (microphone, voice controls) is visible again in the Command Center.

### Fixed

- Install Skills button now correctly finds bundled skills and scaffolds them into the workspace.
- Brainstorm Prep Bay, topology legend, and AI extraction tiers visible in the right panel when Mindmap sub-view is active.
- Right panels for all TabGroup sub-views (Operations, Transparency, Skills) are now properly surfaced.

## What's New in v4.9.0

Agent Run Replay & Governance Decision Contracts — capture full execution traces from AI coding agents and replay them step-by-step with governance decision overlay.

### Added

- **Agent Run Replay** — Record and replay complete agent sessions with step navigation, file-level diff inspection, and governance decision cards (B146).
- **Governance Decision Contracts** — Typed decision pipeline converting raw sentinel events into structured `GovernanceDecision` objects with risk categorization and mitigation suggestions (B147).
- New command: `FailSafe: Show Run Replay`.

### Security

- 3 fixes: XSS in onclick handlers, path traversal in file viewer, re-entrancy in run recorder.

## What's New in v4.8.0

Agent Debugging & Stability Monitoring Suite — dedicated panels for agent execution timeline, risk indicators, and shadow genome debugging.

### Added

- **Agent Execution Timeline** — Step-by-step visualization of agent actions with governance decision overlay (B142).
- **Risk & Stability Indicators** — Real-time agent health status with observe-mode notification and fallback logic (B143).
- **Shadow Genome Debugging Panel** — Interactive browser for failure patterns with filtering and pattern details (B144-B145).
- New commands: `FailSafe: Agent Health Status`, `FailSafe: Agent Execution Timeline`, `FailSafe: Shadow Genome Debugger`.

## What's New in v4.7.2

Performance improvements and bug fixes for the FailSafe extension.

### Fixed

- L3 escalation resilience: Added try/catch blocks around L3 queuing in `L3ApprovalService` and `VerdictRouter` to prevent potential crashes on connection failures.

### Performance

- Concurrent Folder Manifold Calculation: Shifted folder processing from sequential to concurrent using `Promise.all`, showing improved execution time during workspace initialization.

## What's New in v4.7.0

Agent Marketplace and Microsoft Agent Governance Toolkit integration — discover, install, and manage external agent repositories with HITL security gates and automated vulnerability scanning.

### Added

- **Agent Marketplace** — Skills tab sub-section with curated catalog of 11 external agent repos (AutoResearch, AutoGen, TaskWeaver, PyRIT, Garak, Promptfoo, Dify, and more) across Autonomous, Safety, and UI categories.
- **HITL Security Gates** — Nonce-based approval tokens for installation confirmation with repo URL, author, permissions, and sandbox options.
- **Security Scanner Integration** — Garak/Promptfoo CLI integration for vulnerability scanning with L1/L2/L3 risk grades.
- **Microsoft Agent Governance Toolkit Adapter** — Python package (`agent-failsafe`) bridging FailSafe to agent-os, agent-mesh, agent-hypervisor, and agent-sre.

## What's New in v4.6.6

Workspace isolation and repository governance — multiple VS Code windows can run FailSafe independently, and external workspaces can be validated against governance standards.

### Added

- **Repository Governance as a Service** — Validates workspaces against `REPO_GOVERNANCE.md` standards (structure, root files, GitHub config, commit discipline, security posture) with automated grading (A-F).
- **Compliance metric in Monitor** — Workspace Health grid displays compliance grade with color-coded indicator and violation tooltips.
- **Multi-workspace support** — Server registry tracks active instances; workspace selector in Command Center enables switching between connected workspaces.
- **S.H.I.E.L.D. phase tracker** — Parses META_LEDGER.md to detect current governance phase and provide context-aware next steps.

## What's New in v4.6.5

Cross-agent skill consolidation — all SHIELD skills migrated from legacy `.claude/commands/` to modern `.claude/skills/{name}/SKILL.md` format. Agent definitions separated to `.claude/agents/`. ModelAdapter output directories corrected for all 5 supported platforms. VSIX bundling de-complected (skills only, no agents).

### Changed

- **Skills migrated to SKILL.md format** — 17 SHIELD skills + 3 personas now use directory-based `.claude/skills/qor-*/SKILL.md` with YAML frontmatter, matching modern Claude Code SDK conventions.
- **Agents separated** — 7 agent definitions moved to `.claude/agents/qor-*.md` with subagent frontmatter. Claude Code loads these natively without extension scaffolding.
- **ModelAdapter output dirs fixed** — Claude (`.claude/skills/`), Codex (`.agents/skills/`), Gemini (`.gemini/skills/`), Copilot (`.github/skills/`), Cursor (`.cursor/rules/`) all corrected.
- **getOutputPath simplified** — Directory-based output (`{name}/SKILL.md`) is now the default; only Cursor uses flat files.
- **VSIX bundling de-complected** — Agents removed from bundle patterns, eliminating scaffold collision. Directory-based skill bundling added.
- **Antigravity restructured** — Genesis/Qor-Logic directories replaced with `skills/qor-*/SKILL.md` + `agents/` layout.
- **Stale duplicates removed** — `FailSafe/Claude/` (20 files) deleted; 12 quarantined skills cleaned up.
- **Cross-agent instruction file** — `AGENTS.md` created at repo root for Codex/Copilot/Cursor/Windsurf compatibility.

## What's New in v4.6.4

Governance state integrity remediation — trust data that was transient or fabricated is now persisted, verified, and kept in sync.

### Fixes

- **Trust state no longer transient** — Agent trust scores, quarantine status, and verification counts now persist through EventBus-driven cache invalidation. Every trust mutation writes to SQLite and rebuilds the in-memory cache from DB.
- **Trust timestamps are real** — Audit trails reflect actual DB `updated_at` instead of fabricated call-time timestamps.
- **Checkpoint chain verified on startup** — No longer assumes valid. Auto-verifies integrity and flags failures.
- **Version display fixed** — Command Center hub snapshot reads version from package.json (was hardcoded 4.4.0).

### Added

- **Optimistic locking for trust persistence** — Concurrent agent trust writes use version-based concurrency control with automatic retry, preventing silent data loss from race conditions.

### Changed

- **TrustEngine refactored** — 449-line monolith split into TrustEngine (223L), TrustPersistence (167L), and TrustCalculator (40L) for Section 4 Razor compliance.

## What's New in v4.6.3

### Fixes

- **Console Server accessible again** — Fixed latent Express dotfile protection bug that caused 404 errors when extension was installed in dotfile directories (`.vscode/`, `.antigravity/`).
- **Monitor & Command Center Parity** — Build steps, debug sessions, and recently completed items now track live in the sidebar. L3 approval queue auto-prunes expired requests. Command Center surfaces Sentinel critical alerts with verdict banners and status-aware mission strip coloring.

## What's New in v4.6.1

### Fixes

- Missing sidebar icon restored — activity bar now shows the FailSafe shield.
- Release Pipeline no longer fails on tag-based CI runs (detached HEAD).
- Icon validation added to preflight gate to prevent missing asset regressions.

## What's New in v4.6.0

### Section 4 Razor Decomposition

- **ConsoleServer.ts**: 3265L decomposed to 1124L with 5 extracted route modules (Brainstorm, Checkpoint, Actions, TransparencyRisk) and 7 service modules (SkillParser, SkillFrontmatter, SkillRegistry, SkillDiscovery, SkillRanker, CheckpointStore, CheckpointUtils).
- **stt-engine.js**: 400L decomposed to 249L with 4 extracted modules (whisper-loader, silence-timer, wake-word-listener, live-transcriber).
- **EnforcementEngine.ts**: 250L decomposed to 122L with 4 enforcement evaluators (Observe, Assist, Enforce, IntentAutoCreator).

### Voice Brainstorm Fixes

- rAF batching for graph mutations prevents forced reflows during rapid node updates.
- TTS error handling now surfaces actual error messages instead of `[object Object]`.
- Node type taxonomy: Idea, Decision, Task, Constraint with color-coded categories.
- Modal waveform visualizer renders via `onAnalyser` callback.

### Release Tooling & Governance

- Hook toggle UI in Console Settings panel with enable/disable controls.
- Release gate now validates backlog duplicates, version summaries, and help doc markers.
- Governance doc storage consolidated to `.failsafe/governance/` with `/qor-organize` Phase 6 compliance checking.

### Voice-Brainstorm Status

Implemented. Console Mindmap tab supports mic capture, STT/TTS roundtrip, transcript-to-graph extraction, and confidence-based node coloring. Requires vendored Whisper/Piper runtime assets.

### Under the Hood

- Socket.dev compliance: deprecated API removal and post-build pattern sanitization for clean scan scores.
- Circular dependency between SkillRegistry and SkillDiscovery eliminated.
- Operator help docs (`COMPONENT_HELP.md`, `PROCESS_GUIDE.md`) updated to v4.6.0.

> **We'd love your review!** If FailSafe is useful to you, please leave a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe) or [Open VSX](https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe). Your feedback helps other developers discover FailSafe and directly shapes its roadmap. Bug reports and feature requests welcome on [GitHub Issues](https://github.com/MythologIQ/FailSafe/issues).

## Quick Start

1. Install FailSafe from the VS Code Marketplace or Open VSX.
2. Open a workspace in VS Code or Cursor.
3. Run `FailSafe: Open Command Center (Browser Popout)` or press `Ctrl+Alt+F`.
4. Run `FailSafe: Set Up Agent Governance` to inject governance rules into detected agents.
5. Run `FailSafe: Audit Current File` to generate a governance verdict for the active editor.
6. If you want commit-time guardrails, run `FailSafe: Install Commit Hook` inside a git workspace with `curl` available on the path.

## Bundled Documentation

- `docs/COMPONENT_HELP.md` - every shipped surface, metric group, and governance component in one place
- `docs/PROCESS_GUIDE.md` - setup, audits, commit hooks, provenance, break-glass, replay, rollback, and troubleshooting flows

## Core Commands

| Command                                          | Purpose                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `FailSafe: Open Command Center (Browser Popout)` | Open the main governance console in a browser window                       |
| `FailSafe: Open Command Center (Editor Tab)`     | Open the governance console in an editor tab                               |
| `FailSafe: Audit Current File`                   | Run a manual audit on the active file                                      |
| `FailSafe: Set Governance Mode`                  | Switch between `observe`, `assist`, and `enforce`                          |
| `FailSafe: Set Up Agent Governance`              | Detect supported agents and inject governance rules                        |
| `FailSafe: Install Commit Hook`                  | Add the authenticated pre-commit governance hook to the current repository |
| `FailSafe: Remove Commit Hook`                   | Remove the FailSafe pre-commit governance hook and token file              |
| `FailSafe: Activate Break-Glass Override`        | Start a time-limited emergency override                                    |
| `FailSafe: Replay Verdict (Audit)`               | Re-run a prior governance decision for comparison                          |
| `FailSafe: Revert to Checkpoint (Time-Travel)`   | Restore a recorded governance checkpoint                                   |

## What FailSafe Does

FailSafe separates system awareness from system control.

The Monitor provides real-time visibility into system health, governance posture, and operational risk. The Command Center is the primary control surface for planning, audits, checkpoints, and agent governance.

- Save-time intent gate that can block writes outside an active intent
- Sentinel daemon for file-change audits in `heuristic`, `llm-assisted`, and `hybrid` modes
- SOA ledger with local audit history and checkpoint summaries
- MCP server support for external tools that need audit and ledger hooks

## QorLogic: The Governance Layer

QorLogic is the deterministic governance engine that enforces safety policies at the editor boundary. It operates on a fundamental principle: **governance decisions are made by code, not by asking an LLM to follow rules.**

### Prompt Guidelines vs. Deterministic Governance

| Aspect             | Prompt-Based Safety                     | QorLogic Deterministic Governance   |
| ------------------ | --------------------------------------- | ------------------------------------ |
| **Decision Maker** | LLM interprets rules                    | TypeScript code executes rules       |
| **Consistency**    | Varies with context, temperature, model | Identical output for identical input |
| **Auditability**   | Opaque reasoning chain                  | Explicit code path, logged decisions |
| **Bypass Risk**    | LLM can ignore or reinterpret           | Code cannot be persuaded             |
| **Speed**          | Network latency + inference             | Sub-millisecond local execution      |

### How QorLogic Works

1. **Risk Classification** — Files are classified as L1 (low), L2 (medium), or L3 (high) risk based on:
   - File path triggers (e.g., `auth/`, `payment/`, `credential` → L3)
   - Content triggers (e.g., `DROP TABLE`, `api_key`, `private_key` → L3)
   - Configurable via `.failsafe/config/policies/risk_grading.json`

2. **Policy Evaluation** — Each risk grade has deterministic requirements:
   - **L1**: Heuristic check, 10% sampling, auto-approve
   - **L2**: Full Sentinel pass, no auto-approve
   - **L3**: Formal verification + human approval required

3. **Ledger Recording** — Every governance decision is recorded to an append-only SOA ledger with:
   - Agent identity and trust score
   - Artifact path and risk grade
   - Timestamp and decision rationale

4. **Trust Dynamics** — Agent trust scores evolve based on outcomes:
   - Approved L3 actions → trust increase
   - Rejected or failed actions → trust decrease
   - Trust scores influence future routing decisions

### Why Deterministic Matters

When an LLM is asked to enforce safety rules, it can:

- Reinterpret rules based on context
- Produce inconsistent decisions across similar inputs
- Be influenced by prompt engineering attacks

QorLogic avoids these risks by executing deterministic TypeScript code at the governance boundary. The policy engine uses simple string matching and path analysis—no LLM inference required for governance decisions.

**Example**: A file containing `api_key` will always trigger L3 classification. No prompt can persuade the code to ignore this trigger.

## Safety Alert

```
FailSafe Blocked: AXIOM 1 VIOLATION: No active Intent exists.
Remediation: Create an Intent before modifying files.

[Create Intent] [View Active Intent]
```

## Features

### 1. Governance Modes

FailSafe now supports three governance modes to match your workflow needs:

| Mode        | Behavior                                                           | Best For                         |
| ----------- | ------------------------------------------------------------------ | -------------------------------- |
| **Observe** | No blocking, just visibility and logging. Zero friction.           | New users, exploration, learning |
| **Assist**  | Smart defaults, auto-intent creation, gentle prompts. Recommended. | Most development workflows       |
| **Enforce** | Full control, intent-gated saves, L3 approvals.                    | Compliance, regulated industries |

Switch modes via:

- Command: `FailSafe: Set Governance Mode`
- Settings: `failsafe.governance.mode`

### 2. Save-Time Governance Gate

FailSafe evaluates save operations against the active Intent and can block writes when no active Intent exists or when a file is out of scope.

### 3. Sentinel Monitoring and Audits

- File watcher queues audits for code changes
- Manual audits via command
- Modes: `heuristic`, `llm-assisted`, `hybrid` (LLM uses the configured endpoint)

### 4. SOA Ledger and L3 Queue

- Append-only ledger database for audit entries
- L3 approvals surfaced in the UI

### 5. UI Screens

- FailSafe Monitor (compact view)
- FailSafe Command Center (extended popout/editor view)
- Skills view now includes `Recommended`, `All Relevant`, `All Installed`, and `Other Available` to keep full skill visibility.

### FailSafe Monitor UI

![FailSafe Monitor UI](https://raw.githubusercontent.com/MythologIQ/FailSafe/main/FailSafe/extension/media/FailSafe-Sidebar.PNG)

### 6. Command Center UX

- Compact `FailSafe Monitor` webpanel (`UI-02`) provides phase status, prioritized feature counters, Sentinel state, and workspace health at-a-glance.
- `Open FailSafe Command Center` opens the extended popout console for deeper workflow views (Overview, Operations, Audit, Risks, Skills, Laws, Mindmap, Config).
- Branding is consistent across shell surfaces, including FailSafe icon usage in header and favicon contexts.
- Optional external Qore runtime integration can display live runtime state, policy version, endpoint, and latency in the compact monitor.

### UI Positioning Model

- Monitor and Command Center roles are defined in the Solution summary above; this model maps those roles to FailSafe architecture.
- Narrative alignment:
  - `Genesis` -> Build
  - `QorLogic` -> Govern
  - `Sentinel` -> Watch
  - `Command Center` -> Build + Govern
  - `Monitor` -> Watch

### 7. Skill Governance and Provenance

- Installed skills are discovered from FailSafe workspace roots (`FailSafe/VSCode/skills`, `.agent/skills`, `.github/skills`) with project-first precedence.
- Phase-aware relevance ranking returns `recommended`, `allRelevant`, and `otherAvailable` groupings.
- Skill metadata includes provenance fields (creator, source repo/path, source type/priority, admission state, trust tier, version pin).
- `SOURCE.yml` metadata is ingested to preserve attribution and authorship for bundled and imported skills.

### 8. Checkpoint Reliability Backbone

- Checkpoint events are stored in a local SQLite ledger (`failsafe_checkpoints`) with typed events and parent-chain integrity checks.
- Hub APIs expose checkpoint summaries and recent checkpoint history for UI transparency.

### 9. Feedback Capture

- Generate, view, and export feedback snapshots

### 10. QorLogic Propagation

Supported via internal sync flows when enabled by workspace governance configuration.

### 11. Break-Glass Protocol (v4.1.0)

Emergency governance overrides for time-sensitive situations. Activate via `FailSafe: Activate Break-Glass Override` with a justification (min 10 chars) and duration (15–240 minutes). Auto-reverts on expiry. Full audit trail recorded in the SOA ledger.

### 12. Verdict Replay (v4.1.0)

Re-execute past governance decisions for audit verification via `FailSafe: Replay Verdict (Audit)`. Compares current policy hash and artifact hash against the original decision to detect drift.

### 13. Commit Governance (v4.3.0)

- `FailSafe: Install Commit Hook` writes a thin hook client and per-session token into `.git/`.
- The hook calls `GET /api/v1/governance/commit-check` and only enforces the server's `allow` decision.
- If the local API is unreachable or no token is present, the hook fails open by design. This is an operator guardrail, not a hard security boundary.

### 14. AI Provenance Tracking (v4.3.0)

- Save events can emit `PROVENANCE_RECORDED` ledger entries with artifact path, detected agent type, confidence, and active intent.
- Provenance is observational. It does not mutate source files or inject comments.
- History is queryable through the governance API and visible in local ledger data.

### 15. Multi-Agent Governance Fabric (v4.2.0)

FailSafe detects and governs multiple AI coding assistants in your workspace:

- **Runtime Detection** — Identifies Claude CLI, Copilot, Codex CLI, and Agent Teams via terminal and config scanning.
- **Per-Agent Config Injection** — Writes governance rules into each agent's native format (`.github/copilot-instructions.md`, `.kilocode/rules/`, `codex.md`, `.claude/agents/`).
- **Governance Ceremony** — Single command (`FailSafe: Set Up Agent Governance`) to inject or remove governance across all detected agents.
- **Coverage Dashboard** — Console view showing which agents are detected, governed, and compliant.
- **First-Run Onboarding** — Guides new users through multi-agent governance setup on first activation.

### 16. Intent Schema v2 (v4.2.0)

Intents now carry `schemaVersion`, `agentIdentity` (which agent created the intent and via which workflow), and `planId` references. Legacy v1 intents are auto-migrated on read.

## Commands

| Command                                        | Description                                    |
| ---------------------------------------------- | ---------------------------------------------- |
| FailSafe: Open Command Center (Browser Popout) | Main governance popout                         |
| FailSafe: Open Command Center (Browser)        | Browser launch alias                           |
| FailSafe: Open Command Center (Editor Tab)     | Compact monitor in editor                      |
| FailSafe: Token Economics Dashboard            | Open token economics and ROI dashboard         |
| FailSafe: Audit Current File                   | Manual file audit                              |
| FailSafe: Secure Workspace                     | Apply workspace hardening baseline             |
| FailSafe: Panic Stop                           | Stop active monitoring and guard actions       |
| FailSafe: Resume Monitoring                    | Resume Sentinel monitoring                     |
| FailSafe: Set Governance Mode                  | Switch between Observe/Assist/Enforce          |
| FailSafe: Open Project Overview                | Project-level governance summary               |
| FailSafe: Open Risk Register                   | Open the risk tracking panel                   |
| FailSafe: Add Risk                             | Add a new risk entry                           |
| FailSafe: Revert to Checkpoint (Time-Travel)   | Revert workspace to a governance checkpoint    |
| FailSafe: Activate Break-Glass Override        | Emergency time-limited governance bypass       |
| FailSafe: Revoke Break-Glass Override          | Manually revoke an active break-glass session  |
| FailSafe: Replay Verdict (Audit)               | Re-execute a past governance decision          |
| FailSafe: Undo Last Attempt                    | Rollback to a specific checkpoint              |
| FailSafe: Set Up Agent Governance              | Inject governance into detected AI agents      |
| FailSafe: Install Commit Hook                  | Add pre-commit governance hook to current repo |
| FailSafe: Remove Commit Hook                   | Remove FailSafe pre-commit hook and token      |
| FailSafe: Agent Health Status                  | View composite agent health and risk level     |
| FailSafe: Agent Execution Timeline             | Step-by-step agent action timeline             |
| FailSafe: Shadow Genome Debugger               | Browse and debug failure patterns              |
| FailSafe: Agent Run Replay                     | Replay recorded agent execution traces         |

## Configuration

Open Settings and search for `FailSafe`:

| Setting                                           | Default                          | Description                                                        |
| ------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `failsafe.governance.mode`                        | `observe`                        | Governance mode: observe, assist, or enforce                       |
| `failsafe.genesis.livingGraph`                    | `true`                           | Enable Living Graph visualization                                  |
| `failsafe.genesis.cortexOmnibar`                  | `true`                           | Enable Cortex Omnibar                                              |
| `failsafe.genesis.theme`                          | `starry-night`                   | Genesis UI theme                                                   |
| `failsafe.sentinel.enabled`                       | `true`                           | Enable Sentinel monitoring                                         |
| `failsafe.sentinel.mode`                          | `heuristic`                      | Sentinel operating mode                                            |
| `failsafe.sentinel.localModel`                    | `phi3:mini`                      | Ollama model for LLM-assisted mode                                 |
| `failsafe.sentinel.ollamaEndpoint`                | `http://localhost:11434`         | Ollama API endpoint                                                |
| `failsafe.sentinel.ragEnabled`                    | `true`                           | Persist Sentinel observations to local RAG store                   |
| `failsafe.qorelogic.ledgerPath`                   | `.failsafe/ledger/soa_ledger.db` | Ledger database path                                               |
| `failsafe.qorelogic.strictMode`                   | `false`                          | Block on all warnings                                              |
| `failsafe.qorelogic.l3SLA`                        | `120`                            | L3 response SLA (seconds)                                          |
| `failsafe.qorelogic.externalRuntime.enabled`      | `false`                          | Enable external FailSafe-Qore runtime integration in monitor       |
| `failsafe.qorelogic.externalRuntime.baseUrl`      | `http://127.0.0.1:7777`          | Base URL for external FailSafe-Qore runtime API                    |
| `failsafe.qorelogic.externalRuntime.apiKey`       | ``                               | Optional API key used for runtime calls                            |
| `failsafe.qorelogic.externalRuntime.apiKeyEnvVar` | `QORE_API_KEY`                   | Environment variable fallback for runtime API key                  |
| `failsafe.qorelogic.externalRuntime.timeoutMs`    | `4000`                           | Timeout for runtime API calls in milliseconds                      |
| `failsafe.bootstrap.autoInstallGit`               | `true`                           | Auto-install Git (if missing) and initialize repo during bootstrap |
| `failsafe.feedback.outputDir`                     | `.failsafe/feedback`             | Feedback output directory                                          |

If `.failsafe/config/sentinel.yaml` exists, it overrides settings. The initializer seeds it with `mode: hybrid` unless you change it.

Commit-time governance is available through the local FailSafe API on `http://127.0.0.1:7777` when the optional git hook is installed.

## Workspace Files

FailSafe seeds a `.failsafe/` directory in your workspace for configuration, ledger, and feedback output. The primary workspace config is `.failsafe/config/sentinel.yaml`. Optional policy overrides can be placed at:

- `.failsafe/config/policies/risk_grading.json`
- `.failsafe/config/policies/citation_policy.json`

## Privacy

- Heuristic mode runs locally
- LLM-assisted and hybrid modes call the configured endpoint

## Requirements

- VS Code 1.90.0 or later
- Node.js 18+ (for development)
- `curl` (required only if you install the commit hook)
- Ollama (optional, for LLM-assisted mode)

> **We'd love your review!** If FailSafe is useful to you, please leave a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe) or [Open VSX](https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe). Your feedback helps other developers discover FailSafe and directly shapes its roadmap. Bug reports and feature requests welcome on [GitHub Issues](https://github.com/MythologIQ/FailSafe/issues).

## Contributing

Contributions are welcome via GitHub issues and pull requests.

## Terms and Conditions (Beta)

FailSafe is a beta product. It is provided "as is" without warranties of any kind, and may contain bugs, incomplete features, or breaking changes.

By using this software, you acknowledge that it is experimental and agree to use it at your own risk. MythologIQ is not liable for any loss of data, downtime, or other damages arising from use of this beta release.

## License

Apache License 2.0 - See `LICENSE`.

## Links

- GitHub: https://github.com/MythologIQ/FailSafe
- Issues: https://github.com/MythologIQ/FailSafe/issues
- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe
- Open VSX: https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe
- Documentation: FAILSAFE_SPECIFICATION.md

## Publishing

Releases are automated via GitHub Actions. Tag pushes trigger the CI/CD pipeline which builds, tests, and publishes to both VS Code Marketplace and Open VSX.

<!-- CHECKPOINT-DEEP-DIVE:START -->

## UI Snapshot

![FailSafe UI Preview](https://raw.githubusercontent.com/MythologIQ/FailSafe/main/FailSafe/extension/media/FailSafe-Overview.PNG)

## Checkpoint Integrity and Local Memory

FailSafe tracks more than Git state. It records governance checkpoints as signed metadata records, then stores Sentinel observations in a local retrieval store so operators can recover the _what_, _why_, and _how_ of runtime decisions.

### Process Reality

1. Git readiness is enforced at bootstrap (`ensureGitRepositoryReady`), including optional auto-install and `git init` when needed.
2. Governance events are checkpointed into `failsafe_checkpoints` with run/phase/status context and deterministic hashes.
3. Each checkpoint carries `git_hash`, `payload_hash`, `entry_hash`, and `prev_hash` so chain integrity can be recomputed.
4. Hub and API surfaces expose both summary and recent checkpoint records for operational visibility.
5. Sentinel writes local memory records to `.failsafe/rag/sentinel-rag.db` (or JSONL fallback), including `payload_json`, `metadata_json`, and retrieval text.

### Technical Advantages

- Tamper evidence via hash-chained checkpoint records.
- Git-linked governance state for repository-correlated audit trails.
- Local-first memory retention for security and low-latency recall.
- Deterministic fallback paths when SQLite is unavailable.

### Claim-to-Source Map

| Claim                                                                                       | Status      | Source                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v4.3.0` ships commit hook install/remove commands.                                         | implemented | `FailSafe/extension/src/extension/main.ts`, `FailSafe/extension/package.json`                                                                                    |
| `v4.3.0` ships `commit-check` and provenance API routes.                                    | implemented | `FailSafe/extension/src/api/routes/governanceRoutes.ts`                                                                                                          |
| `v4.3.0` exports governance context in release CI.                                          | implemented | `.github/workflows/release.yml`, `tools/export-governance-context.sh`                                                                                            |
| Bundled operator docs ship inside the VSIX.                                                 | implemented | `FailSafe/extension/.vscodeignore`, `FailSafe/extension/docs/COMPONENT_HELP.md`, `FailSafe/extension/docs/PROCESS_GUIDE.md`                                      |
| Checkpoints persist in `failsafe_checkpoints` with typed governance fields.                 | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:1533-1556`                                                                                                      |
| Checkpoint records include hash-chain material (`payload_hash`, `entry_hash`, `prev_hash`). | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:1689-1695`                                                                                                      |
| Each checkpoint captures current Git head/hash context.                                     | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:1647`                                                                                                           |
| Checkpoint history and chain validity are exposed over API.                                 | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:331`                                                                                                            |
| Hub snapshot includes `checkpointSummary` and `recentCheckpoints`.                          | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:742-743`                                                                                                        |
| Sentinel local RAG persists observation payload + metadata + retrieval text.                | implemented | `FailSafe/extension/src/sentinel/SentinelRagStore.ts:60-81`                                                                                                      |
| Sentinel RAG can fall back to JSONL when SQLite is unavailable.                             | implemented | `FailSafe/extension/src/sentinel/SentinelRagStore.ts:85-91`                                                                                                      |
| RAG writes are controlled by `failsafe.sentinel.ragEnabled` (default `true`).               | implemented | `FailSafe/extension/src/sentinel/SentinelDaemon.ts:339-341`                                                                                                      |
| Checkpoint and Sentinel RAG tables are independent (no foreign-key link).                   | **false**   | Confirmed: `failsafe_checkpoints` (ledger DB) and `sentinel_observations` (RAG DB) are in separate databases with no shared keys. `evidenceRefs` is always `[]`. |

<!-- CHECKPOINT-DEEP-DIVE:END -->
