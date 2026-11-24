# Governed commit and pull request integration contract

Contract id: `governed-commit-pr` (registry row `integration-contract-governed-commit-pr`). Recorded against main `c36b9ee2`; the PR step's endpoint pairing was added on main after v6.0.8 (#538) and is not released. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

No legacy review in `docs/research/integrations/` covers this flow; the GitHub review belongs to the github-checks contract.

**Owned files:**
- `FailSafe/extension/src/extension/governedCommit.ts`
- `FailSafe/extension/src/extension/governedCommitFlow.ts`
- `FailSafe/extension/src/extension/governedCommitSelection.ts` (draft exact-file manifest candidate, not shipped)
- `FailSafe/extension/src/extension/githubPushBinding.ts`

Not owned here: the pull-request POST `createPullRequest` lives in `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts` (github-checks), the token and endpoint gate `governedCommitConnection` in `FailSafe/extension/src/integrations/credentials/credentialGates.ts` (shared credentials module), and the wiring `offerGovernedCommit` in `FailSafe/extension/src/extension/bootstrapServers.ts`.

## Customer job

After FailSafe's Initialize or Organize command changes files in the workspace, the developer wants those changes to land as one attributed commit on its own branch, pushed and opened as a pull request, or wants the refusal recorded, instead of leaving an unexplained dirty tree.

## Measurable value

Metric: the share of Initialize and Organize runs that end either in a commit (local, pushed or PR) or in a recorded decline, rather than in unrecorded changes; every path of the flow ends in one of those `FailSafe/extension/src/extension/governedCommitFlow.ts:64-71` (`await deps.recordDeclined({ action, changes: executedLabels, at: deps.now() });`).
Baseline: runs are not counted; usage is unverified.

## Why not simply ask an agent

An agent can run git, but it would commit whatever is dirty. This flow commits only the paths the FailSafe command itself changed (a before and after status difference), asks first, redacts credentials from every URL it reports, and records a decline locally.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:62` (`Checks: https://docs.github.com/en/rest/checks/runs`) lists the GitHub REST documentation; the index has no row for the pull-request endpoint this flow uses (unverified as to whether one is intended).
The flow posts to `/repos/<owner>/<repo>/pulls` `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:131` (`const url = `).

## Privileges and scopes

Git: the operator's own git credentials, used by `git push -u origin <branch>` through the trusted git resolver `FailSafe/extension/src/extension/governedCommit.ts:280` (`const pushed = await git(['push', '-u', 'origin', req.branch], cwd);`).
GitHub: the `github.token` credential from Secret Storage, sent as an Authorization header for the PR POST, and on main only to the API base's own origin `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:132` (`githubAuthHeaders(api.base, url, opts.token`).
The token is read without checking `failsafe.integrations.github.enabled` `FailSafe/extension/src/integrations/credentials/credentialGates.ts:96` (`export function governedCommitConnection(`).
In v6.0.8 the PR request always went to api.github.com. On main (#538), the token and endpoint share a credential gate and User tokens cannot use a Workspace-provided endpoint. On this prospective #691 branch, custom GHES API bases require a Workspace-scoped token even if a Dev Container presents its custom endpoint as a User setting `FailSafe/extension/src/integrations/credentials/credentialGates.ts:135` (`if (provider === 'github' && e.scope === 'user' &&`); the modal consent displays the effective Git push destination `FailSafe/extension/src/extension/governedCommitFlow.ts:123` (`Git push destination:`) and does not authorize native SHIELD. `FailSafe/extension/src/extension/bootstrapServers.ts:81` (`governedCommitPrStep(governedCommitConnection(`).
A refused base (an `http://` base for a host that is not this machine, or one with credentials, a query or a fragment) makes no request: `createPullRequest` returns an error, not a local-only skip, and the flow reports the branch as pushed with that error as its warning `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:129-130` (`if (!api.ok) return { ok: false, error: api.error };`).
Needed scopes: pull-request write on the repository `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:142` (`pull-request write permission`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| operator-confirmed-commit-offer | verified-shipped | `runGovernedCommitFlow` `FailSafe/extension/src/extension/governedCommitFlow.ts:47` (`export async function runGovernedCommitFlow(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:68` (`const result = await runGovernedCommitFlow(action, changed`) | `FailSafe/extension/src/test/extension/governedCommitFlow.test.ts` (unit) | Offered after `failsafe.bootstrap` and `failsafe.organize` `FailSafe/extension/src/extension/bootstrapServers.ts:455-460` (`await offerGovernedCommit("initialize"`) |
| commit-and-push-branch | verified-shipped | `commitPushOpenPr` `FailSafe/extension/src/extension/governedCommit.ts:91` (`export async function commitPushOpenPr(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:481-482` (`await offerGovernedCommit("organize"`) | `FailSafe/extension/src/test/extension/governedCommit.test.ts` (unit) | Git runner is injected in tests; the production runner is not spawned there `FailSafe/extension/src/extension/governedCommit.ts:13-14` (`PURE wiring over an INJECTED git runner`) |
| open-pull-request | verified-shipped | `commitPushOpenPr` `FailSafe/extension/src/extension/governedCommit.ts:302-307` (`const pr = await createPullRequest(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:81` (`defaultGitHubPost`) | `FailSafe/extension/src/test/extension/governedCommit.test.ts` (unit) | Only with a stored token; otherwise the ladder stops at pushed `FailSafe/extension/src/extension/governedCommit.ts:287-288` (`no GitHub token`) |
| credential-redaction | verified-shipped | `redactUrlCredentials` `FailSafe/extension/src/extension/governedCommit.ts:84` (`export function redactUrlCredentials(text: string): string {`) | `FailSafe/extension/src/extension/bootstrapServers.ts:68` (`const result = await runGovernedCommitFlow(action, changed`) | `FailSafe/extension/src/test/extension/governedCommit.test.ts` (unit) | Applied to the remote URL and push errors it reports `FailSafe/extension/src/extension/governedCommit.ts:263` (`const safeRemoteUrl = redactUrlCredentials(remoteUrl);`) |

## Inbound fields

The changed paths: the difference between `git status --porcelain` before and after the command `FailSafe/extension/src/extension/bootstrapServers.ts:63-64` (`const changed = after.filter((p) => !before.includes(p));`).
On main (unreleased, B311) the prompt also names the canonical and proposed architecture registry rows whose document, contract or verification cell names a changed path, warn-only, at most 3 lines; the commit proceeds in every case, a throw or rejection adds nothing, a timeout or an unreadable index adds one "not checked (<reason>)" line, and nothing is added to the commit message or the PR body `FailSafe/extension/src/extension/governedCommitFlow.ts:55` (`const architecture = await architectureNote(deps, changedPaths);`). The paths are matched as porcelain gives them (repository-root relative, quotes stripped, C-escapes not decoded, an untracked folder as `dir/`), so a workspace that is a subfolder of its repository, a C-quoted name or a file in a new untracked folder is not matched `FailSafe/extension/src/extension/bootstrapServers.ts:80` (`describeArchitecture: async (paths) =>`).
The executed action labels from the Organize report `FailSafe/extension/src/extension/bootstrapServers.ts:481` (`report?.executed ?? []`).
The origin remote URL `FailSafe/extension/src/extension/governedCommit.ts:256` (`const remote = await git(['remote', 'get-url', 'origin'], cwd);`).
From GitHub: the PR's `html_url` and `number` `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:153` (`j.html_url`).

## Outbound fields and egress

Repository content: yes, the commit of the changed paths is pushed to origin, gated by the Yes and No prompt `FailSafe/extension/src/extension/governedCommit.ts:160` (`const staged = await git(['add', '-A', '--', ...literalPaths], cwd);`).
Metadata: yes, a PR with title `chore(<action>): workspace cleanup`, a body listing the changes, and the head and base branch, gated by the prompt and a stored token `FailSafe/extension/src/extension/governedCommitFlow.ts:80-85` (`prTitle: `).
Graph relationships: no (unverified: no graph code exists).
Governance evidence: the PR body says it was automated by FailSafe and operator-confirmed `FailSafe/extension/src/extension/governedCommitFlow.ts:77` (`(operator-confirmed)`).
The enable setting of the GitHub integration does not gate any of this (see F18) `FailSafe/extension/src/extension/bootstrapServers.ts:81` (`governedCommitConnection(credentials.creds, credentials.endpoints, credentials.ui)`).

## Transformations

The branch is `fix/<action>-<timestamp>` `FailSafe/extension/src/extension/governedCommitFlow.ts:74` (`const branch = `).
The commit message is `chore(<action>): apply N workspace change(s)` with one bullet per label `FailSafe/extension/src/extension/governedCommitFlow.ts:76` (`const message = `).
Credential userinfo in http(s) URLs is replaced by `***` to the last `@` `FailSafe/extension/src/extension/governedCommit.ts:88` (`return text.replace(`).

## Persisted artifacts

A local commit on a new branch, which also becomes the checked-out branch of the workspace `FailSafe/extension/src/extension/governedCommit.ts:140` (`const branched = await git(['checkout', '-b', req.branch], cwd);`).
A remote branch on origin and, with a token, a pull request on GitHub `FailSafe/extension/src/extension/governedCommit.ts:307` (`return withBinding({ step: 'pr'`).
On decline, one line in `.failsafe/governance/workspace-actions.jsonl` `FailSafe/extension/src/extension/bootstrapServers.ts:74-77` (`workspace-actions.jsonl`).

## Graph links

Implemented (main only, not in v6.0.9): after a commit, FailSafe offers to link it to the active intent as a `committed-under` edge, after a modal VS Code confirmation, and records `via: governed-commit` and the action in the edge's provenance `FailSafe/extension/src/extension/governedCommitLink.ts:58` (`export async function offerCommittedUnderLink(`). The offer is made only for a commit bound to this run: its parent is the HEAD read before the commit, its tree is the staged index tree, its message is the one FailSafe wrote, and it is the tip of the branch `FailSafe/extension/src/extension/governedCommit.ts:349` (`its parent is not the HEAD recorded before the commit`); otherwise no dialog opens and the warning names the failed check (B286). The PR and the decline record are not linked.
Delivery (main only, not in v6.0.8): a commit made here can be linked to the active intent afterwards, when the operator picks it from HEAD's 50 most recent commits in Workspace > Delivery and confirms in VS Code `FailSafe/extension/src/governance/delivery/deliveryService.ts:203` (`function prepareCommit(ctx: DeliveryContext, target: string)`); the governed commit's own offer is above (B286).
Proposed: change to commit to PR to receipt, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: not built).

## Customer UI and actions

A modal warning asks "Commit, push & open a PR for them?" with Yes and No, and presents the effective Git push destination for public GitHub or GHES, plus the PR API destination when a token is configured `FailSafe/extension/src/extension/bootstrapServers.ts:71` (`showWarningMessage(msg, { modal: true }`).
The outcome is reported as opened, pushed with a compare URL, or committed locally `FailSafe/extension/src/extension/bootstrapServers.ts:84-87` (`opened ${r.prUrl}`).
A decline is written to the FailSafe output channel `FailSafe/extension/src/extension/bootstrapServers.ts:87` (`commit declined`).

The link offer is a modal VS Code dialog through the shared operator confirmer, showing the intent, commit, tree, branch, who made it and the file counts `FailSafe/extension/src/extension/governedCommitLink.ts:71` (`const answer = await confirm(deliveryLinkRequest('link', 'committed-under', prepared.intent, facts, 'command'));`).

## Governance policy and enforceability limits

Enforced on candidate #691 only: the consent UI now inspects and displays the **effective Git push URL** even for default public GitHub with no PR token `FailSafe/extension/src/extension/governedCommitFlow.ts:129-138` (`approvedPushUrl: binding.pushUrl`). The shared preflight reads exactly one effective push URL `FailSafe/extension/src/extension/githubPushBinding.ts:28` (`get-url', '--push', '--all', 'origin'`) and requires its host, owner and repository to match the authorized fetch remote `FailSafe/extension/src/extension/githubPushBinding.ts:33-37` (`Git push destination differs from the authorized repository`). An unapproved or changed target refuses the push even without a token `FailSafe/extension/src/extension/governedCommit.ts:277-281` (`Git fetch or effective push destination changed`). Before publishing a credential-backed PR, both fetch and push identities are rechecked `FailSafe/extension/src/extension/governedCommit.ts:299-307` (`Git push destination changed after the approved push`). This is not race-proof against same-principal Git-config mutations after preflight (unverified); installed Windows/Dev Container qualification remains required.

Enforced: nothing is committed without a Yes `FailSafe/extension/src/extension/governedCommitFlow.ts:63-69` (`if (!approved) {`).
**Historical main behavior (not #715 candidate):** files already staged before a run can enter its commit, and the link dialog counts them ("N - M file(s) outside those paths were already staged"). The draft #715 candidate explicitly refuses such a staged index; this revised authority contract is NOT released. `FailSafe/extension/src/extension/governedCommitLink.ts:54` (`outside those paths were already staged`).
Enforced: only the named paths are staged `FailSafe/extension/src/extension/governedCommit.ts:160` (`'add', '-A', '--', ...literalPaths`).
Observed on protected main: the confirmation is non-modal. On the candidate #691 branch the prompt is modal; dismissal still counts as a decline `FailSafe/extension/src/extension/bootstrapServers.ts:71` (`showWarningMessage(msg, { modal: true }`).
Advisory: the GitHub integration's enable setting is not consulted; a stored token is enough to open a PR (F18) `FailSafe/extension/src/integrations/credentials/credentialGates.ts:95` (`Without one the commit is still made; only the PR step is skipped.`).
Advisory: if the commit fails after the branch was created, the workspace is left on the new branch `FailSafe/extension/src/extension/governedCommit.ts:247` (`commit failed: `).

## Failure, offline, stale and permission semantics

Not a repository: no-op `FailSafe/extension/src/extension/governedCommit.ts:99` (`return { step: 'not-a-repo' };`).
No origin: committed locally only `FailSafe/extension/src/extension/governedCommit.ts:258-259` (`committed locally only`).
Push failed (offline or no permission): committed, with the redacted push error `FailSafe/extension/src/extension/governedCommit.ts:282` (`push failed: `).
401 or 403 from GitHub: auth failure, branch stays pushed `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:141-142` (`GitHub auth failed`).
422 (PR exists or branch missing): pushed, with a compare URL `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:144-146` (`GitHub rejected the PR (422)`).
Any thrown error in the offer is logged and the command result is unchanged `FailSafe/extension/src/extension/bootstrapServers.ts:89-91` (`governed-commit offer failed`).

## Branch/index identity before egress (candidate #691)

**New development correction, not yet native-audited or installed-host qualified:** `commitPushOpenPr` now refuses to stage, commit, push or create an authenticated PR if both the fresh branch checkout and existing-branch fallback fail, or if `git symbolic-ref --quiet --short HEAD` does not name the intended branch. Both checks precede `git add`. A nonzero `git add` result also stops the ladder before commit/egress, even when earlier Git operations may have staged a subset. FailSafe does not automatically discard or reset the operator's index.

These refusal paths return `step: 'noop'` with an explicit warning rather than falsely reporting a committed or pushed branch. Regression cases live in `FailSafe/extension/src/test/extension/governedCommit.test.ts` under `#476 pre-egress branch/index identity`; production Git runner coverage must still be independently confirmed on the supported Windows extension host. This guard is a correctness boundary for the existing operator-approved flow, not a guarantee against arbitrary same-OS-principal Git configuration races.

**Stacked #716 provenance refusal (development candidate, not yet qualified):** if the newly created commit cannot be bound to its pre-commit HEAD, staged tree, expected message, and target branch tip, FailSafe keeps the commit local and refuses remote push and PR publication `FailSafe/extension/src/extension/governedCommit.ts:253-254` (`commit not bound to this run`). The earlier #691 branch and protected main retain the **existing index-ownership contract** in which pre-staged files outside the selected paths can enter the commit; #715 now carries a proposed fail-closed replacement, with real-Git acceptance and owner/governance qualification still outstanding.

**#715 staged-index authority (draft candidate, pending governance):** the automated flow checks for an empty staged index before branch checkout `FailSafe/extension/src/extension/governedCommit.ts:132` (`const initialIndex = await git(`), and again after checkout/branch verification `FailSafe/extension/src/extension/governedCommit.ts:154` (`const switchedIndex = await git(`). A nonempty or unreadable index refuses before `git add` and remote publication, preserving staged data for manual owner review. Existing protected main and v6.0.13 retain their previous behavior. This is not a same-OS-principal sandbox and not yet installed-host qualified.

**#715 literal-pathspec boundary (draft, not released):** selected filenames are converted to Git literal pathspecs for both `git status` and `git add` `FailSafe/extension/src/extension/governedCommit.ts:121-122` (`const literalPaths = req.paths.map(`). A caller-supplied string such as `:(glob)**` must not become authority to stage other files. The candidate contains a real-Git negative test of this expansion. Existing shipped behavior remains unchanged until native governance and installed-host qualification.

**#715 selected-path validation (draft candidate):** an empty file selection, an all-whitespace filename, a NUL-containing path, or a malformed runtime collection is refused before `git status`, checkout, staging or publication `FailSafe/extension/src/extension/governedCommit.ts:108-113` (`invalid selected paths; no status`). This prevents empty Git pathspec lists from becoming repository-wide staging authority. Tests check the refusal and the absence of writes or outbound PR calls in `FailSafe/extension/src/test/extension/governedCommitPreEgress.security.test.ts`.

**#715 post-staging scope guard (draft candidate):** after `git add` succeeds and before committing, FailSafe asks trusted Git for the repository-relative workspace prefix `FailSafe/extension/src/extension/governedCommit.ts:170-176` (`rev-parse', '--show-prefix'`); a failed or malformed prefix refuses the commit. The repository-wide index check uses `:(top)` and **root-anchored literal exclusions** that include the prefix `FailSafe/extension/src/extension/governedCommit.ts:180-187` (`:(exclude,top,literal)`). A nonempty or unreadable off-scope diff refuses commit, push and PR while preserving the staged index. Real-Git regressions require both a legitimate nested-workspace commit to succeed and an injected unrelated staged file outside that workspace to be refused. A concurrent same-principal actor could still alter the index after this check; this is bounded hardening, not a race-proof transaction.

**#715 path canonicalization boundary (draft):** Git's literal pathspec marker prevents wildcard interpretation but does **not** stop normalization of `.` or `docs/..`, which can select the entire repository. Local real-Git falsification demonstrated root-wide staging from both forms. The candidate rejects root and traversal components, leading `/` or `\\`, and drive-absolute paths before examining selected status or mutating the index `FailSafe/extension/src/extension/governedCommit.ts:108-113` (`invalid selected paths`). Both real-Git and injected negative cases are maintained, with positive selected-file and directory cases preserved. This remains a candidate for governed review, not a shipped security claim.

**#715 pre-consent Git fsmonitor boundary (separate stacked draft):** an installed repository may configure `core.fsmonitor` to run an executable when Git reads status or cached-file metadata. Controlled real-Git tests confirmed that both `git status` and `git ls-files` can invoke it before confirmation. The candidate now applies command-scoped `-c core.fsmonitor=false` to its *new* manifest status and tracked-file discovery commands; a real-Git test requires no fsmonitor marker before consent. This does not retrofit all existing FailSafe Git callers and does not establish a general OS sandbox. Clean-filter execution during staged Git `add` remains after operator approval; filtered hash checking occurs only post-consent. Installed Windows host and native security acceptance remain outstanding.

**#719 pre-consent change discovery (remediation draft, local Windows qualification):** local real-Git qualification on Windows showed that the before/after change discovery that precedes the Organize/Initialize offer still ran a configured fsmonitor hook and clean filter and rewrote the index before consent, octal-quoted non-ASCII names (silent no-op), and reported repository-root paths from a nested workspace (an action change outside the workspace could commit the operator's same-named file inside it). The candidate builds one set of command-scoped pre-consent options `FailSafe/extension/src/extension/governedCommitSelection.ts:43-58` (`preConsentGitOptions`), including `--no-optional-locks`, `core.fsmonitor=false`, and an empty `clean`/`process` with `required=false` for every configured filter driver (unlistable or unsafe driver names refuse). Change discovery uses them with NUL-framed porcelain, a `.` pathspec, no submodule inspection and workspace-relative paths `FailSafe/extension/src/extension/governedCommit.ts:381-400` (`statusPaths`); the directory manifest snapshot uses the same options. Every selection, not only a directory, now names its exact files in the consent prompt `FailSafe/extension/src/extension/governedCommitFlow.ts:162` (`exactFileDisplay(changedPaths)`). Residuals: file-only selections are named but their contents are not bound to blob ids at approval; submodule changes are not offered; the directory manifest snapshot can still inspect a submodule inside a selected directory, where filter drivers configured only in that submodule are not blanked. Real-Git regression tests: `governedCommitDiscovery.test.ts`. No installed-host, native-governance or owner approval is inferred.

**#715 deleted-directory selector (separate stacked draft):** a path such as `docs` may no longer exist on disk after its final tracked file was deleted, yet Git still treats it as a directory selector. The candidate's `requiresExactSelection` checks missing paths against cwd-relative `git ls-files -z` results and treats matched descendants as directory authority. The UI must enumerate the tracked deletion, while direct `commitPushOpenPr` refuses broad staging even when `lstat` sees no directory. Real-Git tests cover deletion of the last tracked file and absence of the directory itself. Unreadable or oversized tracked-file evidence refuses rather than widening stage authority. Native acceptance and owner GO remain outstanding.

**#715 disclosure count (separate stacked draft):** an untracked directory can collapse multiple filenames into one changed-path input. The candidate's confirmation text and generated commit message report the *expanded exact-file count* instead of the number of original directory selectors; a real-Git test covers two files selected through one directory. This is filename-count disclosure, not diff review or content approval.

**#715 unsuffixed-directory authorization (separate stacked draft):** Git treats `docs` as a directory selector even without `docs/`. The approval flow checks the filesystem type and expands either spelling before consent; the lower-level staging API refuses any directory selector even if an arbitrary manifest is supplied, so no directory-wide `git add` can run. The pre-approval name validator also rejects directional Unicode controls and unmerged/conflicted Git status (manual review instead of implied authorization). Real-Git and injected negative cases are maintained. No CI/native/installed-host PASS is inferred from these later source changes.

**#715 exact-directory-file consent (separate stacked draft candidate, not released):** the proposed `governedCommitSelection.ts` expands any directory selection with `git status --porcelain=v1 -z --untracked-files=all` into individual changed filenames, records each **raw, unfiltered** working-tree blob or a tracked deletion (without invoking clean filters before consent), and caps the list at 64. The operator prompt lists each filename; the candidate rechecks filenames, status and blobs after consent. The resulting commit stages only those explicit files and rechecks the approved raw bytes before commit. When a staged Git object differs because of line-ending normalization or an owner-configured clean filter, it verifies the staged object through Git's filter-aware hash **only after approval**, then rechecks the raw file. A nonmatching blob or ambiguous index refuses; direct callers passing an unapproved directory selector are refused before Git status or branch mutation `FailSafe/extension/src/extension/governedCommit.ts:117` (`directory selection must be expanded to exact approved files`); a drift or read error refuses and preserves the index. The input is bounded and unusual control-character filenames are refused. Before any content hash, the candidate checks the entry with `lstat`, refuses symlinks/nonregular filesystem entries, and verifies the resolved file remains inside the selected workspace. It cannot prevent an adversarial same-OS-principal process from replacing the file between these checks. Real Git tests include added descendants, changed contents, nested workspaces and tracked deletion. This is *candidate review behavior*, not a strong same-OS-principal race barrier: concurrent changes after the final staged check are still possible. No Windows installed-host/native governance or owner approval is inferred from the candidate tests.

## End-to-end scenario and measurable acceptance

Scenario: run FailSafe Organize, answer Yes, and find a `fix/organize-<timestamp>` branch with one commit of exactly the changed files, pushed, and a PR whose URL is shown `FailSafe/extension/src/test/extension/governedCommitFlow.test.ts:59` (`approved + token → drives the ladder to a PR; branch is timestamp-stamped`).
Metric: zero commits on No, exactly one commit on Yes, staged paths equal to the changed set (threshold: exact) `FailSafe/extension/src/test/extension/governedCommit.test.ts:80` (`stages exactly the named paths`).
Existing test: `FailSafe/extension/src/test/extension/governedCommit.test.ts:35` (`commitPushOpenPr — governed Organize ladder`) (unit), with injected git and POST.
Installed-extension test: no test runs the real git, a real remote or GitHub for this flow (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE** as a work-queue disposition, not release acceptance. On this candidate, modal confirmation is implemented, but the PR step remains independent of `failsafe.integrations.github.enabled` (F18), so that separate governance decision remains open `FailSafe/extension/src/extension/bootstrapServers.ts:71` (`showWarningMessage(msg, { modal: true }`).

## Open defects

F18, the PR step does not check `failsafe.integrations.github.enabled`: [B270] `FailSafe/extension/src/integrations/credentials/credentialGates.ts:96` (`export function governedCommitConnection(`).
