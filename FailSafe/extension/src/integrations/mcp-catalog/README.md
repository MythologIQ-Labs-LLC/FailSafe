# MCP Catalog integration

> One-line: FailSafe offers a curated catalog of installable MCP servers and writes the chosen one into the workspace `.mcp.json` only after showing its local risk score and getting explicit operator confirmation.

- **Pattern:** mcp / installer
- **Direction:** governed execution (risk-rated config write to `.mcp.json`)
- **Status:** shipped (#108 scorer; B-INT-13 / B-INT-14 / B-INT-15 entries)
- **Official docs:** Context7 — https://github.com/upstash/context7 · Mermaid (mcp-mermaid) — https://github.com/hustcc/mcp-mermaid · Playwright MCP — https://github.com/microsoft/playwright-mcp
- **Backlog:** #108 (B-INT-13 Context7, B-INT-14 Mermaid Chart, B-INT-15 Playwright)

## What it does
Ships a hand-curated catalog of standard MCP servers (Context7, Mermaid Chart, Playwright) whose governance value is registering them into the workspace MCP config *through* FailSafe rather than by hand. Each entry carries the `McpServerMeta` consumed by the #108 risk scorer, so admission is risk-rated: a high-capability server (Playwright — browser automation plus arbitrary in-page JS via `browser_evaluate`) is surfaced as `high` risk before install. The merge into `.mcp.json` is pure and idempotent — re-installing updates the same key under `mcpServers` rather than duplicating.

## Configuration
This integration has no settings. The catalog is curated in source; install runs only on explicit command invocation and only after modal confirmation. Install commands are verified, not fabricated (see `docs/INTEGRATIONS.md`).

## Security
No auth and no secrets handled by this integration — Context7's optional `--api-key` (rate-limit raise) is noted to the operator but never stored or written by FailSafe. The pure logic (`mcp-catalog.ts`, `mcp-installer.ts`) does no fs/network; the only write is the command layer appending one entry to `.mcp.json`, and that write requires per-action modal confirmation (no silent install, per the no-ship rule). Before confirming, the operator sees the exact `command args` to be written plus the full risk assessment and signals. Playwright is explicitly flagged `high` with its safe-flag guidance (`--isolated` + `--headless`, opt into powers only via `--caps`, never `--no-sandbox` with untrusted content); Microsoft states Playwright MCP is not a security boundary.

## Command / wiring
`FailSafe: Install MCP Integration (governed)` (`failsafe.mcp.installCatalog`) — shows each catalog entry with its `risk: <level> (score N)`, and on selection presents a modal with the exact `.mcp.json` write and risk signals; only on `Install` does it merge via `mergeMcpConfig` and write the file. Registered by `registerMcpInstallCommand` in `src/extension/mcp-install-command.ts`.

## Files
- `mcp-catalog.ts` — pure logic: `MCP_CATALOG` (curated entries) + `assessCatalog(now)` pairing each entry with its #108 `McpRiskAssessment`
- `mcp-installer.ts` — pure logic: `buildMcpServerEntry(entry)` + idempotent `mergeMcpConfig(existingText, entry)` → merged `.mcp.json` text + `added` flag
- command wiring: `src/extension/mcp-install-command.ts`
- test: `src/test/integrations/mcp-catalog/mcp-catalog.test.ts`
- depends on: `../mcp-registry/mcp-risk-score` (`scoreMcpServer`)

## Verified surface
Catalog install commands and tool names, back-cited to each upstream repo (links above):

- `.mcp.json` `mcpServers` object — cross-host MCP server config convention
- **Context7** — `npx -y @upstash/context7-mcp` (stdio); tools `resolve-library-id`, `query-docs`; optional `--api-key`
- **Mermaid Chart** — `npx -y mcp-mermaid` (stdio); tool `validate_and_render_mermaid_diagram`
- **Playwright** — `npx -y @playwright/mcp@latest` (stdio); tools `browser_navigate`, `browser_click`, `browser_type`, `browser_evaluate`, `browser_file_upload`, `browser_network_requests`, `browser_take_screenshot`; flags `--isolated`, `--headless`, `--caps`, `--no-sandbox`
