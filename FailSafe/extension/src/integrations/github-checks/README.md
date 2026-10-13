# GitHub Checks integration

> One-line: FailSafe currently publishes only a neutral manual GitHub advisory. Verified SHIELD PASS checks are blocked until native, subject-bound audit attestation is implemented (#476).

- **Pattern:** notify (merge gate)
- **Direction:** outbound notify
- **Status:** in review (#147)
- **Official docs:** REST API — https://docs.github.com/en/rest?apiVersion=2026-03-10 · Checks: https://docs.github.com/en/rest/checks/runs
- **Backlog:** #96

## What it does

The operator-facing command publishes a non-authoritative, `neutral` Check Run named `FailSafe Manual Advisory`. It does not assert a governance verdict. The low-level SHIELD publisher rejects `success` for the reserved `FailSafe SHIELD` name unless a future authenticated native gate is implemented. Off by default; missing config or fork context publishes nothing, and no local verdict is fabricated.

## Configuration

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.github.enabled` | `false` | no | Master switch; no network call unless `true`. |
| `failsafe.integrations.github.token` | `` (empty) | yes | App installation token or a PAT with `checks:write`; sent only in the outbound `Authorization` header. |
| `failsafe.integrations.github.apiBaseUrl` | `` (empty) | no | Optional GitHub Enterprise API base; defaults to `https://api.github.com`. |

## Security

The token is a secret: it is read from settings, placed only in the outbound `Authorization: token <token>` header, and is never returned in the result object or logged (a masking test proves this). The transport short-circuits to a `localOnly` result with no network call when the integration is disabled, no token is set, the context is a fork PR, or the git remote/HEAD is missing. The integration only writes one Check Run (status `completed`); it reads no repository content. Off by default — no network or process runs unless explicitly enabled.

## Command / wiring

`FailSafe: Publish Manual GitHub Advisory` (`failsafe.github.publishCheck`) — requests explicit confirmation, then posts a neutral, non-attesting advisory to the current HEAD. The command never offers manually selected SHIELD PASS/WARN/VETO outcomes.

## Files

- `github-checks-map.ts` — pure logic (verdict→conclusion mapping, repo-slug parse, Check Run payload builder)
- `github-checks-client.ts` — injectable transport (`POST /repos/{owner}/{repo}/check-runs`)
- command: `src/extension/github-checks-command.ts`
- test: `src/test/integrations/github-checks/github-checks.test.ts`

## Verified surface

- Endpoint: `POST /repos/{owner}/{repo}/check-runs` — Checks Runs API (https://docs.github.com/en/rest/checks/runs).
- Request fields: `name`, `head_sha`, `status: "completed"`, `conclusion`, `output.title`, `output.summary`, `details_url`.
- `conclusion` enum (subset used): `success` / `neutral` / `failure`.
- Headers: `Accept: application/vnd.github+json`, `Authorization: token <token>`, `X-GitHub-Api-Version: 2022-11-28`.
