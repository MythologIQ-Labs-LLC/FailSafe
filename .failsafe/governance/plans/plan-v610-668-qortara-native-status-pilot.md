# Prospective /qor-plan: FailSafe 6.1.0, Qortara Logic native read-only status pilot (#668)

**Status:** PROPOSED, AWAITING NATIVE GOVERNANCE AUDIT. This Markdown file is an implementation-intent artifact, **not** a recorded /qor-plan gate, approved intent lock, independent /qor-audit PASS, release authorization, install consent or completed test evidence.
**Authoring date:** 2026-11-13. **Iteration:** 0 (candidate for operator-native plan registration).
**Base:** FailSafe main `26c1161adc440c00ee29c6b053bb5953d27e8a38` (published 6.0.13 source).
**Branch:** `plan/v610-668-qortara-native-status-pilot`; **target:** `main`, **feature release:** 6.1.0.
**Owner authority:** [#679](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/679) P0 and [#668](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/668) no-retirement-before-proof. [#662](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/662) agent-host work; [#463](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/463) frozen 0.176.1. This is an additive first slice, not wholesale Qor replacement.
**Risk:** proposed **L3**, due to creating an executable child process, resolving a project root, consuming governance evidence, potential host credential exposure, proprietary dependency and false ALLOW claims; auditor may raise requirements.
**Native gate sequence (not performed here):** prospective /qor-plan registration -> independent /qor-audit PASS bound to this revision/plan -> /qor-implement on separately approved feature branch -> tests and /qor-substantiate -> owner GO for integration and eventual release. Do not fabricate any of these records.

## Live-main drift checkpoint (2026-11-13)

After this plan branch was cut, FailSafe `main` advanced from `26c1161adc440c00ee29c6b053bb5953d27e8a38` to `3fc19439e4b57f3bbba8db1ba092882ceb73528b`. The GitHub compare reports **13 additional commits**, including post-publication v6.0.13 evidence, VSIX qualification runner changes, README/release/status/ledger updates and a lockfile change. It does **not** list edits to the planned native MCP client implementation modules, but the ledger, issue baseline and public docs **did change**. The plan's base line above remains the truthful branch-base identity; it is **not** a claim that main is still at that SHA. Before the native audit and any code branch, re-fetch current main and ledger, reconcile applicability/authority, rebase/recreate from current main through the protected PR workflow, and bind the audit to the resulting exact source SHA. This source comparison is not a governance audit.

## Upstream and host-authority drift checkpoint (2026-11-14; prospective, not an audit)

- Qortara Logic upstream advanced from the originally surveyed `1ac98bd27ba321d81e925759ac144dedb41cec8c` through `725c5854` to `b98aa3b0df159cb37d335a906e763af0d8e3de9e`. Since `725c5854`, merged PRs #286 / #291 / #293 added mandatory root architecture routing, owner-register impact detection and host-verifiable owner-signed architecture acceptance. These are **upstream source developments**, not a pinned licensable native distribution, installed-host qualification or accepted FailSafe integration. Re-evaluate exact native status contracts against the artifact actually selected at audit.
- Upstream `docs/adr/0026-host-trusted-architecture-acceptance.md` explicitly remains an **owner-directed implementation candidate**, not independently accepted or deployed enforcement. Its host check binds subject-owner key, exact revision/paths/digest, accepted governance tip and separate-principal custody; signed or structurally valid source alone never grants execution authorization. Same-user agent access to an operator-private profile is **not** a strong authority boundary. Do not equate Qortara architecture acceptance with FailSafe's separately governed root `ARCHITECTURE_INDEX.md` or with `qor-status` parity.
- The connected hosted Qortara tool still reports engine `0.1.0.dev0`, contract `1.3`, backend `2e75eca1daba6860dff9b1b124553f29da9dbe27`, twelve read-only tools and `hostedExecutionEnabled=false`. It explicitly excludes local `qortara_status`; neither hosted introspection nor the latest upstream source proves a native Windows VS Code agent host call. GitHub's Qortara Logic release list is empty, so a source commit is not an approved binary artifact.
- **Scope separation:** Phase B remains only opt-in, local read-only `qortara_capabilities` and `qortara_status`, with zero authority to permit writes or retire skills. Broader architecture-owner parity and signed decision custody are a later **separately audited and accepted** successor capability. For a status observation that reports architecture acceptance, label unverified host custody `unverified` and refuse to derive a global `PASS` or a Qor-retirement decision. Add eventual parity negatives for stale owner tip, wrong subject/key, dirty ADR, same-user custody spoofing and no privileged host enforcement under #668.
- The plan branch's FailSafe base remains published `26c1161...`, while current protected main advanced to `0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc` as of this checkpoint. Before native `/qor-plan` registration or implementation, reconcile the full base-to-main diff and re-bind the approved exact source, code write set, trust boundary and reviewer. This prospective note is not a signed governance receipt, license approval or consent to run the launcher.

## User outcome / acceptance boundary

A developer using an **installed** FailSafe 6.1.0 VSIX in a real **VS Code 1.146 Copilot Agent Host** may **explicitly opt in** to an approved, version-pinned native Qortara Logic integration. The host can run one **real** bounded **read-only** `qortara_status` (or `qortara status`) against an explicitly authorized isolated repository/worktree. FailSafe reports the Qortara engine/artifact source, actual active workspace and the tool's authoritative refusal or result, and can compare that with the legacy frozen Qor status on the same revision **without deleting or replacing any Qor skill or receipt**. The opt-in pilot is not accepted until the installed VSIX/host test and at least one meaningful negative case pass. A source `SKILL.md`, five hosted orchestrators, `tools/list`, unit tests or documentation alone is not acceptance.

**First-slice exclusions:** no Qor skill retirement; no new long-lived `qor-preflight` wrapper; no metadata bulk rewrite of `ql-*`; no runtime `qortara install`/uninstall/force; no Qortara hosted OAuth/token exchange; no automatic network egress; no governance gate write, release/owner approval, seal, historical import, `.qortara` mutation or `.failsafe` editing; no replacement of FailSafe Sentinel, SHIELD, TrustEngine, LedgerManager, BreakGlass, G4 or its native MCP (B209). The exact source/contract and approved license/distribution must be verified before any subprocess invocation.

## Exact source and existing reuse

| Owner | Source observed | Obligation |
| --- | --- | --- |
| FailSafe | `FailSafe/extension/src/qorlogic/QorLogicSkillIngestor.ts`, `qorHostReceiptVerify.ts`, `hostLayouts.ts`, `consumer/`; frozen wheel 0.176.1, tested-against marker 0.169.0 | Keep current APIs and verified on-disk installed-receipt behavior; never promote the tested-against marker without a real conformance PASS |
| FailSafe | `FailSafe/extension/src/integrations/mcp/McpClientHost.ts` (inspect actual path), `src/integrations/bicameral/BicameralMcpClient.ts`, `src/integrations/open-design/OpenDesignMcpClient.ts` | Reuse existing MCP client host, timeout/idle/dispose and explicit pre-call allowlist, rather than build a new transport; check exact path on target revision |
| FailSafe | `FailSafe/extension/src/extension/bootstrapQorLogic.ts` | It builds **FailSafe-local** ledger, policy, trust and shadow services, not the Qor Python skills; leave unchanged |
| Qortara | `qortara-logic@1ac98bd27ba321d81e925759ac144dedb41cec8c`, `src/qortara_logic_plugin/mcp_server.py`, `chatgpt_readonly_profile.py`, `src/qortara_logic_runtime/cli.py`, `src/qortara_logic_runtime/install.py` | Local stdio server exists, `--read-only` restricts discovery+dispatch; local `qortara_status` and `qortara_capabilities` are available, but **remote hosted MCP does not serve `qortara_status`**. Qortara writes its own `.qortara-installed.json` receipts; do not assume compatibility with `.qorlogic-installed.json` |
| Frozen Qor | `Qor-logic@40a8b38b99ca470773a95536bcd6aac81e37c156:qor/skills/memory/qor-status/SKILL.md`, blob `9879126de1ac1fec10073482af31f60b56093ee6` | Preflight `governance-health`, damaged/incomplete blocking, legacy artifact presence/risk route, index drift and tone are behaviors to account for |
| Qortara | `skill-source/skills/qortara-status/SKILL.md`, blob `eb49acef723be7bd3873ff041013a26fd627ecd3` | Reports `.qortara` session/phase/verdict/audit-plan binding and ledger tip; does **not** expressly perform frozen legacy `governance-health` and Governance Index drift checks |
| FailSafe-local | `.agents/skills/qor-status/SKILL.md`, blob `c0bbf18a52a4615e36066f4434866e10af533b46`; `.gemini/commands/qor-status.toml`, blob `7237c230364ee9c9528127d56d656890f023f147` | The local `.agents` variant has obsolete doubled `ql-status` metadata and uses a different audit path. Do not treat the two source variants as one verified runtime. Preserve existing supported host flows |

**Unverified at plan time:** actual package wheel checksum/distribution rights, live Windows native CLI version or host install, actual Qortara `status` structured response shape against current source and supported protocol, installed 6.1.0 VSIX result, Qor 0.176.1 updated conformance, operator-authenticated workspace root, native /qor-audit receipt. No conclusions from this research alone.

## Implementation phases after native audit PASS

### Phase A: dependency and trust admission (no customer behavior yet)

1. Resolve the exact Qortara 0.1.0.dev0 or later **approved, immutable distribution artifact**, SHA-256, Python 3.11+ interpreter, package version, trust/legal rights and signing/provenance. Engine source SHA is not proof of wheel identity; **do not fetch from PyPI or clone automatically**. A private repository cannot be bundled with Apache-2.0 VSIX by assumption.
2. Preflight an operator-provided **absolute, independently trusted** launcher/interpreter path outside the workspace; no shell, no bare command resolution through mutable PATH, no site-packages imported from the project directory, no agent-supplied environment, no project-driven `uv` configuration or auto-download, no model/API credential leakage. Apply existing Python interpreter safety and process abstraction; disclose if source code requires unimplemented safeguards.
3. Read but do not create/repair original `.qorlogic-installed.json`, and separately recognize Qortara `.qortara-installed.json`. Explicit reject if evidence roots, existing skills, symlinks, ownership, permissions, corrupted receipts or host namespaces collide. `qortara install --dry-run` may help in later phase **only after** approved runtime provenance; this slice never runs install.
4. Record exact local Qortara `qortara_capabilities` tool contract, Qortara version and allowed `qortara_status` existence; fail when contract is unrecognized, no project root, unsupported host or no verified runtime. Do **not** equate hosted contract 1.3 with native protocol/version conformance.

### Phase B: minimal FailSafe-owned read-only integration

1. Add a small opt-in native Qortara **client adapter** under `FailSafe/extension/src/integrations/` in a named bounded module; exact module path selected during audit, preserving existing `McpClientHost` ownership. Reuse the current MCP SDK and `StdioClientTransport`. Avoid a second MCP implementation or an HTTP bridge.
2. Disabled by default; operator explicitly enables/configures **per workspace** under a reviewable user-owned trust surface. A workspace file or agent cannot silently elevate a command path or enablement. Provide a non-connected `unavailable/unconfigured` status by default; no subprocess at extension activation.
3. The **only permitted calls** for Phase B are `qortara_capabilities` and `qortara_status`, both through local MCP `--read-only`. Every other tool name (including `qortara_record_gate`, install/uninstall, release, tag, exec, and unknown future tools) is blocked **before transport**. Filter both discovery-visible labels and dispatch calls; host transport allowlist must not trust a capability string returned by the Qortara server.
4. For status, bind the **realpath/canonical workspace and worktree**, log the provenance source without leaking secrets or raw repository contents, reject wrong/no/ambiguous project root, and present the **original source-specific verdict/refusal**. Failure/timeout/revoke must not become `active`, `PASS`, `available` or grant implicit write permission.
5. Expose bounded developer-visible statuses: `not-configured`, `available-read-only`, `unsupported`, `untrusted`, `unavailable`, `invalid-result`. Distinguish a valid Qortara `.qortara` status from a frozen `.qor`/FailSafe status, not a synthetic combined PASS. No ledger or skill file mutation.

### Phase C: equivalence and installed host (separate acceptance from Phase B)

1. Use one **throwaway repository** at pinned Git SHA with independent `.qor`, `.failsafe` and `.qortara` evidence, and separately qualified frozen Qor and native Qortara artifacts. Invoke the true predecessor `qor-status` workflow and Qortara `qortara-status` via supported host behavior, not only handwritten simulation.
2. Verify legacy `governance-health` damaged/incomplete distinction; missing first-use vs altered ledger; Governance Index drift; plan risk-grade routing; tampered/forged audit PASS; Qortara changed-plan `plan_bound=false`, invalid chain, wrong-root and unavailable cases. Old and new outputs need **equivalent user-safety decisions**, not matching strings. If Qortara does not cover a legacy diagnostic, FailSafe must continue owning and exposing that diagnostic or keep the predecessor skill active.
3. Prove **real installed VS Code 1.146 Copilot Agent Host** invocation plus denied call; test older supported VS Code, offline/network loss, operator cancellation, uninstall/rollback, fresh install and upgrade from v6.0.13, Windows path/permission races and both good/bad receipt checks. Run analogous tests on other hosts **only if** their support is claimed; do not infer Cursor/Antigravity compatibility from VS Code.
4. Write a row in #668's **single canonical succession register** with exact engine/wheel/skill/host SHA, positive/negative evidence, independent reviewer, explicit owner decision, rollback, and status. **No `qor-status` retirement in this first implementation PR.** Its independent succession approval is separate from the plugin integration's approval.

## Falsification tests (required implementation test inventory)

| ID | Test input or mutation | Required outcome |
| --- | --- | --- |
| QST-01 | Feature disabled/unconfigured on extension activation | **Zero subprocess launches, zero network requests, no added skill files** |
| QST-02 | Trusted approved launcher, clean isolated root, local MCP `initialize`, `tools/list`, capabilities and status | Read-only local status, exact contract provenance, no workspace mutation |
| QST-03 | Untrusted or project-root-planted Python/uv/launcher path or unpinned/mismatched package | **Refuse before process launch** and before reading project credentials |
| QST-04 | Operator-provided path escaping selected root via symlink/junction, or worktree/root switch during call | Refuse with correct root evidence; cannot access another workspace |
| QST-05 | `tools/call` attempt for `qortara_record_gate`, release/tag, arbitrary new or unknown MCP method | Host-side pre-dispatch **block**; no effect even if server advertises it |
| QST-06 | Forged, malformed, oversized, missing, stale or wrong-version MCP response; `isError` true | Typed `invalid-result`/`unsupported`/refused; no false healthy status |
| QST-07 | MCP client disconnect, server exit, timeout and operator cancel | Bounded cleanup, status unavailable, no retry-as-ALLOW |
| QST-08 | Existing frozen `.qorlogic-installed.json` and exact checked files | Snapshot hashes unchanged; no new install/uninstall or false 'retired' label |
| QST-09 | Changed plan bytes after audit, incorrect verdict body 'PASS', malformed chain, damaged predecessor governance | Fail-visible/refusal; not `ready` or `PASS` |
| QST-10 | `qor-status` source vs `qortara-status` with valid repo but legacy diagnostics only | Explicit `not-fully-equivalent`; retain Qor routes and warnings |
| QST-11 | Revoke or disable opt-in; change worktree to different SHA | Old status not reusable as current authority; clean disconnect, no host leakage |
| QST-12 | Real installed target VSIX (Windows VS Code 1.146 Copilot) and earlier version supported by engines.vscode | Document successful/unsupported native skills and MCP behavior with actual host details |
| QST-13 | Qortara BLOCK and Qor ALLOW on identical task | No fallback or merged ALLOW; show disagreement and stop |
| QST-14 | Partial install/upgrade failure or protected path collision | No partial skill overwrite, no forged receipt, independent manual recovery |
| QST-15 | Arbitrary tool description/prompt injection in MCP result or repo files | Data remains untrusted; no script execution, elevated approval or release action |
| QST-16 | Binary changed but claimed version unchanged; wheel/hash mismatch | Reject, not accepted as equivalent or installed-ready |

**Red-team mutation checks:** remove client pre-call allowlist, replace status `unavailable` with `ready`, trust MCP result root instead of verified root, silently permit auto-install, skip receipt/no-symlink check, treat GitHub/source mapping as per-skill PASS, and disable Qor when Qortara is up. Each mutant must fail a named behavioral or installed scenario. A green unit test alone does not establish host acceptance.

## Evidence, rollback and stop rules

- **Before code:** register this exact plan through native Qor governance; independent L3 /qor-audit PASS bound to resulting immutable plan+head, including architecture/ownership and licensing. If audit cannot be executed in this chat host, record BLOCKED_NATIVE_AUDIT, not a fabricated PASS.
- **At implementation:** separate `feat/668-...` branch, bounded modules and tests, no changes to protected/released v6.0.13 SHA, no customer-visible runtime disabled/removed without approval. Mandatory focused tests plus `npm run compile`, lint, `npm run test:node`, installed-host workflow, and target-specific `validate:vsix` / eight-platform packaging as applicable. Record exact commands/versions and outcomes, including negative results and remaining risks.
- **At review:** independent reviewer who did not author the code binds PASS to actual head SHA; require owner approval before merge, enablement, skill succession, tag or publication.
- **Rollback:** turn off opt-in and dispose native Qortara client, leaving original Qor 0.176.1 package, `.qorlogic-installed.json`, source-managed `qor-*` assets and FailSafe G4 store unchanged. Validate rollback in installed VSIX and active agent session. A denial from one engine must not be bypassed by using the other.
- **Stop:** missing approved/licensable native artifact, unexplained package/process identity, any receipt collision or mutation, root confusion, inability to demonstrate genuine local call/refusal, missing agent host access or a governance VETO. Declare exact blocker and keep first slice unshipped.

## Success criteria for this plan's completion

1. A real authorized customer-style host can configure, invoke and stop **read-only native Qortara status** without unapproved writes or network contact, and sees truthful provenance/refusal.
2. The integrated adapter has explicit absence/error/attack behavior and **does not** change FailSafe's frozen Qor package or local governance substrate.
3. A source-bound, independently reviewed **parity gap report** (at minimum `qor-status` against `qortara-status`) is recorded in #668; it does not claim per-skill retirement.
4. Installed Windows VS Code 1.146 evidence, regression test results, rollback proof and owner authorization are recorded at exact artifact SHA. If unavailable, the PR remains draft and the missing gate is reported, without suggesting release is complete.

**No release date or cutover is authorized by this plan. v6.1.0 is the owner-selected target, not a waiver of quality.**
