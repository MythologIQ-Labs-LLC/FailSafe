# Plan: v6.0.13 Statewright website-first handoff (#652)

**Iteration:** 5 (after independent VETOs #938, #939, #940 and #941)
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

- **B1 (file over 250 lines).** The card markup and styles move to a new sibling module, `src/roadmap/ui/modules/statewright-handoff.js`. The renderer is 245 lines (243 on `main`) and imports the two constants. The catalog fetch was at line 197 on `main` and is at 198 now; the contract documents cite line 196, which stays inside their three-line tolerance.
- **B2 (no failing test for navigation without a click).** New `src/test/roadmap/statewright-handoff.test.ts` asserts, for six catalog states (loaded, empty, HTTP 500, non-JSON, rejected, still loading), that rendering makes only the same-origin catalog request, calls no `window.open`, schedules no timer, triggers no click, and leaves no other element in the page that refers to Statewright. The Playwright test now observes provider traffic for the whole browser context, requires one page and zero provider requests after an idle wait, activates the link from the keyboard, and then requires exactly one provider request with no referrer.
- **B3 (no failing test for a false connection claim).** The same jsdom test requires the exact reviewed card text, exactly one pill with no status class, exactly one link with exactly four attributes, and no button, input, form or loadable element in the card.
- **Mutation evidence.** The ten mutants that survived the audit, and two more (a query string on the URL, a visible address that differs from the link), are each killed by at least one suite.
- **Non-blocking notes taken.** The card now follows the status line in every state (N5). The address is also shown as selectable text, for surfaces that cannot open a new tab (N1). Empty-catalog, loading and keyboard cases are tested (N2, N3, N4). A changelog entry is added under Unreleased (N6).
- **Not changed.** The Console server's missing CSP and Referrer-Policy headers and `render()` on a malformed `integrations` value predate this change (N9). Portfolio and contract documents are not extended, because the card is a link and not an integration adapter.

## Iteration 3 (VETO #939 remediation)

The second independent audit (source `dd766c15`) found the three findings of #938 closed and no defect in the shipped source. It vetoed on test strength: seven new mutants that break a required negative passed both suites. This iteration changes tests and this plan only. The shipped files (`integration-catalog-renderer.js`, `statewright-handoff.js`) are byte-identical to `dd766c15`.

- **R1 (contact or navigation without a click; a workspace value in the address).**
  - New `src/test/roadmap/statewright-handoff-source.test.ts` pins the source: the renderer has exactly one listener (the existing Configure click), exactly one request (the same-origin catalog fetch), names Statewright only to import and place the card, and uses nothing that reaches a network, opens or moves a window, or runs later (sockets, beacons, timers, schedulers, observers, navigation). The handoff module is three constants and no code.
  - The jsdom suite dispatches pointer and key events at the card, the link and the container and requires that nothing changes.
  - The Playwright spec hovers the card and the link before the idle check, refuses and records any WebSocket to the provider, and activates the link by keyboard and, separately, by mouse, each time requiring exactly one request to the fixed address.
- **R2 (a false Connected status).**
  - The source test requires the card to equal the reviewed markup character for character, and (iteration 3) the card styles to be a closed list of five selectors and twelve property names. That list did not constrain values, so it did not exclude a hiding rule; iteration 4 replaces it with an exact pin.
  - The jsdom suite requires that no element inside the card carries a `title`, `aria-label` or other attribute, that no text outside the card names Statewright, that the catalog container holds only the heading, one status line, the card and the catalog groups and cards, and that the status line is one of the catalog's four own messages.
  - The Playwright spec requires no generated `::before` or `::after` text in the card and a visible disclaimer.
- **Mutation evidence.** 26 mutants: the twelve of iteration 2, the auditor's nine Statewright-related survivors and five new ones. All are killed; the list and results are in `.agent/staging/MUTATION_EVIDENCE-653.md`.
- **Non-blocking notes taken.** `integration-catalog-renderer.test.ts` is restored to its `main` content, which removes the vacuous assertion and the growth of its suite callback (N1, N2); the new suites cover the same cases. Global timers in the jsdom harness are counted and still run, so a timer owned by the test host is not lost (N8). The two line-number and evidence statements in this plan are corrected (N7).
- **Not changed.** Restyling or relabelling of other integrations' cards (auditor's X15, X16) is unchanged code outside this change. A source pin cannot prove the absence of every possible behaviour. It makes a new listener, request, scanned word or Statewright mention in these two files fail a named test; it does not catch every edit (see iteration 4, accepted limits).

## Iteration 4 (VETO #940 remediation)

The third independent audit (source `45a78c4d`) found R1 and R2 closed, no defect in the shipped source, no limit breach and no flaky test. It vetoed on one solid gap and one boundary case, and proposed a fixed remediation list so that the audit has a defined end. This iteration implements that list and changes tests and this plan only. The shipped files are still byte-identical to `dd766c15`.

- **B1 (the disclaimer could be made unreadable with every suite passing).**
  - Item 1 of the list: `STATEWRIGHT_STYLES` must equal the reviewed rules character for character, values included. The handoff module as a whole must equal its header comment plus the three constants, so nothing can run when it is imported.
  - Item 2: a Playwright test measures what is rendered for the disclaimer, the link and the address: full opacity through every ancestor, a font size and box height of at least 12 px, a WCAG contrast of at least 4.5, and a position on screen. In iteration 4 the backdrop was a constant and only the element box was measured; iteration 5 corrects both.
- **B2 (boundary: another control could activate the Statewright link).**
  - Item 3: with the provider watch active, a Playwright test clicks another integration's Configure, sends four hub events, returns to the Catalog six times, hovers, scrolls and right-clicks the link, and then requires no provider contact, one page, and an unchanged link, pill, heading and page title.
  - The generated-text check now covers the whole Integrations tab, not only the card.
- **Mutation evidence.** The 26 earlier mutants were killed. Of 14 taken from the third audit, the fourth audit found that one (a hub event that sets the pill text, Y48) was recorded as killed but survived under the auditor's own definition: the test read the pill only after re-rendering had repaired it. Iteration 5 fixes the test and the record.
- **Accepted limits, as the third auditor classified them.** Obfuscated mutants (mixed-case inline handlers, `setAttribute('on...')`, aliased listeners, delays that outlast the idle wait, a soft hyphen inside the name) and deliberate edits whose intent is plain in a diff are not excluded by tests; code review is the control for those. Sending a workspace value to a host other than Statewright is outside this change; the Console has no Content-Security-Policy, which is a separate, pre-existing gap. Focus on the link is lost when the Catalog re-renders, as for every catalog control.
- **Maintenance note.** The source contract fails on harmless edits to the renderer that add a listener, a request or one of the scanned words. That is intended: such an edit must be reviewed against this plan.

## Iteration 5 (VETO #941 remediation)

The fourth independent audit (source `b883f814`, 141 mutants) found the #940 list implemented, no defect in the shipped source, no limit breach, no flaky test and no false refusal, and said the result would be a PASS against that list as written. It vetoed on one gap and gave a closed list. This iteration implements that list and changes tests and this plan only. The shipped files are still byte-identical to `dd766c15`.

- **B1 (a shared rule in the renderer's own style sheet could clip or wash out the disclaimer).**
  - Item 1: every rendered line of the disclaimer, the link and the address must lie inside its element, the card and the viewport. A line clamp, a height cap or a truncation fails.
  - Item 2: contrast is measured against the background that is actually rendered behind the text (the nearest painted colour or gradient stops), the text colour must be opaque, and the check runs in five views: the default theme at 1280 and 600 px, the default theme under a light colour scheme, and the Pegasus light theme at 1280 and 600 px.
  - Item 3: the pill text and the link are read immediately after a hub event that reaches the catalog without a render, before the re-render loop.
- **Mutation evidence.** `.agent/staging/MUTATION_EVIDENCE-653.md` is rewritten with one identifier per mutant: the author's set (A), and the mutants taken from the second, third and fourth audits under the auditors' identifiers. One variant written for this iteration (translucent text through `.cc-intcat p`) is equivalent: the card's own later rule overrides it, and the rendered disclaimer does not change.
- **Found by the fourth audit, not fixed here.**
  - The card title `Statewright AI` is unreadable in the Pegasus light theme (dark text on the dark card). All eleven existing catalog cards on `main` have the same defect, so it is not introduced by this change. The pill, disclaimer, link and address are readable in that theme and are now tested there. Fixing the title means changing the shared catalog styles and belongs in its own issue.
  - A future render state added to `render()` (for example a 404 branch) could omit the card; the three existing states are tested.
- **Where the audit stands.** Four independent audits found no defect in the shipped files after iteration 2. Each veto concerned how far the tests exclude hypothetical future edits, and two auditors noted that a rule based on any surviving mutant has no natural end. The pass bar for this change is the owner's to set if a further audit vetoes on the same kind of finding.

## Installed-host evidence

Both runs used an isolated VS Code 1.145.2 profile with a VSIX built from the exact commit, and a clean-profile Chrome that loaded the Console from the installed extension with no interception.

| Source | VSIX SHA-256 | Result |
|---|---|---|
| `1fd4a557` (first audited) | `f4b097ee33333a42f0b086c23d00a9a7e0fcf9211e67b3322f680ec1dcd0e8c7` | 14 of 14 |
| `dd766c15` (shipped files identical to this iteration) | `da6120e3403bbba7e8c17b61bc56109d833fb1102d3b535d0d09b5d2d5019252` | 14 of 14 |

- Before any click there were zero requests to the `statewright.ai` host.
- The click opened `https://statewright.ai/runs` in a new tab with no referrer, cookie or opener, and the Console tab stayed where it was.
- Statewright sent the signed-out browser to `https://statewright.ai/login?redirect=/runs`. FailSafe shows no sign-in state.
- With the catalog endpoint unavailable the error was shown and the link was still present.

**Open acceptance items:**
- The signed-in Run History view was not exercised; it needs the owner's Statewright account.
- Cursor is not installed on the qualification machine.
- VS Code 1.122.1 could not start there while a pending VS Code update held the installer mutex.
- CI results belong to the commit they ran on; the 13 checks recorded for `1fd4a557` do not cover later commits.

## Not in scope

- Provider read-only API/export, run history ingestion, provider credentials, status probes, telemetry, correlation, referral attribution, partnership, or upstream contribution. All are deferred beyond v6.0.13 with Ben's input.
- G4 policy, TPM enrollment, TSA selection, RC/tag, marketplace publishing or release GO. Existing NO-GO unchanged.

## Deployment/rollback

No backend migration, external credential, new dependency or wire schema. Revert the scoped UI and tests on a qualified PR if needed. Release evidence must show real installed browser navigation and no other integrations regress.
