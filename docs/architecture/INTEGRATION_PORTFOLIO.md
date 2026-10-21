# Integration portfolio

Status: canonical for the integration portfolio (registry row `integration-portfolio`, #532 part A). Recorded against main `c36b9ee2` and tag `v6.0.8`.

This page lists every integration FailSafe has on main, what each does for the customer, what it sends off the machine and how far each capability is proven. Each row links its contract in `docs/architecture/integrations/`, which holds the cited detail. **The dispositions are the owner's decision of 2026-10-18 ([#538](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/538)); see [Owner decision (#538)](#owner-decision-538).** Nothing here is pricing, tier or roadmap information, and no credential format appears in it.

`FailSafe/extension/src/test/docs/integration-contracts.test.cjs` (FX1003) holds this page and the contracts to the code: coverage from the code, the citation grammar, the feature states, the tables below and the counts in [Scan counts](#scan-counts).

## Owner decision (#538)

On 2026-10-18 the owner accepted the dispositions in the matrix below as owner-approved work-queue dispositions ([#538](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/538), "Ownership decisions for #532"): 15 COMPLETE, 13 MAINTAIN, 2 RETIRE and 0 INVEST. They began as the #532 part A recommendations. A disposition says what to do next; it is not a claim that a requirement is implemented.

- COMPLETE means finish the named gaps: the contract's Recommended disposition and Open defects name them. It does not mean the integration is complete.
- MAINTAIN means keep it working and fix its recorded defects.
- RETIRE means retire the inert or exposed claims and routes, only after a reference and compatibility review, in a separate small PR, without deleting historic contracts or evidence. The two reviews are [governance-webhook](integrations/governance-webhook.md#retirement-review-538) (removal B288) and [qor-runtime](integrations/qor-runtime.md#retirement-review-538) (removal B289). B288 retired governance-webhook and B289 retired qor-runtime on 2026-10-19; both contracts stay as history.
- INVEST: no integration has it.

The decision covers the dispositions. The priorities and the [Prioritized order](#prioritized-order) remain a recommendation.

## Why new contract documents

The architecture index's decision path says to amend an existing canonical document by default (`docs/ARCHITECTURE_INDEX.md`, "Architectural documentation decision path", step 3). There is none to amend here: the 13 reviews in `docs/research/integrations/` sit under a legacy prefix, so they are historical evidence that is never edited or promoted, and they cover only 13 of the integrations, written before the code. `docs/INTEGRATIONS.md` is a descriptive user page and `docs/integrations/INTEGRATION_DOCS_INDEX.md` tracks external API sources. A contract per integration has its own lifecycle (it changes when that integration's code changes) and its own audience (the owner deciding where to invest), so each is a new canonical document, and each contract cites its legacy review as input in its body text (see [Legacy review map](#legacy-review-map)).

## Feature states and test depth

- `verified-shipped`: in tag v6.0.8 and exercised by a test that a CI runner collects; the contract names the test, the symbol it contains, a depth label and where the capability is reached from.
- `shipped-unverified`: in tag v6.0.8 with no test that exercises it.
- `shipped-inert`: in tag v6.0.8 but switched off or unreachable; the switch or the missing call site is cited. It wins over any other shipped state.
- `main-unreleased`: on main `c36b9ee2` and not in tag v6.0.8.
- `proposed`: not implemented.
- `retired`: the code was removed under a RETIRE disposition (B288 for governance-webhook, B289 for qor-runtime). The five states above describe a live contract; a retired contract keeps its file as history, is registered `historical` in the architecture index, names its retirement base, and FX1003 checks its citations at that commit (in a full clone; shallow CI clones skip with a count). The Feature Index calls the same features `removed`.

Test depth labels: `unit` (a node or vscode-test file calling the code directly), `route` (an HTTP route driven in-process), `jsdom` (browser code in jsdom), `playwright-stubbed` (a Playwright `ui/*.spec.ts` file against a stubbed Console), `installed-vscode` (a vscode-test file that drives the code inside a VS Code extension host, launched from the development folder, not an installed VSIX; whether the release-verification lane exercises any integration in an installed VSIX is unverified), `live-service` (against the real provider; none on main).

## Portfolio matrix

Test depth lists the depth labels of the contract's proving tests; `none` means no capability is `verified-shipped`. Network egress is `yes` when a reachable capability, or a process FailSafe starts for it, sends data off the machine.

| Integration | Customer job | Feature state | Network egress | Test depth | Disposition (owner, #538) | Priority |
|---|---|---|---|---|---|---|
| [sentinel-llm](integrations/sentinel-llm.md) | Ask a local model for a second opinion on flagged files and structure Brainstorm transcripts | shipped-unverified, shipped-inert, main-unreleased | yes | unit | COMPLETE | 1 |
| [governed-commit-pr](integrations/governed-commit-pr.md) | Turn FailSafe's own workspace edits into one confirmed commit, push and PR, or a recorded decline | verified-shipped | yes | unit | COMPLETE | 1 |
| [github-checks](integrations/github-checks.md) | Show FailSafe's view (advisory, PR linkage, later SHIELD) on the pull request | verified-shipped, shipped-inert, main-unreleased, proposed | yes | unit | COMPLETE | 1 |
| [bicameral](integrations/bicameral.md) | See design-decision drift, attach it to L3 approvals, ratify with a ledger record | verified-shipped, shipped-inert, main-unreleased | yes | unit, route | COMPLETE | 1 |
| [agt-adapter](integrations/agt-adapter.md) | Install the agent-failsafe bridge and view the AGT SRE snapshot in the sidebar | verified-shipped, shipped-unverified, main-unreleased | yes | unit, route | COMPLETE | 1 |
| [failsafe-mcp-server](integrations/failsafe-mcp-server.md) | Let an agent call FailSafe governance tools (status, audit, decision, risk) from its session | shipped-inert, proposed | no | none | COMPLETE | 1 |
| [sentry](integrations/sentry.md) | Production errors from one Sentry project as triaged risks | verified-shipped, proposed | yes | unit | COMPLETE | 1 |
| [jira](integrations/jira.md) | Start governed work from one Jira issue with provenance, no write access | verified-shipped, proposed | yes | unit, installed-vscode | MAINTAIN | 2 |
| [slack](integrations/slack.md) | Post FailSafe blocks and L3 approvals to a Slack channel | verified-shipped, shipped-inert, proposed | yes | unit | COMPLETE | 2 |
| [teams](integrations/teams.md) | Post FailSafe blocks and L3 approvals to a Teams channel | verified-shipped, shipped-inert, proposed | yes | unit | COMPLETE | 2 |
| [open-design](integrations/open-design.md) | Tag Open Design agent edits and reach its MCP tools through a consented launch | verified-shipped, shipped-unverified, shipped-inert, proposed | no | unit | COMPLETE | 2 |
| [mcp-catalog](integrations/mcp-catalog.md) | Add a vetted MCP server to .mcp.json with a local risk rating | verified-shipped, shipped-unverified, shipped-inert, proposed, main-unreleased | no | unit, route | MAINTAIN | 2 |
| [marketplace](integrations/marketplace.md) | Fetch, scan and record curated external agent repositories for review | verified-shipped, shipped-inert | no | route, unit | COMPLETE | 2 |
| [agent-config-injection](integrations/agent-config-injection.md) | Write one removable FailSafe governance block into each agent's instruction file | verified-shipped, shipped-inert | no | unit | COMPLETE | 2 |
| [shield-receipts](integrations/shield-receipts.md) | Bind a SHIELD PASS check to the verified Seal commit of a Qor session | shipped-inert, proposed | no | unit | COMPLETE | 2 |
| [agent-audit](integrations/agent-audit.md) | Flag risky MCP auto-approve, remote and shell posture in agent configs | verified-shipped, proposed | no | unit | COMPLETE | 2 |
| [qor-logic-consumer](integrations/qor-logic-consumer.md) | Install qor-logic and read its artifacts with explicit states | verified-shipped | yes | unit | MAINTAIN | 2 |
| [dependency-admission-lint](integrations/dependency-admission-lint.md) | Warn on freshly published npm dependency versions | verified-shipped, proposed | yes | unit | COMPLETE | 2 |
| [voice-pack](integrations/voice-pack.md) | Install a verified local speech pack on request, outside the base VSIX | verified-shipped, shipped-unverified | yes | unit | MAINTAIN | 2 |
| [continue](integrations/continue.md) | Run Continue headless and review its change before it lands | verified-shipped, proposed | yes | unit | MAINTAIN | 2 |
| [aider](integrations/aider.md) | Run Aider one-shot with auto-commit off and review its change before it lands | verified-shipped, proposed | yes | unit | MAINTAIN | 2 |
| [linear](integrations/linear.md) | Start governed work from one Linear issue with provenance, no write access | verified-shipped, shipped-inert, proposed | yes | unit, installed-vscode | MAINTAIN | 3 |
| [sarif](integrations/sarif.md) | Offline import of SARIF scanner findings as idempotent risks | verified-shipped, proposed | no | unit | MAINTAIN | 3 |
| [openhands](integrations/openhands.md) | Import a past OpenHands run as signed timeline evidence | verified-shipped, proposed | no | installed-vscode, unit | MAINTAIN | 3 |
| [acp-devin](integrations/acp-devin.md) | Govern Devin Desktop ACP agents' permissions, writes and terminals under the workspace mode | verified-shipped, proposed | no | unit | MAINTAIN | 3 |
| [agt](integrations/agt.md) | Get the matching AGT module install command, pre-filled, never run | verified-shipped, main-unreleased | no | unit, route | MAINTAIN | 3 |
| [tracker-manifest](integrations/tracker-manifest.md) | Draft docs/roadmap/programs.yaml from merged PRs and CHANGELOG with an operator-confirmed taxonomy | shipped-unverified, verified-shipped | yes | unit | MAINTAIN | 3 |
| [git-bootstrap](integrations/git-bootstrap.md) | Make Git available and initialize a repository only on consent | verified-shipped, shipped-unverified, proposed | yes | unit | MAINTAIN | 3 |
| [governance-webhook](integrations/governance-webhook.md) | Deliver signed governance events to the customer's own HTTPS endpoint | retired | no | none | RETIRE | 3 |
| [qor-runtime](integrations/qor-runtime.md) | Show an external Qor runtime's health in the Console | retired | no | none | RETIRE | 3 |

Totals: 30 contracts; owner dispositions 15 COMPLETE, 13 MAINTAIN, 2 RETIRE, 0 INVEST; priorities 7 at 1, 14 at 2, 9 at 3.

## Prioritized order

Priority 1 is where a customer is exposed today (data leaves the machine without a clear consent, a token can reach the wrong host, or the product says something works that cannot), or where a scenario depends on the integration. Within a priority the order is the recommended order of work. The priorities and this order remain a recommendation; the owner decision (#538) covers the dispositions.

1. **sentinel-llm**: in v6.0.8, file content and Brainstorm transcripts can go to an endpoint a workspace file sets, over plain http to a public host, with no consent step (see the contract and Other findings). Fixed on main, unreleased (#538, B273): workspace endpoints are loopback only and a user-chosen remote needs an approval per destination and use.
2. **governed-commit-pr**: pushes repository content and opens pull requests; the PR step is gated only by a stored token, not by the GitHub enable setting (F18, B270), and its prompt is not modal.
3. **github-checks**: in v6.0.8 the PR-linkage audit sends the token to github.com when an Enterprise base URL is set (F11, B265; fixed on main, unreleased, #538), a dev container can set the base a user token is paired with (B290), and the verified SHIELD publisher is unwired.
4. **bicameral**: drift-to-L3 and the upstream snapshot route are inert because of wiring order (F05, F06, B259, B260), the install route ran pip with no server-side confirmation in v6.0.8 (F17, B269; fixed on main by #538), and the GitHub poll has no switch.
5. **agt-adapter**: the adapter base URL is not validated (F19, B271), install runs pip with no server-side confirmation, and every status view calls PyPI.
6. **failsafe-mcp-server**: no MCP client can reach it (F14, B209), yet an activation notice says it is listening.
7. **sentry**: the source for scenario 2; the missing correlation from an error to commits and files is its value gap.
8. **jira**: the issue source for the part B slice; built and tested, so the work is reach, not repair.
9. **slack** and **teams**: the core notices work, but the release-seal and drift kinds cannot fire and the L3-decided card lost its path until #538 (F08 to F10, B262 to B264; F09 fixed).
10. **open-design**: the UI offers create_artifact and the SSE setting is shipped, but both are switched off in code (F12, B266).
11. **mcp-catalog**: in v6.0.8 the Console route wrote `.mcp.json` without a server-side confirmation (F15, B267); fixed on main by #538.
12. **marketplace**: installs are inert behind a written release gate; finish the gate or retire the install path.
13. **agent-config-injection**: the injected text overstates enforcement (B256); the remove and bulk paths have no caller.
14. **shield-receipts**: a credibility asset whose every path is unreachable (B216; the damaged ledger, #467, blocks it).
15. **agent-audit**: reads five workspace-relative files only, so a clean result says little.
16. **qor-logic-consumer**: hardened and tested; its Console install path has no server-side confirmation.
17. **dependency-admission-lint**: dependency names go to a third party on every seal, with no switch.
18. **voice-pack**: works with stubbed downloads; the old organization slug was fixed in #538 (F07, B261), and no voice-pack release is published yet (B287).
19. **continue** and **aider**: built and unit-tested; no test runs the real CLIs, and Aider has no tool allowlist.
20. **linear**, **sarif**, **openhands**, **acp-devin**, **agt**, **tracker-manifest**, **git-bootstrap**: built and tested with small gaps; maintain.
21. **governance-webhook** and **qor-runtime**: governance-webhook was retired by B288 on 2026-10-19 (its sender, tests and bootstrap field are removed; the contract is kept as history); before that it had no caller on main, and qor-runtime was retired by B289 on 2026-10-19 (its client, three routes, hub entry and API ticker are removed and its settings deprecated, with the four other than apiKey removed later by B326; before that it could not be enabled on main); the owner decided RETIRE (#538). Their retirement reviews ([governance-webhook](integrations/governance-webhook.md#retirement-review-538), [qor-runtime](integrations/qor-runtime.md#retirement-review-538)) bound the removals, B288 (done) and B289 (done), each a separate PR.

## Scans

The expected set of integrations is built from the code, not from a list. It is the union of: every catalog `id` parsed from quoted string literals inside the `INTEGRATION_CATALOG` array `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:98` (`export const INTEGRATION_CATALOG: readonly IntegrationDescriptor[] = [`); every directory and root `.ts` file under `FailSafe/extension/src/integrations/`; every non-test source file under `FailSafe/extension/src/` (`.ts`, `.js`, `.cjs`, `.mjs`, `.html`, excluding `roadmap/ui/vendor/**` and `.d.ts`) that is a hit of either scan below; and the integrations plan-532a LD1 names outside the catalog. Every entry maps to a contract that owns it or to a row of [Inventory reconciliation](#inventory-reconciliation).

**The scans are the claim.** The check certifies that every scan hit is owned or reconciled. It does not certify that the inventory is complete.

- **Scan 1, in-process network calls (per call site):** `fetch(` not preceded by a word character, `.` or `$` (so `this.fetch(` and `x.fetch(` are not calls of the global), `http.request(`, `https.request(`, `http.get(`, `https.get(`, `net.connect(`, `tls.connect(`, `new WebSocket(`, `new EventSource(`, `fetchImpl(`, `globalThis.fetch`. A `fetch(` preceded by `async` or `function`, or whose argument list is followed by `{`, is a method definition and is skipped.
- **Scan 2, process egress (per file):** a file is a hit when it contains a child-process or runner call (`spawn(`, `spawnSync(`, `execFile(`, `execFileSync(`, `execSync(`, `runner(`, also when qualified, as in `cp.spawn(` or `this.runner(`; `exec(` only bare or as `cp.exec(` / `child_process.exec(`; a bare `git(` helper) and also a network word as a whole quoted string in single quotes, double quotes or backticks (`install`, `clone`, `push`, `pull`, `fetch`, `download`, `upgrade`, `pip`, `pip3`). A substring such as `installer` or `uninstall` is not a word.

Rule changes made while developing the check against main, all in the test and none in product code:

1. Comments are blanked before both scans (line numbers kept), so `fetch()` in a doc comment is not a call site. A backslash escapes the next character everywhere, so a regex literal such as `/https?:\/\//` is not read as a comment.
2. `exec(` counts only bare or module-qualified, so `RegExp.prototype.exec` is not a process call; qualified `spawn`, `execFile` and `runner` calls count.
3. Browser accept rule (a) accepts any literal that is relative by the plan's definition (no URL scheme and not starting with `//`), including `../` paths, and a template literal whose fixed leading text starts with `/` (not `//`), `./` or `../`.
4. Rule (c) is file-level, as the plan states it: an identifier passes when every value assigned to it anywhere in the same file passes (a) or (b), with each branch of a `?:` checked. An identifier with no assignment is treated as a parameter and checked at its call sites in the same file.
5. Rule (b) also requires that a module leading a target with `this.baseUrl` or `this.wsUrl` is one of the three whose definitions are asserted (`connection.js`, `webui/protocol.ts`, `webui/lib/failsafe-client.ts`), that `this.client.baseUrl` users take the client from `deps.client`, and that every `{ client: ... }` dependency in a browser module passes the Console client. Every `this.client.postAction(` and `this.client.postGated(` call passes a literal `/api/` path, or `btn.dataset.action` whose `data-action` values are all `/api/` paths.
6. Rule (d) accepts a per-file row of either form: `not an integration: loopback ...` or `folded into <id>`.

## Blind spots

These are not caught by the scans, and the check says nothing about them:

- Dynamic code: a call built from strings, `eval`, `import()` of a computed path, or a method looked up by name.
- Network calls behind wrappers whose names match neither scan. The concrete example on main: `FailSafe/extension/src/integrations/open-design/OpenDesignLaunchSpec.ts` calls `(opts.fetchImpl ?? fetch)(url`, which matches neither scan; it is owned only because every file under `src/integrations/` belongs to an entry (see the open-design contract).
- Egress performed by a third-party tool that FailSafe starts without a network word in the argument list (for example an MCP server or agent CLI that FailSafe launches and that then reaches the network itself).
- URLs opened in the user's browser with `vscode.env.openExternal`; the browser, not FailSafe, makes that request `FailSafe/extension/src/extension/commands.ts:94` (`await vscode.env.openExternal(vscode.Uri.parse(target))`).
- Rule (b) checks only a template's leading expression. A trailing segment such as `${endpoint}` that started with `//` would not be caught by (b) itself; on main the Console client's `postAction` and `postGated` callers pass literal `/api/` paths, which the check asserts (rule change 5).
- The allowlisted Console bases in `connection.js` may point at a loopback Console on another port: `switchServer(port)` sets both bases to `localhost:<port>` `FailSafe/extension/src/roadmap/ui/modules/connection.js:393-394` (`this.baseUrl = `), driven from the workspace picker `FailSafe/extension/src/roadmap/ui/modules/workspace-registry.js:43` (`workspaceRegistryClient.switchServer(port);`). That is another local FailSafe Console, not a third party.
- `createHostBridge`, `ApiHostBridge` and `FailSafeClient` in `src/webui/` have no callers on main outside their own folder (`FailSafe/extension/src/webui/index.ts:8-9` (`export { FailSafeClient } from './lib/failsafe-client';`) only re-exports them); the check asserts that count is zero, so the first new caller fails until it is reviewed.
- Server-rendered HTML that embeds browser code (for example the SRE panel template) is a scan hit owned by its contract, but its embedded targets are not classified by the browser rules, which cover only `roadmap/ui/` and `webui/`.

## Scan counts

Computed by the check on every run; it fails when a number here differs from the computed one.

| Measure | Count |
|---|---|
| `scan-1-files` | 53 |
| `scan-1-call-sites` | 102 |
| `scan-2-files` | 7 |
| `browser-files` | 38 |
| `browser-targets` | 85 |
| `loopback-targets` | 2 |
| `catalog-ids` | 11 |
| `integration-entries` | 22 |
| `contracts` | 30 |

## Inventory reconciliation

Every entry of the expected set that no contract owns has a row here (`folded into <id>`, `shared by <id>, <id>` or `not an integration: <reason>`). Rows for entries a contract also owns record a difference from plan-532a LD1. The `LD1 difference` column says how the row differs from LD1's list, or `none`.

| Entry | Reconciliation | LD1 difference | Evidence |
|---|---|---|---|
| `FailSafe/extension/src/integrations/agent-cli/` | shared by continue, aider | none | `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:2-3` (`shared substrate for FailSafe's CLI agent-wrapper integrations`) |
| `FailSafe/extension/src/integrations/agent-observe/` | shared by openhands, agent-audit | none | `FailSafe/extension/src/integrations/agent-observe/agent-observe-health.ts:2-3` (`maps the MCP-policy audit and the OpenHands import`) |
| `FailSafe/extension/src/integrations/catalog/` | not an integration: the secret-safe registry and health-evidence store the Integrations catalog cards render from | none | `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:1-7` (`pure, secret-safe registry of the command/config-style`) |
| `FailSafe/extension/src/integrations/credentials/` | shared by jira, linear, sentry, github-checks, continue, slack, teams, governed-commit-pr | none | `FailSafe/extension/src/integrations/credentials/credentialRegistry.ts:13-14` (`export type CredentialId =`) |
| `FailSafe/extension/src/integrations/mcp/` | shared by bicameral, open-design | none | `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts:10` (`import { McpClientHost } from '../mcp/McpClientHost';`) `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:22` (`import { McpClientHost } from '../mcp/McpClientHost';`) |
| `FailSafe/extension/src/integrations/mcp-registry/` | folded into mcp-catalog | LD1 lists it as a shared module; it has one production importer, so mcp-catalog owns it | `FailSafe/extension/src/integrations/mcp-catalog/mcp-catalog.ts:15` (`from '../mcp-registry/mcp-risk-score';`) |
| `FailSafe/extension/src/integrations/notify-event.ts` | shared by slack, teams | none | `FailSafe/extension/src/integrations/notify-event.ts:1-3` (`shared plumbing for the outbound notify-only channels`) |
| `FailSafe/extension/src/integrations/shared/` | shared by jira, linear | none | `FailSafe/extension/src/integrations/jira/jira-client.ts:16` (`from '../shared/https-transport';`) `FailSafe/extension/src/integrations/linear/linear-client.ts:19` (`from '../shared/https-transport';`) |
| `FailSafe/extension/src/integrations/tracker-import/` | shared by jira, linear | none | `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:1-3` (`the governed path from a fetched Jira or Linear issue`) |
| `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts` | folded into github-checks | LD1 lists `github-checks/pr-linkage-*` as shared; only the GitHub advisory command imports it, so github-checks owns the folder | `FailSafe/extension/src/extension/github-checks-command.ts:13` (`import { publishLinkageCheck } from '../integrations/github-checks/pr-linkage-publish';`) |
| `FailSafe/extension/src/extension/commands.ts` | not an integration: loopback probe of FailSafe's own Console server before opening it | none | `FailSafe/extension/src/extension/commands.ts:26-32` (`/api/roadmap`) `FailSafe/extension/src/extension/commands.ts:27` (`http://localhost:${serverPort}`) |
| `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js` | not an integration: loopback socket to FailSafe's own Console for install progress | none | `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js:133` (`new WebSocket('ws://localhost:9376')`) `FailSafe/extension/src/roadmap/ConsoleServer.ts:45` (`const PORT = 9376;`) |
| `FailSafe/extension/src/roadmap/ui/modules/connection.js` | folded into sentinel-llm | One row for the file. Its only third-party target, the Ollama probe, is folded into sentinel-llm; all its other targets (Console REST, the event stream and the socket) are same-origin and covered by the `roadmap/ui/` prefix row and the base allowlist (rules b and e). `switchServer` may point those bases at a loopback Console on another port | `FailSafe/extension/src/roadmap/ui/modules/connection.js:345` (`fetch('http://localhost:11434/api/tags'`) |
| `FailSafe/extension/src/roadmap/ui/` | not an integration: same-origin Console API | none; every target in these modules passes rules (a) to (e), checked per call site | `FailSafe/extension/src/roadmap/ui/modules/connection.js:7` (`Empty string resolves to same-origin`) |
| `FailSafe/extension/src/webui/` | not an integration: same-origin Console API | none; the bases default to the page origin, and the bridges have no callers outside the folder | `FailSafe/extension/src/webui/protocol.ts:133-135` (`window.location.origin`) |
| `FailSafe/extension/src/shared/exec/trustedExecutable.ts` | not an integration: executable-path resolver; its only process call is a version probe of a candidate path, and 'pip' and 'pip3' are spec ids, not arguments | not named in LD1 (a scan 2 hit) | `FailSafe/extension/src/shared/exec/trustedExecutable.ts:176-178` (`function specProbe(spec: ExecutableSpec)`) `FailSafe/extension/src/shared/exec/trustedExecutable.ts:580-582` (`id: 'pip', fileName: both('pip')`) |
| `FailSafe/extension/src/roadmap/routes/QorRoute.ts` | not an integration: the Console's Qor routes (governance dashboard, sprint, plans); its runtime, health and evaluate proxies were removed with qor-runtime (B289) | LD1 allows a contract or a row for QorRuntimeService; it got a contract, `qor-runtime`, retired by B289 | `FailSafe/extension/src/roadmap/routes/QorRoute.ts:24` (`app.get("/api/qor/governance-dashboard"`) `FailSafe/extension/src/roadmap/routes/QorRoute.ts:47` (`app.get("/api/plans"`) |
| `FailSafe/extension/src/extension/bootstrapCore.ts` | folded into git-bootstrap | LD1 expects git-bootstrap to cite an ask-first consent for the package-manager install. On main that install has no prompt; its consent is the user-level, machine-scoped opt-in `failsafe.bootstrap.autoInstallGit` (off by default); the ask-first prompt covers only `git init` | `FailSafe/extension/src/extension/bootstrapCore.ts:37-40` (`only a user-level value counts`) |
| `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts` | folded into shield-receipts | LD1 names "the receipt verifier's GitHub read"; on main the evidence source reads only local git, and its only consumer has no caller | `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:6` (`GIT_NO_LAZY_FETCH=1`) |
| `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts` | folded into tracker-manifest | not a hit of either scan (`gh pr list` has no network word in its arguments); covered only because tracker-manifest owns it | `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:31` (`Merged PRs via`) |
| `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts` | folded into dependency-admission-lint | owned by dependency-admission-lint as well as the module LD1 names; it is the module's only importer | `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:14` (`} from './dependency-admission-core';`) |

## Verified facts

The plan's known facts (LD3), each checked against main rather than assumed. `Kind` says whether the fact, when confirmed, is a defect or a description of behaviour; every confirmed defect has a BACKLOG item.

| Id | Fact | Kind | Status | Evidence | Backlog |
|---|---|---|---|---|---|
| F01 | Jira and Linear fetch a single issue for preview only (no list, search or batch) | behaviour | confirmed | `FailSafe/extension/src/integrations/jira/jira-client.ts:48` (`export async function fetchJiraIssue(`) `FailSafe/extension/src/integrations/jira/jira-import.ts:41-42` (`/rest/api/2/issue/${encodeURIComponent(key)}`) `FailSafe/extension/src/integrations/linear/linear-client.ts:58` (`export async function fetchLinearIssue(`) `FailSafe/extension/src/integrations/linear/linear-import.ts:47-48` (`variables: { id: identifier }`) | - |
| F02 | An explicit approval comes before the local governed intent is created | behaviour | confirmed | `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:260-263` (`if (!(await ui.confirmCreate(`) `FailSafe/extension/src/extension/jira-command.ts:92` (`review: (issue) => reviewTrackerIssue(issue, vscodeReviewUi())`) `FailSafe/extension/src/extension/linear-command.ts:77` (`review: (issue) => reviewTrackerIssue(issue, vscodeReviewUi())`) | - |
| F03 | The draft carries a source content hash and provenance (source, key, URL, fetch time, source updated time) | behaviour | confirmed | `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:286-289` (`sourceUpdatedAt: issue.sourceUpdatedAt ?? null, contentSha256: hash`) `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:70` (`sourceUpdatedAt: p.updatedAt,`) | - |
| F04 | No backlog sync, no repository or code export, no knowledge-graph mapping and no two-way status sync | behaviour | confirmed | `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:10-11` (`Nothing is ever written back to the tracker and`) `FailSafe/extension/src/extension/jira-command.ts:6` (`nothing is ever written to Jira and nothing is synced`) `FailSafe/extension/src/extension/linear-command.ts:6` (`nothing is written to Linear and nothing is synced`) | - |
| F05 | Bicameral `DriftToL3Mediator` is not wired at activation | defect | confirmed | `FailSafe/extension/src/extension/bootstrapBicameral.ts:232` (`void rewire();`) `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:32-33` (`if (!client) return;`) `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:403` (`driftToL3Mediator: this.host.getDriftToL3Mediator() ?? undefined,`) `FailSafe/extension/src/roadmap/ConsoleServer.ts:170` (`this.registrar.setupAllRoutes();`) | [B259] |
| F06 | Bicameral `UpstreamMonitor` polls GitHub without an enable gate | defect | confirmed | `FailSafe/extension/src/extension/bootstrapBicameralWiring.ts:130-142` (`monitor.start();`) `FailSafe/extension/src/integrations/bicameral/UpstreamMonitor.ts:62-65` (`https://api.github.com/search/issues`) `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:405` (`upstreamMonitor: this.host.getUpstreamMonitor() ?? undefined,`) | [B260] |
| F07 | The voice pack download host uses the old organization slug (fixed in #538) | defect | confirmed | Recorded in `docs/BACKLOG.md:632` (`builds the download URL from the old`); fixed by `FailSafe/extension/src/voice-pack/install-handler.ts:26` (`const RELEASE_BASE = 'https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download';`) | [B261] |
| F08 | Slack and Teams: the release-seal notice never fires | defect | confirmed | `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:14-19` (`export const SLACK_NOTIFY_EVENTS = [`) `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:14-19` (`export const TEAMS_NOTIFY_EVENTS = [`) `FailSafe/extension/src/integrations/slack/slack-notify.ts:38` (`'release-seal': { emoji: ':lock:', label: 'Release sealed' },`) | [B262] |
| F09 | Slack and Teams: the L3-decided notice drops the file path (the payload is `{ request, decision }`; the mappers read `p.filePath`) (fixed in #538) | defect | confirmed | `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:156` (`this.eventBus.emit('qorelogic.l3Decided', { request, decision });`) recorded in `docs/BACKLOG.md:634` (`both mappers read `); fixed by `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:42` (`return (request as Record<string, unknown>).filePath;`) `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:36` (`return (request as Record<string, unknown>).filePath;`) | [B263] |
| F10 | Slack and Teams: the drift notice has no detail, and its only emitter is never constructed | defect | confirmed | `FailSafe/extension/src/governance/CheckpointReconciler.ts:112` (`this.eventBus.emit("governance.driftDetected", drift);`) `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:87` (`detail: str(p.summary) ?? str(p.detail),`) `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:81` (`detail: str(p.summary) ?? str(p.detail),`) | [B264] |
| F11 | The PR-linkage audit ignores `apiBaseUrl` (fixed on main, unreleased, #538: it now takes the resolved base) | defect | confirmed | `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:201` (`const base = `) `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:165-176` (`export interface LinkageRunOptions {`) `FailSafe/extension/src/integrations/github-checks/pr-linkage-publish.ts:36-38` (`const audit = await runLinkageAudit({`) | [B265] |
| F12 | Open Design SSE is dead: the client is built but `subscribeRun` has no caller and `sseEnabled` is read nowhere | defect | confirmed | `FailSafe/extension/src/extension/bootstrapOpenDesignMcp.ts:78` (`const sseClient = new OpenDesignSseClient();`) `FailSafe/extension/package.json:585-588` (`"failsafe.integrations.openDesign.sseEnabled"`) | [B266] |
| F13 | The Open Design client gate blocks only destructive tools | behaviour | not-reproduced | The gate refuses every tool that is not allowlisted, and refuses create_artifact on every path `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:77-78` (`TOOL_NOT_ALLOWLISTED`) `FailSafe/extension/src/integrations/open-design/OpenDesignMcpClient.ts:119-121` (`if (OpenDesignMcpAllowlist.isL3GatedWrite(name)) {`) | - |
| F14 | The FailSafe MCP server is reachable by no MCP client (in-process stdio only) | defect | confirmed | `FailSafe/extension/src/mcp/FailSafeServer.ts:171-173` (`this.transport = new StdioServerTransport();`) `docs/BACKLOG.md:554` (`FailSafeServer is in-process-only today`) | [B209] |
| F15 | The mcp-install route had no server-side confirmation (fixed on main by #538: it now writes only after a modal VS Code confirmation of the server-side entry) | defect | confirmed | `FailSafe/extension/src/roadmap/routes/McpRoute.ts:46-47` (`if (!approved) return;`) `FailSafe/extension/src/roadmap/routes/McpRoute.ts:61` (`fs.writeFileSync(cfgPath, merged.text);`) | [B267] |
| F16 | The agt-install route had no server-side confirmation; it opens a terminal and pre-fills the command and does not run it (fixed on main by #538: the terminal opens only after a modal VS Code confirmation) | defect | confirmed | `FailSafe/extension/src/roadmap/routes/AgtRoute.ts:75-81` (`deps.runInTerminal(`) `FailSafe/extension/src/extension/bootstrapServers.ts:184-186` (`terminal.sendText(command, false);`) | [B268] |
| F17 | The bicameral-install route had no server-side confirmation (fixed on main by #538: pip and setup run only after a modal VS Code confirmation, and the route is rate limited) | defect | confirmed | `FailSafe/extension/src/roadmap/routes/bicameralLifecycleRoutes.ts:59-65` (`app.post("/api/actions/bicameral-install"`) `FailSafe/extension/src/integrations/bicameral/install-handler.ts:107-111` (`args: ['install', BICAMERAL_PIP_SPEC],`) | [B269] |
| F18 | The governed commit uses the GitHub token without checking `integrations.github.enabled` | defect | confirmed | `FailSafe/extension/src/integrations/credentials/credentialGates.ts:90-91` (`export function governedCommitConnection(`) `FailSafe/extension/src/extension/bootstrapServers.ts:78` (`governedCommitPrStep(governedCommitConnection(credentials.creds, credentials.endpoints, credentials.ui)`) `FailSafe/extension/src/extension/governedCommit.ts:128-132` (`!deps.token.trim()`) | [B270] |
| F19 | The adapter base URL is not validated | defect | confirmed | `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:209-216` (`await deps.adapterService.saveConfig(config);`) `FailSafe/extension/src/roadmap/routes/SreApiRoute.ts:22` (`const baseUrl = adapterBaseUrl`) `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts:8` (`/sre/snapshot`) | [B271] |
| F20 | `docs/INTEGRATIONS.md` said the Bicameral auto-connect route persists to workspace settings; the code writes user settings (corrected in this change) | defect | confirmed | `FailSafe/extension/src/extension/bootstrapBicameral.ts:236-238` (`vscode.ConfigurationTarget.Global`) `FailSafe/extension/src/extension/bootstrapBicameral.ts:45-46` (`userLevelValue<boolean>(cfg.inspect<boolean>("autoConnect"), false)`) | [B272] |

## Legacy review map

The 13 reviews in `docs/research/integrations/` are historical input. Each was read, mapped to one contract and is cited in that contract's body text; none is edited. Integrations without a row here had no review.

| Review | Contract |
|---|---|
| `docs/research/integrations/INTEGRATION_AIDER_CONTRACT_REVIEW.md` | aider |
| `docs/research/integrations/INTEGRATION_CLINE_ROO_KILO_CONTRACT_REVIEW.md` | agent-audit |
| `docs/research/integrations/INTEGRATION_CONTINUE_CONTRACT_REVIEW.md` | continue |
| `docs/research/integrations/INTEGRATION_GITHUB_CONTRACT_REVIEW.md` | github-checks |
| `docs/research/integrations/INTEGRATION_JIRA_CONTRACT_REVIEW.md` | jira |
| `docs/research/integrations/INTEGRATION_LINEAR_CONTRACT_REVIEW.md` | linear |
| `docs/research/integrations/INTEGRATION_MCP_REGISTRY_CONTRACT_REVIEW.md` | mcp-catalog |
| `docs/research/integrations/INTEGRATION_MICROSOFT_TEAMS_CONTRACT_REVIEW.md` | teams |
| `docs/research/integrations/INTEGRATION_OPENHANDS_CONTRACT_REVIEW.md` | openhands |
| `docs/research/integrations/INTEGRATION_OPEN_DESIGN_CONTRACT_REVIEW.md` | open-design |
| `docs/research/integrations/INTEGRATION_SEMGREP_SARIF_CONTRACT_REVIEW.md` | sarif |
| `docs/research/integrations/INTEGRATION_SENTRY_CONTRACT_REVIEW.md` | sentry |
| `docs/research/integrations/INTEGRATION_SLACK_CONTRACT_REVIEW.md` | slack |

## Other findings

Found while writing the contracts, outside the LD3 list. They are recorded here and in the named contract, and were filed as BACKLOG items B273 to B282 at this cycle's seal.

- sentinel-llm: a workspace `.failsafe/config/sentinel.yaml` can set the LLM endpoint `FailSafe/extension/src/shared/ConfigManager.ts:51` (`resolveSentinelEndpoint(sentinelYaml?.sentinel?.ollamaEndpoint`), and in v6.0.8 the endpoint check admitted any public host over http; in an LLM mode file content was posted there without a prompt. Filed as B273; fixed on main, unreleased (#538): a workspace source is loopback only `FailSafe/extension/src/sentinel/utils/llmDestinationPolicy.ts:67` (`if (source !== 'user-setting')`).
- qor-logic-consumer: the scaffold route installed the package with no server-side VS Code confirmation in v6.0.8; on main it asks first `FailSafe/extension/src/roadmap/routes/ActionsRoute.ts:106-109` (`const approved = await authorizeOperatorAction(`). Filed as B274, fixed by #538.
- dependency-admission-lint: the npm registry query runs on each new seal with no setting or notice (see the contract). Filed as B275.
- agt-adapter: the adapter install route ran pip with no server-side confirmation in v6.0.8; on main install and uninstall ask first `FailSafe/extension/src/roadmap/routes/AdapterRoute.ts:63` (`const approved = await authorizeOperatorAction(deps, res, {`). Filed as B276, fixed by #538.
- qor-runtime: the `failsafe.qorelogic.externalRuntime.*` settings were contributed but never read. Filed as B277; B289 (#538) deprecated them `FailSafe/extension/package.json:710-713` (`"deprecationMessage": "No longer used: FailSafe has no external Qor runtime integration. Remove this setting."`) and closed B277; B326 removes the four settings other than apiKey, which stays while the plain-text cleanup lists it.
- github-checks: `GitContext.isFork` is never set, so the fork guards never fire `FailSafe/extension/src/extension/github-checks-command.ts:39-43` (`function readGitContext(cwd: string): GitContext {`); the v6.0.8 default GitHub transports drop a base URL's port, fixed on main, unreleased (#538) `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:172` (`port: u.port ? Number(u.port) : undefined,`). Filed as B278 (fork) and B279 (port).
- linear: a missing issue is reported as a contract failure, never not_found, so the earlier-import note cannot fire `FailSafe/extension/src/integrations/linear/linear-client.ts:85` (`Issue ${id} not found (or no access).`). Filed as B280.
- open-design: the Console's create_artifact request queues an L3 approval that always fails on approval `FailSafe/extension/src/roadmap/routes/OpenDesignRoute.ts:75` (`const approvalId = await deps.queueL3Approval({`). Filed as B281.
- failsafe-mcp-server: the activation notice says the server is listening `FailSafe/extension/src/mcp/FailSafeServer.ts:177-179` (`showInformationMessage(`), although no client can reach it (B209). Filed as B282.
- `docs/integrations/INTEGRATION_DOCS_INDEX.md` is stale for several rows (Jira, Linear, Teams, GitHub Checks, ACP and Devin under "In review"; Sentry, Continue, Aider, OpenHands and Cline/Roo/Kilo under "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:60` (`PR #148 (uses REST v2 for string descriptions)`).
