# Agent Governance Toolkit (AGT) installer integration contract

Contract id: `agt` (registry row `integration-contract-agt`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review: none; `docs/research/integrations/` has no AGT review. The separate agent-failsafe Python bridge and the SRE panel are the `agt-adapter` contract.

**Owned files:**
- `FailSafe/extension/src/integrations/agt/`
- `FailSafe/extension/src/roadmap/routes/AgtRoute.ts`

## Customer job

A developer wants the Microsoft Agent Governance Toolkit module that matches the workspace's language or agent host, with the correct install command, without searching several package registries.

## Measurable value

Metric: the share of workspaces where at least one language module is detected from root manifests `FailSafe/extension/src/integrations/agt/agt-catalog.ts:111` (`export function detectEnvironment(rootEntries: string[]): string[] {`).
Baseline: no usage data is collected; detection hit rate and install completion are unverified.

## Why not simply ask an agent

An agent may suggest a package name from training data; this catalog pins commands that were checked against the registries (for example the Rust crate name), marks the Go module as source-only, and never runs the command itself.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:36` (`**Agent Governance Toolkit (AGT) installer**`) links the upstream repository; the row still says "built (PR #140, held)", which no longer describes main (unverified as to when it was refreshed).

## Privileges and scopes

Credential: none `FailSafe/extension/src/integrations/agt/agt-catalog.ts:18-19` (`Pure — no fs/vscode/network`).
The route reads only the names of files at the workspace root `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:25-29` (`fs.readdirSync(workspaceRoot, { withFileTypes: true })`).
Running a module's command uses the operator's own package-manager credentials in a VS Code terminal (unverified: FailSafe does not see them).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| environment-detection | verified-shipped | `detectEnvironment` `FailSafe/extension/src/integrations/agt/agt-catalog.ts:111` (`export function detectEnvironment(rootEntries: string[]): string[] {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:489` (`app.get("/api/v1/agt/modules"`) | `FailSafe/extension/src/test/integrations/agt/agt-catalog.test.ts` (unit) | Language modules only `FailSafe/extension/src/integrations/agt/agt-catalog.ts:115` (`if (m.kind !== 'language'`) |
| verified-module-catalog | verified-shipped | `AGT_MODULES` `FailSafe/extension/src/integrations/agt/agt-catalog.ts:45` (`export const AGT_MODULES: AgtModule[] = [`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:489` (`app.get("/api/v1/agt/modules"`) | `FailSafe/extension/src/test/integrations/agt/agt-catalog.test.ts` (unit) | Nine modules, verified on a stated date `FailSafe/extension/src/integrations/agt/agt-catalog.ts:9-10` (`microsoft/agent-governance-toolkit, 2026-06-03`) |
| terminal-prefill-install | verified-shipped | `AgtRoute` `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:57` (`install(req: Request, res: Response, deps: AgtRouteDeps): void {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:490` (`app.post("/api/actions/agt-install", installLimiter`) | `FailSafe/extension/src/test/roadmap/routes/AgtRoute.test.ts` (route) | Pre-filled, not executed `FailSafe/extension/src/extension/bootstrapServers.ts:179-181` (`terminal.sendText(command, false);`); no server-side confirmation (F16) |

## Inbound fields

The workspace root file names `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:37` (`const detected = detectEnvironment(listRootEntries(deps.workspaceRoot));`).
A module id from the Console `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:58-59` (`const mod = AGT_MODULES.find((m) => m.id === id);`).

## Outbound fields and egress

Repository content: no; the root file names stay in the extension host `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:36-54` (`recommended: detectedSet.has(m.id),`).
Metadata: no; FailSafe makes no network call for this integration `FailSafe/extension/src/integrations/agt/agt-catalog.ts:18-19` (`Pure — no fs/vscode/network`).
Graph relationships: no (unverified beyond the owned files).
Governance evidence: no; a pre-fill writes no ledger entry `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:72-74` (`deps.runInTerminal(`).
Indirect egress: if the operator presses enter, npm, pip, dotnet, cargo or go download from their registries outside FailSafe `FailSafe/extension/src/integrations/agt/agt-catalog.ts:50` (`command: 'npm install @microsoft/agent-governance-sdk'`).

## Transformations

Exact marker names match by equality and markers beginning with a dot match by suffix `FailSafe/extension/src/integrations/agt/agt-catalog.ts:116-120` (`return mk.startsWith('.')`).
Detected modules are flagged `recommended` in the list `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:52` (`recommended: detectedSet.has(m.id),`).

## Persisted artifacts

None written by FailSafe; the terminal holds the pre-filled command `FailSafe/extension/src/extension/bootstrapServers.ts:180-182` (`const terminal = vscode.window.createTerminal(name);`).

## Graph links

Implemented: none (unverified beyond the owned files).
Proposed (not built): none specific to AGT in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified).

## Customer UI and actions

Console Integrations tab: an "Agent Governance" sub-view `FailSafe/extension/src/roadmap/ui/command-center.js:63` (`label: 'Agent Governance', renderer: new AgtRenderer('integrations')`).
Run opens a terminal with the command typed in; Claude Code modules are copy-only `FailSafe/extension/src/roadmap/ui/modules/agt-renderer.js:7` (`copy-only modules (Claude Code slash`).
A Public Preview notice is shown `FailSafe/extension/src/integrations/agt/agt-catalog.ts:100` (`is Public Preview — APIs may change before GA.`).

## Governance policy and enforceability limits

Enforced: the command is never executed by FailSafe; the operator presses enter `FailSafe/extension/src/extension/bootstrapServers.ts:176-178` (`pre-fills the command but does NOT execute it`).
Enforced: only catalog ids are accepted, so a request cannot inject a command `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:59-63` (`unknown AGT module id`).
Enforced: non-loopback callers are refused and the route is rate limited `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:490-491` (`if (this.host.rejectIfRemote(req, res)) return;`).
Not enforced: any loopback caller can open and pre-fill a terminal without a VS Code dialog (F16) `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:68-74` (`deps.runInTerminal(`).

## Failure, offline, stale and permission semantics

Unknown id: 404 `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:60-62` (`res.status(404).json({ ok: false, error: `).
Copy-only module: 400 with guidance `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:64-66` (`installs via slash commands inside the agent`).
No terminal runner: 503 `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:68-70` (`runInTerminal not wired`).
Unreadable workspace root: an empty detection list `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:30-31` (`return [];`).
Stale commands: the catalog is static, so an upstream rename is not noticed until the code changes `FailSafe/extension/src/integrations/agt/agt-catalog.ts:11-12` (`the repo README`).

## End-to-end scenario and measurable acceptance

Scenario: open Integrations › Agent Governance in a TypeScript workspace, see TypeScript recommended, click Run, and find a terminal named "AGT: TypeScript" with the npm command typed but not run `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:73` (`deps.runInTerminal(`).
Metric: Run never executes a command and only catalog commands are typed (threshold: zero executions; exact command text) `FailSafe/extension/src/test/roadmap/routes/AgtRoute.test.ts:39-48` (`install runs a runnable module command in the terminal via the injected dep`).
Existing tests: the catalog (unit), the route (route) and the renderer `FailSafe/extension/src/test/roadmap/agt-renderer.test.ts:1` (`Structural (jsdom) tests for AgtRenderer`) (jsdom).
Installed-extension test: none checks the real terminal pre-fill (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. It is a small, honest installer that never runs a command; keep the catalog current and consider the same modal confirmation the gated routes use before opening a terminal.

## Open defects

[B268] agt-install opens and pre-fills a terminal without a server-side confirmation (F16) `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:57-74` (`deps.runInTerminal(`).
The documentation index row is stale ("built (PR #140, held)") `docs/integrations/INTEGRATION_DOCS_INDEX.md:36` (`built (PR #140, held)`).
