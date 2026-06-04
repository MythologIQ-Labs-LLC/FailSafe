# Agent observe integration (OpenHands + Cline/Roo/Kilo)

> One-line: FailSafe reads agent runs and agent MCP/tool configuration read-only — auditing Cline/Roo/Kilo permission posture for risky settings and mapping OpenHands run events into normalized transparency records — without ever spawning or mutating a live agent.

- **Pattern:** observe
- **Direction:** read-only
- **Status:** in review (#152)
- **Official docs:** OpenHands Cloud API — https://docs.openhands.dev/openhands/usage/cloud/cloud-api · OpenHands SDK — https://docs.openhands.dev/sdk/api-reference/openhands.sdk.agent · Cline — https://docs.cline.bot/api/overview · Cline MCP — https://docs.cline.bot/mcp/mcp-overview · Kilo — https://kilo.ai/docs/automate/mcp/using-in-kilo-code · Roo — https://roocodeinc.github.io/Roo-Code/providers/
- **Backlog:** #105 (OpenHands) · #106 (Cline/Roo/Kilo)

## What it does
This family inspects agents without driving them. The MCP policy auditor parses a Cline/Roo/Kilo MCP settings document defensively and flags risky posture — remote MCP servers, wildcard auto-approval, and shell/exec-capable servers — emitting keyed-idempotent risk records that re-audit upserts rather than duplicates. It reads both auto-approve field names the agent variants use (`autoApprove` for Cline, `alwaysAllow` for Roo/Kilo) and redacts all secret material: env values are dropped (only KEYS are kept), URLs are reduced to host, and local commands to basename. The OpenHands observer maps run events — actions and observations — into normalized FailSafe transparency records keyed off the SDK `tool_name`, with a per-event risk hint. It is version-gated and degrades gracefully on an unsupported major. By the OpenHands contract, tools are fixed in the system prompt, so a tool-policy change must start a NEW conversation/fork rather than mutate a live run — this adapter only observes and honors that by construction.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.agentAudit.enabled` | `false` | no | Master on/off for the Cline/Roo/Kilo MCP policy audit. When off, no config is read. |
| `failsafe.integrations.openhands.enabled` | `false` | no | Master on/off for the OpenHands run observer. When off, no events are mapped. |
| `failsafe.integrations.openhands.version` | — | no | OpenHands version string; its major gates observation. An unsupported major degrades gracefully (notice + map nothing). |

Both observers are off by default and read-only; neither holds a secret of its own.

## Security
Neither observer mutates anything and neither spawns a process. The MCP policy auditor is built to leak nothing: env-variable VALUES are dropped (only keys are surfaced), a server `url` is reduced to its host (so URL-embedded tokens never travel), and a local stdio `command` is reduced to its basename (no args). The OpenHands observer reads only the documented event envelope fields and a tool-name verb; it never executes a tool, never mutates an active run, and a tool-policy change is modeled as starting a new conversation (asserted by tests), never an in-place change. The pure logic in this folder takes config/events as text in — the command layer does the file read — so no fs or network lives here.

## Command / wiring
- `FailSafe: Audit Agent MCP Policy` (command id `failsafe.agentAudit.run`) — reads the Cline/Roo/Kilo MCP settings document(s), parses + redacts, and upserts the flagged posture risks into the risk register.
- `FailSafe: Observe OpenHands Run` (command id `failsafe.openhands.observe`) — maps an exported OpenHands run's events into normalized transparency records, version-gated.

## Files
- `mcp-policy-audit.ts` — pure Cline/Roo/Kilo MCP config auditor: defensive parse of the shared `mcpServers` shape, reads both `autoApprove` and `alwaysAllow`, redacts env values + URL tokens + command args, and flags remote / wildcard-auto-approve / shell-capable posture as keyed risk records (no fs / no network / no secrets).
- `openhands-observer.ts` — pure OpenHands run observer: maps SDK `ActionEvent`/`ObservationEvent` (object `action`/`observation` + string `tool_name`) into normalized records with a risk hint, version-gates observation, and encodes the tool-policy-change-forks-a-new-conversation contract.
- command: `src/extension/agent-observe-command.ts` — VS Code command wiring for `failsafe.agentAudit.run` + `failsafe.openhands.observe`
- test: `src/test/integrations/agent-observe/agent-observe.test.ts`

## Verified surface
Cline / Roo / Kilo MCP config (issue #106):
- `mcpServers` — the shared MCP server map all three variants use
- per-server `command`, `url`, `type`, `env` — read; `command` reduced to basename, `url` to host, `env` to keys-only
- auto-approve field: `autoApprove` (Cline, https://docs.cline.bot/mcp/mcp-overview) and `alwaysAllow` (Roo/Kilo, https://roocodeinc.github.io/Roo-Code/providers/) — both read; `*` treated as wildcard
- remote transport detected via presence of `url` or a `type` of `sse`/`http`/`streamable-http`/`websocket`

OpenHands SDK event schema (issue #105, https://docs.openhands.dev/sdk/api-reference/openhands.sdk.agent):
- base `Event` — `id`, `timestamp`, `source`
- `ActionEvent` — OBJECT `action` + STRING `tool_name`
- `ObservationEvent` — OBJECT `observation` + `tool_name`
- the meaningful verb is taken from `tool_name`; a flattened export with a string `action`/`observation` is also tolerated
- supported majors: `0`, `1` (pre-2.0); an out-of-range major degrades gracefully

CAVEAT (honest limitation): the inner `Action`/`Observation` object's per-tool argument layout was not fully confirmable from the rendered docs (it references the GitHub SDK source). v1 therefore surfaces tool-name + risk hint ONLY and should be validated once against a real exported OpenHands run before relying on per-argument detail.
