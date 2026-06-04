# Agent Governance Toolkit (AGT) installer integration

> One-line: auto-detects the workspace environment and serves the matching, upstream-verified Microsoft AGT governance module installer — so the operator installs the right per-language / per-agent-host package from a one-click card instead of triaging a flat list.

- **Pattern:** installer
- **Direction:** governed install (operator-confirmed; pre-fills a terminal, never auto-runs)
- **Status:** built — PR #140, held unmerged (publish gated on the in-repo SRE dashboards)
- **Official docs:** https://github.com/microsoft/agent-governance-toolkit
- **Backlog:** B-INT-16

## What it does
AGT ships per-environment governance **modules**, not one package: language SDKs (Python / TypeScript / .NET / Rust / Go) plus agent-host plugins (Claude Code / Copilot CLI / OpenCode / Antigravity CLI). This integration holds a curated, verified catalog of those installers and a pure environment detector. The Integrations tab reads the catalog, highlights the modules whose workspace markers are present (e.g. `Cargo.toml` → Rust), and lets the operator run the correct install command in an integrated terminal. The value is grounding: every command is back-cited to the upstream repo / live registries, and known upstream quirks are encoded (the Rust crate is `agentmesh`, not the stale README name; Go has no tagged release; Claude Code installs via in-app slash commands, so it is copy-only).

## Configuration
This integration has **no `package.json` settings** of its own and no secrets. It is reached entirely through the Integrations tab (ConsoleServer route). Behaviour is driven by the static `AGT_MODULES` catalog and live workspace-root detection.

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| _(none)_ | — | — | Catalog + detection are static/derived; no user config, no stored credentials. |

## Security
No network or process runs without an explicit operator action. The install command is **pre-filled into an integrated terminal and NOT auto-executed** — the operator presses enter (`runInTerminal` sends the text with `addNewLine = false`). Copy-only modules (Claude Code slash commands, `runnable: false`) are refused at the action endpoint (400) so they are copied, never spawned. `detectEnvironment` is pure (no fs/vscode/network) and reads only workspace-root filenames. AGT is upstream Public Preview; that advisory is surfaced once in the UI header via `agtPreviewNotice()`. No secrets are read, stored, or logged.

## Command / wiring
No VS Code command. Wired through the Console Server `AgtRoute` (Integrations tab):
- `GET /api/v1/agt/modules` — returns the catalog plus the detected workspace environment ids.
- `POST /api/actions/agt-install { id }` — pre-fills the verified install command for `id` in an integrated terminal (operator confirms); 400 for copy-only modules, 503 when the terminal bridge is unwired.

## Files
- `agt-catalog.ts` — pure logic: the verified `AGT_MODULES` catalog (id / env / kind / `detect` markers / `command` / `registry` / `runnable` / `status` / `note`), `detectEnvironment(rootEntries)` (filename-equality + extension-suffix matching, language modules only), and `agtPreviewNotice()`.
- route: `src/roadmap/routes/AgtRoute.ts` — serves the catalog + detection and the operator-confirmed install action.
- test: `src/test/integrations/agt/agt-catalog.test.ts`

## Verified surface
All install commands verified against `microsoft/agent-governance-toolkit` + live registries (2026-06-03):
- TypeScript — `npm install @microsoft/agent-governance-sdk` (npm).
- Python — `pip install agent-governance-toolkit[full]` (PyPI).
- .NET — `dotnet add package Microsoft.AgentGovernance` (NuGet).
- Rust — `cargo add agentmesh` (crates.io 4.0.0; the standalone MCP crate is `agentmesh-mcp`). The repo README's `agent-governance @ 3.2.2` is stale and deliberately NOT shipped.
- Go — `go get github.com/microsoft/agent-governance-toolkit/agent-governance-golang` (Go modules) — no tagged release upstream → `status: 'source-only'` (pseudo-version snapshot).
- Copilot CLI — `npx @microsoft/agent-governance-copilot-cli install` (npm).
- OpenCode — `npm install @microsoft/agent-governance-opencode` (npm).
- Antigravity CLI — `npm install -g @microsoft/agent-governance-antigravity-cli && agt-antigravity install` (npm).
- Claude Code — `/plugin marketplace add microsoft/agent-governance-toolkit` + `/plugin install agt-governance@agent-governance-toolkit` (Claude plugin marketplace) — `runnable: false`, copy-only (run inside Claude Code, not a terminal).
