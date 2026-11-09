# Qor-logic consumer integration contract

Contract id: `qor-logic-consumer` (registry row `integration-contract-qor-logic-consumer`). Recorded against main `c36b9ee2`, and updated for #463: on main the package is a frozen qor-logic 0.176.1 consumer, installed only offline from an operator-approved local wheel with a pinned SHA-256; conformance with 0.176.1 is not attested (the tested-against version is still 0.169.0). Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

No legacy contract review exists for this integration.

**Owned files:**
- `FailSafe/extension/src/qorlogic/consumer/`
- `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts`

Shared modules it uses (not owned here): `FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts` (also used by the AGT adapter and the substrate runner), `FailSafe/extension/src/qorlogic/QorLogicSkillIngestor.ts`, `FailSafe/extension/src/qorlogic/hostLayouts.ts`, the #463 frozen-install modules under `FailSafe/extension/src/qorlogic/` (`frozenWheel.ts`, `frozenWheelInstall.ts`, `qorDependencyPreflight.ts`, `qorPackageEnsure.ts`, `qorHostInstallOutput.ts`, `qorHostReceiptVerify.ts`, `skillEnumeration.ts`), `FailSafe/extension/src/extension/installSkillsHandler.ts`, `FailSafe/extension/src/extension/bootstrapWorkspace.ts`.

## Customer job

A developer who governs work with the Qor-logic cycle wants FailSafe to install a known, verified `qor-logic` Python package when it is missing, without silently downloading or upgrading it, and to read the cycle's file artifacts (ledger, feature index, tracker manifest, audit gate) without silently treating a broken or too-old artifact as an empty one.

## Measurable value

Metric: every artifact read through the adapter returns one of five explicit states instead of an indistinguishable empty value `FailSafe/extension/src/qorlogic/consumer/types.ts:9-10` (`Explicit artifact classification`).
Metric: a package install happens only from a wheel whose bytes hash to the pinned SHA-256 `FailSafe/extension/src/qorlogic/frozenWheel.ts:12` (`dd6eec66ce54b3f13f19b6af2cd802b02dde1787142b2f81a27a7ba8ee5c0e31`).
Baseline: how often an artifact is malformed or below the version floor in real workspaces is not measured (unverified).

## Why not simply ask an agent

An agent can run `pip install`, but it does not refuse a Python interpreter planted inside the workspace, does not verify the wheel's bytes against a pinned hash, does not refuse to replace a different installed version, and cannot give the Console a classified, provenance-carrying view of every artifact on each hub refresh. The adapter and installer do those locally and never write the artifacts they read.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for the Qor-logic package or PyPI (unverified: searched the index for "qor-logic" and "PyPI" at c36b9ee2).
The installer no longer installs from PyPI; it delegates to the frozen-wheel install with an approved local wheel path `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:78-79` (`Explicitly approved, local exact wheel only. No automatic PyPI install.`).
The frozen target is `qor_logic-0.176.1-py3-none-any.whl` `FailSafe/extension/src/qorlogic/frozenWheel.ts:11` (`export const FROZEN_QOR_WHEEL_NAME = 'qor_logic-0.176.1-py3-none-any.whl';`).

## Privileges and scopes

Credential: none; every pip install FailSafe runs is isolated and offline, so no index or index credential is used `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:64-65` (`'--no-index', '--no-deps', '--no-cache-dir', '--no-compile', verifiedPath`).
The interpreter override is read only from user settings and never from inside a workspace folder `FailSafe/extension/package.json:406-410` (`"failsafe.qorlogic.pythonPath": {`).
The spawned interpreter is the trusted resolver's absolute path, an argv array and no shell `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:214-221` (`exe = trustedPythonPath(cmd, options.cwd)`).
`-P` keeps pip from importing a module from the process working directory `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:64` (`'-P', '-m', 'pip', '--isolated', 'install',`).
The wheel is read through a no-follow descriptor, size-capped and copied into a private temporary directory before hashing `FailSafe/extension/src/qorlogic/frozenWheel.ts:73-84` (`fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-qor-wheel-'))`).
The artifact adapter is read-only by contract `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:7-8` (`Read-only by contract: the adapter never writes or repairs canonical`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| frozen-wheel-install | main-unreleased | `installFrozenWheel` `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:84` (`export async function installFrozenWheel(ctx: InstallContext)`) | `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:106-107` (`return installFrozenWheel({`) | `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts` (unit) | Replaces the v6.0.8 PyPI `pip install --upgrade`; refuses without an approved wheel `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:86` (`error: 'verified-wheel-required'`) |
| version-floor-check | verified-shipped | `verifyInstalledVersion` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:122` (`async verifyInstalledVersion(): Promise<QorLogicVersionStatus>`) | `FailSafe/extension/src/extension/bootstrapServers.ts:174` (`return qorLogicPackageInstallerRef.verifyInstalledVersion();`) | `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts` (unit) | Floor constant `FailSafe/extension/src/qorlogic/hostLayouts.ts:80` (`export const MIN_QOR_LOGIC_VERSION`) |
| host-install-receipt-verification | main-unreleased | `verifyHostInstallReceipt` `FailSafe/extension/src/qorlogic/qorHostReceiptVerify.ts:96` (`export function verifyHostInstallReceipt(`) | `FailSafe/extension/src/qorlogic/QorLogicSkillIngestor.ts:130` (`const verified = verifyHostInstallReceipt(this.workspaceRoot, host);`) | `FailSafe/extension/src/test/qorlogic/qorHostReceiptVerify.test.ts` (unit) | A zero exit needs one positive "Installed N files to HOST" line whose N equals the verified receipt's file count `FailSafe/extension/src/qorlogic/QorLogicSkillIngestor.ts:134-135` (`install-output-receipt-count-mismatch`) |
| artifact-classification | verified-shipped | `readMetaLedgerArtifact` `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:199` (`export function readMetaLedgerArtifact(`) | `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts:299` (`readMetaLedgerEnvelope: () => readMetaLedgerArtifact(h.workspaceRoot)`) | `FailSafe/extension/src/test/qorlogic/consumer/consumer-adapter.test.ts` (unit) | Also read by the tracker route `FailSafe/extension/src/roadmap/routes/TrackerRoute.ts:73` (`const ledger = readMetaLedgerArtifact(workspaceRoot);`) |
| compatibility-diagnostics | verified-shipped | `buildConsumerDiagnostics` `FailSafe/extension/src/qorlogic/consumer/diagnostics.ts:41` (`export function buildConsumerDiagnostics(`) | `FailSafe/extension/src/roadmap/services/WorkspaceArtifactBuilder.ts:108` (`qorConsumer: buildConsumerDiagnostics(this.workspaceRoot, {`) | `FailSafe/extension/src/test/qorlogic/consumer/consumer-diagnostics.test.ts` (unit) | Carried in the hub payload `FailSafe/extension/src/roadmap/services/hub-payload-assembler.ts:63` (`qorConsumer: input.artifacts.qorConsumer,`) |

## Inbound fields

From pip: the `Name:` and `Version:` lines of `pip show qor-logic` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:150-152` (`'-P', '-m', 'pip', 'show', PACKAGE`).
From pip: the exit code and output of the offline dependency dry-run `FailSafe/extension/src/qorlogic/qorDependencyPreflight.ts:16-17` (`'--dry-run', '--no-index', '--no-cache-dir', '--only-binary', ':all:', verifiedWheelPath`), and of `pip check` `FailSafe/extension/src/qorlogic/qorDependencyPreflight.ts:41` (`'-P', '-m', 'pip', '--isolated', 'check'`).
From pip: exit code, stdout and stderr of the install run `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:126-129` (`pip exited with code ${result.code}`).
From the operator: the local wheel chosen in a file dialog `FailSafe/extension/src/extension/bootstrapWorkspace.ts:124-128` (`openLabel: "Select frozen Qor-logic wheel"`).
From the qor CLI: the "Installed N files to HOST" line and the host's install receipt with per-file SHA-256 `FailSafe/extension/src/qorlogic/qorHostInstallOutput.ts:10` (`const INSTALLED = /^Installed ([1-9][0-9]{0,5}) files to`).
From the workspace: the ledger, feature index, tracker manifest and audit gate artifacts, read from disk `FailSafe/extension/src/qorlogic/consumer/diagnostics.ts:45-50` (`readFeatureIndexArtifact(root, opts),`).

## Outbound fields and egress

Repository content: no; the install arguments carry only the staged wheel path `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:64-65` (`'--no-index', '--no-deps', '--no-cache-dir', '--no-compile', verifiedPath`).
Metadata: none from FailSafe's pip runs, which pass `--no-index` to both the dry-run and the install `FailSafe/extension/src/qorlogic/qorDependencyPreflight.ts:16-17` (`'--dry-run', '--no-index'`); whether the upstream `qor.cli install` process contacts a network is unverified.
Graph relationships: no `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:7-8` (`envelopes are views`).
Governance evidence: no; the adapter never writes the artifacts it classifies `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:7` (`the adapter never writes or repairs canonical`).
Consent for the install: the bootstrap command asks for a local wheel and a modal confirmation in interactive mode `FailSafe/extension/src/extension/bootstrapWorkspace.ts:130-133` (`"Install verified wheel"`).
Consent for the install: activation runs bootstrap in silent mode, which never installs `FailSafe/extension/src/extension/bootstrapServers.ts:513` (`void runWorkspaceBootstrap(bootstrapDeps, "silent")`), and every non-interactive mode defers a missing package `FailSafe/extension/src/extension/bootstrapWorkspace.ts:105-107` (`No automatic network installation.`).
Consent for the install: the Console and command install path asks for the wheel and a modal confirmation before installing `FailSafe/extension/src/extension/installSkillsHandler.ts:56-60` (`'Install verified wheel'`).
Consent for the install: on main the Console scaffold route shows the validated hosts, scope and skills in a modal VS Code dialog and runs the install steps only after approval `FailSafe/extension/src/roadmap/routes/ActionsRoute.ts:113-117` (`const approved = await authorizeOperatorAction(`); as released in v6.0.8 it asked nothing (B274, fixed in #538).

## Transformations

The installed version is compared with the floor numerically, ignoring a pre-release suffix `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:172-173` (`const numericPart = version.split('-')[0];`).
The floor no longer authorizes installs; install and skill readiness need the exact frozen version `FailSafe/extension/src/qorlogic/hostLayouts.ts:5-7` (`merely meeting this floor does not authorize writes`).
An installed version other than 0.176.1 is refused as a version divergence, never replaced `FailSafe/extension/src/qorlogic/qorPackageEnsure.ts:33-34` (`No implicit replacement.`).
An exact 0.176.1 install counts as ready only when `pip check` passes `FailSafe/extension/src/qorlogic/qorPackageEnsure.ts:28-31` (`const health = await installer.verifyInstalledDependencies();`).
An installed version that differs from the tested-against version is reported as untested, advisory only `FailSafe/extension/src/qorlogic/consumer/types.ts:53-56` (`installed is not the tested-against version. Advisory.`); the tested-against version is still 0.169.0 `FailSafe/extension/src/qorlogic/hostLayouts.ts:103` (`export const TESTED_AGAINST_QOR_LOGIC_VERSION = "0.169.0";`).
A below-floor version makes every artifact `unsupported`; a missing file is `unavailable`; an unreadable or unparsable one is `malformed` `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:102-113` (`return { artifact, state: 'unavailable', data: null, provenance`).
An `ok` artifact older than `maxAgeMs` becomes `stale` with its data kept `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:26-27` (`artifact older than this downgrades to`).

## Persisted artifacts

The installer writes nothing of its own beyond a private staging copy of the wheel, removed afterwards `FailSafe/extension/src/qorlogic/frozenWheel.ts:93-96` (`fs.rmSync(dir, { recursive: true, force: true });`); pip installs the package into the resolved interpreter's environment `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:74` (`const result = await runSafely(() => run(py.command, args, { timeoutMs }));`).
A line noting the passed dependency preflight and offline install is appended to the FailSafe output channel `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:73` (`output.appendLine(`).
The adapter persists nothing; each envelope carries the source path, mtime and installed version as provenance `FailSafe/extension/src/qorlogic/consumer/types.ts:12-19` (`export interface ArtifactProvenance {`).

## Graph links

Implemented: none; envelopes name their source path but link nothing `FailSafe/extension/src/qorlogic/consumer/types.ts:13-14` (`Absolute path of the artifact the envelope was classified from.`).
Proposed (not built): ledger-entry-to-receipt and plan-to-intent edges, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Bootstrap Workspace (install qor-logic + scaffold)" `FailSafe/extension/package.json:215-216` (`"title": "FailSafe: Bootstrap Workspace (install qor-logic + scaffold)"`).
Console: the Install Skills modal posts to the scaffold route, which probes Python, ensures the frozen package and installs skills per host after you confirm in the VS Code dialog `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js:230` (`settleGated(fetch('/api/actions/scaffold-skills', jsonPost(body)))`).
Console: selected-skill installs and global scope are refused before any Python process starts `FailSafe/extension/src/extension/installSkillsHandler.ts:195-206` (`Selected-skill installation is unavailable with frozen qor-logic 0.176.1`).
Console: the install preview answers 501 without running anything `FailSafe/extension/src/roadmap/routes/QorlogicRoute.ts:61-65` (`frozen-qor-logic-install-preview-unavailable`), and the skill list is empty and degraded without launching Python `FailSafe/extension/src/qorlogic/skillEnumeration.ts:34-37` (`frozen-qor-logic-selective-enumeration-unavailable`).
The hub payload carries the consumer diagnostics; no Console renderer reads `qorConsumer` (unverified: searched `roadmap/ui` for `qorConsumer` at c36b9ee2).

## Governance policy and enforceability limits

Enforced: an interpreter that is not a recognised Python command is not spawned `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:198-204` (`spawnError: 'unsafe-python-command'`).
Enforced: an interpreter inside the workspace is refused at spawn time for this run's cwd `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:214-216` (`LD12: re-checked against this run's cwd`).
Enforced: a wheel with the wrong name, a relative path, a link, an oversized file or bytes that do not hash to the pinned SHA-256 never reaches pip install `FailSafe/extension/src/qorlogic/frozenWheel.ts:54-55` (`hash.digest('hex') !== FROZEN_QOR_WHEEL_SHA256`).
Enforced: an offline dependency dry-run must pass before the install `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:67-72` (`Check dependency resolution in dry-run mode before any installation.`); it cannot roll back a failed real install `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:68` (`This still cannot guarantee rollback`).
Enforced: an install is accepted only when `pip show` then reports exactly 0.176.1 and `pip check` passes `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:50-56` (`error: 'post-install-mismatch'`).
Enforced: a skill install succeeds only with a positive host-specific confirmation line and a verified receipt whose files lie under the host base and match their SHA-256 `FailSafe/extension/src/qorlogic/qorHostReceiptVerify.ts:88-97` (`sha256OfFd(fd) !== item.sha256`); an empty or missing receipt is refused `FailSafe/extension/src/qorlogic/qorHostReceiptVerify.ts:65-66` (`return { ok: false, error: 'install-receipt-missing' };`).
Enforced: a below-floor version makes consumers see `unsupported` instead of data `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:57-61` (`is below the required minimum`).
Advisory: `untested` never blocks a read `FailSafe/extension/src/qorlogic/consumer/types.ts:45-49` (`deliberately does NOT feed this`).
Not attested: the frozen version is an intended target, not a conformance pass `FailSafe/extension/src/qorlogic/hostLayouts.ts:82-83` (`Intended frozen upstream release. NOT a conformance PASS.`); the wheel check verifies staged bytes, not installed behaviour or dependency provenance `FailSafe/extension/src/qorlogic/frozenWheel.ts:2-3` (`Verifies staged bytes, NOT installed consumer behavior or dependency provenance.`).

## Failure, offline, stale and permission semantics

No approved wheel: the install returns `verified-wheel-required` without resolving Python `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:86` (`error: 'verified-wheel-required'`).
No Python found: the install returns `no-python-found` without spawning `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:87-88` (`error: 'no-python-found'`).
Ambiguous package state: a failed or unclear `pip show` is `package-state-unknown` and nothing is installed `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:41-42` (`error: 'package-state-unknown'`).
Offline: the install needs no network; a missing dependency fails the offline dry-run as `dependency-preflight-failed` before installing `FailSafe/extension/src/qorlogic/qorDependencyPreflight.ts:24-26` (`error: 'dependency-preflight-failed'`).
A hung pip: the install is killed after 120 seconds and reported as `timeout` `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:86` (`const DEFAULT_TIMEOUT_MS = 120_000;`).
pip failure: a non-zero exit is `pip-failed` with stderr written to the output channel `FailSafe/extension/src/qorlogic/frozenWheelInstall.ts:126-129` (`error: 'pip-failed'`).
Version unknown: an unresolved interpreter or failed `pip show` reports not installed, below the floor and untested `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts:156-157` (`No version resolved: below the floor AND untested`).
Stale or no-op host install: a zero exit without exactly one positive confirmation line for the requested host is refused `FailSafe/extension/src/qorlogic/qorHostInstallOutput.ts:33-34` (`install-confirmation-missing-or-invalid`).
Stale artifact: data is kept and the state says `stale` `FailSafe/extension/src/qorlogic/consumer/consumer-adapter.ts:26-27` (`artifact older than this downgrades to`).

## End-to-end scenario and measurable acceptance

Scenario: on a machine without the package, run "FailSafe: Bootstrap Workspace", select the local `qor_logic-0.176.1-py3-none-any.whl`, confirm "Install verified wheel", and find `qor-logic` 0.176.1 reported with healthy dependencies `FailSafe/extension/src/extension/bootstrapWorkspace.ts:138-150` (`exact verified wheel installed; conformance pending`).
Metric: wrong bytes or an invalid path never reach `pip install`, and the install argv is `-P -m pip --isolated install --no-index --no-deps --no-cache-dir --no-compile <staged wheel>` (threshold: zero installs from unverified bytes) `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts:164` (`absent package plus invalid path or wrong bytes refuses before pip install`).
Existing tests: `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts:107` (`existing future/older version refuses replacement, with no pip install`) (unit, injected runner); `FailSafe/extension/src/test/qorlogic/qorDependencyPreflight.test.ts:13` (`only dry-runs offline with dependency resolution; never uses --no-deps`) (unit); `FailSafe/extension/src/test/qorlogic/qorHostReceiptVerify.test.ts:38` (`zero-exit with absent, empty or malformed receipt is not success`) (unit); `FailSafe/extension/src/test/qorlogic/consumer/consumer-adapter.test.ts:67` (`const env = readMetaLedgerArtifact(materialize('supported'));`) (unit).
Installed-extension test: none installs the real 0.176.1 wheel into a real interpreter (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The installer is hardened (trusted interpreter path, `-P`, argv-only, timeout) and, since #463, installs only the hash-pinned 0.176.1 wheel offline after operator approval; the five-state adapter is tested. The open item is conformance: 0.176.1 is the frozen target but the probe has not been re-run against it, so the tested-against version stays 0.169.0.

## Open defects

Fixed in #538: [B274] the scaffold route installed the package without a server-side VS Code confirmation and without a remote-request check (observed outside the LD3 list); it now runs the Console request guard, a rate limit and the dialog `FailSafe/extension/src/roadmap/routes/ActionsRoute.ts:104` (`app.post("/api/actions/scaffold-skills", consoleRequestGuard(`).
The web path reaches the frozen package step through `runPipStep`, which installs only from a selected wheel after a modal confirmation `FailSafe/extension/src/extension/installSkillsHandler.ts:163` (`const pip = await runPipStep(ingestor, cb.onProgress);`).
Conformance of the frozen 0.176.1 consumer is not attested; the tested-against version is 0.169.0 `FailSafe/extension/src/qorlogic/hostLayouts.ts:103` (`TESTED_AGAINST_QOR_LOGIC_VERSION = "0.169.0"`).
