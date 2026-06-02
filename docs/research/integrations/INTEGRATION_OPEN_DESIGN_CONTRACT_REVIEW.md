# INTEGRATION — Open Design Contract Review (Issue #95)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`, **with a reconciliation note** — the packet (2026-05-27) predates the shipped Open Design work and its open questions are now largely resolved.

## Disposition

**RESEARCH-FIRST in the packet → SUPERSEDED BY SHIPPED WORK.** The packet flagged a research gate on an architectural fork (daemon-only vs MCP-only vs dual-path) and said to keep v1 to a read-only observer and defer all write surfaces. That decision has since been made and implemented.

### Reconciliation (2026-06-02) — what actually shipped

| Packet open question | Resolution in repo |
|---|---|
| daemon observer vs MCP adapter vs dual-path | **Dual-path.** REST/SSE observer (`OpenDesignSseClient` + `OpenDesignDaemonProbe`, B-OD-2/3) **and** an MCP adapter (B-OD-7) both shipped in **v5.1.1-era / v5.3.x**. |
| "Open Design is not an MCP server" (stale issue assumption) | Corrected — upstream ships `od mcp`; FailSafe consumes it via the B-INT-4 `McpClientHost` abstraction (Open Design is the second MCP client after Bicameral). |
| defer all write surfaces | Superseded — **B-OD-8 (RELEASED v5.3.3, PR #116, META_LEDGER #409)** shipped the first write path: L3-gated `create_artifact` (Buffer & auto-execute). |
| provenance attribution | B-OD-1 shipped v5.3.0 (file-path-based Model 2). |

**Remaining open (forward enhancements, NOT a research gate):** B-OD-9 (AG-UI stream `/api/runs/:id/agui`), B-OD-10 (multi-daemon / configurable discovery for FailSafe-Pro coexistence), B-OD-12 (destructive write-tool tranche `write_file`/`delete_file`/`delete_project` — stricter per-tool L3), B-OD-4/5/11 (upstream PRs, v6).

## Authentication, permissions, secrets

Local-first; no vendor OAuth for basic observation. Daemon binds `127.0.0.1:7456` by default; LAN exposure requires explicit `OD_BIND_HOST`; same-origin via `OD_ALLOWED_ORIGINS`; connector-credential + live-preview routes stay loopback-only. The MCP path grants any registered client read access to local Open Design project files — treat registration like installing a trusted extension. Do not copy/persist upstream provider keys; redact `OD_*` env vars in diagnostics; refuse non-loopback daemon targets unless explicitly enabled.

## Supported surface, lifecycle, failure modes

Daemon owns `/api/*`, per-web-tab sessions, SSE-streamed agent output, artifact store, plugin lifecycle SSE (`/api/plugins/events`). Shared DTOs live in `packages/contracts` (internal repo artifacts, **not** a published versioned API promise — pin a tested version/commit range). Failure modes: reverse-proxy buffering breaking SSE; MCP calls failing with a clear "daemon not reachable" when offline.

## Threat posture & residual gate

Threats: local privileged daemon access, artifact exfiltration via too-broad observation, remote exposure if loopback defaults relaxed. The destructive-write tranche (B-OD-12) is the live risk surface — it must carry stricter per-tool L3 (diff-preview + path-scope confirm for `write_file`; double-confirm for `delete_*`) rather than reusing the `create_artifact` flow. Until shipped, those tools stay rejected at runtime with `WRITE_TOOL_NOT_ENABLED`. Secondary residual: no formal public versioned API contract upstream.

## Implementation checklist

- [x] Pin a tested Open Design version / commit range.
- [x] Loopback-only daemon health probe.
- [x] SSE observer with reconnection + event-shape validation.
- [x] Emit FailSafe transparency receipts from read-only events.
- [x] First write surface (`create_artifact`) under L3 gating — B-OD-8, v5.3.3.
- [ ] Destructive write-tool tranche with stricter per-tool L3 — B-OD-12.
- [ ] AG-UI stream consumption — B-OD-9.
- [ ] Multi-daemon discovery (Pro coexistence) — B-OD-10.

## Issue #95 recommendation

The original research-drift question is resolved and the bulk is shipped/released. At closeout (B-INT-8 task #4), either **close #95** (core integration delivered v5.3.3) and let B-OD-9/10/12 carry the forward work, or relabel #95 to track only the remaining v1.2 enhancements — operator's call.
