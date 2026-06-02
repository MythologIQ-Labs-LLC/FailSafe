# INTEGRATION — GitHub PR Checks Contract Review (Issue #96)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**CONDITIONAL — needs an org-approved GitHub App.** The strongest collaboration integration in the set; the Checks API is GitHub-App-centric (App-exclusive for check-run create/update). Implement a **GitHub App primary path** + a **commit-status fallback** only where an org can't provision an App. Technically mature; the only real blocker is org-level App provisioning.

## Authentication, permissions, secrets

Apps authenticate via JWT → installation access tokens (limited to granted permissions). Smallest v1 set: **Metadata read**, **Checks write**, **Pull requests write** (for review summaries). Fallback status API loses annotations/UX. Store App private key, App ID, installation-ID lookup, webhook secret — never in logs or receipts.

## Supported surface, lifecycle, rate limits

GitHub auto-creates check suites on push and sends `check_suite` to Apps with `checks:write`; App creates check runs on the latest SHA. PR reviews publish `COMMENT`/`REQUEST_CHANGES`/`APPROVE`; line comments need diff-position mapping (deferred). Fork edge cases: checks don't track pushes in forks; `pull_requests` can return empty. Primary + secondary rate limits — batch updates. Check runs auto-delete past 1,000 same-named runs in a suite.

## Threat posture & minimum safe slice (v1)

Threats: over-broad repo permissions, posting to wrong repo/SHA, fork edge cases misleading coverage. v1: local remote/branch/SHA detection, one check run on HEAD, optional non-inline PR summary after the check path is stable. Tests: disabled integration, missing installation token, protected-branch consumption, fork PRs, secondary-rate-limit handling, deterministic PASS/WARN/VETO→conclusion mapping.

## Deferred / blockers

Org App provisioning is the gate. Line annotations / multi-comment review formatting wait until diff-position mapping is proven.

## Implementation checklist (v1)

- [ ] Register a GitHub App with least privilege.
- [ ] Implement installation-token lookup and caching.
- [ ] Post one named check run per HEAD SHA.
- [ ] Add optional PR summary review, not line comments, in v1.
- [ ] Cover fork and disabled-integration degrade paths.
