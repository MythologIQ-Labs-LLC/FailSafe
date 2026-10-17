# Dependency admission lint integration contract

Contract id: `dependency-admission-lint` (registry row `integration-contract-dependency-admission-lint`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

No legacy contract review exists for this integration.

**Owned files:**
- `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts`
- `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts`

Shared modules it uses (not owned here): `FailSafe/extension/src/extension/substrate-command.ts` (the substrate runner's module list and seal hook), `FailSafe/extension/src/qorlogic/substrate/SubstrateRunner.ts`, `FailSafe/extension/src/shared/git/trustedGit.ts`.

## Customer job

A maintainer adding or bumping an npm dependency wants a warning when the chosen version was published only days ago, before it lands, so a freshly published (possibly compromised) release waits out a cooling period or is admitted on the record.

## Measurable value

Metric: every new or changed direct dependency whose version is younger than the cooling window and has no ledger override yields one WARN finding `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:202-214` (`rule: 'within-cooling-window'`).
Baseline: how many dependency changes the lint has flagged in practice is not recorded (unverified).

## Why not simply ask an agent

An agent can look up one package's publish date when asked, but it does not diff every direct dependency against the merge base on each seal, check each against a recorded override convention in the ledger, and report the result in a fixed, WARN-only format without being prompted.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for the npm registry (unverified: searched the index for "npm" at c36b9ee2).
The module reads the public packument time map at `https://registry.npmjs.org/<name>` `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:69-71` (`npm packument: time map keyed by version.`).

## Privileges and scopes

Credential: none; the request carries only a User-Agent and an Accept header `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:77` (`'User-Agent': 'failsafe/dependency-admission-lint'`).
Scope: anonymous read of the public npm registry; there is no write `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:75` (`const req = https.get(`).
Local: git `merge-base` and `show` through the trusted git path, read-only `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:47` (`['merge-base', 'origin/main', 'HEAD']`).
No setting enables or disables the registry query (unverified: no configuration read in the module or in its construction) `FailSafe/extension/src/extension/substrate-command.ts:65` (`new DependencyAdmissionLintModule(ws),`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| cooling-window-lint | verified-shipped | `DependencyAdmissionLintModule` `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:115` (`export class DependencyAdmissionLintModule {`) | `FailSafe/extension/src/extension/substrate-command.ts:65` (`new DependencyAdmissionLintModule(ws),`) | `FailSafe/extension/src/test/qorlogic/substrate/DependencyAdmissionLintModule.test.ts` (unit) | Command `FailSafe/extension/package.json:140-141` (`"title": "FailSafe: Run Governance Substrate Checks"`); injected I/O, no live registry |
| ledger-override | verified-shipped | `evaluateBumps` `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:138` (`export function evaluateBumps(`) | `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:193` (`const result = evaluateBumps(`) | `FailSafe/extension/src/test/qorlogic/substrate/dependency-admission-core.test.ts` (unit) | Override line format `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:17-18` (`**Dependency admission override**: <pkg>@<version>`) |
| seal-auto-run | verified-shipped | `registerSubstrateCommand` `FailSafe/extension/src/extension/substrate-command.ts:83` (`export function registerSubstrateCommand(`) | `FailSafe/extension/src/extension/main.ts:228-233` (`core.mutationBus, // B-SUBSTRATE-3: enables the seal auto-hook`) | `FailSafe/extension/src/test/extension/substrate-command.test.cjs` (unit) | Runs on each new SESSION SEAL in the ledger `FailSafe/extension/src/extension/substrate-command.ts:141-143` (`new SESSION SEAL detected`) |
| lockfile-transitive-coverage | proposed | none | none | none | Deferred in the core's boundary note `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:20-24` (`Lockfile-resolved transitive coverage is deferred`) |

## Inbound fields

From the registry: only `time[<version>]` of the packument, as an ISO date `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:88-91` (`resolve(doc.time?.[version] ?? null);`).
From the workspace: `dependencies`, `devDependencies` and `optionalDependencies` of `package.json`, kept only when the spec names one concrete version `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:82-88` (`for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'])`).
From git: the same manifest at the merge base of `origin/main` and `HEAD` `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:169-170` (`const baseRef = this.io.resolveBaseRef(this.workspaceRoot);`).
From the ledger: override entries in `docs/META_LEDGER.md` `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:183-185` (`const overrideKeys = parseOverrideEntries(ledgerText);`).

## Outbound fields and egress

Repository content: no file content leaves; only package names go out, one request each `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:188-191` (`await this.io.fetchPublishTime(bump.name, bump.newVersion)`).
Metadata: yes, the name of every new or changed direct dependency, including scoped and private names, to registry.npmjs.org `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:70-71` (`const url = `).
Metadata: when there is no `origin/main` merge base, the base is empty, so every direct dependency counts as new and its name is sent `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:171-178` (`base = baseText ? parseDirectDeps(baseText) : [];`).
Graph relationships: no `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:201-215` (`location: { file: this.manifestRelPath },`).
Governance evidence: no; findings stay local `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:143` (`ok: true, // WARN-only: this module never blocks`).
Consent: none beyond running the substrate command; in a workspace with `docs/META_LEDGER.md` the seal hook also runs it without asking `FailSafe/extension/src/extension/substrate-command.ts:116-117` (`auto-run on each new /qor-substantiate seal.`); see Open defects.

## Transformations

A version spec is reduced to one concrete version; ranges, tags, URLs and protocols are skipped `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:64-68` (`Reject non-registry protocols`).
The current and base lists are diffed into added and changed entries `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:101-111` (`export function diffDeps(current: DepEntry[], base: DepEntry[]): Bump[] {`).
Age is compared with a 14-day default window `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:172` (`export const DEFAULT_THRESHOLD_DAYS = 14;`).
A version the registry has no time for is a registry error, reported as info, not a violation `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:216-223` (`cooling-period check skipped for this entry.`).

## Persisted artifacts

None written by the module; the report goes to the "FailSafe Substrate" output channel `FailSafe/extension/src/extension/substrate-command.ts:90` (`vscode.window.createOutputChannel('FailSafe Substrate')`).
One `substrate.run.complete` event per run on the in-process event bus `FailSafe/extension/src/qorlogic/substrate/SubstrateRunner.ts:50` (`this.eventBus.emit('substrate.run.complete', {`).

## Graph links

Implemented: none; a finding names the manifest file only `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:213` (`location: { file: this.manifestRelPath },`).
Proposed (not built): dependency-change-to-seal edges, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Run Governance Substrate Checks" `FailSafe/extension/package.json:140-141` (`"command": "failsafe.substrate.run"`).
A manual run ends with an information message giving the finding count `FailSafe/extension/src/extension/substrate-command.ts:102-105` (`finding(s). See "FailSafe Substrate" output channel.`).
The seal-time run shows no popup `FailSafe/extension/src/extension/substrate-command.ts:20-23` (`runs the substrate (WARN-only, no popup)`).

## Governance policy and enforceability limits

Advisory only: the module always reports `ok: true` and never blocks `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:143` (`ok: true, // WARN-only: this module never blocks`).
Observed, not enforced: a dependency can be merged inside the window; the lint only reports it `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:22-24` (`WARN-only: never blocks any workflow.`).
Limit: transitive and lockfile-resolved versions are not checked `FailSafe/extension/src/qorlogic/substrate/dependency-admission-core.ts:20-24` (`Lockfile-resolved transitive coverage is deferred`).

## Failure, offline, stale and permission semantics

Offline: each lookup is tried three times with a 5-second timeout, then recorded as a registry error `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:72-77` (`for (let attempt = 0; attempt < 3; attempt += 1) {`).
A non-2xx registry response is an error for that entry `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:79-82` (`reject(new Error(`).
Missing manifest or unparsable JSON: no findings and an explanatory note `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:158-166` (`manifest not found at`).
No base ref: every direct dependency is treated as new (unverified as to intent; see the egress line above) `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:173` (`base = baseText ? parseDirectDeps(baseText) : [];`).

## End-to-end scenario and measurable acceptance

Scenario: add a dependency whose version was published three days ago, seal a cycle, and read one `within-cooling-window` WARN in the "FailSafe Substrate" channel; add an override line to the ledger and the next run has none `FailSafe/extension/src/qorlogic/substrate/DependencyAdmissionLintModule.ts:207-212` (`entry to docs/META_LEDGER.md to admit it.`).
Metric: one finding per in-window bump without override, zero with override (threshold: exact counts) `FailSafe/extension/src/test/qorlogic/substrate/DependencyAdmissionLintModule.test.ts:61-75` (`freshly-added dep within window`).
Existing tests: `FailSafe/extension/src/test/qorlogic/substrate/DependencyAdmissionLintModule.test.ts:11-12` (`No git, no network`) (unit); `FailSafe/extension/src/test/extension/substrate-command.test.cjs:209` (`a new SESSION SEAL entry`) (unit).
Installed-extension test: none exercises a live registry lookup (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The check is useful and well tested with injected I/O, but it sends dependency names to a third-party registry on every seal with no setting to turn that off and no notice, and with no merge base it sends every name; give the egress a switch and a stated consent before relying on it.

## Open defects

Observed, not filed in this cycle (see Other findings in the portfolio): the registry query runs on each new seal with no setting or prompt, and without a merge base it sends every direct dependency name `FailSafe/extension/src/extension/substrate-command.ts:121-143` (`void runSubstrate('seal auto-hook');`).
