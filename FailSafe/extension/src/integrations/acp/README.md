# ACP Governance Adapter

**Pattern:** mcp / JSON-RPC · **Status:** enforce-proxy built (GH #172, PR #177) · **Stage:** standalone MITM proxy — transport + real enforcement verified end-to-end

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

## Enforce-proxy (MITM transport)

The `proxy/` subtree is the standalone governance proxy Devin Desktop (or any ACP host) launches in place of an agent:

```
Devin ⇄ [AgentSideConnection]  acp-proxy  [ClientSideConnection] ⇄ real agent
         client→agent (initialize/prompt/…): transparent relay (AcpProxyAgentHandler)
         agent→client EFFECTS (permission/fs-write/terminal): GOVERNED (AcpProxyClientHandler → AcpProxyGovernor)
```

- **Standalone enforcement.** The proxy runs as a separate process (no VS Code runtime) and reuses the **real `EnforcementEngine`** verbatim through `EngineBackedInterceptor`, behind vscode-free file-backed providers (`backing/`). No duplicated enforcement logic.
- **Mode source.** The extension mirrors `governance.mode` to `.failsafe/governance/runtime-mode.json`; the proxy reads it per-decision. Missing/malformed → `observe` (fail-safe). assist-in-proxy ≈ observe (no operator to auto-create intents).
- **Bundle.** esbuild emits a self-contained `dist/acp-proxy.js` (CJS — keeps transitive `require` deps in the engine path working; the ESM SDK is inlined).
- **Verified end-to-end:** a real `initialize` handshake relays Devin→proxy→agent→proxy→Devin through the bundle; enforce mode blocks an out-of-scope fs-write + denies a dangerous permission; observe/assist record `enforcing=false`.

## Configuration

**No `failsafe.integrations.acp.*` settings ship yet** — the proxy is governed by the workspace governance mode (mirrored as above), not by adapter-specific keys. Registering the proxy entry in Devin's `~/.windsurf/acp/registry.json` (the install UX) is the remaining wiring before one-click activation.

## Security

- **Fail-closed (in the dangerous direction):** malformed, unknown, or oversized intents → `QUARANTINE` **without** reaching the engine. Permission options are validated (kind + non-empty/unique optionId). Payload is size-capped (64 KB).
- **Secret hygiene (ACP-AGENTIC-03):** `fs/write_text_file` content is reduced to a **sha256 digest + byte length** — the file body is never carried in the governance payload.
- **Deny-by-default outcomes:** deny verdicts map to `reject_once`; an ALLOW verdict selects **only** `allow_once` (never auto-`allow_always`, ACP-ADV-07); when an option kind is unavailable → `cancelled` (never falls through to allow).
- **HONEST SCOPE — two limits, stated plainly:**
  1. **Cooperative-path only.** A non-cooperative agent MAY skip `session/request_permission` and act off-channel. Closing that gap requires **FailSafe Pro's** OS-level enforcement.
  2. **Mode-dependent enforcement (ACP-ADV-02 / B3).** Enforcement is gated on the engine's governance mode: in **enforce** the proxy withholds a denied effect; in **observe/assist** it does not block, and the governor records `enforcing=false` on every decision so a non-enforcing grant is **never** silently presented as enforced.
  3. **Effect-existence, not content policy (B2 pending).** Today the engine governs the action's *existence + path/scope/intent* (e.g. an fs-write with no active intent is blocked). Deep *content/argv* policy for `fs/terminal` awaits the engine `ProposedAction` widening — until then payload is recorded for provenance, not policy-matched.

## Command / wiring

**Built (PR #177):** the standalone enforce-proxy (`proxy/` + `proxy/backing/`), the esbuild `dist/acp-proxy.js` entrypoint, the extension-side governance-mode mirror, and the **install UX** — operator commands `failsafe.acp.install/uninstallGovernedProxy` register a FailSafe-governed twin in Devin's `~/.windsurf/acp/registry.json` (`registry/AcpInstall.ts` + `DevinRegistryWriter.buildGovernedTwin` + `extension/bootstrapAcpProxy.ts`). **Remaining (deferred, B-INT-15):** the engine `ProposedAction` widening for deep fs/terminal *content/argv* policy — own governed cycle.

## Files

- `acpTypes.ts` / `acpMapper.ts` / `AcpInterceptor.ts` / `acpPermissionAuthority.ts` — the governable ACP surface + pure mappers (content digested) + fail-closed dispatch + verdict→outcome.
- `proxy/AcpProxyGovernor.ts` — enforce decision + B3 mode-surfacing + B7 ledger.
- `proxy/AcpProxyClientHandler.ts` / `AcpProxyAgentHandler.ts` / `AcpProxyForwarder.ts` — the MITM handlers (govern effects / relay client→agent / terminalId→handle map).
- `proxy/AcpStreamFactory.ts` / `AcpProxyMain.ts` / `AcpProxyArgs.ts` / `AcpProxyEntry.ts` / `acpProxyBootstrap.ts` — transport + entrypoint.
- `proxy/backing/*` — the vscode-free file-backed governance backing (`createWorkspaceAcpBacking` over the real `EnforcementEngine`).

## Verified surface

ACP method/field names are back-cited to `schema.json` (protocol v1). Tests: `src/test/integrations/acp/*.test.ts` (foundation) + `src/test/integrations/acp/proxy/*.test.ts` (48 cases: transport handlers, backing, and **7 end-to-end enforcement proofs** against the real engine) + a live MITM `initialize`-handshake smoke through the bundle.
