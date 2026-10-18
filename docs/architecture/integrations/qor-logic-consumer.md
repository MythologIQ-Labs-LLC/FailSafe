# Qor-logic consumer integration contract

Contract id: `qor-logic-consumer` (registry row `integration-contract-qor-logic-consumer`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

No legacy contract review exists for this integration.

**Owned files:**
- `FailSafe/extension/src/qorlogic/consumer/`
- `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts`

Shared modules it uses (not owned here): `FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts` (also used by the AGT adapter and the substrate runner), `FailSafe/extension/src/qorlogic/QorLogicSkillIngestor.ts`, `FailSafe/extension/src/qorlogic/hostLayouts.ts`, `FailSafe/extension/src/extension/installSkillsHandler.ts`, `FailSafe/extension/src/extension/bootstrapWorkspace.ts`.

## Customer job

A developer who governs work with the Qor-logic cycle wants FailSafe to install the `qor-logic` Python package when it is missing, and to read the cycle's file artifacts (ledger, feature index, tracker manifest, audit gate) without silently treating a broken or too-old artifact as an empty one.

## Measurable value

Metric: every artifact read through the adapter returns one of five explicit states instead of an indistinguishable empty value `FailSafe/extension/src/qorlogic/consumer/types.ts:9-10` (`Explicit artifact classification`).
Baseline: how often an artifact is malformed or below the version floor in real workspaces is not measured (unverified).

## Why not simply ask an agent

An agent can run `pip install`, but it does not refuse a Python interpreter planted inside the workspace, does not hold a minimum version floor, and cannot give the Console a classified, provenance-carrying view of every artifact on each hub refresh. The adapter does those locally and never writes the artifacts it reads.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for the Qor-logic package or PyPI (unverified: searched the index for "qor-logic" and "PyPI" at c36b9ee2).
The installer drives pip as a module with the package spec `qor-logic>=<floor>` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:95-97` (`const spec = `).

## Privileges and scopes

Credential: none; pip uses the interpreter's own index configuration (unverified: FailSafe passes no index URL or credential to pip) `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:97` (`'-P', '-m', 'pip', 'install', '--upgrade', spec`).
The interpreter override is read only from user settings and never from inside a workspace folder `FailSafe/extension/package.json:387-391` (`"failsafe.qorlogic.pythonPath": {`).
The spawned interpreter is the trusted resolver's absolute path, an argv array and no shell `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:225-230` (`exe = trustedPythonPath(cmd, options.cwd)`).
`-P` keeps pip from importing a module from the process working directory `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:96` (`-P: never import pip from the process cwd (LD11).`).
The artifact adapter is read-only by contract `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:7-8` (`Read-only by contract: the adapter never writes or repairs canonical`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| package-install | verified-shipped | `QorLogicPackageInstaller` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:74` (`export class QorLogicPackageInstaller implements IQorLogicPackageInstaller`) | `FailSafe/extension/src/extension/bootstrapServers.ts:283-287` (`const packageInstaller = new QorLogicPackageInstaller(`) | `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts` (unit) | Command `FailSafe/extension/package.json:211-212` (`"command": "failsafe.bootstrap"`) |
| version-floor-check | verified-shipped | `verifyInstalledVersion` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:113` (`async verifyInstalledVersion(): Promise<QorLogicVersionStatus>`) | `FailSafe/extension/src/extension/bootstrapServers.ts:159` (`return qorLogicPackageInstallerRef.verifyInstalledVersion();`) | `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts` (unit) | Floor constant `FailSafe/extension/src/qorlogic/hostLayouts.ts:70` (`export const MIN_QOR_LOGIC_VERSION`) |
| artifact-classification | verified-shipped | `readMetaLedgerArtifact` `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:199` (`export function readMetaLedgerArtifact(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:297` (`readMetaLedgerEnvelope: () => readMetaLedgerArtifact(h.workspaceRoot)`) | `FailSafe/extension/src/test/qorlogic/consumer/consumer-adapter.test.ts` (unit) | Also read by the tracker route `FailSafe/extension/src/roadmap/routes/TrackerRoute.ts:73` (`const ledger = readMetaLedgerArtifact(workspaceRoot);`) |
| compatibility-diagnostics | verified-shipped | `buildConsumerDiagnostics` `FailSafe/extension/src/qorlogic/consumer/diagnostics.ts:41` (`export function buildConsumerDiagnostics(`) | `FailSafe/extension/src/roadmap/services/WorkspaceArtifactBuilder.ts:108` (`qorConsumer: buildConsumerDiagnostics(this.workspaceRoot, {`) | `FailSafe/extension/src/test/qorlogic/consumer/consumer-diagnostics.test.ts` (unit) | Carried in the hub payload `FailSafe/extension/src/roadmap/services/hub-payload-assembler.ts:63` (`qorConsumer: input.artifacts.qorConsumer,`) |

## Inbound fields

From pip: the `Name:` and `Version:` lines of `pip show qor-logic` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:135-137` (`'-P', '-m', 'pip', 'show', PACKAGE`).
From pip: exit code, stdout and stderr of the install run `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:195-200` (`pip exited with code ${result.code}`).
From the workspace: the ledger, feature index, tracker manifest and audit gate artifacts, read from disk `FailSafe/extension/src/qorlogic/consumer/diagnostics.ts:45-50` (`readFeatureIndexArtifact(root, opts),`).

## Outbound fields and egress

Repository content: no; the install arguments carry only the package spec `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:97` (`'-P', '-m', 'pip', 'install', '--upgrade', spec`).
Metadata: yes, pip itself contacts the configured Python package index for `qor-logic`; FailSafe does not choose the index (unverified: depends on the user's pip configuration).
Graph relationships: no `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:7-8` (`envelopes are views`).
Governance evidence: no; the adapter never writes the artifacts it classifies `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:7` (`the adapter never writes or repairs canonical`).
Consent for the install: the bootstrap command asks before pip in interactive mode `FailSafe/extension/src/extension/bootstrapWorkspace.ts:95-103` (`Install now?`).
Consent for the install: activation runs bootstrap in silent mode, which defers pip `FailSafe/extension/src/extension/bootstrapServers.ts:467` (`void runWorkspaceBootstrap(bootstrapDeps, "silent")`).
Consent for the install: on main the Console scaffold route shows the validated hosts, scope and skills in a modal VS Code dialog and runs pip and `qor install` only after approval `FailSafe/extension/src/roadmap/routes/ActionsRoute.ts:99-113` (`const approved = await authorizeOperatorAction(`); as released in v6.0.8 it asked nothing (B274, fixed in #538).

## Transformations

The installed version is compared with the floor numerically, ignoring a pre-release suffix `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:157-162` (`const numericPart = version.split('-')[0];`).
An installed version that differs from the tested-against version is reported as untested, advisory only `FailSafe/extension/src/qorlogic/consumer/types.ts:53-56` (`installed is not the tested-against version. Advisory.`).
A below-floor version makes every artifact `unsupported`; a missing file is `unavailable`; an unreadable or unparsable one is `malformed` `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:102-113` (`return { artifact, state: 'unavailable', data: null, provenance`).
An `ok` artifact older than `maxAgeMs` becomes `stale` with its data kept `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:26-27` (`artifact older than this downgrades to`).

## Persisted artifacts

The installer writes nothing of its own; pip installs the package into the resolved interpreter's environment `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:100` (`const result = await this.run(py.command, args, { timeoutMs: this.timeoutMs });`).
The command line is appended to the FailSafe output channel `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:99` (`this.output.appendLine(`).
The adapter persists nothing; each envelope carries the source path, mtime and installed version as provenance `FailSafe/extension/src/qorlogic/consumer/types.ts:12-19` (`export interface ArtifactProvenance {`).

## Graph links

Implemented: none; envelopes name their source path but link nothing `FailSafe/extension/src/qorlogic/consumer/types.ts:13-14` (`Absolute path of the artifact the envelope was classified from.`).
Proposed (not built): ledger-entry-to-receipt and plan-to-intent edges, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Bootstrap Workspace (install qor-logic + scaffold)" `FailSafe/extension/package.json:211-212` (`"title": "FailSafe: Bootstrap Workspace (install qor-logic + scaffold)"`).
Console: the Install Skills modal posts to the scaffold route, which probes Python, ensures the package and installs skills per host `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js:227-228` (`const res = await fetch('/api/actions/scaffold-skills', {`).
The hub payload carries the consumer diagnostics; no Console renderer reads `qorConsumer` (unverified: searched `roadmap/ui` for `qorConsumer` at c36b9ee2).

## Governance policy and enforceability limits

Enforced: an interpreter that is not a recognised Python command is not spawned `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:207-215` (`spawnError: 'unsafe-python-command'`).
Enforced: an interpreter inside the workspace is refused at spawn time for this run's cwd `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:223-225` (`LD12: re-checked against this run's cwd`).
Enforced: a below-floor version makes consumers see `unsupported` instead of data `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:57-61` (`is below the required minimum`).
Advisory: `untested` never blocks a read `FailSafe/extension/src/qorlogic/consumer/types.ts:45-49` (`deliberately does NOT feed this`).
Advisory: the package spec has a floor but no upper bound, so pip may install any newer release `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:95` (`${PACKAGE}>=${MIN_QOR_LOGIC_VERSION}`).

## Failure, offline, stale and permission semantics

No Python found: the install returns `no-python-found` without spawning `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:92-94` (`error: 'no-python-found'`).
Offline or a hung index: the install is killed after 120 seconds and reported as `timeout` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:70` (`const DEFAULT_TIMEOUT_MS = 120_000;`).
pip failure: a non-zero exit is `pip-failed` with stderr written to the output channel `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:195-198` (`error: 'pip-failed'`).
Version unknown: an unresolved interpreter or failed `pip show` reports not installed, below the floor and untested `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:141-149` (`No version resolved: below the floor AND untested`).
Stale artifact: data is kept and the state says `stale` `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:26-27` (`artifact older than this downgrades to`).

## End-to-end scenario and measurable acceptance

Scenario: on a machine without the package, run "FailSafe: Bootstrap Workspace", answer Install, and find `qor-logic` at or above the floor reported by the version check `FailSafe/extension/src/extension/bootstrapWorkspace.ts:104-113` (`installing qor-logic via pip`).
Metric: the install argv is exactly `-P -m pip install --upgrade qor-logic>=<floor>` and an unsafe interpreter is never spawned (threshold: exact argv) `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts:106` (`'-P', '-m', 'pip', 'install', '--upgrade', PINNED_SPEC`).
Existing tests: `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts:67` (`suite('QorLogicPackageInstaller: isInstalled'`) (unit, injected runner); `FailSafe/extension/src/test/qorlogic/consumer/consumer-adapter.test.ts:67` (`const env = readMetaLedgerArtifact(materialize('supported'));`) (unit).
Installed-extension test: none runs a real pip install against a package index (unverified).

## Recommended disposition

Recommendation for the owner: **MAINTAIN**. The installer is hardened (trusted interpreter path, `-P`, argv-only, timeout) and the five-state adapter is tested; the open item is that the Console web path installs without the server-side confirmation the other install routes are moving to.

## Open defects

Fixed in #538: [B274] the scaffold route installed the package without a server-side VS Code confirmation and without a remote-request check (observed outside the LD3 list); it now runs the Console request guard, a rate limit and the dialog `FailSafe/extension/src/roadmap/routes/ActionsRoute.ts:99` (`app.post("/api/actions/scaffold-skills", consoleRequestGuard(`).
The web path reaches pip through `ensurePackageInstalled` `FailSafe/extension/src/extension/installSkillsHandler.ts:131-132` (`const pip = await runPipStep(ingestor, callbacks.onProgress);`).
