# MCP client host integration

> One-line: reusable MCP-over-stdio **client** lifecycle for the Bicameral and Open Design integrations. Their individual policy wiring determines actual governance coverage; this substrate alone neither governs arbitrary MCP servers nor exposes FailSafe governance tools to third-party clients.

- **Pattern:** mcp
- **Direction:** governed execution (MCP stdio subprocess, lazy connect, idle teardown)
- **Status:** shipped v5.x (substrate promoted at the second MCP client, B-INT-4)
- **Official docs:** Model Context Protocol — https://modelcontextprotocol.io · TypeScript SDK — `@modelcontextprotocol/sdk`
- **Backlog:** B-INT-4

## What it does
This folder is not a standalone integration; it is the **shared substrate** that the Bicameral and Open Design MCP clients extend. `McpClientHost` owns the 95%-shared lifecycle that those two clients previously duplicated: stdio transport spawn, MCP `Client` construction, connect/disconnect, concurrent-connect coalescing, a capability cache populated from `listTools()`, idle disconnect, `transport.onclose` teardown, and a generic `callRaw`. Per-integration governance is injected through three hooks — `preCallGate` (reject a tool before it runs), `postConnectAssertion` (fail-closed teardown after capability fetch), and `runtimeGuard` (reject malformed tool results) — so a subclass contributes only its policy, never its own transport.

## Capability boundaries

- **Shipped substrate:** stdio transport, connection lifecycle, tool listing, and opt-in per-client governance hooks. A hook existing in this library does **not** prove every consumer attaches and retains the correct interceptor.
- **Independent client integrations:** Bicameral and Open Design are the actual consumers. The Bicameral auto-connect/interceptor identity path has an open remediation PR [#555](https://github.com/MythologIQ-Labs-LLC/FailSafe/pull/555); until that change is accepted and tested, do not claim every auto-connected Bicameral call is governed.
- **Not this module:** the `FailSafeMCPServer` under `src/mcp/` registers server-side governance tools but currently has an unreachable extension-host stdio transport ([B209](../../../../../docs/architecture/integrations/failsafe-mcp-server.md)). The MCP catalog can configure selected servers but does not convert this client host into a generic gateway.
- **No Omium adapter:** external outcome-verification integration would be separate, proposed work with its own consent, credential and receipt contract.

## Configuration
This substrate has no settings of its own. Each consuming integration owns its config namespace (`failsafe.integrations.bicameral.*`, `failsafe.integrations.openDesign.*`). The one tunable the host exposes per-subclass is the idle-disconnect TTL.

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `idleDisconnectMs` (constructor option) | `900000` (15 min, `DEFAULT_IDLE_DISCONNECT_MS`) | no | Idle window before the stdio subprocess is gracefully disconnected; `0` disables. Each subclass maps its own setting onto this. |
| `env` (constructor option) | none | no | Extra env vars merged into the spawned subprocess (e.g. `ELECTRON_RUN_AS_NODE`); the SDK transport otherwise restricts inherited env to an allowlist. |

## Security
No network/process is started unless a consuming integration is enabled and connects. The host spawns an MCP server only over **stdio** (`StdioClientTransport`), never a shell. Secrets are never handled here — the substrate only forwards an opt-in `env` map to the child; auth posture is the subclass's concern. `connect()` coalesces concurrent callers onto one spawn and clears the in-flight promise on settle so a failed connect can retry. `postConnectAssertion` runs **after** capability fetch and **fails closed** on throw: the client is closed and all state cleared before re-throwing (Bicameral uses this for its protocol-version floor). `runtimeGuard` runs on every `callRaw` response **before** the `isError` check so `isError` handling can safely read the narrowed shape.

## Command / wiring
No VS Code command and no `package.json` setting. Pure library code: imported by `BicameralMcpClient` and `OpenDesignMcpClient` (both `extends McpClientHost`), which are wired by their own integrations. `IdleScheduler` is also reused directly anywhere an MCP stdio client needs idle teardown.

## Files
- `McpClientHost.ts` — the substrate class: stdio spawn, MCP `Client` lifecycle, capability cache, concurrent-connect coalescing, generic `callRaw`, and the three governance hooks (`preCallGate` / `postConnectAssertion` / `runtimeGuard`). ≤ 220 LoC razor.
- `idle-scheduler.ts` — `IdleScheduler` + `DEFAULT_IDLE_DISCONNECT_MS`; in-flight-counter timer so long-running calls never trigger a spurious disconnect. Single source of truth (consolidated from two prior copies).
- `index.ts` — barrel re-exporting `McpClientHost`, `IdleScheduler`, and their option types.
- tests: `src/test/integrations/mcp/McpClientHost.test.ts`, `src/test/integrations/mcp/idle-scheduler.test.ts`

## Verified surface
- `@modelcontextprotocol/sdk/client/index.js` → `Client`, `client.connect()`, `client.listTools()`, `client.callTool({ name, arguments })`, `client.close()`, `client.getServerVersion()` — MCP TypeScript SDK (https://modelcontextprotocol.io).
- `@modelcontextprotocol/sdk/client/stdio.js` → `StdioClientTransport({ command, args, cwd, env })`, `transport.onclose` — stdio transport (allowlisted inherited env; extra vars passed explicitly).
- Tool-result wire shape `{ content: [{ type, text }], isError }` — MCP `CallToolResult` contract; `isError` drives the host's error mapping.
