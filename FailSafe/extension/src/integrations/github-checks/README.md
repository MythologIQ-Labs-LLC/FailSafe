# GitHub Checks integration

> One-line: FailSafe publishes a SHIELD verdict to a commit as a GitHub Check Run, turning the merge gate into a governed PASS/WARN/VETO signal.

- **Pattern:** notify (merge gate)
- **Direction:** outbound notify
- **Status:** in review (#147)
- **Official docs:** REST API — https://docs.github.com/en/rest?apiVersion=2026-03-10 · Checks: https://docs.github.com/en/rest/checks/runs
- **Backlog:** #96

## What it does

Maps a SHIELD verdict onto a single GitHub Check Run for the current HEAD commit, so a pull request can be gated on FailSafe's governance result. `PASS` reports `success` (merge-safe), `WARN` reports `neutral` (advisory), and `VETO` reports `failure` (blocking); any unrecognized verdict fails safe to `neutral`. The integration is off by default and degrades to a local-only notice when disabled, unauthenticated, run from a fork PR context, or when no GitHub remote / HEAD can be resolved — the verdict still stands locally in every case.

## Configuration

| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.github.enabled` | `false` | no | Master switch; no network call unless `true`. |
| `failsafe.integrations.github.token` | `` (empty) | yes | App installation token or a PAT with `checks:write`; sent only in the outbound `Authorization` header. |
| `failsafe.integrations.github.apiBaseUrl` | `` (empty) | no | Optional GitHub Enterprise API base; defaults to `https://api.github.com`. |

## Security

The token is a secret: it is read from settings, placed only in the outbound `Authorization: token <token>` header, and is never returned in the result object or logged (a masking test proves this). The transport short-circuits to a `localOnly` result with no network call when the integration is disabled, no token is set, the context is a fork PR, or the git remote/HEAD is missing. The integration only writes one Check Run (status `completed`); it reads no repository content. Off by default — no network or process runs unless explicitly enabled.

## Command / wiring

`FailSafe: Publish SHIELD Verdict to GitHub Check` (`failsafe.github.publishCheck`) — gathers local git context (origin remote + HEAD sha), lets the operator pick the verdict, and posts a single Check Run via the injectable client.

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
