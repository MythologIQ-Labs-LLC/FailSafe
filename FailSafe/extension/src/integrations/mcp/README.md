# MCP client host integration

> One-line: shared MCP-over-stdio client substrate — FailSafe governs every external MCP server it talks to through a single lifecycle owner (spawn, capability cache, idle disconnect, fail-closed hooks), so each MCP integration adds only its own gating, not its own transport.

- **Pattern:** mcp
- **Direction:** governed execution (MCP stdio subprocess, lazy connect, idle teardown)
- **Status:** shipped v5.x (substrate promoted at the second MCP client, B-INT-4)
- **Official docs:** Model Context Protocol — https://modelcontextprotocol.io · TypeScript SDK — `@modelcontextprotocol/sdk`
- **Backlog:** B-INT-4

## What it does
This folder is not a standalone integration; it is the **shared substrate** that the Bicameral and Open Design MCP clients extend. `McpClientHost` owns the 95%-shared lifecycle that those two clients previously duplicated: stdio transport spawn, MCP `Client` construction, connect/disconnect, concurrent-connect coalescing, a capability cache populated from `listTools()`, idle disconnect, `transport.onclose` teardown, and a generic `callRaw`. Per-integration governance is injected through three hooks — `preCallGate` (reject a tool before it runs), `postConnectAssertion` (fail-closed teardown after capability fetch), and `runtimeGuard` (reject malformed tool results) — so a subclass contributes only its policy, never its own transport.

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
