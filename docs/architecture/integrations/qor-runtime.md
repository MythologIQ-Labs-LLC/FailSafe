# Qor runtime integration contract

Contract id: `qor-runtime` (registry row `integration-contract-qor-runtime`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

This contract was added during implementation: plan-532a LD1 asked for a contract or a reconciliation row for `QorRuntimeService.ts`; it is a contract because the module is an HTTP client with a configurable base URL and an API-key header, switched off on main. No legacy contract review exists for it.

**Owned files:**
- `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts`

Shared modules it uses (not owned here): `FailSafe/extension/src/roadmap/routes/QorRoute.ts` (its runtime routes sit beside the Shadow Genome dashboard, sprint and plan routes), `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts`, `FailSafe/extension/src/roadmap/ConsoleServerHub.ts`.

## Customer job

An operator running an external Qor policy runtime would see its health and policy version in the Console monitor and could ask it to evaluate a request through the Console, without the browser talking to that runtime directly.

## Measurable value

Metric: none can be measured on main, because the client is always disabled `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:15-18` (`enabled: Boolean(options?.enabled), baseUrl,`).
Baseline: unverified; no workspace can turn the client on.

## Why not simply ask an agent

An agent could call a runtime's HTTP API directly, but it would not keep the API key on the extension side or show the runtime's state as a node of the Console monitor; on main this path does neither, because it is off.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for a Qor runtime API (unverified: searched the index for "runtime" at c36b9ee2).
The client calls `/health`, `/policy/version` and `/evaluate` on its base URL `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:80-89` (`const policy = await this.fetchJson("/policy/version");`).

## Privileges and scopes

Credential: an optional API key sent as the `x-qor-api-key` header when one is supplied `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:150-155` (`headers["x-qor-api-key"] = this.options.apiKey;`).
On main no key is ever supplied: the only `ConsoleServer` is constructed without `qorRuntime` options `FailSafe/extension/src/extension/bootstrapServers.ts:144-150` (`const consoleServer = new ConsoleServer(`).
The plain-text key setting is marked unused and is offered only for removal `FailSafe/extension/src/integrations/credentials/credentialRegistry.ts:38` (`ORPHANED_SECRET_SETTINGS`).
The Console routes refuse non-loopback callers `FailSafe/extension/src/roadmap/routes/QorRoute.ts:45-47` (`if (deps.rejectIfRemote(req, res)) return;`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| runtime-status-snapshot | shipped-inert | `fetchSnapshot` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:70-78` (`async fetchSnapshot(): Promise<QorRuntimeSnapshot>`) | `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:179` (`const qorRuntime = await d.qorRuntimeService.fetchSnapshot();`) | `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts` (unit) | Switch: `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:15-18` (`enabled: Boolean(options?.enabled), baseUrl,`); constructed at `FailSafe/extension/src/roadmap/ConsoleServer.ts:149` (`this.qorRuntimeService = new QorRuntimeService(resolveQorRuntimeOptions(options.qorRuntime));`) |
| runtime-health-proxy | shipped-inert | `proxy` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:130-139` (`Qor runtime integration is disabled`) | `FailSafe/extension/src/roadmap/routes/QorRoute.ts:45-48` (`await deps.qorRuntimeService.proxy(req, res, "/health");`) | `FailSafe/extension/src/test/extension/qor-route.test.ts` (route) | Switch: `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:136-138` (`if (!this.options.enabled) {`) |
| runtime-evaluate-proxy | shipped-inert | `proxy` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:140-143` (`const response = await this.fetchJson(endpoint, opts);`) | `FailSafe/extension/src/roadmap/routes/QorRoute.ts:50-53` (`"/evaluate", "POST"`) | `FailSafe/extension/src/test/extension/qor-route.test.ts` (route) | Switch: `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:136-138` (`if (!this.options.enabled) {`) |
| settings-driven-enable | proposed | none | none | none | Contributed settings exist but no code reads them `FailSafe/extension/package.json:697-700` (`"failsafe.qorelogic.externalRuntime.enabled": {`) |

## Inbound fields

From the runtime (when enabled): the JSON body of `/health`, and `policyVersion` from `/policy/version` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:93-95` (`String((policy.body as { policyVersion?: string }).policyVersion`).
From the runtime: the text of a non-2xx response, returned as `detail` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:118-120` (`return { ok: false, error: `).

## Outbound fields and egress

Repository content: no on main; when enabled, `/api/qor/evaluate` would forward the Console request body unchanged `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:140-142` (`{ method: "POST" as const, body:`).
Metadata: no on main; when enabled, the API key header and JSON content type `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:150-155` (`private buildHeaders(): Record<string, string> {`).
Graph relationships: no `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:19-27` (`export type QorRuntimeSnapshot = {`).
Governance evidence: no `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:100-104` (`if (!this.options.enabled) return { ok: false, error: "disabled" };`).
Destination: the default base URL is a loopback port; any configured value would be used as given `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:16` (`String(options?.baseUrl`).
Consent: none needed on main, since nothing is sent `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:72-78` (`error: "disabled",`).

## Transformations

The base URL is trimmed of trailing slashes and the timeout clamped to 500-30000 ms with a 4000 ms default `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:16-20` (`Math.max(500, Math.min(30000,`).
The snapshot maps health and policy calls to enabled, connected, latency and policy version `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:90-97` (`enabled: true, connected: true,`).

## Persisted artifacts

None; the snapshot is rebuilt on each hub build and kept in memory only `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:179` (`const qorRuntime = await d.qorRuntimeService.fetchSnapshot();`).

## Graph links

Implemented: none `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:19-27` (`lastCheckedAt: string;`).
Proposed (not built): none planned (unverified).

## Customer UI and actions

Hub payload: a "Qor Runtime" entry in `nodeStatus` that reads "integration disabled" and is paused on main `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:213-216` (`id: "qor-runtime", label: "Qor Runtime",`); no Console or Monitor module reads `nodeStatus` (unverified beyond a search of `FailSafe/extension/src/roadmap/ui`).
Routes: `GET /api/qor/runtime`, `GET /api/qor/health` and `POST /api/qor/evaluate` `FailSafe/extension/src/roadmap/routes/QorRoute.ts:20-22` (`app.get("/api/qor/runtime"`).
Settings: "failsafe.qorelogic.externalRuntime.enabled", baseUrl and timeoutMs are listed in Settings but change nothing `FailSafe/extension/package.json:697-705` (`"description": "Enable Qor runtime integration in Console monitor."`).

## Governance policy and enforceability limits

Enforced: with the client disabled, every call short-circuits before any fetch `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:104` (`if (!this.options.enabled) return { ok: false, error: "disabled" };`).
Enforced: the proxy routes answer 503 while disabled `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:136-138` (`res.status(503).json(`).
Limit: if a caller ever enabled it, the base URL would not be validated beyond trimming `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:16` (`.trim().replace(`).

## Failure, offline, stale and permission semantics

Disabled (main): the snapshot says `disabled` and the proxies 503 `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:72-77` (`enabled: false, connected: false,`).
Offline (when enabled): an aborted or failed request is `request_failed`; a non-2xx is `upstream_<status>`, proxied as 502 `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:123-127` (`return { ok: false, error: "request_failed", detail };`).
A missing global fetch throws inside the lazy lookup and is reported as `request_failed` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:61-66` (`fetch is not available in this runtime`).

## End-to-end scenario and measurable acceptance

Scenario on main: the hub payload carries a "Qor Runtime" `nodeStatus` entry, paused with "integration disabled", whatever the settings say `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:213-216` (`? "integration disabled"`); no Console or Monitor module renders it (unverified beyond a search of `FailSafe/extension/src/roadmap/ui`).
Metric: zero outbound requests while disabled (threshold: zero) `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts:78-87` (`fetch must not be invoked when disabled`).
Existing tests: `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts:63` (`suite('QorRuntimeService'`) (unit, stubbed fetch); `FailSafe/extension/src/test/extension/qor-route.test.ts:70` (`suite('registerQorRoute'`) (route).
Installed-extension test: none (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **RETIRE**. The client cannot be turned on: the only `ConsoleServer` is built without runtime options and nothing reads the contributed `externalRuntime` settings, so the Settings entries promise a feature that does nothing. Remove the dead settings and the client, or, if a runtime is planned, wire the settings with base-URL validation under a separate approval. The owner chose removal; the review below bounds it.

## Retirement review (#538)

The owner decided RETIRE on 2026-10-18 (#538); this review lists what a removal touches and removes nothing. The removal is backlog item [B289], a separate small PR that also closes B277 `docs/BACKLOG.md` (`[B289] Retire the Qor runtime client`).

### Inventory

Scope: every file hit by the command below at main 243a34a1, with its hit count; it is a search, not a proof that nothing else refers to the runtime (unverified beyond this search).
Command: `git grep -c -I -i -E "QorRuntime|qor-runtime|externalRuntime|/api/qore?/(runtime|health|evaluate)|x-qor-api-key|Qore? runtime|QoreRuntime" 243a34a1 --` reports 41 files; piped to `wc -l` it prints 41 (unverified beyond this search).
Blind spots: a renamed field, a dynamic lookup or a caller outside this repository would not be found (unverified beyond this search).
- 10 hits, the owned client `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:51` (`export class QorRuntimeService {`).
- 7 hits `FailSafe/extension/src/roadmap/ConsoleServer.ts:23` (`import { QorRuntimeService, type QorRuntimeOptions } from "./services/QorRuntimeService";`).
- 6 hits `FailSafe/extension/src/roadmap/routes/QorRoute.ts:20` (`app.get("/api/qor/runtime"`).
- 5 hits `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:19` (`import { QorRuntimeService } from "./QorRuntimeService";`).
- 3 hits `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:33` (`type QorRuntimeSnapshot = {`).
- 2 hits `FailSafe/extension/src/roadmap/routes/types.ts:2` (`import type { QorRuntimeService } from '../services/QorRuntimeService';`).
- 2 hits `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:91` (`qorRuntimeService: unknown;`).
- 2 hits `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:13` (`import type { QorRuntimeOptions } from "./QorRuntimeService";`).
- 2 hits `FailSafe/extension/src/roadmap/services/hub-payload-assembler.ts:39` (`trust: unknown; qorRuntime: unknown;`).
- 8 hits `FailSafe/extension/src/roadmap/ui/roadmap.js:18` (`qorRuntime: null,`).
- 1 hit `FailSafe/extension/src/roadmap/ui/modules/tickers.js:20` (`const latVal = data.qorRuntime?.latencyMs;`).
- 1 hit `FailSafe/extension/src/integrations/credentials/credentialRegistry.ts:38` (`ORPHANED_SECRET_SETTINGS`).
- 9 hits `FailSafe/extension/package.json:697` (`"failsafe.qorelogic.externalRuntime.enabled": {`).
- 28 hits `FailSafe/extension/src/test/extension/qor-route.test.ts:4` (`QorRuntimeService,`).
- 14 hits `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts:63` (`suite('QorRuntimeService'`).
- 6 hits `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts:67` (`const qorRuntimeService: any = {`).
- 2 hits `FailSafe/extension/src/test/integrations/credentials/IntegrationCredentials.test.ts:20` (`const ORPHAN = 'failsafe.qorelogic.externalRuntime.apiKey';`).
- 2 hits `FailSafe/extension/src/test/ui/helpers/ledgerFixtures.ts:93` (`qorRuntime?: Record<string, unknown>;`).
- 1 hit `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:71` (`${SRC}/roadmap/services/QorRuntimeService.ts`).
- 1 hit `FailSafe/extension/src/test/extension/feature-status-route.test.ts:21` (`qorRuntimeService: {} as any,`).
- 1 hit `FailSafe/extension/src/test/extension/governance-dashboard-route.test.ts:12` (`qorRuntimeService: undefined as any,`).
- 1 hit `FailSafe/extension/src/test/extension/hook-route.test.ts:23` (`qorRuntimeService: {} as any,`).
- 1 hit `FailSafe/extension/src/test/extension/skills-api-route.test.ts:13` (`qorRuntimeService: {} as any,`).
- 1 hit `FailSafe/extension/src/test/qorlogic/consumer/consumer-diagnostics.test.ts:111` (`qorRuntimeService: { fetchSnapshot: async () => ({}) } as never,`).
- 1 hit `FailSafe/extension/src/test/roadmap/ConsoleRouteRegistrar.test.ts:80` (`qorRuntimeService: { fetchSnapshot: async () => ({}) },`).
- 35 hits, this contract (unverified beyond this search).
- 4 hits, the portfolio `docs/architecture/INTEGRATION_PORTFOLIO.md` (`[qor-runtime](integrations/qor-runtime.md)`).
- 10 hits, FX048-FX052, FX098-FX100, FX153 and FX454 `docs/FEATURE_INDEX.md` (`failsafe.qorelogic.externalRuntime.enabled`).
- 3 hits, B154 and B166 (historic) and B277 `docs/BACKLOG.md` (`[B166] Phase 3: Extract QoreRuntimeService`).
- 1 hit, the registry row `docs/ARCHITECTURE_INDEX.md` (`integration-contract-qor-runtime`).
- 1 hit, the tier row `docs/GOVERNANCE_INDEX.md` (`docs/architecture/integrations/qor-runtime.md`).
- 6 hits, the marketplace README feature bullet and settings table `FailSafe/extension/README.md` (`Optional external Qore runtime integration can display live runtime state`).
- 5 hits `docs/wiki/Configuration-Reference.md` (`### External Runtime`).
- 1 hit `docs/wiki/API-Reference.md` (`failsafe.qorelogic.externalRuntime.apiKey`).
- 1 hit `docs/wiki/SRE-Dashboard-and-Monitoring.md` (`failsafe.qorelogic.externalRuntime.baseUrl`).
- 2 hits, historic, kept `CHANGELOG.md` (`ConsoleServer decomposition — extracted`).
- 2 hits, historic, kept `FailSafe/extension/CHANGELOG.md` (`ConsoleServer decomposition — extracted`).
- 1 hit, historic, kept `docs/SYSTEM_STATE.md` (`Remove dead code (-176 lines: Qore runtime`).
- 1 hit, historic, kept `docs/SHADOW_GENOME.md` (`Direct read of ConsoleServer at `).
- 8 hits, a historic plan, kept `docs/Planning/plan-consoleserver-decomposition.md` (`## Phase 3: Extract QoreRuntimeService`).
- 8 hits, Merkle-chained, never edited `docs/META_LEDGER.md` (`Remove dead code (Qore runtime refs`).

### What breaks on removal

Settings users may have set change nothing today: the only construction passes no runtime options `FailSafe/extension/src/extension/bootstrapServers.ts:144` (`const consoleServer = new ConsoleServer(`), and no source reads them `FailSafe/extension/package.json:697` (`"failsafe.qorelogic.externalRuntime.enabled": {`).
A loopback caller of the runtime routes gets 404 instead of 200 or 503 `FailSafe/extension/src/roadmap/routes/QorRoute.ts:45` (`app.get("/api/qor/health"`); no caller is in the repository and external callers are unverified beyond this search.
The only browser call into this route family is the governance dashboard, which stays `FailSafe/extension/src/roadmap/ui/modules/shadow-genome.js:83` (`fetch('/api/qor/governance-dashboard')`).
One hub `nodeStatus` entry, always paused, is lost `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:213` (`id: "qor-runtime", label: "Qor Runtime",`); no Console or Monitor module reads `nodeStatus` (a search of roadmap/ui has no hit; external readers unverified beyond this search).
The hub payload loses `qorRuntime` `FailSafe/extension/src/roadmap/services/hub-payload-assembler.ts:80` (`qorRuntime: state.qorRuntime, runState: state.runState,`), so the API latency ticker loses its only source `FailSafe/extension/src/roadmap/ui/modules/tickers.js:20` (`const latVal = data.qorRuntime?.latencyMs;`) and must be removed or re-sourced, with the row that pins it `FailSafe/extension/src/test/ui/command-center-overview.spec.ts:32` (`#ticker-latency`).
The Monitor next-step branch and the dead no-op go `FailSafe/extension/src/roadmap/ui/roadmap.js:210` (`if (qorRuntime.enabled && !qorRuntime.connected) {`) `FailSafe/extension/src/roadmap/ui/roadmap.js:256-257` (`renderQorRuntime() {`).
The route test file stays: it is the only test of the sprint and plans routes `FailSafe/extension/src/test/extension/qor-route.test.ts:141` (`GET /api/sprint/:id returns {sprint, plan} from planManager`) `FailSafe/extension/src/test/extension/qor-route.test.ts:162` (`FX102 GET /api/plans returns {plans: [...]}`), so FX101 and FX102 keep their tests.
Dropping the runtime 403 row loses no remote-refusal coverage for the kept routes; the governance dashboard has its own `FailSafe/extension/src/test/extension/governance-dashboard-route.test.ts:70` (`remote request → rejectIfRemote short-circuits before the loader`).
The hub ordering assertion keeps its transparency half `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts:111` (`qorRuntime fetch must resolve before transparency tail`).
The portfolio's reconciliation row for the route file cites the runtime route and must be re-anchored `docs/architecture/INTEGRATION_PORTFOLIO.md` (`not an integration: the Console's Qor routes`).
FX1003 names the client as a scan hit `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:71` (`${SRC}/roadmap/services/QorRuntimeService.ts`) and requires the owned file to exist, so this contract needs the retired-contract rule B288 adds `docs/BACKLOG.md` (`[B288] Retire the governance webhook sender`).
Found, not fixed: FX048, FX049, FX098, FX099, FX100, FX101, FX102, FX153 and FX454 cite `extension/qore-route.test.ts` or `extension/qore-runtime-service.test.ts`, which do not exist; the real files are `qor-route.test.ts` and `qor-runtime-service.test.ts` `docs/FEATURE_INDEX.md` (`extension/qore-route.test.ts`); B289 corrects them.
Found, not fixed: the FX050 note names the same missing `qore-runtime-service.test.ts` `docs/FEATURE_INDEX.md` (`qore-runtime-service.test.ts) consumes it`); B289 corrects it.
Found, not fixed: FX098, FX099 and FX100 name `/api/qore/runtime`, `/api/qore/health` and `/api/qore/evaluate`, but the routes are `/api/qor/*` `docs/FEATURE_INDEX.md` (`GET /api/qore/runtime`) `FailSafe/extension/src/roadmap/routes/QorRoute.ts:20` (`app.get("/api/qor/runtime"`); B289 corrects them.

### Bounded removal proposal (B289)

- Delete the client `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:51` (`export class QorRuntimeService {`).
- Delete its unit test `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts:63` (`suite('QorRuntimeService'`).
- Keep the route test; remove its runtime import and helpers `FailSafe/extension/src/test/extension/qor-route.test.ts:3-7` (`QorRuntimeService,`) `FailSafe/extension/src/test/extension/qor-route.test.ts:11-25` (`function makeRuntimeOptions(`).
- Remove the four runtime rows `FailSafe/extension/src/test/extension/qor-route.test.ts:77` (`GET /api/qor/runtime returns 200 with snapshot`) `FailSafe/extension/src/test/extension/qor-route.test.ts:97` (`GET /api/qor/health with enabled=false returns 503`) `FailSafe/extension/src/test/extension/qor-route.test.ts:113` (`POST /api/qor/evaluate forwards body`) `FailSafe/extension/src/test/extension/qor-route.test.ts:200` (`GET /api/qor/runtime rejects via deps.rejectIfRemote with 403`).
- Remove the runtime dependency from the kept rows `FailSafe/extension/src/test/extension/qor-route.test.ts:34` (`qorRuntimeService: undefined as unknown as QorRuntimeService,`) `FailSafe/extension/src/test/extension/qor-route.test.ts:149` (`const service = new QorRuntimeService(`) `FailSafe/extension/src/test/extension/qor-route.test.ts:172` (`const service = new QorRuntimeService(`) `FailSafe/extension/src/test/extension/qor-route.test.ts:190` (`const service = new QorRuntimeService(`).
- Remove the options resolver `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:15` (`export function resolveQorRuntimeOptions(`).
- Remove the import, option, field, construction and two dependencies in ConsoleServer `FailSafe/extension/src/roadmap/ConsoleServer.ts:56` (`qorRuntime?: Partial<QorRuntimeOptions>;`) `FailSafe/extension/src/roadmap/ConsoleServer.ts:149` (`this.qorRuntimeService = new QorRuntimeService(resolveQorRuntimeOptions(options.qorRuntime));`) `FailSafe/extension/src/roadmap/ConsoleServer.ts:315` (`qorRuntimeService: this.qorRuntimeService,`) `FailSafe/extension/src/roadmap/ConsoleServer.ts:356` (`qorRuntimeService: this.qorRuntimeService,`).
- Remove the hub import, dependency, fetch, node argument and state `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:39` (`qorRuntimeService: QorRuntimeService;`) `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:179` (`const qorRuntime = await d.qorRuntimeService.fetchSnapshot();`) `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:195` (`const nodeStatusArr = buildNodeStatus(`) `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:199` (`activePlan, sentinelStatus, l3Queue, trust, qorRuntime, checkpointSummary,`).
- Remove the node type, parameter and entry `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:193` (`qor: QorRuntimeSnapshot,`) `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:213` (`id: "qor-runtime", label: "Qor Runtime",`).
- Remove the payload field `FailSafe/extension/src/roadmap/services/hub-payload-assembler.ts:80` (`qorRuntime: state.qorRuntime, runState: state.runState,`).
- Remove the route dependency `FailSafe/extension/src/roadmap/routes/types.ts:22` (`qorRuntimeService: QorRuntimeService;`) `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:261` (`qorRuntimeService: h.qorRuntimeService as any,`).
- Remove the three runtime routes and update the header, keeping the governance dashboard, sprint and plans routes `FailSafe/extension/src/roadmap/routes/QorRoute.ts:2` (`QorRoute - Express handlers for the `) `FailSafe/extension/src/roadmap/routes/QorRoute.ts:50` (`app.post("/api/qor/evaluate"`).
- Remove or re-source the latency ticker and its pinned row `FailSafe/extension/src/roadmap/ui/command-center.html:69` (`id="ticker-latency"`) `FailSafe/extension/src/test/ui/command-center-overview.spec.ts:32` (`#ticker-latency`).
- Remove the Monitor state, argument, branch and dead method `FailSafe/extension/src/roadmap/ui/roadmap.js:173` (`this.hub.qorRuntime`) `FailSafe/extension/src/roadmap/ui/roadmap.js:187` (`this.renderQorRuntime(`).
- Drop the fixture fields `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts:236` (`qorRuntimeService: { fetchSnapshot: async () => ({}) } as any,`) `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts:275` (`qorRuntimeService: { fetchSnapshot: async () => ({}) } as any,`) `FailSafe/extension/src/test/ui/helpers/ledgerFixtures.ts:111` (`qorRuntime: { enabled: false, connected: false },`) and the six route-fixture fields listed in the inventory `FailSafe/extension/src/test/extension/hook-route.test.ts:23` (`qorRuntimeService: {} as any,`).
- Apply the settings strategy below `FailSafe/extension/package.json:718` (`"failsafe.qorelogic.externalRuntime.timeoutMs": {`).
- Remove the README feature bullet and settings rows `FailSafe/extension/README.md` (`Enable external FailSafe-Qore runtime integration in monitor`).
- Update the three wiki pages `docs/wiki/Configuration-Reference.md` (`Enable Qore runtime integration`) `docs/wiki/API-Reference.md` (`failsafe.qorelogic.externalRuntime.apiKey`) `docs/wiki/SRE-Dashboard-and-Monitoring.md` (`failsafe.qorelogic.externalRuntime.baseUrl`).
- Mark FX048, FX049, FX098-FX100, FX153 and FX454 retired, keeping the rows, and correct the ghost test paths; FX050-FX052 stay OPERATOR-PENDING until the settings leave contributes `docs/FEATURE_INDEX.md` (`OPERATOR-PENDING: package.json Qore runtime API key`).
- Re-anchor the portfolio reconciliation row, drop the named scan hit and update this contract `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:71` (`${SRC}/roadmap/services/QorRuntimeService.ts`).
- Add the migration note under Unreleased and close B277 `docs/BACKLOG.md` (`Bounded removal: B289 (#538).`).

### Settings strategy and migration

Deprecate first: in the removal release, enabled, baseUrl, apiKeyEnvVar and timeoutMs gain a deprecationMessage ("No longer used: FailSafe has no external Qor runtime integration. Remove this setting.") and stay contributed, as apiKey already does `FailSafe/extension/package.json:709` (`"deprecationMessage": "Not used by FailSafe. Remove this plain-text value."`).
They leave contributes one release later; nothing reads them, so no behaviour changes in either step `FailSafe/extension/package.json:697` (`"failsafe.qorelogic.externalRuntime.enabled": {`).
apiKey stays contributed while it is listed for plain-text cleanup `FailSafe/extension/src/integrations/credentials/credentialRegistry.ts:38` (`ORPHANED_SECRET_SETTINGS`), because the cleanup reads and removes a stored value through the configuration API `FailSafe/extension/src/integrations/credentials/credentialMigration.ts:132` (`for (const settingKey of ORPHANED_SECRET_SETTINGS) {`); that VS Code refuses writes to an unregistered key is unverified here, and B289 proves it with a test before relying on it.
Migration note for the CHANGELOG: "The Qor runtime settings never had an effect and are deprecated; remove them from your settings. A stored plain-text API key is still offered for removal." (unverified until B289 ships it).

## Open defects

Observed outside the LD3 list, filed as B277 (see Other findings in the portfolio): the `failsafe.qorelogic.externalRuntime.*` settings are contributed but never read, so enabling them does nothing `FailSafe/extension/package.json:697-723` (`"failsafe.qorelogic.externalRuntime.timeoutMs": {`).
The only construction passes no runtime options `FailSafe/extension/src/extension/bootstrapServers.ts:144-150` (`const consoleServer = new ConsoleServer(`).
The bounded removal is B289, which closes B277 (see the Retirement review above); until it lands the settings stay contributed and unread `FailSafe/extension/package.json:697` (`"failsafe.qorelogic.externalRuntime.enabled": {`).
