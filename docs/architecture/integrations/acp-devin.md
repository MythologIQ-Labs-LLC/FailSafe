# ACP governed proxy for Devin Desktop integration contract

Contract id: `acp-devin` (registry row `integration-contract-acp-devin`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review: none; no review in `docs/research/integrations/` covers ACP or Devin Desktop.

**Owned files:**
- `FailSafe/extension/src/integrations/acp/`
- `FailSafe/extension/src/extension/bootstrapAcpProxy.ts`

Not owned here: Devin host detection and agent-definition files under `FailSafe/extension/src/qorelogic/` (shared agent definitions; see the agent-config-injection contract). The mode mirror is written from `FailSafe/extension/src/extension/bootstrapAdvancedCommands.ts`, a shared bootstrap file.

## Customer job

A developer who runs coding agents inside Devin Desktop wants those agents' permission requests, file writes and terminal commands to pass through the same FailSafe governance mode as their editor, without changing the agent itself.

## Measurable value

Metric: the share of an agent's ACP permission, write and terminal requests that receive a FailSafe decision record; on main every such request routed through the proxy is decided and recorded `FailSafe/extension/src/integrations/acp/proxy/AcpProxyClientHandler.ts:79-81` (`await this.governor.governPermission(mapPermissionRequest(params))`).
Baseline: no usage data is collected, so the number of governed sessions is unverified.

## Why not simply ask an agent

An agent asked to "follow the policy" can ignore it; the proxy sits on the agent's JSON-RPC stream and withholds a denied write or terminal before Devin performs it, and writes a decision record the agent cannot edit through the protocol.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:61` (`ACP governance adapter`) links the Agent Client Protocol site and schema; the row still sits under "In review", which is stale (unverified as to when it was last refreshed).
`docs/integrations/INTEGRATION_DOCS_INDEX.md:62` (`Devin Desktop (formerly Windsurf)`) links the Devin Desktop ACP documentation.

## Privileges and scopes

No credential is used; the install command edits the user-writable Devin registry file `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:9-11` (`the only side effect is editing the user-writable ~/.windsurf/acp/registry.json`).
Registry locations are `.windsurf` (stable) and `.windsurf-next` (next) under the home directory `FailSafe/extension/src/integrations/acp/registry/DevinRegistryPaths.ts:18-22` (`const dir = channel === 'next' ? '.windsurf-next' : '.windsurf';`).
The proxy spawns the real agent as a child process and refuses an agent executable inside the governed workspace or its repository `FailSafe/extension/src/integrations/acp/proxy/AcpProxyEntry.ts:22-24` (`nothing inside the governed workspace, or the`).
Content and argv policy for writes and terminals would widen the shared action type and is marked requires separate approval `docs/BACKLOG.md:425` (`deep fs/terminal **content/argv policy**`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| governed-proxy-install | verified-shipped | `installFailSafeAgent` `FailSafe/extension/src/integrations/acp/registry/DevinRegistryWriter.ts:141` (`export function installFailSafeAgent(filePath: string, agent: DevinAgent)`) | `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:146` (`registerCommand('failsafe.acp.installGovernedProxy'`) | `FailSafe/extension/src/test/integrations/acp/registry/DevinRegistry.test.ts` (unit) | Command `FailSafe/extension/package.json:133-134` (`Install Governed ACP Proxy (Devin Desktop)`) |
| governed-proxy-uninstall | verified-shipped | `uninstallFailSafeAgent` `FailSafe/extension/src/integrations/acp/registry/DevinRegistryWriter.ts:147` (`export function uninstallFailSafeAgent(`) | `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:185` (`registerCommand('failsafe.acp.uninstallGovernedProxy'`) | `FailSafe/extension/src/test/integrations/acp/registry/DevinRegistry.test.ts` (unit) | - |
| proxy-enforcement | verified-shipped | `createWorkspaceAcpBacking` `FailSafe/extension/src/integrations/acp/proxy/backing/createWorkspaceAcpBacking.ts:27` (`export function createWorkspaceAcpBacking(workspaceRoot: string)`) | `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:127` (`path.join(context.extensionPath, 'dist', 'acp-proxy.js')`) | `FailSafe/extension/src/test/integrations/acp/proxy/AcpProxyEnforcement.test.ts` (unit) | Bundled from `FailSafe/extension/scripts/bundle.cjs:172-176` (`acpProxyBootstrap.ts`); Devin launches it from the twin entry |
| registry-drift-check | verified-shipped | `verifyGovernedProxyEntries` `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:66` (`export function verifyGovernedProxyEntries(`) | `FailSafe/extension/src/extension/main.ts:412` (`bootstrapAcpProxy(context, core.workspaceRoot);`) | `FailSafe/extension/src/test/extension/bootstrapAcpProxy.test.ts` (unit) | Warns only; never repairs the registry `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:62-64` (`mutates the registry itself`) |
| governance-mode-mirror | verified-shipped | `writeRuntimeModeOrInvalidate` `FailSafe/extension/src/integrations/acp/proxy/backing/runtimeMode.ts:64` (`export function writeRuntimeModeOrInvalidate(`) | `FailSafe/extension/src/extension/bootstrapAdvancedCommands.ts:46-47` (`writeRuntimeModeOrInvalidate(deps.workspaceRoot, mode as GovernanceMode)`) | `FailSafe/extension/src/test/integrations/acp/proxy/AcpProxyBacking.test.ts` (unit) | - |
| content-and-argv-policy | proposed | none | none | none | Deferred as B-INT-15 `docs/BACKLOG.md:425` (`ACP enforce-proxy — deep fs/terminal`) |

## Inbound fields

From the Devin registry: the agent list and each agent's per-platform `cmd` and `args` `FailSafe/extension/src/integrations/acp/registry/DevinRegistryWriter.ts:102-107` (`for (const [platform, spec] of Object.entries(source.distribution?.binary ?? {})) {`).
From the agent (through the proxy): `session/request_permission`, `fs/write_text_file` (path and content) and `terminal/create` (command, args, cwd) `FailSafe/extension/src/integrations/acp/proxy/AcpProxyClientHandler.ts:99-106` (`type: 'terminal_create',`).
From the workspace: the mirrored governance mode, read with a fail-closed default of enforce `FailSafe/extension/src/integrations/acp/proxy/backing/runtimeMode.ts:30-42` (`Missing/malformed → "enforce" (fail-closed)`).

## Outbound fields and egress

Repository content: no network transmission; write content is relayed only to Devin on the local stdio stream `FailSafe/extension/src/integrations/acp/proxy/AcpProxyClientHandler.ts:94-95` (`return this.devin.writeTextFile(params);`).
Metadata: no network egress; the extension side makes no network call `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:10` (`No network activity;`).
Graph relationships: no `FailSafe/extension/src/integrations/acp/proxy/AcpProxyGovernor.ts:28-37` (`export interface AcpGovernanceRecord {`).
Governance evidence: yes, locally: each decision is appended to the workspace ACP ledger file `FailSafe/extension/src/integrations/acp/proxy/backing/FileLedgerSink.ts:23` (`'acp-ledger.jsonl'`).
What the wrapped agent itself sends over the network is outside the proxy's view (unverified).

## Transformations

The source agent becomes a governed twin whose command is node, the proxy bundle, `--workspace <root>`, `--` and the original command `FailSafe/extension/src/integrations/acp/registry/DevinRegistryWriter.ts:103-107` (`args: [opts.proxyJsPath, '--workspace', opts.workspaceRoot, '--', spec.cmd, ...(spec.args ?? [])],`).
ACP frames become governable intents evaluated by the same EnforcementEngine the extension uses `FailSafe/extension/src/integrations/acp/proxy/backing/createWorkspaceAcpBacking.ts:28-35` (`const governanceInterceptor = new EngineBackedInterceptor(engine, ISSUED_BY);`).
A decision is blocked only when the mode is enforcing and the verdict is BLOCK, QUARANTINE, MODIFY or ESCALATE `FailSafe/extension/src/integrations/acp/proxy/AcpProxyGovernor.ts:101` (`const blocked = mode.enforcing && DENY_VERDICTS.has(receipt.verdict);`).

## Persisted artifacts

The governed twin entry in the Devin registry file, written by temp file and rename `FailSafe/extension/src/integrations/acp/registry/DevinRegistryWriter.ts:136-137` (`fs.renameSync(tmp, filePath);`).
The expected entry and the workspace it targets, in VS Code global state per channel `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:173-174` (`await context.globalState.update(expectedEntryStateKey(loc.channel), entry);`).
The mode mirror `.failsafe/governance/runtime-mode.json` `FailSafe/extension/src/integrations/acp/proxy/backing/runtimeMode.ts:27` (`'governance', 'runtime-mode.json'`).
The decision log `.failsafe/governance/acp-ledger.jsonl` `FailSafe/extension/src/integrations/acp/proxy/backing/FileLedgerSink.ts:28-30` (`fs.appendFileSync(this.file`).

## Graph links

Implemented: none; a decision record carries the target and verdict, not a link to an intent or receipt node `FailSafe/extension/src/integrations/acp/proxy/AcpProxyGovernor.ts:28-37` (`target?: string;`).
Proposed (not built): agent run to decision to receipt edges for the agent-run scenario in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Install Governed ACP Proxy (Devin Desktop)" and "FailSafe: Uninstall Governed ACP Proxy (Devin Desktop)" `FailSafe/extension/package.json:137-138` (`Uninstall Governed ACP Proxy (Devin Desktop)`).
Install asks for the Devin channel when both exist, then for the agent to govern `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:159-162` (`title: 'FailSafe: which agent to govern?'`).
In Devin the operator selects the entry named "FailSafe (governing <agent>)" `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:169` (`FailSafe (governing `).
There is no Console view for ACP decisions (unverified: no route reads `acp-ledger.jsonl`).

## Governance policy and enforceability limits

Enforced (enforce mode): a denied write or terminal is withheld and the agent receives an error `FailSafe/extension/src/integrations/acp/proxy/AcpProxyClientHandler.ts:93` (`if (dec.blocked) throw new AcpGovernanceDenied('fs/write_text_file'`).
Observed (observe and assist modes): decisions are recorded with `enforcing: false` and nothing is blocked `FailSafe/extension/src/integrations/acp/proxy/AcpProxyGovernor.ts:7-10` (`This module does NOT override observe mode`).
Limit: governance is cooperative-path; it covers only effects the agent requests through the ACP client, not files it writes or processes it starts directly `FailSafe/extension/src/integrations/acp/proxy/AcpProxyGovernor.ts:7` (`governance is cooperative-path`).
Limit: payloads (write content, terminal argv) are recorded but not policy-matched `docs/BACKLOG.md:425` (`is recorded for provenance but NOT policy-matched`).
Limit: the registry is unsigned and user-writable; tampering is detected at the next activation, not prevented `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:14-16` (`the registry is unsigned +`).

## Failure, offline, stale and permission semantics

Missing proxy bundle: install stops with an error `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:147-148` (`ACP proxy bundle missing at`).
No Devin registry: install warns and stops `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:131-134` (`No Devin Desktop ACP registry found`).
Missing or malformed mode mirror: the proxy assumes enforce `FailSafe/extension/src/integrations/acp/proxy/backing/runtimeMode.ts:41` (`return 'enforce';`).
A mirror write failure invalidates the old mirror so the proxy falls back to enforce `FailSafe/extension/src/extension/bootstrapAdvancedCommands.ts:48-51` (`invalidated the stale mirror`).
Stale: an entry intact but installed from another workspace, tampered, missing or unparseable produces a distinct warning `FailSafe/extension/src/extension/bootstrapAcpProxy.ts:94-97` (`no longer matches what FailSafe installed`).
A broken ledger file does not stop governance; the record is dropped `FailSafe/extension/src/integrations/acp/proxy/backing/FileLedgerSink.ts:31-32` (`a broken ledger file must not break governance`).

## End-to-end scenario and measurable acceptance

Scenario: in a workspace in enforce mode with no active intent, install the governed proxy for a Devin agent, select it in Devin, and have the agent request a file write; the write is withheld and a record with `blocked: true` is appended `FailSafe/extension/src/integrations/acp/proxy/AcpProxyGovernor.ts:28-37` (`blocked: boolean;`).
Metric: across observe, assist and enforce, a deny verdict blocks only in enforce (threshold: exact per-mode outcome) `FailSafe/extension/src/test/integrations/acp/proxy/AcpProxyEnforcement.test.ts:1-4` (`END-TO-END enforcement proof for the ACP enforce-proxy`).
Existing test depth: unit, against the real engine over a temporary workspace; no test runs Devin Desktop or a live ACP agent (unverified).
Installed-extension test: none (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The proxy, its install and its tamper warning are built and tested against the real enforcement engine; the honest limits (cooperative path, no payload policy) are stated in code and backlog. Payload policy (B-INT-15) is the next increment if Devin usage justifies it.

## Open defects

B-INT-15: write content and terminal argv are not policy-matched `docs/BACKLOG.md:425` (`[B-INT-15]`).
B228: ACP is not in the capability conformance suite `docs/BACKLOG.md:584` (`Extend the #474 capability conformance suite`).
