# MCP Registry scoring integration

> One-line: FailSafe scores an MCP server's registry metadata for risk locally and renders every registry-returned field as inert text, so server discovery is governed before anything is trusted or installed.

- **Pattern:** mcp
- **Direction:** read-only (local risk scoring; no install, no network)
- **Status:** shipped v5.4.x (#108)
- **Official docs:** Model Context Protocol — https://modelcontextprotocol.io · Registry — https://github.com/modelcontextprotocol/registry
- **Backlog:** #108 (B-INT-9)

## What it does
The MCP Registry is a useful read-only discovery surface but a poor v1 install surface. This module is the day-one value: a pure, offline risk scorer over a server's registry metadata (`McpServerMeta`) plus a sanitizer that closes the registry's stored-XSS advisory by rendering every registry field as inert text. `scoreMcpServer` raises weighted signals for an unknown publisher, missing repository link, remote (non-stdio) transport, mutating/exec-capable tool names, and stale/unknown version recency, then rolls them into a `low` / `med` / `high` level. It performs no install and makes no network call — it scores metadata the caller supplies.

## Configuration
This integration has no settings. It is a pure scoring library invoked by other code (notably the MCP Catalog), not a user-facing toggle. The only knobs are function options: `now` (injected clock) and `staleDays` (default `365`).

## Security
No auth and no secrets — scoring runs entirely on in-memory metadata passed by the caller; there is no fs, network, or process access, so it is deterministically testable (`now` is injected). The security posture this module *enforces* is twofold: (1) it flags risky server traits before admission, and (2) `sanitizeField` HTML-escapes `& < > " '` and neutralizes active URI schemes (`javascript:` / `data:` / `vbscript:` → `blocked:`) so a malicious registry string cannot execute when displayed. Nothing is written anywhere.

## Command / wiring
No VS Code command and no notifier. The scorer is consumed as a library: the MCP Catalog's `assessCatalog` calls `scoreMcpServer` to risk-rate each installable entry (see `../mcp-catalog/mcp-catalog.ts`), and the install command surfaces that assessment before any `.mcp.json` write.

## Files
- `mcp-risk-score.ts` — pure logic: `scoreMcpServer(meta, opts)` → `McpRiskAssessment` (`score` / `level` / `signals`) and `sanitizeField(value)` → inert text
- command wiring: none (library, consumed by `mcp-catalog`)
- test: `src/test/integrations/mcp-registry/mcp-risk-score.test.ts`

## Verified surface
Metadata fields scored map to the MCP Registry server schema (links above):

- `name`, `publisher` (verified namespace owner) — `unknown-publisher` signal when absent
- `repositoryUrl` — `missing-repository` signal when absent
- `transports[]` (e.g. `stdio`, `streamable-http`) — `remote-transport` signal for `http` / `https` / `sse` / `streamable-http`
- `tools[]` (`{ name }` or string) — `broad-tool-names` (high) when a name matches mutating/exec verbs (write/delete/exec/shell/eval/spawn/sudo/run-command/kill/chmod/rmdir/unlink)
- `version` + `publishedAt` (ISO date of the cited version) — `stale-version` (> `staleDays`) / `unknown-recency`
