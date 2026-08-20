# MCP Registry scoring integration

> One-line: FailSafe scores an MCP server's registry metadata for risk locally, so server discovery is governed before anything is trusted or installed.

- **Pattern:** mcp
- **Direction:** read-only (local risk scoring; no install, no network)
- **Status:** shipped v5.4.x (#108)
- **Official docs:** Model Context Protocol — https://modelcontextprotocol.io · Registry — https://github.com/modelcontextprotocol/registry
- **Backlog:** #108 (B-INT-9)

## What it does
The MCP Registry is a useful read-only discovery surface but a poor v1 install surface. This module is the day-one value: a pure, offline risk scorer over a server's registry metadata (`McpServerMeta`). It also ships `sanitizeField`, written against the registry's stored-XSS advisory — but see **Security** below: it has no production caller today and is not the control protecting the current display path. `scoreMcpServer` raises weighted signals for an unknown publisher, missing repository link, remote (non-stdio) transport, mutating/exec-capable tool names, and stale/unknown version recency, then rolls them into a `low` / `med` / `high` level. It performs no install and makes no network call — it scores metadata the caller supplies.

## Configuration
This integration has no settings. It is a pure scoring library invoked by other code (notably the MCP Catalog), not a user-facing toggle. The only knobs are function options: `now` (injected clock) and `staleDays` (default `365`).

## Security
No auth and no secrets — scoring runs entirely on in-memory metadata passed by the caller; there is no fs, network, or process access, so it is deterministically testable (`now` is injected). Nothing is written anywhere.

What this module *enforces* today is one thing, not two: it flags risky server traits before admission.

`sanitizeField` — which HTML-escapes `& < > " '` and rewrites active URI schemes (`javascript:` / `data:` / `vbscript:` → `blocked:`) — **has no production caller and is therefore not a control in effect.** Do not read its presence as XSS protection. The accurate current posture:

- **No registry is fetched.** Nothing in the extension calls the MCP Registry over the network. The only MCP metadata reaching an operator surface is the static, in-repo `MCP_CATALOG` (`../mcp-catalog/mcp-catalog.ts`), which is not attacker-controlled.
- **The display path escapes at its own sink.** The console Integrations catalog view (`src/roadmap/ui/modules/mcp-catalog-renderer.js`) escapes every interpolated field before it reaches `innerHTML`, and emits no `href` / `src` / URL sink. That escaping — not `sanitizeField` — is what makes the rendered surface inert; `src/test/roadmap/mcp-catalog-renderer-xss.test.ts` holds it to adversarial payloads.
- **Do not wire `sanitizeField` into that renderer.** Both escape, so chaining them double-escapes and shows operators `&amp;lt;`. It is retained for the not-yet-built dynamic-registry path, where a URL sink would need the scheme rewriting a plain HTML escaper does not provide.

## Command / wiring
No VS Code command and no notifier. The scorer is consumed as a library: the MCP Catalog's `assessCatalog` calls `scoreMcpServer` to risk-rate each installable entry (see `../mcp-catalog/mcp-catalog.ts`), and the install command surfaces that assessment before any `.mcp.json` write.

## Files
- `mcp-risk-score.ts` — pure logic: `scoreMcpServer(meta, opts)` → `McpRiskAssessment` (`score` / `level` / `signals`) and `sanitizeField(value)` → inert text (no production caller; see Security)
- command wiring: none (library, consumed by `mcp-catalog`)
- test: `src/test/integrations/mcp-registry/mcp-risk-score.test.ts`

## Verified surface
Metadata fields scored map to the MCP Registry server schema (links above):

- `name`, `publisher` (verified namespace owner) — `unknown-publisher` signal when absent
- `repositoryUrl` — `missing-repository` signal when absent
- `transports[]` (e.g. `stdio`, `streamable-http`) — `remote-transport` signal for `http` / `https` / `sse` / `streamable-http`
- `tools[]` (`{ name }` or string) — `broad-tool-names` (high) when a name matches mutating/exec verbs (write/delete/exec/shell/eval/spawn/sudo/run-command/kill/chmod/rmdir/unlink)
- `version` + `publishedAt` (ISO date of the cited version) — `stale-version` (> `staleDays`) / `unknown-recency`
