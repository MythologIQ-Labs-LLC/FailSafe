# Open Design observer integration

> **Compatibility warning (2026-10-13):** This adapter was implemented against upstream `nexu-io/open-design@abe72af` and is **not** certified for current upstream `main@1343f374` or published `open-design-v0.24.1`. Current upstream MCP adds brief, project-creation, skill/plugin, authentication, and run-control tools beyond the historical 10-tool matrix. Treat those as **unverified and unavailable** until schema, authority and runtime tests are completed. The interim #481 containment disables `create_artifact`, including previously approved execution; do not represent it as functioning L3-gated creation. See #474 and #481.

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
| `failsafe.integrations.openDesign.mcpEnabled` | `false` | no | At activation, build (not start) the MCP client from a previously confirmed launch command; with none, nothing is built. Only the register command starts and connects the server. v1.1 exposes read-only tools only. |
| `failsafe.integrations.openDesign.sseEnabled` | `false` | no | Enable per-run SSE attach (`GET /api/runs/<runId>/events`) against the daemon at `127.0.0.1:7456`. When false the SSE client is constructed but never subscribes. |

## Security
Off by default; no network/process unless enabled. **Provenance** detection is pure path-matching (no env / PID / network). The **MCP client** enforces a read/write/destructive allowlist sourced from upstream `mcp.ts` `TOOL_DEFS`: `preCallGate` rejects the 3 destructive tools (`write_file`, `delete_file`, `delete_project`) with `WRITE_TOOL_NOT_ENABLED` **before** the call reaches the transport; `create_artifact` (non-destructive write) is gated **by construction** — a direct call with no pending token throws `WRITE_TOOL_NOT_APPROVED`, and the one-shot token can only be set by `executeApprovedCreateArtifact`, invoked by `OpenDesignL3Executor` after an APPROVED L3 decision (consumed before the transport call). The **MCP launch command** is spawned only after the operator confirms the exact command line and environment; a loopback HTTP response cannot by itself choose what runs, and a workspace's settings cannot inject one. The **daemon probe** (which accepts Open Design 0.24.1's nested `version.version`) and **SSE client** are loopback-only (`http://127.0.0.1:7456`), with discriminated failure modes and capped exponential-backoff reconnect. No secrets are read, stored, or logged.

## Command / wiring
`FailSafe: Register Open Design MCP Connection` (`failsafe.openDesign.registerMcp`) — operator wizard: probes the daemon, fetches the daemon's own MCP launch command from `GET /api/mcp/install-info`, validates it (`OpenDesignLaunchSpec`: absolute command and entry script, env keys limited to `OD_DATA_DIR` / `ELECTRON_RUN_AS_NODE`), checks both runtime paths exist locally, shows the full command line and every env pair in a modal, stores the accepted spec in user-scoped `globalState`, and connects with the extension's global-storage directory as the working directory. A bare `od mcp` is never used: on a Windows desktop install no `od` is on PATH, and Git Bash resolves `od` to coreutils' octal-dump. Provenance detection is wired via `OpenDesignProvenanceDetector` registered with the agent-run recorder in `bootstrapSentinel` when `openDesign.enabled` is true. The L3-gated `create_artifact` write routes through `POST /api/actions/open-design-create-artifact` and is executed by `OpenDesignL3Executor` on the `qorelogic.l3Decided` event.

## Files
- `provenance.ts` — pure `extractOpenDesignProvenance` (`.od/artifacts/<projectId>/` path match, POSIX + Windows).
- `OpenDesignProvenanceDetector.ts` — `IAgentProvenanceDetector` wrapper over the pure extractor.
- `OpenDesignMcpClient.ts` — `extends McpClientHost`; read-only `preCallGate` allowlist, runtime guard, and the B-OD-8 one-shot-token `create_artifact` gate.
- `OpenDesignMcpAllowlist.ts` — static tool classification (read-only / write / destructive / L3-gated), back-cited to upstream `mcp.ts` lines; `OPEN_DESIGN_CREATE_ARTIFACT_KIND`.
- `OpenDesignL3Executor.ts` — buffers create_artifact, executes on APPROVED L3, anchors a `USER_OVERRIDE` ledger entry.
- `OpenDesignDaemonProbe.ts` — TTL-cached `GET /api/version` liveness probe (discriminated failures; accepts top-level or nested version).
- `OpenDesignLaunchSpec.ts` — parses and validates the daemon's `GET /api/mcp/install-info` launch spec; renders the consent command line.
- `OpenDesignSseClient.ts` — per-run SSE subscribe (`GET /api/runs/<runId>/events`) with typed events + backoff reconnect.
- `contracts/sse-chat.ts` — vendored Open Design SSE chat-event types + `isChatSseEvent` guard (Apache-2.0, see `contracts/NOTICE.md`).
- `index.ts` — barrel exports.
- tests: `src/test/integrations/open-design/` (provenance, McpClient, McpAllowlist, L3Executor, DaemonProbe, SseClient, contracts)

## Current upstream released read-tool contract (source inspected 2026-10-13)

**Baseline:** [Open Design v0.24.1 MCP source](https://github.com/nexu-io/open-design/blob/open-design-v0.24.1/apps/daemon/src/mcp.ts). The seven historically permitted names still exist in that release, but source compatibility is **not runtime certification**:

| Tool | Released argument/result behavior to validate locally |
|---|---|
| `list_projects` | Optional `pluginWorkflowId`; lists projects; no project argument |
| `get_active_context` | Optional `pluginWorkflowId`; can return `active:false`, not a hard failure; context expires after roughly 5 minutes |
| `get_artifact` | `project`, `entry`, `include` (`auto/all/shallow`), `maxBytes`, optional workflow identifier; 200-file cap and truncation must be surfaced |
| `get_project` | `project` selector; metadata can include `previewUrl`, resolved directory and project kind |
| `get_file` | `project`, `path`, `offset`, `limit`; text only, windowed output with paging markers |
| `search_files` | Required `query`, optional `project`, `pattern`, `max`; literal case-insensitive search |
| `list_files` | Optional `project` and `since` (Unix milliseconds); file metadata can include manifests |

A read-only name is not proof that arbitrary arguments are safe or that the current daemon honors historical response assumptions. Negative-test wrong types, unknown properties, missing required arguments, daemon-down, stale active context, error envelopes, truncated output and large responses. Treat unknown current or future tool names as unavailable until deliberately approved. Verify runtime capability discovery against the *installed* version, not just GitHub `main`.

**Scope note:** Upstream `main@1343f374` and released v0.24.1 both advertise more MCP names than the historical contract. `list_skills`, formerly documented as absent, is now real upstream but remains intentionally blocked in this FailSafe adapter. Source differences beyond the seven historical read operations and complete endpoint/SSE shape still require local contract evidence.

## Verified surface
- MCP tools (upstream `nexu-io/open-design@abe72af` `apps/daemon/src/mcp.ts` `TOOL_DEFS`): read-only `list_projects`, `get_active_context`, `get_artifact`, `get_project`, `get_file`, `search_files`, `list_files`; write `create_artifact` (non-destructive), `write_file` / `delete_file` / `delete_project` (destructive). v1-fabricated names (`list_skills`, `get_skill`, `list_design_systems`, `get_design_system`, `update_artifact`, `read_file`, `get_active_project`) are deliberately excluded.
- Daemon HTTP: `GET http://127.0.0.1:7456/api/version` (liveness), `GET http://127.0.0.1:7456/api/runs/<runId>/events` (per-run SSE).
- Provenance artifact path: `.od/artifacts/<projectId>/`.
- SSE wire contracts vendored from upstream `packages/contracts/src/sse/` (`ChatSseEvent`, `SseErrorPayload`).
