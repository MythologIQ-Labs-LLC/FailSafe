# Sentry integration contract

Contract id: `sentry` (registry row `integration-contract-sentry`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_SENTRY_CONTRACT_REVIEW.md`. It scoped a v1 that imports issues with release, suspect-commit and changed-file evidence and surfaces "correlation incomplete" states; the shipped code imports issues and issue-detail release versions only, with no commit or file correlation.

**Owned files:**
- `FailSafe/extension/src/integrations/sentry/`
- `FailSafe/extension/src/extension/sentry-command.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/catalog/`, and the risk register writers `FailSafe/extension/src/roadmap/services/riskImportBatch.ts` and `FailSafe/extension/src/roadmap/services/RiskRegisterManager.ts`.

## Customer job

A team wants production errors from one Sentry project to appear in the FailSafe risk register next to the code they belong to, so that governance decisions about a change can see live regressions without anyone copying them over.

## Measurable value

Metric: unresolved Sentry issues of the configured project present as `sentry:<id>` risks after one import, with operator triage kept across re-imports `FailSafe/extension/src/integrations/sentry/sentry-import.ts:102-111` (`Merge Sentry-owned fields over the record stored at write time`).
Baseline: no usage data is collected, so how many regressions reach a governance decision this way is unverified.

## Why not simply ask an agent

An agent can be pointed at the Sentry UI, but it does not write a deduplicated, idempotent risk record that survives the operator's triage, honour Sentry's rate limits, or refuse to send the token anywhere but the configured base. This path does those things and records nothing on a failed or cancelled listing.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:68` (`API — https://docs.sentry.io/api/`) lists the Sentry API and Releases documentation; the row still sits under "Planned (backlog)", which is stale.
The code lists `GET /api/0/organizations/{org}/issues/` filtered by project `FailSafe/extension/src/integrations/sentry/sentry-client.ts:57-65` (`params.set('sort', 'date');`).
Release versions come from the issue-detail endpoint `FailSafe/extension/src/integrations/sentry/sentry-releases.ts:3-4` (`GET {base}/api/0/organizations/{org}/issues/{id}/`).

## Privileges and scopes

Credential: a Sentry auth token in VS Code Secret Storage, sent as a Bearer header `FailSafe/extension/src/integrations/sentry/sentry-client.ts:120` (`Authorization: `).
The setting text asks for an org-level or internal-integration token with project:read and event:read `FailSafe/extension/package.json:473-477` (`project:read`).
The token and API base URL come together from the credential gate, so a user token is never sent to a workspace-chosen base `FailSafe/extension/src/integrations/sentry/sentry-settings.ts:4-6` (`token is never sent to a workspace-chosen endpoint`).
The base must be HTTPS and every request must lie under it `FailSafe/extension/src/integrations/sentry/sentry-transport.ts:96-100` (`if (u.protocol !== 'https:'`).
Pagination links are followed only on the same origin and path `FailSafe/extension/src/integrations/sentry/sentry-client.ts:78-80` (`Untrusted Sentry pagination destination`).
Release automation, commit correlation or alert webhooks would need further scopes and are marked requires separate approval (unverified: none is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| risk-ingest | verified-shipped | `importSentryRisks` `FailSafe/extension/src/integrations/sentry/sentry-import.ts:139` (`export async function importSentryRisks(`) | `FailSafe/extension/src/extension/main.ts:269` (`registerSentryImportCommand(context, core.workspaceRoot, credentials.creds, credentials.endpoints)`) | `FailSafe/extension/src/test/integrations/sentry/sentry-import.test.ts` (unit) | Command `FailSafe/extension/package.json:170` (`"command": "failsafe.sentry.import"`) |
| release-association | verified-shipped | `importSentryRisks` `FailSafe/extension/src/integrations/sentry/sentry-import.ts:147-149` (`const lookups = await lookupReleases(issues, {`) | `FailSafe/extension/src/extension/sentry-command.ts:46` (`(_progress, token) => importSentryRisks(`) | `FailSafe/extension/src/test/integrations/sentry/sentry-releases.test.ts` (unit) | Capped per import by a setting `FailSafe/extension/package.json:504-509` (`How many issues per import get an issue-detail lookup`) |
| import-report | verified-shipped | `describeSentryImport` `FailSafe/extension/src/integrations/sentry/sentry-report.ts:46` (`export function describeSentryImport(`) | `FailSafe/extension/src/extension/sentry-command.ts:28` (`const { level, text } = describeSentryImport(outcome, scope);`) | `FailSafe/extension/src/test/integrations/sentry/sentry-import.test.ts` (unit) | - |
| commit-correlation | proposed | none | none | none | Not implemented: no commit correlation `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:11-12` (`never from list items; no commit correlation (#478)`) |
| alert-webhook | proposed | none | none | none | Not implemented; the import is a pull command only (unverified beyond the absence of any webhook route in the owned files) |

## Inbound fields

From each list item: id, shortId, title, culprit, level, status, permalink, project slug, environment, firstSeen and lastSeen `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:56-68` (`sourceUrl: str(issue.permalink),`).
From an issue-detail response: firstRelease and lastRelease version, lastRelease dateReleased and ref `FailSafe/extension/src/integrations/sentry/sentry-releases.ts:48-50` (`['first', first?.version], ['last', last?.version]`).
Raw event payloads are never read `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:9-10` (`reads ONLY the canonical fields named below`).
An item without an id is skipped and counted `FailSafe/extension/src/integrations/sentry/sentry-import.ts:75-81` (`out.skipped++;`).

## Outbound fields and egress

Repository content: no; requests carry the org, project, query, environment and issue ids only `FailSafe/extension/src/integrations/sentry/sentry-client.ts:58-64` (`params.set('project', project);`).
Metadata: yes, the org and project slugs, the search query (default is:unresolved) and the Bearer token, gated by the enable setting and a stored token `FailSafe/extension/src/integrations/sentry/sentry-client.ts:92-94` (`token, org, and project must all be configured`).
Graph relationships: no (unverified beyond the absence of any write call in the owned files).
Governance evidence: no; every request is a GET `FailSafe/extension/src/integrations/sentry/sentry-transport.ts:165` (`method: 'GET'`).
Destination: sentry.io or the configured self-hosted HTTPS base `FailSafe/extension/src/integrations/sentry/sentry-client.ts:97-98` (`Sentry API URL must use HTTPS.`).

## Transformations

Sentry level maps to risk severity: fatal and error to high, warning to warn, info, debug and sample to info, anything else to warn `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:21-23` (`fatal: 'high', error: 'high', warning: 'warn'`).
The risk id is `sentry:<issue id>`, so a re-import upserts instead of duplicating `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:89` (`source: 'sentry',`).
The title is cut at 160 characters `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:90` (`title: issue.title.slice(0, 160),`).
Only Sentry-owned fields are replaced; status and operator edits are kept `FailSafe/extension/src/integrations/sentry/sentry-import.ts:57` (`const SENTRY_OWNED = ['id', 'title', 'severity', 'source', 'location', 'provenance', 'updatedAt'];`).
A stored release is carried forward only in the exact shape a detail lookup writes `FailSafe/extension/src/integrations/sentry/sentry-releases.ts:57-58` (`A stored release may be carried forward only in exactly the shape a detail lookup writes`).
Duplicate list items are counted and dropped `FailSafe/extension/src/integrations/sentry/sentry-import.ts:84` (`if (seen.has(issue.id)) { out.duplicates++; return; }`).

## Persisted artifacts

Risk records in the workspace risk register `.failsafe/risks/risks.json` `FailSafe/extension/src/shared/risk-store/RiskStore.ts:97` (`this.risksPath = path.resolve(workspaceRoot, ".failsafe", "risks", "risks.json");`).
Writes go in one register update per 500 issues `FailSafe/extension/src/extension/sentry-command.ts:42-43` (`one register update per 500 issues`).
Each record carries provenance: tool, project, environment, shortId, status, first and last seen, and the release block when verified `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:80-86` (`const provenance: Record<string, unknown> = { tool: 'sentry' };`).
Nothing is written when the listing fails or the import is cancelled `FailSafe/extension/src/integrations/sentry/sentry-import.ts:8-9` (`Nothing is written when`).
Health evidence of the last import is kept in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).

## Graph links

Implemented: each risk links to its Sentry issue by permalink `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:96` (`if (issue.sourceUrl) risk.location = { url: issue.sourceUrl };`).
Implemented: release versions recorded with their source and lookup time `FailSafe/extension/src/integrations/sentry/sentry-releases.ts:7-8` (`Release data is recorded only from a detail response`).
Proposed (not built): error-to-commit, error-to-file and fix-to-receipt edges, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` scenario 2 (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Import Sentry Regressions" `FailSafe/extension/package.json:170-171` (`"title": "FailSafe: Import Sentry Regressions"`).
A cancellable progress notification runs the import `FailSafe/extension/src/extension/sentry-command.ts:45` (`title: 'Importing Sentry regressions…', cancellable: true`).
The outcome is shown at the level the report assigns: error, warning or information `FailSafe/extension/src/extension/sentry-command.ts:29-31` (`vscode.window.showErrorMessage(text);`).
Settings: org, project, environment, API base URL, query and release-lookup cap `FailSafe/extension/package.json:479-509` (`failsafe.integrations.sentry.org`).
Status: a Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Advisory: an imported risk is a warn-level signal for the operator to triage; it blocks nothing `FailSafe/extension/src/integrations/sentry/sentry-to-risk.ts:6-7` (`WARN-only governance signal; the operator triages`).
Enforced: the token is never sent outside the configured HTTPS base `FailSafe/extension/src/integrations/sentry/sentry-transport.ts:4-5` (`refuses before sending unless the URL is HTTPS and lies`).
Enforced: an org value that is not a slug sends nothing `FailSafe/extension/src/integrations/sentry/sentry-client.ts:95` (`Sentry org must be an organization slug; nothing was requested.`).
Enforced: triage status is never overwritten by a re-import `FailSafe/extension/src/integrations/sentry/sentry-import.ts:6-8` (`keeps its status and`).

## Failure, offline, stale and permission semantics

Disabled or incomplete settings: a local-only outcome with no request `FailSafe/extension/src/integrations/sentry/sentry-client.ts:92-94` (`integration disabled`).
401 or 403 is an auth failure and 404 means the org or project was not found `FailSafe/extension/src/integrations/sentry/sentry-client.ts:110-111` (`Sentry auth failed — check token/project scope; no risks imported.`).
429, timeouts and 5xx are retried at most three times with 1, 2 and 4 second backoff, every wait capped at 60 seconds `FailSafe/extension/src/integrations/sentry/sentry-transport.ts:52-54` (`export const MAX_RETRIES = 3;`).
Release lookups stop at a rate limit, a cancellation or three consecutive failures `FailSafe/extension/src/integrations/sentry/sentry-releases.ts:5-7` (`stop at a rate limit, a cancellation, or three consecutive`).
More than 10 pages of issues stops the import with nothing written; no setting raises the page cap `FailSafe/extension/src/integrations/sentry/sentry-client.ts:136-149` (`Sentry pagination limit reached; no partial risks imported.`).
Stale: a risk is updated only by the next import; there is no schedule (unverified beyond the command being the only caller of `importSentryRisks` in the owned files).
Offline: a transport error ends the listing with nothing imported `FailSafe/extension/src/integrations/sentry/sentry-client.ts:108` (`Sentry transport failed; no risks imported.`).

## End-to-end scenario and measurable acceptance

Scenario: enable the integration, store a token, set org and project, run the command, and find each unresolved issue as a `sentry:<id>` risk with its permalink and verified releases, while a risk the operator closed stays closed after a second import `FailSafe/extension/src/integrations/sentry/sentry-import.ts:6-8` (`a risk the`).
Metric: a re-run over the same issues produces the same ids (idempotent ingest) and a throwing sink is counted failed (threshold: exact) `FailSafe/extension/src/test/integrations/conformance/contracts.ts:67-71` (`a re-run produced different ids (not idempotent)`).
Existing tests: `FailSafe/extension/src/test/integrations/sentry/sentry-import.test.ts` and `FailSafe/extension/src/test/integrations/sentry/sentry-releases.test.ts` drive `importSentryRisks` against an in-memory server `FailSafe/extension/src/test/integrations/sentry/sentry-releases.test.ts:20` (`const run = (s: Server, opts = OPTS, ctx = context()) => importSentryRisks(opts, s.get, sink, ctx);`) (unit).
Installed-extension test: none runs the command in VS Code against a recorded Sentry service (unverified).
Live-service test: none; live validation is open as B230 `docs/BACKLOG.md:586` (`Validate Jira, Linear, Sentry and OpenHands against live disposable accounts`).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The issue import with release versions is built, bounded and tested, but the customer value the legacy review named (an error tied to the change that caused it) needs commit and file correlation, which does not exist. It is also the source of the portfolio's scenario 2 (production error to fix to receipt), so finishing that correlation is the shortest path to a demonstrable journey.

## Open defects

Live-account validation is open as `[B230]` `docs/BACKLOG.md:586` (`Validate Jira, Linear, Sentry and OpenHands against live disposable accounts`).
The documentation index still lists Sentry as planned `docs/integrations/INTEGRATION_DOCS_INDEX.md:68` (`**Sentry** (#102)`).
