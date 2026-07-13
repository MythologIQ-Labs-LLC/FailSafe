# FailSafe × VS Code Agents Window — Phase 0 Compatibility Snapshot

> **Snapshot as of VS Code 1.128, observed 2026-07-13.** The Agents window is an upstream **PREVIEW** feature ("The Agents window is currently in preview" — https://code.visualstudio.com/docs/agents/agents-window, observed 2026-07-13) on a roughly weekly stable cadence (1.123→1.128 shipped 2026-06-03→2026-07-08). **This document goes stale fast.** Re-run the #83 upstream revalidation when ANY trigger fires:
> 1. The docs page drops the preview banner.
> 2. microsoft/vscode#318103 (extension-dev/debug path) leaves the Backlog milestone.
> 3. Any `agentsWindow*` proposed API finalizes.
>
> **Nothing in this document claims validated compatibility.** Every matrix row below carries validation state `unverified`. FailSafe has NOT been tested inside the Agents window; the expected-status column is a FailSafe-side engineering expectation derived from in-repo surface analysis (META_LEDGER Entries #457/#466), not an upstream guarantee.

## 1. What it is / how to open

The Agents window is VS Code's agent-first surface for managing Copilot CLI, Copilot Cloud, and Claude agent sessions (the currently supported agent types — same docs page, observed 2026-07-13), with worktree isolation, remote sessions over the Agent Host Protocol, and a central customizations panel. Open via the Command Palette ("Open Agents Window") or `code --agents`.

## 2. Opting FailSafe in

```jsonc
// User settings (default profile)
"extensions.supportAgentsWindow": {
  "MythologIQ.mythologiq-failsafe": true
}
```

Constraints (both upstream, observed 2026-07-13):
- The extension **must be installed in the default VS Code profile** — the Agents window does not inherit other profiles.
- There is **no `--extensionDevelopmentPath` / debugger path** into the Agents window (microsoft/vscode#318103, OPEN, milestone Backlog). Testing therefore means installing the packaged VSIX in the default profile — which is also how real users run it, so installed-VSIX evidence is representative when the matrix is eventually validated.

## 3. Compatibility matrix (ALL rows unverified)

| FailSafe surface | In-repo anchor | Expected status | Validation state | Rationale |
|---|---|---|---|---|
| `failsafe.*` command palette commands (~50) | FailSafe/extension/package.json `contributes.commands` | EXPECTED-DURABLE | unverified | Commands are a core contribution class; no upstream signal of exclusion |
| Validation tasks / hooks (SHIELD gates) | tools/ + .github/ + EnforcementEngine surfaces | EXPECTED-DURABLE | unverified | Task/hook execution is workspace-level, not window-chrome-dependent |
| Independently-configured MCP servers (user-level config) | user/workspace MCP config (FailSafe contributes NO extension MCP server definition — Entry #457 DRIFT-1) | EXPECTED-DURABLE | unverified | microsoft/vscode#317460 (extension-contributed MCP unavailable) does not apply to FailSafe; user-configured MCP is upstream's own recommended path |
| `@failsafe` chat participant | package.json:83 (`chatParticipants`), FailSafeChatParticipant.ts:27 | EXPECTED-UNKNOWN | unverified | Chat-participant behavior inside the Agents window is undocumented upstream; no basis to expect either way |
| Sidebar webview (`failsafe.sidebarView`) | package.json:331 (`views` block) | EXPECTED-FRAGILE | unverified | Custom-view class; upstream's June-era docs excluded custom views. That list has since been REMOVED (replaced by "extension support is still evolving"), so this is a FailSafe expectation, not a citable upstream exclusion |
| Status bars (AgentHealthIndicator, GovernanceStatusBar) | AgentHealthIndicator.ts:57; GovernanceStatusBar.ts:23/:25 | EXPECTED-FRAGILE | unverified | Status-bar class; same removed-list caveat as above |

(Expected-status vocabulary: EXPECTED-DURABLE / EXPECTED-FRAGILE / EXPECTED-UNKNOWN. The `unverified` column is the sole verification signal — an EXPECTED-DURABLE row is NOT "more verified" than an EXPECTED-UNKNOWN one.)

## 4. Recommended agent-first SHIELD workflow (under the hold)

Until the surface stabilizes, govern Agents-window sessions through the surfaces expected to survive a narrowed extension host:
- **Commands** for lifecycle actions (audit, substantiate, status).
- **Validation tasks + hooks** as the enforcement seam (SHIELD gates run regardless of window chrome).
- **Independently-configured MCP** for tool access (never rely on extension-contributed MCP definitions — see matrix row 3).
- Do NOT design workflows around the sidebar Command Center or status bars inside the Agents window.

## 5. Worktree isolation impact (present-tense risk)

FailSafe's governance state is single-`workspaceRoot` anchored (Entry #457 F2; anchors observed in-source: VscodeConfigProvider.ts:80/:91 (`.failsafe/`, ledger db), substrate-command.ts:118 (`workspaceFolders?.[0]` → docs/META_LEDGER.md), WorkspaceMutationBus.ts:55 (fs.watch abs path), SentinelDaemon.ts:143 (chokidar on workspaceRoot)). Agents-window **worktree sessions therefore split `.failsafe/`, the META_LEDGER, plans, and audits per worktree** — two sessions produce two divergent governance states. The worktree-aware two-layer ledger is a parked follow-on (Entry #457 R2); until it lands, treat one-repo-one-session as the supported governance topology.

## 6. Upstream blocker record (all observed 2026-07-13)

| # | Blocker | Source | Status |
|---|---|---|---|
| 1 | Agents window still Preview | https://code.visualstudio.com/docs/agents/agents-window | "currently in preview" |
| 2 | Sessions mid-rearchitecture onto AHP | https://code.visualstudio.com/updates/v1_126 | announced 1.126; ongoing |
| 3 | Weekly stable cadence — matrix staleness | https://code.visualstudio.com/updates/v1_123 … /v1_128 | 5 releases touched the surface in 5 weeks |
| 4 | No dev/debug path (`extensionDevelopmentPath`) | https://github.com/microsoft/vscode/issues/318103 | OPEN, milestone Backlog |
| 5 | Extension-contributed MCP unavailable (not FailSafe-blocking; recorded for ecosystem context) | https://github.com/microsoft/vscode/issues/317460 (+ #318689) | OPEN |
| 6 | `agentsWindowConfiguration` / `agentSessionsWorkspace` / `remoteCodingAgents` proposed-only (two are placeholders) | https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.agentsWindowConfiguration.d.ts (+siblings) | proposed; marketplace builds cannot use them |

**Legal next action**: re-run the #83 revalidation (research brief `.failsafe/governance/research-brief-agents-window-83-revalidation-2026-07-13.md`, META_LEDGER Entry #466) when any banner trigger fires; then the build-class cycle (opt-in shipping + validated matrix) can be planned.

## 7. Agent Host Protocol (AHP) — watchlist

AHP is now a public MIT spec (https://github.com/microsoft/agent-host-protocol; Rust/TypeScript/Kotlin/Go/Swift client libraries) and the transport for remote Agents-window sessions. It is a protocol-level governance seam parallel to FailSafe's ACP enforce-proxy: an AHP client could observe/govern agent sessions without ANY Agents-window extension support. Tracked as BACKLOG [B207].

---

_Maintained under GOVERNANCE_INDEX Tier 5. Drift signal: any §6 trigger fires, or the observation date exceeds one VS Code stable cycle without revalidation._
