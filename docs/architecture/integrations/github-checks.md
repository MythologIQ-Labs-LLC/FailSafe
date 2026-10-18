# GitHub Checks integration contract

Contract id: `github-checks` (registry row `integration-contract-github-checks`). Recorded against main `c36b9ee2`; the token host affinity, the linkage API base and the transport port were fixed on main after v6.0.8 (#538: B265, B279) and are not released. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_GITHUB_CONTRACT_REVIEW.md`. It recommended a GitHub App primary path with JWT-minted installation tokens, a commit-status fallback and a deterministic PASS/WARN/VETO mapping; the shipped code takes a pre-minted token, posts only a neutral manual advisory and a PR-linkage check, and keeps the verified SHIELD publisher unwired.

**Owned files:**
- `FailSafe/extension/src/integrations/github-checks/`
- `FailSafe/extension/src/extension/github-checks-command.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/catalog/`, and the receipt verifier under `FailSafe/extension/src/integrations/shield-receipts/` (owned by the shield-receipts contract).
`createPullRequest` lives in an owned file but is used only by the governed commit flow `FailSafe/extension/src/extension/governedCommit.ts:119` (`const pr = await createPullRequest(`); its contract is governed-commit-pr.

## Customer job

A developer wants GitHub to show, on the pull request, what FailSafe knows about the commit: today a clearly labelled non-authoritative advisory and a check that the PR body will actually close the issues it names; later a SHIELD verdict that a required check can rely on.

## Measurable value

Metric: PRs whose closing keywords would silently leave an issue open are flagged before merge, as a failing `FailSafe: PR Linkage` check `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:92-97` (`it will NOT auto-close on merge (GitHub closes only the first)`).
Baseline: no usage data is collected, so how many mis-linked PRs this catches is unverified.

## Why not simply ask an agent

An agent can read a PR body, but a GitHub check is visible to every reviewer and to branch protection, and this path guarantees what may be posted: the publishable names and conclusions are a closed set, the reserved SHIELD name needs a verified receipt, and the token goes only to the configured API host.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:59` (`Checks: https://docs.github.com/en/rest/checks/runs`) lists the GitHub REST and Checks documentation; the row still sits under "In review" with "PR #147", which is stale.
Check runs are posted to `POST {base}/repos/{owner}/{repo}/check-runs` `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:168` (`/check-runs`).
The linkage audit reads `GET /repos/{owner}/{repo}/pulls/{n}` and `GET /repos/{owner}/{repo}/issues?state=all` from the resolved API base `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:201-231` (`issues?state=all&per_page=100&page=`).

## Privileges and scopes

Credential: a GitHub token (App installation token or a PAT that the org permits with checks:write) in VS Code Secret Storage `FailSafe/extension/package.json:461-465` (`GitHub token used to create Check Runs`).
The token rides only the Authorization header, built in one place and only for a request to the API base's own origin (scheme, host and port); main only, not in v6.0.8 `FailSafe/extension/src/integrations/github-checks/github-host-affinity.ts:39-46` (`if (origin !== api.origin) return undefined;`).
The linkage audit additionally needs read access to the repository's pull requests and issues with the same token `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:202-204` (`githubAuthHeaders(api.base, url, token`).
A user-level token is never sent to an API base URL that workspace settings chose `FailSafe/extension/src/integrations/credentials/credentialGates.ts:126` (`ep.scope === 'workspace' && e.scope === 'user'`).
A Dev Container or remote-machine setting reads as user scope, so a repository's dev container can set the API base that a user token is paired with (B290) `FailSafe/extension/src/integrations/credentials/vscodeCredentialAdapters.ts:59` (`const user = text(i?.globalValue);`).
The PR number comes from the local gh CLI with its own login `FailSafe/extension/src/extension/github-checks-command.ts:31-33` (`['pr', 'view', '--json', 'number', '-q', '.number']`).
Minting App installation tokens or posting PR reviews would need App credentials or pull-request write and is marked requires separate approval (unverified: neither is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| check-publish | verified-shipped | `publishCheckRunPayload` `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:68` (`export async function publishCheckRunPayload(`) | `FailSafe/extension/src/extension/main.ts:265` (`registerGitHubChecksCommand(context, credentials.creds, credentials.endpoints)`) | `FailSafe/extension/src/test/integrations/github-checks/github-checks.test.ts` (unit) | Neutral manual advisory only `FailSafe/extension/src/integrations/github-checks/github-checks-map.ts:76-81` (`conclusion: 'neutral',`) |
| pr-linkage-check | verified-shipped | `publishLinkageCheck` `FailSafe/extension/src/integrations/github-checks/pr-linkage-publish.ts:31` (`export async function publishLinkageCheck(`) | `FailSafe/extension/src/extension/github-checks-command.ts:111` (`() => publishLinkageCheck({`) | `FailSafe/extension/src/test/integrations/github-checks/pr-linkage-publish.test.ts` (unit) | In v6.0.8 the reads ignore the API base URL (F11). Main differs (unreleased): see linkage-api-base |
| verified-shield-check | shipped-inert | `publishVerifiedShieldCheck` `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:110` (`export async function publishVerifiedShieldCheck(`) | none | none | Absent call site: no source file imports it, and a docs test holds the READMEs to that `FailSafe/extension/src/test/docs/integration-claims.test.cjs:82-88` (`No command publishes a verified SHIELD check yet`) |
| linkage-api-base | main-unreleased | `runLinkageAudit` `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:198` (`const api = apiBaseFor(opts.apiBaseUrl);`) | `FailSafe/extension/src/integrations/github-checks/pr-linkage-publish.ts:38` (`apiBaseUrl: args.opts.apiBaseUrl`) | `FailSafe/extension/src/test/integrations/github-checks/github-token-egress.test.ts` (unit) | The linkage reads go to the resolved base, and a 3xx is a failure (B265). Main only, not in v6.0.8 |
| token-host-affinity | main-unreleased | `githubAuthHeaders` `FailSafe/extension/src/integrations/github-checks/github-host-affinity.ts:39` (`export function githubAuthHeaders(`) | `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:169` (`githubAuthHeaders(api.base, url, token`) | `FailSafe/extension/src/test/integrations/github-checks/github-token-egress.test.ts` (unit) | The only builder of the token header; also used by the linkage audit and the PR create. Main only, not in v6.0.8 |
| transport-port | main-unreleased | `githubRequestOptions` `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:165` (`export function githubRequestOptions(`) | `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:209` (`sendGitHubRequest(url, 'POST', headers, body)`) | `FailSafe/extension/src/test/integrations/github-checks/github-token-egress.test.ts` (unit) | Keeps the base URL port (B279); https, or http only on this machine. Main only, not in v6.0.8 |
| commit-status-fallback | proposed | none | none | none | Not implemented (unverified beyond the absence of a statuses endpoint in the owned files) |
| pr-review-summary | proposed | none | none | none | Not implemented (unverified beyond the absence of a reviews endpoint in the owned files) |

## Inbound fields

From the local repository: the origin remote URL and the HEAD SHA `FailSafe/extension/src/extension/github-checks-command.ts:39-43` (`remoteUrl: git(['remote', 'get-url', 'origin'], cwd),`).
From GitHub on a confirmed create: the check-run id and the echoed head_sha, name and conclusion `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:121-128` (`return { id: o.id, head_sha: str(o.head_sha), name: str(o.name), conclusion: str(o.conclusion) };`).
For the linkage audit: the PR body and up to ten pages of the repository's issues and PRs `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:222-231` (`for (let page = 1; page <= 10; page++) {`).

## Outbound fields and egress

Repository content: no; the advisory body is fixed text `FailSafe/extension/src/integrations/github-checks/github-checks-map.ts:82-85` (`Operator-published notice only.`).
Metadata: yes, the repository slug, the HEAD SHA, the check name and conclusion, gated by the enable setting, a stored token and a modal consent `FailSafe/extension/src/extension/github-checks-command.ts:82-87` (`'Publish advisory',`).
The linkage check summary carries issue numbers and finding text only `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:140-141` (`Carries only issue numbers +`).
Graph relationships: yes, the PR-to-issue closing links are reported back to GitHub as the linkage check `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:148-153` (`name: 'FailSafe: PR Linkage',`).
Governance evidence: no on main; a verified SHIELD summary with receipt digests exists only in the unwired publisher `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:55-65` (`attestation: local HMAC (not CI-attested)`).
Destination: api.github.com or the configured API base URL `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:56-57` (`export function resolveApiBase(`).
In v6.0.8 the linkage reads always went to api.github.com, whatever the base URL; on main they use the resolved base `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:201` (`const base = `).

## Transformations

The publishable (name, conclusion) pairs are a closed set: the PR-linkage check with success, neutral or failure, the manual advisory with neutral only `FailSafe/extension/src/integrations/github-checks/github-checks-map.ts:22-25` (`['FailSafe Manual Advisory', new Set<CheckConclusion>(['neutral'])],`).
Any name that normalises to contain "shield" is refused by the generic path `FailSafe/extension/src/integrations/github-checks/github-checks-map.ts:42-44` (`.includes('shield')`).
The payload is copied field by field into a null-prototype object before checking and posting `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:73-76` (`Null prototype at every level`).
Linkage findings: a fail finding gives failure, a warn finding neutral, none success `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:128-130` (`const conclusion: CheckConclusion = hasFail ? 'failure' : hasWarn ? 'neutral' : 'success';`).
The repository slug is parsed from the remote URL and the host is ignored `FailSafe/extension/src/integrations/github-checks/github-checks-map.ts:47-48` (`The host is ignored.`).

## Persisted artifacts

None in the workspace or in GitHub beyond the posted check runs (unverified beyond the absence of file writes in the owned files).
Health evidence of the last advisory publish is kept in VS Code workspace state `FailSafe/extension/src/extension/github-checks-command.ts:93` (`recordIntegrationHealth('github-checks', ...healthFromGitHubPublish(result));`).
The unwired SHIELD publisher accepts a `recordPublication` callback that no caller supplies `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:48` (`recordPublication?: (p: ShieldPublication) => void`).

## Graph links

Implemented: PR to issue closing relationships, computed from the PR body and the issue list `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:39-49` (`export function parsePrLinkage(body: string): ParsedLinkage {`).
Implemented in code but unwired: commit to SHIELD receipt (session, ledger entry, Merkle seal) `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:56-63` (`Qor session: `).
Proposed (not built): receipt-to-check edges in the local relationship graph, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Publish Manual GitHub Advisory" `FailSafe/extension/package.json:166-167` (`"title": "FailSafe: Publish Manual GitHub Advisory"`).
A modal warning says no verified receipt exists and offers only "Publish advisory" `FailSafe/extension/src/extension/github-checks-command.ts:82-86` (`No verified SHIELD audit receipt is available.`).
The same command also publishes the PR-linkage check when HEAD has a PR `FailSafe/extension/src/extension/github-checks-command.ts:104-108` (`also publish the PR↔issue linkage check when HEAD has a PR`).
Status: a Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: an unverified SHIELD PASS cannot be posted; the SHIELD name with success needs a verified receipt for exactly that commit, repository and API host `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:88-93` (`SHIELD check refused: no verified receipt authority`).
Enforced: the API base host must equal the target host `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:113-115` (`TARGET_HOST_MISMATCH_ERROR`).
Enforced (main only): the token header is attached only when the request URL's origin equals the API base's origin `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:169-175` (`if (!headers) return { ok: false, error: TARGET_HOST_MISMATCH_ERROR };`).
Not enforced: a verified SHIELD receipt is bound to the API host without its port `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:92` (`target.apiHost.toLowerCase() !== authority.apiHost`); that publisher has no caller.
Advisory: the manual advisory and a neutral linkage result do not block a merge; GitHub treats neutral as passing `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:7-8` (`GitHub treats neutral as passing for required`).
Observed only: a failing linkage check blocks only where branch protection requires it, which FailSafe does not configure (unverified).
Not enforced: the fork guard exists, but the command never sets it, so a fork clone is not detected `FailSafe/extension/src/extension/github-checks-command.ts:39-43` (`function readGitContext(cwd: string): GitContext {`).

## Failure, offline, stale and permission semantics

Disabled or no token: a warning and no request `FailSafe/extension/src/extension/github-checks-command.ts:59-65` (`GitHub Checks publishing has no token.`).
No origin remote or HEAD: a warning and no request `FailSafe/extension/src/extension/github-checks-command.ts:74-76` (`Could not resolve the git origin remote and HEAD`).
401 or 403 is an auth failure and 422 an invalid head_sha or repository `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:132-137` (`GitHub rejected the check run (422)`).
A 2xx without a 201 and a positive integer id is not counted as published `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:141-142` (`if (!confirmed) return { ok: false, status: res.status, error: UNCONFIRMED_RESPONSE_ERROR };`).
The linkage audit treats a full tenth page as truncated and demotes unverifiable references to warnings `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:107-110` (`never fail on unverifiable existence`).
With a GitHub Enterprise base URL configured, the v6.0.8 linkage reads went to api.github.com with the same token (F11); on main they go to the base, and any response outside 2xx, a redirect included, fails the audit `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:208-211` (`const failed = (status: number) =>`).
The v6.0.8 transports dropped any port in the base URL; on main the port is kept and a redirect is returned, never followed `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:165-176` (`port: u.port ? Number(u.port) : undefined,`).
Compatibility break (main only): an `http://` API base for a host that is not this machine is refused with a message to change it to `https://`; v6.0.8 silently sent it over TLS on port 443 `FailSafe/extension/src/integrations/github-checks/github-host-affinity.ts:17-18` (`FailSafe sends the token only over https`).
A base URL with credentials, a query or a fragment is refused before any request `FailSafe/extension/src/integrations/github-checks/github-host-affinity.ts:31` (`if (u.username`).
Offline: a transport error is reported with the token redacted `FailSafe/extension/src/integrations/github-checks/check-run-transport.ts:180-182` (`split(token).join('[redacted]')`).
Requests time out after 8 seconds `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:176` (`timeout: 8000`).

## End-to-end scenario and measurable acceptance

Scenario: enable the integration, store a token, open a branch with a PR whose body says "Closes #1, #2", run the command, confirm, and see a neutral "FailSafe Manual Advisory" and a failing "FailSafe: PR Linkage" naming #2 `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:93-96` (`kind: 'multi-close-no-keyword', issue: n, severity: 'fail',`).
Metric: a publish counts only with a 201 and a check-run id, and the catalog records it as contract-verified (threshold: exact) `FailSafe/extension/src/integrations/github-checks/github-checks-health.ts:20-21` (`if (r.ok) return r.checkRunId ? ['contract-verified'] : ['connected'];`).
Existing tests: `FailSafe/extension/src/test/integrations/github-checks/github-checks.test.ts` asserts disabled, no token, fork and missing context make no request `FailSafe/extension/src/test/integrations/github-checks/github-checks.test.ts:177` (`disabled / no token / fork / missing context -> local-only, NO network`) (unit).
Installed-extension test: none runs the command in VS Code against a recorded GitHub service (unverified).
Live-service test: none (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The advisory and linkage checks work and are tested, and the transport refuses an unverified SHIELD PASS by construction. The customer value the review named, a SHIELD verdict a required check can trust, exists in code but has no caller; finishing it depends on native receipt attestation (the shield-receipts contract). The F11 base-URL defect and the dropped port are fixed on main (unreleased, #538); the unset fork guard and the dev-container endpoint pairing (B290) still affect what is sent where.

## Open defects

[B265] Fixed on main, unreleased (#538): the PR-linkage audit sent the GitHub token to api.github.com even when a GitHub Enterprise API base URL was configured (F11); it now takes the base `FailSafe/extension/src/integrations/github-checks/pr-linkage-audit.ts:165-176` (`export interface LinkageRunOptions {`).
Observed outside the LD3 list, filed as B278 (see Other findings in the portfolio): The fork guard `isFork` is never set by the command, although the setting text says fork-PR contexts degrade to local-only `FailSafe/extension/package.json:456-459` (`fork-PR contexts degrade to local-only`).
Fixed on main, unreleased (#538): B279, the default GitHub transports dropped the base URL's port `FailSafe/extension/src/integrations/github-checks/github-checks-client.ts:172` (`port: u.port ? Number(u.port) : undefined,`).
Filed as B290 (#538): a Dev Container or remote-machine `failsafe.integrations.github.apiBaseUrl` reads as user scope and is paired with the user token `FailSafe/extension/src/integrations/credentials/vscodeCredentialAdapters.ts:59` (`const user = text(i?.globalValue);`).
Not covered: with VS Code's proxy support a resolved proxy may replace the transport's agent, so the loopback address check for an http base may not run (unverified).
The documentation index row is stale (still "In review", PR #147) `docs/integrations/INTEGRATION_DOCS_INDEX.md:59` (`**GitHub Checks** (#96)`).
