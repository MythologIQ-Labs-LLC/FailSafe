# Aider integration contract

Contract id: `aider` (registry row `integration-contract-aider`). Recorded against main `c36b9ee2`, and updated for #475: on main the governed Aider command is fail-closed and starts no process, because no OS-enforced containment exists and a git worktree is not a process sandbox. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_AIDER_CONTRACT_REVIEW.md`. It made auto-commit suppression on a pinned version the gating item and asked for high-risk diffs to route to L3 before commit; the v6.0.8 wrapper passed `--no-auto-commits` and ran in a disposable worktree, pinned no version, and had no L3 route. On main (#475) the command refuses before running Aider at all.

**Owned files:**
- `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/agent-cli/` (containment flag, isolated run, promotion, process tracking, health), `FailSafe/extension/src/extension/agent-cli-command.ts`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer wants Aider to make a one-shot change from a message, without Aider committing on its own and without the change landing in the working tree until they have reviewed it. On main this job is not served: FailSafe refuses to start Aider until an OS-enforced process boundary exists.

## Measurable value

Metric: the share of governed Aider runs whose changes reached the workspace only through an explicit Apply; the promotion code applies a captured change set only from the operator's Apply choice `FailSafe/extension/src/extension/agent-cli-command.ts:93-95` (`const result: PromotionResult = choice === 'Apply'`).
On main no governed Aider run starts, so the metric has no runs to measure `FailSafe/extension/src/extension/agent-cli-command.ts:179-181` (`if (!AGENT_OS_CONTAINMENT_AVAILABLE) {`).
Baseline: no usage data is collected, so run counts, apply rates and time saved are unverified.

## Why not simply ask an agent

Aider run directly edits the working tree and, by default, commits. In v6.0.8 this wrapper always disabled auto-commit, ran Aider in a throwaway worktree, detected writes to the real repository during the run, and applied only the exact reviewed bytes after re-checking the repository. A worktree does not stop the process writing elsewhere, so on main FailSafe does not run Aider at all rather than present a worktree as containment.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:70` (`Scripting — https://aider.chat/docs/scripting.html`) lists the Aider scripting documentation; the row is still under "Planned (backlog)", which is stale (unverified as to when it was last refreshed beyond its header date).
The flags are `--message`, `--yes-always` and `--no-auto-commits` `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:26-28` (`return ['--message', prompt, '--yes-always', '--no-auto-commits'];`).
The wrapper comment records which upstream sources those flags were checked against `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:8-11` (`Flags verified against https://aider.chat/docs/config/options.html`).

## Privileges and scopes

Credential: FailSafe stores and reads none for Aider; the catalog declares no required keys `FailSafe/extension/src/integrations/catalog/integration-catalog-data.ts:35-36` (`requiredKeys: [],`).
Process privileges: on main no Aider process starts, so none are granted `FailSafe/extension/src/extension/agent-cli-command.ts:179-181` (`No process was started`).
Where a host supplies an OS-enforced runner (only tests do), the child inherits the given environment, or the extension host's, and the user account `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:119-120` (`env: { ...(agent.env ?? process.env), FAILSAFE_ISOLATED_RUN: marker }`).
`--yes-always` would answer every Aider confirmation `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:28` (`'--yes-always'`).
Executable: only an absolute PATH entry outside the workspace, and resolution happens only after the containment check `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:111` (`excludeDirs: [opts.workspaceRoot]`).
No OS-enforced process containment is implemented, and no setting, environment flag or caller can enable it `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:5-7` (`No configuration setting, environmental flag, or caller can enable it.`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| isolated-run | shipped-inert | `runAiderGoverned` `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:47` (`export async function runAiderGoverned(`) | none | `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts` (unit, simulated contained runner) | Absent call site: on main the command returns at the os-containment-gate row before calling the wrapper, and production passes only `run`, never the OS-enforced runner the wrapper requires `FailSafe/extension/src/extension/agent-cli-command.ts:188` (`{ run: defaultAgentRun, classify, issuedAt: new Date().toISOString() }`) |
| os-containment-gate | main-unreleased | `AGENT_OS_CONTAINMENT_AVAILABLE` `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:7` (`export const AGENT_OS_CONTAINMENT_AVAILABLE = false;`) | `FailSafe/extension/src/extension/agent-cli-command.ts:179-181` (`if (!AGENT_OS_CONTAINMENT_AVAILABLE) {`) | `FailSafe/extension/src/test/integrations/agent-cli/agent-os-boundary.test.cjs` (unit) | Refuses before settings, prompt, executable resolution and version probe; the wrapper refuses too without an OS-enforced runner `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:57-59` (`OS-enforced agent containment is unavailable`) |
| quarantine-review | shipped-inert | `handleOutcome` `FailSafe/extension/src/extension/agent-cli-command.ts:109` (`export async function handleOutcome(`) | none | `FailSafe/extension/src/test/extension/agent-cli-command.test.cjs` (unit) | Absent call site: its only Aider caller runs after the containment refusal, so it is not reached on main `FailSafe/extension/src/extension/agent-cli-command.ts:190` (`await handleOutcome(deps, 'aider', out);`). Shared with continue |
| apply-reviewed-change-set | shipped-inert | `applyQuarantined` `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:74` (`export async function applyQuarantined(`) | none | `FailSafe/extension/src/test/integrations/agent-cli/agent-run-promotion.test.ts` (unit) | Absent call site: reached only from the operator's Apply inside `handleOutcome`, which is not reached on main `FailSafe/extension/src/extension/agent-cli-command.ts:94` (`await (deps.apply ?? applyQuarantined)(cs)`). Shared with continue |
| l3-approval-for-high-risk-runs | proposed | none | none | none | The legacy review asked for it; the Apply modal shows the risk grade only `FailSafe/extension/src/extension/agent-cli-command.ts:74` (`risk ${risk ?? 'L1'}) are held in quarantine`) |
| version-pin | proposed | none | none | none | Detection parses any version but enforces none `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:118-120` (`return { available: true, version: m ? m[0] : undefined };`) |
| process-sandbox | proposed | none | none | none | Not implemented; a worktree is not a sandbox `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:2-3` (`A Git worktree is NOT an OS sandbox.`) |

## Inbound fields

From the operator: nothing on main; the command refuses before it asks for a message `FailSafe/extension/src/extension/agent-cli-command.ts:179-184` (`Message for Aider (one-shot)`).
From settings: the enable, write-authorization and timeout settings are read only after the containment refusal, so on main they are not consulted `FailSafe/extension/src/extension/agent-cli-command.ts:183-187` (`integrations.aider.allowWrites`).
From the agent, only where an OS-enforced runner is supplied: its exit code and stdout, and the files it changed in the worktree, captured as a binary diff against the base commit `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:152-155` (`'diff', '--cached', ...PINNED_DIFF, prep.baseHead`).
From detection: none on main; the `aider --version` probe runs only through the OS-enforced runner `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:57-61` (`detectAider(sandboxRun,`), from the OS temp directory `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:115` (`await run(name, versionArgs, { cwd: os.tmpdir() })`).

## Outbound fields and egress

Repository content: none on main, because no Aider process starts `FailSafe/extension/src/extension/agent-cli-command.ts:179-181` (`No process was started`).
With an OS-enforced runner (tests only), the Aider process would read the worktree, a full checkout of HEAD `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:97` (`'worktree', 'add', '--detach', dir, prep.baseHead`).
FailSafe itself makes no network call for this integration; where a running Aider would send the message and file contents is decided by Aider and its model configuration (unverified; outside FailSafe's control and not observed).
Metadata: the message would travel only as argv to the local process `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:154-155` (`shell: false, windowsHide: true`).
Graph relationships: no `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:4-5` (`nothing here writes the workspace`).
Governance evidence: no; the receipt and ledger entries stay local `FailSafe/extension/src/extension/agent-cli-command.ts:86` (`eventType: 'QUARANTINE_START'`).
Consent: `failsafe.integrations.aider.enabled` and `failsafe.integrations.aider.allowWrites` do not enable execution on main; the containment refusal comes first `FailSafe/extension/src/integrations/catalog/integration-catalog-data.ts:38` (`Enabling Aider does not enable CLI execution.`), and the wrapper still requires write authorization before its containment check `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:51-52` (`running Aider requires`).

## Transformations

The run's risk grade is the maximum of the policy engine's grade for each touched path, L1 when none `FailSafe/extension/src/integrations/agent-cli/agent-run-outcome.ts:27-32` (`for (const p of summary.paths) grade = maxRisk(grade, classify(p));`).
The change set is validated for paths and modes that are never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:159-160` (`the change set contains paths or modes that are never promoted`).
A receipt is built from argv, status, risk, exit code and diff summary, never the environment `FailSafe/extension/src/integrations/agent-cli/agent-run-outcome.ts:49-51` (`The receipt`).
The wrapper's own refusal without an OS-enforced runner is a BLOCKED_PRE_EXECUTION outcome graded L3 `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:58-59` (`external CLI execution is disabled', 'L3'`).

## Persisted artifacts

On main a refused command persists nothing: it returns before the wrapper, the ledger and health recording `FailSafe/extension/src/extension/agent-cli-command.ts:179-182` (`if (!AGENT_OS_CONTAINMENT_AVAILABLE) {`).
Only after a run that actually started: a QUARANTINE_START and a QUARANTINE_END entry in the FailSafe ledger, carrying the receipt, risk grade and patch hash `FailSafe/extension/src/extension/agent-cli-command.ts:84-86` (`artifactHash: cs.patchSha256`).
The ledger is the `soa_ledger` table `FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts:168` (`CREATE TABLE IF NOT EXISTS soa_ledger`).
A write-only audit copy under the extension's global storage `agent-runs` folder, newest 20 kept `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:95-99` (`fs.writeFileSync(path.join(dir, 'change-set.patch'), cs.patch);`).
Health evidence of the last run in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`); the catalog ignores any stored Aider health while containment is absent `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:130` (`const lastResult = containmentBlocked ? undefined`).
On Apply, the working tree receives exactly the reviewed bytes; nothing is committed `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:80` (`git.tryRun(cs.root, ['apply', '-'], { input: cs.patch })`).

## Graph links

Implemented, not reached on main: the receipt and ledger entries name the base commit and the patch hash, linking a run to the commit it started from `FailSafe/extension/src/integrations/agent-cli/agent-run-outcome.ts:79-80` (`patchSha256: input.patchSha256,`).
Implemented, not reached on main: the ledger entries carry the agent DID `did:failsafe:agent:aider` `FailSafe/extension/src/extension/agent-cli-command.ts:58` (`did:failsafe:agent:${agent}`).
Proposed (not built): run-to-intent and run-to-receipt edges in the relationship graph of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Run Aider (governed)" `FailSafe/extension/package.json:200-201` (`"title": "FailSafe: Run Aider (governed)"`).
Refusal: a warning that agent execution is unavailable and no process was started `FailSafe/extension/src/extension/agent-cli-command.ts:180` (`Agent execution unavailable: FailSafe cannot prove OS-level containment for this CLI.`).
Not reached on main: the progress notification, the Discard, Review diff and Apply modal stating the isolation boundary, and the diff review `FailSafe/extension/src/extension/agent-cli-command.ts:74-75` (`detail: BOUNDARY_NOTE`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`), which shows Aider disabled whatever its settings say `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:127-128` (`const enabled = !containmentBlocked`), with a summary that CLI execution is unavailable `FailSafe/extension/src/integrations/catalog/integration-catalog-data.ts:34` (`Aider CLI execution is unavailable until verified OS process containment is installed.`).

## Governance policy and enforceability limits

Enforced: on main the command refuses before reading settings, prompting or resolving any executable, because `AGENT_OS_CONTAINMENT_AVAILABLE` is the constant false `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:7` (`export const AGENT_OS_CONTAINMENT_AVAILABLE = false;`).
Enforced: the wrapper also refuses before any executable resolution or `--version` probe unless the host supplies an OS-enforced runner, and production supplies none `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:54-59` (`Never resolve or execute`).
Enforced: settings and stale health receipts cannot re-enable Aider in the catalog `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:124-127` (`a legacy successful CLI receipt must not resurrect`).
Not claimed: containment; a git worktree is not a process sandbox `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:2-3` (`A Git worktree is NOT an OS sandbox.`).
The remaining guards belong to the isolated-run path, which production does not reach `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:55-56` (`Absent in production until audited.`).
Enforced in that path: nothing starts without the write authorization setting `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:51-52` (`if (!opts.writesAllowed) {`).
Enforced in that path: auto-commit is always disabled in argv `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:26` (`Auto-commit is always off`).
Enforced in that path: a dirty work tree, or skip-worktree flags, block the run `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:80-86` (`the work tree has uncommitted or untracked files`).
Enforced in that path: Apply refuses when the hash, HEAD or the repository snapshot changed since the run `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:46-54` (`HEAD moved from`).
Observed, not prevented, in that path: writes to the real repository during the run are detected afterwards and never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:141` (`the repository changed outside the isolated worktree during the run`).
Not observed in that path: writes outside the repository or inside ignored directories, and processes that escape tracking `FailSafe/extension/src/extension/agent-cli-command.ts:47-49` (`Writes outside the repository or inside ignored directories are not detected`).
Advisory in that path: unlike Continue there is no tool allowlist, so Aider's own shell commands are not refused before the run; the risk grade is displayed but any grade can be applied `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:46-47` (`refuse without authorization, else run isolated and quarantine`).

## Failure, offline, stale and permission semantics

On main every invocation ends at the containment refusal with a warning; no process starts, no health is recorded and no ledger entry is written `FailSafe/extension/src/extension/agent-cli-command.ts:179-182` (`No process was started`).
In the isolated-run path, which production does not reach: `aider` not found, or `aider --version` failing, is unavailable and recorded as failing / not_installed `FailSafe/extension/src/integrations/agent-cli/agent-cli-health.ts:10-12` (`if (!out.available) return ['failing', 'not_installed'];`).
A run past the timeout (default 900000 ms) is stopped and nothing is promotable `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:148` (`the agent did not finish within`).
A non-zero exit is FAILED_INCONCLUSIVE `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:149` (`the agent exited with code`).
A repository change during the run is recorded as an EXTERNAL_DRIFT ledger entry `FailSafe/extension/src/extension/agent-cli-command.ts:123-124` (`eventType: 'EXTERNAL_DRIFT'`).
Process tracking that cannot start blocks the run before the agent starts `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:188-189` (`process tracking is unavailable, so the agent is not started`).
Offline: FailSafe does not check connectivity; an Aider run that failed for lack of network would surface as its exit code (unverified).
Stale: a change set is held only within the invocation; nothing promotable outlives it `FailSafe/extension/src/extension/agent-cli-command.ts:9-10` (`Nothing promotable`).
Stale health: a successful health receipt from an earlier release does not make the catalog report Aider available `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:130-136` (`const lastResult = containmentBlocked ? undefined`).

## End-to-end scenario and measurable acceptance

Scenario on main: with Aider enabled and write authorization on, run the command and see the warning that agent execution is unavailable; no prompt appears, no executable is resolved or probed and no process starts `FailSafe/extension/src/extension/agent-cli-command.ts:179-182` (`No process was started`).
Metric: zero processes started, zero version probes and zero executable resolutions for an authorized run without an OS-enforced runner (threshold: zero) `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:89` (`authorized runs without OS containment refuse before ANY probe or resolver`).
Existing test: the refusal precedes the prompt and cannot be toggled by configuration `FailSafe/extension/src/test/integrations/agent-cli/agent-os-boundary.test.cjs:35` (`production containment cannot be toggled by workspace configuration`) (unit, node, structural).
Existing test: the worktree quarantine path is still exercised with a simulated contained runner, not a real sandbox `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:122` (`Aider: argv always has --no-auto-commits; spawn cwd is the worktree; change quarantined`) (unit, a scripted runner instead of the real `aider`).
Installed-extension test: none runs the real `aider` binary or installs the packaged VSIX for this flow (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. Auto-commit suppression and worktree isolation were built and unit-tested; the legacy review's gating item is handled in argv. Since #475 the command is fail-closed on main because no OS-enforced containment exists; running Aider again needs an independently qualified contained runner, and the remaining gaps (a pinned-version test against the real CLI, an L3 route, and the absence of any pre-run tool restriction because Aider has no allowlist) stay completion items. A worktree is not a sandbox and is not presented as one.

## Open defects

`[B227]` git-safety copies `filter.lfs.*` and `safe.directory` without `--global` into the agent run's config `docs/BACKLOG.md:583` (`into the agent run's private config`).
No other open B-item is specific to Aider on main (unverified: searched `docs/BACKLOG.md` for "Aider" at c36b9ee2).
The documentation index row is stale (still "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:70` (`#107 (Group B)`).
