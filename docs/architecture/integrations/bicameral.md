# Bicameral MCP integration contract

Contract id: `bicameral` (registry row `integration-contract-bicameral`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review: none; `docs/research/integrations/` has no Bicameral review.

**Owned files:**
- `FailSafe/extension/src/integrations/bicameral/`
- `FailSafe/extension/src/extension/bootstrapBicameral.ts`
- `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts`
- `FailSafe/extension/src/roadmap/routes/BicameralRoute.ts`
- `FailSafe/extension/src/roadmap/routes/bicameralRouteShared.ts`
- `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts`
- `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts`
- `FailSafe/extension/src/roadmap/routes/bicameralToolRoutes.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/mcp/` (the MCP stdio client host, shared with open-design).

## Customer job

A team that records design decisions in Bicameral MCP wants FailSafe to show those decisions, flag code that drifted from them, attach decision conflicts to L3 approvals, and let a human ratify or reject a decision from the Console with a ledger record.

## Measurable value

Metric: drifted decisions that reach the L3 queue or the Risks Register; on main the drift-to-L3 path is never wired (see Feature state), so the L3 half of this metric is zero by construction `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:32-33` (`if (!client) return;`).
Baseline: no usage data is collected; the number of ratified decisions and drift findings per workspace is unverified.

## Why not simply ask an agent

An agent can call the Bicameral MCP server itself, but it does not route the call through FailSafe's governance interceptor, it cannot attach a decision conflict to an L3 approval card, and its "ratify" leaves no USER_OVERRIDE ledger entry tied to a human confirmation dialog.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:35` (`**Bicameral MCP**`) names only "Upstream repo (see contract review)", and no Bicameral contract review exists in `docs/research/integrations/` (unverified beyond a listing of that folder).

## Privileges and scopes

Credential: none held by FailSafe; team-mode setup runs a Google Drive OAuth inside an integrated terminal and FailSafe never reads the token `FailSafe/extension/src/integrations/bicameral/install-handler.ts:122-127` (`FailSafe never touches the OAuth token`).
Process: FailSafe starts the `bicameral-mcp` executable as a local stdio subprocess after a trusted-path check `FailSafe/extension/src/integrations/mcp/McpClientHost.ts:44-46` (`export function assertLaunchableCommand(command: string, errorPrefix: string): void {`).
The command, extra roots and auto-connect settings are machine-scoped (user settings only) `FailSafe/extension/package.json:740-758` (`"scope": "machine",`).
Install: `pip install` of a pinned range runs with the operator's own Python and PyPI access `FailSafe/extension/src/integrations/bicameral/install-handler.ts:23` (`export const BICAMERAL_PIP_SPEC = 'bicameral-mcp>=0.14,<0.16';`).
Upstream poll: unauthenticated GitHub REST, no token `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:6-8` (`Unauthenticated GitHub REST`).
Any capability that writes to Bicameral beyond ratify/reject would need a separate decision and is marked requires separate approval (unverified: none is planned in code).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| install-bridge | verified-shipped | `runBicameralInstall` `FailSafe/extension/src/integrations/bicameral/install-handler.ts:73` (`export async function runBicameralInstall(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:336` (`setupBicameralRoutes(app, this.buildBicameralRouteDeps());`) | `FailSafe/extension/src/test/integrations/bicameral/install-handler.test.ts` (unit) | As released in v6.0.8 the install route ran with no server-side confirmation (F17) `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:59` (`app.post("/api/actions/bicameral-install"`); on main it confirms first (install-confirmation) |
| install-confirmation | main-unreleased | `authorizeOperatorAction` `FailSafe/extension/src/roadmap/routes/installAuthorization.ts:181` (`export async function authorizeOperatorAction<T extends InstallOperation>(`) | `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:59` (`consoleRequestGuard(rejectIfRemote), newInstallLimiter()`) | `FailSafe/extension/src/test/roadmap/installAuthorization.routes.test.ts` (route) | #538: the pinned pip spec and the setup command are shown in a modal VS Code dialog and run only after approval; only `mode` comes from the request; Host, Origin and JSON are checked before a 5-a-minute limit; an approval after 2 minutes or after the browser has gone runs nothing; the approval is recorded in the ledger when it is available |
| install-state-probe | verified-shipped | `probeInstallState` `FailSafe/extension/src/integrations/bicameral/install-detector.ts:168` (`export async function probeInstallState(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:336` (`setupBicameralRoutes(app, this.buildBicameralRouteDeps());`) | `FailSafe/extension/src/test/integrations/bicameral/install-detector.test.ts` (unit) | Route `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:17` (`/api/integrations/bicameral/status`) |
| mcp-session | verified-shipped | `BicameralMcpClient` `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts:65` (`export class BicameralMcpClient extends McpClientHost {`) | `FailSafe/extension/src/extension/bootstrapBicameral.ts:189` (`const client = new BicameralMcpClient({`) | `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.test.ts` (unit) | Lazy client; connect is an operator click unless auto-connect is on `FailSafe/extension/package.json:757` (`"default": false,`) |
| governed-tool-calls | verified-shipped | `governToolCall` `FailSafe/extension/src/roadmap/routes/bicameralRouteShared.ts:174` (`export async function governToolCall(`) | `FailSafe/extension/src/extension/bootstrapBicameral.ts:145` (`consoleServer.setMcpInterceptor(new McpInterceptor(client, backing));`) | `FailSafe/extension/src/test/roadmap/routes/bicameralToolRoute.factory.test.ts` (route) | Without an enforcement engine the routes run un-governed `FailSafe/extension/src/roadmap/routes/bicameralRouteShared.ts:180-181` (`if (!interceptor) return false;`) |
| ratify-with-confirmation | verified-shipped | `confirmOperatorAction` `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:126-127` (`deps.confirmOperatorAction, ratifyRequest(decisionId, verdict, rationale), res,`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:336` (`setupBicameralRoutes(app, this.buildBicameralRouteDeps());`) | `FailSafe/extension/src/test/roadmap/BicameralRoute.test.ts` (route) | Ledger USER_OVERRIDE `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:147-148` (`eventType: "USER_OVERRIDE",`) |
| drift-to-l3 | shipped-inert | `DriftToL3Mediator` `FailSafe/extension/src/integrations/bicameral/DriftToL3Mediator.ts:38` (`export class DriftToL3Mediator {`) | none | none | Absent call site: the wiring reads the client before the async rewire assigns it `FailSafe/extension/src/extension/bootstrapBicameral.ts:224` (`void rewire();`), so `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:32-33` (`const client = consoleServer.getBicameralClient();`) returns; the drift route also captured the mediator at construction `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:403` (`driftToL3Mediator: this.host.getDriftToL3Mediator() ?? undefined,`) |
| preflight-to-l3 | verified-shipped | `PreflightToL3Mediator` `FailSafe/extension/src/integrations/bicameral/PreflightToL3Mediator.ts:55` (`async onTier3Queued(approvalId: string, targetPath: string): Promise<void> {`) | `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:53` (`const mediator = new PreflightToL3Mediator({`) | `FailSafe/extension/src/test/integrations/bicameral/PreflightToL3Mediator.test.ts` (unit) | Fired by `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:227-229` (`.onTier3Queued(queuedId, targetPath)`) |
| drift-to-risk | verified-shipped | `DriftToRiskMediator` `FailSafe/extension/src/integrations/bicameral/DriftToRiskMediator.ts:1-6` (`Mirrors Bicameral`) | `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:96` (`const mediator = new DriftToRiskMediator({`) | `FailSafe/extension/src/test/integrations/bicameral/DriftToRiskMediator.test.ts` (unit) | Fed by `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:85` (`emitDriftVerdicts(deps, drift);`) |
| sentinel-verdict-classification | verified-shipped | `classifyBicameralVerdict` `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:76` (`policy.classifyBicameralVerdict(payload.verdict)`) | `FailSafe/extension/src/extension/bootstrapBicameral.ts:127` (`wireMediators(context, consoleServer, deps);`) | `FailSafe/extension/src/test/sentinel/SentinelWatchPolicy.bicameral.test.ts` (unit) | Broadcast only; not a Sentinel event `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:64-66` (`it is NOT made a SentinelEvent nor arbitrated`) |
| upstream-poll | verified-shipped | `UpstreamMonitor` `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:27` (`export class UpstreamMonitor {`) | `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:137-142` (`monitor.start();`) | `FailSafe/extension/src/test/integrations/bicameral/UpstreamMonitor.test.ts` (unit) | No enable gate (F06) |
| upstream-snapshot-route | shipped-inert | `getSnapshot` `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:160` (`const snapshot = monitor.getSnapshot();`) | none | none | Absent call site: the route deps captured `upstreamMonitor` at ConsoleServer construction `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:405` (`upstreamMonitor: this.host.getUpstreamMonitor() ?? undefined,`), before bootstrap sets it, so the route answers 503 `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:157-159` (`UpstreamMonitor not wired`) |
| auto-connect | verified-shipped | `maybeAutoConnectBicameral` `FailSafe/extension/src/extension/bootstrapBicameral.ts:263` (`export function maybeAutoConnectBicameral(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:324` (`maybeAutoConnectBicameral(consoleServer, deps.workspaceRoot, outputChannel);`) | `FailSafe/extension/src/test/extension/bicameral-activation.test.ts` (unit) | The card writes user settings `FailSafe/extension/src/extension/bootstrapBicameral.ts:228-230` (`vscode.ConfigurationTarget.Global`) |

## Inbound fields

From the MCP server: feature-scoped decision briefs, preflight results and per-file drift status `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts:98-110` (`async drift(filePath: string): Promise<BicameralDriftStatus[]> {`).
From the install subprocesses: a sanitized, capped stdout tail `FailSafe/extension/src/integrations/bicameral/install-handler.ts:36-42` (`export function sanitizeStdoutTail(raw: string, maxLen = STDOUT_TAIL_BYTES): string {`).
From GitHub: latest release tag and date, and the open-issue count `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:71-77` (`openIssueCount: typeof issues.total_count === 'number'`).

## Outbound fields and egress

Repository content: yes to the local Bicameral subprocess only; file paths are passed to drift and preflight `FailSafe/extension/src/integrations/bicameral/PreflightToL3Mediator.ts:61` (`const result = await client.preflight(targetPath);`); what the Bicameral server sends onward (for example to Google Drive in team mode) is outside FailSafe (unverified).
Metadata: yes, the decision id and verdict on ratify, gated by the modal confirmation `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:126-127` (`ratifyRequest(decisionId, verdict, rationale)`).
Network: yes, two unauthenticated GET requests to api.github.com per poll, default every 24 hours, with no consent gate `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:62-65` (`https://api.github.com/repos/${repo}/releases/latest`).
Network: pip downloads the package from PyPI when the operator runs install `FailSafe/extension/src/integrations/bicameral/install-handler.ts:107-111` (`args: ['install', BICAMERAL_PIP_SPEC],`).
Graph relationships: no; decisions are not mapped into a FailSafe graph (unverified beyond the absence of a graph writer in the owned files).
Governance evidence: ratify writes a USER_OVERRIDE entry to the local ledger, not to any remote `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:145-151` (`action: "bicameral.ratify",`).

## Transformations

A drifted decision becomes an L2 L3-queue item keyed `bicameral:<decisionId>` (inert on main) `FailSafe/extension/src/integrations/bicameral/DriftToL3Mediator.ts:54-61` (`riskGrade: 'L2',`).
An L3 decision maps APPROVED to ratify and REJECTED to reject; other states leave Bicameral untouched `FailSafe/extension/src/integrations/bicameral/DriftToL3Mediator.ts:87-95` (`verdict = 'ratify';`).
A drifted verdict upserts a risk and a ratified verdict closes it `FailSafe/extension/src/integrations/bicameral/DriftToRiskMediator.ts:4-6` (`On verdict:'ratified' → close that same risk.`).
The release tag loses a leading v `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:72` (`release.tag_name.replace(/^v/, '')`).

## Persisted artifacts

`bicameral-mcp setup` writes `.bicameral/config.yaml` in the workspace; FailSafe reads it to probe state `FailSafe/extension/src/integrations/bicameral/install-detector.ts:146` (`const configPath = path.join(workspaceRoot, '.bicameral', 'config.yaml');`).
A ratify appends one USER_OVERRIDE ledger entry `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:147-148` (`eventType: "USER_OVERRIDE",`).
Drift verdicts are mirrored into the workspace Risks Register `FailSafe/extension/src/extension/bootstrapServers.ts:215-217` (`riskRegister: consoleServer.getRiskRegisterManager(),`).
The upstream snapshot lives only in memory `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:34` (`private snapshot: UpstreamSnapshot`).
pip runs from a fresh temporary folder that is removed afterwards `FailSafe/extension/src/integrations/bicameral/install-handler.ts:100` (`fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-bicameral-pip-'))`).

## Graph links

Implemented: a mirrored risk is keyed by the Bicameral decision id `FailSafe/extension/src/integrations/bicameral/DriftToRiskMediator.ts:4-5` (`bicameral:{decisionId}`).
Implemented: the open-binding route opens a decision's bound source file in the editor `FailSafe/extension/src/extension/bootstrapBicameral.ts:201-207` (`vscode.Uri.file(filePath),`).
Proposed (not built): decision-to-intent and decision-to-receipt edges in the local graph of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Console Integrations tab: a Bicameral sub-view `FailSafe/extension/src/roadmap/ui/command-center.js:60` (`renderer: new BicameralRenderer('integrations', { client })`).
Install buttons POST the install route; on main the card then says to confirm in the VS Code dialog and shows why nothing ran if it was not confirmed `FailSafe/extension/src/roadmap/ui/modules/bicameral-renderer.js:206-207` (`awaitingConfirmation: true`).
Ratify uses the gated POST, which shows a modal VS Code dialog `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:91-95` (`it acts only after a`).
Settings tab card: install state, version and the auto-connect toggle `FailSafe/extension/src/roadmap/ui/modules/bicameral-settings-card.js:59` (`/api/integrations/bicameral/auto-connect`).

## Governance policy and enforceability limits

Enforced: ratify and reject need an approved modal confirmation `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:126-130` (`requireOperatorConfirmation(`).
Enforced when an enforcement engine is wired: tool calls go through the McpInterceptor and a non-ALLOW verdict blocks them `FailSafe/extension/src/roadmap/routes/bicameralRouteShared.ts:177-185` (`if (receipt.verdict === "ALLOW") return false;`).
Enforced: every route refuses non-loopback callers `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:22` (`if (deps.rejectIfRemote(req, res)) return;`).
Enforced on main (#538): install runs pip and setup only after the operator approves them in a modal VS Code dialog `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:65-75` (`const approved = await authorizeOperatorAction(`); the modal proves a person clicked in VS Code, not which local process asked. Connect and the auto-connect toggle refuse a non-loopback `Host` or a foreign `Origin` `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:104` (`consoleRequestGuard(rejectIfRemote, { requireJson: false })`). A Console reached through a browser-based remote or the cross-port workspace switcher is refused on these routes. As released in v6.0.8 install ran without a dialog.
Observed only: a team-mode setup command is pre-filled in a terminal and run by the operator `FailSafe/extension/src/integrations/bicameral/install-handler.ts:137` (`opts.runInTerminal('Bicameral: team setup', setupCommand);`).

## Failure, offline, stale and permission semantics

Unsafe command names are rejected before any spawn `FailSafe/extension/src/integrations/bicameral/install-handler.ts:88-90` (`Install rejected: unsafe pip or bicameral command name`).
Each install step is killed after 120 seconds `FailSafe/extension/src/integrations/bicameral/install-handler.ts:215` (`const timeoutMs = opts.stepTimeoutMs ?? 120_000;`).
Ratify answers 503 with no client and 409 when not connected `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:117-124` (`Bicameral not connected`).
Preflight with a missing or disconnected client is a silent no-op `FailSafe/extension/src/integrations/bicameral/PreflightToL3Mediator.ts:58` (`client.isConnected()) return;`).
Offline upstream: the poll stores an error snapshot and logs a warning `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:78-80` (`UpstreamMonitor poll failed`).
An invalid repo slug sends nothing `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:56-59` (`UpstreamMonitor blocked invalid repo slug`).

## End-to-end scenario and measurable acceptance

Scenario: install in solo mode, connect, list history, check drift on a file, see the drift mirrored as a risk, ratify the decision through the VS Code dialog, and find one USER_OVERRIDE ledger entry `FailSafe/extension/src/roadmap/routes/bicameralDecisionRoutes.ts:145-151` (`if (deps.ledgerManager?.isAvailable()) {`).
Metric: one confirmed ratify writes exactly one ledger entry and a declined dialog writes none (threshold: exact counts); the route behaviour is held by `FailSafe/extension/src/test/roadmap/BicameralRoute.test.ts:94` (`/api/actions/bicameral-ratify`) (route).
Metric: a drifted decision should reach the L3 queue exactly once; on main it reaches it zero times because the mediator is never constructed (unverified by any test: the mediator test drives the class directly `FailSafe/extension/src/test/integrations/bicameral/DriftToL3Mediator.test.ts:1-5` (`DriftToL3Mediator`)).
Existing UI test: `FailSafe/extension/src/test/ui/integrations-bicameral.spec.ts:3-5` (`pre-wiring a stub BicameralMcpClient`) (playwright-stubbed; stubbed routes, no real Bicameral server).
Installed-extension test: no test installs the packaged VSIX and exercises Bicameral (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. The client, install, governed tool routes, confirmed ratify and the preflight and risk mediators are real and tested, and on main the install route runs only after a VS Code confirmation (#538). Two advertised paths are still inert on main (drift-to-L3 and the upstream snapshot route) because of wiring order, and the upstream poll calls GitHub with no enable switch. Fix those two before investing in new Bicameral surface.

## Open defects

[B259] drift-to-L3 never wired (F05) `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:32-33` (`if (!client) return;`).
[B260] upstream poll has no enable gate and its route is never reachable (F06) `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:130-142` (`monitor.start();`).
Fixed in #538: [B269] bicameral-install ran without a server-side confirmation or a rate limit (F17); it now asks first and is limited `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:59` (`app.post("/api/actions/bicameral-install"`).
