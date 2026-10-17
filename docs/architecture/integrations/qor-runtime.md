# Qor runtime integration contract

Contract id: `qor-runtime` (registry row `integration-contract-qor-runtime`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

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
On main no key is ever supplied: the only `ConsoleServer` is constructed without `qorRuntime` options `FailSafe/extension/src/extension/bootstrapServers.ts:140-146` (`const consoleServer = new ConsoleServer(`).
The plain-text key setting is marked unused and is offered only for removal `FailSafe/extension/src/integrations/credentials/credentialRegistry.ts:38` (`ORPHANED_SECRET_SETTINGS`).
The Console routes refuse non-loopback callers `FailSafe/extension/src/roadmap/routes/QorRoute.ts:45-47` (`if (deps.rejectIfRemote(req, res)) return;`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| runtime-status-snapshot | shipped-inert | `fetchSnapshot` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:70-78` (`async fetchSnapshot(): Promise<QorRuntimeSnapshot>`) | `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:179` (`const qorRuntime = await d.qorRuntimeService.fetchSnapshot();`) | `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts` (unit) | Switch: `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:15-18` (`enabled: Boolean(options?.enabled), baseUrl,`); constructed at `FailSafe/extension/src/roadmap/ConsoleServer.ts:147` (`this.qorRuntimeService = new QorRuntimeService(resolveQorRuntimeOptions(options.qorRuntime));`) |
| runtime-health-proxy | shipped-inert | `proxy` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:130-139` (`Qor runtime integration is disabled`) | `FailSafe/extension/src/roadmap/routes/QorRoute.ts:45-48` (`await deps.qorRuntimeService.proxy(req, res, "/health");`) | `FailSafe/extension/src/test/extension/qor-route.test.ts` (route) | Switch: `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:136-138` (`if (!this.options.enabled) {`) |
| runtime-evaluate-proxy | shipped-inert | `proxy` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:140-143` (`const response = await this.fetchJson(endpoint, opts);`) | `FailSafe/extension/src/roadmap/routes/QorRoute.ts:50-53` (`"/evaluate", "POST"`) | `FailSafe/extension/src/test/extension/qor-route.test.ts` (route) | Switch: `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:136-138` (`if (!this.options.enabled) {`) |
| settings-driven-enable | proposed | none | none | none | Contributed settings exist but no code reads them `FailSafe/extension/package.json:692-695` (`"failsafe.qorelogic.externalRuntime.enabled": {`) |

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

Console monitor: a "Qor Runtime" node that reads "integration disabled" and is paused on main `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:213-216` (`id: "qor-runtime", label: "Qor Runtime",`).
Routes: `GET /api/qor/runtime`, `GET /api/qor/health` and `POST /api/qor/evaluate` `FailSafe/extension/src/roadmap/routes/QorRoute.ts:20-22` (`app.get("/api/qor/runtime"`).
Settings: "failsafe.qorelogic.externalRuntime.enabled", baseUrl and timeoutMs are listed in Settings but change nothing `FailSafe/extension/package.json:692-700` (`"description": "Enable Qor runtime integration in Console monitor."`).

## Governance policy and enforceability limits

Enforced: with the client disabled, every call short-circuits before any fetch `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:104` (`if (!this.options.enabled) return { ok: false, error: "disabled" };`).
Enforced: the proxy routes answer 503 while disabled `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:136-138` (`res.status(503).json(`).
Limit: if a caller ever enabled it, the base URL would not be validated beyond trimming `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:16` (`.trim().replace(`).

## Failure, offline, stale and permission semantics

Disabled (main): the snapshot says `disabled` and the proxies 503 `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:72-77` (`enabled: false, connected: false,`).
Offline (when enabled): an aborted or failed request is `request_failed`; a non-2xx is `upstream_<status>`, proxied as 502 `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:123-127` (`return { ok: false, error: "request_failed", detail };`).
A missing global fetch throws inside the lazy lookup and is reported as `request_failed` `FailSafe/extension/src/roadmap/services/QorRuntimeService.ts:61-66` (`fetch is not available in this runtime`).

## End-to-end scenario and measurable acceptance

Scenario on main: open the Console monitor and find the Qor Runtime node paused with "integration disabled", whatever the settings say `FailSafe/extension/src/roadmap/ConsoleServerHub.ts:213-216` (`? "integration disabled"`).
Metric: zero outbound requests while disabled (threshold: zero) `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts:78-87` (`fetch must not be invoked when disabled`).
Existing tests: `FailSafe/extension/src/test/extension/qor-runtime-service.test.ts:63` (`suite('QorRuntimeService'`) (unit, stubbed fetch); `FailSafe/extension/src/test/extension/qor-route.test.ts:70` (`suite('registerQorRoute'`) (route).
Installed-extension test: none (unverified).

## Recommended disposition

Recommendation for the owner: **RETIRE**. The client cannot be turned on: the only `ConsoleServer` is built without runtime options and nothing reads the contributed `externalRuntime` settings, so the Settings entries promise a feature that does nothing. Remove the dead settings and the client, or, if a runtime is planned, wire the settings with base-URL validation under a separate approval.

## Open defects

Observed outside the LD3 list, filed as B277 (see Other findings in the portfolio): the `failsafe.qorelogic.externalRuntime.*` settings are contributed but never read, so enabling them does nothing `FailSafe/extension/package.json:692-718` (`"failsafe.qorelogic.externalRuntime.timeoutMs": {`).
The only construction passes no runtime options `FailSafe/extension/src/extension/bootstrapServers.ts:140-146` (`const consoleServer = new ConsoleServer(`).
