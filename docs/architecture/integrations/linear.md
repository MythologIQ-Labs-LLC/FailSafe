# Linear integration contract

Contract id: `linear` (registry row `integration-contract-linear`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_LINEAR_CONTRACT_REVIEW.md`. It recommended OAuth or a team-scoped key, a webhook phase two and dynamic handling of rate-limit headers; the shipped code takes a personal API key, has no webhook, and reads the rate-limit headers without acting on them.

**Owned files:**
- `FailSafe/extension/src/integrations/linear/`
- `FailSafe/extension/src/extension/linear-command.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/tracker-import/`, `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/shared/`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A developer picks up a Linear issue and wants the work to begin as a governed FailSafe intent that records which issue it came from, without copying the issue by hand and without giving FailSafe write access to Linear.

## Measurable value

Metric: the share of tracker-sourced intents that carry a source reference, a fetch time and a content hash; every draft made on this path carries all three `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:286-289` (`sourceUpdatedAt: issue.sourceUpdatedAt ?? null, contentSha256: hash`).
Baseline: no usage data is collected, so the number of imports and the time saved are unverified.

## Why not simply ask an agent

An agent can summarise a pasted issue, but it cannot bind the resulting intent to a hash of the issue it read, refuse a second active intent, or tell the developer later that the issue changed. This path does that locally and writes nothing until the developer approves.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:57` (`https://linear.app/docs/api-and-webhooks`) lists the Linear API and GraphQL documentation; the row still sits under "In review" with "PR #145", which is stale.
The code posts one GraphQL query to the fixed endpoint `FailSafe/extension/src/integrations/linear/linear-client.ts:21` (`const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';`).

## Privileges and scopes

Credential: a Linear API key in VS Code Secret Storage, sent as the Authorization header `FailSafe/extension/src/integrations/linear/linear-client.ts:72` (`{ 'Content-Type': 'application/json', Authorization: apiKey }`).
The plain-text setting is deprecated and not read `FailSafe/extension/package.json:429-431` (`Plain-text settings are no longer read.`).
Scope: the key carries its owner's Linear permissions; FailSafe sends only a read query `FailSafe/extension/src/integrations/linear/linear-import.ts:39-42` (`query FailSafeIssue($id: String!) { issue(id: $id) {`).
The endpoint is not configurable from settings: the command never passes one `FailSafe/extension/src/extension/linear-command.ts:48` (`fetchLinearIssue(issue, apiKey, deps.post)`).
Any webhook, sync or write-back capability would need write scopes and is marked requires separate approval (unverified: none is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| issue-preview | verified-shipped | `fetchLinearIssue` `FailSafe/extension/src/integrations/linear/linear-client.ts:58` (`export async function fetchLinearIssue(`) | `FailSafe/extension/src/extension/main.ts:261` (`registerLinearImportCommand(context, credentials.creds)`) | `FailSafe/extension/src/test/integrations/linear/linear.test.ts` (unit) | Command `FailSafe/extension/package.json:156` (`"command": "failsafe.linear.import"`) |
| intent-draft | verified-shipped | `reviewAndImport` `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:208` (`export async function reviewAndImport(`) | `FailSafe/extension/src/extension/linear-command.ts:77` (`review: (issue) => reviewTrackerIssue(issue, vscodeReviewUi())`) | `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts` (installed-vscode) | Drafts need governance to install the intent deps first `FailSafe/extension/src/extension/integrationEvidenceWiring.ts:85` (`setTrackerIntentDeps({`) |
| rate-limit-awareness | shipped-inert | `readRateLimit` `FailSafe/extension/src/integrations/linear/linear-client.ts:41` (`export function readRateLimit(`) | none | none | Absent call site: the parsed headers are returned in the result but no caller reads `rateLimit` `FailSafe/extension/src/extension/linear-command.ts:48-49` (`recordIntegrationHealth('linear', ...healthFromLinearFetch(result));`) |
| backlog-sync | proposed | none | none | none | Not implemented; nothing is synced `FailSafe/extension/src/extension/linear-command.ts:6` (`nothing is written to Linear and nothing is synced`) |
| two-way-status-sync | proposed | none | none | none | No mutation and no webhook `FailSafe/extension/src/integrations/linear/linear-import.ts:6` (`UNCOMMITTED intent preview. NO mutation, NO webhooks (phase two)`) |

## Inbound fields

From the GraphQL issue node: identifier, title, description, priority, url, updatedAt, state name and type, assignee name and label names `FailSafe/extension/src/integrations/linear/linear-import.ts:40-42` (`'identifier title description priority url updatedAt '`).
A response without an issue node or identifier is rejected `FailSafe/extension/src/integrations/linear/linear-import.ts:78-80` (`if (!identifier) return null;`).
The numeric priority is mapped to a label (No priority, Urgent, High, Medium, Low) `FailSafe/extension/src/integrations/linear/linear-import.ts:120` (`const PRIORITY_LABEL = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];`).
Rate-limit response headers are parsed when present `FailSafe/extension/src/integrations/linear/linear-client.ts:44-46` (`X-RateLimit-Requests-Remaining`).

## Outbound fields and egress

Repository content: no; the request body is the fixed query and the issue identifier `FailSafe/extension/src/integrations/linear/linear-import.ts:47-48` (`return { query: LINEAR_ISSUE_QUERY, variables: { id: identifier } };`).
Metadata: yes, the identifier and the API key header, gated by the enable setting and a stored key `FailSafe/extension/src/extension/linear-command.ts:39-44` (`if (!deps.enabled) {`).
Graph relationships: no `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:10-11` (`Nothing is ever written back to the tracker and`).
Governance evidence: no; nothing is written to Linear `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:257` (`nothing is written to`).
Destination: `api.linear.app` over https only `FailSafe/extension/src/integrations/linear/linear-client.ts:96` (`const u = requireHttps(url);`).

## Transformations

The preview is mapped to a tracker issue; Linear has no components, so that list is empty `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:65-71` (`export function fromLinearPreview(p: LinearIntentPreview): TrackerIssue {`).
The draft type is bugfix when a label is exactly Bug, otherwise feature `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:118` (`return issue.labels.some((l) => /^bug$/i.test(l)) ? 'bugfix' : 'feature';`).
Labels become sanitised `label:` tags capped at ten `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:121-127` (`.slice(0, 10)`).
The content hash is SHA-256 over the mapped fields `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:103-104` (`createHash('sha256')`).
The source revision time is Linear's updatedAt `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:70` (`sourceUpdatedAt: p.updatedAt,`).

## Persisted artifacts

On approval: one intent in the canonical intent store with a CREATED history entry carrying the provenance `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:294-297` (`created = await intents.createIntent({`).
The history file is `.failsafe/manifest/intent_history.jsonl` in the workspace `FailSafe/extension/src/governance/IntentHistoryLog.ts:15` (`this.historyPath = path.join(manifestDir, 'intent_history.jsonl');`).
The description is not copied into the intent `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:257` (`The description is not copied`).
Health evidence of the last call is kept in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).
The preview is an unsaved, untitled document `FailSafe/extension/src/extension/trackerReviewUi.ts:29` (`vscode.workspace.openTextDocument({ language: 'markdown', content: markdown })`).

## Graph links

Implemented: the intent's externalRef is `linear:<IDENTIFIER>`, which links a draft to its issue `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:78-79` (`export function externalRefFor(issue: TrackerIssue)`).
Implemented: a re-import of an identifier whose earlier intent is sealed records `reimportOf` `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:290` (`reimportOf: last.intentId`).
Delivery (main only, not in v6.0.8): in Workspace > Delivery the issue step of an imported Linear intent is `recorded` from the content hash in its CREATED entry, never re-fetched `FailSafe/extension/src/governance/delivery/deliveryAssessment.ts:75` (`function issueStep(issue: DeliveryInputs['issue']): DeliveryStep {`), and the operator links the architecture documents and commits it delivered, each after a VS Code confirmation `FailSafe/extension/src/roadmap/routes/DeliveryRoute.ts:110` (`for (const action of ["link", "unlink"] as const) {`).
Proposed (not built): the issue-to-receipt edge, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Import Linear Issue as Intent Draft" `FailSafe/extension/package.json:156-157` (`"title": "FailSafe: Import Linear Issue as Intent Draft"`).
Input: an issue URL or identifier in an input box `FailSafe/extension/src/extension/linear-command.ts:69` (`Paste a Linear issue URL or identifier (e.g. ENG-123)`).
Approval: a modal "Create intent draft" button, then an editable purpose, then a plan picker in enforce mode `FailSafe/extension/src/extension/trackerReviewUi.ts:32-33` (`{ modal: true, detail }, APPROVE`).
Status: a Console Integrations catalog card, read from `/api/v1/integrations/catalog` `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: no intent is created without an explicit modal approval `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:260-263` (`if (!(await ui.confirmCreate(`).
Enforced: in enforce mode a plan must be picked or nothing is saved `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:277-282` (`if (deps.governanceMode() === 'enforce') {`).
Enforced: another active intent blocks the import `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:245-248` (`Seal it before importing another issue.`).
Enforced: a history that fails its integrity check blocks the draft `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:223-226` (`if (lookup.integrity === 'invalid') {`).
Advisory: the draft's risk grade is always L1 and its file scope empty `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:295` (`scope: { files: [], modules: [], riskGrade: 'L1' }`).

## Failure, offline, stale and permission semantics

Disabled or no key: the command warns and returns not_authorized without a request `FailSafe/extension/src/extension/linear-command.ts:39-44` (`return { outcome: 'not_authorized' };`).
401 or 403 is an auth failure, 429 rate limited, other non-2xx an HTTP failure `FailSafe/extension/src/integrations/linear/linear-client.ts:76-78` (`Linear rate limit reached (HTTP 429).`).
A missing issue (a 200 with a GraphQL errors array) is a contract failure, not not_found `FailSafe/extension/src/integrations/linear/linear-client.ts:82-85` (`failure: 'contract', error: `).
Because the client never reports not_found, the "imported before" note for a vanished Linear issue never appears `FailSafe/extension/src/extension/linear-command.ts:52` (`result.failure === 'not_found' && key`).
Offline: a transport error is a network failure; the request times out after 8 seconds `FailSafe/extension/src/integrations/linear/linear-client.ts:99` (`timeout: 8000`).
Stale: when the issue changed since its draft, the outcome is stale and nothing is updated `FailSafe/extension/src/integrations/tracker-import/tracker-intent-import.ts:238-240` (`return { outcome: 'stale', intentId: active.id };`).
There is no retry or backoff on 429 (unverified beyond the absence of a retry in `fetchLinearIssue`).

## End-to-end scenario and measurable acceptance

Scenario: run the command, paste `ENG-42`, read the preview, approve, accept the purpose, pick a plan, and find one intent whose externalRef is `linear:ENG-42` with label tags `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts:272-277` (`assert.equal(intent?.metadata.externalRef, 'linear:ENG-42');`).
Metric: after one approval exactly one intent exists, a declined preview leaves zero, and a repeat import of an unchanged issue leaves one (threshold: exact counts) `FailSafe/extension/src/test/integrations/conformance/contracts.ts:50-55` (`an intent was created without approval`).
Existing test: `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts:1-3` (`the real Jira/Linear import runners against recorded HTTP fixtures`) (installed-vscode); no live Linear service is contacted `FailSafe/extension/src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts:5` (`No live provider was contacted`).
Installed-extension test: no test installs the packaged VSIX and runs this command (unverified).

## Recommended disposition

Recommendation for the owner: **MAINTAIN**. The single-issue preview and the approval-gated draft with provenance are built and tested in the extension host and share one tested path with Jira. The open items are small (the unused rate-limit headers and the unreachable earlier-import note); sync and write-back stay out of scope until write scopes are separately approved.

## Open defects

Observed outside the LD3 list, filed as B280 (see Other findings in the portfolio): The earlier-import note never fires for Linear because a missing issue is reported as a contract failure `FailSafe/extension/src/integrations/linear/linear-client.ts:85` (`Issue ${id} not found (or no access).`).
Live-account validation of Linear is open as `[B230]` `docs/BACKLOG.md:586` (`Validate Jira, Linear, Sentry and OpenHands against live disposable accounts`).
The documentation index row is stale (still "In review", PR #145) `docs/integrations/INTEGRATION_DOCS_INDEX.md:57` (`**Linear** (#97)`).
