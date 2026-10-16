# Agent observe integration (OpenHands + Cline/Roo/Kilo)

> One-line: FailSafe reads agent runs and agent MCP/tool configuration read-only — auditing Cline/Roo/Kilo permission posture for risky settings and, after you confirm, importing an exported OpenHands run as historical timeline evidence — without ever spawning, mutating or intercepting a live agent.

- **Pattern:** observe
- **Direction:** read-only
- **Status:** shipped (#152); the OpenHands import saves signed historical records after you confirm (#477)
- **Official docs:** OpenHands Cloud API — https://docs.openhands.dev/openhands/usage/cloud/cloud-api · OpenHands SDK — https://docs.openhands.dev/sdk/api-reference/openhands.sdk.agent · Cline — https://docs.cline.bot/api/overview · Cline MCP — https://docs.cline.bot/mcp/mcp-overview · Kilo — https://kilo.ai/docs/automate/mcp/using-in-kilo-code · Roo — https://roocodeinc.github.io/Roo-Code/providers/
- **Backlog:** #105 (OpenHands) · #106 (Cline/Roo/Kilo)

## What it does
This family inspects agents without driving them. The MCP policy auditor parses a Cline/Roo/Kilo MCP settings document defensively and flags risky posture — remote MCP servers, wildcard auto-approval, and shell/exec-capable servers — emitting keyed-idempotent risk records that re-audit upserts rather than duplicates. It reads both auto-approve field names the agent variants use (`autoApprove` for Cline, `alwaysAllow` for Roo/Kilo) and redacts all secret material: env values are dropped (only KEYS are kept), URLs are reduced to host, and local commands to basename. The OpenHands observer maps run events — actions and observations — keyed off the SDK `tool_name`, with a per-event risk hint; the command reports how many it mapped and how many look high-risk, and after you confirm it saves them as signed historical records in their own evidence file (see below). It is version-gated and degrades gracefully on an unsupported major. By the OpenHands contract, tools are fixed in the system prompt, so a tool-policy change must start a NEW conversation/fork rather than mutate a live run — this adapter only observes and honors that by construction.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.agentAudit.enabled` | `false` | no | Master on/off for the Cline/Roo/Kilo MCP policy audit. When off, no config is read. |
| `failsafe.integrations.openhands.enabled` | `false` | no | Master on/off for the OpenHands run observer. When off, no events are mapped. |
| `failsafe.integrations.openhands.version` | — | no | OpenHands version string; its major gates observation. An unsupported major degrades gracefully (notice + map nothing). |

Both observers are off by default and read-only toward the agents. The MCP policy audit takes no secret. The OpenHands import keeps one signing key of its own in VS Code Secret Storage (created on the first confirmed import, never written to a file or a setting) to sign the records it saves.

## Security
Neither observer spawns, executes or intercepts an agent, and neither changes an agent's configuration or a live run. What they write is FailSafe's own evidence: the MCP policy audit upserts risk records into the risk register, and the OpenHands import, after you confirm, appends signed records to `.failsafe/logs/openhands-imports.jsonl` and one summary line to the transparency log. The MCP policy auditor is built to leak nothing: env-variable VALUES are dropped (only keys are surfaced), a server `url` is reduced to its host (so URL-embedded tokens never travel), and a local stdio `command` is reduced to its basename (no args). The OpenHands observer reads only the documented event envelope fields and a tool-name verb; it never executes a tool, never mutates an active run, and a tool-policy change is modeled as starting a new conversation (asserted by tests), never an in-place change. The pure logic in this folder takes config/events as text in — the command layer does the file read — so no fs or network lives here.

## Command / wiring
- `FailSafe: Audit Agent MCP Policy (Cline/Roo/Kilo)` (command id `failsafe.agentAudit.run`) — reads the Cline/Roo/Kilo MCP settings document(s), parses + redacts, and upserts the flagged posture risks into the risk register.
- `FailSafe: Import OpenHands Run (observe)` (command id `failsafe.openhands.observe`) — maps an exported OpenHands run's events, version-gated, and asks before saving anything. On approval the events are saved as historical evidence (see below) and shown in the VS Code Agent Timeline and the Console Timeline under "Imported".

## OpenHands historical import (#477)

- **Store.** One record per event in `.failsafe/logs/openhands-imports.jsonl`, written only by the importer under its lock, one write per line plus fsync. The transparency log gets one summary line per import, so a large import does not push live verdicts out of the recent views.
- **What is kept.** Kind, tool name, risk hint, time and the event id, each only when it is a short token (a flattened `action` can be a whole command line and is replaced by `unrecognized`). Nothing is executed.
- **Duplicates.** When the export names its run (a UUID or a token of at least 8 characters in `conversation_id`, `conversationId` or `session_id`, or a UUID or at least 16 hex characters in `id`) and an event carries a string id, the event is keyed by run and id, so re-importing the run, or a longer re-export of it, adds only new events. Otherwise (integer ids, which OpenHands numbers from 0 in every conversation, no id, or no run identity) the event is keyed by the export file's hash and position: re-importing the same file adds nothing, but a different file of the same run imports its events again.
- **Signed for this install.** Every line carries an HMAC-SHA256 under a key kept in VS Code Secret Storage, bound to the workspace folder's path. A line that does not verify (forged, edited, torn, copied from another folder or written under a lost key) is ignored and counted, and is never used to skip a real event. This stops a cloned or copied workspace from supplying evidence; it is not tamper-proofing against the person using this install. Moving the folder, or opening it through a different drive mapping, UNC path or WSL route, leaves earlier records unverified until they are re-imported.
- **Limits.** Exports over 20 MB or with more than 10,000 events, and an export that is not a regular file, are refused before anything is written. Links under `.failsafe` are refused before any folder is created, and the transparency log is refused when it is a link, not a regular file, or hard-linked.
- **Not live enforcement.** This is a record of a past run; FailSafe does not intercept OpenHands.

## Files
- `mcp-policy-audit.ts` — pure Cline/Roo/Kilo MCP config auditor: defensive parse of the shared `mcpServers` shape, reads both `autoApprove` and `alwaysAllow`, redacts env values + URL tokens + command args, and flags remote / wildcard-auto-approve / shell-capable posture as keyed risk records (no fs / no network / no secrets).
- `openhands-observer.ts` — pure OpenHands run observer: maps SDK `ActionEvent`/`ObservationEvent` (object `action`/`observation` + string `tool_name`) into normalized records with a risk hint, version-gates observation, and encodes the tool-policy-change-forks-a-new-conversation contract.
- `openhands-import.ts` — the signed, deduplicated evidence store; `openhands-signing.ts` — the Secret Storage key and per-record HMAC; `openhands-evidence.ts` — the verified, sanitized timeline reader
- command logic: `src/extension/openhands-import-command.ts`
- tests: `src/test/integrations/agent-observe/openhands-import.test.ts`, `openhands-import.extensionHost.test.ts`
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
