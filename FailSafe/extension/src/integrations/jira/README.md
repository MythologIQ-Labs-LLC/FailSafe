# Jira integration

> One-line: FailSafe reads a Jira Cloud issue, shows it as an unsaved preview and, only when you approve, creates a governed intent draft from it, so work pulled in from Jira enters governance as reviewed intent rather than an automatic action.

- **Pattern:** ingest
- **Direction:** read-only
- **Status:** in review (#148)
- **Official docs:** Cloud REST v3 — https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/ · Server/DC REST 7.6.1 — https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/
- **Backlog:** #98

## What it does

Resolves a Jira issue URL or bare key (e.g. `PROJ-123`) to its canonical key, fetches a small, explicit set of fields read-only, and opens them in an unsaved Markdown preview document: summary, status, priority, assignee, labels, components, issue type, source URL, the Jira updated time and the description. Every Jira-supplied string sits inside a fenced code block, so the preview renders no link, image or HTML from it. A modal then asks whether to create a governed intent draft; nothing is stored unless you approve it, edit or accept the purpose (at most 200 characters) and, in enforce mode, pick the plan it serves. The draft goes into the canonical IntentService store. Nothing is ever written to Jira and there is no webhook or sync. It uses the Jira REST v2 issue resource so the description arrives as a plain string (ADF is v3-only), keeping the preview a defensive plain-text summary that tolerates missing/null and unknown custom fields.

## Configuration

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.jira.enabled` | `false` | no | Master switch; no network call unless `true`. |
| `failsafe.integrations.jira.baseUrl` | `` (empty) | no | Jira site base, e.g. `https://your-site.atlassian.net`. It must use https; any other scheme is refused before anything is sent. |
| `failsafe.integrations.jira.email` | `` (empty) | no | Account email; the Basic-auth username half. |
| `failsafe.integrations.jira.apiToken` | `` (empty) | yes | API token; encoded only into the outbound `Authorization` header. Stored in VS Code Secure Storage with `FailSafe: Set Integration Credential` (User or Workspace scope). The setting is deprecated and no longer read; `FailSafe: Move Plain-Text Credentials to Secure Storage` moves an existing value. |

## Security

Auth is Jira Cloud Basic auth: the email and API token are combined as `base64(email:token)` and placed only in the outbound `Authorization` header. The API token is a secret — it is never carried by the pure logic, never returned in the result, and never logged (a masking test proves this). The integration is strictly read-only: it issues a single `GET` for the issue and parses only the canonical fields, so no secret could leak through the response. A response larger than 5 MB is cut off and refused, and a returned key that is not a Jira key is rejected. Off by default — disabled unless base URL and email are set and an API token is stored in Secure Storage; no network call otherwise. If `baseUrl` comes from workspace settings, only a Workspace-scope token is sent there: a User-scope token is refused, so a workspace cannot redirect your personal token.

## Command / wiring

`FailSafe: Import Jira Issue as Intent Draft` (`failsafe.jira.import`) — prompts for a Jira issue URL/key, fetches it read-only, opens the preview and asks before creating an intent draft. Every call records its result (verified, or failing with a category such as `auth` or `rate_limited`) as the card's health evidence in the Integrations catalog.

## Import outcomes

The command ends with one of these outcomes; the same words are used in the code (`tracker-intent-import.ts`), the Integrations catalog and this README.

| Outcome | Meaning |
|---|---|
| `previewed` | The issue was fetched and shown in an unsaved preview document. FailSafe saved nothing. |
| `draft_created` | After your approval, an intent draft (status PULSE) was created in this workspace's intent store. In v1 this is what "imported" means; there is no further import state. |
| `already_imported` | The active intent is this issue's draft and the issue has not changed. Nothing was written. |
| `stale` | The active intent is this issue's draft but the issue changed since it was imported. FailSafe does not update intents from Jira; nothing was written. |
| `unknown` | The active intent is this issue's draft but its import record has no content hash, so FailSafe cannot tell whether the issue changed. Nothing was written. |
| `blocked` | Another intent is active (seal it first), the intent history failed its integrity check, or the write was refused. Nothing was written. |
| `not_authorized` | The integration is disabled, no credential is stored, or Jira answered 401/403. |
| `synced` | Not offered: there is no webhook and no two-way sync. |

The draft's CREATED entry in `.failsafe/manifest/intent_history.jsonl` records the provenance: source, key, URL, fetch time, the Jira updated time and a SHA-256 of the fields shown. The history is a plain SHA-256 hash chain: it detects edits that do not recompute the chain, not a writer who recomputes it. The description is not copied into the intent, and no credential is stored.


## Files

- `jira-import.ts` — pure logic (key parse, REST path builder, defensive response parse, intent-preview mapper)
- `jira-client.ts` — injectable transport (`GET` issue resource, Basic auth)
- `jira-health.ts` — maps a fetch result to catalog health evidence
- shared review flow: `src/integrations/tracker-import/tracker-intent-import.ts`
- command: `src/extension/jira-command.ts`
- tests: `src/test/integrations/jira/jira.test.ts`, `src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts` (recorded fixtures in `src/test/fixtures/integrations/tracker/`, built from the documented REST v2 response shape, not captured from a live tenant)

## Verified surface

- Endpoint: `GET /rest/api/2/issue/{key}?fields=summary,description,status,priority,assignee,labels,components,updated,issuetype` — Jira REST v2 issue resource (Server/DC REST 7.6.1; the v2 contract returns `description` as a string).
- Auth: HTTP Basic — `Authorization: Basic base64(email:apiToken)`.
- Note: REST v2 returns `description` as a plain STRING; ADF (Atlassian Document Format) is v3-only, hence the v2 path.
