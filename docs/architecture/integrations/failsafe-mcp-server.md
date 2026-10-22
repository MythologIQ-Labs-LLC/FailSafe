# FailSafe MCP server integration contract

Contract id: `failsafe-mcp-server` (registry row `integration-contract-failsafe-mcp-server`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review: none; no review in `docs/research/integrations/` covers FailSafe's own MCP server. The MCP Registry review belongs to the mcp-catalog contract.

**Owned files:**
- `FailSafe/extension/src/mcp/`
- `FailSafe/extension/src/extension/bootstrapMCP.ts`

## Customer job

A developer whose coding agent speaks MCP wants the agent to ask FailSafe for the governance state, audit a file, log a decision or record a risk from inside its session, so the agent's work leaves governance evidence without the developer copying it by hand.

## Measurable value

Metric: the number of agent sessions that can call a FailSafe governance tool; on main it is zero, because the server listens on the extension host's own stdio, which no MCP client can reach `FailSafe/extension/src/mcp/FailSafeServer.ts:171-173` (`this.transport = new StdioServerTransport();`).
Baseline: zero reachable sessions (B209) `docs/BACKLOG.md:554` (`FailSafeServer is in-process-only today`).

## Why not simply ask an agent

An agent can write "decision logged" in chat, but only a tool backed by the ledger produces a hash-linked entry and checks that the claimed intent is the active one. That value exists only when the agent can reach the tool.

## API documentation

none: `docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for FailSafe's own server; the MCP specification row it does have is for registry scoring `docs/integrations/INTEGRATION_DOCS_INDEX.md:29` (`MCP Registry scoring`).

## Privileges and scopes

No credential is used and no network listener is opened `FailSafe/extension/src/mcp/FailSafeServer.ts:172-174` (`FailSafe MCP Server started on stdio`).
Two tools require the caller to name the active intent id `FailSafe/extension/src/mcp/FailSafeServer.ts:150-156` (`MCP Access Denied: Invalid or inactive intent`).
File audit is limited to absolute paths inside an open workspace folder `FailSafe/extension/src/mcp/FailSafeServer.ts:159-168` (`return !!folder; // Only allow access if it belongs to an open workspace`).
A reachable standalone bridge (B209) would expose these tools to external processes and is marked requires separate approval `docs/BACKLOG.md:554` (`Standalone governance MCP bridge`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| qorelogic-status-tool | shipped-inert | `FailSafeMCPServer` `FailSafe/extension/src/mcp/FailSafeServer.ts:127-129` (`"qorelogic_status",`) | `FailSafe/extension/src/extension/main.ts:380` (`mcpServer = await bootstrapMCP(context, sentinel, qor, gov, logger, servers.riskManager);`) | none | Absent call site: no MCP client can reach the extension host's stdio transport `FailSafe/extension/src/mcp/FailSafeServer.ts:172` (`new StdioServerTransport()`); B209 `docs/BACKLOG.md:554` (`FailSafeServer is in-process-only today`) |
| sentinel-audit-file-tool | shipped-inert | `FailSafeMCPServer` `FailSafe/extension/src/mcp/FailSafeServer.ts:50-52` (`"sentinel_audit_file",`) | `FailSafe/extension/src/extension/bootstrapMCP.ts:19` (`const mcpServer = new FailSafeMCPServer(`) | none | Absent call site: same unreachable stdio transport `FailSafe/extension/src/mcp/FailSafeServer.ts:172` (`new StdioServerTransport()`) |
| ledger-log-decision-tool | shipped-inert | `FailSafeMCPServer` `FailSafe/extension/src/mcp/FailSafeServer.ts:85-87` (`"ledger_log_decision",`) | `FailSafe/extension/src/extension/bootstrapMCP.ts:19` (`const mcpServer = new FailSafeMCPServer(`) | none | Absent call site: same unreachable stdio transport `FailSafe/extension/src/mcp/FailSafeServer.ts:172` (`new StdioServerTransport()`) |
| create-risk-tool | shipped-inert | `registerCreateRiskTool` `FailSafe/extension/src/mcp/tools/createRiskTool.ts:103` (`export function registerCreateRiskTool(`) | `FailSafe/extension/src/mcp/FailSafeServer.ts:123-124` (`registerCreateRiskTool(this.toolRegistrar, this.riskManager);`) | none | Absent call site: same unreachable stdio transport `FailSafe/extension/src/mcp/FailSafeServer.ts:172` (`new StdioServerTransport()`) |
| standalone-mcp-bridge | proposed | none | none | none | B209 `docs/BACKLOG.md:554` (`thin stdio-MCP client proxying to the ConsoleServer HTTP API`) |

## Inbound fields

`sentinel_audit_file`: an absolute path and an intent id `FailSafe/extension/src/mcp/FailSafeServer.ts:54-57` (`path: z.string().describe("Absolute path to the file to audit")`).
`ledger_log_decision`: a decision (at most 1000 characters), a rationale (at most 2000), a risk grade L1 to L3 and an intent id `FailSafe/extension/src/mcp/FailSafeServer.ts:89-94` (`decision: z.string().max(1000)`).
`failsafe.create_risk`: risk fields validated against fixed severity and category lists `FailSafe/extension/src/mcp/tools/createRiskTool.ts:16-22` (`const SEVERITY_VALUES: readonly RiskSeverity[] = [`).
`qorelogic_status`: no input `FailSafe/extension/src/mcp/FailSafeServer.ts:128-131` (`"Check current governance capability and lock status."`).

## Outbound fields and egress

Repository content: no network egress; tool results return over the stdio transport only `FailSafe/extension/src/mcp/FailSafeServer.ts:74-80` (`text: JSON.stringify(result, null, 2),`).
Metadata: the status tool returns lock state and the active intent id `FailSafe/extension/src/mcp/FailSafeServer.ts:138-142` (`active_intent: activeIntent ? activeIntent.id : null,`).
Graph relationships: no `FailSafe/extension/src/mcp/FailSafeServer.ts:104-109` (`agentDid: "did:mcp:external",`).
Governance evidence: written locally (ledger entry, risk record), not sent anywhere `FailSafe/extension/src/mcp/FailSafeServer.ts:104` (`const entry = await this.ledger.appendEntry({`).

## Transformations

A logged decision becomes a PROPOSAL ledger entry from `did:mcp:external` `FailSafe/extension/src/mcp/FailSafeServer.ts:104-109` (`eventType: "PROPOSAL",`).
A created risk is forced to `source: "mcp"` whatever the caller sends `FailSafe/extension/src/mcp/tools/createRiskTool.ts:5-6` (`The tool forces `).

## Persisted artifacts

Ledger entries through the LedgerManager (unverified beyond the call `FailSafe/extension/src/mcp/FailSafeServer.ts:104` (`this.ledger.appendEntry`)).
Risk records through the RiskManager `FailSafe/extension/src/mcp/tools/createRiskTool.ts:82-86` (`return { ok: true, id: risk.id, source: "mcp"`).
Neither is written on main by an external agent, since the server is unreachable (unverified: follows from the absent call site above).

## Graph links

Implemented: none `FailSafe/extension/src/mcp/FailSafeServer.ts:104-109` (`payload: { decision, rationale, risk_grade },`).
Proposed (not built): agent session to decision and risk edges in the agent-run scenario of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

On every activation an information message says the server is listening on stdio `FailSafe/extension/src/mcp/FailSafeServer.ts:177-179` (`"FailSafe MCP Server: LISTENING (stdio)",`), although no client can connect (see Open defects).
No command, setting or Console view configures or shows the server (unverified: no `failsafe.mcp` server setting found in `FailSafe/extension/package.json`).

## Governance policy and enforceability limits

Enforced (if reachable): audit and decision tools refuse an intent id that is not the active intent `FailSafe/extension/src/mcp/FailSafeServer.ts:152-156` (`active.id !== intentId`).
Enforced (if reachable): audit refuses a path outside the open workspace folders `FailSafe/extension/src/mcp/FailSafeServer.ts:65-69` (`is outside valid workspace scope.`).
Enforced (if reachable), defence in depth for GHSA-46jr: a tools/call whose arguments hold more than 10,000 elements is refused before the tool runs; the SDK (1.32.0 since Dependabot #561) defaults to no limit, so the cap applies because FailSafe opts in `FailSafe/extension/src/mcp/FailSafeServer.ts:38` (`maxToolInputElements: 10_000`), tested over an in-memory transport `FailSafe/extension/src/test/mcp/FailSafeMCPServer.test.ts:205` (`tools/call input element cap`).
Limit: none of this applies on main, because no caller exists `docs/BACKLOG.md:554` (`FailSafeServer is in-process-only today`).

## Failure, offline, stale and permission semantics

A start failure is logged and activation continues without the server `FailSafe/extension/src/extension/bootstrapMCP.ts:29-31` (`logger.error("Failed to start MCP Server", error);`).
Without a RiskManager the create_risk tool is not registered `FailSafe/extension/src/mcp/FailSafeServer.ts:123-125` (`if (this.riskManager) {`).
The server is stopped on deactivation `FailSafe/extension/src/extension/teardownResources.ts:39` (`{ name: "mcpServer", dispose: () => h.mcpServer?.stop() },`).

## End-to-end scenario and measurable acceptance

Scenario (after B209): an agent session connects to a FailSafe MCP bridge, calls `qorelogic_status`, then `ledger_log_decision` with the active intent id, and the ledger holds the entry (unverified: not possible on main).
Metric: an external MCP client completes one tool call against a running extension (threshold: one success); on main the count is zero `docs/BACKLOG.md:554` (`FailSafeServer is in-process-only today`).
Existing test: `FailSafe/extension/src/test/mcp/FailSafeMCPServer.test.ts:6-8` (`exercise the`) (unit) exercises the intent and path gates and the tool registrations with mock services; one row drives the real server over the SDK's in-memory transport `FailSafe/extension/src/test/mcp/FailSafeMCPServer.test.ts:205` (`tools/call input element cap`).
Installed-extension test: none (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. The tools and their gates exist and are unit-tested, but the customer job is unmet until B209 gives agents a reachable transport. Until then the activation message should not say the server is listening.

## Open defects

B209: the server is reachable from no MCP client `docs/BACKLOG.md:554` (`[B209] Standalone governance MCP bridge`).
The activation notice "LISTENING (stdio)" overstates reachability (observed, not filed in this cycle; see Other findings in the portfolio) `FailSafe/extension/src/mcp/FailSafeServer.ts:177-179` (`showInformationMessage(`).
