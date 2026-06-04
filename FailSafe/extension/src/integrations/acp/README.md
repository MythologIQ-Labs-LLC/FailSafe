# ACP Governance Adapter

**Pattern:** mcp / JSON-RPC · **Status:** in review (GH #172, PR #173) · **Stage:** foundation only — not yet wired to ACP transport

Governs **Agent Client Protocol (ACP)** agents — the open editor↔agent standard used by Devin Desktop (formerly Windsurf), Zed, JetBrains, and 25+ agents — by routing an agent's governable intents through FailSafe's existing enforcement seam. ACP spec: <https://agentclientprotocol.com> · schema: <https://github.com/agentclientprotocol/agent-client-protocol> (`/schema/schema.json`, protocol v1).

> Research: [`<repo-root>/docs/research-brief-acp-governance-2026-06-04.md`](../../../../../docs/research-brief-acp-governance-2026-06-04.md) · Review: [`<repo-root>/docs/review-acp-governance-2026-06-04.md`](../../../../../docs/review-acp-governance-2026-06-04.md)

## What it does

ACP is JSON-RPC 2.0 over stdio between a code-editor **client** and an AI **agent**. FailSafe governs the **agent→client** methods that carry side-effecting intent. Each intent is mapped to a generic `EvaluationRequestContract` action `{kind, target, payload}` and run through an injected `IGovernanceInterceptor` (the `EngineBackedInterceptor` in production) → `ReceiptContract` verdict — the same seam the MCP adapter uses.

| Intent (ACP method) | Mapper | `action.kind` | `target` |
|---|---|---|---|
| tool-call report (`session/update`) | `acpToolCallToAction` | `acp_tool_call` | tool title / id |
| `fs/write_text_file` | `acpFsWriteToAction` | `acp_fs_write` | absolute path |
| `terminal/create` | `acpTerminalCreateToAction` | `acp_terminal_create` | command |
| `session/request_permission` | `acpPermissionToAction` | `acp_permission` | tool title / name |

`acpPermissionAuthority.decidePermission()` is the `session/request_permission` handler's brain: it governs the request and maps the `ReceiptVerdict` to an ACP `RequestPermissionResponse` outcome (`selected{optionId}` / `cancelled`).

## Configuration

**No settings ship yet.** The adapter is pure core; there are no `failsafe.integrations.acp.*` keys, no command palette entries, and no bootstrap wiring. Live ACP transport (stdio + `@agentclientprotocol/sdk`) is a follow-up.

## Security

- **Fail-closed (in the dangerous direction):** malformed, unknown, or oversized intents → `QUARANTINE` **without** reaching the engine. Permission options are validated (kind + non-empty/unique optionId). Payload is size-capped (64 KB).
- **Secret hygiene (ACP-AGENTIC-03):** `fs/write_text_file` content is reduced to a **sha256 digest + byte length** — the file body is never carried in the governance payload.
- **Deny-by-default outcomes:** deny verdicts map to `reject_once`; an ALLOW verdict selects **only** `allow_once` (never auto-`allow_always`, ACP-ADV-07); when an option kind is unavailable → `cancelled` (never falls through to allow).
- **HONEST SCOPE — two limits, stated plainly:**
  1. **Cooperative-path only.** A non-cooperative agent MAY skip `session/request_permission` and act off-channel. Closing that gap requires **FailSafe Pro's** OS-level enforcement.
  2. **Mode-dependent enforcement (ACP-ADV-02).** The ALLOW path reflects the engine's governance mode; under **observe** mode the engine auto-allows by design (telemetry-only). A grant here is only as strong as the engine's mode. Surfacing the effective mode in the receipt is part of the live-transport follow-up.

## Command / wiring

**Not yet wired.** No route, no bootstrap, no transport. The next cycle adds the stdio transport + permission-handler wiring (and the engine `ProposedAction` widening so `terminal/fs` *content/argv* is actually governed — until then command/content policy is **not** enforced, only recorded for provenance).

## Files

- `acpTypes.ts` — the governable ACP surface (schema-verified; defensive on the `toolName`-vs-`toolCall` ambiguity).
- `acpMapper.ts` — pure intent→action mappers (content digested, not carried).
- `AcpInterceptor.ts` — validate + size-cap + dispatch; fail-closed `QUARANTINE`.
- `acpPermissionAuthority.ts` — verdict→ACP-outcome (`governAcpCall` analogue).

## Verified surface

ACP method/field names are back-cited to `schema.json` (protocol v1): `RequestPermissionRequest`/`PermissionOption.kind` (`allow_once|allow_always|reject_once|reject_always`), `RequestPermissionResponse.outcome` (`selected{optionId}|cancelled`), `WriteTextFileRequest{sessionId,path,content}`, `CreateTerminalRequest{sessionId,command,args?,cwd?,env?,outputByteLimit?}`. Tests: `src/test/integrations/acp/*.test.ts` (25 cases).
