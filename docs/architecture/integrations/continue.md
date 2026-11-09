# Continue integration contract

Contract id: `continue` (registry row `integration-contract-continue`). Recorded against main `c36b9ee2`, and updated for #475: on main the governed Continue command is fail-closed and starts no process, because no OS-enforced containment exists and a git worktree is not a process sandbox. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_CONTINUE_CONTRACT_REVIEW.md`. It planned a read-only or no-tool profile first, a pinned CLI version and parsing of `--format json` output; the v6.0.8 wrapper ran write-capable tool sets in a disposable worktree, pinned no version and did not request or parse JSON output. On main (#475) the command refuses before running Continue at all.

**Owned files:**
- `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/agent-cli/` (containment flag, isolated run, promotion, process tracking, health), `FailSafe/extension/src/extension/agent-cli-command.ts`, `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer wants a headless Continue agent to make a change in the repository, but wants to see and approve the change before any of it lands in the working tree, and wants a record of what ran. On main this job is not served: FailSafe refuses to start Continue until an OS-enforced process boundary exists.

## Measurable value

Metric: the share of governed Continue runs whose changes reached the workspace only through an explicit Apply; the promotion code applies a captured change set only from the operator's Apply choice `FailSafe/extension/src/extension/agent-cli-command.ts:93-95` (`const result: PromotionResult = choice === 'Apply'`).
On main no governed Continue run starts, so the metric has no runs to measure `FailSafe/extension/src/extension/agent-cli-command.ts:152-154` (`if (!AGENT_OS_CONTAINMENT_AVAILABLE) {`).
Baseline: no usage data is collected, so run counts, apply rates and time saved are unverified.

## Why not simply ask an agent

An agent asked to "be careful" still writes straight into the working tree. In v6.0.8 this wrapper ran Continue in a throwaway git worktree, refused shell-capable allowlists before starting it, detected writes to the real repository during the run, and applied only the exact reviewed bytes after re-checking the repository. A worktree does not stop the process writing elsewhere, so on main FailSafe does not run Continue at all rather than present a worktree as containment.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:69` (`Headless mode — https://docs.continue.dev/cli/headless-mode`) lists the Continue headless-mode documentation; the row is still under "Planned (backlog)", which is stale (unverified as to when it was last refreshed beyond its header date).
The wrapper uses `cn -p <prompt>` and repeated `--allow <tool>` `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:38-41` (`const args = ['-p', prompt];`).

## Privileges and scopes

Credential: an optional Continue API key from VS Code Secret Storage; with none, Continue's own login would be used `FailSafe/extension/src/extension/agent-cli-command.ts:157-160` (`No key at all is fine (Continue may use its own login)`).
On main the key is never read: the command refuses before the credential lookup `FailSafe/extension/src/extension/agent-cli-command.ts:152-159` (`optionalCredential(deps.creds, 'continue.apiKey', deps.credentialUi)`).
Where a run is started, the key is placed only in the child environment as `CONTINUE_API_KEY`, never in argv or the receipt `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:95-96` (`API key in the child ENV only (never argv/receipt).`).
The plain-text key setting is deprecated and not read `FailSafe/extension/package.json:542-544` (`Plain-text settings are no longer read`).
Process privileges: on main no Continue process starts, so none are granted `FailSafe/extension/src/extension/agent-cli-command.ts:152-154` (`No process was started`).
The code that would start a run passes the extension host's environment as the child's base environment `FailSafe/extension/src/extension/agent-cli-command.ts:165` (`baseEnv: process.env`).
Tool scope: whatever `failsafe.integrations.continue.allow` grants, except shell or exec tools, which are refused `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:81-82` (`the allowlist grants shell/exec tools`).
Executable: only an absolute PATH entry outside the workspace; on Windows only `.exe` or `.com`; resolution happens only after the containment check `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:79-81` (`for (const file of win ? [`).
No OS-enforced process containment is implemented, and no setting, environment flag or caller can enable it `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:5-7` (`No configuration setting, environmental flag, or caller can enable it.`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| isolated-run | shipped-inert | `runContinueGoverned` `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:73` (`export async function runContinueGoverned(`) | none | `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts` (unit, simulated contained runner) | Absent call site: on main the command returns at the os-containment-gate row before calling the wrapper, and production passes only `run`, never the OS-enforced runner the wrapper requires `FailSafe/extension/src/extension/agent-cli-command.ts:170` (`{ run: defaultAgentRun, classify, issuedAt: new Date().toISOString() }`) |
| os-containment-gate | main-unreleased | `AGENT_OS_CONTAINMENT_AVAILABLE` `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:7` (`export const AGENT_OS_CONTAINMENT_AVAILABLE = false;`) | `FailSafe/extension/src/extension/agent-cli-command.ts:152-154` (`if (!AGENT_OS_CONTAINMENT_AVAILABLE) {`) | `FailSafe/extension/src/test/integrations/agent-cli/agent-os-boundary.test.cjs` (unit) | Refuses before settings, credential read, prompt, executable resolution and version probe; the wrapper refuses too without an OS-enforced runner `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:88-90` (`OS-enforced agent containment is unavailable`) |
| quarantine-review | shipped-inert | `handleOutcome` `FailSafe/extension/src/extension/agent-cli-command.ts:109` (`export async function handleOutcome(`) | none | `FailSafe/extension/src/test/extension/agent-cli-command.test.cjs` (unit) | Absent call site: its only Continue caller runs after the containment refusal, so it is not reached on main `FailSafe/extension/src/extension/agent-cli-command.ts:172` (`await handleOutcome(deps, 'continue', out);`). Shared with aider |
| apply-reviewed-change-set | shipped-inert | `applyQuarantined` `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:74` (`export async function applyQuarantined(`) | none | `FailSafe/extension/src/test/integrations/agent-cli/agent-run-promotion.test.ts` (unit) | Absent call site: reached only from the operator's Apply inside `handleOutcome`, which is not reached on main `FailSafe/extension/src/extension/agent-cli-command.ts:94` (`await (deps.apply ?? applyQuarantined)(cs)`). Shared with aider |
| l3-approval-for-high-risk-runs | proposed | none | none | none | The risk grade is shown in the Apply modal but no L3 approval is queued `FailSafe/extension/src/extension/agent-cli-command.ts:74` (`risk ${risk ?? 'L1'}) are held in quarantine`) |
| json-output-evidence | proposed | none | none | none | The argv carries no `--format json`; stdout is kept as text (unverified beyond `buildContinueArgs`) |
| process-sandbox | proposed | none | none | none | Not implemented; a worktree is not a sandbox `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:2-3` (`A Git worktree is NOT an OS sandbox.`) |

## Inbound fields

From the operator: nothing on main; the command refuses before it asks for a prompt `FailSafe/extension/src/extension/agent-cli-command.ts:152-161` (`Prompt for the Continue headless agent`).
From settings: the enable, tool allowlist, write-authorization and timeout settings are read only after the containment refusal, so on main they are not consulted `FailSafe/extension/src/extension/agent-cli-command.ts:165-168` (`integrations.continue.allowWrites`).
From the agent, only where an OS-enforced runner is supplied: its exit code and stdout, and the files it changed in the worktree, captured as a binary diff against the base commit `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:152-155` (`'diff', '--cached', ...PINNED_DIFF, prep.baseHead`).
From detection: none on main; the `cn --version` probe runs only through the OS-enforced runner `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:88-92` (`detectContinue(sandboxRun,`), from the OS temp directory `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:115` (`await run(name, versionArgs, { cwd: os.tmpdir() })`).

## Outbound fields and egress

Repository content: none on main, because no Continue process starts `FailSafe/extension/src/extension/agent-cli-command.ts:152-154` (`No process was started`).
With an OS-enforced runner (tests only), the Continue process would read the worktree, a full checkout of HEAD `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:97` (`'worktree', 'add', '--detach', dir, prep.baseHead`).
FailSafe itself makes no network call for this integration; where a running Continue would send the prompt and file contents is decided by Continue and its model configuration (unverified; outside FailSafe's control and not observed).
Metadata: the prompt and allowlist would travel only as argv to the local process `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:154-155` (`shell: false, windowsHide: true`).
Graph relationships: no `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:4-5` (`nothing here writes the workspace`).
Governance evidence: no; the receipt and ledger entries stay local `FailSafe/extension/src/extension/agent-cli-command.ts:86` (`eventType: 'QUARANTINE_START'`).
Consent: `failsafe.integrations.continue.enabled` and `failsafe.integrations.continue.allowWrites` do not enable execution on main; the containment refusal comes first `FailSafe/extension/src/integrations/catalog/integration-catalog-data.ts:26` (`Enabling Continue does not enable CLI execution.`), and the wrapper still requires write authorization before its containment check `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:78-79` (`running Continue requires`).

## Transformations

The allowlist is mapped to a risk tier: shell or exec tools L3, write tools L2, otherwise L1 `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:25-27` (`shell/exec → L3, file-write → L2`).
The run's risk grade is the maximum of the allowlist tier and the policy engine's grade for each touched path `FailSafe/extension/src/integrations/agent-cli/agent-run-outcome.ts:117` (`maxRisk(ctx.riskFloor ?? 'L1', classifyDiffRisk(r.stats, ctx.classify))`).
The change set is validated for paths and modes that are never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:159-160` (`the change set contains paths or modes that are never promoted`).
A receipt is built from argv, status, risk, exit code and diff summary, never the environment `FailSafe/extension/src/integrations/agent-cli/agent-run-outcome.ts:49-51` (`The receipt`).
The wrapper's own refusal without an OS-enforced runner is a BLOCKED_PRE_EXECUTION outcome graded L3 `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:89-90` (`external CLI execution is disabled', 'L3'`).

## Persisted artifacts

On main a refused command persists nothing: it returns before the wrapper, the ledger and health recording `FailSafe/extension/src/extension/agent-cli-command.ts:152-155` (`if (!AGENT_OS_CONTAINMENT_AVAILABLE) {`).
Only after a run that actually started: a QUARANTINE_START and a QUARANTINE_END entry in the FailSafe ledger, carrying the receipt, risk grade and patch hash `FailSafe/extension/src/extension/agent-cli-command.ts:84-86` (`artifactHash: cs.patchSha256`).
The ledger is the `soa_ledger` table `FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts:168` (`CREATE TABLE IF NOT EXISTS soa_ledger`).
A write-only audit copy (`change-set.patch` and `record.json`) under the extension's global storage `agent-runs` folder `FailSafe/extension/src/extension/main.ts:280` (`auditDir: path.join(context.globalStorageUri.fsPath, "agent-runs")`).
Only the newest 20 audit copies are kept `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:41` (`export const AUDIT_RETENTION = 20;`).
The audit copy is never read back for review or apply `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:13` (`The audit copy on disk is write-only`).
Health evidence of the last run in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`); the catalog ignores any stored Continue health while containment is absent `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:130` (`const lastResult = containmentBlocked ? undefined`).
On Apply, the working tree receives exactly the reviewed bytes; nothing is committed `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:80` (`git.tryRun(cs.root, ['apply', '-'], { input: cs.patch })`).

## Graph links

Implemented, not reached on main: the receipt and ledger entries name the base commit and the patch hash, linking a run to the commit it started from `FailSafe/extension/src/integrations/agent-cli/agent-run-outcome.ts:79-80` (`patchSha256: input.patchSha256,`).
Implemented, not reached on main: the ledger entries carry the agent DID `did:failsafe:agent:continue` `FailSafe/extension/src/extension/agent-cli-command.ts:58` (`did:failsafe:agent:${agent}`).
Proposed (not built): run-to-intent and run-to-receipt edges in the relationship graph of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Run Continue (governed)" `FailSafe/extension/package.json:195-196` (`"title": "FailSafe: Run Continue (governed)"`).
Refusal: a warning that agent execution is unavailable and no process was started `FailSafe/extension/src/extension/agent-cli-command.ts:153` (`Agent execution unavailable: FailSafe cannot prove OS-level containment for this CLI.`).
Not reached on main: the progress notification, the Discard, Review diff and Apply modal stating the isolation boundary, and the diff review `FailSafe/extension/src/extension/agent-cli-command.ts:74-75` (`detail: BOUNDARY_NOTE`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`), which shows Continue disabled whatever its settings say `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:127-128` (`const enabled = !containmentBlocked`), with a summary that CLI execution is unavailable `FailSafe/extension/src/integrations/catalog/integration-catalog-data.ts:21` (`Continue CLI execution is unavailable until verified OS process containment is installed.`).

## Governance policy and enforceability limits

Enforced: on main the command refuses before reading settings or credentials, prompting or resolving any executable, because `AGENT_OS_CONTAINMENT_AVAILABLE` is the constant false `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:7` (`export const AGENT_OS_CONTAINMENT_AVAILABLE = false;`).
Enforced: the wrapper also refuses before any executable resolution or `--version` probe unless the host supplies an OS-enforced runner, and production supplies none `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:85-90` (`Never resolve or execute`).
Enforced: settings and stale health receipts cannot re-enable Continue in the catalog `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:124-127` (`a legacy successful CLI receipt must not resurrect`).
Not claimed: containment; a git worktree is not a process sandbox `FailSafe/extension/src/integrations/agent-cli/agent-containment.ts:2-3` (`A Git worktree is NOT an OS sandbox.`).
The remaining guards belong to the isolated-run path, which production does not reach `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:55-56` (`Absent in production until audited.`).
Enforced in that path: nothing starts without the write authorization setting `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:78-79` (`if (!opts.writesAllowed) {`).
Enforced in that path: an allowlist granting shell or exec tools is refused before spawning `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:81-82` (`if (allowlistRisk === 'L3') {`).
Enforced in that path: a dirty work tree, or skip-worktree flags, block the run `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:80-86` (`the work tree has uncommitted or untracked files`).
Enforced in that path: Apply refuses when the hash, HEAD or the repository snapshot changed since the run `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:46-54` (`HEAD moved from`).
Observed, not prevented, in that path: writes the agent makes to the real repository during the run are detected afterwards and never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:141` (`the repository changed outside the isolated worktree during the run`).
Not observed in that path: writes outside the repository or inside ignored directories, and processes that escape tracking `FailSafe/extension/src/extension/agent-cli-command.ts:47-49` (`Writes outside the repository or inside ignored directories are not detected`).
Advisory in that path: the risk grade is displayed but any grade can be applied `FailSafe/extension/src/extension/agent-cli-command.ts:73-76` (`anything but an explicit Apply is a discard`).

## Failure, offline, stale and permission semantics

On main every invocation ends at the containment refusal with a warning; no process starts, no credential is read, no health is recorded and no ledger entry is written `FailSafe/extension/src/extension/agent-cli-command.ts:152-155` (`No process was started`).
In the isolated-run path, which production does not reach: `cn` not found, or `cn --version` failing, is unavailable and recorded as failing / not_installed `FailSafe/extension/src/integrations/agent-cli/agent-cli-health.ts:10-12` (`if (!out.available) return ['failing', 'not_installed'];`).
On Windows the npm `cn.cmd` shim is reported unavailable `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:44-45` (`the npm shim cn.cmd cannot run without a shell`).
A run past the timeout (default 900000 ms) is stopped and nothing is promotable `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:148` (`the agent did not finish within`).
A non-zero exit is FAILED_INCONCLUSIVE `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:149` (`the agent exited with code`).
A repository change during the run is recorded as an EXTERNAL_DRIFT ledger entry `FailSafe/extension/src/extension/agent-cli-command.ts:123-124` (`eventType: 'EXTERNAL_DRIFT'`).
Process tracking that cannot start blocks the run before the agent starts `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:188-189` (`process tracking is unavailable, so the agent is not started`).
A plain-text or unreadable credential would stop the command before it prompts; on main the containment refusal comes earlier still `FailSafe/extension/src/extension/agent-cli-command.ts:159-160` (`if (!key.ok) return;`).
Offline: FailSafe does not check connectivity; a Continue run that failed for lack of network would surface as its exit code (unverified).
Stale: a change set is held only within the invocation; nothing promotable outlives it `FailSafe/extension/src/extension/agent-cli-command.ts:9-10` (`Nothing promotable`).
Stale health: a successful health receipt from an earlier release does not make the catalog report Continue available `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:130-136` (`const lastResult = containmentBlocked ? undefined`).

## End-to-end scenario and measurable acceptance

Scenario on main: with Continue enabled and write authorization on, run the command and see the warning that agent execution is unavailable; no credential is read, no prompt appears, no executable is resolved or probed and no process starts `FailSafe/extension/src/extension/agent-cli-command.ts:152-155` (`No process was started`).
Metric: zero processes started, zero version probes and zero executable resolutions for an authorized run without an OS-enforced runner (threshold: zero) `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:89` (`authorized runs without OS containment refuse before ANY probe or resolver`).
Existing test: the refusal precedes the prompt and the credential read and cannot be toggled by configuration `FailSafe/extension/src/test/integrations/agent-cli/agent-os-boundary.test.cjs:50-51` (`must refuse before credentials are read`) (unit, node, structural).
Existing test: the worktree quarantine path is still exercised with a simulated contained runner, not a real sandbox `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:118-120` (`workspace bytes unchanged`) (unit, a scripted runner instead of the real `cn`).
Existing test: the command layer's Discard, Review diff and Apply paths, reachable on main only from tests `FailSafe/extension/src/test/extension/agent-cli-command.test.cjs:91` (`asks with a modal whose buttons are Discard, Review diff, Apply`) (unit, node).
Installed-extension test: none runs the real `cn` binary or installs the packaged VSIX for this flow (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The worktree isolation, pre-spawn refusals and exact-bytes promotion were built and unit-tested with honest boundary text. Since #475 the command is fail-closed on main because no OS-enforced containment exists; running Continue again needs an independently qualified contained runner, and evidence against the real `cn` binary on a pinned version and an L3 route for high-risk change sets stay completion work. It is not a sandbox and is not presented as one.

## Open defects

`[B227]` git-safety copies `filter.lfs.*` and `safe.directory` without `--global` into the agent run's config `docs/BACKLOG.md:583` (`into the agent run's private config`).
No other open B-item is specific to Continue on main (unverified: searched `docs/BACKLOG.md` for "Continue" at c36b9ee2).
The documentation index row is stale (still "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:69` (`#104 (Group B)`).
