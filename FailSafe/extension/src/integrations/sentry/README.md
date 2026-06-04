# Sentry integration

> One-line: FailSafe pulls a Sentry project's live (unresolved) issues read-only and records each as a runtime-regression risk so production errors surface in the governance risk register.

- **Pattern:** ingest
- **Direction:** read-only
- **Status:** in review (#150)
- **Official docs:** API — https://docs.sentry.io/api/ · Releases — https://docs.sentry.io/api/releases/ · GitHub source-code mgmt — https://docs.sentry.io/organization/integrations/source-code-mgmt/github/
- **Backlog:** #102

## What it does
On demand, FailSafe fetches a Sentry project's issues (defaulting to `is:unresolved`, optionally scoped to one environment) and maps each issue to a FailSafe risk record. Records are keyed-idempotent by issue `id` (`sentry:<id>`), so re-importing the same project upserts rather than duplicates. The import is a WARN-only governance signal — every imported risk lands with status `open` for the operator to triage. Nothing in Sentry is mutated, and no raw event payloads are stored.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.sentry.enabled` | `false` | no | Master on/off. When off, the import short-circuits with no network call. |
| `failsafe.integrations.sentry.token` | — | yes | Sentry auth token, sent only as the outbound `Bearer` header. |
| `failsafe.integrations.sentry.org` | — | no | Sentry organization slug. |
| `failsafe.integrations.sentry.project` | — | no | Sentry project slug. |
| `failsafe.integrations.sentry.environment` | — | no | Optional environment; folded into the search query as `environment:<name>`. |
| `failsafe.integrations.sentry.query` | `is:unresolved` | no | Search query limiting the import to live regressions. |

The import degrades to local-only (no network) when disabled or when token, org, and project are not all configured.

## Security
The auth token is a secret: it is placed only in the outbound `Authorization: Bearer <token>` header by the transport, and is never returned in the result or logged. The pure mapper reads only the canonical fields named below — never the raw event payload. The integration is read-only (no mutation of Sentry) and off by default; with no token/org/project or when disabled it makes no network call.

## Command / wiring
`FailSafe: Import Sentry Regressions` (command id `failsafe.sentry.import`) — fetches the project's issues and upserts each mapped risk into the risk register.

## Files
- `sentry-to-risk.ts` — pure logic: defensive parse of the issues response + canonical issue → FailSafe risk record mapping (no fs / no network / no secrets)
- `sentry-client.ts` — injectable transport: builds the issues path/query, calls Sentry, maps results, and orchestrates the upsert
- test: `src/test/integrations/sentry/sentry.test.ts`

## Verified surface
- Endpoint: `GET /api/0/projects/{org}/{project}/issues/` — project-issues list (docs.sentry.io/api/events/list-a-projects-issues/)
- Query param: `query` — carries `is:unresolved` and, when set, `environment:<name>`; the endpoint has NO standalone environment param
- Auth header: `Authorization: Bearer <token>`
- List-response fields read: `id`, `title`, `culprit`, `level`, `status`, `permalink`, `firstSeen`, `lastSeen`, `project.slug`
- `firstRelease` / `lastRelease` (release `version`) are present only on the issue-DETAIL endpoint (`/issues/{id}/`, docs.sentry.io/api/events/retrieve-an-issue/) — always empty on the list path; the reader is inert until a future detail-enrichment pass
- No raw event payloads are stored
