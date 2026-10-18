# Aider integration contract

Contract id: `aider` (registry row `integration-contract-aider`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_AIDER_CONTRACT_REVIEW.md`. It made auto-commit suppression on a pinned version the gating item and asked for high-risk diffs to route to L3 before commit; the shipped wrapper passes `--no-auto-commits` and runs in a disposable worktree, pins no version, and has no L3 route.

**Owned files:**
- `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/agent-cli/` (isolated run, promotion, process tracking, health), `FailSafe/extension/src/extension/agent-cli-command.ts`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer wants Aider to make a one-shot change from a message, without Aider committing on its own and without the change landing in the working tree until they have reviewed it.

## Measurable value

Metric: the share of governed Aider runs whose changes reached the workspace only through an explicit Apply; on main a captured change set is applied only from the operator's Apply choice `FailSafe/extension/src/extension/agent-cli-command.ts:93-95` (`const result: PromotionResult = choice === 'Apply'`).
Baseline: no usage data is collected, so run counts, apply rates and time saved are unverified.

## Why not simply ask an agent

Aider run directly edits the working tree and, by default, commits. This wrapper always disables auto-commit, runs Aider in a throwaway worktree, detects writes to the real repository during the run, and applies only the exact reviewed bytes after re-checking the repository.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:70` (`Scripting — https://aider.chat/docs/scripting.html`) lists the Aider scripting documentation; the row is still under "Planned (backlog)", which is stale (unverified as to when it was last refreshed beyond its header date).
The flags are `--message`, `--yes-always` and `--no-auto-commits` `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:26-28` (`return ['--message', prompt, '--yes-always', '--no-auto-commits'];`).
The wrapper comment records which upstream sources those flags were checked against `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:8-11` (`Flags verified against https://aider.chat/docs/config/options.html`).

## Privileges and scopes

Credential: FailSafe stores none for Aider; Aider uses the model credentials already in the environment `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:120` (`uses your ambient model credentials`).
Process privileges: with no explicit environment the child inherits the extension host's environment and user account `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:119-120` (`env: { ...(agent.env ?? process.env), FAILSAFE_ISOLATED_RUN: marker }`).
`--yes-always` answers every Aider confirmation, so Aider does not stop to ask inside the worktree `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:28` (`'--yes-always'`).
Executable: only an absolute PATH entry outside the workspace `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:118` (`excludeDirs: [opts.workspaceRoot]`).
A process sandbox would need new privileges and is marked requires separate approval (unverified: none is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| isolated-run | verified-shipped | `runAiderGoverned` `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:47` (`export async function runAiderGoverned(`) | `FailSafe/extension/src/extension/agent-cli-command.ts:167` (`registerCommand('failsafe.aider.run'`) | `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts` (unit) | Auto-commit is always off `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:104` (`argv always has --no-auto-commits`) |
| quarantine-review | verified-shipped | `handleOutcome` `FailSafe/extension/src/extension/agent-cli-command.ts:109` (`export async function handleOutcome(`) | `FailSafe/extension/src/extension/main.ts:275` (`registerAgentCliCommands(context, {`) | `FailSafe/extension/src/test/extension/agent-cli-command.test.cjs` (unit) | Shared with continue |
| apply-reviewed-change-set | verified-shipped | `applyQuarantined` `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:74` (`export async function applyQuarantined(`) | `FailSafe/extension/src/extension/agent-cli-command.ts:94` (`await (deps.apply ?? applyQuarantined)(cs)`) | `FailSafe/extension/src/test/integrations/agent-cli/agent-run-promotion.test.ts` (unit) | Shared with continue |
| l3-approval-for-high-risk-runs | proposed | none | none | none | The legacy review asked for it; the Apply modal shows the risk grade only `FailSafe/extension/src/extension/agent-cli-command.ts:74` (`risk ${risk ?? 'L1'}) are held in quarantine`) |
| version-pin | proposed | none | none | none | Detection parses any version but enforces none `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:123-125` (`return { available: true, version: m ? m[0] : undefined };`) |
| process-sandbox | proposed | none | none | none | Not a sandbox `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:11-13` (`A worktree is not a process sandbox.`) |

## Inbound fields

From the operator: a one-shot message typed into an input box `FailSafe/extension/src/extension/agent-cli-command.ts:170` (`Message for Aider (one-shot)`).
From settings: the write authorization and the run timeout `FailSafe/extension/src/extension/agent-cli-command.ts:173` (`integrations.aider.allowWrites`).
From the agent: its exit code and stdout, and the files it changed in the worktree, captured as a binary diff against the base commit `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:152-155` (`'diff', '--cached', ...PINNED_DIFF, prep.baseHead`).
From detection: the `aider --version` output, run from the OS temp directory `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:122` (`await run(name, versionArgs, { cwd: os.tmpdir() })`).

## Outbound fields and egress

Repository content: yes, indirectly; the Aider process FailSafe starts reads the worktree, a full checkout of HEAD `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:97` (`'worktree', 'add', '--detach', dir, prep.baseHead`).
FailSafe itself makes no network call for this integration; where Aider sends the message and file contents is decided by Aider and its model configuration (unverified; outside FailSafe's control and not observed).
Metadata: the message travels only as argv to the local process `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:276-277` (`shell: false, windowsHide: true`).
Graph relationships: no `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:4-5` (`nothing here writes the workspace`).
Governance evidence: no; the receipt and ledger entries stay local `FailSafe/extension/src/extension/agent-cli-command.ts:86` (`eventType: 'QUARANTINE_START'`).
Consent: the run needs `failsafe.integrations.aider.enabled` and `failsafe.integrations.aider.allowWrites` `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:51-52` (`running Aider requires`).

## Transformations

The run's risk grade is the maximum of the policy engine's grade for each touched path, L1 when none `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:136-141` (`for (const p of summary.paths) grade = maxRisk(grade, classify(p));`).
The change set is validated for paths and modes that are never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:159-160` (`the change set contains paths or modes that are never promoted`).
A receipt is built from argv, status, risk, exit code and diff summary, never the environment `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:161-163` (`The receipt`).

## Persisted artifacts

A QUARANTINE_START and a QUARANTINE_END entry in the FailSafe ledger, carrying the receipt, risk grade and patch hash `FailSafe/extension/src/extension/agent-cli-command.ts:84-86` (`artifactHash: cs.patchSha256`).
The ledger is the `soa_ledger` table `FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts:127` (`CREATE TABLE IF NOT EXISTS soa_ledger`).
A write-only audit copy under the extension's global storage `agent-runs` folder, newest 20 kept `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:95-99` (`fs.writeFileSync(path.join(dir, 'change-set.patch'), cs.patch);`).
Health evidence of the last run in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).
On Apply, the working tree receives exactly the reviewed bytes; nothing is committed `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:80` (`git.tryRun(cs.root, ['apply', '-'], { input: cs.patch })`).

## Graph links

Implemented: the receipt and ledger entries name the base commit and the patch hash, linking a run to the commit it started from `FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts:191-192` (`patchSha256: input.patchSha256,`).
Implemented: the ledger entries carry the agent DID `did:failsafe:agent:aider` `FailSafe/extension/src/extension/agent-cli-command.ts:58` (`did:failsafe:agent:${agent}`).
Proposed (not built): run-to-intent and run-to-receipt edges in the relationship graph of `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Run Aider (governed)" `FailSafe/extension/package.json:196-197` (`"title": "FailSafe: Run Aider (governed)"`).
Progress: a notification while the run is in progress `FailSafe/extension/src/extension/agent-cli-command.ts:172` (`Running Aider in an isolated worktree`).
Decision: a modal with Discard, Review diff and Apply, stating the isolation boundary `FailSafe/extension/src/extension/agent-cli-command.ts:74-75` (`detail: BOUNDARY_NOTE`).
Review: a read-only diff document served from memory `FailSafe/extension/src/extension/agent-cli-command.ts:66-69` (`setTextDocumentLanguage(doc, 'diff')`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: nothing starts without the write authorization setting `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:51-52` (`if (!opts.writesAllowed) {`).
Enforced: auto-commit is always disabled in argv `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:26` (`Auto-commit is always off`).
Enforced: a dirty work tree, or skip-worktree flags, block the run `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:80-86` (`the work tree has uncommitted or untracked files`).
Enforced: Apply refuses when the hash, HEAD or the repository snapshot changed since the run `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:46-54` (`HEAD moved from`).
Observed, not prevented: writes to the real repository during the run are detected afterwards and never promoted `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:141` (`the repository changed outside the isolated worktree during the run`).
Not observed: writes outside the repository or inside ignored directories, and processes that escape tracking `FailSafe/extension/src/extension/agent-cli-command.ts:47-49` (`Writes outside the repository or inside ignored directories are not detected`).
Advisory: unlike Continue there is no tool allowlist, so Aider's own shell commands are not refused before the run; the risk grade is displayed but any grade can be applied `FailSafe/extension/src/integrations/agent-cli/aider-wrapper.ts:46-55` (`refuse without authorization, else run isolated and quarantine`).

## Failure, offline, stale and permission semantics

`aider` not found, or `aider --version` failing, is unavailable and recorded as failing / not_installed `FailSafe/extension/src/integrations/agent-cli/agent-cli-health.ts:10-12` (`if (!out.available) return ['failing', 'not_installed'];`).
A run past the timeout (default 900000 ms) is stopped and nothing is promotable `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:148` (`the agent did not finish within`).
A non-zero exit is FAILED_INCONCLUSIVE `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:149` (`the agent exited with code`).
A repository change during the run is recorded as an EXTERNAL_DRIFT ledger entry `FailSafe/extension/src/extension/agent-cli-command.ts:123-124` (`eventType: 'EXTERNAL_DRIFT'`).
Process tracking that cannot start blocks the run before the agent starts `FailSafe/extension/src/integrations/agent-cli/isolated-run.ts:188-189` (`process tracking is unavailable, so the agent is not started`).
Offline: FailSafe does not check connectivity; an Aider run that fails for lack of network surfaces as its exit code (unverified).
Stale: a change set is held only within the invocation; nothing promotable outlives it `FailSafe/extension/src/extension/agent-cli-command.ts:9-10` (`Nothing promotable`).

## End-to-end scenario and measurable acceptance

Scenario: on a clean repository, enable Aider and write authorization, run the command with a message, see the modal list the changed files and risk, Apply, and find exactly the reviewed bytes uncommitted in the working tree with a QUARANTINE_END entry `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:86` (`applied ${cs.stats.files} file(s) exactly as reviewed`).
Metric: zero bytes reach the workspace before Apply, zero commits are made, and after Apply the re-derived diff equals the reviewed patch (threshold: byte equality, else APPLY_MISMATCH) `FailSafe/extension/src/integrations/agent-cli/agent-run-promotion.ts:82-84` (`if (!after.equals(cs.patch)) {`).
Existing test: `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts:104-107` (`spawn cwd is the worktree; change quarantined`) (unit, a scripted runner instead of the real `aider`).
Installed-extension test: none runs the real `aider` binary or installs the packaged VSIX for this flow (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. Auto-commit suppression and worktree isolation are built and unit-tested; the legacy review's gating item is handled in argv. The remaining gaps (a pinned-version test against the real CLI, an L3 route, and the absence of any pre-run tool restriction because Aider has no allowlist) are completion items, and the boundary text already says it is not a sandbox.

## Open defects

`[B227]` git-safety copies `filter.lfs.*` and `safe.directory` without `--global` into the agent run's config `docs/BACKLOG.md:583` (`into the agent run's private config`).
No other open B-item is specific to Aider on main (unverified: searched `docs/BACKLOG.md` for "Aider" at c36b9ee2).
The documentation index row is stale (still "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:70` (`#107 (Group B)`).
