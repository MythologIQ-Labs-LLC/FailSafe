# Plan: v6.0.13 Statewright website-first handoff (#652)

**Iteration:** 2 (after independent VETO #938)
**Change class:** narrow product UI / external navigation
**Risk:** L2 planned (externally navigable UX; no credential or data egress except user-initiated browser navigation); independent governance auditor may increase grade
**Base:** main `9f16548d83116e2d8ee7f9010545963c06e5c93a`
**Branch:** `feat/652-statewright-website-handoff`; target `main`
**Owner scope authority:** #602, #606, #637 (2026-11-10); this plan implements only Option A, not embedded UI.

## Customer outcome

An operator can access the existing Statewright Run History website from the current FailSafe Integrations tab. The provider handles login, data, history and workflow state; FailSafe does not claim the provider is connected or that it can see/enforce the provider's workflow.

## Implementation

1. In `src/roadmap/ui/modules/integration-catalog-renderer.js`, show a distinct static Statewright card next to the Catalog content. Do **not** insert an entry into the `INTEGRATION_CATALOG` descriptor registry: that registry derives a connected/configured status from real adapter calls, and there is no adapter in this release.
2. Use an ordinary operator-initiated anchor: `href="https://statewright.ai/runs" target="_blank" rel="noopener noreferrer"`. Fixed origin and path only. Do not add URLs, workspace names, tokens, session IDs, referral tracking, automatic redirects, credential settings, service probes or provider API calls.
3. Describe capability accurately: "website handoff", Statewright owns account and run data; no embedded history or provider enforcement. Card must not use a "connected" health pill or affect catalog counts.
4. Add jsdom structural and Playwright Console UI tests, including an intercepted external navigation, negative assertion on automatic network contact, accessible link properties, and stable existing catalog counts.
5. Installed VS Code/Cursor test remains mandatory prior to v6.0.13 release; CI Playwright and jsdom are not installed VSIX acceptance.

## Falsification / acceptance

- Fail if navigation begins on render without an operator click or if any remote Statewright API call is made.
- Fail if the href is not literal HTTPS Statewright-owned /runs, rel lacks noopener/noreferrer, target not blank, or the URL has query parameters.
- Fail if the card claims connected, live data, local history, approval enforcement, installed credential or active subscription.
- Fail if any existing config status, count, catalog card, or Integrations sub-view changes.
- Fail if no-site/no-login flow is presented as authenticated; Statewright decides provider authentication.
- Existing full CI 13/13, independent native audit PASS on exact source, release standard merge and owner release GO remain prerequisites.

## Iteration 2 (VETO #938 remediation)

- **B1 (file over 250 lines).** The card markup and styles move to a new sibling module, `src/roadmap/ui/modules/statewright-handoff.js`. The renderer is 245 lines (243 on `main`) and imports the two constants. The cited catalog fetch moves from line 196 to 198, inside the three-line tolerance of the integration contract citations.
- **B2 (no failing test for navigation without a click).** New `src/test/roadmap/statewright-handoff.test.ts` asserts, for six catalog states (loaded, empty, HTTP 500, non-JSON, rejected, still loading), that rendering makes only the same-origin catalog request, calls no `window.open`, schedules no timer, triggers no click, and leaves no other element in the page that refers to Statewright. The Playwright test now observes provider traffic for the whole browser context, requires one page and zero provider requests after an idle wait, activates the link from the keyboard, and then requires exactly one provider request with no referrer.
- **B3 (no failing test for a false connection claim).** The same jsdom test requires the exact reviewed card text, exactly one pill with no status class, exactly one link with exactly four attributes, and no button, input, form or loadable element in the card.
- **Mutation evidence.** The ten mutants that survived the audit, and two more (a query string on the URL, a visible address that differs from the link), are each killed by at least one suite.
- **Non-blocking notes taken.** The card now follows the status line in every state (N5). The address is also shown as selectable text, for surfaces that cannot open a new tab (N1). Empty-catalog, loading and keyboard cases are tested (N2, N3, N4). A changelog entry is added under Unreleased (N6).
- **Not changed.** The Console server's missing CSP and Referrer-Policy headers and `render()` on a malformed `integrations` value predate this change (N9). Portfolio and contract documents are not extended, because the card is a link and not an integration adapter.

## Installed-host evidence (exact source 1fd4a557, before remediation)

A VSIX built from the audited source was installed in an isolated VS Code 1.145.2 profile, and a clean-profile Chrome loaded the Console from that installed extension with no interception: 14 of 14 checks passed. The click opened `https://statewright.ai/runs` with no referrer, cookie or opener, and a signed-out browser was sent by Statewright to `https://statewright.ai/login?redirect=/runs`. The signed-in view was not exercised (it needs the owner's Statewright account). Cursor is not installed on the qualification machine. The run is repeated on the remediated source.

## Not in scope

- Provider read-only API/export, run history ingestion, provider credentials, status probes, telemetry, correlation, referral attribution, partnership, or upstream contribution. All are deferred beyond v6.0.13 with Ben's input.
- G4 policy, TPM enrollment, TSA selection, RC/tag, marketplace publishing or release GO. Existing NO-GO unchanged.

## Deployment/rollback

No backend migration, external credential, new dependency or wire schema. Revert the scoped UI and tests on a qualified PR if needed. Release evidence must show real installed browser navigation and no other integrations regress.
