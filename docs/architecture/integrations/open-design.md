# Open Design integration contract

Contract id: `open-design` (registry row `integration-contract-open-design`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_OPEN_DESIGN_CONTRACT_REVIEW.md`. It records the dual-path decision and the L3-gated `create_artifact` write path as shipped; on main that write path is refused at the client, and the SSE observer it lists as done has no subscriber.

**Owned files:**
- `FailSafe/extension/src/integrations/open-design/`
- `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts`
- `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/mcp/` (the `McpClientHost` base class). The Console card `FailSafe/extension/src/roadmap/ui/modules/open-design-renderer.js` is covered by the same-origin browser prefix row.

## Customer job

A designer or developer who uses the local Open Design app wants FailSafe to know which agent edits came from Open Design and to reach Open Design's project tools through a connection they approved, without FailSafe gaining the power to overwrite or delete their designs.

## Measurable value

Metric: the share of agent-run file edits under `.od/artifacts/<projectId>/` that carry Open Design provenance; on main every such path is tagged when the setting is on `FailSafe/extension/src/integrations/open-design/provenance.ts:19` (`const OD_ARTIFACTS_RE`).
Baseline: no usage data is collected, so the number of tagged runs and connected sessions is unverified.

## Why not simply ask an agent

An agent can talk to Open Design's MCP server directly, but then nothing records which runs came from Open Design, nothing asks the operator before the server command is started, and nothing stops the destructive tools. This integration adds the provenance tag, the launch consent and a fail-closed tool gate.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:34` (`Open Design observer`) links the upstream repository and calls the integration "shipped v5.x".
The tool list is pinned to an upstream commit in `FailSafe/extension/src/integrations/open-design/OpenDesignMcpAllowlist.ts:5` (`Sourced from nexu-io/open-design@abe72af apps/daemon/src/mcp.ts TOOL_DEFS.`).

## Privileges and scopes

No vendor credential is used; the daemon is reached on loopback 127.0.0.1:7456 `FailSafe/extension/src/integrations/open-design/OpenDesignDaemonProbe.ts:55-56` (`const url = `).
The MCP server runs as a child process started with the command the daemon publishes, after a modal consent `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:119-124` (`Allow FailSafe to start the Open Design MCP server with this command?`).
The launch command and its first argument must be absolute paths and env keys are allowlisted to two names `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:21` (`export const ALLOWED_LAUNCH_ENV_KEYS`).
The confirmed command is stored in user-scoped global state, never in workspace settings `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:18-19` (`user-scoped, never workspace settings`).
Write tools (`create_artifact`, `write_file`, `delete_file`, `delete_project`) would need Open Design write access and are marked requires separate approval `FailSafe/extension/src/integrations/open-design/OpenDesignMcpAllowlist.ts:51-56` (`const WRITE_TOOLS = new Map`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| file-path-provenance | verified-shipped | `OpenDesignProvenanceDetector` `FailSafe/extension/src/integrations/open-design/OpenDesignProvenanceDetector.ts:13` (`export class OpenDesignProvenanceDetector`) | `FailSafe/extension/src/extension/bootstrapSentinel.ts:88-90` (`[new OpenDesignProvenanceDetector()]`) | `FailSafe/extension/src/test/extension/bootstrapSentinel-open-design.test.cjs` (unit) | Opt-in setting `FailSafe/extension/package.json:402` (`"failsafe.integrations.openDesign.enabled"`) |
| daemon-probe | verified-shipped | `OpenDesignDaemonProbe` `FailSafe/extension/src/integrations/open-design/OpenDesignDaemonProbe.ts:41` (`export class OpenDesignDaemonProbe`) | `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:140-141` (`const probeResult = await probe.probe();`) | `FailSafe/extension/src/test/integrations/open-design/OpenDesignDaemonProbe.test.ts` (unit) | Runs only inside the register command `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:14-15` (`The daemon is NOT auto-probed on activation`) |
| consented-mcp-launch | verified-shipped | `bootstrapOpenDesignMcp` `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:65` (`export function bootstrapOpenDesignMcp(`) | `FailSafe/extension/src/extension/main.ts:388` (`bootstrapOpenDesignMcp(context, core.workspaceRoot, {`) | `FailSafe/extension/src/test/extension/bootstrapOpenDesignMcp.test.cjs` (unit) | Command `FailSafe/extension/package.json:121` (`"command": "failsafe.openDesign.registerMcp"`) |
| read-only-mcp-client | verified-shipped | `OpenDesignMcpClient` `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:56` (`export class OpenDesignMcpClient extends McpClientHost`) | `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:82` (`return new OpenDesignMcpClient({ command: spec.command`) | `FailSafe/extension/src/test/integrations/open-design/OpenDesignMcpClient.test.ts` (unit) | No FailSafe code calls a read-only tool; the connect step only counts them `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:155` (`OpenDesignMcpAllowlist.isReadOnly(t)).length`) |
| destructive-tool-refusal | verified-shipped | `isDestructive` `FailSafe/extension/src/integrations/open-design/OpenDesignMcpAllowlist.ts:67` (`static isDestructive(toolName: string): boolean {`) | `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:80-82` (`if (OpenDesignMcpAllowlist.isDestructive(name)) {`) | `FailSafe/extension/src/test/integrations/open-design/OpenDesignMcpAllowlist.test.ts` (unit) | Unlisted tools are refused too `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:77-78` (`TOOL_NOT_ALLOWLISTED`) |
| connection-status-route | shipped-unverified | `setupOpenDesignRoutes` `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts:36-37` (`'/api/integrations/open-design/status'`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:339` (`setupOpenDesignRoutes(app, {`) | none | The route test covers only the create_artifact POST `FailSafe/extension/src/test/roadmap/routes/OpenDesignRoute.test.ts:40` (`valid create_artifact request enqueues L3`); the renderer test stubs the status fetch (unverified beyond its header) |
| create-artifact-l3 | shipped-inert | `executeApprovedCreateArtifact` `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:101` (`async executeApprovedCreateArtifact(`) | `FailSafe/extension/src/integrations/open-design/OpenDesignL3Executor.ts:90` (`await client.executeApprovedCreateArtifact(args)`) | none | Switch: `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:104` (`WRITE_TOOL_NOT_APPROVED: verified L3 receipt enforcement is not available`) |
| per-run-sse-observer | shipped-inert | `subscribeRun` `FailSafe/extension/src/integrations/open-design/OpenDesignSseClient.ts:36` (`subscribeRun(`) | none | none | Absent call site: the client is constructed `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:78` (`const sseClient = new OpenDesignSseClient();`) but nothing outside tests calls `subscribeRun`, and the `sseEnabled` setting is read by no source file (unverified negative search over `FailSafe/extension/src`) |
| destructive-write-tools | proposed | none | none | none | Deferred as B-OD-12 `docs/BACKLOG.md:535` (`destructive write-tool tranche`) |

## Inbound fields

From the daemon version probe: the version string, top-level or nested `FailSafe/extension/src/integrations/open-design/OpenDesignDaemonProbe.ts:34` (`function readVersion(data: unknown)`).
From `/api/mcp/install-info`: `command`, `args` and `env`; the payload's own existence flags are not trusted `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:52-55` (`Never trusts the payload's own cliExists/nodeExists`).
From the MCP server: the tool list, cached as the client's capability set (unverified beyond the base class `FailSafe/extension/src/integrations/mcp/McpClientHost.ts:193` (`async callRaw(name: string, args: Record<string, unknown>)`)).
From the local file system: edited paths, matched against `.od/artifacts/<projectId>/` `FailSafe/extension/src/integrations/open-design/provenance.ts:25-29` (`return { source: "open-design", projectId };`).

## Outbound fields and egress

Repository content: no; FailSafe calls no read or write tool with workspace content `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:154-155` (`await client.connect();`).
Metadata: yes, to loopback only: GET /api/version and GET /api/mcp/install-info on the local daemon port, from the register command `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:70` (`/api/mcp/install-info`).
Graph relationships: no `FailSafe/extension/src/integrations/open-design/provenance.ts:8` (`Detection is FILE-PATH-BASED ONLY in v1`).
Governance evidence: no; a create_artifact decision is written to the FailSafe ledger, not to Open Design `FailSafe/extension/src/integrations/open-design/OpenDesignL3Executor.ts:108-115` (`eventType: 'USER_OVERRIDE'`).
Network egress beyond loopback: none from FailSafe's own code; what the spawned Open Design server does is outside FailSafe's view (unverified).
Blind spot of the LD1 scans: `fetchLaunchSpec` calls `(opts.fetchImpl ?? fetch)(url` `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:74` (`const res = await (opts.fetchImpl ?? fetch)(url, { signal: ctrl.signal });`), which matches neither scan; it is owned only through the integrations directory rule.

## Transformations

A file path becomes `{ source: 'open-design', projectId }` provenance on the agent run `FailSafe/extension/src/integrations/open-design/provenance.ts:21-29` (`export function extractOpenDesignProvenance(`).
The launch spec is narrowed to absolute paths and allowlisted env keys before the operator sees it `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:56-62` (`command must be an absolute path`).
The consent modal shows every env pair and argument `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts:86-89` (`export function formatCommandLine(spec: OpenDesignLaunchSpec): string {`).

## Persisted artifacts

The confirmed launch spec, in VS Code global state under `failsafe.openDesign.mcpLaunchSpec` `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:150` (`await context.globalState.update(LAUNCH_SPEC_STATE_KEY, spec);`).
Agent runs with Open Design provenance, under `.failsafe/runs` in the workspace `FailSafe/extension/src/extension/bootstrapSentinel.ts:81` (`const runsPath = path.join(core.workspaceRoot, ".failsafe", "runs");`).
An L3 queue item for each create_artifact request `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts:75-84` (`kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND,`).
A USER_OVERRIDE ledger entry for each decided create_artifact item (declined, executed or failed) `FailSafe/extension/src/integrations/open-design/OpenDesignL3Executor.ts:72-75` (`open-design.create_artifact.declined`).

## Graph links

Implemented: agent run to Open Design project by `projectId` `FailSafe/extension/src/integrations/open-design/provenance.ts:29` (`return { source: "open-design", projectId };`).
Proposed (not built): design artifact to intent, plan or receipt edges (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Register Open Design MCP Connection" `FailSafe/extension/package.json:121-122` (`"title": "FailSafe: Register Open Design MCP Connection"`).
Console Integrations, Open Design card: status from `/api/integrations/open-design/status` `FailSafe/extension/src/roadmap/ui/modules/open-design-renderer.js:38` (`fetch('/api/integrations/open-design/status')`).
The card still offers a create_artifact "Request" button `FailSafe/extension/src/roadmap/ui/modules/open-design-renderer.js:64` (`cc-od-create-artifact`), which queues an L3 item that cannot execute (see Open defects).
Monitor Agents: an "Open Design" provenance pill on tagged runs `FailSafe/extension/package.json:405` (`Surfaces an 'Open Design' pill in the Monitor Agents tab`).

## Governance policy and enforceability limits

Enforced: the MCP server is started only with a command the operator confirmed in a modal `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:148-149` (`!(await confirm(spec))`).
Enforced: destructive and unlisted tools are refused before the transport `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:74-84` (`preCallGate: (name) => {`).
Enforced: `create_artifact` is refused on every path `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:119-121` (`if (OpenDesignMcpAllowlist.isL3GatedWrite(name)) {`).
Enforced: both Console routes refuse non-local requests `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts:39` (`if (deps.rejectIfRemote(req, res)) return;`).
Observed: provenance is a path match only; an Open Design edit outside `.od/artifacts/` is not tagged `FailSafe/extension/src/integrations/open-design/provenance.ts:8` (`Detection is FILE-PATH-BASED ONLY in v1`).
Advisory: Open Design's own direct use of the files is not governed by FailSafe (unverified: no interception exists).

## Failure, offline, stale and permission semantics

Daemon down: the probe reports refused, timeout, non_200 or parse_error and the command stops with a warning `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:142-146` (`Open Design daemon unreachable at`).
Probe results are cached for 30 seconds `FailSafe/extension/src/integrations/open-design/OpenDesignDaemonProbe.ts:51` (`const ttl = this.opts.ttlMs ?? 30_000;`).
A missing runtime path stops the launch with an error `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:111-114` (`Open Design runtime not found at`).
A changed launch spec replaces the old client `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:127-130` (`if (mcpClient && !sameSpec(clientSpec, spec)) {`).
A create_artifact request without a client answers 503; with one it answers 409 pending `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts:65-67` (`Open Design MCP client not connected`).
An approved create_artifact fails and records `open-design.create_artifact.failed` `FailSafe/extension/src/integrations/open-design/OpenDesignL3Executor.ts:101-104` (`open-design.create_artifact.failed`).

## End-to-end scenario and measurable acceptance

Scenario: start the Open Design daemon, run "Register Open Design MCP Connection", read the exact command in the modal, choose Allow, and see "N read-only tools available" `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:156-158` (`read-only tools available.`).
Metric: a destructive tool call reaches the transport zero times (threshold: zero) `FailSafe/extension/src/test/integrations/open-design/OpenDesignMcpClient.test.ts:169` (`callRaw on destructive write tool throws WRITE_TOOL_NOT_ENABLED before reaching transport`).
Existing tests: `FailSafe/extension/src/test/extension/bootstrapOpenDesignMcp.test.cjs:297` (`stub.commands.get('failsafe.openDesign.registerMcp')`) (unit, a stubbed VS Code) and `FailSafe/extension/src/test/ui/open-design-l3.spec.ts:2` (`B-OD-8 visual verification`) (playwright-stubbed: it renders a pending create_artifact item from a stubbed hub).
Installed-extension test: no test installs the packaged VSIX and connects a real daemon (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. Provenance tagging, consented launch and the fail-closed tool gate are built and tested, but the customer-visible create_artifact path and the SSE observer are switched off while the UI and settings still present them. Either finish the receipt verifier that would let create_artifact run, or remove the request button and the SSE setting until it exists.

## Open defects

The SSE observer is constructed but never subscribed and its setting is read nowhere [B266] `FailSafe/extension/package.json:585-588` (`"failsafe.integrations.openDesign.sseEnabled"`).
The Console card queues a create_artifact L3 approval that always fails on approval (observed, not filed in this cycle; see Other findings in the portfolio) `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts:75` (`const approvalId = await deps.queueL3Approval({`).
B228 asks for capability conformance coverage of Open Design `docs/BACKLOG.md:584` (`Extend the #474 capability conformance suite`).
