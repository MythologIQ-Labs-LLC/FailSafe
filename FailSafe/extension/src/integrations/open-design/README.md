# Open Design observer integration

> One-line: attributes agent file-edits to nexu-io Open Design and connects to its local daemon as a read-only MCP + SSE observer — so design-tool activity is governed and provenance-tagged, with the one non-destructive write tool admitted only through L3 approval.

- **Pattern:** mcp / observe
- **Direction:** read-only (provenance detection, read-only MCP tools, per-run SSE) + a single L3-gated write
- **Status:** shipped v5.x (v1 file-path provenance; v1.1 MCP + SSE + daemon probe; v1.2 L3-gated `create_artifact`, B-OD-8)
- **Official docs:** https://github.com/nexu-io/open-design
- **Backlog:** B-OD-8, B-INT-4

## What it does
Open Design's daemon writes artifacts under `.od/artifacts/<projectId>/`; FailSafe attributes any file-edit landing in that subtree to Open Design provenance (the v1 signal, surfaced as an "Open Design" pill in the Monitor Agents tab — no daemon required). v1.1 adds an MCP client over the daemon's `od mcp` stdio surface (read-only tools only), a per-run SSE subscription against the local daemon, and an HTTP liveness probe. The MCP client is hard-gated: the 3 destructive write tools are rejected at runtime, and the one non-destructive write tool (`create_artifact`) is admitted **only** via an L3-approved one-shot token path, with the operator's decision anchored into META_LEDGER.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.openDesign.enabled` | `false` | no | Tag agent runs whose edits land in `.od/artifacts/<projectId>/` with Open Design provenance (Monitor pill). Loopback-only; works without the daemon. Reload after toggling. |
| `failsafe.integrations.openDesign.mcpEnabled` | `false` | no | Pre-construct the MCP client at activation (vs. lazy on first wizard run). Daemon is NOT auto-probed; the register command runs probe + connect. v1.1 exposes read-only tools only. |
| `failsafe.integrations.openDesign.sseEnabled` | `false` | no | Enable per-run SSE attach (`GET /api/runs/<runId>/events`) against the daemon at `127.0.0.1:7456`. When false the SSE client is constructed but never subscribes. |

## Security
Off by default; no network/process unless enabled. **Provenance** detection is pure path-matching (no env / PID / network). The **MCP client** enforces a read/write/destructive allowlist sourced from upstream `mcp.ts` `TOOL_DEFS`: `preCallGate` rejects the 3 destructive tools (`write_file`, `delete_file`, `delete_project`) with `WRITE_TOOL_NOT_ENABLED` **before** the call reaches the transport; `create_artifact` (non-destructive write) is gated **by construction** — a direct call with no pending token throws `WRITE_TOOL_NOT_APPROVED`, and the one-shot token can only be set by `executeApprovedCreateArtifact`, invoked by `OpenDesignL3Executor` after an APPROVED L3 decision (consumed before the transport call). The **daemon probe** and **SSE client** are loopback-only (`http://127.0.0.1:7456`), with discriminated failure modes and capped exponential-backoff reconnect. No secrets are read, stored, or logged.

## Command / wiring
`FailSafe: Register Open Design MCP Connection` (`failsafe.openDesign.registerMcp`) — operator wizard that runs the daemon probe then connects the MCP client (registered by `bootstrapOpenDesignMcp` when `openDesign.mcpEnabled` is true). Provenance detection is wired via `OpenDesignProvenanceDetector` registered with the agent-run recorder in `bootstrapSentinel` when `openDesign.enabled` is true. The L3-gated `create_artifact` write routes through `POST /api/actions/open-design-create-artifact` and is executed by `OpenDesignL3Executor` on the `qorelogic.l3Decided` event.

## Files
- `provenance.ts` — pure `extractOpenDesignProvenance` (`.od/artifacts/<projectId>/` path match, POSIX + Windows).
- `OpenDesignProvenanceDetector.ts` — `IAgentProvenanceDetector` wrapper over the pure extractor.
- `OpenDesignMcpClient.ts` — `extends McpClientHost`; read-only `preCallGate` allowlist, runtime guard, and the B-OD-8 one-shot-token `create_artifact` gate.
- `OpenDesignMcpAllowlist.ts` — static tool classification (read-only / write / destructive / L3-gated), back-cited to upstream `mcp.ts` lines; `OPEN_DESIGN_CREATE_ARTIFACT_KIND`.
- `OpenDesignL3Executor.ts` — buffers create_artifact, executes on APPROVED L3, anchors a `USER_OVERRIDE` ledger entry.
- `OpenDesignDaemonProbe.ts` — TTL-cached `GET /api/version` liveness probe (discriminated failures).
- `OpenDesignSseClient.ts` — per-run SSE subscribe (`GET /api/runs/<runId>/events`) with typed events + backoff reconnect.
- `contracts/sse-chat.ts` — vendored Open Design SSE chat-event types + `isChatSseEvent` guard (Apache-2.0, see `contracts/NOTICE.md`).
- `index.ts` — barrel exports.
- tests: `src/test/integrations/open-design/` (provenance, McpClient, McpAllowlist, L3Executor, DaemonProbe, SseClient, contracts)

## Verified surface
- MCP tools (upstream `nexu-io/open-design@abe72af` `apps/daemon/src/mcp.ts` `TOOL_DEFS`): read-only `list_projects`, `get_active_context`, `get_artifact`, `get_project`, `get_file`, `search_files`, `list_files`; write `create_artifact` (non-destructive), `write_file` / `delete_file` / `delete_project` (destructive). v1-fabricated names (`list_skills`, `get_skill`, `list_design_systems`, `get_design_system`, `update_artifact`, `read_file`, `get_active_project`) are deliberately excluded.
- Daemon HTTP: `GET http://127.0.0.1:7456/api/version` (liveness), `GET http://127.0.0.1:7456/api/runs/<runId>/events` (per-run SSE).
- Provenance artifact path: `.od/artifacts/<projectId>/`.
- SSE wire contracts vendored from upstream `packages/contracts/src/sse/` (`ChatSseEvent`, `SseErrorPayload`).
