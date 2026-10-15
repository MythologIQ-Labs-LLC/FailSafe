# Sentry integration

> One-line: FailSafe pulls a Sentry project's live (unresolved) issues read-only, records each as a runtime-regression risk with its first and last release, and reports exactly what the import created, updated, left unchanged or failed to write.

- **Pattern:** ingest
- **Direction:** read-only
- **Status:** import complete with release association (#478); live-provider acceptance pending (no Sentry credentials on the acceptance machine)
- **Official docs:** Organization issues — https://docs.sentry.io/api/events/list-an-organizations-issues/ · Issue detail — https://docs.sentry.io/api/events/retrieve-an-issue/ · Rate limits — https://docs.sentry.io/api/ratelimits/
- **Backlog:** #102, #478

## What it does
On demand, FailSafe lists a Sentry project's issues and maps each one to a risk record keyed `sentry:<id>`, so a re-import updates rather than duplicates. The stages run in a fixed order, and nothing is written unless every list page arrived and the import was not cancelled:

1. **List.** `GET {base}/api/0/organizations/{org}/issues/?project=<slug>&query=<query>&sort=date&limit=100[&environment=<env>]`, following `Link` pagination only to `rel="next"; results="true"` on the same HTTPS origin and path (10 pages by default, 20 at most). The project-issues endpoint is deprecated. `sort=date` (Last Seen) is pinned because Sentry documents no default order.
2. **Parse and dedupe.** Items that are not objects or have no `id` are skipped (with reasons). Repeated ids count as duplicates; the first wins.
3. **Release lookups.** List responses carry no release fields, so each issue's first and last release come from `GET {base}/api/0/organizations/{org}/issues/{id}/`.
   - At most `maxReleaseLookups` issues are looked up per import, in list order, so the most recently seen first.
   - Lookups stop at a Sentry rate limit, at cancellation, or after three consecutive failures.
   - A lookup records `provenance.release` = {`source: 'sentry-issue-detail'`, `first`, `last`, `lastReleasedAt`, `ref`, `verifiedAt`}.
   - An issue not looked up this time keeps a release an earlier lookup stored in exactly that shape, with its original `verifiedAt`. Any other stored value is dropped.
4. **Write.** Each record is merged and written in one synchronous call against the record stored at that moment.
   - Sentry owns `id`, `title`, `severity`, `source`, `location`, `provenance` and `updatedAt`.
   - Everything else is kept, including a status you set: a risk you closed stays closed, even if you close it while the import is running.
   - A record whose Sentry data did not change is not rewritten.

FailSafe performs no commit or pull-request correlation, mutates nothing in Sentry, and stores no raw event payloads.

## Outcome
The message reports pages fetched, then `created` / `updated` / `unchanged` / `failed` per unique issue, `skipped` and duplicate counts, and release counts: found, without a release, failed, not looked up, kept from an earlier lookup, and dropped. The level is chosen in this order:

| Outcome | Level |
|---|---|
| The list failed, or the org is not a valid slug — nothing imported | error |
| Cancelled — nothing imported; the message names the next cursor | warning |
| Not configured (disabled, or token / org / project missing) | warning |
| No issues to import | info |
| Every write failed | error |
| Some writes failed | warning |
| Release lookups stopped early | warning |
| Otherwise | info |

A failed write is never counted as saved. Retrying a failed or cancelled import restarts from the first page; the cursor in the message is for diagnosis only.

## Rate limits and retries
Every request goes through one transport:
- A 429 waits until `X-Sentry-Rate-Limit-Reset` (UTC epoch seconds); without it, `Retry-After` seconds; otherwise backoff.
- Timeouts, transport errors and 5xx back off 1 s, 2 s, then 4 s. That is at most 4 requests per call, and every wait is capped at 60 s.
- A response with `X-Sentry-Rate-Limit-Remaining: 0` delays the next request until reset.
- Other 4xx responses are not retried.
- Header names are read case-insensitively.

Sentry documents the rate-limit headers but neither the limited status code nor `Retry-After`, so both are handled defensively.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.sentry.enabled` | `false` | no | Master on/off. When off, the import makes no request. |
| `failsafe.integrations.sentry.token` | — | yes | Sentry auth token, sent only as the `Authorization: Bearer` header. |
| `failsafe.integrations.sentry.org` | — | no | Sentry organization slug (letters, digits, `.`, `_`, `-`; must not start with `.`). |
| `failsafe.integrations.sentry.project` | — | no | Sentry project slug or ID. |
| `failsafe.integrations.sentry.environment` | — | no | Optional environment, sent as the `environment` filter. |
| `failsafe.integrations.sentry.apiBaseUrl` | `https://sentry.io` | no | Self-hosted base URL (HTTPS; a subpath is kept). Requests never leave it. |
| `failsafe.integrations.sentry.query` | `is:unresolved` | no | Search query; blank means `is:unresolved`. |
| `failsafe.integrations.sentry.maxReleaseLookups` | `50` | no | Issue-detail lookups per import, 0-200; 0 turns release lookups off. |

## Security
The token is placed only in the outbound `Authorization` header and is never returned in an outcome, a message or a log. Before any request, the transport refuses a URL that is not HTTPS, carries credentials, or does not lie under the configured base (host case and default port normalized). Pagination links that leave the origin or path are refused, and the import fails closed. The org must be a slug and issue ids must be numeric before they enter a path.

## Limitations
- Live-provider acceptance is pending; the suites drive deterministic fixtures through the injected transport, clock and sleep.
- The list request sends no `statsPeriod`. Sentry documents no default time window for this endpoint, so whether the server applies one is unverified until live acceptance.
- Sentry issues that become resolved drop out of the `is:unresolved` list; the import never closes or reopens a risk.
- Writers in another process (a second VS Code window on the same folder) can still race this store.
- **#517:** `qorelogic/risk/RiskManager.ts` keeps `risks.json` in memory from activation and rewrites the whole file when it saves, which erases records any other writer, including this import, stored since activation. Imported risks stay exposed to that defect until #517 is fixed.

## Command / wiring
`FailSafe: Import Sentry Regressions` (command id `failsafe.sentry.import`) runs the import behind a cancellable progress notification and shows the outcome at its level.

## Files
- `sentry-transport.ts` — every request: base refusal, rate-limit waits, bounded retries, cancellation, and the production HTTPS transport (`makeHttpsGet`)
- `sentry-client.ts` — list path, trusted pagination, `fetchSentryIssues`
- `sentry-releases.ts` — issue-detail lookups, their cap and stop rules, and the carried-release shape check
- `sentry-import.ts` — the import outcome: stage order, write-time merge, counters
- `sentry-report.ts` — the operator message and its level
- `sentry-settings.ts` — settings with defaults and bounds
- `sentry-to-risk.ts` — pure mapping of canonical issue fields to the Sentry-owned record fields
- command: `src/extension/sentry-command.ts`
- tests: `src/test/integrations/sentry/sentry.test.ts`, `sentry-transport.test.ts`, `sentry-import.test.ts`, `sentry-releases.test.ts`; `src/test/roadmap/RiskRegisterManager.outcome.test.ts`

## Verified surface
Re-verified on docs.sentry.io on 2026-10-15 UTC:
- `GET /api/0/projects/{org}/{project}/issues/` — deprecated: "replaced with the Organization Issues endpoint"
- `GET /api/0/organizations/{organization_id_or_slug}/issues/` — `project` (IDs or slugs), `environment`, `query`, `sort` (`date`, `new`, `trends`, `freq`, `user`, `inbox`, `recommended`; no documented default), `limit` (max 100), `cursor`; no release fields in the list
- `GET /api/0/organizations/{organization_id_or_slug}/issues/{issue_id}/` — `firstRelease` / `lastRelease` with `version`, `shortVersion`, `dateCreated`, `dateReleased`, `ref`, `url` (either may be null)
- Rate-limit headers: `X-Sentry-Rate-Limit-Limit`, `-Remaining`, `-Reset` (UTC epoch seconds), `-ConcurrentLimit`, `-ConcurrentRemaining`
- Auth header: `Authorization: Bearer <token>`
- List fields read: `id`, `shortId`, `title`, `culprit`, `level`, `status`, `permalink`, `firstSeen`, `lastSeen`, `project.slug`
