# Linear integration

> One-line: FailSafe reads a Linear issue and presents it as an uncommitted intent preview, so work pulled in from Linear enters governance as reviewable intent rather than an automatic action.

- **Pattern:** ingest
- **Direction:** read-only
- **Status:** in review (#145)
- **Official docs:** https://linear.app/docs/api-and-webhooks · GraphQL: https://studio.apollographql.com/public/Linear-API/
- **Backlog:** #97

## What it does

Resolves a Linear issue URL or bare identifier (e.g. `ENG-123`) to its canonical identifier, fetches a small, explicit set of fields read-only via GraphQL, and renders an UNCOMMITTED intent preview for the operator to review. Nothing is persisted and no FailSafe intent is created on import — the operator sees the issue title, state, priority, assignee, labels, and URL, then decides. There is no mutation and no webhook in v1 (deferred to phase two). The response parse is defensive: it tolerates missing/null relations (Linear omits null relations) and reads only the canonical fields, so no secret could leak through.

## Configuration

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.linear.enabled` | `false` | no | Master switch; no network call unless `true`. |
| `failsafe.integrations.linear.apiKey` | `` (empty) | yes | Personal API key; sent only in the outbound `Authorization` header. |

## Security

Auth is a Linear personal API key, sent as a RAW `Authorization` header value (no `Bearer` prefix). The key is a secret — it is never carried by the pure logic, never returned in the result, and never logged (a masking test proves this). The integration is strictly read-only: it issues a single GraphQL query for the issue and parses only the canonical fields. Rate-limit response headers are surfaced but no fixed ceiling is hardcoded (the docs are internally inconsistent). Off by default — disabled unless an API key is configured; no network call otherwise.

## Command / wiring

`FailSafe: Import Linear Issue (preview)` (`failsafe.linear.import`) — prompts for a Linear issue URL/identifier, fetches it read-only, and shows an uncommitted intent preview. Nothing is committed.

## Files

- `linear-import.ts` — pure logic (identifier parse, GraphQL query builder, defensive response parse, intent-preview mapper)
- `linear-client.ts` — injectable transport (GraphQL `POST`, raw `Authorization` header, rate-limit header read)
- command: `src/extension/linear-command.ts`
- test: `src/test/integrations/linear/linear.test.ts`

## Verified surface

- Endpoint: `POST https://api.linear.app/graphql` — Linear GraphQL API (https://linear.app/docs/api-and-webhooks).
- Query: `issue(id:)` — accepts either the UUID or the human identifier (`ENG-123`) per Linear's documented behavior.
- Auth: personal API key sent as a RAW `Authorization` header value (no `Bearer` prefix).
- Rate-limit headers read when present: `X-RateLimit-Requests-Remaining`, `X-RateLimit-Requests-Limit`, `X-RateLimit-Requests-Reset`.
