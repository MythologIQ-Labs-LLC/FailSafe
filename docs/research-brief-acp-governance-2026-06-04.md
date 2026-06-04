# Research Brief — Governing ACP Agents (Devin Desktop) via FailSafe
**Date**: 2026-06-04 · **Target**: GH #172 · **Scope**: ACP governance adapter foundation

## Executive Summary

Governing Agent Client Protocol (ACP) agents through FailSafe is **feasible**, and the recommended in-protocol integration point is the **`session/request_permission`** hook — an Agent→Client JSON-RPC method whose handler is implemented by the *client* (editor side) and which returns the deciding outcome ([agentclientprotocol.com/protocol/overview](https://agentclientprotocol.com/protocol/overview)). FailSafe's existing governance seam maps onto ACP cleanly: any ACP intent (a tool call, an `fs/write_text_file`, or a permission request) can be shaped into the generic `McpEnvelope` `{name, arguments}` and run through `McpInterceptor.intercept()` → `EnforcementEngine` → `ReceiptContract` with no new enforcement surface for ALLOW/BLOCK/ESCALATE/QUARANTINE (`McpInterceptor.ts:19-128`). The honest caveat: this hook is **advisory on the agent side** — a compliant agent *MAY* request permission, but a malicious or non-cooperative agent can skip it and execute tools itself ([agentclientprotocol.com/protocol/prompt-turn](https://agentclientprotocol.com/protocol/prompt-turn); proven by [github/copilot-cli#845](https://github.com/github/copilot-cli/issues/845)). Therefore the **extension** owns the cooperative-path gate plus launch-time MCP-server vetting (best-effort governance), while **FailSafe Pro's OS-level daemon** is the only layer that closes the off-channel (raw fs/process/network) malicious-agent gap.

---

## 1. ACP governable surface (methods + payloads, with sources)

ACP is **JSON-RPC 2.0 over stdio**, between a code-editor **Client** and an AI **Agent**; the editor spawns the agent as a subprocess and owns the stdio pipe ([protocol/overview](https://agentclientprotocol.com/protocol/overview); [blog.marcnuri.com/agent-client-protocol-acp-introduction](https://blog.marcnuri.com/agent-client-protocol-acp-introduction)). The current MAJOR protocol version is the single integer **`1`**, negotiated in `initialize` ([protocol/initialization](https://agentclientprotocol.com/protocol/initialization)).

> **Citation-hygiene note:** several findings cited `/protocol/v1/<topic>` paths; the canonical live pages resolve at `/protocol/<topic>` (e.g. `/protocol/overview`, `/protocol/tool-calls`). The facts were independently re-confirmed at the canonical paths. Do **not** hardcode a `/protocol/v1/` doc URL.

**Full method set, by direction** ([protocol/overview](https://agentclientprotocol.com/protocol/overview)):

| Direction | Methods |
|---|---|
| Client → Agent | `initialize`, `authenticate`, `session/new`, `session/prompt`, `session/load`, `session/set_mode`, `session/cancel`, `logout` |
| Agent → Client | `session/request_permission`, `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` |
| Notification | `session/update` (agent→client) |

**There is NO literal `tool/call` JSON-RPC method.** Tool execution happens *inside* the agent and is surfaced to the client as `session/update` notifications (`sessionUpdate: "tool_call"` / `"tool_call_update"`) plus `session/request_permission` requests; the actual file/terminal *effects* are delegated back to the client via `fs/*` and `terminal/*` — which is precisely where editor-level governance can enforce ([protocol/tool-calls](https://agentclientprotocol.com/protocol/tool-calls)).

**The governable payloads** (the side-effecting / sensitive intent a governor inspects):

- **`session/prompt`** (client→agent): `{sessionId, prompt: ContentBlock[]}` → `{stopReason}`. ContentBlock types: `text`, `image`, `audio`, `resource`, `resource_link`; stopReason ∈ `end_turn|max_tokens|max_turn_requests|refusal|cancelled` ([protocol/prompt-turn](https://agentclientprotocol.com/protocol/prompt-turn)). *User-input ingress.*
- **Tool-call reporting** via `session/update`: fields `toolCallId`, `title`, `kind`, `status` (`pending|in_progress|completed|failed`), `content`, `locations` (file paths + line numbers), `rawInput` (original tool params), `rawOutput` ([protocol/tool-calls](https://agentclientprotocol.com/protocol/tool-calls)).
- **Tool `kind`** — 9 categories a governor classifies against: `read, edit, delete, move, search, execute, think, fetch, other`. `execute` = run command/code; `edit/delete/move` = mutating fs ops ([protocol/tool-calls](https://agentclientprotocol.com/protocol/tool-calls)).
- **`fs/read_text_file`** (agent→client): `{sessionId, path (absolute), line?, limit?}` → `{content}`. *Governor inspects the absolute path.*
- **`fs/write_text_file`** (agent→client): `{sessionId, path (absolute), content}` → `null`. *Governor inspects path AND content.* Client must advertise fs support in `initialize` ([protocol/file-system](https://agentclientprotocol.com/protocol/file-system)).
- **`terminal/create`** (agent→client): `{sessionId, command, args[], env[{name,value}], cwd?, outputByteLimit?}` → `{terminalId}` (returned immediately). **Highest-value shell-execution interception point** ([protocol/terminals](https://agentclientprotocol.com/protocol/terminals)).
- **`terminal/output|wait_for_exit|kill|release`** on `{sessionId, terminalId}`: `output` returns `{output, truncated, exitStatus?{exitCode,signal}}`; `wait_for_exit` returns `{exitCode, signal}`; `kill` terminates but keeps the terminal valid; `release` frees resources and invalidates the `terminalId` ([protocol/terminals](https://agentclientprotocol.com/protocol/terminals)).

---

## 2. The `session/request_permission` hook — the recommended integration point

**Direction & authority.** `session/request_permission` is an **Agent → Client** method: the **agent calls it**, and the **client implements the handler** and returns the decision. This holds across the spec and both SDKs — TypeScript `Client.requestPermission(params): Promise<RequestPermissionResponse>` and Rust `Client::request_permission(...)` are *required client methods* ([protocol/overview](https://agentclientprotocol.com/protocol/overview); [typescript-sdk AgentSideConnection](https://agentclientprotocol.github.io/typescript-sdk/classes/AgentSideConnection.html); [docs.rs trait.Client](https://docs.rs/agent-client-protocol/latest/agent_client_protocol/trait.Client.html)). **The permission authority lives entirely on the client side.**

**Request shape — `RequestPermissionRequest`** (3 required fields) ([protocol/schema](https://agentclientprotocol.com/protocol/schema)):
- `sessionId` (SessionId)
- `toolCall` (ToolCallUpdate) — the tool call requiring permission; carries the tool-call fields incl. `rawInput`/`locations`
- `options` (`PermissionOption[]`) — each `{optionId, name, kind}` where `kind` ∈ **`allow_once | allow_always | reject_once | reject_always`** ([protocol/tool-calls](https://agentclientprotocol.com/protocol/tool-calls))

**Response shape — `RequestPermissionResponse.outcome`** is a discriminated union with exactly two variants ([protocol/schema](https://agentclientprotocol.com/protocol/schema)):
- `selected` → `{outcome:"selected", optionId}`
- `cancelled` → `{outcome:"cancelled"}` — and on `session/cancel` the client **MUST** respond with `cancelled`.

**This is the seam where a governor forces a decision:** returning `selected` with a reject-kind `optionId` is a deny; returning a permissive `optionId` is an allow.

**Command-level data IS present at the seam.** Real ACP permission requests embed argv/command data in `toolCall.rawInput.command` (e.g. `['/bin/zsh','-lc','printf ... > dummy.txt']`) — confirmed by cross-client prior art [agent-shell#265](https://github.com/xenodium/agent-shell/issues/265) (an Emacs ACP client; same ACP surface, cite as cross-client corroboration, not Zed-canonical).

**Mandatory vs advisory — state this plainly to the operator.** The agent **MAY** request permission ("Before proceeding with execution, the Agent MAY request permission…"); it is **not** required before every sensitive op, and a non-cooperative agent can skip it entirely ([protocol/prompt-turn](https://agentclientprotocol.com/protocol/prompt-turn); [copilot-cli#845](https://github.com/github/copilot-cli/issues/845) documents Copilot CLI auto-approving internally and never sending the request). The wire shape does not force a *human* to originate the outcome — the response is a computed enum — but the spec's recommended UX is "present the options to the user," so a fully-silent FailSafe verdict is schema-valid yet deviates from recommended UX.

> **Refuted/cautioned:** Do **not** assume `allow_always`/`reject_always` are persisted/enforced across turns by the agent. The kinds exist, but the spec does not state they are honored as a persistence guarantee ([protocol/tool-calls](https://agentclientprotocol.com/protocol/tool-calls) — enum present, persistence semantics absent). FailSafe's persisted policy decisions may need to be re-asserted each request.

---

## 3. FailSafe fit (McpInterceptor/EnforcementEngine/ReceiptContract → ACP mapping; the exact adapter seam)

ACP intents flow through FailSafe's existing machinery with a **thin adapter**, because the seam is already generic.

**The universal seam.** `IGovernanceInterceptor` is the single contract-typed entry point: `evaluate(req: EvaluationRequestContract): Promise<ReceiptContract>` (`IGovernanceInterceptor.ts:20-28`). Its impls are `EngineBackedInterceptor` and `McpInterceptor`.

**The generic envelope.** `McpEnvelope` is `{ name: string; arguments?: Record<string, unknown> | null }` (`McpInterceptor.ts:19-22`). Any ACP unit maps onto it trivially: `name` = the ACP method/tool name, `arguments` = the ACP params.

**The reusable adapter.** `McpInterceptor.intercept(envelope)` builds a contract-valid `EvaluationRequestContract` (`action.kind="tool_call"`, `action.target = envelope.name`, `action.payload = args`), AJV-validates against `evaluation_request.json`, then dispatches `this.backing.evaluate(req)` returning a `ReceiptContract` (`McpInterceptor.ts:91-128`). Malformed envelope or validation failure short-circuits to a `QUARANTINE` receipt without invoking the engine (`McpInterceptor.ts:94-109`).

**The verdict enum already covers all outcomes:** `ReceiptVerdict = "ALLOW" | "BLOCK" | "ESCALATE" | "MODIFY" | "QUARANTINE"` (`types.ts:144`).

**The receipt→transport table exists** (HTTP today): `RECEIPT_HTTP_TABLE = { BLOCK:403, ESCALATE:409, MODIFY:409, QUARANTINE:500 }`; `governToolCall` returns `false` on ALLOW and otherwise writes `res.status(...).json({ok:false, error: receipt.verdictRationale, verdict})` (`bicameralRouteShared.ts:143-172`).

**The contract does NOT constrain `action.kind`** — `evaluation_request.json` declares `action.kind` as a free-form string (examples: `file_edit/command_run/tool_call/llm_request`), so ACP kinds pass AJV as-is (`evaluation_request.json:14-20`). The constraint that bites is downstream in TS.

### The three concrete gaps (ALLOW/BLOCK/ESCALATE/QUARANTINE work today; MODIFY does not)

1. **GAP #1 — unsound cast in the mapper.** `evaluationRequestToProposedAction` does `type: req.action.kind as ProposedAction["type"]` (`contractMappers.ts:55`), but `ProposedAction.type` is the file-only union `"file_write" | "file_create" | "file_delete" | "file_rename"` (`IntentTypes.ts:304`). An ACP `tool_call`/`request_permission` kind is forced through by an unsound cast.
2. **GAP #2 — path/Intent-scope-centric engine.** Axiom2 scopes on `action.targetPath`; the mapper defaults a missing target to `""` (`contractMappers.ts:57`). A tool-call or permission request with no file path is effectively **unscoped**.
3. **GAP #3 — MODIFY unreachable via the engine.** The engine `Verdict` union is `AllowVerdict | BlockVerdict | EscalateVerdict` only (`IntentTypes.ts:331`); `verdictToReceipt` branches ALLOW/BLOCK then falls through to ESCALATE with **no MODIFY branch** (`contractMappers.ts:106-117`). MODIFY exists in the receipt contract + HTTP table but cannot be produced by the engine-backed path.

### The exact adapter seam

Build an **`AcpInterceptor`** that mirrors `McpInterceptor`: convert ACP intent → `McpEnvelope` → reuse `intercept()` semantics. It receives its client by **constructor injection** against a minimal structural interface (the same boundary rule as `McpInterceptor`, which forbids importing bicameral modules — `McpInterceptor.ts:5-8,28-30`), so it imports no ACP module. Wire it lazily/optionally, copying the `wireInterceptor` pattern (`bootstrapBicameral.ts:123-135`): `new EngineBackedInterceptor(enforcementEngine, ISSUED_BY)` as backing.

**Design choice to settle:** reusing `McpInterceptor` verbatim stamps every ACP intent as `kind:"tool_call"`, collapsing the fs/permission/tool distinction in the ledger. A sibling `AcpInterceptor` emitting `acp_tool_call` / `acp_fs_write` / `acp_permission` preserves provenance (and `action.kind` is free-form in the contract, so it validates). **Recommendation:** sibling `AcpInterceptor` for ledger fidelity.

---

## 4. Interception topology + extension-vs-FailSafe-Pro boundary + threat model

Three insertion points, sharply different guarantees:

**(a) Be the ACP client's permission authority.** Inject `EnforcementEngine` into the client's `requestPermission` handler and return `selected{optionId}`/`cancelled`. The only **in-protocol** gate a VS Code/Cursor extension can own *without* elevated privilege and *without* a proxy — **but only if FailSafe IS the ACP client or owns/wraps that handler.** Governs the cooperative `fs/*`, `terminal/*`, tool-call callbacks. **Fundamentally advisory:** agent MAY skip `request_permission` and execute tools itself ([protocol/prompt-turn](https://agentclientprotocol.com/protocol/prompt-turn)). Catches honest mistakes + prompt-injected-but-cooperative agents; **misses** deliberate evasion and anything off the ACP channel.

**(b) stdio proxy between client and agent subprocess.** Sees and can rewrite/block **every** JSON-RPC frame (the full method list in §1) — strictly stronger than (a); can deny `fs/write_text_file`/`terminal/create` and force-handle a skipped `request_permission`. **Requires FailSafe to be the agent spawner.** Still **cannot** see the agent's *own* direct fs syscalls, spawned grandchild processes, or network sockets — none traverse the proxied stdio pipe ([protocol/overview](https://agentclientprotocol.com/protocol/overview)).

**(c) Govern `session/new.mcpServers`.** FailSafe **already** does this offline today: `mcp-policy-audit.ts` parses the standard `mcpServers` shape, redacts secrets, and flags remote transport / wildcard auto-approve / shell-capable tools (`integrations/agent-observe/mcp-policy-audit.ts:1`); `mcp-risk-score.ts` is a pure offline scorer flagging remote-transport, mutating/exec tool names, unknown-publisher, stale-version (`integrations/mcp-registry/mcp-risk-score.ts:1`, `:48`). In ACP **the agent connects directly to declared MCP servers — the client does not proxy that traffic** ([protocol/session-setup](https://agentclientprotocol.com/protocol/session-setup)), so (c) is **preventive launch-time vetting** (block/quarantine a bad `session/new`), not a runtime chokepoint.

**Threat model summary:**

| Option | Strength | Bypass surface |
|---|---|---|
| (a) client permission authority | In-process, no proxy, no privilege | Agent skips `request_permission`; off-channel fs/proc/net |
| (b) stdio proxy | Sees/blocks all ACP frames | Agent's own syscalls/grandchildren/network; needs FailSafe to spawn |
| (c) mcpServers vetting | Supply-chain hardening, reuses existing pure scorers | Agent's built-in tools; agent could ignore the declared list |

**Recommended layered topology:** extension owns **(a)+(c)** always, plus **(b)** whenever FailSafe spawns the agent. **FailSafe Pro's OS-level daemon** provides the non-bypassable backstop (process/syscall/network interposition) that closes the malicious-agent off-channel gap none of (a)/(b)/(c) can close in-process — matching the documented product boundary (extension = editor-level governance; Pro = OS-level enforcement; MEMORY.md, Project Structure). **State to the operator plainly:** editor-level = best-effort + supply-chain vetting; Pro = enforcement backstop. (Pro daemon source is gitignored and its exact syscall coverage is unverified here — confirm against `PRIVATE/docs/LICENSING_POSTURE.md`.)

---

## 5. Devin Desktop specifics (launch model; process name for #161; `.windsurf` persistence)

- **Devin Desktop = rebranded Windsurf** (Cognition, announced 2026-06-02). It is an **ACP CLIENT/host** ("Agent Command Center"), **not** an ACP agent: it runs third-party ACP agents inside the host ([docs.devin.ai/desktop/acp](https://docs.devin.ai/desktop/acp); [cognition.ai/blog/introducing-devin-desktop](https://cognition.ai/blog/introducing-devin-desktop)).
- **Launch model:** agents are launched as **command-line subprocesses** defined by a registry config — each platform entry has `cmd` + `args` (e.g. `{"darwin-aarch64": {"archive":"", "cmd":"devin", "args":["acp"]}}` across six platforms `{darwin,linux,windows} × {aarch64,x86_64}`). The **agent binary must already be installed**; the registry only tells Devin Desktop how to launch it ([docs.devin.ai/desktop/acp](https://docs.devin.ai/desktop/acp)).
- **Process/app name (critical for host detection #161):** the executable is now **`Devin`** (was `Windsurf`) — **`Devin.app`** (macOS), **`Devin.exe`** (Windows), **`Devin`/`devin`** (Linux) ([docs.devin.ai/desktop/devin-desktop-faq](https://docs.devin.ai/desktop/devin-desktop-faq)).
- **`.windsurf` persistence (backward-compat fallbacks):** the local ACP registry **still lives at `~/.windsurf/acp/registry.json`** (`~/.windsurf-next/acp/registry.json` for the Next channel) after the rebrand ([docs.devin.ai/desktop/acp](https://docs.devin.ai/desktop/acp)). `.devin/` is the new **preferred** workspace dir with `.windsurf/` as fallback; `.windsurfrules` and `.windsurf/rules/` are still read (`.devin/rules/` takes precedence); legacy `~/.windsurf/extensions/` and `~/.config/Windsurf/` are read-then-write-to-`~/.devin/`-and-`~/.config/Devin/` ([devin-desktop-faq](https://docs.devin.ai/desktop/devin-desktop-faq); [chatforest.com/builders-log/...](https://chatforest.com/builders-log/windsurf-devin-desktop-rebrand-devin-local-acp-builder-guide/)).

**Detection guidance:** watch **both** the new `Devin`/`.devin` namespace AND the retained `.windsurf` namespace; re-verify on Devin Desktop updates (the registry may migrate to `.devin` later). **Disambiguation caution:** the standalone Devin CLI ([cli.devin.ai](https://cli.devin.ai)) **also** uses the `devin` binary with `acp` args — distinguish by process context vs. `~/.config/Devin` presence. Confirm Linux casing (`Devin` vs `devin`, AppImage vs deb) for reliable process-name matching.

---

## 6. Ecosystem, SDKs, roadmap convergence

- **Governance.** ACP originated at **Zed Industries** (Aug 2025), now a vendor-neutral org **`github.com/agentclientprotocol`** (~3,302 stars); broad adoption by June 2026 ([github.com/agentclientprotocol](https://github.com/agentclientprotocol)).
- **Clients (editors):** Zed (native), JetBrains IDE family (IntelliJ/PyCharm/…) ([zed.dev/acp](https://zed.dev/acp); [blog.jetbrains.com/ai/2025/10/...](https://blog.jetbrains.com/ai/2025/10/jetbrains-zed-open-interoperability-for-ai-coding-agents-in-your-ide/)), Devin Desktop, VS Code via third-party ACP-client extensions.
- **Agents (servers):** Gemini CLI (`--experimental-acp`, [geminicli.com/docs/cli/acp-mode](https://geminicli.com/docs/cli/acp-mode/)), Claude (`claude-agent-acp`), Codex (`codex-acp`), Kiro CLI (`kiro-cli acp`, [kiro.dev/docs/cli/acp](https://kiro.dev/docs/cli/acp/)), OpenCode, GitHub Copilot CLI, Qwen, Hermes.
- **Official SDKs:** TypeScript, Rust, Python, Kotlin ([github.com/agentclientprotocol](https://github.com/agentclientprotocol)). **For a VS Code/TS extension:** `@agentclientprotocol/sdk` **v0.24.0, Apache-2.0, ESM** (`type: module`, main `dist/acp.js`), exposing `ClientSideConnection` (clients) and `AgentSideConnection` (agents) ([registry.npmjs.org/@agentclientprotocol/sdk/latest](https://registry.npmjs.org/@agentclientprotocol/sdk/latest); [agentclientprotocol.com/libraries/typescript](https://agentclientprotocol.com/libraries/typescript)).
  > **Refuted:** the "ZERO runtime dependencies" claim is **false** — `@agentclientprotocol/sdk@0.24.0` has a **peer dependency on `zod` (`^3.25.0 || ^4.0.0`)**. Version/license/ESM facts are correct; size the dependency footprint with zod in mind ([registry.npmjs.org/@agentclientprotocol/sdk/latest](https://registry.npmjs.org/@agentclientprotocol/sdk/latest)).
- **Prior art for governance/permission brokering:**
  - **`openclaw/acpx` (MIT)** — headless ACP middleware client between orchestrator and agent: `--approve-all`/`--approve-reads`(default)/`--deny-all`, policy escalation (`{"escalate":["execute"],"defaultAction":"deny"}`), session isolation, soft-close audit trails ([github.com/openclaw/acpx](https://github.com/openclaw/acpx)).
  - **`formulahendry/vscode-acp` (MIT)** — VS Code ACP client with configurable auto-approve policies + full JSON-RPC traffic logging, pre-configured for 11 agents ([github.com/formulahendry/vscode-acp](https://github.com/formulahendry/vscode-acp)).
- **Roadmap convergence (governance-relevant RFDs)** ([agentclientprotocol.com/llms.txt](https://agentclientprotocol.com/llms.txt)):
  - **MCP-over-ACP** (MCP transport via ACP channels) — would route MCP traffic through the client, potentially turning option (c) from preventive vetting into a runtime chokepoint.
  - **Streamable HTTP & WebSocket Transport ([PR #721](https://github.com/agentclientprotocol/agent-client-protocol/pull/721))** — introduces `Acp-Connection-Id` (separate from session ID), transport-layer auth before ACP auth, and explicit "proxy terminates one transport, speaks another to agent" layering — **directly enabling an interposing governance proxy** (option b at the transport tier).
  - Request Cancellation, Session Fork, **ACP v2 proposal**; a **Transports Working Group** was formed.
- **Naming-collision WARNING:** a **different** "ACP" exists — IBM/i-am-bee **Agent Communication Protocol** and agntcy **Agent Connect Protocol**. The `acp-mcp-server` / ACP-MCP bridge projects target *that* protocol, **not** Zed's Agent Client Protocol ([github.com/gongrzhe/acp-mcp-server](https://github.com/gongrzhe/acp-mcp-server)). Do not conflate.

---

## 7. Recommended build scope for the #172 foundation (concrete, no live network)

Build a self-contained, offline, fully-tested ACP→FailSafe foundation. **No stdio transport, no agent launch, no live SDK connection** — that is a follow-up. The foundation is **types + mapper + permission-authority handler + tests**.

1. **ACP types module** (`src/integrations/acp/acpTypes.ts`) — local TS types for the governable surface: `AcpToolCall` (`toolCallId/title/kind/status/content/locations/rawInput/rawOutput`), `AcpPermissionRequest` (`{sessionId, toolCall, options: AcpPermissionOption[]}`), `AcpPermissionOption` (`{optionId, name, kind}`), `AcpPermissionOutcome` (`selected{optionId} | cancelled`), `fs/write_text_file` + `terminal/create` param shapes. **Author against the raw `schema.json`**, not the inferred field lists in this brief (see §8). Do **not** hardcode a `PROTOCOL_VERSION` constant until the literal is confirmed in `schema.json`.

2. **ACP→Envelope mapper** (`src/integrations/acp/acpMapper.ts`) — pure functions:
   - `acpToolCallToEnvelope(tc) → McpEnvelope` with `name` = `acp_tool_call:<tc.kind>` (or the tool name) and `arguments` = `tc.rawInput`.
   - `acpFsWriteToEnvelope(params) → McpEnvelope` with `name="acp_fs_write"` and **`arguments.path` set to the absolute path** (so a later engine widening can map it to `ProposedAction.targetPath` for Axiom2 scoping).
   - `acpPermissionToEnvelope(req) → McpEnvelope` with `name="acp_permission"` and `arguments` = the embedded `toolCall.rawInput`.
   Keep these no-I/O, no-logging (mirror `contractMappers.ts`).

3. **`AcpInterceptor`** (`src/integrations/acp/AcpInterceptor.ts`) — sibling of `McpInterceptor` (`McpInterceptor.ts:65-128`): constructor-injected backing `IGovernanceInterceptor`, `intercept(acpIntent): Promise<ReceiptContract>` that runs the mapped envelope through `EngineBackedInterceptor`. Emits distinct `action.kind` values (`acp_tool_call`/`acp_fs_write`/`acp_permission`) for ledger fidelity (free-form per `evaluation_request.json:14-20`).

4. **Permission-authority handler** (`src/integrations/acp/acpPermissionAuthority.ts`) — `decidePermission(req, interceptor): Promise<AcpPermissionOutcome>`: maps verdict → outcome over the supplied `options[]`:
   - `ALLOW` → `selected{ optionId of an allow_* option }`
   - `BLOCK`/`QUARANTINE` → `selected{ optionId of a reject_* option }`
   - `ESCALATE` → operator-defined; for the foundation, conservative **`selected{ reject_once }`** with a TODO to surface a pending/deferred state (note ESCALATE has no clean ACP "pending" outcome — open question §8).
   This is the **JSON-RPC analogue of `governToolCall`** — a `governAcpCall` that maps `ReceiptVerdict` → ACP outcome instead of HTTP status (the HTTP table at `bicameralRouteShared.ts:143-172` does **not** transfer; ACP is JSON-RPC over stdio, not HTTP).

5. **`mcpServers` vetting hook** (offline) — a pure function that takes a `session/new.mcpServers` array and runs the existing `mcp-policy-audit.ts` / `mcp-risk-score.ts` scorers, returning allow/flag/block. Pure reuse; no new privilege.

6. **Tests (per-feature, red→green, no live network)** — per the project's TDD-per-feature rule:
   - `acpMapper.spec.ts` — each mapper produces a contract-valid envelope; `acp_fs_write` carries the absolute `path`.
   - `AcpInterceptor.spec.ts` — ALLOW/BLOCK/ESCALATE/QUARANTINE round-trip to the right `ReceiptVerdict`; malformed intent → QUARANTINE without engine call.
   - `acpPermissionAuthority.spec.ts` — verdict→outcome table incl. the argv-array `rawInput.command` fixture from [agent-shell#265](https://github.com/xenodium/agent-shell/issues/265); cancelled-on-cancel path.
   - `acpHostDetection.spec.ts` (#161) — `Devin.exe`/`Devin.app`/`devin` match; `~/.windsurf/acp/registry.json` AND `~/.devin` watched; standalone-CLI disambiguation.

**Explicitly out of scope for the foundation:** stdio transport / agent spawning (option b), live `@agentclientprotocol/sdk` `ClientSideConnection`, MODIFY-producing engine path, and the `ProposedAction.type` union widening (§8 risks).

---

## 8. Open questions / risks

1. **Is the extension actually the ACP client?** Option (a) (no-proxy authority) holds **only** if FailSafe is the ACP client or can wrap the host's `request_permission` handler. In Zed/JetBrains/Devin Desktop the **editor is the canonical client** — whether a VS Code/Cursor extension can inject into that baked-in handler is **unverified**. If it cannot, FailSafe falls back to a stdio proxy (b), which requires FailSafe to be the agent spawner. **Confirm which actor spawns the agent in the intended deployment before committing to (a).**
2. **`ToolCallUpdate` / `ToolCall` payload verbatim.** The full embedded payload inside `session/request_permission` (the `locations[]` element shape, `content` block variants like `diff`/`terminal`, exact `rawInput` key names) was **not** retrieved verbatim — the live `schema.json` fetch truncated. **Code the request parser against the raw `schema.json`** (pull from the GitHub release or [llms.txt](https://agentclientprotocol.com/llms.txt)), not the inferred field lists here.
3. **`PROTOCOL_VERSION` literal.** Spec states integer `1`, but no source surfaced a literal `PROTOCOL_VERSION` constant in `schema.json` or a constants module (docs.rs showed crate version `0.13.5` — a package version, not the protocol version). **Do not hardcode** without confirming the exact field/value.
4. **Are `fs/*` and `terminal/*` themselves gated by a preceding `request_permission`, or does the client apply policy at the method boundary?** This selects the interception point — confirm against the spec before deciding whether `AcpInterceptor` governs at the permission seam, the fs/terminal seam, or both.
5. **ESCALATE has no clean ACP outcome.** `request_permission` is request/response; ACP has no "pending/deferred" outcome (only `selected`/`cancelled`). Decide whether ESCALATE maps to a conservative reject or a held request. The HTTP `ESCALATE→409` mapping does **not** transfer to JSON-RPC; a `governAcpCall` receipt→JSON-RPC mapping is required.
6. **fs path absoluteness.** Axiom2/path-traversal assume a resolvable **absolute** path; `contractMappers.ts:57` defaults a missing target to `""`. Confirm ACP `fs/write_text_file.path` arrives absolute (spec says "absolute") and that the mapper populates `action.target` accordingly.
7. **`ProposedAction.type` widening vs. translation (GAP #1).** Decide: widen the union to admit `tool_call`/`permission_request`, or translate ACP kinds into existing `file_*` types — to remove the unsound `as` cast (`contractMappers.ts:55`). This is real engine work, **out of scope for #172 foundation** but must be tracked.
8. **MODIFY reachability (GAP #3).** MODIFY is in the receipt contract + HTTP table but the engine `Verdict` union has no MODIFY variant (`IntentTypes.ts:331`; `contractMappers.ts:106-117`). If ACP permission-narrowing / path-redaction is desired, the `Verdict` union + `verdictToReceipt` need a new branch.
9. **Pro daemon coverage unverified.** The "Pro closes the off-channel gap" backstop claim depends on the (gitignored) daemon intercepting fs syscalls / process creation / network. **Confirm against `PRIVATE/docs/LICENSING_POSTURE.md` or the Pro repo** before asserting it to the operator.
10. **`@agentclientprotocol/sdk` transport scope.** Confirm whether v0.24.0 ships any transport beyond stdio (WebSocket/Streamable HTTP per PR #721 are RFD-stage); the MCP-over-ACP runtime-chokepoint opportunity is unshipped as of v0.24.0.
11. **Devin detection brittleness.** `devin acp` is shared by Devin Desktop and the standalone Devin CLI; registry path is still `.windsurf` while rules prefer `.devin`. Watch both namespaces and disambiguate by process context; re-verify on updates. Confirm Linux binary casing/packaging.


---

## Appendix: Adversarial verification ledger

**Refuted claims (corrected above):**
- prior-art-sdks — OVERSTATED/wrong on dependencies.
- acp-spec-surface evidence sourcing — The facts are correct but the URL paths are not the canonical ones I could verify.
- permission-model — Not supported by anything I could verify in the spec.

**Standing cautions for the build:**
- request_permission as a no-proxy governance authority holds ONLY if FailSafe is the actual ACP client (or owns/wraps the client's request_permission handler) in the target host. In Zed/JetBrains/Devin Desktop the EDITOR is the canonical ACP client; whether a VS Code/Cursor extension can inject into that handler is unverified.
- Even as the client permission authority, the gate is fundamentally advisory: the agent MAY skip session/request_permission (proven by copilot-cli #845) and execute tools itself. None of options (a)/(b)/(c) can stop a malicious agent's off-ACP-channel fs writes, raw child processes, or network — that gap is only closeable by the (gitignored, unverified-here) FailSafe Pro OS-daemon.
- The PROTOCOL_VERSION literal: the spec states the integer 1, but no findings agent surfaced a literal PROTOCOL_VERSION constant from schema.json or a constants module. docs.rs showed crate version 0.13.5 (a package version, NOT the protocol version).
- The full ToolCallUpdate / ToolCall payload embedded inside session/request_permission (locations[] element shape, content block variants like diff/terminal, exact rawInput key names) was NOT retrieved verbatim by any agent — the live schema.json fetch was truncated. The adapter's request parser must be coded against the raw schema.json, not against the inferred field lists in these findings..
- Reusing McpInterceptor verbatim stamps every ACP intent as action.kind:'tool_call', collapsing the fs/permission/tool distinction in the ledger. To make ACP fs/write_text_file actually Axiom2-scope-checked, the adapter must populate action.target with the absolute path (params.path) — but whether ACP delivers that path absolute vs workspace-relative is unconfirmed; Axiom2/path-traversal checks assume a resolvable absolute path (Axiom2Enforcer.ts isPathInScope, contractMappers.ts:57 defaults missing target to '')..
- governToolCall / RECEIPT_HTTP_TABLE is HTTP/Express-specific (res.status().json()). ACP transport is JSON-RPC 2.0 over stdio, NOT HTTP, so the ESCALATE->409 / BLOCK->403 mapping does not transfer; a parallel receipt->JSON-RPC-error mapping (governAcpCall) is required.
- agent-shell #265 is an Emacs ACP client implementation, not Zed itself; the WebFetch model hedged on whether it's 'Zed's ACP'. It IS the same Agent Client Protocol surface (argv-array rawInput.command), so the governance-data-at-the-seam conclusion stands, but cite it as cross-client corroboration rather than as Zed-canonical behavior..
- Devin Desktop / 'devin' binary detection: the standalone Devin CLI (cli.devin.ai) also uses the 'devin' binary with 'acp' args, and the docs show .devin/ as preferred for rules but ACP registry still at .windsurf/. Host detection must watch BOTH namespaces and disambiguate process context; a future release may move the registry to a .devin path..

_Research via 8-agent parallel workflow (acp-governance-research), adversarially verified. 2026-06-04._
