# FailSafe × VS Code Agents Window — Compatibility Snapshot

> **Snapshot as of VS Code 1.134, observed 2026-08-19** (supersedes the 1.128/2026-07-13 snapshot; deep-dive brief at META_LEDGER Entry #517, baselines #457/#466). The Agents window is still an upstream **PREVIEW** feature ("Use the Agents window (Preview)" — https://code.visualstudio.com/docs/agents/run/agents-window, observed 2026-08-19) on a weekly stable cadence. **This document goes stale fast.** Re-run the #83 revalidation when ANY trigger fires:
> 1. The docs page drops the preview banner.
> 2. microsoft/vscode#325827 (extension API for external agent harnesses) or #305332 (AHP customizations) ships.
> 3. microsoft/vscode#317460 (extension-contributed MCP) closes.
>
> **Nothing in this document claims validated compatibility.** Every matrix row carries validation state `unverified`. FailSafe has NOT been tested inside the Agents window; expected-status is a FailSafe-side engineering expectation, not an upstream guarantee.

## 1. What it is / how to open

A dedicated, chat-first VS Code window that works across workspaces and runs/tracks multiple agent sessions in parallel. **Five harness types** (https://code.visualstudio.com/docs/agents/run/agent-harnesses, observed 2026-08-19): **Local** (runs in the extension host, current workspace), **Copilot**, **Claude**, **Codex** (all three on the **Agent Host**), and **Cloud** (remote, GitHub-backed repos). Open via the "Open in Agents" title-bar button, `Chat: Open Agents Window`, `code --agents`, or `https://insiders.vscode.dev/agents`. Since 1.133, `chat.agentHost.allowSignedOutWhenUsable` (experimental) allows signed-out use when Claude/Codex credentials exist (#318578).

**The Agent Host re-architecture (1.129→1.134) is the defining change**: agent sessions run in their own processes speaking the **Agent Host Protocol (AHP)** — state lives in the host, survives window close, renders into multiple windows, and runs remotely over WebSocket (https://code.visualstudio.com/docs/agents/concepts/agent-host). Only the Local harness still runs in the extension host. Third-party harnesses are hardcoded (Claude/Codex); an extension API to register external harnesses is open feature request microsoft/vscode#325827.

## 2. Opting FailSafe in

> **Guided path:** run `FailSafe: Configure VS Code Agents Window Governance` (`failsafe.configureAgentsWindow`, shipped with #83 B+C) — it walks the user-setting opt-in, worktree commit-hook install, and governed `.mcp.json` integration install without writing any user-level setting itself.

```jsonc
// USER settings, default profile. There is NO package.json manifest key —
// enablement is entirely user-side; FailSafe cannot self-opt-in.
"extensions.supportAgentsWindow": {
  "MythologIQ.mythologiq-failsafe": true
}
```

Constraints (upstream, observed 2026-08-19):
- The extension **must be installed in the default VS Code profile** (the Agents window shares the GitHub account, settings, and default profile with the main window).
- Static-content-only extensions activate automatically; everything else needs the per-ID user opt-in. "Extension support is still evolving" is the only official posture; no compatibility list is published and no Agents-window-specific activation events exist.

## 3. Compatibility matrix (ALL rows unverified)

| FailSafe surface | In-repo anchor | Expected status | Validation state | Rationale |
|---|---|---|---|---|
| `failsafe.*` command palette commands (~50) | FailSafe/extension/package.json `contributes.commands` | EXPECTED-DURABLE | unverified | Core contribution class; no upstream exclusion signal. Applies to the window's own extension host — NOT to Agent Host sessions |
| Validation tasks / git hooks (SHIELD gates) | tools/ + .githooks/ + CommitGuard | EXPECTED-DURABLE | unverified | Workspace-level execution; fires in every worktree regardless of harness. NOTE: CommitGuard currently HARD-FAILS in worktrees and its commit-check endpoint does not exist (Entry #517) — Phase A repairs precede reliance |
| Workspace `.mcp.json` / `~/.copilot/mcp-config.json` MCP servers | user/workspace MCP config (FailSafe contributes NO extension MCP definition — Entry #457 DRIFT-1) | EXPECTED-DURABLE | unverified | VS Code forwards MCP config to the Agent Host EXCEPT `${input:}` servers (https://code.visualstudio.com/docs/copilot/customization/mcp-servers); this is the sanctioned channel |
| Extension-registered MCP (`lm.registerMcpServerDefinitionProvider`) | (none shipped) | EXPECTED-BROKEN | unverified | microsoft/vscode#317460 OPEN (assigned, no milestone): extension-contributed MCP does not surface in the Agents window |
| `@failsafe` chat participant + extension chat tools | package.json `chatParticipants`, FailSafeChatParticipant.ts | EXPECTED-BROKEN in Agent Host sessions; EXPECTED-UNKNOWN in Local-harness chats | unverified | Now CITABLE: "extension-provided chat tools are only available in chats in an editor window where the extension is running" — not in Agent Host sessions (Agent Host doc, observed 2026-08-19); Cloud sessions get no VS Code tools at all |
| Sidebar webview (`failsafe.sidebarView`) | package.json `views` block | EXPECTED-FRAGILE | unverified | The window's documented UI is chat/session/changes/terminal/browser — no documented extension view-container surface; no official exclusion list either |
| Status bars (AgentHealthIndicator, GovernanceStatusBar) | AgentHealthIndicator.ts; GovernanceStatusBar.ts | EXPECTED-FRAGILE | unverified | Same undocumented-surface caveat |
| Agent Plugins 1.0 package (`plugin.json` + `skills/` + `mcp.json`) | (not yet shipped; candidate: qor-skills + governance MCP) | EXPECTED-DURABLE | unverified | New portable customization standard (1.133); forward-looking first-class packaging for FailSafe governance content |

(Vocabulary: EXPECTED-DURABLE / EXPECTED-FRAGILE / EXPECTED-BROKEN / EXPECTED-UNKNOWN. `unverified` is the sole verification signal.)

## 4. Governing Agents-window sessions — the durable channels

With agent runtime outside the extension host, extension-host interception cannot see Agent Host sessions. FailSafe's leverage reduces to four workspace-file-shaped channels (deep-dive Entry #517):
1. **The repo itself** — worktree-aware `governanceRoot` (Phase A) so `.failsafe/**`, META_LEDGER, intents, and the runtime-mode mirror resolve to the MAIN checkout from any worktree session.
2. **Git hooks** — the strongest enforcement point under the worktree default of **Bypass Approvals** (VS Code's own approval layer is off in worktree sessions); requires the Phase A CommitGuard repair.
3. **Workspace `.mcp.json`** — governance MCP config the Agent Host forwards.
4. **Agent Plugins 1.0** — a FailSafe plugin package (skills + instructions + MCP) as first-class packaging.
Do NOT design workflows around the sidebar Command Center, status bars, or extension chat tools inside Agent Host sessions.


### 4.x MCP reality check (#83 B, 2026-08-19)

FailSafe's own MCP server (`src/mcp/FailSafeServer.ts`) runs **in-process in the extension host** — there is no standalone spawnable entry, so a workspace `.mcp.json` entry naming FailSafe would be a ghost config the Agent Host cannot launch. Until the standalone governance MCP bridge ships (**BACKLOG [B209]**: a thin stdio-MCP client proxying to the ConsoleServer HTTP API, esbuild-bundled like `dist/acp-proxy.js`), route MCP needs through the governed catalog installer (`FailSafe: Install MCP Integration (governed)`), which writes real, launchable entries.

### 4.y Agent Plugin package — DRAFT (not shipped, no compatibility claim)

Agent Plugins 1.0 (VS Code 1.133) would package FailSafe governance as `failsafe-plugin/`:

```text
failsafe-plugin/
├── plugin.json          # name, version, description
├── skills/              # the qor-logic SHIELD skill corpus (same payload the
│                        #   Install QorLogic Skills machinery deploys today)
└── mcp.json             # BLOCKED on [B209] — no standalone server to declare
```

This section is a design draft only: nothing ships until [B209] gives `mcp.json` something real to point at, and the Agents window remains upstream-preview (no validated-compatibility claims, per this document's standing posture).

## 5. Worktree isolation (present-tense risk, now sharper)

> **#83 Phase A shipped (2026-08-19):** CommitGuard is worktree-correct (hooks in the common `.git/hooks`, token in the per-checkout gitDir), the `commit-check` route exists with the hook's port tracking the live Console server, and `ConfigManager.getGovernanceRoot()` provides the canonical repository root. The split-state threading below (ledger/intents/risks per worktree) remains parked.

Worktree isolation is opt-in per session ("New Worktree" checkbox; Claude and Codex too since 1.130). Worktrees live **sibling to the repo** (`<repo>.worktrees/<name>` — bug-report evidence #325527/#293139, not contract), start from the **committed state** of the base branch (no uncommitted/ignored files; `git.worktreeIncludeFiles` copies named ignored files), and **default to Bypass Approvals**.

Consequences for FailSafe today (full inventory: Entry #517 brief):
- A worktree session gets `docs/META_LEDGER.md` (committed) but **no `.failsafe/`** (gitignored) — governance state splits per worktree; `WorkspaceMutationBus` watchers silently no-op on absent paths.
- `CommitGuard.install()` throws ENOTDIR (`.git` is a file in worktrees).
- The Devin ACP twin registry is single-slot: the last session to install wins, and the proxy then enforces against a foreign worktree's intent/ledger.
- Until Phase A lands, **one-repo-one-session remains the supported governance topology**.

## 6. Upstream record (observed 2026-08-19)

| # | Item | Source | Status |
|---|---|---|---|
| 1 | Agents window still Preview | docs page | "Preview" in title |
| 2 | Agent Host / AHP architecture | 1.129–1.134 release notes + Agent Host doc | SHIPPED (no longer "mid-rearchitecture") |
| 3 | Extension-contributed MCP unavailable | microsoft/vscode#317460 | OPEN, assigned, no milestone |
| 4 | External-harness extension API | microsoft/vscode#325827 | OPEN feature request, no milestone |
| 5 | AHP customizations (per-session .agent.md etc.) | microsoft/vscode#305332 | OPEN, P1 |
| 6 | Dev Containers unsupported in Agents window | microsoft/vscode#315116 | OPEN |
| 7 | Signed-out access (Claude/Codex creds) | 1.133 notes, #318578 | experimental setting |
| 8 | Extension-host topology inside the window; restricted-surface enumeration | — | UNDOCUMENTED upstream (honestly unknown) |

**Legal next action**: Phase A (worktree-aware governanceRoot + CommitGuard/commit-check repair — fixes shipped defects independent of the Agents window), then Phase C (Configure command) and Phase D (human validation of this matrix in a live Agents window). Phases defined in Entry #517.

## 7. Agent Host Protocol (AHP) — shipped architecture, adapter seam

AHP is public (https://github.com/microsoft/agent-host-protocol, MIT; multi-language client libraries) and now THE session transport (local and remote). It is the protocol-level governance seam parallel to FailSafe's ACP enforce-proxy: an AHP client could observe/govern agent sessions without ANY Agents-window extension support — and given the extension-host exclusion (§4), it is likely the only path to *enforcement* (vs file-level governance) for Agent Host sessions. Tracked as BACKLOG [B207]; #325827/#305332 are the API seams to watch.

---

_Maintained under GOVERNANCE_INDEX Tier 5. Drift signal: any §6 trigger fires, or the observation date exceeds one VS Code stable cycle without revalidation._
