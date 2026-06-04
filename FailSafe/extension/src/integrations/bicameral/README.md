# Bicameral MCP integration

> One-line: connects FailSafe to a local Bicameral MCP server so decision-drift, preflight conflicts, and ratification verdicts flow into FailSafe's L3 approval queue and Risk Register — turning Bicameral's decision graph into governed, auditable enforcement events.

- **Pattern:** mcp
- **Direction:** governed execution (MCP stdio subprocess) + read-only upstream poll
- **Status:** shipped v5.1.5
- **Official docs:** Upstream repo `BicameralAI/bicameral-mcp` (see contract review) · MCP — https://modelcontextprotocol.io
- **Backlog:** B-BIC-* cluster, B-INT-2, B-INT-3, B-INT-4

## What it does
FailSafe spawns the Bicameral MCP server over stdio and wraps its tool surface in a typed client built on the shared `McpClientHost` substrate. Drift results are bridged into FailSafe's L3 approval queue (one entry per newly-drifted decision; an L3 verdict auto-ratifies or rejects upstream) and mirrored into the Risk Register. When a tier-3 action is queued for L3, the integration runs `bicameral.preflight` against the target file and attaches drift evidence to the pending approval. A periodic, read-only GitHub poll surfaces upstream release + open-issue counts on the Integrations card. The connection fails closed if the server reports a version below the supported floor.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.bicameral.command` | `bicameral-mcp` | no | Executable launched for the MCP server. Bare name (PATH) or absolute path under home / an extra root; validated at the spawn boundary. |
| `failsafe.integrations.bicameral.extraCommandRoots` | `[]` | no | Extra anchored absolute roots accepted for the command path. Windows chocolatey/scoop roots under `%ProgramData%` are accepted automatically. Relative entries ignored. |
| `failsafe.integrations.bicameral.pipCommand` | `pip` | no | Pip command used by the Integrations-tab installer (e.g. `pip3`, `python -m pip`). |
| `failsafe.integrations.bicameral.autoConnect` | `false` | no | Auto-connect at activation when the workspace is configured. Default off — operator clicks Connect. |
| `failsafe.integrations.bicameral.upstreamPollMs` | `86400000` (24h) | no | Poll interval for the upstream release + open-issue snapshot. |
| `failsafe.integrations.bicameral.upstreamRepoUrl` | `BicameralAI/bicameral-mcp` | no | Owner/repo slug; validated against a strict `owner/repo` pattern (URL injection blocked). |
| `failsafe.integrations.bicameral.idleDisconnectMs` | `900000` (15 min) | no | Idle TTL before the stdio subprocess is gracefully disconnected; next call lazily reconnects. `0` keeps it resident. |

## Security
No process or network unless configured/connected. **Spawn boundary (OWASP A03):** the command is validated both lexically (`isSafeBicameralCommand` — bare names or absolute paths under home / package-manager roots; rejects shell metacharacters, traversal, unanchored relatives) and by resolving symlinks (`isSafeBicameralCommandResolved` — a symlink that escapes the allowed roots is rejected before `spawn`); all spawns are list-form, `shell: false`. The installer pins the upstream range (`bicameral-mcp>=0.14,<0.16`) and sanitizes captured stdout/stderr (strips ANSI CSI + C0 controls, length-capped) before it reaches the UI/WebSocket. **Protocol floor (fail-closed):** `assertBicameralProtocolFloor` reads `getServerVersion()` after capability fetch and tears the connection down if the version is missing or below `MIN_BICAMERAL_VERSION` (0.14.0). The upstream poll is anchored to `https://api.github.com` only, unauthenticated, with a regex-allowlisted slug. No secrets are handled or logged.

## Command / wiring
No standalone VS Code command. Wired in `main.ts` / bootstrap as the Integrations Settings card (Connect / Install) plus three mediators on the event bus: `DriftToL3Mediator` (drift → L3 queue; L3 verdict → auto-ratify/reject), `DriftToRiskMediator` (verdict → Risk Register upsert/close), and `PreflightToL3Mediator` (attaches preflight drift evidence to a pending L3 entry). `UpstreamMonitor` polls upstream counts for the card.

## Files
- `BicameralMcpClient.ts` — `extends McpClientHost`; typed wrappers for v1 + deferred tools, runtime guard, protocol-floor `postConnectAssertion`.
- `install-detector.ts` — pure spawn-boundary validators (`isSafeBicameralCommand` / `…Resolved`), default Windows roots, `probeInstallState` (`<cmd> --version` + `.bicameral/config.yaml` classification).
- `install-handler.ts` — `runBicameralInstall` (pinned pip install + `setup --mode {solo|team}`, list-form spawn), `sanitizeStdoutTail`, version pins.
- `protocol-floor.ts` — `assertBicameralProtocolFloor` (fail-closed version floor).
- `semver.ts` — `compareSemver` for the floor check.
- `DriftToL3Mediator.ts` / `DriftToRiskMediator.ts` / `PreflightToL3Mediator.ts` — event-bus bridges into L3 queue + Risk Register.
- `UpstreamMonitor.ts` / `upstream-row.ts` — read-only GitHub upstream release/issue poll + card row.
- `parsers.ts` / `types.ts` — tool-result parsers + runtime type guards + the integration's type surface.
- `http-fetch-shim.ts` — fetch shim for the upstream poll.
- `index.ts` — barrel exports.
- tests: `src/test/integrations/bicameral/` (client lifecycle, callRaw, connect-race, idle-disconnect, protocol-floor, runtime-guard, deferred-tools, install-detector, install-handler, mediators, UpstreamMonitor, echo-mcp-server harness)

## Verified surface
- MCP tool ids: `bicameral.history`, `bicameral.preflight` (`{ file }`), `bicameral.drift` (`{ file_path }`), `bicameral.ratify` (`{ decision_id, verdict }`), plus deferred `bicameral.ingest`/`search`/`brief`/`judgeGaps`/`resolveCompliance`/`linkCommit`/`update`/`reset`/`dashboard`/`validateSymbols`/`getNeighbors` — wrapped in `BicameralMcpClient`.
- `Client.getServerVersion().version` (MCP SDK) — drives the protocol floor.
- Install: `pip install 'bicameral-mcp>=0.14,<0.16'` then `bicameral-mcp setup --mode {solo|team}`; configured marker `<workspaceRoot>/.bicameral/config.yaml`.
- Upstream poll: `https://api.github.com` REST (unauthenticated; `owner/repo` slug `BicameralAI/bicameral-mcp`).
