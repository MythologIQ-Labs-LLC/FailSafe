# Cline / Roo / Kilo MCP policy audit contract

Contract id: `agent-audit` (registry row `integration-contract-agent-audit`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_CLINE_ROO_KILO_CONTRACT_REVIEW.md`. It asked for read-only parsers of the Cline, Roo (global and project) and Kilo configs, including Kilo's namespaced allow/ask/deny permissions; the shipped audit reads five workspace-relative files only, reads no user-level or global config, and does not parse Kilo's namespaced permissions.

**Owned files:**
- `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/agent-observe/` (the health mapping), `FailSafe/extension/src/extension/agent-observe-command.ts` (the scan loop and command registration), `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer who lets Cline, Roo or Kilo call MCP tools wants to know whether the project's MCP configuration auto-approves everything, reaches remote servers or exposes shell-capable tools, and wants those findings tracked as risks.

## Measurable value

Metric: the number of risky MCP postures (wildcard auto-approval, remote servers, shell-capable servers) surfaced per scanned config; on main each is a keyed risk record `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:87-90` (`export function flagMcpRisks(policy: McpPolicy, agent: string)`).
Baseline: no usage data is collected, so finding counts across real workspaces and remediation rates are unverified.

## Why not simply ask an agent

The agent whose configuration is being audited is the party with the conflict of interest, and pasting an MCP config into a chat can leak the secrets it holds. This audit runs locally, drops secret values before anything is recorded, and writes findings that survive re-scans without resetting their triage status.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:72` (`Cline MCP — https://docs.cline.bot/mcp/mcp-overview`) lists the Cline, Kilo and Roo documentation; the row is still under "Planned (backlog)", which is stale (unverified as to when it was last refreshed beyond its header date).
The parser reads the shared `mcpServers` shape and both auto-approve field names `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:3-5` (`differ on the auto-approve`).

## Privileges and scopes

Credential: none `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:142` (`requiredKeys: [],`).
File access: read-only reads of five workspace-relative paths `FailSafe/extension/src/extension/agent-observe-command.ts:25-31` (`const MCP_CONFIG_CANDIDATES`).
Write access: the workspace risk register only `FailSafe/extension/src/extension/agent-observe-command.ts:86` (`new RiskRegisterManager(workspaceRoot).importSink()`).
Reading user-level agent settings outside the workspace would widen file access and is marked requires separate approval (unverified: not implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| policy-audit | verified-shipped | `auditMcpConfig` `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:105` (`export function auditMcpConfig(agent: string, text: string)`) | `FailSafe/extension/src/extension/agent-observe-command.ts:63` (`auditMcpConfig(cand.agent, text)`) | `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts` (unit) | Command `FailSafe/extension/src/extension/agent-observe-command.ts:80` (`registerCommand('failsafe.agentAudit.run'`) |
| risk-ingest | verified-shipped | `runMcpPolicyScan` `FailSafe/extension/src/extension/agent-observe-command.ts:49` (`export function runMcpPolicyScan(`) | `FailSafe/extension/src/extension/main.ts:286` (`registerAgentObserveCommands(context, core.workspaceRoot)`) | `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts` (unit) | A throwing sink is counted, not loop-aborting `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts:159` (`a sink that throws on the SECOND risk keeps scanning`) |
| user-level-config-audit | proposed | none | none | none | Only workspace-relative candidates are read `FailSafe/extension/src/extension/agent-observe-command.ts:23-24` (`Best-effort known MCP/tool config locations (workspace-relative)`) |
| kilo-namespaced-permissions | proposed | none | none | none | The legacy review's Kilo allow/ask/deny parse is not implemented (unverified beyond `parseMcpPolicyConfig`, which reads `mcpServers` and auto-approve lists only) |
| runtime-interception | proposed | none | none | none | Deferred by the legacy review; the audit is read-only `FailSafe/extension/src/extension/agent-observe-command.ts:6` (`Both are READ-ONLY.`) |

## Inbound fields

Per MCP server: name, `url` or `type` (remote detection), `command`, `env` keys and the auto-approve lists `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:58-73` (`const isRemote = !!url`).
Document level: a global auto-approve list `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:75` (`globalAutoApprove: readAutoApprove(root)`).
Files: `.mcp.json`, `cline_mcp_settings.json`, `.cline/mcp_settings.json`, `.roo/mcp.json`, `.kilocode/mcp.json` in the workspace root `FailSafe/extension/src/extension/agent-observe-command.ts:26-30` (`{ agent: 'kilo', rel: path.join('.kilocode', 'mcp.json') },`).

## Outbound fields and egress

Repository content: no; the audit module is pure `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:9` (`Everything here is pure — no fs, no network.`).
Metadata: no network call `FailSafe/extension/src/extension/agent-observe-command.ts:6-11` (`Neither spawns a process or mutates an agent.`).
Graph relationships: no `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:9` (`no fs, no network`).
Governance evidence: no; findings go to the local risk register only `FailSafe/extension/src/extension/agent-observe-command.ts:89` (`sink.upsertRisk(risk, { keepStored: ['status'] })`).

## Transformations

Env values are dropped and only their keys kept `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:25-26` (`ENV variable KEYS only — values are redacted`).
A remote URL is reduced to its host `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:21-22` (`Remote host only — never the full URL`).
A local command is reduced to its basename `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:69` (`basename only`).
Flags: wildcard auto-approval high, remote server warn, shell-capable server high, a non-wildcard auto-approve list info `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:93-99` (`'shell-capable', 'high'`).
Shell capability is guessed from the command basename and auto-approved tool names `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:80-84` (`function isShellCapable(s: McpServerPolicy): boolean {`).
Duplicate ids within one config are dropped `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:111-113` (`if (seen.has(r.id)) continue;`).

## Persisted artifacts

Risk records with source `mcp-policy` and id `mcp-policy:<agent>:<server>:<flag>`, upserted so a re-scan does not duplicate `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:89-90` (`source: 'mcp-policy', status: 'open'`).
The register file is `.failsafe/risks/risks.json` in the workspace `FailSafe/extension/src/shared/risk-store/RiskStore.ts:97` (`".failsafe", "risks", "risks.json"`).
A re-scan keeps the status the operator set `FailSafe/extension/src/extension/agent-observe-command.ts:87` (`a re-scan never resets the status the operator triaged`).
Writes go in chunks of 500 findings `FailSafe/extension/src/extension/agent-observe-command.ts:88` (`one register update per 500 findings`).
Health evidence of the last scan in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).

## Graph links

Implemented: each risk's provenance names the agent, server and flag `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:90` (`provenance: { agent, server, flag, ...detail }`).
Proposed (not built): risk-to-config-file and risk-to-MCP-install edges in the relationship graph of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Audit Agent MCP Policy (Cline/Roo/Kilo)" `FailSafe/extension/package.json:201-202` (`"title": "FailSafe: Audit Agent MCP Policy (Cline/Roo/Kilo)"`).
Result: an information message with configs scanned, risks upserted and the high-severity count `FailSafe/extension/src/extension/agent-observe-command.ts:96` (`risk(s) upserted (`).
Findings: the Console risk view reads the register `FailSafe/extension/src/roadmap/ui/modules/rest-api.js:19` (`/api/risks`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: the command does nothing unless `failsafe.integrations.agentAudit.enabled` is on `FailSafe/extension/src/extension/agent-observe-command.ts:82-84` (`Agent MCP-policy audit is disabled.`).
Advisory: findings are records only; FailSafe does not change an agent's configuration or block a tool call `FailSafe/extension/src/extension/agent-observe-command.ts:10-11` (`Neither spawns a process or mutates an agent.`).
Not observed: user-level or global agent settings, and any config outside the five workspace paths `FailSafe/extension/src/extension/agent-observe-command.ts:25-31` (`{ agent: 'project', rel: '.mcp.json' },`).
Advisory: shell capability is a name heuristic, so a shell-capable server under another name is missed (unverified beyond `SHELL_HINTS` in `mcp-policy-audit.ts`).

## Failure, offline, stale and permission semantics

No config found: an information message, no records, and no health evidence `FailSafe/extension/src/extension/agent-observe-command.ts:91` (`no Cline/Roo/Kilo/project MCP config found in this workspace`).
A file that is not valid JSON yields no findings rather than an error `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:106-107` (`try { json = JSON.parse(text); } catch { return []; }`).
A risk-register write failure is counted, warned and recorded as failing / storage `FailSafe/extension/src/extension/agent-observe-command.ts:92-95` (`could not be written to the Risk Register`).
A scan that read at least one config records contract-verified `FailSafe/extension/src/integrations/agent-observe/agent-observe-health.ts:10-12` (`return o.scanned > 0 ? ['contract-verified'] : [];`).
Offline: no network is used `FailSafe/extension/src/integrations/agent-observe/mcp-policy-audit.ts:9` (`no fs, no network`).
Stale: a finding whose posture was later fixed is not closed by a re-scan; nothing marks it resolved (unverified beyond `runMcpPolicyScan`, which only upserts).

## End-to-end scenario and measurable acceptance

Scenario: put a `.mcp.json` with `alwaysAllow: ['*']` and a remote server in the workspace, enable the audit, run the command and find a high wildcard risk and a warn remote risk in the register `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts:51` (`risky config → wildcard (high) + shell-capable (high) + remote (warn)`).
Metric: env values never appear in a record, and a second run of the same config adds zero records (threshold: exact) `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts:26` (`parse redacts secrets: env VALUES dropped (keys kept)`).
Existing test: the scan loop's counters and sink resilience `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts:148` (`healthy sink parity`) (unit).
Installed-extension test: no test installs the packaged VSIX and runs this command (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. The audit is honest and redacts well, but it misses where these agents usually keep their MCP settings (user-level and global files) and Kilo's permission model, so a clean result says little; reading those files (with separate approval for the wider file access) and closing findings that a re-scan no longer sees would make the card mean what its summary says.

## Open defects

No open B-item is specific to the agent MCP policy audit on main (unverified: searched `docs/BACKLOG.md` for "MCP-policy" and "Cline" at c36b9ee2).
The documentation index row is stale (still "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:72` (`#106 (Group C)`).
