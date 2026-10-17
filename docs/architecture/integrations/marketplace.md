# Agent Marketplace integration contract

Contract id: `marketplace` (registry row `integration-contract-marketplace`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

No legacy review in `docs/research/integrations/` covers the Agent Marketplace.

**Owned files:**
- `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts`
- `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts`
- `FailSafe/extension/src/roadmap/services/MarketplaceTypes.ts`
- `FailSafe/extension/src/roadmap/routes/MarketplaceRoute.ts`
- `FailSafe/extension/src/roadmap/routes/marketplaceReadRoutes.ts`
- `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts`
- `FailSafe/extension/src/roadmap/routes/marketplaceScanRoutes.ts`
- `FailSafe/extension/src/roadmap/routes/marketplaceRouteShared.ts`

Not owned here: the Console renderer `FailSafe/extension/src/roadmap/ui/modules/marketplace.js` (covered by the same-origin browser row of the portfolio) and `FailSafe/extension/src/roadmap/services/SecurityScanner.ts` (the garak and promptfoo scanner, not a scan hit).

## Customer job

A developer wants to try a curated external agent repository (skills packs, agent frameworks, red-team tools) and wants FailSafe to fetch it for review, scan it, and record what was installed, instead of cloning and running unknown code by hand.

## Measurable value

Metric: none can be measured on main, because install, update and scan are switched off `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:37` (`export const MARKETPLACE_INSTALLS_ENABLED = false;`).
Baseline: catalog views are not counted; usage is unverified.

## Why not simply ask an agent

An agent can clone a repository, but it cannot hold a curated, reviewed list, refuse to run the item's setup, quarantine an item whose scan did not pass, and append each install to the governance ledger. Those are the parts this integration would add once its release gate opens.

## API documentation

none: the catalog is a static list in the source and the only external surface is `git clone` of each item's repository `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts:18` (`const MARKETPLACE_CATALOG: MarketplaceItem[] = [`).
`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no Agent Marketplace row (unverified as to whether one is required; the index lists API integrations).

## Privileges and scopes

No credential is read or sent; clones are anonymous over the item's repository URL `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:208-217` (`"--single-branch",`).
The installer's runner starts only git, through the trusted git resolver, with no shell `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:50-52` (`Only git: an item's setup (pip, npm) is never run on the host`).
Any other executable is refused with code 126 `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:58-63` (`Unsupported marketplace executable: ${command}`).
Every mutating route refuses a request that is not local `FailSafe/extension/src/roadmap/ConsoleServer.ts:286-289` (`Forbidden: local access only`).
Running an item's setup in an isolation provider would need new filesystem, network and process limits and is marked requires separate approval `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:24-26` (`an isolation provider that enforces filesystem, network, process and`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| catalog-browse | verified-shipped | `setupMarketplaceRoutes` `FailSafe/extension/src/roadmap/routes/MarketplaceRoute.ts:19` (`export function setupMarketplaceRoutes(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:348` (`setupMarketplaceRoutes(app, {`) | `FailSafe/extension/src/test/extension/marketplace-route.test.ts` (route) | Catalog, item, scanners, featured and installed reads `FailSafe/extension/src/roadmap/routes/marketplaceReadRoutes.ts:11` (`app.get("/api/marketplace/catalog"`) |
| clone-for-review-install | shipped-inert | `MarketplaceInstaller` `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:104-108` (`if (!MARKETPLACE_INSTALLS_ENABLED) {`) | `FailSafe/extension/src/roadmap/ConsoleServer.ts:156` (`this.marketplaceInstaller = new MarketplaceInstaller(eventBus);`) | none | Switch: `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:37` (`export const MARKETPLACE_INSTALLS_ENABLED = false;`); the install routes answer 503 `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:22` (`Marketplace installation temporarily disabled`) |
| update-pull | shipped-inert | `MarketplaceInstaller` `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:250` (`Marketplace updates disabled pending security remediation`) | none | none | Switch: `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:37` (`export const MARKETPLACE_INSTALLS_ENABLED = false;`); no route calls `update` (unverified beyond a search of the owned routes) |
| security-scan-quarantine | shipped-inert | `handleInstallCompletion` `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:195` (`export async function handleInstallCompletion(`) | none | none | Switch: `FailSafe/extension/src/roadmap/routes/marketplaceScanRoutes.ts:18` (`Marketplace scanning temporarily disabled pending security remediation`); reached only after the install gate |
| uninstall-local-copy | verified-shipped | `uninstall` `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:232` (`async uninstall(item: MarketplaceItem): Promise<boolean> {`) | `FailSafe/extension/src/roadmap/routes/marketplaceScanRoutes.ts:46-47` (`"/api/marketplace/uninstall/:id",`) | `FailSafe/extension/src/test/roadmap/MarketplaceInstaller.test.ts` (unit) | Not gated by the switch; it removes `~/.failsafe/marketplace/<id>` when present |

## Inbound fields

The catalog entries are compiled into the extension: id, name, description, category, author, repository URL and ref, permissions, tags and licence `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts:22-30` (`repoUrl: "https://github.com/mattpocock/skills",`).
Install state is read back from `~/.failsafe/marketplace/state.json` and merged into the catalog `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts:320-330` (`Merge persisted state into catalog items`).
Scanner availability comes from running `garak --version` and `promptfoo --version` `FailSafe/extension/src/roadmap/services/SecurityScanner.ts:135` (`this.runIsolated("garak", ["--version"], 10000)`).

## Outbound fields and egress

Repository content: no; nothing from the workspace is sent `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:208-218` (`item.repoRef`).
Metadata: when the gate is open, a `git clone --depth 1` of the item's URL and ref, or a `git pull --rebase`; on main neither runs because of the switch `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:104-109` (`return this.stage(item, options, onProgress);`).
Graph relationships: no (unverified: no graph code exists).
Governance evidence: no; ledger entries stay local `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:242-244` (`eventType: "MARKETPLACE_INSTALL",`).
Network egress on main: none from this integration, since every network path sits behind the switch `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:71` (`if (!MARKETPLACE_INSTALLS_ENABLED) { res.status(503)`).

## Transformations

A confirm request with `sandboxEnabled` true is refused before any folder is touched, because no enforced sandbox exists `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:122-126` (`Isolated setup is not available.`).
A scan that could not run becomes an inconclusive L3 verdict with recommended action review `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:152-159` (`Security scan did not complete: ${cause}`).
An install whose scan did not pass is marked quarantined, never installed `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:181-186` (`status: scanResult.passed ? "installed" : "quarantined",`).

## Persisted artifacts

Install state in `~/.failsafe/marketplace/state.json`, written atomically through a temporary file `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts:400-401` (`fs.renameSync(tmpPath, this.statePath);`).
A corrupt state file is preserved aside before it would be overwritten `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts:398` (`preserveCorruptFile(this.statePath`).
Cloned items under `~/.failsafe/marketplace/<id>` (only once the gate opens) `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:95` (`path.join(os.homedir(), ".failsafe", "marketplace")`).
`MARKETPLACE_INSTALL` and `MARKETPLACE_UNINSTALL` ledger entries `FailSafe/extension/src/roadmap/routes/marketplaceScanRoutes.ts:70-75` (`eventType: "MARKETPLACE_UNINSTALL",`).
Approval nonces live only in memory for five minutes `FailSafe/extension/src/roadmap/routes/marketplaceRouteShared.ts:22-24` (`export const pendingApprovals = new Map<string, HITLRequest>();`).

## Graph links

Implemented: none (unverified: no edge from a marketplace item to an intent, risk or receipt exists in the owned files).
Proposed: item to scan result to ledger entry, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: not built).

## Customer UI and actions

Console Skills view hosts the marketplace renderer `FailSafe/extension/src/roadmap/ui/modules/skills.js:82` (`new MarketplaceRenderer('cc-marketplace-container', { client: this.client })`).
Install, Uninstall and a confirm modal are rendered `FailSafe/extension/src/roadmap/ui/modules/marketplace.js:234` (`cc-marketplace-modal-confirm`).
The README tells users that install, update and scan are disabled `README.md:57` (`install, update and scan are disabled until isolated setup and fail-closed scanning land`).

## Governance policy and enforceability limits

Enforced: the release switch blocks install, confirm, update and scan in code `FailSafe/extension/src/test/roadmap/marketplace-release-gate.test.ts:5-6` (`assert.equal(MARKETPLACE_INSTALLS_ENABLED, false);`).
Enforced: an item's setup is never run; the runner supports only git `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:5-6` (`It never runs an item's package setup`).
Observed: the "human in the loop" step is an HTTP nonce returned to the Console, not a VS Code modal, so any local caller holding the nonce can confirm `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:36-48` (`pendingApprovals.set(nonce, hitlRequest);`).
Advisory: the six conditions for opening the gate are a comment, not a check `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:22-23` (`It stays false until every condition below holds`).
Advisory: uninstall is not behind the switch and asks for no confirmation server-side `FailSafe/extension/src/roadmap/routes/marketplaceScanRoutes.ts:47-52` (`if (deps.rejectIfRemote(req, res)) return;`).

## Failure, offline, stale and permission semantics

Gate closed: install and confirm answer 503 and nothing is cloned `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:22` (`res.status(503).json`).
Remote origin: 403 local access only `FailSafe/extension/src/roadmap/ConsoleServer.ts:287-288` (`res.status(403).json({ error: "Forbidden: local access only" });`).
Expired or mismatched nonce: 403 `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:77-92` (`Invalid or expired approval nonce`).
A rejected install is a failed terminal state, never left installing `FailSafe/extension/src/roadmap/routes/marketplaceInstallRoutes.ts:145-147` (`status: "failed"`).
Stale transient states from an earlier session are reconciled on load `FailSafe/extension/src/roadmap/services/MarketplaceCatalog.ts:337-339` (`this.reconcileStaleTransientState()`).
Offline: a failed clone reports phase failed with git's error (unverified on main, the clone path is gated).

## End-to-end scenario and measurable acceptance

Scenario on main: open the Console marketplace, browse the curated items, and see that install is refused with the disabled message `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:105` (`Marketplace installation disabled pending isolation and scanner remediation`).
Metric: zero clones and zero setup processes while the switch is false (threshold: exactly zero) `FailSafe/extension/src/test/roadmap/marketplace-release-gate.test.ts:9` (`installer fails closed before any clone or setup runner invocation`).
Existing test: `FailSafe/extension/src/test/extension/marketplace-route.test.ts:91` (`FX091 GET /api/marketplace/catalog`) (route); the scan route stays 503 `FailSafe/extension/src/test/extension/marketplace-route.test.ts:205` (`FX094 POST /api/marketplace/scan/:id`) (route).
Installed-extension test: no test installs the packaged VSIX and drives the marketplace (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The read side works, and the install path is deliberately shut behind a release gate whose six conditions are written down. Either finish those conditions (isolation, staged install, a scanner that reads the item, the planted-executable rows, an end-to-end test, URL validation) or decide to retire the install path; leaving it inert indefinitely keeps code that cannot be exercised.

## Open defects

The release-gate work is tracked as #468 and #469 `FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts:22` (`Release gate (#468/#469).`).
Uninstall needs no server-side confirmation (observed, not filed; unverified as a defect against a stated requirement).
