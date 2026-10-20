# Governed commit and pull request integration contract

Contract id: `governed-commit-pr` (registry row `integration-contract-governed-commit-pr`). Recorded against main `c36b9ee2`; the PR step's endpoint pairing was added on main after v6.0.8 (#538) and is not released. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

No legacy review in `docs/research/integrations/` covers this flow; the GitHub review belongs to the github-checks contract.

**Owned files:**
- `FailSafe/extension/src/extension/governedCommit.ts`
- `FailSafe/extension/src/extension/governedCommitFlow.ts`

Not owned here: the pull-request POST `createPullRequest` lives in `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts` (github-checks), the token and endpoint gate `governedCommitConnection` in `FailSafe/extension/src/integrations/credentials/credentialGates.ts` (shared credentials module), and the wiring `offerGovernedCommit` in `FailSafe/extension/src/extension/bootstrapServers.ts`.

## Customer job

After FailSafe's Initialize or Organize command changes files in the workspace, the developer wants those changes to land as one attributed commit on its own branch, pushed and opened as a pull request, or wants the refusal recorded, instead of leaving an unexplained dirty tree.

## Measurable value

Metric: the share of Initialize and Organize runs that end either in a commit (local, pushed or PR) or in a recorded decline, rather than in unrecorded changes; every path of the flow ends in one of those `FailSafe/extension/src/extension/governedCommitFlow.ts:56-63` (`await deps.recordDeclined({ action, changes: executedLabels, at: deps.now() });`).
Baseline: runs are not counted; usage is unverified.

## Why not simply ask an agent

An agent can run git, but it would commit whatever is dirty. This flow commits only the paths the FailSafe command itself changed (a before and after status difference), asks first, redacts credentials from every URL it reports, and records a decline locally.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:62` (`Checks: https://docs.github.com/en/rest/checks/runs`) lists the GitHub REST documentation; the index has no row for the pull-request endpoint this flow uses (unverified as to whether one is intended).
The flow posts to `/repos/<owner>/<repo>/pulls` `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:131` (`const url = `).

## Privileges and scopes

Git: the operator's own git credentials, used by `git push -u origin <branch>` through the trusted git resolver `FailSafe/extension/src/extension/governedCommit.ts:122` (`const pushed = await git(['push', '-u', 'origin', req.branch], cwd);`).
GitHub: the `github.token` credential from Secret Storage, sent as an Authorization header for the PR POST, and on main only to the API base's own origin `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:132` (`githubAuthHeaders(api.base, url, opts.token`).
The token is read without checking `failsafe.integrations.github.enabled` `FailSafe/extension/src/integrations/credentials/credentialGates.ts:90-91` (`export function governedCommitConnection(`).
In v6.0.8 the PR request always went to api.github.com, because the wiring passed no API base URL. On main (unreleased, #538) the token and the endpoint come from the same credential gate, so the PR goes to the configured GitHub Enterprise base and a user token is never sent to a workspace-set endpoint `FailSafe/extension/src/extension/bootstrapServers.ts:74` (`governedCommitPrStep(governedCommitConnection(`).
A refused base (an `http://` base for a host that is not this machine, or one with credentials, a query or a fragment) makes no request: `createPullRequest` returns an error, not a local-only skip, and the flow reports the branch as pushed with that error as its warning `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:129-130` (`if (!api.ok) return { ok: false, error: api.error };`).
Needed scopes: pull-request write on the repository `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:142` (`pull-request write permission`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| operator-confirmed-commit-offer | verified-shipped | `runGovernedCommitFlow` `FailSafe/extension/src/extension/governedCommitFlow.ts:44` (`export async function runGovernedCommitFlow(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:61` (`const result = await runGovernedCommitFlow(action, changed`) | `FailSafe/extension/src/test/extension/governedCommitFlow.test.ts` (unit) | Offered after `failsafe.bootstrap` and `failsafe.organize` `FailSafe/extension/src/extension/bootstrapServers.ts:422-427` (`await offerGovernedCommit("initialize"`) |
| commit-and-push-branch | verified-shipped | `commitPushOpenPr` `FailSafe/extension/src/extension/governedCommit.ts:83` (`export async function commitPushOpenPr(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:442-443` (`await offerGovernedCommit("organize"`) | `FailSafe/extension/src/test/extension/governedCommit.test.ts` (unit) | Git runner is injected in tests; the production runner is not spawned there `FailSafe/extension/src/extension/governedCommit.ts:13-14` (`PURE wiring over an INJECTED git runner`) |
| open-pull-request | verified-shipped | `commitPushOpenPr` `FailSafe/extension/src/extension/governedCommit.ts:132-137` (`const pr = await createPullRequest(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:74` (`defaultGitHubPost`) | `FailSafe/extension/src/test/extension/governedCommit.test.ts` (unit) | Only with a stored token; otherwise the ladder stops at pushed `FailSafe/extension/src/extension/governedCommit.ts:129-130` (`no GitHub token`) |
| credential-redaction | verified-shipped | `redactUrlCredentials` `FailSafe/extension/src/extension/governedCommit.ts:76` (`export function redactUrlCredentials(text: string): string {`) | `FailSafe/extension/src/extension/bootstrapServers.ts:61` (`const result = await runGovernedCommitFlow(action, changed`) | `FailSafe/extension/src/test/extension/governedCommit.test.ts` (unit) | Applied to the remote URL and push errors it reports `FailSafe/extension/src/extension/governedCommit.ts:120` (`const safeRemoteUrl = redactUrlCredentials(remoteUrl);`) |

## Inbound fields

The changed paths: the difference between `git status --porcelain` before and after the command `FailSafe/extension/src/extension/bootstrapServers.ts:55-56` (`const changed = after.filter((p) => !before.includes(p));`).
The executed action labels from the Organize report `FailSafe/extension/src/extension/bootstrapServers.ts:442` (`report?.executed ?? []`).
The origin remote URL `FailSafe/extension/src/extension/governedCommit.ts:113` (`const remote = await git(['remote', 'get-url', 'origin'], cwd);`).
From GitHub: the PR's `html_url` and `number` `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:153` (`j.html_url`).

## Outbound fields and egress

Repository content: yes, the commit of the changed paths is pushed to origin, gated by the Yes and No prompt `FailSafe/extension/src/extension/governedCommit.ts:100-101` (`await git(['add', '-A', '--', ...req.paths], cwd);`).
Metadata: yes, a PR with title `chore(<action>): workspace cleanup`, a body listing the changes, and the head and base branch, gated by the prompt and a stored token `FailSafe/extension/src/extension/governedCommitFlow.ts:66-71` (`prTitle: `).
Graph relationships: no (unverified: no graph code exists).
Governance evidence: the PR body says it was automated by FailSafe and operator-confirmed `FailSafe/extension/src/extension/governedCommitFlow.ts:63` (`(operator-confirmed)`).
The enable setting of the GitHub integration does not gate any of this (see F18) `FailSafe/extension/src/extension/bootstrapServers.ts:74` (`governedCommitConnection(credentials.creds, credentials.endpoints, credentials.ui)`).

## Transformations

The branch is `fix/<action>-<timestamp>` `FailSafe/extension/src/extension/governedCommitFlow.ts:60` (`const branch = `).
The commit message is `chore(<action>): apply N workspace change(s)` with one bullet per label `FailSafe/extension/src/extension/governedCommitFlow.ts:62-63` (`const message = `).
Credential userinfo in http(s) URLs is replaced by `***` to the last `@` `FailSafe/extension/src/extension/governedCommit.ts:80-83` (`return text.replace(`).

## Persisted artifacts

A local commit on a new branch, which also becomes the checked-out branch of the workspace `FailSafe/extension/src/extension/governedCommit.ts:97-98` (`const branched = await git(['checkout', '-b', req.branch], cwd);`).
A remote branch on origin and, with a token, a pull request on GitHub `FailSafe/extension/src/extension/governedCommit.ts:137` (`return withBinding({ step: 'pr'`).
On decline, one line in `.failsafe/governance/workspace-actions.jsonl` `FailSafe/extension/src/extension/bootstrapServers.ts:72-75` (`workspace-actions.jsonl`).

## Graph links

Implemented (main only, not in v6.0.9): after a commit, FailSafe offers to link it to the active intent as a `committed-under` edge, after a modal VS Code confirmation, and records `via: governed-commit` and the action in the edge's provenance `FailSafe/extension/src/extension/governedCommitLink.ts:58` (`export async function offerCommittedUnderLink(`). The offer is made only for a commit bound to this run: its parent is the HEAD read before the commit, its tree is the staged index tree, its message is the one FailSafe wrote, and it is the tip of the branch `FailSafe/extension/src/extension/governedCommit.ts:179` (`its parent is not the HEAD recorded before the commit`); otherwise no dialog opens and the warning names the failed check (B286). The PR and the decline record are not linked.
Delivery (main only, not in v6.0.8): a commit made here can be linked to the active intent afterwards, when the operator picks it from HEAD's 50 most recent commits in Workspace > Delivery and confirms in VS Code `FailSafe/extension/src/governance/delivery/deliveryService.ts:194` (`function prepareCommit(ctx: DeliveryContext, target: string)`); the governed commit's own offer is above (B286).
Proposed: change to commit to PR to receipt, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: not built).

## Customer UI and actions

A non-modal information message asks "Commit, push & open a PR for them?" with Yes and No `FailSafe/extension/src/extension/bootstrapServers.ts:67` (`confirm: async (msg) => (await vscode.window.showInformationMessage(msg, "Yes", "No")) === "Yes",`).
The outcome is reported as opened, pushed with a compare URL, or committed locally `FailSafe/extension/src/extension/bootstrapServers.ts:76-79` (`opened ${r.prUrl}`).
A decline is written to the FailSafe output channel `FailSafe/extension/src/extension/bootstrapServers.ts:80` (`commit declined`).

The link offer is a modal VS Code dialog through the shared operator confirmer, showing the intent, commit, tree, branch, who made it and the file counts `FailSafe/extension/src/extension/governedCommitLink.ts:71` (`const answer = await confirm(deliveryLinkRequest('link', 'committed-under', prepared.intent, facts, 'command'));`).

## Governance policy and enforceability limits

Enforced: nothing is committed without a Yes `FailSafe/extension/src/extension/governedCommitFlow.ts:55-61` (`if (!approved) {`).
Disclosed: files that were already staged before the run are included in the commit, and the link dialog counts them ("N - M file(s) outside those paths were already staged") `FailSafe/extension/src/extension/governedCommitLink.ts:54` (`outside those paths were already staged`).
Enforced: only the named paths are staged `FailSafe/extension/src/extension/governedCommit.ts:100` (`'add', '-A', '--', ...req.paths`).
Observed: the prompt is a non-modal message; any answer other than Yes, including dismissing it, is taken as No and recorded as a decline `FailSafe/extension/src/extension/bootstrapServers.ts:67` (`=== "Yes",`).
Advisory: the GitHub integration's enable setting is not consulted; a stored token is enough to open a PR (F18) `FailSafe/extension/src/integrations/credentials/credentialGates.ts:90` (`Without one the commit is still made; only the PR step is skipped.`).
Advisory: if the commit fails after the branch was created, the workspace is left on the new branch `FailSafe/extension/src/extension/governedCommit.ts:104-106` (`commit failed: `).

## Failure, offline, stale and permission semantics

Not a repository: no-op `FailSafe/extension/src/extension/governedCommit.ts:91-92` (`return { step: 'not-a-repo' };`).
No origin: committed locally only `FailSafe/extension/src/extension/governedCommit.ts:115-116` (`committed locally only`).
Push failed (offline or no permission): committed, with the redacted push error `FailSafe/extension/src/extension/governedCommit.ts:124-125` (`push failed: `).
401 or 403 from GitHub: auth failure, branch stays pushed `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:141-142` (`GitHub auth failed`).
422 (PR exists or branch missing): pushed, with a compare URL `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:144-146` (`GitHub rejected the PR (422)`).
Any thrown error in the offer is logged and the command result is unchanged `FailSafe/extension/src/extension/bootstrapServers.ts:81-83` (`governed-commit offer failed`).

## End-to-end scenario and measurable acceptance

Scenario: run FailSafe Organize, answer Yes, and find a `fix/organize-<timestamp>` branch with one commit of exactly the changed files, pushed, and a PR whose URL is shown `FailSafe/extension/src/test/extension/governedCommitFlow.test.ts:47` (`approved + token → drives the ladder to a PR; branch is timestamp-stamped`).
Metric: zero commits on No, exactly one commit on Yes, staged paths equal to the changed set (threshold: exact) `FailSafe/extension/src/test/extension/governedCommit.test.ts:73` (`stages exactly the named paths`).
Existing test: `FailSafe/extension/src/test/extension/governedCommit.test.ts:28` (`commitPushOpenPr — governed Organize ladder`) (unit), with injected git and POST.
Installed-extension test: no test runs the real git, a real remote or GitHub for this flow (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. The ladder is careful and tested, but its PR step is gated only by token presence, not by the GitHub integration's enable setting, and the confirmation is a non-modal message. Gate the PR step on the enable setting and make the prompt modal, then maintain.

## Open defects

F18, the PR step does not check `failsafe.integrations.github.enabled`: [B270] `FailSafe/extension/src/integrations/credentials/credentialGates.ts:90-91` (`export function governedCommitConnection(`).
