# agent-failsafe adapter and SRE panel integration contract

Contract id: `agt-adapter` (registry row `integration-contract-agt-adapter`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review: none; `docs/research/integrations/` has no review of the agent-failsafe bridge. The AGT module installer is the separate `agt` contract.

**Owned files:**
- `FailSafe/extension/src/roadmap/services/AdapterService.ts`
- `FailSafe/extension/src/roadmap/services/AdapterTypes.ts`
- `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts`
- `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts`
- `FailSafe/extension/src/roadmap/routes/SreRoute.ts`
- `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts`
- `FailSafe/extension/src/roadmap/routes/templates/SreTypes.ts`

## Customer job

A team running Microsoft Agent Governance Toolkit agents wants to install the `agent-failsafe` Python bridge from the Console and see the toolkit's SRE snapshot (controls, fleet, events) inside the FailSafe sidebar.

## Measurable value

Metric: the share of sidebar SRE views that render a connected snapshot rather than the disconnected state `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts:6-13` (`return { connected: false, snapshot: null };`).
Baseline: no usage data is collected; install success rate and connected-view rate are unverified.

## Why not simply ask an agent

An agent can run `pip install agent-failsafe`, but it does not check the interpreter through FailSafe's trusted resolver, verify the install, write a default bridge config, or render the toolkit's SRE snapshot next to FailSafe's own governance view.

## API documentation

none: `docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for the agent-failsafe bridge or its REST endpoints (unverified beyond a search of that file for "agent-failsafe" and "SRE").

## Privileges and scopes

Credential: none sent by FailSafe; the bridge config type has an optional key field that FailSafe stores but never reads for a request `FailSafe/extension/src/roadmap/services/AdapterTypes.ts:48-52` (`export interface AdapterConfig {`).
Process: `python3`, `python`, `pip3` and `pip` only, each through the trusted resolver, from a fresh temporary folder `FailSafe/extension/src/roadmap/services/AdapterService.ts:53-66` (`exe = trustedExecutablePath(spec, runCwd);`).
Install: `pip3 install agent-failsafe` and, optionally, four toolkit packages, under the operator's own Python and PyPI access `FailSafe/extension/src/roadmap/services/AdapterService.ts:300-305` (`? ["install", "--upgrade", ADAPTER_PACKAGE]`).
Network target: the bridge base URL from `~/.failsafe/adapter/config.json`, default loopback port 9377 `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:5` (`const DEFAULT_ADAPTER_URL`).
Any capability that sends governance data to the bridge would need a separate decision and is marked requires separate approval (unverified: none exists).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| adapter-state-check | verified-shipped | `checkState` `FailSafe/extension/src/roadmap/services/AdapterService.ts:116` (`async checkState(): Promise<AdapterState> {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:344` (`setupAdapterRoutes(app, {`) | `FailSafe/extension/src/test/roadmap/AdapterService.test.ts` (unit) | Route `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:24` (`app.get("/api/adapter/status"`) |
| pypi-version-lookup | shipped-unverified | `checkLatestVersion` `FailSafe/extension/src/roadmap/services/AdapterService.ts:204-208` (`["index", "versions", ADAPTER_PACKAGE],`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:344` (`setupAdapterRoutes(app, {`) | none | Runs on every status check, unawaited `FailSafe/extension/src/roadmap/services/AdapterService.ts:187-192` (`Check latest version from PyPI (non-blocking)`) |
| adapter-install | shipped-unverified | `install` `FailSafe/extension/src/roadmap/services/AdapterService.ts:272` (`async install(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:344` (`setupAdapterRoutes(app, {`) | none | The route test uses a stub service, so pip install itself is not exercised `FailSafe/extension/src/test/extension/adapter-route.test.ts:13` (`uninstall: (onProgress: (p: unknown) => void)`) |
| adapter-routes | verified-shipped | `setupAdapterRoutes` `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:17` (`export function setupAdapterRoutes(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:344` (`setupAdapterRoutes(app, {`) | `FailSafe/extension/src/test/extension/adapter-route.test.ts` (route) | In-process HTTP harness with a stub service |
| adapter-health-check | verified-shipped | `healthCheck` `FailSafe/extension/src/roadmap/services/AdapterService.ts:441` (`async healthCheck(): Promise<AdapterHealthCheck> {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:344` (`setupAdapterRoutes(app, {`) | `FailSafe/extension/src/test/roadmap/AdapterService.test.ts` (unit) | Looks for the ledger under the process working directory, not the workspace `FailSafe/extension/src/roadmap/services/AdapterService.ts:465` (`path.join(process.cwd(), ".failsafe", "ledger", "ledger.db")`) |
| adapter-config | verified-shipped | `saveConfig` `FailSafe/extension/src/roadmap/services/AdapterService.ts:518` (`async saveConfig(config: AdapterConfig): Promise<void> {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:344` (`setupAdapterRoutes(app, {`) | `FailSafe/extension/src/test/roadmap/AdapterService.test.ts` (unit) | Any object is saved; no field is validated (F19) `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:176-183` (`await deps.adapterService.saveConfig(config);`) |
| sre-sidebar-panel | verified-shipped | `buildSreHtml` `FailSafe/extension/src/roadmap/routes/SreRoute.ts:10-11` (`res.send(buildSreHtml(await deps.getSnapshot()));`) | `FailSafe/extension/src/roadmap/FailSafeSidebarProvider.ts:213` (`/console/sre`) | `FailSafe/extension/src/test/roadmap/SreRoute.test.ts` (unit) | Route `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:532` (`app.get("/console/sre"`) |
| sre-snapshot-fetch | verified-shipped | `fetchAgtSnapshot` `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts:6` (`export async function fetchAgtSnapshot(baseUrl: string): Promise<SreViewModel> {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:533` (`getSnapshot: () => fetchAgtSnapshot(`) | `FailSafe/extension/src/test/roadmap/SreRoute.test.ts` (unit) | Base URL read per request here |
| sre-api-proxy | verified-shipped | `setupSreApiRoutes` `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:17` (`export function setupSreApiRoutes(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:319` (`setupSreApiRoutes(app, { rejectIfRemote:`) | `FailSafe/extension/src/test/roadmap/SreApiRoute.test.ts` (route) | Base URL read once at route registration `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:318` (`const adapterUrl = this.host.adapterService.getConfig()?.adapterBaseUrl;`) |

## Inbound fields

From pip: package versions parsed from `pip3 show` output `FailSafe/extension/src/roadmap/services/AdapterService.ts:176-181` (`showResult.stdout.match(/Version:\s*(\S+)/)`).
From the bridge: the SRE snapshot JSON, rendered with HTML escaping `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts:1` (`import { escapeHtml } from "../../../shared/utils/htmlSanitizer";`).
From the bridge, proxied unchanged: `/sre/events` and `/sre/fleet` `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:29-38` (`proxyAdapterGet(`).

## Outbound fields and egress

Repository content: no; the bridge requests are bare GETs `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:7-9` (`const resp = await fetch(url);`).
Metadata: yes, the package name to PyPI through pip on every status check, with no consent beyond opening the Adapter tab `FailSafe/extension/src/roadmap/services/AdapterService.ts:204-210` (`["index", "versions", ADAPTER_PACKAGE]`).
Network: GETs to the configured bridge base URL, which is not checked for scheme or host (F19) `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:22` (`const baseUrl = adapterBaseUrl`).
Graph relationships: no (unverified beyond the owned files).
Governance evidence: no; the default config points the bridge at a FailSafe MCP command, but FailSafe sends it nothing `FailSafe/extension/src/roadmap/services/AdapterService.ts:533-537` (`mcpServerCommand: ["failsafe", "mcp", "serve"],`).

## Transformations

The PyPI version is parsed from `pip index versions` output `FailSafe/extension/src/roadmap/services/AdapterService.ts:213-215` (`result.stdout.match(/\((\d+\.\d+\.\d+)\)/)`).
A failed bridge request becomes an empty events or fleet list `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:31-32` (`{ events: [] }`).
Health is "healthy" when a ledger file or a policy file is found `FailSafe/extension/src/roadmap/services/AdapterService.ts:496` (`const healthy = ledgerAccessible`).

## Persisted artifacts

The bridge config at `~/.failsafe/adapter/config.json` in the user's home directory `FailSafe/extension/src/roadmap/services/AdapterService.ts:113` (`path.join(os.homedir(), ".failsafe", "adapter", "config.json")`).
A default config is written after a verified install `FailSafe/extension/src/roadmap/services/AdapterService.ts:383-384` (`await this.ensureDefaultConfig();`).
A corrupt config is preserved aside before it is overwritten `FailSafe/extension/src/roadmap/services/AdapterService.ts:526` (`preserveCorruptFile(this.configPath`).
The Python packages themselves, in the operator's environment (unverified: their location depends on the interpreter).

## Graph links

Implemented: none (unverified beyond the owned files).
Proposed (not built): agent-run-to-evidence edges from toolkit events for scenario 3 in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Console Marketplace › Adapter tab: status, install, upgrade, uninstall, health and config `FailSafe/extension/src/roadmap/ui/modules/marketplace.js:7` (`const MARKETPLACE_TABS = ['Featured', 'All', 'Installed', 'Quarantined', 'Adapter'];`).
Only uninstall asks a browser confirm; install posts directly `FailSafe/extension/src/roadmap/ui/modules/adapter-panel.js:332` (`Are you sure you want to uninstall the agent-failsafe adapter?`).
Sidebar: an SRE view that loads `/console/sre` in the sidebar frame `FailSafe/extension/src/roadmap/FailSafeSidebarProvider.ts:213-221` (`mainFrame.src = isSre ? sreUrl : compactUrl;`).

## Governance policy and enforceability limits

Enforced: adapter and SRE API routes refuse non-loopback callers `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:53-54` (`if (deps.rejectIfRemote(req, res)) return;`).
Enforced: only four Python-family executables can be started, each through the trusted resolver `FailSafe/extension/src/roadmap/services/AdapterService.ts:53-60` (`Unsupported adapter executable`).
Not enforced: install and toolkit install run pip with no server-side confirmation `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:53-66` (`app.post("/api/adapter/install"`).
Not enforced: the saved config is not validated, so the bridge base URL can name any host (F19) `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:176-180` (`typeof config !== "object"`).
Observed: `/console/sre` has no loopback check of its own; the Console server binds 127.0.0.1 `FailSafe/extension/src/roadmap/ConsoleServer.ts:46` (`const HOST = "127.0.0.1";`).

## Failure, offline, stale and permission semantics

No Python or pip: the state reports the missing prerequisite and install stops `FailSafe/extension/src/roadmap/services/AdapterService.ts:283-290` (`Prerequisites not met`).
Toolkit packages that fail to install are warned and skipped `FailSafe/extension/src/roadmap/services/AdapterService.ts:355-358` (`Non-fatal for optional packages`).
Install verifies the package after pip and fails if it is not found `FailSafe/extension/src/roadmap/services/AdapterService.ts:372-380` (`Adapter not found after installation`).
Bridge offline: the panel renders disconnected and the API returns empty lists `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts:8-12` (`throw new Error(`).
Stale: a changed base URL reaches `/api/v1/sre` only after the Console server restarts `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:318-319` (`const adapterUrl = this.host.adapterService.getConfig()?.adapterBaseUrl;`).
A corrupt config reads as missing `FailSafe/extension/src/roadmap/services/AdapterService.ts:507-515` (`// Config doesn't exist or is invalid`).

## End-to-end scenario and measurable acceptance

Scenario: open Marketplace › Adapter, install the adapter, see the version and toolkit packages, start the bridge, and switch the sidebar to SRE to see a connected snapshot `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts:10` (`return { connected: true, snapshot: await resp.json() as AgtSreSnapshot };`).
Metric: a reachable bridge yields `connected: true` and an unreachable one `connected: false` with no error page (threshold: both states) `FailSafe/extension/src/test/roadmap/SreApiRoute.test.ts:53-70` (`returns connected:false when adapter unreachable`).
Existing tests: service state, health and config (unit), the adapter routes (route), the SRE routes (route and unit) and the panel `FailSafe/extension/src/test/roadmap/adapter-panel.test.ts:4` (`import { JSDOM } from 'jsdom';`) (jsdom).
Installed-extension test: none installs the real adapter or talks to a real bridge (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The read side (state, health, SRE panel) works and is tested, but the install path runs pip with no server-side confirmation, the bridge base URL is unvalidated and can point anywhere, the status check calls PyPI on every view, and the health check looks under the process working directory. Close those before widening the bridge.

## Open defects

[B271] adapter base URL not validated (F19) `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:22` (`const baseUrl = adapterBaseUrl`).
Observed outside the LD3 list, filed as B276 (see Other findings in the portfolio): adapter install runs pip without a server-side confirmation (observed; not one of the LD3 facts) `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:53-66` (`deps.adapterService.install(`).
Health check reads `.failsafe` under `process.cwd()` instead of the workspace root (observed; impact depends on the host's working directory, unverified) `FailSafe/extension/src/roadmap/services/AdapterService.ts:465` (`path.join(process.cwd(), ".failsafe", "ledger", "ledger.db")`).
