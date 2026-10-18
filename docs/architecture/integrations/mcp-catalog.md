# MCP Catalog integration contract

Contract id: `mcp-catalog` (registry row `integration-contract-mcp-catalog`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_MCP_REGISTRY_CONTRACT_REVIEW.md`. It recommended read-only registry discovery plus local risk scoring and no install surface in v1; main ships the local scorer over a static, in-repo catalog and an install that writes `.mcp.json`, and never queries the registry.

**Owned files:**
- `FailSafe/extension/src/integrations/mcp-catalog/`
- `FailSafe/extension/src/integrations/mcp-registry/`
- `FailSafe/extension/src/extension/mcp-install-command.ts`
- `FailSafe/extension/src/roadmap/routes/McpRoute.ts`

## Customer job

A developer wants to add a well-known MCP server (Context7, Mermaid, Playwright) to the workspace's agent configuration, see a local risk rating before doing so, and not hand-edit `.mcp.json`.

## Measurable value

Metric: installs that leave every unrelated server in `.mcp.json` intact; on main an unparseable file is refused rather than replaced `FailSafe/extension/src/integrations/mcp-catalog/mcp-installer.ts:24-34` (`return { ok: false, reason: 'unparseable-existing' };`).
Baseline: no usage data is collected; the number of installs and of high-risk servers declined is unverified.

## Why not simply ask an agent

An agent can edit `.mcp.json`, but it does not rate the server it adds, it may overwrite a file it cannot parse, and its choice of package is not limited to a reviewed list with recorded install commands.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:29-32` (`**MCP Catalog — Context7**`) lists the MCP specification, the registry and the three upstream servers.
The Mermaid row links Mermaid Chart's own MCP server, but the catalog installs the community `mcp-mermaid` package `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:41-44` (`args: ['-y', 'mcp-mermaid']`).

## Privileges and scopes

Credential: none; Context7's optional API key is only mentioned in the install note and is not stored `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:34` (`Optional --api-key raises rate limits.`).
Write scope: the workspace `.mcp.json` file only `FailSafe/extension/src/roadmap/routes/McpRoute.ts:39` (`const cfgPath = path.join(deps.workspaceRoot, '.mcp.json');`).
The installed servers run later under whatever agent reads `.mcp.json`, with that agent's privileges (unverified: FailSafe does not start them).
A dynamic registry install path would need its own approval and is marked requires separate approval (unverified: not built).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| risk-assessed-catalog | verified-shipped | `assessCatalog` `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:67` (`export function assessCatalog(now?: Date)`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:474` (`app.get("/api/v1/mcp/catalog"`) | `FailSafe/extension/src/test/integrations/mcp-catalog/mcp-catalog.test.ts` (unit) | Three static entries `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:25` (`export const MCP_CATALOG: McpCatalogEntry[] = [`) |
| local-risk-score | verified-shipped | `scoreMcpServer` `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:37` (`export function scoreMcpServer(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:474` (`app.get("/api/v1/mcp/catalog"`) | `FailSafe/extension/src/test/integrations/mcp-registry/mcp-risk-score.test.ts` (unit) | Offline, metadata only `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:4-7` (`No network, no install.`) |
| console-install-route | verified-shipped | `McpRoute` `FailSafe/extension/src/roadmap/routes/McpRoute.ts:32` (`install(req: Request, res: Response, deps: McpRouteDeps): void {`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:479` (`app.post("/api/actions/mcp-install", installLimiter`) | `FailSafe/extension/src/test/roadmap/routes/McpRoute.test.ts` (route) | No server-side confirmation (F15) |
| governed-install-command | shipped-unverified | `registerMcpInstallCommand` `FailSafe/extension/src/extension/mcp-install-command.ts:16` (`export function registerMcpInstallCommand(`) | `FailSafe/extension/src/extension/main.ts:258` (`registerMcpInstallCommand(context, core.workspaceRoot);`) | none | Modal confirm before the write `FailSafe/extension/src/extension/mcp-install-command.ts:35-40` (`{ modal: true },`); no test file contains the command's symbol (unverified beyond a search of `src/test/`) |
| metadata-sanitizer | shipped-inert | `sanitizeField` `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:81` (`export function sanitizeField(value: string): string {`) | none | none | Absent call site: `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:74-75` (`NOT CURRENTLY A CONTROL IN EFFECT: no production caller exists.`) |
| registry-discovery | proposed | none | none | none | The legacy review's read-only registry query is not built; the scorer reads only the static catalog `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:12` (`Pure — no fs/network`) |

## Inbound fields

None from a network; the catalog entries and their metadata are compiled into the extension `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:25-35` (`publisher: 'Upstash'`).
From the workspace: the existing `.mcp.json` text `FailSafe/extension/src/roadmap/routes/McpRoute.ts:40-41` (`existing = fs.readFileSync(cfgPath, 'utf-8');`).
From the Console: the catalog id only `FailSafe/extension/src/roadmap/routes/McpRoute.ts:33-34` (`MCP_CATALOG.find((e) => e.id === id)`).

## Outbound fields and egress

Repository content: no; FailSafe sends nothing off the machine for this integration `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:4-7` (`No network, no install.`).
Metadata: no (unverified beyond the absence of any network call in the owned files).
Graph relationships: no `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:12` (`Pure — no fs/network`).
Governance evidence: no; the install writes no ledger entry `FailSafe/extension/src/roadmap/routes/McpRoute.ts:51-52` (`fs.writeFileSync(cfgPath, merged.text);`).
Indirect egress: the written entries run `npx -y <package>` when an agent starts them, which downloads from npm outside FailSafe `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:60` (`args: ['-y', '@playwright/mcp@latest']`).

## Transformations

A catalog entry becomes a `{ command, args }` server entry under `mcpServers.<id>` `FailSafe/extension/src/integrations/mcp-catalog/mcp-installer.ts:10-12` (`return { command: entry.install.command, args: [...entry.install.args] };`).
Re-installing updates the same key `FailSafe/extension/src/integrations/mcp-catalog/mcp-installer.ts:38-39` (`servers[entry.id] = buildMcpServerEntry(entry);`).
Risk: unknown publisher, missing repository and remote transport are medium, exec-capable tool names are high, stale or undated versions are low `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:42-63` (`id: 'broad-tool-names', severity: 'high'`).
Any high signal or a score of 6 makes the level high `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:67` (`score >= 6 ? 'high'`).

## Persisted artifacts

The workspace `.mcp.json`, pretty-printed `FailSafe/extension/src/integrations/mcp-catalog/mcp-installer.ts:40` (`JSON.stringify(config, null, 2)`).
Nothing else; the risk assessment is computed per request and not stored `FailSafe/extension/src/roadmap/routes/McpRoute.ts:20-29` (`entries: assessCatalog().map((a) => ({`).

## Graph links

Implemented: none; an installed server is not linked to an intent, a risk or a receipt (unverified beyond the owned files).
Proposed (not built): server-to-agent-run edges for scenario 3 in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Console Integrations tab: an MCP Catalog sub-view `FailSafe/extension/src/roadmap/ui/command-center.js:62` (`label: 'MCP Catalog', renderer: new McpCatalogRenderer('integrations')`).
The Install button needs a second click ("Confirm install") in the page before it POSTs `FailSafe/extension/src/roadmap/ui/modules/mcp-catalog-renderer.js:95-99` (`click again to confirm.`).
Command palette: "FailSafe: Install MCP Integration (governed)" with a modal VS Code confirmation `FailSafe/extension/package.json:151-152` (`"title": "FailSafe: Install MCP Integration (governed)"`).

## Governance policy and enforceability limits

Enforced (command path): the write happens only after the modal "Install" answer `FailSafe/extension/src/extension/mcp-install-command.ts:35-40` (`if (confirm !== 'Install') return;`).
Advisory (Console path): the second click lives in the browser page; the server route writes on any loopback POST with a known id `FailSafe/extension/src/roadmap/routes/McpRoute.ts:13-14` (`requires a confirm click before POSTing`).
Enforced: non-loopback callers are refused and the route is limited to 5 requests a minute `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:478-480` (`const installLimiter = rateLimit({ windowMs: 60_000, limit: 5`).
Advisory: the risk level is shown, never enforced; a high-risk server installs like a low-risk one `FailSafe/extension/src/roadmap/routes/McpRoute.ts:42-52` (`const merged = mergeMcpConfig(existing, entry);`).

## Failure, offline, stale and permission semantics

Unknown id: 404 and nothing written `FailSafe/extension/src/roadmap/routes/McpRoute.ts:35-37` (`unknown MCP catalog id`).
Unparseable `.mcp.json`: 409 and nothing written `FailSafe/extension/src/roadmap/routes/McpRoute.ts:44-49` (`existing .mcp.json is unparseable — nothing was written`).
Write failure: 500 with the error text `FailSafe/extension/src/roadmap/routes/McpRoute.ts:53-54` (`res.status(500).json({ error: e instanceof Error ? e.message : String(e) });`).
Offline: unaffected, no network is used `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:10` (`Pure (no fs/network)`).
Stale: the static entries carry no publish date, so every entry gets the low "unknown-recency" signal `FailSafe/extension/src/integrations/mcp-registry/mcp-risk-score.ts:62-63` (`no publish date to assess version recency`).

## End-to-end scenario and measurable acceptance

Scenario: open Integrations › MCP Catalog, read Playwright's high rating, click Install and Confirm install, and find `mcpServers.playwright` added to `.mcp.json` with existing servers kept `FailSafe/extension/src/test/roadmap/routes/McpRoute.test.ts:31` (`install writes the server entry to .mcp.json (added=true), idempotent on re-install`).
Metric: re-installing leaves one entry per id and an unparseable file is never overwritten (threshold: exact) `FailSafe/extension/src/test/integrations/mcp-catalog/mcp-catalog.test.ts:85` (`malformed existing text → ok:false (refuses, never replaces)`).
Existing tests: the route (route), the catalog and merge (unit) and the renderer `FailSafe/extension/src/test/roadmap/mcp-catalog-renderer.test.ts:1-3` (`Structural (jsdom) tests for McpCatalogRenderer`) (jsdom).
Installed-extension test: none exercises the command or the route in an installed VSIX (unverified).

## Recommended disposition

Recommendation for the owner: **MAINTAIN**. The catalog, scorer and merge are small, pure and tested. The one gap worth closing is the Console route writing `.mcp.json` without the server-side confirmation the command path already has; the live registry discovery from the legacy review is not worth building until there is demand.

## Open defects

[B267] mcp-install route writes `.mcp.json` without a server-side confirmation (F15) `FailSafe/extension/src/roadmap/routes/McpRoute.ts:32-52` (`fs.writeFileSync(cfgPath, merged.text);`).
The documentation index's Mermaid row names a different package from the one installed `docs/integrations/INTEGRATION_DOCS_INDEX.md:31` (`mermaid-chart-mcp`).
