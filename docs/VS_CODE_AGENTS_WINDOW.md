# FailSafe × VS Code Agents Window — Compatibility Snapshot

## Binding owner decision: no Qor skill retirement without proven successor (2026-11-12)

The solo owner has **accepted the migration direction subject to strict incremental succession**: **do not disable, supersede, remove, uninstall, hide or mark any existing `qor-*` / Qor-Logic development-process skill retired in FailSafe until its actual consumed user capability has been independently proven equivalent through the Qortara Logic integration and explicitly accepted by the owner.** [FailSafe #668](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/668) is the authoritative per-skill acceptance register and owner-decision tracker. This replaces *provisional* wording in this draft that could have implied an automatic v6.2.0 bulk cutover.

**Required individual acceptance:** frozen Qor skill ID/version/host+receipt → exact Qortara skill/tool/engine/artifact identity → matched real positive, refusal, failure and security outcomes on the same source revision and supported host → source/worktree/actor-bound evidence and unchanged FailSafe-owned approvals/G4 release rules → independent reviewer PASS → **explicit owner acceptance** → verified installed successor/rollback → old skill retirement **only afterward**. Missing, stale, retired-by-upstream-only or incomparable outcomes mean **retain the old supported skill** and report the gap. An unavailable Qortara host may retain an already-authorized legacy path, but a Qortara `BLOCK` must **never** be overridden by opportunistically asking Qor for `ALLOW`.

**Skill-by-skill states:** `QOR_ACTIVE` → `CANDIDATE_MAPPED` → `PARITY_TESTED` → `INDEPENDENT_PASS` → `OWNER_ACCEPTED` → `SUCCESSOR_ACTIVE` → `QOR_RETIRED`. A Qortara source heritage designation of TRANSFER/MERGE/RETIRE is lineage, not FailSafe runtime acceptance; even an upstream-retired skill with a live FailSafe user path remains active until a proven successor exists. Keep original `.qor` history and FailSafe G4 ledgers unchanged; imported predecessor evidence is **not** new governance approval.

**Version correction:** v6.1.0 remains an opt-in, reversible integration/parity pilot. v6.2.0 is **at most an earliest candidate for default routing of independently proven capabilities** and carries no promise to remove *all* Qor skills. If parity is incomplete, mixed mode continues; removal of a breaking legacy public contract may need a major-version release and its own owner GO. No changes to the v6.0.13 release or frozen Qor-Logic `0.176.1` distribution.

## Qortara Logic successor migration candidate (research added 2026-11-12)

**Proposed planning pivot; not yet a release-scope or removal decision.** The owner's proposed end state is that **Qortara Logic** (successor to frozen **Qor-Logic**, not a second copy) replaces the old development-process skill suite inside FailSafe. The Qortara product README and its skill-heritage audit confirm that 32 predecessor skills were dispositioned (25 transferred, two merged, five intentionally retired) into one canonical Qortara engine, while behavioral parity remains unqualified. [FailSafe #668](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/668) owns the exact successor and release parity question; native Qortara [#107](https://github.com/MythologIQ-Labs-LLC/qortara-logic/issues/107) owns broader product/heritage acceptance.

**Separate three different surfaces, don't equate the numbers:**
- **Five hosted orchestrators** (`qortara-orient`, `qortara-govern`, `qortara-deliver`, `qortara-assure`, `qortara-improve`) are top-level **workflow instructions/routing**; they are **not** five engines or proof that 25 workflows can autonomously run.
- **25 canonical `qortara-*` skills** and the separately packaged native CLI/MCP/plugin are the successor capability source. Current native CLI directly runs only three read-only workflows; the other workflows need independently authorized host actions and evidence.
- **The currently connected remote Qortara service** reports contract `1.3`, engine `0.1.0.dev0`, 12 hosted read-only tools, `hostedExecutionEnabled: false`; local-only operations (`qortara_status`, `qortara_gate_run`, `qortara_record_gate`, local operator trust and repo reads) are **not remotely served**. Service backend revision observed: `2e75eca1daba6860dff9b1b124553f29da9dbe27`. Host code execution is an *independent permissioned action*, not implicit Qortara MCP authority.

**Least-rework choice:** prioritize verifying Qortara's existing native `qortara-logic-mcp` / `qortara` and host-supplied authorized tools over implementing new long-lived `qor-preflight` / `qor-review-change` wrappers and a second Qor workflow transport. The previous Stage-A standalone Qor-wrapper proposal is **held for architecture reconciliation**. Qor skill prefix remains `qor-*` (never obsolete `ql-*`); **successor product** skill prefix is `qortara-*`. Do not relabel Qortara skills to QOR or retroactively alter frozen ancestor artifacts.

**Architecture boundary:** Qortara owns *development-process* reasoning, skill workflow and its own `.qortara` records; FailSafe continues owning local Sentinel/SHIELD observations, genuine host-enforced gates, user approvals, G4 ledger witness, VSIX lifecycle and FailSafe-specific `.failsafe` state. Local B209 [#664](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/664) is **not** a prerequisite for agents to use Qortara's already-existing MCP. Only build it where a proven FailSafe-specific governance operation needs secure Agent Host access. The hosted Cloudflare evaluator cannot block a separate VS Code tool invocation merely by returning a decision.

**Candidate version sequence:** **v6.0.13** unchanged; **v6.1.0** opt-in Qortara adapter + real host/contract/heritage parity report (not full cutover claim); **v6.2.0** earliest *conditional* default successor, if exact evidence migration, customer distribution/license, offline capability, secure OAuth, supported-host tests, source SHA/receipts, negative cases and owner GO all pass. A truly breaking removal of legacy capability may warrant a future major release. `qortara migrate --from-qor` imports predecessor `.qor` and Markdown histories **as non-authoritative history**, not new PASS. It is not evidence of full migration of FailSafe SQLite, `.failsafe`, seals or G4. Current Qortara source distribution is proprietary; do not bundle it into the Apache-2.0 FailSafe VSIX or force cloud payment/egress by default without explicit owner licensing, opt-in and safety review. Keep frozen Qor-Logic 0.176.1 as a supported fallback until parity independently qualifies its retirement.

**Status of this addendum:** proposed research, no engine/package/manifest or accepted ADR change, no GitHub code merge, no v6.0.13 change. Earlier v6.1.0 direct skills/B209 sequence below is **historical candidate planning**, superseded *as a preferred direction* by this assessment pending explicit owner scope decision. Original evidence and issue ownership are retained.

**Primary source paths (2026-11-12):** [Qortara README](https://github.com/MythologIQ-Labs-LLC/qortara-logic/blob/main/README.md), [host compatibility](https://github.com/MythologIQ-Labs-LLC/qortara-logic/blob/main/docs/host-compatibility-matrix.md), [consumer contracts](https://github.com/MythologIQ-Labs-LLC/qortara-logic/blob/main/docs/consumer-contracts.md), [predecessor import ADR](https://github.com/MythologIQ-Labs-LLC/qortara-logic/blob/main/docs/adr/0021-distribution-and-predecessor-import.md), [skill heritage](https://github.com/MythologIQ-Labs-LLC/qortara-logic/blob/main/docs/transfer/skill-heritage-audit-2026-10-16.md), [remote MCP boundary](https://github.com/MythologIQ-Labs-LLC/qortara-logic/blob/main/docs/remote-mcp-release-contract-v1.md).

### Owner naming correction: QOR canon (2026-11-12)

The owner explicitly confirmed that **`qor-*` supersedes `ql-*`** for Qor governance skills. The `ql-*` metadata observed under 20 existing `.agents/skills/qor-*` directories and the inert `.claude/skills/ql-*` bundler pattern are **legacy defects**, not accepted alternative identifiers. An active skill's directory and frontmatter `name` must both use the same `qor-*` identifier; reject legacy `ql-*` active manifests, bundler paths and install receipts in tests. Keep historical evidence verbatim. Do not edit the independently frozen Qor-Logic 0.176.1 distribution by side effect.

For the VS Code agent-facing first slice, the candidate **thin adapter skill names** are `qor-preflight`, `qor-review-change`, and `qor-release-readiness` (subject to native design audit and duplication review). These adapt, **not duplicate**, the accepted existing Qor workflows and FailSafe services. In particular, the formal `qor-audit` Tribunal is **not** interchangeable with Sentinel's file audit; `qor-repo-release` cannot confer release authority on an agent. Begin with only `qor-preflight`, prove metadata/VSIX discovery, and keep the rest contingent on real authenticated capability. Owner naming correction supersedes any previous `failsafe-*` integration-wrapper examples in this draft.

## 2026-11-12 upstream update: VS Code 1.146 (design-only, no compatibility PASS)

> **Scope and authority.** Source-verified upstream and FailSafe repository review. This section updates the **research baseline**, not the installed-host acceptance matrix in §3. Every runtime row stays `unverified` until #326 records a real run. The August 19, 2026 material below is retained as historical context and must not be read as current upstream status. This is a **proposed architecture decision**, not a /qor-audit PASS, seal, implementation authorization, or claim of working integration. No change to v6.0.13 scope.

### Changes since the 1.134 snapshot

| Surface | Verified upstream 1.146 fact | FailSafe impact / qualified state |
| --- | --- | --- |
| Harness lifecycle | Copilot has been the default harness for new sessions since 1.143. Local is **deprecated** in 1.146 with removal planned for February 2027. | Stop treating extension-host/local-session access as a durable route to agents. Explicitly test Copilot, not only Local. |
| `@failsafe` participant | The Chat Participant API is deprecated and **not supported by the Copilot harness**. It remains only for Local compatibility. | Preserve legacy support until a governed migration; do not claim `@failsafe` will work in Copilot Agent Host sessions. Map each command to skill, MCP tool, extension command, or UI. |
| Extensions in Agents window | Agent Customizations can install/uninstall extensions and manage their Agents-window enablement independently of editor windows; unsupported views/status bars/debuggers/walkthroughs warn. Experimental. | The existing `failsafe.configureAgentsWindow` opt-in flow needs live revalidation in 1.146; installation/activation does **not** automatically expose agent-callable tools. |
| Agent Inbox | Experimental `sessions.list.inboxEnabled` groups sessions into attention, Working, Ready to merge, On hold, Done; `sessions.list.inlineActions` adds fix-checks/review-comment actions. | VS Code owns triage, not governance eligibility. **No public API to inject arbitrary FailSafe Inbox rows was verified in this research**. Do not clone the Inbox or advertise native integration. |
| Native skills | Extensions may contribute standards-compliant `contributes.chatSkills` paths to `SKILL.md`. Connected MCP servers may supply skills through experimental SEP-2640 with `chat.agentHost.mcpSkills.enabled`. | The FailSafe 6.0.12 manifest declares no `chatSkills`. A canonical small skill source is a plausible packaging-first slice; do not conflate skill instructions with enforcement. |
| Plugins / hooks | Agent Plugins can bundle skills, hooks and MCP. Copilot `preToolUse` may deny a call; **timeouts can fall back to normal permissions**, and `postToolUse` cannot undo side effects. | Hook experiments are advisory until the exact harness, events, timeout/error behavior and denial coverage are falsified. No universal pre-write blocking claim. |
| MCP issue | microsoft/vscode#317460 (extension-contributed MCP missing from Agents window) closed on 2026-11-08. | Closed upstream issue is **not** a FailSafe conformance test. FailSafe's own in-process `FailSafeMCPServer` remains inaccessible to an external client according to its canonical integration contract. B209 remains a separate proposed bridge. |
| Host protocol / external harnesses | Agent Host and AHP manage long-lived sessions; microsoft/vscode#325827 still requests public registration of external harnesses, and #318103 still requests standard Agents-window extension-development debugging. | Keep B207 as a research/watchlist item. Do not depend on private AHP/Inbox internals for policy or attribute sessions from guessed identifiers. |

**Primary upstream references (checked 2026-11-12):**
- VS Code 1.146 release: https://code.visualstudio.com/updates/v1_146
- Agent Skills and MCP skill trust/setting: https://code.visualstudio.com/docs/agent-customization/agent-skills
- Extension `chatSkills` contribution contract: https://code.visualstudio.com/api/references/contribution-points#contributes.chatSkills
- Chat Participant migration/deprecation: https://code.visualstudio.com/api/extension-guides/ai/chat
- Copilot hooks, event fields and timeout caveat: https://code.visualstudio.com/docs/agent-customization/hooks
- Agent Plugin architecture: https://code.visualstudio.com/docs/agent-customization/agent-plugins
- Upstream issues: https://github.com/microsoft/vscode/issues/317460, https://github.com/microsoft/vscode/issues/325827, https://github.com/microsoft/vscode/issues/318103

## Version targeting and audited implementation boundaries (proposed 2026-11-12)

**Candidate target: FailSafe v6.1.0** (first post-v6.0.13 feature release), **not** v6.0.13. This is a version-planning recommendation, not a release tag, owner GO, accepted native audit, or implementation authorization. No release date is promised: the **external upstream February 2027 Local-harness retirement** makes timely migration valuable, but cannot justify relaxing release qualification.

| Release | Proposed scope | Stop rule |
| --- | --- | --- |
| v6.0.13 | Existing Statewright handoff and mandatory G4/release gates only | No agent-native scope expansion. |
| v6.0.14 (conditional) | Only an independently justified backward-compatible bug/compatibility patch | Do not silently ship skills/MCP feature work in a patch. |
| **v6.1.0** | First *genuinely usable* Copilot-harness integration: native discoverable FailSafe skills; B209 external MCP status/audit transport with real authorization and explicit refusal; migration of supported `@failsafe` read-only actions and appropriate human-approval handoffs; actual installed-host validation. | Do not ship if either skill discovery or real external tool execution is unproven. Do not expose owner decision/seal/L3 approval as an agent-autonomous operation. |
| v6.1.x (future candidates) | Optional Cursor and Antigravity host-specific integration, session correlation/Inbox UX if a public API exists, hook coverage improvements | Each host/runtime needs explicit qualification; no inferred parity. |

**Source mapping / packaging hazards discovered:** `FailSafeChatParticipant.ts` handles `intent`, `audit`, `trust`, `status`, `seal` (and a `risk` case not listed in its `chatParticipants` manifest). The `seal` handler only offers a VS Code confirmation button; it does **not** independently seal. Its no-intent response says *all file writes are blocked*, which is not generally true given the documented editor-save observation limitation (#505): the migration must correct, not propagate, that statement.

The repository's `.agents/skills/qor-audit/SKILL.md` and `qor-status/SKILL.md` are **not extension-ready as-is**: sampled YAML headers declare `name: ql-audit` / `ql-status` under `qor-audit` / `qor-status` folders, plus a second frontmatter-looking header; VS Code requires `name` to match the parent directory or silently does not load the skill. Do not bulk-register existing `.agents` skill folders, and do not assume their contents are a qualified stable runtime API. Create reviewed thin wrappers with valid Agent Skills metadata and provenance/pins for frozen Qor-Logic 0.176.1; preserve its frozen source.

The extension's `.vscodeignore` excludes `*.md` by default and omits `dist/extension/skills/**`; any newly packaged `skills/*/SKILL.md` must be explicitly retained and checked **inside the final target-specific VSIX**, not just on disk. The manifest currently supports VS Code `^1.101.0`; raising the whole-extension minimum to 1.146 would lock out existing installations. Make support-floor/backward-compatibility a reviewed decision, and test old-host behavior instead of silently changing `engines.vscode`.

**Suggested first v6.1.0 vertical slice:** an agent discovers `qor-preflight`, calls real external `qorelogic_status` over the B209 bridge, receives truthful active-intent/lock/unavailable state; `qor-review-change` can request a properly scoped audit with a validated intent and only report source-bound results; `qor-release-readiness` gathers *read-only* qualification evidence and links the operator to existing seal/release controls. No agent self-attested PASS, unsupervised commit, L3 decision, or release. All denied attempts leave auditable outcomes where appropriate.

**Qualification checklist:** exact VS Code build + Copilot harness; real newly installed signed/target-specific VSIX; skill metadata valid, embedded asset hash/path and actual discovery; external MCP client success + stale intent/forged caller/worktree swap/timeout/unavailable refusal; operator confirmation untouched; source/receipt binding; old-host downgrade; protected worktree/ledger effects; independent native Qor PASS, CI and installed user-path proof. Track #326, #662, B209 and B207 separately. Avoid making Cursor or Antigravity parity a blocker for the first explicitly VS Code Copilot-qualified slice if they are truthfully disclosed as unverified.

### B209: bridge security contract (source-checked 2026-11-12; issue #664)

> **Design only.** Dedicated [B209 issue #664](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/664) holds the proposed service/API boundary and executable negative tests. That issue is not a native audit, accepted implementation plan, or permission to widen the v6.0.13 release.

**Confirmed current semantics (not yet tested as a reachable external MCP server):**

| Current surface | Observed source behavior | Release implication |
| --- | --- | --- |
| `FailSafeMCPServer.start` (`FailSafeServer.ts`) | Attaches `StdioServerTransport` inside the VS Code extension host; no spawnable MCP entrypoint for Agent Host | B209 must produce an actual process-accessible transport; don't advertise a ghost `.mcp.json` entry |
| `qorelogic_status` | Returns hard-coded `status: "ACTIVE"`, lock bool and current intent ID | Presence is not a trusted/verified policy decision; return a truthful checked/unverified/unavailable state |
| `sentinel_audit_file` | Matches caller-provided intent ID to `getActiveIntent()` and tests path via `getWorkspaceFolder(Uri.file(path))` | An intent ID is not client authentication or a verification receipt; protect against symlinks/junctions and cross-worktree confusion |
| `ledger_log_decision` | Appends `PROPOSAL` with shared `agentDid: "did:mcp:external"` | Do **not** expose in v6.1.0; agent-authored text is not owner-authenticated approval |
| `failsafe.create_risk` | Registers a risk-store mutation when RiskManager exists | Excluded from the first external tool surface; separate future authorization review |
| Console `/api/hub` and `consoleHostGuard` | Generic read API plus loopback Host/Origin/browser protections | Those checks do not authenticate local processes, so never proxy the general Console API wholesale |
| `commit-check` | Shared-hook token; HTTP failures/invalid token intentionally result in shell-hook *fail open* | **Do not copy** this failure contract for MCP. Missing authorization or unavailable runtime must refuse the tool operation |

**Recommended authority order:** agent discovers reviewed packaged skill → user explicitly enables a real bundled local MCP bridge → bridge authenticates to a narrowly scoped governance broker → broker resolves immutable/verified repository and worktree context and current subject-bound policy evidence → authoritative engine answers **verified, unverified, unavailable or denied** → agent receives only bounded result/evidence. No duplicate policy evaluator; no broad mutable Console route forwarding. An attacker already running as the same OS user is not isolated simply by using a local bearer token; document that threat limit rather than implying a sandbox.

**First release capabilities:** read-only status and scoped Sentinel audit with possible diagnostic side-effects disclosed. Defer risk/ledger mutations, seal, L3 approvals, break-glass, change of enforcement mode, committing, and releasing. An agent cannot mint authorization by quoting an intent ID. Skill instructions are hints, never an enforcement mechanism.

**Packaging/compatibility acceptance:** the exact target-specific VSIX must contain correctly named `skills/qor-*/SKILL.md` content and a launchable, verified, non-workspace-controlled MCP executable; `.vscodeignore` currently excludes `*.md` and legacy `dist/extension/skills/**`. Audit package contents and installation separately. The extension manifest's current `engines.vscode: ^1.101.0` floor must not be raised without a backward-compatibility decision. No assumption that VS Code, Cursor, Antigravity or a remote Agent Host share the same extension runtime. Validate each supported host/harness combination.

**External falsification:** invalid/replayed/cross-workspace credentials, forged intent/ledger, stale policy, symlink/junction/UNC path escape, concurrent worktrees, session restart, missing host, cancellation, timeout and tool-input floods must not produce a PASS, a false attribution or unintended mutation. Actual registered server discovery, authenticated MCP tool call and denial must be witnessed in a supported 1.146 Copilot Agent Host session, and issue #326 still requires its separate operator visual/worktree matrix.


### Proposed architecture decision: agent-native, runtime-independent FailSafe governance

**Owner-approved strategic direction (2026-11-12); technical qualification and native Qor audit pending.**

- **D1 — Host owns orchestration.** Leave session lists, Inbox, worktree orchestration and merge UX with VS Code and its harnesses. FailSafe supplies governance facts, qualification outcomes and evidence links only through documented integration APIs.
- **D2 — Governance authority is independent.** Native policy, owner decisions, intent/ledger verification and release gates remain in FailSafe; an agent skill or hook is never a source of governance authority. No agent self-attestation of PASS or approval.
- **D3 — One canonical skill source, multiple adapters.** Evaluate three thin, discoverable workflows (`qor-preflight`, `qor-review-change`, `qor-release-readiness`) reusing the existing Qor/SHIELD process; validate extension `chatSkills` first, then optional Agent Plugin and MCP-skills distribution. Avoid duplicate skill implementations or a second policy engine.
- **D4 — External invocation requires an actual bridge.** B209 is the prerequisite for external MCP tool invocation. Before making it callable, independently review authentication and authorization, subject-bound receipts, workspace root/worktree identity, local-only transport, explicit refusal/degraded states, and caller privilege. No silent local HTTP trust or agent-generated owner approval.
- **D5 — Session evidence is conditional on trustworthy identity.** B207 and #326 should inventory **documented** session/worktree/commit identifiers and coverage boundaries, including the new Inbox categories; missing attribution remains `unobserved`, never assumed governed.
- **D6 — Compatibility is host × harness × execution context.** Qualify VS Code 1.146 Copilot-host sessions first; test Cursor and Antigravity separately (including standalone IDE vs VS Code extension) before any public parity claims. Multi-worktree, remote, virtual, disconnected and cross-profile behavior need separate evidence.

**Delivery order, all outside v6.0.13:**
1. **#326**: execute the *existing* `FailSafe/extension/scripts/agents-window-phase-d-probe.cjs` from a terminal inside a live 1.146 Agents window; record installed FailSafe version, visible commands, chat behavior, warnings/views/status bars, worktree mode-dependent commit outcomes and exact ledger paths. Do not mark matrix rows PASS based on this desk review. The script is a collector (exit code 0), not a governance gate.
2. **Design-only skills slice**: identify current shipped Qor skill provenance and mapping; produce a packaging contract with explicit minimum VS Code version and downgrade behavior, before code. Preserve the old `@failsafe` path only for actually supported hosts.
3. **B209**: separate threat model, native `/qor-plan` → `/qor-audit` PASS before implementation, external-client success and negative tests (untrusted caller, stale/forged intent, absent extension, malformed request, simultaneous worktrees, transport loss, timeout, absent seal). Do not infer authorization from successful MCP connection.
4. **B207 + Inbox**: research supported session-correlation interfaces and describe fallback behavior; avoid undocumented internals and a second session manager.

**Evidence / closure rules:** Desktop compatibility remains **BLOCKED_EXTERNAL** until operator evidence is posted to #326. A documentation PR does not satisfy that gate. A valid skill discovery test must show the skill in a new Copilot session and successfully invoke a real approved workflow; existence of the Markdown file is insufficient. A live MCP test must use an **external process**, and denial tests must prove no unauthorized policy mutation. CI success does not imply production acceptance. Nothing in this proposal merges, ships, seals or publishes implementation.


> **Snapshot as of VS Code 1.134, observed 2026-08-19** (supersedes the 1.128/2026-07-13 snapshot; deep-dive brief at META_LEDGER Entry #517, baselines #457/#466). The Agents window is still an upstream **PREVIEW** feature ("Use the Agents window (Preview)" — https://code.visualstudio.com/docs/agents/run/agents-window, observed 2026-08-19) on a weekly stable cadence. **This document goes stale fast.** Re-run the #83 revalidation when ANY trigger fires:
> 1. The docs page drops the preview banner.
> 2. microsoft/vscode#325827 (extension API for external agent harnesses) or #305332 (AHP customizations) ships.
> 3. microsoft/vscode#317460 (extension-contributed MCP) closes.
>
> **Nothing in this document claims validated compatibility.** Every matrix row carries validation state `unverified`. FailSafe has NOT been tested inside the Agents window; expected-status is a FailSafe-side engineering expectation, not an upstream guarantee.

## 1. What it is / how to open

A dedicated, chat-first VS Code window that works across workspaces and runs/tracks multiple agent sessions in parallel. **Five harness types** (https://code.visualstudio.com/docs/agents/run/agent-harnesses, observed 2026-08-19): **Local** (runs in the extension host, current workspace), **Copilot**, **Claude**, **Codex** (all three on the **Agent Host**), and **Cloud** (remote, GitHub-backed repos). Open via the "Open in Agents" title-bar button, `Chat: Open Agents Window`, `code --agents`, or `https://insiders.vscode.dev/agents`. Since 1.133, `chat.agentHost.allowSignedOutWhenUsable` (experimental) allows signed-out use when Claude/Codex credentials exist (#318578).

**The Agent Host re-architecture (1.129→1.134) is the defining change**: agent sessions run in their own processes speaking the **Agent Host Protocol (AHP)** — state lives in the host, survives window close, renders into multiple windows, and runs remotely over WebSocket (https://code.visualstudio.com/docs/agents/concepts/agent-host). Only the Local harness still runs in the extension host. Third-party harnesses are hardcoded (Claude/Codex); an extension API to register external harnesses is open feature request microsoft/vscode#325827.

## 2. Opting FailSafe in

> **Guided path:** run `FailSafe: Configure VS Code Agents Window Governance` (`failsafe.configureAgentsWindow`, shipped with #83 B+C) — it walks the user-setting opt-in, worktree commit-hook install, and governed `.mcp.json` integration install without writing any user-level setting itself.

```jsonc
// USER settings, default profile. There is NO package.json manifest key —
// enablement is entirely user-side; FailSafe cannot self-opt-in.
"extensions.supportAgentsWindow": {
  "MythologIQ.mythologiq-failsafe": true
}
```

Constraints (upstream, observed 2026-08-19):
- The extension **must be installed in the default VS Code profile** (the Agents window shares the GitHub account, settings, and default profile with the main window).
- Static-content-only extensions activate automatically; everything else needs the per-ID user opt-in. "Extension support is still evolving" is the only official posture; no compatibility list is published and no Agents-window-specific activation events exist.

## 3. Compatibility matrix (ALL rows unverified)

| FailSafe surface | In-repo anchor | Expected status | Validation state | Rationale |
|---|---|---|---|---|
| `failsafe.*` command palette commands (~50) | FailSafe/extension/package.json `contributes.commands` | EXPECTED-DURABLE | unverified | Core contribution class; no upstream exclusion signal. Applies to the window's own extension host — NOT to Agent Host sessions |
| Validation tasks / git hooks (SHIELD gates) | tools/ + .githooks/ + CommitGuard | EXPECTED-DURABLE | unverified | Workspace-level execution; fires in every worktree regardless of harness. NOTE: CommitGuard currently HARD-FAILS in worktrees and its commit-check endpoint does not exist (Entry #517) — Phase A repairs precede reliance |
| Workspace `.mcp.json` / `~/.copilot/mcp-config.json` MCP servers | user/workspace MCP config (FailSafe contributes NO extension MCP definition — Entry #457 DRIFT-1) | EXPECTED-DURABLE | unverified | VS Code forwards MCP config to the Agent Host EXCEPT `${input:}` servers (https://code.visualstudio.com/docs/copilot/customization/mcp-servers); this is the sanctioned channel |
| Extension-registered MCP (`lm.registerMcpServerDefinitionProvider`) | (none shipped) | EXPECTED-BROKEN | unverified | microsoft/vscode#317460 OPEN (assigned, no milestone): extension-contributed MCP does not surface in the Agents window |
| `@failsafe` chat participant + extension chat tools | package.json `chatParticipants`, FailSafeChatParticipant.ts | EXPECTED-BROKEN in Agent Host sessions; EXPECTED-UNKNOWN in Local-harness chats | unverified | Now CITABLE: "extension-provided chat tools are only available in chats in an editor window where the extension is running" — not in Agent Host sessions (Agent Host doc, observed 2026-08-19); Cloud sessions get no VS Code tools at all |
| Sidebar webview (`failsafe.sidebarView`) | package.json `views` block | EXPECTED-FRAGILE | unverified | The window's documented UI is chat/session/changes/terminal/browser — no documented extension view-container surface; no official exclusion list either |
| Status bars (AgentHealthIndicator, GovernanceStatusBar) | AgentHealthIndicator.ts; GovernanceStatusBar.ts | EXPECTED-FRAGILE | unverified | Same undocumented-surface caveat |
| Agent Plugins 1.0 package (`plugin.json` + `skills/` + `mcp.json`) | (not yet shipped; candidate: qor-skills + governance MCP) | EXPECTED-DURABLE | unverified | New portable customization standard (1.133); forward-looking first-class packaging for FailSafe governance content |

(Vocabulary: EXPECTED-DURABLE / EXPECTED-FRAGILE / EXPECTED-BROKEN / EXPECTED-UNKNOWN. `unverified` is the sole verification signal.)

## 4. Governing Agents-window sessions — the durable channels

With agent runtime outside the extension host, extension-host interception cannot see Agent Host sessions. FailSafe's leverage reduces to four workspace-file-shaped channels (deep-dive Entry #517):
1. **The repo itself** — worktree-aware `governanceRoot` (Phase A) so `.failsafe/**`, META_LEDGER, intents, and the runtime-mode mirror resolve to the MAIN checkout from any worktree session.
2. **Git hooks** — the strongest enforcement point under the worktree default of **Bypass Approvals** (VS Code's own approval layer is off in worktree sessions); requires the Phase A CommitGuard repair.
3. **Workspace `.mcp.json`** — governance MCP config the Agent Host forwards.
4. **Agent Plugins 1.0** — a FailSafe plugin package (skills + instructions + MCP) as first-class packaging.
Do NOT design workflows around the sidebar Command Center, status bars, or extension chat tools inside Agent Host sessions.


### 4.x MCP reality check (#83 B, 2026-08-19)

FailSafe's own MCP server (`src/mcp/FailSafeServer.ts`) runs **in-process in the extension host** — there is no standalone spawnable entry, so a workspace `.mcp.json` entry naming FailSafe would be a ghost config the Agent Host cannot launch. Until the standalone governance MCP bridge ships (**BACKLOG [B209]**: a thin stdio-MCP client proxying to the ConsoleServer HTTP API, esbuild-bundled like `dist/acp-proxy.js`), route MCP needs through the governed catalog installer (`FailSafe: Install MCP Integration (governed)`), which writes real, launchable entries.

### 4.y Agent Plugin package — DRAFT (not shipped, no compatibility claim)

Agent Plugins 1.0 (VS Code 1.133) would package FailSafe governance as `failsafe-plugin/`:

```text
failsafe-plugin/
├── plugin.json          # name, version, description
├── skills/              # the qor-logic SHIELD skill corpus (same payload the
│                        #   Install QorLogic Skills machinery deploys today)
└── mcp.json             # BLOCKED on [B209] — no standalone server to declare
```

This section is a design draft only: nothing ships until [B209] gives `mcp.json` something real to point at, and the Agents window remains upstream-preview (no validated-compatibility claims, per this document's standing posture).

## 5. Worktree isolation (present-tense risk, now sharper)

> **#83 Phase A shipped (2026-08-19):** CommitGuard is worktree-correct (hooks in the common `.git/hooks`, token in the per-checkout gitDir), the `commit-check` route exists with the hook's port tracking the live Console server, and `ConfigManager.getGovernanceRoot()` provides the canonical repository root. The split-state threading below (ledger/intents/risks per worktree) remains parked.

Worktree isolation is opt-in per session ("New Worktree" checkbox; Claude and Codex too since 1.130). Worktrees live **sibling to the repo** (`<repo>.worktrees/<name>` — bug-report evidence #325527/#293139, not contract), start from the **committed state** of the base branch (no uncommitted/ignored files; `git.worktreeIncludeFiles` copies named ignored files), and **default to Bypass Approvals**.

Consequences for FailSafe today (full inventory: Entry #517 brief):
- A worktree session gets `docs/META_LEDGER.md` (committed) but **no `.failsafe/`** (gitignored) — governance state splits per worktree; `WorkspaceMutationBus` watchers silently no-op on absent paths.
- `CommitGuard.install()` throws ENOTDIR (`.git` is a file in worktrees).
- The Devin ACP twin registry is single-slot: the last session to install wins, and the proxy then enforces against a foreign worktree's intent/ledger.
- Until Phase A lands, **one-repo-one-session remains the supported governance topology**.

## 6. Upstream record (observed 2026-08-19)

| # | Item | Source | Status |
|---|---|---|---|
| 1 | Agents window still Preview | docs page | "Preview" in title |
| 2 | Agent Host / AHP architecture | 1.129–1.134 release notes + Agent Host doc | SHIPPED (no longer "mid-rearchitecture") |
| 3 | Extension-contributed MCP unavailable | microsoft/vscode#317460 | OPEN, assigned, no milestone |
| 4 | External-harness extension API | microsoft/vscode#325827 | OPEN feature request, no milestone |
| 5 | AHP customizations (per-session .agent.md etc.) | microsoft/vscode#305332 | OPEN, P1 |
| 6 | Dev Containers unsupported in Agents window | microsoft/vscode#315116 | OPEN |
| 7 | Signed-out access (Claude/Codex creds) | 1.133 notes, #318578 | experimental setting |
| 8 | Extension-host topology inside the window; restricted-surface enumeration | — | UNDOCUMENTED upstream (honestly unknown) |

**Legal next action**: Phase A (worktree-aware governanceRoot + CommitGuard/commit-check repair — fixes shipped defects independent of the Agents window), then Phase C (Configure command) and Phase D (human validation of this matrix in a live Agents window). Phases defined in Entry #517.

## 7. Agent Host Protocol (AHP) — shipped architecture, adapter seam

AHP is public (https://github.com/microsoft/agent-host-protocol, MIT; multi-language client libraries) and now THE session transport (local and remote). It is the protocol-level governance seam parallel to FailSafe's ACP enforce-proxy: an AHP client could observe/govern agent sessions without ANY Agents-window extension support — and given the extension-host exclusion (§4), it is likely the only path to *enforcement* (vs file-level governance) for Agent Host sessions. Tracked as BACKLOG [B207]; #325827/#305332 are the API seams to watch.

---

_Maintained under GOVERNANCE_INDEX Tier 5. Drift signal: any §6 trigger fires, or the observation date exceeds one VS Code stable cycle without revalidation._
