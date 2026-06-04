# Build Plan — Devin Desktop ACP Enforce-Mode Integration

> Status: forward work. PR #173 shipped only the pure offline governance core (`src/integrations/acp/`); there is **no** transport, spawn, registry, or SDK code in the repo yet (confirmed by grep — `AcpInterceptor.ts:8-10` header: "It does NOT speak ACP transport (no stdio, no agent spawn, no SDK) — that is a follow-up. This is the pure governance core."; `README.md:36-37`). This plan ships the live-transport layer that the foundation was explicitly designed to await, plus the engine widening that makes fs/terminal enforcement truthful.

---

## Feasibility verdict (go/no-go + blockers)

**GO (conditional).** The registry-proxy mechanism is feasible and unblocked by Devin/SDK, but it **cannot truthfully claim full "ENFORCE on every fs/terminal frame"** until two in-repo enforcement gaps close. Ship in two truthfulness tiers:

- **Tier 1 (PR #1, shippable now):** proxy + `session/request_permission` enforcement + fail-closed QUARANTINE + durable ledgering. This is honest because `decidePermission`/`AcpInterceptor` already deny-by-default on non-ALLOW verdicts and QUARANTINE malformed/oversized intents (`AcpInterceptor.ts:103-122`, `acpPermissionAuthority.ts:67-79,86-92`).
- **Tier 2 (follow-up PR, gated on engine widening):** fs/terminal frame enforcement, which is **currently false** until `ProposedAction` is widened.

**What is confirmed:**
- Devin registry path is exactly `~/.windsurf/acp/registry.json` (Desktop) and `~/.windsurf-next/acp/registry.json` (Next), openable via Command Palette "Open Local ACP Registry Config" (https://docs.devin.ai/desktop/acp).
- Devin does **not** download distributions; the binary must be pre-installed and the registry only tells Devin how to **launch** it via `distribution.binary.<platform>.cmd` + `args`. Pointing `cmd`/`args` at FailSafe's proxy is the supported, intended registration path (https://docs.devin.ai/desktop/acp).
- Registry has **no** documented signing/validation/allowlist/integrity check; users directly edit the local file (https://docs.devin.ai/desktop/acp). This both enables registration and is the tampering attack surface.
- Agent is **operator-selected** (appears in selector for new conversations), not auto-launched; full restart required, no hot-reload (https://docs.devin.ai/desktop/acp). Registration is non-silent and operator-visible.
- `@agentclientprotocol/sdk` latest is `0.24.0`, ESM-only (`"type":"module"`), entry `dist/acp.js` + `dist/acp.d.ts`, `zod` as **peer** dep `^3.25.0 || ^4.0.0`, no runtime deps (https://registry.npmjs.org/@agentclientprotocol/sdk).
- SDK supports symmetric MITM: `AgentSideConnection(toAgent, stream)` presents the proxy to Devin **as the agent** (exposes Client methods `sessionUpdate`/`requestPermission`/`readTextFile`/`writeTextFile`/`createTerminal`); `ClientSideConnection(toClient, stream)` drives the real agent **as a client** (`initialize`/`newSession`/`prompt`/`cancel`/`authenticate`). Both share `(handlerFactory, stream)` (https://agentclientprotocol.github.io/typescript-sdk/classes/AgentSideConnection.html, https://agentclientprotocol.github.io/typescript-sdk/classes/ClientSideConnection.html).
- ACP is JSON-RPC 2.0; Client is permission gatekeeper; enforce points are `session/request_permission`, `fs/write_text_file`, `terminal/create` (https://agentclientprotocol.com/protocol/overview).

**Refuted claims (reflected honestly):**
1. *"The proxy can ENFORCE on every fs/terminal frame today."* **FALSE.** `evaluationRequestToProposedAction` copies only `{type, targetPath, intentId, proposedAt, proposedBy}` and never reads `action.payload`; `ProposedAction.type` is the closed `file_*` union and Axiom2 reads only `targetPath` (`contractMappers.ts:51-61`, `Axiom2Enforcer.ts:82-116`). `acpMapper.ts` notes terminal command policy is provenance-only (ACP-AGENTIC-01). A "block dangerous terminal" attempt today evaluates the command **string as a file path**.
2. *"`governance.mode=enforce` is sufficient to hard-deny."* **FALSE.** Verified at `EnforceModeEvaluator.ts:18-28`: even in enforce mode, if `governance.lockstep` is OFF it returns `ALLOW` ("Lock-step not enabled, falling back to assist behavior"). Real enforcement needs **both** `mode=enforce` AND the lockstep gate enabled. No in-code `forceEnforce`.
3. *"The Devin doc confirms ACP transport is stdio."* **OVERSTATED.** Neither the Devin doc nor https://agentclientprotocol.com/protocol/overview explicitly names stdio. It is **inferred** from (a) Devin launching via `cmd`/`args` subprocess and (b) the SDK's `ndJsonStream` being built over Node stdio in the SDK examples. Cite as inferred until confirmed against `dist/acp.d.ts` of 0.24.0 at implement time.

**Hard blockers (must resolve before the corresponding tier claims enforcement):**
- **B1 — Lockstep-gate openness (blocks the core thesis):** confirm whether `governance.lockstep` (`IFeatureGate`) is available in the **open** extension or is **Pro-only**. If Pro-only, the open proxy can never hard-deny fs/terminal path verdicts — only permission-deny + QUARANTINE. This is a product-boundary decision the operator must make before Tier 2. (`EnforceModeEvaluator.ts:18-28`)
- **B2 — Engine widening (ACP-AGENTIC-01, blocks Tier 2):** widen `ProposedAction` beyond the `file_*` union and make the engine read `action.payload` (terminal argv/cwd/env, fs content digest) so Axiom enforcement evaluates the actual command. May be a separate engine cycle. (`contractMappers.ts:51-61`, `acpMapper.ts:38-81`)
- **B3 — Effective-mode surfacing (ACP-ADV-02, blocks all enforcement claims):** default mode is `observe`, under which the engine logs "OBSERVE MODE: Would have blocked" then returns `ALLOW` (`EnforcementEngine.ts:90-94,108-119`). The proxy MUST surface effective mode in the receipt and treat any ALLOW produced under a non-enforcing mode as a **non-grant** (`cancelled` + loud warning), or it silently grants everything and falsely advertises enforcement.
- **B4 — Initialize/capability reconciliation:** proxy must run `initialize` with **both** Devin and the real agent and reconcile `protocolVersion` + capability sets. SDK is `0.24.0` but the foundation back-cited schema "protocol v1"; confirm `0.24.0`'s `protocolVersion` matches what Devin negotiates and define behavior when the real agent advertises a capability the proxy intercepts.
- **B5 — Full-interface passthrough:** the SDK gives **no** documented auto-forward for unhandled methods. The proxy must explicitly implement and relay **every** Client and Agent interface method (incl. experimental `loadSession`/`resumeSession`/`closeSession`, `listSessions`, `setSessionConfigOption`). Enumerate the full list from `dist/acp.d.ts` of 0.24.0 at implement time or frames silently drop.
- **B6 — Registry integrity / tamper-detection (security, medium-hard):** registry is unsigned and user-writable; any process can rewrite `cmd` back to the raw agent (bypassing FailSafe) or chain a benign agent past the proxy. No `fs.watch`/hash-pin exists. WorkspaceMutationBus substrate could watch it but no wiring exists.
- **B7 — Durable forensic ledgering at the I/O boundary (ACP-NIST-03, medium):** `decidePermission`/`AcpInterceptor` must persist non-ALLOW verdicts and QUARANTINEs to `LedgerManager` at the proxy boundary; currently unimplemented — without it, blocks leave no durable trail.
- **B8 — External registry-write primitive (medium):** writing `~/.windsurf/acp/registry.json` is net-new — `hostRegistry.ts:64-115` only **reads** an in-workspace overlay. Build a safe-write (merge-not-clobber, preserve existing agents, atomic temp+rename) primitive, plus correct runtime arch→composite platform-key mapping (`darwin-aarch64` etc.) and missing-key fail behavior.

---

## Architecture (registry-proxy)

This is the research brief's pre-analyzed **"option (b) stdio proxy"** topology (`docs/research-brief-acp-governance-2026-06-04.md:97-109`), scoped there as strictly stronger than the shipped cooperative authority (option (a)) and as requiring FailSafe to be the agent spawner.

**Who launches what:**
1. FailSafe writes a Devin registry entry whose `distribution.binary.<platform>.cmd`/`args` point at a FailSafe-shipped **proxy binary/entrypoint** (a second Node entrypoint inside the VSIX, launched via `node <vsix>/dist/acp-proxy.js -- <realAgentCmd> <realAgentArgs...>`).
2. Operator toggles the agent on in Devin's Settings → Agents tab and restarts Devin (non-silent, operator-visible — confirmed at https://docs.devin.ai/desktop/acp).
3. Devin spawns the **proxy** as the agent subprocess.
4. The proxy spawns the **real agent** as its own child subprocess.

**Where the proxy runs:** a standalone Node process spawned by Devin (NOT inside the VS Code extension host). It is bundled into the VSIX as a separate esbuild entrypoint (`bundle.cjs:1-34` already copies assets and supports a second Node entrypoint per the findings). It shares the filesystem with the extension (governance config, ledger) — no IPC, matching the FailSafe-Pro-coexistence pattern (MEMORY.md WorkspaceMutationBus note).

**The dual-stream MITM** (per SDK examples, https://raw.githubusercontent.com/agentclientprotocol/typescript-sdk/main/src/examples/agent.ts + /client.ts):
- **Devin-facing (proxy = AGENT):** `new acp.AgentSideConnection((conn) => failsafeClientHandler, acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))`. The handler answers `requestPermission`/`writeTextFile`/`createTerminal`/`readTextFile`/`sessionUpdate` — these are the **enforce surface**.
- **Agent-facing (proxy = CLIENT):** `new acp.ClientSideConnection((agent) => failsafeAgentHandler, acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)))`. The handler relays `initialize`/`newSession`/`prompt`/`cancel`/`authenticate` — these are the **transparent control-frame surface**.

**Frame routing** (catalog from https://agentclientprotocol.com/protocol/overview):
- **Client→Agent control frames** (`initialize`, `authenticate`, `session/new`, `session/prompt`, `session/load`, `session/set_mode`, `session/cancel`, `logout`): **forward** transparently (capability-reconciled at `initialize` per B4).
- **Agent→Client side-effecting frames** (`session/request_permission`, `fs/write_text_file`, `terminal/create`, `terminal/kill`/`output`/`release`/`wait_for_exit`): **enforce points** — block/escalate/forward per verdict.
- **`session/update`** (notification) and **`fs/read_text_file`**: forward as benign telemetry/read.

**How it reuses the shipped enforcement core in ENFORCE mode:** for each enforce-point frame the proxy maps the frame → `EvaluationRequestContract` via the existing `acpMapper`, calls `AcpInterceptor.intercept()` (which validates, size-caps at 64KB, QUARANTINEs malformed/unmapped, else dispatches to the engine producing a `ReceiptContract`), then `acpPermissionAuthority.decidePermission()` maps the verdict → `RequestPermissionResponse` (`ALLOW`→`allow_once` only, never `allow_always` per ACP-ADV-07; non-ALLOW→`reject_once` else `cancelled`) (`AcpInterceptor.ts:88-122`, `acpPermissionAuthority.ts:11-23,67-92`). The proxy adds **B3**: stamp effective governance mode onto the receipt and downgrade any non-enforcing ALLOW to `cancelled` + warning before responding to Devin.

**FailSafe-vs-Pro boundary (sharp and load-bearing,** `research-brief:97,106,109`**):**
- **Open extension owns:** in-band ACP frames whenever FailSafe spawns the agent (option a always; option b when proxied). This closes the cooperative-path hole where an agent skips `session/request_permission` — but **only for traffic traversing the proxied stdio pipe**.
- **FailSafe Pro owns:** the non-bypassable OS-level backstop (process/syscall/network interposition) for the agent's own direct fs syscalls, spawned grandchild processes, and outbound sockets — **none traverse the proxied pipe** (`research-brief:97,106`). Matches the documented product boundary (extension = editor-level governance; Pro = OS-level enforcement). Pro's actual end-to-end syscall coverage is unverified here (Pro source gitignored; `research-brief:109` defers to `PRIVATE/docs/LICENSING_POSTURE.md`).

---

## Component inventory

All paths under `G:\MythologIQ\FailSafe\FailSafe\extension\`.

**ACP proxy process (net-new):**
- `src/integrations/acp/proxy/AcpProxyMain.ts` — proxy entrypoint. Parses `-- <realCmd> <realArgs>`, spawns child via `child_process.spawn`, constructs both connections. (Reuse pattern: `AgtRoute.ts:19-23,57-78` injects `runInTerminal` for launching — here the proxy spawns directly.)
- `src/integrations/acp/proxy/AcpProxyClientHandler.ts` — Devin-facing handler implementing the full **Client** interface (B5); enforce points call `AcpInterceptor`/`decidePermission`.
- `src/integrations/acp/proxy/AcpProxyAgentHandler.ts` — agent-facing handler implementing the full **Agent** interface (B5); transparent relay.
- `src/integrations/acp/proxy/AcpStreamFactory.ts` — wraps `process.stdin/stdout` and `child.stdin/stdout` into `acp.ndJsonStream` (confirm `Writable.toWeb`/`Readable.toWeb` vs an SDK re-export against `dist/acp.d.ts` at implement time).
- `src/integrations/acp/proxy/AcpInitializeReconciler.ts` — B4 capability/`protocolVersion` reconciliation.
- `src/integrations/acp/proxy/AcpProxyLedgerSink.ts` — B7; persists non-ALLOW + QUARANTINE receipts to `LedgerManager` at the I/O boundary (guard `LedgerManager.isAvailable()` per MEMORY.md degradation rule).
- `esbuild`: add a second entrypoint to `scripts/.../bundle.cjs` (currently `bundle.cjs:1-34`) producing `dist/acp-proxy.js`.

**Registry writer (net-new, B8):**
- `src/integrations/acp/registry/DevinRegistryWriter.ts` — atomic merge-not-clobber writer for `~/.windsurf/acp/registry.json` (and `~/.windsurf-next/...`). Models the agent + `distribution.binary.<platform>.cmd/args` schema; arch→composite-key mapping (`darwin-aarch64`/`darwin-x86_64`/`linux-aarch64`/`linux-x86_64`/`windows-aarch64`/`windows-x86_64` per https://docs.devin.ai/desktop/acp). Closest existing model is `hostRegistry.ts:64-115` (read-only overlay-merge) — extend the merge posture to an external home-dir write.
- `src/integrations/acp/registry/DevinRegistryPaths.ts` — resolves Desktop vs Next paths; keeps `windsurf` naming (no `.devin` migration per https://docs.devin.ai/desktop/acp).
- `src/integrations/acp/registry/DevinRegistryGuard.ts` — B6 tamper-detection: hash-pin the FailSafe entry; `fs.watch` (or WorkspaceMutationBus subscription) re-asserts `cmd`/`args` and warns on drift.

**Host-detection devin-desktop alias (#161, additive):**
- `src/qorelogic/AgentDefinitions.ts` — add a `devin-desktop` entry modeled on the verified `windsurf` template at `AgentDefinitions.ts:62-71` (`folderExists: [".windsurf"]`, `hostAppNames: [...]`); Devin is the former Windsurf, so detect the windsurf dot-dir + Devin host app names. `SystemRegistry.ts:194-221` (`collectSignals`) scores via weighted confidence with no further change.

**Enforce-mode wiring:**
- B3 effective-mode stamping lives in `AcpProxyClientHandler` + a small helper reading `getGovernanceModeState` (`EnforcementEngine.ts:90-94`).
- Tier 2: B2 engine widening touches `src/contracts/...contractMappers.ts:51-61` (`evaluationRequestToProposedAction` to read `action.payload`), the `ProposedAction.type` union, and `Axiom2Enforcer.ts:82-116` (consume argv/cwd/env, not just `targetPath`). **Separate PR / possibly separate engine cycle.**

**Settings keys (`package.json` `contributes.configuration`):**
- `failsafe.acp.devinDesktop.enabled` (boolean, default false)
- `failsafe.acp.devinDesktop.realAgentCmd` / `.realAgentArgs` (the pre-installed binary the proxy wraps — Devin does not download it)
- `failsafe.acp.devinDesktop.channel` (`stable` | `next` → registry path)
- `failsafe.acp.enforce.requirePermissionGate` (Tier 1 truthfulness toggle)
- (no new mode key — reuse existing `governance.mode` + `governance.lockstep` gate)

**Integration-tab / Devin card UI:**
- `src/webui/.../integrations/DevinCard.{ts,tsx}` (alongside existing integration cards) — shows detection state, enabled toggle, "Write registry entry" / "Remove registry entry" buttons, restart-required notice, effective-mode + lockstep-gate status banner (so the operator sees when enforcement is/ isn't live), and tamper-detection status (B6).
- Route registration mirrors `ConsoleRouteRegistrar.ts:407-414`.

**Install/uninstall of the registry entry:**
- Install: `DevinRegistryWriter.upsertFailSafeEntry()` (merge-preserve other agents, atomic).
- Uninstall: `DevinRegistryWriter.removeFailSafeEntry()` (restores any prior entry it wrapped; never clobbers unrelated agents).
- Both surfaced as commands + Devin-card buttons; both emit a restart-required notice (no hot-reload, per https://docs.devin.ai/desktop/acp).

---

## Exclusivity packaging (enforce-mode shipped EXCLUSIVELY as the Devin Desktop integration, without artificial lock-in)

The goal: the higher-leverage **proxy-based enforcement** is the differentiated value of the Devin Desktop integration, while avoiding a contrived license check that would read as lock-in.

**How exclusivity is achieved naturally (not artificially):**
1. **Spawn-interposition is intrinsically integration-specific.** The enforce path only exists when FailSafe is the agent spawner — which only happens through the Devin registry entry. There is no generic "turn on enforce everywhere" surface in the open extension because the existing `EnforceModeEvaluator.ts:18-28` already falls back to ALLOW without lockstep. The proxy is the *only* code path that actually intercepts live frames. So enforce-via-proxy is structurally scoped to Devin Desktop because that is the only host whose launch model (unsigned `cmd`/`args` registry) admits the interposition.
2. **Gate the proxy enforce-response on the Devin integration being the launcher, verified at runtime — not on a flag.** The proxy validates it was launched by Devin (initialize handshake from a Devin client + presence of the FailSafe registry entry whose hash it pinned, B6) before it applies enforce semantics. If launched out-of-context, it forwards transparently (observe) rather than pretending to enforce. This ties enforcement to *being correctly installed as the Devin integration* rather than to an entitlement check.
3. **No artificial lock-in:** the in-band governance core (`decidePermission`/`AcpInterceptor`) stays open and unchanged; any future host that adopts the same registry-launch model can reuse the same proxy. Exclusivity is "Devin is the first/only host wired," not "enforcement is license-walled." (If the operator later decides hard-deny of fs/terminal path verdicts is Pro-only — B1 — that boundary is enforced by the existing `governance.lockstep` gate, **not** by new Devin-specific gating code.)

---

## Security (threat-model)

Three NEW attack-surface classes the proxy introduces that PR #173's pure offline core does not address (`research-brief:97-109`; confirmed no spawn/registry code exists today):

1. **Registry tampering / malicious-entry hijack (B6).** The registry is unsigned and user-writable; Devin executes `cmd`+`args` verbatim (https://docs.devin.ai/desktop/acp). Anything that can write `registry.json` can swap FailSafe's `cmd` for an attacker binary, or wrap FailSafe to feed it a benign agent while the real one runs unproxied — defeating governance silently.
   - *Mitigation:* `DevinRegistryGuard` hash-pins the FailSafe entry and `fs.watch`/WorkspaceMutationBus re-asserts on drift; loud warning + Devin-card status when the entry no longer matches. Honest limit: detection, not prevention — the file remains user-writable by design.

2. **Proxy as a new confidant.** The proxy now sees ALL agent traffic in the clear, including secrets on the stream. PR #173's secret hygiene (sha256 digest + byte length, never the body — `acpMapper.ts:49-56`) protects the **governance payload / ledger** side only. The **pass-through stdio frames** the proxy must forward to the real agent still carry raw `fs_write` content, terminal env (`acpTypes.ts:84-91` models env as raw name/value), and tool `rawInput` verbatim. (ACP-AGENTIC-03 was fixed at the mapper, `docs/review-acp-governance-2026-06-04.md:59-63` — the pass-through channel is out of that fix's scope.)
   - *Mitigation:* do not log pass-through frame bodies; reuse the digest-only posture for any proxy-side telemetry; document that the forwarded transport is unredacted by necessity. Full redaction of forwarded frames is **undesigned** and out of scope for Tier 1.

3. **Proxy-bypass via off-ACP channels.** Even a perfect stdio proxy cannot see the agent's own direct fs syscalls, grandchild processes, or network sockets — none traverse the proxied pipe (`research-brief:97,106`).
   - *Coverage boundary:* this is exactly **what the open extension cannot cover and FailSafe Pro must** (OS-level interposition, `research-brief:109`). Stated plainly in the Devin card and docs.

**Fail-closed primitives already present** (reused unchanged): malformed/unmapped/oversized intents QUARANTINE without reaching the engine (`AcpInterceptor.ts:103-122`); deny verdicts map to `reject_once`/`cancelled`, never fall through to allow (`acpPermissionAuthority.ts:67-79,86-92`). **B7** adds durable ledgering so blocks leave a forensic trail.

**Covered vs not covered vs Pro:**
- *Covered (open, in-band):* `session/request_permission` deny/escalate, QUARANTINE of malformed frames — Tier 1. fs/terminal frame enforcement — Tier 2 after B2.
- *Not covered (open):* off-ACP syscalls/grandchildren/network; redaction of forwarded transport bodies; prevention (vs detection) of registry tampering.
- *Pro:* OS-level process/syscall/network interposition (unverified end-to-end here — Pro source gitignored).

**Secret handling:** governance-payload side uses existing digest posture (`acpMapper.ts:49-56`); pass-through side is unredacted-by-necessity and must never be logged.

---

## Test plan (per-feature TDD: red→green in the same commit per MEMORY.md)

**Unit:**
- `DevinRegistryWriter` — merge-not-clobber preserves existing agents; atomic temp+rename; arch→composite-key mapping for all six platform keys; missing-key fail behavior; idempotent upsert; clean remove. (red first)
- `DevinRegistryPaths` — Desktop vs Next resolution; keeps `windsurf` naming.
- `AcpProxyClientHandler` — each enforce-point frame maps → `EvaluationRequestContract` → correct `RequestPermissionResponse`; non-ALLOW → `reject_once`/`cancelled`; QUARANTINE on malformed; **B3** effective-mode downgrade (observe-mode ALLOW → `cancelled` + warning).
- `AcpProxyAgentHandler` — every control frame relayed (B5 full-interface coverage; assert no method silently dropped).
- `AcpInitializeReconciler` — B4 protocolVersion/capability reconciliation incl. the case where the real agent advertises an intercepted capability.
- `AgentDefinitions` devin-desktop alias — `SystemRegistry.collectSignals` scores Devin via windsurf dot-dir + host app name (`SystemRegistry.ts:194-221`).
- `DevinRegistryGuard` — drift detection fires on `cmd` rewrite.

**Proxy integration test (no live Devin):**
- A test harness plays the **Devin role** over a stdio pipe (using the SDK's `ClientSideConnection` as the test client) and a **fake real agent** (an SDK `AgentSideConnection` stub) on the other side. Drive: `initialize` → `session/new` → `session/prompt` → agent emits `session/request_permission` and `fs/write_text_file` → assert the proxy enforces (deny under enforce+lockstep; downgraded non-grant under observe) and transparently forwards control frames. This proves the dual-stream MITM end-to-end without Devin installed.
- Tier 2 add: fake agent emits a `terminal/create` with dangerous argv → assert real block (only valid after B2 engine widening; until then assert the **honest** provenance-only behavior + a skipped/xfail marker referencing ACP-AGENTIC-01).

**Playwright (visual surface, required before claiming the card complete per MEMORY.md design-reference rule):**
- `devin-card.spec.ts` — card renders detection state, enable toggle, install/uninstall buttons, restart-required notice, effective-mode + lockstep-gate banner, tamper-status. Invoke `/frontend-design` + visual verify in Chrome (jsdom alone is insufficient).

**CI gate:** per `feedback_e2e_before_claim_closed.md` and `PUBLISH_BLOCK.md`, every new FEATURE_INDEX row (proxy, registry writer, devin alias, enforce wiring, card) needs a test or an n/a justification before any marketplace publish.

---

## Phasing + risks/unknowns

**PR #1 (Tier 1 — shippable, honest enforcement):**
- ACP proxy process (dual-stream MITM, B5 full passthrough, B4 reconciliation).
- `DevinRegistryWriter`/`Paths`/`Guard` (B6, B8) + install/uninstall commands.
- `devin-desktop` host alias (#161).
- B3 effective-mode surfacing + B7 durable ledgering.
- Settings keys + Devin card + Playwright.
- Enforcement claim limited to `session/request_permission` deny/escalate + QUARANTINE. **Does not** claim fs/terminal enforcement.

**PR #2 (follow-up, gated on B1 + B2):**
- Engine widening: `ProposedAction` payload, `contractMappers.ts:51-61`, `Axiom2Enforcer.ts:82-116` consume argv/cwd/env. May be its own engine cycle.
- Resolve lockstep-gate openness (B1) — product-boundary decision.
- Then upgrade the Devin card + tests to claim fs/terminal frame enforcement.

**Risks / unknowns (carry into implement):**
- **stdio is inferred, not quoted** — confirm transport against `dist/acp.d.ts` 0.24.0 before asserting.
- **`ndJsonStream` signature / `toWeb` helper** — SDK examples use Node's `Writable.toWeb`/`Readable.toWeb`; confirm no SDK re-export and the exact arg order against `dist/acp.d.ts`.
- **Full interface method list (B5)** — enumerate from `dist/acp.d.ts` or frames drop.
- **Registry `distribution` schema strictness** — Devin "does not currently download" so `archive` is unused, but JSON-schema validation strictness of `registry.json` is unconfirmed; verify a `cmd`/`args`-only entry validates.
- **protocolVersion skew (B4)** — 0.24.0 vs foundation's "protocol v1."
- **`_meta` convention** — whether Devin renders `_meta.*` escalation context (acpx uses `_meta.acpx.permissionEscalation`) is unconfirmed against Devin's UI.
- **Override built-in `devin-cli` id vs new id** — undocumented whether FailSafe can transparently wrap a built-in id or must register a new one (https://docs.devin.ai/desktop/acp unknowns).
- **Team-admin ACP Registry Config merge-vs-replace** — undocumented; could clobber the local FailSafe entry in managed environments.
- **windsurf→devin path migration** — a future `.devin` path would break a hardcoded `.windsurf` writer; `DevinRegistryPaths` must be the single point of change.
- **Lockstep-gate openness (B1)** — if Pro-only, the open proxy never hard-denies fs/terminal path verdicts; the Devin card must state this truthfully.
- **Linux casing/AppImage spawn reliability** and Devin-Desktop-vs-standalone-Devin-CLI disambiguation (both use the `devin` binary) are research-only (`research-brief:120`).
- **Pro off-ACP coverage unverified** — Pro source gitignored; cannot confirm Pro fully closes the off-channel gap end-to-end (`research-brief:109`).

---
_Plan via 6-agent research→verify→plan workflow (devin-acp-enforce-plan), adversarially feasibility-verified. 2026-06-04._
