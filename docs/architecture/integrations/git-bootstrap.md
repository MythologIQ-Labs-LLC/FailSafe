# Git bootstrap integration contract

Contract id: `git-bootstrap` (registry row `integration-contract-git-bootstrap`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

No legacy contract review exists for this integration.

**Owned files:**
- `FailSafe/extension/src/shared/gitBootstrap.ts`

Shared modules it uses (not owned here): `FailSafe/extension/src/extension/bootstrapCore.ts` (activation wiring and the init prompt), `FailSafe/extension/src/shared/exec/trustedExecutable.ts`, `FailSafe/extension/src/shared/git/trustedGit.ts`.

## Customer job

A developer opens a folder where Git is missing or the folder is not a repository and wants FailSafe's checkpoints to record Git hashes, without FailSafe installing system software or creating a repository unless they chose that.

## Measurable value

Metric: no `git init` runs without a confirmation callback, and no package-manager install runs unless the user-level setting is on `FailSafe/extension/src/shared/gitBootstrap.ts:58` (`if (!gitAvailable && autoInstallGit) {`).
Baseline: how many activations find Git missing is not recorded (unverified).

## Why not simply ask an agent

An agent asked to "make sure Git works" may run an installer from whatever `winget` or `apt-get` is first on PATH, inside the workspace. This path resolves each installer from its known locations only, ignores a workspace's attempt to turn the install on, and never initializes a repository on activation.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for the operating-system package managers (unverified: searched the index for "winget" at c36b9ee2).
The install commands are fixed argv lists per platform `FailSafe/extension/src/shared/gitBootstrap.ts:111-141` (`function getInstallCandidates(`).

## Privileges and scopes

Credential: none passed by FailSafe; the package manager runs with the user's own rights (unverified: `apt-get`, `dnf`, `yum` and `pacman` normally need root and fail without it) `FailSafe/extension/src/shared/gitBootstrap.ts:136-141` (`{ command: "apt-get", args: ["install", "-y", "git"] },`).
Scope: a system-wide Git install, enabled only by a user-level `true`; workspace and folder values are ignored `FailSafe/extension/src/shared/gitBootstrap.ts:32-35` (`return inspected?.globalValue === true;`).
The setting is machine-scoped and off by default `FailSafe/extension/package.json:734-738` (`"failsafe.bootstrap.autoInstallGit": {`).
Each installer and Git are spawned from the trusted resolver's absolute path, argv only, no shell `FailSafe/extension/src/shared/gitBootstrap.ts:165-171` (`spawn(trustedExecutablePath(installer, cwd), args, options)`).
A per-install confirmation prompt would be a new consent surface and requires separate approval (unverified: none exists on main).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| git-detection | verified-shipped | `ensureGitRepositoryReady` `FailSafe/extension/src/shared/gitBootstrap.ts:42` (`export async function ensureGitRepositoryReady(`) | `FailSafe/extension/src/extension/bootstrapCore.ts:48` (`const git = await ensureGitRepositoryReady(workspaceRoot, { autoInstallGit, log: gitLog });`) | `FailSafe/extension/src/test/shared/gitBootstrap.test.ts` (unit) | Probe is `git --version` `FailSafe/extension/src/shared/gitBootstrap.ts:90-91` (`return runCommand(runner, "git", ["--version"]);`) |
| package-manager-git-install | verified-shipped | `ensureGitRepositoryReady` `FailSafe/extension/src/shared/gitBootstrap.ts:58-59` (`installedGit = await tryInstallGit(platform, runner, log);`) | `FailSafe/extension/src/extension/bootstrapCore.ts:38-48` (`const autoInstallGit = autoInstallGitEnabled(`) | `FailSafe/extension/src/test/shared/gitBootstrap.test.ts` (unit) | Off by default; opt-in only through user settings `FailSafe/extension/package.json:743-745` (`Off by default.`) |
| user-scope-gate | verified-shipped | `autoInstallGitEnabled` `FailSafe/extension/src/shared/gitBootstrap.ts:33` (`export function autoInstallGitEnabled(`) | `FailSafe/extension/src/extension/bootstrapCore.ts:37-39` (`only a user-level value counts`) | `FailSafe/extension/src/test/shared/exec/autoInstallGitScope.test.cjs` (unit) | Runs against the compiled output `FailSafe/extension/src/test/shared/exec/autoInstallGitScope.test.cjs:5` (`Runs standalone after `) |
| init-requires-confirmation | verified-shipped | `ensureGitRepositoryReady` `FailSafe/extension/src/shared/gitBootstrap.ts:75-76` (`if (!repoInitialized && options.confirmInit && (await options.confirmInit()))`) | `FailSafe/extension/src/extension/bootstrapCore.ts:113` (`const result = await ensureGitRepositoryReady(workspaceRoot, { log, confirmInit: async () => true });`) | `FailSafe/extension/src/test/shared/gitBootstrap.test.ts` (unit) | Activation passes no callback `FailSafe/extension/src/extension/bootstrapCore.ts:47-48` (`activation never initializes a repository on its own.`) |
| ask-first-git-init-prompt | shipped-unverified | `offerGitInit` `FailSafe/extension/src/extension/bootstrapCore.ts:105-109` (`Initialize a Git repository in this folder?`) | `FailSafe/extension/src/extension/main.ts:145` (`const core = await bootstrapCore(context, logger, logSink);`) | none | No test contains `offerGitInit` (unverified: searched `src/test` at c36b9ee2) |
| ask-first-install-prompt | proposed | none | none | none | Not on main: with the setting on, activation installs without a prompt `FailSafe/extension/src/shared/gitBootstrap.ts:58-64` (`if (!gitAvailable && autoInstallGit) {`) |

## Inbound fields

From Git: the exit code of `git --version` and of `git init` only `FailSafe/extension/src/shared/gitBootstrap.ts:144-155` (`return result.code === 0;`).
From a package manager: its exit code only; stdout and stderr are collected but not inspected `FailSafe/extension/src/shared/gitBootstrap.ts:99-106` (`const ok = await runCommand(runner, candidate.command, candidate.args);`).
From settings: the user-level value of `failsafe.bootstrap.autoInstallGit` `FailSafe/extension/src/extension/bootstrapCore.ts:38-40` (`inspect<boolean>("bootstrap.autoInstallGit")`).

## Outbound fields and egress

Repository content: no `FailSafe/extension/src/shared/gitBootstrap.ts:111-141` (`function getInstallCandidates(`).
Metadata: yes, when the setting is on and Git is missing, the package manager downloads Git from its own source (winget pinned to `--source winget`) `FailSafe/extension/src/shared/gitBootstrap.ts:117-127` (`"--source",`).
Graph relationships: no `FailSafe/extension/src/shared/gitBootstrap.ts:25-30` (`export interface GitBootstrapResult {`).
Governance evidence: no; the result is logged only `FailSafe/extension/src/shared/gitBootstrap.ts:103` (`log("info", `).
Consent: the user-level opt-in setting gates the install `FailSafe/extension/src/shared/gitBootstrap.ts:32-35` (`B214: true only for a user-level`); a modal-free information prompt gates `git init` `FailSafe/extension/src/extension/bootstrapCore.ts:101-111` (`"Initialize",`).

## Transformations

Candidates are tried in order and the first success stops the loop: winget then choco on Windows, brew on macOS, apt-get, dnf, yum, pacman elsewhere `FailSafe/extension/src/shared/gitBootstrap.ts:99-106` (`for (const candidate of candidates) {`).
After a successful install the trusted-Git cache is cleared and Git is probed again `FailSafe/extension/src/shared/gitBootstrap.ts:60-63` (`invalidateTrustedGit();`).

## Persisted artifacts

A system-wide Git installation, when the setting is on and an installer succeeds `FailSafe/extension/src/shared/gitBootstrap.ts:58-63` (`installedGit = await tryInstallGit(platform, runner, log);`).
A `.git` directory in the workspace, only after the user picks Initialize `FailSafe/extension/src/extension/bootstrapCore.ts:105-111` (`if (choice !== "Initialize") return;`).
Log lines in the FailSafe logger `FailSafe/extension/src/extension/bootstrapCore.ts:42-46` (`const gitLog = (level:`).

## Graph links

Implemented: none `FailSafe/extension/src/shared/gitBootstrap.ts:25-30` (`gitAvailable: boolean;`).
Proposed (not built): none planned for this integration (unverified).

## Customer UI and actions

Setting: "failsafe.bootstrap.autoInstallGit", user settings only `FailSafe/extension/package.json:743-747` (`Read only from user settings; a workspace cannot turn it on.`).
Prompt: "Initialize a Git repository in this folder?" with Initialize and Not now `FailSafe/extension/src/extension/bootstrapCore.ts:101-105` (`FailSafe records checkpoint hashes with Git.`).
Warning: when Git stays unavailable, a log warning says hashes are recorded as unknown `FailSafe/extension/src/extension/bootstrapCore.ts:50-53` (`Checkpoint git hashes will be recorded as unknown`).

## Governance policy and enforceability limits

Enforced: a workspace or folder setting cannot turn on the system-wide install `FailSafe/extension/src/shared/gitBootstrap.ts:32-35` (`workspace and folder values are ignored`).
Enforced: an installer name outside the fixed set is not spawned `FailSafe/extension/src/shared/gitBootstrap.ts:172-178` (`Unsupported Git bootstrap executable:`).
Enforced: installers are resolved from known locations only `FailSafe/extension/src/shared/gitBootstrap.ts:37-40` (`each resolved from its known locations only (B214)`).
Limit: once the setting is on, the install itself runs unattended with the package manager's silent and auto-accept flags `FailSafe/extension/src/shared/gitBootstrap.ts:125-127` (`"--accept-package-agreements",`).

## Failure, offline, stale and permission semantics

Offline or no rights: every candidate fails, a warning is logged and Git stays unavailable `FailSafe/extension/src/shared/gitBootstrap.ts:107-108` (`Unable to auto-install git with available package managers.`).
A thrown runner error counts as failure, never as success `FailSafe/extension/src/shared/gitBootstrap.ts:150-155` (`} catch {`).
Git unavailable: activation continues and checkpoints record unknown hashes `FailSafe/extension/src/extension/bootstrapCore.ts:50-53` (`if (!git.gitAvailable) {`).
The init offer does not block activation and a failure only logs a warning `FailSafe/extension/src/extension/bootstrapCore.ts:55-57` (`Git initialization offer failed:`).

## End-to-end scenario and measurable acceptance

Scenario: with Git absent and the user setting on, activate FailSafe on Windows and find Git installed through winget and the folder offered for `git init` `FailSafe/extension/src/test/shared/gitBootstrap.test.ts:88-98` (`assert.ok(calls.some((c) => c.command === "winget"));`).
Metric: zero `git init` calls without a confirmation callback (threshold: zero) `FailSafe/extension/src/test/shared/gitBootstrap.test.ts:150` (`never runs git init without a confirmInit callback (#503)`).
Existing tests: `FailSafe/extension/src/test/shared/gitBootstrap.test.ts:33` (`describe("ensureGitRepositoryReady"`) (unit, injected runner); `FailSafe/extension/src/test/shared/exec/autoInstallGitScope.test.cjs:19` (`T10a: the setting declares machine scope`) (unit).
Installed-extension test: none runs a real package-manager install (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The install is opt-in from user settings only, resolved from trusted locations and argv-only, and repository initialization asks first; the remaining question is product policy, whether an opted-in user should still be asked before each system-wide install.

## Open defects

No open B-item is specific to Git bootstrap on main (unverified: searched `docs/BACKLOG.md` for "autoInstallGit" at c36b9ee2; B214 is the closed hardening item).
