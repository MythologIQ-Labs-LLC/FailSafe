# Jira integration

> One-line: FailSafe reads a Jira Cloud issue and presents it as an uncommitted intent preview, so work pulled in from Jira enters governance as reviewable intent rather than an automatic action.

- **Pattern:** ingest
- **Direction:** read-only
- **Status:** in review (#148)
- **Official docs:** Cloud REST v3 — https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/ · Server/DC REST 7.6.1 — https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/
- **Backlog:** #98

## What it does

Resolves a Jira issue URL or bare key (e.g. `PROJ-123`) to its canonical key, fetches a small, explicit set of fields read-only, and renders an UNCOMMITTED intent preview for the operator to review. Nothing is persisted and no FailSafe intent is created on import — the operator sees the issue summary, status, priority, assignee, labels, components, and source URL, then decides. There is no mutation and no webhook in v1 (deferred to phase two). It uses the Jira REST v2 issue resource so the description arrives as a plain string (ADF is v3-only), keeping the preview a defensive plain-text summary that tolerates missing/null and unknown custom fields.

## Configuration

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.jira.enabled` | `false` | no | Master switch; no network call unless `true`. |
| `failsafe.integrations.jira.baseUrl` | `` (empty) | no | Jira site base, e.g. `https://your-site.atlassian.net`. |
| `failsafe.integrations.jira.email` | `` (empty) | no | Account email; the Basic-auth username half. |
| `failsafe.integrations.jira.apiToken` | `` (empty) | yes | API token; encoded only into the outbound `Authorization` header. |

## Security

Auth is Jira Cloud Basic auth: the email and API token are combined as `base64(email:token)` and placed only in the outbound `Authorization` header. The API token is a secret — it is never carried by the pure logic, never returned in the result, and never logged (a masking test proves this). The integration is strictly read-only: it issues a single `GET` for the issue and parses only the canonical fields, so no secret could leak through the response. Off by default — disabled unless base URL, email, and API token are all configured; no network call otherwise.

## Command / wiring

`FailSafe: Import Jira Issue (preview)` (`failsafe.jira.import`) — prompts for a Jira issue URL/key, fetches it read-only, and shows an uncommitted intent preview. Nothing is committed.

## Files

- `jira-import.ts` — pure logic (key parse, REST path builder, defensive response parse, intent-preview mapper)
- `jira-client.ts` — injectable transport (`GET` issue resource, Basic auth)
- command: `src/extension/jira-command.ts`
- test: `src/test/integrations/jira/jira.test.ts`

## Verified surface

- Endpoint: `GET /rest/api/2/issue/{key}?fields=summary,description,status,priority,assignee,labels,components` — Jira REST v2 issue resource (Server/DC REST 7.6.1; the v2 contract returns `description` as a string).
- Auth: HTTP Basic — `Authorization: Basic base64(email:apiToken)`.
- Note: REST v2 returns `description` as a plain STRING; ADF (Atlassian Document Format) is v3-only, hence the v2 path.
