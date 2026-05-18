# Third-Party Integrations

FailSafe v5.x ships a small, opinionated set of third-party integrations behind a single Command Center tab (**Integrations**). Each integration is **opt-in**, installed on the operator's own machine, and exposes a typed surface that FailSafe drives — nothing is bundled inside the VSIX.

## Bicameral MCP (v1)

[Bicameral MCP](https://github.com/BicameralAI/bicameral-mcp) maintains a per-workspace ledger of design decisions plus drift detection between those decisions and the code that bound them. When connected, FailSafe surfaces decision history, drifted bindings, and a one-click ratify/reject affordance for each open decision.

### Solo vs Team mode

The Integrations tab offers two install pickers. Both run `pip install bicameral-mcp` on your machine, then `bicameral-mcp setup` with the chosen mode flag. The choice affects only how the resulting `.bicameral/config.yaml` is laid out — there is no per-tier feature gating between the two modes:

| Mode | Picks | Suited for |
|---|---|---|
| **Solo** | `bicameral-mcp setup --mode solo` | Single-author workspaces. Decision ledger lives entirely under `.bicameral/`. |
| **Team** | `bicameral-mcp setup --mode team` | Shared workspaces. Setup expects the operator to commit `.bicameral/` to the repo so teammates inherit the ledger. |

Re-running install/setup against an already-configured workspace is safe: `pip install` is idempotent, and the setup CLI skips files that already exist.

### Supply-chain trust boundary

FailSafe **does not bundle** the Bicameral MCP server. The install action invokes `pip` against the operator's resolved Python interpreter, downloading from PyPI under the operator's credentials. This is a supply-chain trust decision: the operator is responsible for verifying the publisher (`bicameralai`) on PyPI, pinning a version, and reviewing what `bicameral-mcp setup` writes.

The spawn boundary is hardened against argv injection — `isSafeBicameralCommand()` allows only bare executable names matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` or absolute paths under the operator's home tree; everything else is rejected with `not-installed`. Command-line arguments are passed as a literal array, never through a shell.

### v1 surface — four MCP tools

When the operator clicks **Connect**, FailSafe opens an MCP stdio session and calls four tools:

| Tool | Used for | Return shape (parsed) |
|---|---|---|
| `bicameral.history` | List feature-scoped decisions to render in the Integrations tab | `BicameralFeatureBrief[]` |
| `bicameral.preflight` | (Reserved — Phase 2 wiring lands in a follow-up cycle) | `BicameralPreflightResult` |
| `bicameral.drift` | Per-file drift status when a file path is supplied | `BicameralDriftStatus[]` |
| `bicameral.ratify` | Operator confirms or rejects a single decision | void (boolean status implicit in HTTP 200) |

The remaining nine tools (`ingest`, `search`, `brief`, `judge_gaps`, `resolve_compliance`, `link_commit`, `update`, `reset`, `dashboard`, `validate_symbols`, `get_neighbors`) are tracked as follow-ups in `docs/BACKLOG.md` (**B-INT-1**).

### Settings

Three VS Code settings control the integration:

- `failsafe.integrations.bicameral.command` (string, default `"bicameral-mcp"`) — executable to spawn for `--version` probe and MCP stdio session. Must satisfy the spawn-boundary validator described above.
- `failsafe.integrations.bicameral.pipCommand` (string, default `"pip"`) — pip invocation used by the install bridge. Accepts `"pip"`, `"pip3"`, or `"python -m pip"`.
- `failsafe.integrations.bicameral.autoConnect` (boolean, default `false`) — when enabled, FailSafe runs the install-state probe at activation and opens an MCP session in the background if the workspace is already configured. Default off; the operator explicitly clicks **Connect** when ready.

The Settings tab surfaces a Bicameral MCP card with the current install state, version, autoConnect toggle, and a "Re-install / Re-setup…" shortcut that switches to the Integrations tab. The autoConnect flag is also writable from the card (HTTP `POST /api/integrations/bicameral/auto-connect` updates the workspace-scoped setting).

### Route surface

All routes are local-only (gated by `rejectIfRemote`); the Console Server refuses requests originating outside `127.0.0.1`.

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/integrations/bicameral/status` | Install probe (state + version + configPath + autoConnect). Safe to poll. |
| `POST` | `/api/actions/bicameral-install` | Bridge for the install picker. Body `{ mode: "solo" \| "team" }`. Per-step progress broadcast over WS as `bicameral.install.progress` / `bicameral.install.complete`. |
| `POST` | `/api/actions/bicameral-connect` | Opens the MCP stdio session lazily. 503 when the client is not wired. |
| `POST` | `/api/actions/bicameral-disconnect` | Closes the session. 503 / 409 on missing client / not-connected. |
| `POST` | `/api/actions/bicameral-history` | Returns `{ ok, features: BicameralFeatureBrief[] }`. |
| `POST` | `/api/actions/bicameral-drift` | Body `{ filePath: string }`. Returns `{ ok, drift: BicameralDriftStatus[] }`. |
| `POST` | `/api/actions/bicameral-ratify` | Body `{ decisionId: string, verdict: "ratify" \| "reject" }`. |
| `POST` | `/api/integrations/bicameral/auto-connect` | Body `{ enabled: boolean }`. Persists to workspace VS Code settings. |

### License credit

Bicameral MCP is the work of the BicameralAI maintainers and is distributed independently of FailSafe under its own license. See the upstream README for the canonical license terms. FailSafe's wrapper code (client, install detector, install handler, route module, UI cards) is part of the FailSafe extension and ships under the FailSafe license; no Bicameral source is vendored or redistributed.
