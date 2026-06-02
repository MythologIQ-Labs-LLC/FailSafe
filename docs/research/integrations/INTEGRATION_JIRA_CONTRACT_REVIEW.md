# INTEGRATION — Jira Contract Review (Issue #98)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**CONDITIONAL — app registration + 30-day webhook renewal required.** Read-only issue import is implementable now. Dynamic webhook sync is implementable only if FailSafe becomes an Atlassian Connect/OAuth 2.0 app client with renewal logic (only those app types can register/manage dynamic webhooks, which expire after 30 days). Plan: read-only issue fetch first, dynamic webhook second.

## Authentication, permissions, secrets

Read-only import: OAuth 2.0 app with `read:jira-work`. Dynamic webhooks: `manage:jira-webhook` + read scopes for JQL/webhook retrieval. Standardize on 3LO unless enterprise already has Connect/Forge policy. Store site base URL, client credentials, refresh tokens, per-tenant webhook IDs; don't assume uniform custom-field schemas or admin permissions across sites.

## Supported surface, lifecycle, rate limits

Webhooks are JQL-scoped; the API exposes listing, deletion, failed-delivery retrieval, and explicit refresh. **Key rule:** REST-registered webhooks expire after 30 days and must be refreshed (refresh endpoint returns next expiry). Jira Cloud applies burst + points-based rate limiting (HTTP 429 on burst exhaustion) — needs a renewal scheduler + 429-aware client before webhooks are production-grade.

## Threat posture & minimum safe slice (v1)

Threats: admin-only scope creep, custom-field over-assumptions, stale webhook renewal, 429 retry storms. v1: read issue by key, preview canonical fields + transparent "raw unmapped fields" section, record source URL (no schema normalization). Optional phase two: dynamic webhooks on a tightly-scoped JQL filter with tracked expiration. Tests: missing/unknown custom fields, revoked OAuth, 429 handling, payload validation, webhook refresh scheduling, stale webhook IDs.

## Deferred / blockers

Operational, not technical: app registration, tenant admin consent, and renewal scheduling must exist before webhook sync is reliable.

## Implementation checklist (v1)

- [ ] Ship read-only issue import before any webhook work.
- [ ] Use canonical fields plus transparent "unmapped data."
- [ ] If webhooks are added, track expiry and refresh proactively.
- [ ] Handle 429 with exponential backoff and jitter.
- [ ] Document tenant-admin consent requirements up front.
