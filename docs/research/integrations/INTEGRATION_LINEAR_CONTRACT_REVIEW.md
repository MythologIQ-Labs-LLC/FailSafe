# INTEGRATION — Linear Contract Review (Issue #97)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**READY** — read-only intent import. Linear's GraphQL API, TypeScript SDK (`@linear/sdk`), OAuth 2.0 flow, and webhook security are all clearly documented. v1 = resolve issue URL/ID → canonical fields → uncommitted intent preview. Webhook sync is optional phase two.

## Authentication, permissions, secrets

Personal API keys or OAuth 2.0. Workspace admins can gate key creation and restrict keys by permission class / specific teams. Prefer OAuth for multi-operator/service-account use (refresh tokens rotate; access tokens valid 24h; 30-min refresh-replay grace). Store only the token pair + client secret in a secret store; never persist webhook signing secrets or access tokens in receipts.

## Supported surface, lifecycle, rate limits

GraphQL-first; SDK exposes typed models (title, description, state, priority, labels, assignee, linked entities). Webhooks cover issues/comments/attachments/documents/projects/cycles/labels/users/SLAs, signed with HMAC-SHA256 `Linear-Signature`; validate the signed raw body and reject timestamps older than 1 minute. **Contract gap:** rate-limit docs are internally inconsistent (5,000/hr in prose vs 2,500 API-key / 5,000 OAuth in the table) — honor response headers, never hardcode a ceiling.

## Threat posture & minimum safe slice (v1)

Threats: over-scoped personal keys, cross-team exposure, replayed webhooks, over-complex GraphQL queries. v1: accept issue URL/ID, fetch canonical fields, present an uncommitted intent preview, stop. Tests: invalid IDs, revoked tokens, restricted-team keys, signature mismatch, stale webhook timestamp, rate-limit header parsing.

## Deferred / blockers

No protocol blocker. Operational gate only: workspace admins must allow key creation or OAuth app install.

## Implementation checklist (v1)

- [ ] Start with read-only OAuth or team-scoped API key.
- [ ] Resolve Linear issue URL/ID to canonical issue node.
- [ ] Build intent preview without auto-persist.
- [ ] Treat webhooks as optional phase two.
- [ ] Honor rate-limit headers and complexity ceilings dynamically.
