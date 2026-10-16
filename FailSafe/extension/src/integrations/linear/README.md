# Linear integration

> One-line: FailSafe reads a Linear issue, shows it as an unsaved preview and, only when you approve, creates a governed intent draft from it, so work pulled in from Linear enters governance as reviewed intent rather than an automatic action.

- **Pattern:** ingest
- **Direction:** read-only
- **Status:** in review (#145)
- **Official docs:** https://linear.app/docs/api-and-webhooks · GraphQL: https://studio.apollographql.com/public/Linear-API/
- **Backlog:** #97

## What it does

Resolves a Linear issue URL or bare identifier (e.g. `ENG-123`) to its canonical identifier, fetches a small, explicit set of fields read-only via GraphQL, and opens them in an unsaved Markdown preview document: title, state, priority, assignee, labels, URL, the Linear updated time and the description. Every Linear-supplied string sits inside a fenced code block, so the preview renders no link, image or HTML from it. A modal then asks whether to create a governed intent draft; nothing is stored unless you approve it, edit or accept the purpose (at most 200 characters) and, in enforce mode, pick the plan it serves. A `bug` label makes the draft a bugfix intent. Nothing is ever written to Linear and there is no webhook or sync. The response parse is defensive: it tolerates missing/null relations (Linear omits null relations) and reads only the canonical fields, so no secret could leak through.

## Configuration

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.linear.enabled` | `false` | no | Master switch; no network call unless `true`. |
| `failsafe.integrations.linear.apiKey` | `` (empty) | yes | Personal API key; sent only in the outbound `Authorization` header. Stored in VS Code Secure Storage with `FailSafe: Set Integration Credential` (User or Workspace scope). The setting is deprecated and no longer read; `FailSafe: Move Plain-Text Credentials to Secure Storage` moves an existing value. |

## Security

Auth is a Linear personal API key, sent as a RAW `Authorization` header value (no `Bearer` prefix). The key is a secret — it is never carried by the pure logic, never returned in the result, and never logged (a masking test proves this). The integration is strictly read-only: it issues a single GraphQL query for the issue and parses only the canonical fields. Rate-limit response headers are surfaced but no fixed ceiling is hardcoded (the docs are internally inconsistent). Off by default — disabled unless an API key is stored in Secure Storage; no network call otherwise, and a key left in plain-text settings is not used.

## Command / wiring

`FailSafe: Import Linear Issue as Intent Draft` (`failsafe.linear.import`) — prompts for a Linear issue URL/identifier, fetches it read-only, opens the preview and asks before creating an intent draft. Every call records its result as the card's health evidence; an HTTP 200 carrying a GraphQL `errors` array counts as failing (`contract`), not verified.

## Import outcomes

The command ends with one of these outcomes; the same words are used in the code (`tracker-intent-import.ts`), the Integrations catalog and this README.

| Outcome | Meaning |
|---|---|
| `previewed` | The issue was fetched and shown in an unsaved preview document. FailSafe saved nothing. |
| `draft_created` | After your approval, an intent draft (status PULSE) was created in this workspace's intent store. In v1 this is what "imported" means; there is no further import state. |
| `already_imported` | The active intent is this issue's draft and the issue has not changed. Nothing was written. |
| `stale` | The active intent is this issue's draft but the issue changed since it was imported. FailSafe does not update intents from Linear; nothing was written. |
| `blocked` | Another intent is active (seal it first), the intent history failed its integrity check, or the write was refused. Nothing was written. |
| `not_authorized` | The integration is disabled, no credential is stored, or Linear answered 401/403. |
| `synced` | Not offered: there is no webhook and no two-way sync. |

The draft's CREATED entry in `.failsafe/manifest/intent_history.jsonl` records the provenance: source, key, URL, fetch time, the Linear updated time and a SHA-256 of the fields shown. The history is a plain SHA-256 hash chain: it detects edits that do not recompute the chain, not a writer who recomputes it. The description is not copied into the intent, and no credential is stored.


## Files

- `linear-import.ts` — pure logic (identifier parse, GraphQL query builder, defensive response parse, intent-preview mapper)
- `linear-client.ts` — injectable transport (GraphQL `POST`, raw `Authorization` header, rate-limit header read)
- `linear-health.ts` — maps a fetch result to catalog health evidence
- shared review flow: `src/integrations/tracker-import/tracker-intent-import.ts`
- command: `src/extension/linear-command.ts`
- tests: `src/test/integrations/linear/linear.test.ts`, `src/test/integrations/tracker-import/tracker-import.extensionHost.test.ts` (recorded fixtures built from the documented GraphQL shape, not captured from a live workspace; how `issue(id:)` resolves an identifier and the exact live error bodies are taken from documentation only)

## Verified surface

- Endpoint: `POST https://api.linear.app/graphql` — Linear GraphQL API (https://linear.app/docs/api-and-webhooks).
- Query: `issue(id:)` — accepts either the UUID or the human identifier (`ENG-123`) per Linear's documented behavior.
- Auth: personal API key sent as a RAW `Authorization` header value (no `Bearer` prefix).
- Rate-limit headers read when present: `X-RateLimit-Requests-Remaining`, `X-RateLimit-Requests-Limit`, `X-RateLimit-Requests-Reset`.
