# Jira integration contract

Contract id: `jira` (registry row `integration-contract-jira`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_JIRA_CONTRACT_REVIEW.md`. It planned OAuth 2.0 with `read:jira-work` and a later webhook phase; the shipped code uses Basic authentication with an API token and has no webhook.

**Owned files:**
- `FailSafe/extension/src/integrations/jira/`
- `FailSafe/extension/src/extension/jira-command.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/tracker-import/`, `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/shared/`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer is about to work on a Jira issue and wants the work to start as a governed FailSafe intent that records where it came from, without retyping the issue and without giving FailSafe any write access to Jira.

## Measurable value

Metric: the share of intents created from a tracker issue that carry a source reference, a fetch time and a content hash; on main every draft created through this path carries all three `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:286-289` (`sourceUpdatedAt: issue.sourceUpdatedAt ?? null, contentSha256: hash`).
Baseline: no usage data is collected, so the number of imports and the time saved are unverified.

## Why not simply ask an agent

An agent can read a pasted issue, but it cannot attach a verifiable provenance record, refuse to create a second active intent, or detect that the issue changed since the draft was made. This path does those three things locally and asks before it writes anything.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:60` (`Cloud REST v3`) lists the Jira Cloud REST documentation; that row still says "PR #148" under "In review", which is stale (unverified as to when it was last refreshed beyond its header date).
The code calls the REST v2 issue resource `FailSafe/extension/src/integrations/jira/jira-import.ts:41-42` (`/rest/api/2/issue/${encodeURIComponent(key)}`).

## Privileges and scopes

Credential: an Atlassian account email in settings and an API token in VS Code Secret Storage, sent as Basic authentication `FailSafe/extension/src/integrations/jira/jira-client.ts:40-41` (`Buffer.from(`); the token setting is deprecated and plain-text values are not read `FailSafe/extension/package.json:450-452` (`Plain-text settings are no longer read`).
Scope: the token carries the Atlassian account's own permissions; FailSafe only issues one GET `FailSafe/extension/src/integrations/jira/jira-client.ts:92` (`method: 'GET'`).
A user-level token is never sent to a base URL that workspace settings chose `FailSafe/extension/src/integrations/credentials/credentialGates.ts:125` (`ep.scope === 'workspace' && e.scope === 'user'`).
The base URL must be https or nothing is sent `FailSafe/extension/src/integrations/jira/jira-client.ts:57` (`The Jira base URL must use https; nothing was sent.`).
Any webhook, sync or write-back capability would need write or admin scopes and is marked requires separate approval (unverified: none is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| issue-preview | verified-shipped | `fetchJiraIssue` `FailSafe/extension/src/integrations/jira/jira-client.ts:48` (`export async function fetchJiraIssue(`) | `FailSafe/extension/src/extension/main.ts:262` (`registerJiraImportCommand(context, credentials.creds, credentials.endpoints)`) | `FailSafe/extension/src/test/integrations/jira/jira.test.ts` (unit) | Command `FailSafe/extension/package.json:161` (`"command": "failsafe.jira.import"`) |
| intent-draft | verified-shipped | `reviewAndImport` `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:208` (`export async function reviewAndImport(`) | `FailSafe/extension/src/extension/jira-command.ts:92` (`review: (issue) => reviewTrackerIssue(issue, vscodeReviewUi())`) | `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts` (installed-vscode) | Drafts need governance to install the intent deps first `FailSafe/extension/src/extension/integrationEvidenceWiring.ts:85` (`setTrackerIntentDeps({`) |
| backlog-sync | proposed | none | none | none | Not implemented; the module says nothing is synced `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:24` (`is not offered.`) |
| two-way-status-sync | proposed | none | none | none | Nothing is written to Jira `FailSafe/extension/src/extension/jira-command.ts:6` (`nothing is ever written to Jira and nothing is synced`) |

## Inbound fields

From the issue resource: key, summary, description, status, priority, assignee, labels, components, updated and issue type `FailSafe/extension/src/integrations/jira/jira-import.ts:38` (`export const JIRA_ISSUE_FIELDS = ['summary', 'description', 'status'`).
Unknown custom fields are ignored and missing fields tolerated `FailSafe/extension/src/integrations/jira/jira-import.ts:87-90` (`ignores unknown custom fields`).
The returned key must itself be a Jira key or the response is rejected `FailSafe/extension/src/integrations/jira/jira-import.ts:96-97` (`the returned key must itself be a Jira key`).

## Outbound fields and egress

Repository content: no; the request carries only the issue key in the path and the auth header `FailSafe/extension/src/integrations/jira/jira-client.ts:62-67` (`const url = `).
Metadata: yes, the issue key, a User-Agent of FailSafe and the Basic auth header, gated by the enable setting and a stored token `FailSafe/extension/src/extension/jira-command.ts:43-49` (`if (!deps.enabled) {`).
Graph relationships: no `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:10-11` (`Nothing is ever written back to the tracker and`).
Governance evidence: no; nothing is written to Jira `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:257` (`nothing is written to`).
Destination: the configured base URL over https only `FailSafe/extension/src/integrations/jira/jira-client.ts:90` (`const u = requireHttps(url);`).

## Transformations

The issue is mapped to an uncommitted preview, then to a tracker issue `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:57-62` (`export function fromJiraPreview(p: JiraIntentPreview): TrackerIssue {`).
The draft type is bugfix when the Jira issue type is Bug, otherwise feature `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:117` (`/^bug$/i.test(issue.issueType`).
Labels become sanitized `label:` tags capped at ten `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:121-127` (`.slice(0, 10)`).
The content hash is SHA-256 over the mapped fields `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:103-104` (`createHash('sha256')`).
Provider text is fenced in the preview so it renders no link, image or HTML `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:26-28` (`Provider text is untrusted`).

## Persisted artifacts

On approval: one intent in the canonical intent store with a CREATED history entry carrying the provenance `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:294-297` (`created = await intents.createIntent({`).
The history file is `.failsafe/manifest/intent_history.jsonl` in the workspace `FailSafe/extension/src/governance/IntentHistoryLog.ts:15` (`this.historyPath = path.join(manifestDir, 'intent_history.jsonl');`).
The description is not copied into the intent `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:257` (`The description is not copied`).
Health evidence of the last call (no free text) is kept in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).
The preview is an unsaved, untitled document `FailSafe/extension/src/extension/trackerReviewUi.ts:29` (`vscode.workspace.openTextDocument({ language: 'markdown', content: markdown })`).

## Graph links

Implemented: the intent's `externalRef` is `jira:<KEY>`, which links a draft to its issue `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:78-79` (`export function externalRefFor(issue: TrackerIssue)`).
Implemented: a re-import of a key whose earlier intent is sealed records `reimportOf` `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:290` (`reimportOf: last.intentId`).
Delivery (main only, not in v6.0.8): in Workspace > Delivery the issue step of an imported Jira intent is `recorded` from the content hash in its CREATED entry, never re-fetched `FailSafe/extension/src/governance/delivery/deliveryAssessment.ts:75` (`function issueStep(issue: DeliveryInputs['issue']): DeliveryStep {`), and the operator links the architecture documents and commits it delivered, each after a VS Code confirmation `FailSafe/extension/src/roadmap/routes/DeliveryRoute.ts:110` (`for (const action of ["link", "unlink"] as const) {`).
Proposed (not built): the issue-to-receipt edge, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Import Jira Issue as Intent Draft" `FailSafe/extension/package.json:161-162` (`"title": "FailSafe: Import Jira Issue as Intent Draft"`).
Input: an issue URL or key in an input box `FailSafe/extension/src/extension/jira-command.ts:81-84` (`Paste a Jira issue URL or key`).
Approval: a modal "Create intent draft" button, then an editable purpose, then a plan picker in enforce mode `FailSafe/extension/src/extension/trackerReviewUi.ts:32-33` (`{ modal: true, detail }, APPROVE`).
Status: a Console Integrations catalog card, read from `/api/v1/integrations/catalog` `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: no intent is created without an explicit modal approval `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:260-263` (`if (!(await ui.confirmCreate(`).
Enforced: in enforce mode a plan must be picked or nothing is saved `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:277-282` (`if (deps.governanceMode() === 'enforce') {`).
Enforced: another active intent blocks the import `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:245-248` (`Seal it before importing another issue.`).
Enforced: a history that fails its integrity check blocks the draft `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:223-226` (`if (lookup.integrity === 'invalid') {`).
Advisory: the draft's risk grade is always L1 and its file scope empty; the issue does not set either `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:295` (`scope: { files: [], modules: [], riskGrade: 'L1' }`).

## Failure, offline, stale and permission semantics

Disabled or no token: the command warns and returns not_authorized without a request `FailSafe/extension/src/extension/jira-command.ts:43-49` (`return { outcome: 'not_authorized' };`).
401 or 403 is an auth failure, 404 not found, 429 rate limited, other non-2xx an HTTP failure `FailSafe/extension/src/integrations/jira/jira-client.ts:69-74` (`Jira rate limit reached (HTTP 429).`).
Offline: a transport error is a network failure; the request times out after 8 seconds `FailSafe/extension/src/integrations/jira/jira-client.ts:92` (`timeout: 8000`).
Stale: when the issue changed since its draft, the outcome is stale and nothing is updated `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:238-240` (`return { outcome: 'stale', intentId: active.id };`).
Health evidence older than seven days shows the card as stale `FailSafe/extension/src/integrations/catalog/integration-health.ts:48` (`export const HEALTH_STALE_MS = 7 * 24 * 60 * 60 * 1000;`).
There is no retry or backoff on 429 (unverified beyond the absence of a retry in `fetchJiraIssue`).

## End-to-end scenario and measurable acceptance

Scenario: run the command, paste `PROJ-123`, read the preview, approve, accept the purpose, pick a plan, and find one PULSE intent whose CREATED entry holds `externalRef` `jira:PROJ-123`, the URL, the fetch time and the content hash `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:286-289` (`const provenance: Record<string, unknown> = {`).
Metric: after one approval exactly one intent exists, a declined preview leaves zero, and a repeat import of an unchanged issue leaves one (threshold: exact counts) `FailSafe/extension/src/test/integrations/conformance/contracts.ts:50-55` (`an intent was created without approval`), held for every intent-draft adapter by `FailSafe/extension/src/test/integrations/conformance/capability-conformance.test.ts:18-19` (`every catalog adapter passes every claimed contract`).
Existing test: `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts:1-3` (`the real Jira/Linear import runners against recorded HTTP fixtures`) (installed-vscode); no live Jira service is contacted `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts:5` (`No live provider was contacted`).
Installed-extension test: no test installs the packaged VSIX and runs this command (unverified).

## Recommended disposition

Recommendation for the owner: **MAINTAIN**. The single-issue preview and the approval-gated, provenance-carrying draft are built and tested in the extension host; the open work is product reach (the part B slice in `INTEGRATION_SCENARIOS.md` uses Jira as its issue source), not repair. Sync and write-back stay out of scope until a separate approval for write scopes.

## Open defects

No open B-item is specific to Jira on main (unverified: searched `docs/BACKLOG.md` for "Jira" at c36b9ee2).
The documentation index row is stale (still "In review", PR #148) `docs/integrations/INTEGRATION_DOCS_INDEX.md:60` (`PR #148 (uses REST v2 for string descriptions)`).
