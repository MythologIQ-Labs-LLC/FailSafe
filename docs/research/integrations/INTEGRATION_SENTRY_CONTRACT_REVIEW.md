# INTEGRATION — Sentry Contract Review (Issue #102)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**CONDITIONAL — useful only with release discipline + linked SCM.** The API contract is strong (auth tokens, scopes, release/commit/changed-file/suspect-commit/SCM endpoints). The blocker is **data quality, not protocol**: without consistent release naming and SCM integration, the same code path returns partial evidence (issue timing without suspect commits or file lists).

## Authentication, permissions, secrets

Prefer organizational auth tokens via internal integrations. Read-only scopes: `org:read`, `project:read`, `event:read`, `project:releases` (+ `org:ci` for release automation). OAuth (third-party) tokens expire after 30 days and are org-scoped. Store token material + known org/project IDs only; don't persist raw event payloads unless explicitly enabled.

## Supported surface, lifecycle, rate limits

Releases API exposes releases, release commits, changed files, deploys, health/session stats. Suspect commits appear only when SCM integration + commit tracking are configured. Rate limits are per caller-endpoint (RPS + concurrency). If alert webhooks are added later, Sentry expects a response within 1 second.

## Threat posture & minimum safe slice (v1)

Threats: over-scoped tokens, ingesting sensitive raw event data, noisy runtime signals without release context, webhook timeouts. v1: read-only import of issues + release metadata, first/last seen, environment, release version, suspect commit when present, changed files when available. Tests: missing release linkage, missing suspect commits, rate-limit handling, org/project-scope errors, self-hosted URL overrides.

## Deferred / blockers

Organizational maturity gate: without release naming discipline + SCM integration, regression correlation can't be guaranteed. Surface "correlation incomplete" states explicitly.

## Implementation checklist (v1)

- [ ] Use internal integration token with least read scopes.
- [ ] Import issue, release, commit, and changed-file evidence only.
- [ ] Redact or drop raw event bodies by default.
- [ ] Detect and surface "correlation incomplete" states clearly.
- [ ] Treat webhooks as optional and time-budgeted if added later.
