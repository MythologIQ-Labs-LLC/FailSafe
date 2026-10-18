# Continue integration contract

Contract id: `continue` (registry row `integration-contract-continue`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_CONTINUE_CONTRACT_REVIEW.md`. It planned a read-only or no-tool profile first, a pinned CLI version and parsing of `--format json` output; the shipped wrapper runs write-capable tool sets in a disposable worktree, pins no version and does not request or parse JSON output.

**Owned files:**
- `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/agent-cli/` (isolated run, promotion, process tracking, health), `FailSafe/extension/src/extension/agent-cli-command.ts`, `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer wants a headless Continue agent to make a change in the repository, but wants to see and approve the change before any of it lands in the working tree, and wants a record of what ran.

## Measurable value

Metric: the share of governed Continue runs whose changes reached the workspace only through an explicit Apply; on main a captured change set is applied only from the operator's Apply choice `FailSafe/extension/src/extension/agent-cli-command.ts:93-95` (`const result: PromotionResult = choice === 'Apply'`).
Baseline: no usage data is collected, so run counts, apply rates and time saved are unverified.

## Why not simply ask an agent

An agent asked to "be careful" still writes straight into the working tree. This wrapper runs Continue in a throwaway git worktree, refuses shell-capable allowlists before starting it, detects writes to the real repository during the run, and applies only the exact reviewed bytes after re-checking the repository.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:69` (`Headless mode — https://docs.continue.dev/cli/headless-mode`) lists the Continue headless-mode documentation; the row is still under "Planned (backlog)", which is stale (unverified as to when it was last refreshed beyond its header date).
The wrapper uses `cn -p <prompt>` and repeated `--allow <tool>` `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:38-41` (`const args = ['-p', prompt];`).

## Privileges and scopes

Credential: an optional Continue API key from VS Code Secret Storage; with none, Continue's own login is used `FailSafe/extension/src/extension/agent-cli-command.ts:149-152` (`No key at all is fine (Continue may use its own login)`).
The key is placed only in the child environment as `CONTINUE_API_KEY`, never in argv or the receipt `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:86-87` (`API key in the child ENV only (never argv/receipt).`).
The plain-text key setting is deprecated and not read `FailSafe/extension/package.json:521-523` (`Plain-text settings are no longer read`).
Process privileges: the child inherits the extension host's environment and user account `FailSafe/extension/src/extension/agent-cli-command.ts:157` (`baseEnv: process.env`).
Tool scope: whatever `failsafe.integrations.continue.allow` grants, except shell or exec tools, which are refused `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:82-83` (`the allowlist grants shell/exec tools`).
Executable: only an absolute PATH entry outside the workspace; on Windows only `.exe` or `.com` `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:84-86` (`for (const file of win ? [`).
A process sandbox, or any OS-level confinement of the agent, would need new privileges and is marked requires separate approval (unverified: none is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| isolated-run | verified-shipped | `runContinueGoverned` `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:73` (`export async function runContinueGoverned(`) | `FailSafe/extension/src/extension/agent-cli-command.ts:146` (`registerCommand('failsafe.continue.run'`) | `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts` (unit) | The test uses a scripted agent runner and a real temporary git repository `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:88-89` (`spawn cwd is a disposable worktree, never the workspace`) |
| quarantine-review | verified-shipped | `handleOutcome` `FailSafe/extension/src/extension/agent-cli-command.ts:109` (`export async function handleOutcome(`) | `FailSafe/extension/src/extension/main.ts:275` (`registerAgentCliCommands(context, {`) | `FailSafe/extension/src/test/extension/agent-cli-command.test.cjs` (unit) | Discard, Review diff or Apply in one modal `FailSafe/extension/src/extension/agent-cli-command.ts:75` (`'Discard', 'Review diff', 'Apply'`) |
| apply-reviewed-change-set | verified-shipped | `applyQuarantined` `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:74` (`export async function applyQuarantined(`) | `FailSafe/extension/src/extension/agent-cli-command.ts:94` (`await (deps.apply ?? applyQuarantined)(cs)`) | `FailSafe/extension/src/test/integrations/agent-cli/agent-run-promotion.test.ts` (unit) | Shared with aider |
| l3-approval-for-high-risk-runs | proposed | none | none | none | The risk grade is shown in the Apply modal but no L3 approval is queued `FailSafe/extension/src/extension/agent-cli-command.ts:74` (`risk ${risk ?? 'L1'}) are held in quarantine`) |
| json-output-evidence | proposed | none | none | none | The argv carries no `--format json`; stdout is kept as text (unverified beyond `buildContinueArgs`) |
| process-sandbox | proposed | none | none | none | Not a sandbox `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:11-13` (`A worktree is not a process sandbox.`) |

## Inbound fields

From the operator: a prompt typed into an input box `FailSafe/extension/src/extension/agent-cli-command.ts:153` (`Prompt for the Continue headless agent`).
From settings: the tool allowlist, the write authorization and the run timeout `FailSafe/extension/src/extension/agent-cli-command.ts:158-160` (`integrations.continue.allowWrites`).
From the agent: its exit code and stdout, and the files it changed in the worktree, captured as a binary diff against the base commit `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:152-155` (`'diff', '--cached', ...PINNED_DIFF, prep.baseHead`).
From detection: the `cn --version` output, run from the OS temp directory `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:122` (`await run(name, versionArgs, { cwd: os.tmpdir() })`).

## Outbound fields and egress

Repository content: yes, indirectly; the Continue process FailSafe starts reads the worktree, a full checkout of HEAD `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:97` (`'worktree', 'add', '--detach', dir, prep.baseHead`).
FailSafe itself makes no network call for this integration; where Continue sends the prompt and file contents is decided by Continue and its model configuration (unverified; outside FailSafe's control and not observed).
Metadata: the prompt and allowlist travel only as argv to the local process `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:276-277` (`shell: false, windowsHide: true`).
Graph relationships: no `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:4-5` (`nothing here writes the workspace`).
Governance evidence: no; the receipt and ledger entries stay local `FailSafe/extension/src/extension/agent-cli-command.ts:86` (`eventType: 'QUARANTINE_START'`).
Consent: the run needs `failsafe.integrations.continue.enabled` and `failsafe.integrations.continue.allowWrites` `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:79-80` (`running Continue requires`).

## Transformations

The allowlist is mapped to a risk tier: shell or exec tools L3, write tools L2, otherwise L1 `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:25-27` (`shell/exec → L3, file-write → L2`).
The run's risk grade is the maximum of the allowlist tier and the policy engine's grade for each touched path `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:230` (`maxRisk(ctx.riskFloor ?? 'L1', classifyDiffRisk(r.stats, ctx.classify))`).
The change set is validated for paths and modes that are never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:159-160` (`the change set contains paths or modes that are never promoted`).
A receipt is built from argv, status, risk, exit code and diff summary, never the environment `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:161-163` (`The receipt`).

## Persisted artifacts

A QUARANTINE_START and a QUARANTINE_END entry in the FailSafe ledger, carrying the receipt, risk grade and patch hash `FailSafe/extension/src/extension/agent-cli-command.ts:84-86` (`artifactHash: cs.patchSha256`).
The ledger is the `soa_ledger` table `FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts:127` (`CREATE TABLE IF NOT EXISTS soa_ledger`).
A write-only audit copy (`change-set.patch` and `record.json`) under the extension's global storage `agent-runs` folder `FailSafe/extension/src/extension/main.ts:278` (`auditDir: path.join(context.globalStorageUri.fsPath, "agent-runs")`).
Only the newest 20 audit copies are kept `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:41` (`export const AUDIT_RETENTION = 20;`).
The audit copy is never read back for review or apply `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:13` (`The audit copy on disk is write-only`).
Health evidence of the last run in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).
On Apply, the working tree receives exactly the reviewed bytes; nothing is committed `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:80` (`git.tryRun(cs.root, ['apply', '-'], { input: cs.patch })`).

## Graph links

Implemented: the receipt and ledger entries name the base commit and the patch hash, linking a run to the commit it started from `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:191-192` (`patchSha256: input.patchSha256,`).
Implemented: the ledger entries carry the agent DID `did:failsafe:agent:continue` `FailSafe/extension/src/extension/agent-cli-command.ts:58` (`did:failsafe:agent:${agent}`).
Proposed (not built): run-to-intent and run-to-receipt edges in the relationship graph of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Run Continue (governed)" `FailSafe/extension/package.json:191-192` (`"title": "FailSafe: Run Continue (governed)"`).
Progress: a notification while the run is in progress `FailSafe/extension/src/extension/agent-cli-command.ts:155` (`Running Continue in an isolated worktree`).
Decision: a modal with Discard, Review diff and Apply, stating the isolation boundary `FailSafe/extension/src/extension/agent-cli-command.ts:74-75` (`detail: BOUNDARY_NOTE`).
Review: a read-only diff document served from memory `FailSafe/extension/src/extension/agent-cli-command.ts:66-69` (`setTextDocumentLanguage(doc, 'diff')`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: nothing starts without the write authorization setting `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:79-80` (`if (!opts.writesAllowed) {`).
Enforced: an allowlist granting shell or exec tools is refused before spawning `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:82-83` (`if (allowlistRisk === 'L3') {`).
Enforced: a dirty work tree, or skip-worktree flags, block the run `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:80-86` (`the work tree has uncommitted or untracked files`).
Enforced: Apply refuses when the hash, HEAD or the repository snapshot changed since the run `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:46-54` (`HEAD moved from`).
Observed, not prevented: writes the agent makes to the real repository during the run are detected afterwards and never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:141` (`the repository changed outside the isolated worktree during the run`).
Not observed: writes outside the repository or inside ignored directories, and processes that escape tracking `FailSafe/extension/src/extension/agent-cli-command.ts:47-49` (`Writes outside the repository or inside ignored directories are not detected`).
Advisory: the risk grade is displayed but any grade can be applied `FailSafe/extension/src/extension/agent-cli-command.ts:73-76` (`anything but an explicit Apply is a discard`).

## Failure, offline, stale and permission semantics

`cn` not found, or `cn --version` failing, is unavailable and recorded as failing / not_installed `FailSafe/extension/src/integrations/agent-cli/agent-cli-health.ts:10-12` (`if (!out.available) return ['failing', 'not_installed'];`).
On Windows the npm `cn.cmd` shim is reported unavailable `FailSafe/extension/src/integrations/agent-cli/continue-wrapper.ts:44-45` (`the npm shim cn.cmd cannot run without a shell`).
A run past the timeout (default 900000 ms) is stopped and nothing is promotable `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:148` (`the agent did not finish within`).
A non-zero exit is FAILED_INCONCLUSIVE `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:149` (`the agent exited with code`).
A repository change during the run is recorded as an EXTERNAL_DRIFT ledger entry `FailSafe/extension/src/extension/agent-cli-command.ts:123-124` (`eventType: 'EXTERNAL_DRIFT'`).
Process tracking that cannot start blocks the run before the agent starts `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:188-189` (`process tracking is unavailable, so the agent is not started`).
A plain-text or unreadable credential stops the command before it prompts `FailSafe/extension/src/extension/agent-cli-command.ts:151-152` (`if (!key.ok) return;`).
Offline: FailSafe does not check connectivity; a Continue run that fails for lack of network surfaces as its exit code (unverified).
Stale: a change set is held only within the invocation; nothing promotable outlives it `FailSafe/extension/src/extension/agent-cli-command.ts:9-10` (`Nothing promotable`).

## End-to-end scenario and measurable acceptance

Scenario: on a clean repository, enable Continue and write authorization, run the command with a prompt, see the modal list the changed files and risk, review the diff, Apply, and find exactly the reviewed bytes in the working tree with a QUARANTINE_END entry `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:86` (`applied ${cs.stats.files} file(s) exactly as reviewed`).
Metric: zero bytes reach the workspace before Apply, and after Apply the re-derived diff equals the reviewed patch (threshold: byte equality, else APPLY_MISMATCH) `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:82-84` (`if (!after.equals(cs.patch)) {`).
Existing test: `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:98-100` (`workspace bytes unchanged`) (unit, a scripted runner instead of the real `cn`).
Existing test: the command layer's Discard, Review diff and Apply paths `FailSafe/extension/src/test/extension/agent-cli-command.test.cjs:91` (`asks with a modal whose buttons are Discard, Review diff, Apply`) (unit, node).
Installed-extension test: none runs the real `cn` binary or installs the packaged VSIX for this flow (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The worktree isolation, pre-spawn refusals and exact-bytes promotion are built and unit-tested with honest boundary text; what is missing is evidence against the real `cn` binary on a pinned version and an L3 route for high-risk change sets, both of which are completion work rather than repair. It is not a sandbox and should not be presented as one.

## Open defects

`[B227]` git-safety copies `filter.lfs.*` and `safe.directory` without `--global` into the agent run's config `docs/BACKLOG.md:583` (`into the agent run's private config`).
No other open B-item is specific to Continue on main (unverified: searched `docs/BACKLOG.md` for "Continue" at c36b9ee2).
The documentation index row is stale (still "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:69` (`#104 (Group B)`).
