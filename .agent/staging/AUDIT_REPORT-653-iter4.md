# AUDIT REPORT (iteration 4, fourth audit after VETOs #938, #939 and #940): PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit). No authorship of the change, of any remediation or of any earlier audit.
- **Date:** 2026-11-10
- **Exact source audited:** `b883f81449d888a11edb90a2151a3864d13ede54` (`git rev-parse HEAD` in `C:\dev\mythologiq\FailSafe-653`, branch `feat/652-statewright-website-handoff`)
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`
- **Previously audited:** `1fd4a557` (VETO, #938), `dd766c15` (VETO, #939), `45a78c4d` (VETO, #940)
- **Plan:** `.failsafe/governance/plans/plan-v6013-statewright-652-website-first.md`, iteration 4 (LF sha256 `4c5035d77e152e0f9118ba5deb819f460efc1f49229fd308710c1e8a86456fd0`, equal to `plan_content_hash` in `plan-iter4.json`)
- **Environment:** Windows 11, Node 22.23.4, Playwright Chromium. No request reached `statewright.ai`: Playwright routes fulfilled the host, Chromium ran with `--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost` for every mutation and probe run, and a Node preload refused every non-loopback DNS lookup (it refused 27 lookups of `statewright.ai`, all made by jsdom's WebSocket under mutant X12).
- **Method:** every mutant and probe ran in disposable `git archive` exports of HEAD under a new directory of my own in the system temp folder. The audited worktree was never built in, written to or mutated.

## Verdict: VETO

One blocking finding under the verdict rule I was given. It is the residue of #940 B1, reached through the renderer's own stylesheet instead of the card's.

- **B1.** A one-line shared CSS rule in the renderer's `STYLE` (the file the pin does not cover) cuts the disclaimer off or washes it out in Chromium while all 43 tests stay green. A line clamp on `.cc-intcat p` hides the end of the disclaimer at the test's own 1280 px viewport and the whole "FailSafe does not read..." sentence at 1000 px and below. A light-mode rule that lightens the card background leaves the disclaimer at a measured contrast of 1.88 while the readability test reports at least 4.5, because the test compares the text colour with hard-coded hex values, not with the background that is rendered.

What is sound, and it is most of it:

- The shipped source is unchanged since `dd766c15` and I found no safety or truthfulness defect in it: it is static, makes no provider call, sends nothing, and claims no connection.
- All three items of the fixed remediation list are implemented as written. Every blocking and same-cause mutant of the third audit is killed (Y06, Y16, Y17, Y18, Y19, Y20), as are Y05, Y07, Y15, Y23, Y43, Y45 and Y52.
- All 22 mutants of the first audit and 30 of 32 of the second are killed; X15 and X16 survive as before (untouched code, cosmetic).
- No razor breach, no flake in 165 repeated Playwright tests, no false refusal of a legitimate state, regression guards green.

**If the Governor's bar is the third audit's fixed list as literally written, this is a PASS**: the list is implemented and it kills what it was written to kill, with one exception recorded as N1 (Y48). Under the rule I was told to apply ("a surviving mutant that is a plausible accident or an edit a reviewer could plausibly miss, and that in a real browser ... hides the card or its disclaimer or makes them unreadable"), B1 is a hit, so the verdict is VETO.

### On the verdict rule

I report under the rule as written. Two observations, as the brief allows.

1. I agree with the third auditor that "any surviving plausible mutant" has no natural end. I ran 36 new mutants and 22 survive; seven of those are legitimate edits that should survive, and a fifth auditor would find more of the rest. B1 below is not a contrived case, though: the brief itself named shared `.cc-intcat p` rules and theme rules as the edits to try, and they are the first things I tried.
2. The plausibility call in B1 is mine. I rest it on the clamp and light-mode mutants (Z02, Z03, Z35, Z09, Z34), which are benign in intent and do not name or target the card. I do not rest it on the mutants that only a deliberate author would write (Z10, Z13, Z31, Z32), which I list for the root cause only.

## Risk grade: L2

Unchanged from the three earlier audits. User-facing navigation to a third-party site and product-truth copy about that third party. No credential handling, no data egress by FailSafe, no backend, schema or dependency change, so not L3. This iteration changed two test files, the plan, the evidence file and gate files only.

## Status of #940 B1 and B2, and of the fixed remediation list

| Item | Status | Evidence |
|---|---|---|
| **B1 of #940** (disclaimer made unreadable with every suite green: Y18, Y17; same cause Y16, Y19, Y20) | **Closed for the card's own stylesheet. Open for the renderer's `STYLE`** (B1 below) | Y17, Y18, Y19, Y20: source 2, and the Playwright readability test fails (`>= 4.5` received `1`; `>= 12` received `1.28`; `>= 4.5` received `1.198`; on-screen `false`). Y16: Playwright only (opacity expected 1, received 0). Survivors: Z02, Z03, Z35, Z09, Z34 and four deliberate ones |
| **B2 of #940** (Y06: another integration's Configure click activates the link) | **Closed** | Y06: source 0, jsdom 0; the Playwright "other controls" test fails with a provider request in the list. X17 and Y05 also die in that test |
| **Item 1**: pin `STATEWRIGHT_STYLES` by string equality | **Implemented, effective** | `assert.equal(handoff.STATEWRIGHT_STYLES, STYLES)`. The whole module is also pinned to its header comment plus three constants. Y17, Y18, Y19, Y20, Y43, Y50, Y51, Y52 all fail the source suite; the import-time mutants Y11, Y12, Y13, Y45 fail the module pin |
| **Item 2**: computed readability of the disclaimer, link and address (opacity, font-size floor, text colour against background, box in viewport) | **Implemented as specified, with more than was asked (box height, WCAG ratio). Effective for opacity, size, text colour and position. Not effective for clipped text or for a changed backdrop** | Kills Y16, Z01, Z04, Z08, Z28, Z29 and the Playwright half of Y17 to Y20, Y43, Y52. Misses Z02, Z03, Z35 (clipped text), Z09, Z10, Z34 (backdrop), Z13 (text indent), Z32 (alpha), Z31 (narrow viewport only). See B1 |
| **Item 3**: with the provider watch active, click Configure, send a hub event, re-render six times, wheel, right-click; then require no provider contact, one page, unchanged href, pill and title | **Implemented as specified. Ten of the eleven mutants the list named are killed. Not effective for Y48**, because of the list's own step order | This test kills Y05, Y06, Y07, Y08, Y10, Y13, Y34, Y47, Y53; Y45 dies in the module pin and the first test's title check. Y48 survives every suite: the re-renders that follow the hub event restore the pill before it is read. See N1. Probes: the Configure click is real (the active tab becomes `settings`); `integration.health` reaches the catalog's `onEvent` (Y07 dies; an instrumented build recorded `events: ["integration.health"]`); the loop adds exactly six `render()` calls (instrumented build: 6 before the loop, 12 after) |

Byte-identity claims, checked with `git rev-parse <rev>:<path>`:

| File | `origin/main` | `dd766c15` | `45a78c4d` | HEAD |
|---|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | `d2308b43` | `8a15f1ae` | `8a15f1ae` | `8a15f1ae` |
| `src/roadmap/ui/modules/statewright-handoff.js` | absent | `fda005ad` | `fda005ad` | `fda005ad` |
| `src/test/roadmap/integration-catalog-renderer.test.ts` | `b2b261cc` | `0f5695ad` | `b2b261cc` | `b2b261cc` |
| `src/test/ui/integrations-catalog.spec.ts` | `2a75d9fa` | `2a75d9fa` | `2a75d9fa` | `2a75d9fa` |
| `src/test/roadmap/statewright-handoff.test.ts` | absent | `97832987` | `04e6509f` | `04e6509f` |

All four claims hold. `b883f814` touches `statewright-handoff-source.test.ts`, `statewright-handoff.spec.ts`, the plan, the evidence file and four gate files, and nothing else.

## Blocking finding

### B1. A shared rule in the renderer's stylesheet can cut off or wash out the disclaimer with every suite green

Rule item broken: (d) "hides the card or its disclaimer or makes them unreadable". Plan claim contradicted: iteration 4, item 2, "a Playwright test measures what is rendered ... a WCAG contrast of at least 4.5 against the backdrop".

Each mutant below is one rule added at the end of the renderer's `STYLE` constant. None names the provider or the card's class. Suites: source 5 tests, jsdom 18, catalog 9, Playwright 11.

| ID | Rule added to `STYLE` | source | jsdom | Playwright | Measured in Chromium |
|---|---|---|---|---|---|
| Z02 | `.cc-intcat p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }` | 0 | 0 | 11 pass | 1280 px: the text ends "...or enforce" and " Statewright workflows." is hidden. 1000 px: hidden from " does not read Statewright history..." on. 800 px: only "View your workflow runs and transition history on Statewright's website. Statewright" is shown. Paragraph box 19 px tall, `scrollHeight` 38 to 76 |
| Z03 | `.cc-intcat p { max-height:1.3em; overflow:hidden; }` | 0 | 0 | 11 pass | the same text loss as Z02, with no ellipsis |
| Z35 | the same clamp at two lines | 0 | 0 | 11 pass | 1280 and 1000 px: nothing hidden, so no test at the default viewport can see it. 800 px: " Statewright workflows." hidden. 600 px: hidden from " data. FailSafe does not read..." on |
| Z09 | `@media (prefers-color-scheme: light) { .cc-intcat-card, .cc-intcat section { background:#f5f7fa; border-color:#cbd5e1; } .cc-intcat-card p, .cc-intcat-hint, .cc-intcat-caps { color:#475569; } }` | 0 | 0 | 11 pass | Playwright's Chromium reports `light` by default, so the rule is active in the test run itself. Card background `rgb(245, 247, 250)`; disclaimer contrast **1.88**, title 1.15, pill 2.33, address 3.24. With the scheme emulated as dark the values return to 7.85, 12.85, 6.35, 4.56 |
| Z34 | `[data-theme="pegasus"] .cc-intcat-card, [data-theme="pegasus"] .cc-intcat section { background:#fff; border-color:#cbd5e1; }` plus dark text for `.cc-intcat-card p` and `.cc-intcat-head strong` | 0 | 0 | 11 pass | in the Pegasus (light) theme: card background white, disclaimer contrast **2.02**, pill 2.50, address 3.47. The tests run in the default theme only |

Same root causes, written deliberately, listed for completeness and not relied on: Z10 (`.cc-intcat > section { background:#c9d4e2 }`, disclaimer contrast 1.35), Z13 (`text-indent:-999em`, no character painted inside the box), Z31 (`@media (max-width:900px) { .cc-intcat section p { display:none } }`), Z32 (`color:rgba(169,184,203,.04) !important`).

Why I call the first five plausible:

- A clamp on catalog paragraphs is an ordinary restyle, and `.cc-intcat p` is the natural selector for "every paragraph in the catalog". Nothing in the rule tells a reviewer that it also matches the Statewright disclaimer: the card's markup and styles live in another file. That is the reasoning the third audit applied to Y17 ("a hex colour does not say that it equals the background").
- A light-theme rule is a likely future edit, because the catalog is in fact broken in the light theme today (N2). Whoever repairs it will lighten the card backgrounds and darken the text of `.cc-intcat-card`. The Statewright text colours sit in the pinned file, so they are the ones that get forgotten.

Root causes in `readability()`:

1. It checks the element's box (height at least 12 px, inside the viewport), not whether the text inside the box is painted. Clipped overflow, a clamp and a text indent all leave the box in place.
2. `contrast` is computed against the constants `#182332`, `#111a25` and `#141a22` passed in by the test. The rendered background is never read.
3. `parse` keeps the first three numbers of the computed colour, so an alpha channel is ignored. (`color:transparent` is caught only because `rgba(0, 0, 0, 0)` parses as black.)
4. One viewport (1280 x 720), one theme, one colour scheme.

### Required remediation

A closed list again. Items 1 and 2 close B1; item 3 closes N1.

1. In `readability()`, require the text to be painted: for the disclaimer, the link and the address, every character's client rectangle (a `Range` over the text node) lies inside the element's box, the card's box and the viewport. This kills Z02, Z03, Z13, Z14 and Z35 at the viewport where they bite, and it also covers clipping by an ancestor.
2. Compute contrast against the rendered backdrop (the colour stops of the card's computed `background-image`, or its `background-color` when there is no gradient; the link's own computed `background-color`), require the computed text colour to be opaque, and run the measurement at a second, narrow viewport (600 px wide is enough) and in the light theme. This kills Z09, Z10, Z31, Z32, Z34 and makes Z35 visible.
3. Read the pill text immediately after the hub events and before the re-render loop (one `expect`). This kills Y48.

Optional and cheap: in the source contract, require the number of `innerHTML` assignments in the renderer to equal the number of card placements (three), which kills Z17 and Z30; wait for the eleven catalog cards inside the re-render loop so that `toHaveCount(1)` is checked against the loaded state and not the loading markup; correct the evidence file (N1, N9).

If the Governor wants a bound that does not depend on the next auditor's imagination: snapshot `getComputedStyle` of the five card elements for a closed list of properties (display, visibility, opacity, colour, background, font size, line height, overflow, max-height, text-indent, white-space, line clamp, transform, clip-path, filter, position, user-select) and compare it with a reviewed table. That pins the effect of the renderer's stylesheet on the card without pinning the stylesheet.

## Non-blocking findings

- **N1. Y48 survives every suite, and the plan and evidence file say it is killed (boundary call; class "plain deliberate").** Mutant, as the third audit defined it: `onEvent() { const p = this.container && this.container.querySelector('section .cc-intcat-pill'); if (p) p.textContent = 'Connected'; }`. Result: source 0, jsdom 0, catalog 0, Playwright 11 pass. Chromium probe: the pill reads `WEBSITE HANDOFF`, then `CONNECTED` after one `integration.health` broadcast, still `CONNECTED` five seconds later, and `WEBSITE HANDOFF` again after the next render. The "other controls" test sends the event and then re-renders six times before it reads the pill, so the check cannot fail for an event-driven change. A variant that keeps the text across renders (Z36) is killed, which shows the assertion itself is live.
  - The evidence file records "Y48 hub event sets the pill to Connected | jsdom FAIL | playwright pass | killed". The author's formulation is not in the repository; it presumably names the card class, which the source scan catches. The plan's sentence that the 14 third-audit mutants "are all killed" is therefore not reproducible for Y48 as the audit defined it, and the file's own line shows that the new Playwright test does not kill it.
  - Which side of the line: the rule makes "any of the three fixed remediation items ... not effective" blocking. I place this on the non-blocking side for three reasons. Item 3 exists for #940 B2 (provider contact through other controls) and is effective for that. The step order that defeats it is the third audit's own. Y48 belongs to the class the rule assigns to code review. A Governor who reads the clause literally may treat it as blocking; remediation item 3 above closes it either way.
- **N2. Defect in the shipped card, inherited from the catalog: the title is invisible in the light theme (boundary call).** In the Pegasus theme `--text-main` is `#0f172a`. The card's `<strong>Statewright AI</strong>` has no colour of its own, so it renders `rgb(15, 23, 42)` on the card's hard-coded `#182332` to `#111a25` gradient: contrast **1.02**. The pill (6.35), disclaimer (7.85), link (15.19) and address (4.56) keep their own colours and stay readable; the disclaimer and the link both name Statewright. In the other five themes the title measures 12.85 or more.
  - Which side of the line: the rule makes "a defect in the shipped source" blocking. I place this on the non-blocking side because it is not specific to this change and is not a regression: every one of the eleven existing cards on `origin/main` has the same title colour on the same kind of hard-coded dark background (measured: `rgb(15, 23, 42)` on `linear-gradient(rgb(20, 26, 34), rgb(16, 22, 30))`), and neither the card nor its disclaimer is hidden. It is still a real defect in new code, and no earlier audit reported it. The Governor may read the clause the other way. The fix is one rule for all twelve cards (`.cc-intcat-head strong { color:#f1efe7; }` in the renderer's `STYLE`), which would change a shipped file and so need a fresh installed-host run.
- **N3. A new render state can omit the card (boundary call; class "plain").** Z17 adds `if (res.status === 404) { this.container.innerHTML = ...a message without the card...; return; }` after the fetch. All suites pass; with the catalog route answering 404, Chromium shows no Statewright card. Z30 does the same for an `AbortError` in the `catch`. The generic form (`if (!res.ok)`, Z18) is killed by the jsdom HTTP 500 state. I place this on the non-blocking side: it needs a whole new branch, which owes its own test, and the shipped server never answers 404 on this route. The source contract's comment "one placement per state" is not enforced, though; the optional count of `innerHTML` assignments would enforce it.
- **N4. Survivors carried from the third audit, unchanged class.** Plain: Y30, Y41 (false status text in the catalog-failure state, provider not named). Obfuscated: Y21 (soft hyphen), Y26 (aliased `requestIdleCallback`, 7 s), Y28 (Web Animations, 6 s). Out of scope: Y25 (workspace value to another host). Cosmetic: Y44 (shared pill colour turned green), X15, X16. The plan's "Accepted limits" paragraph names these classes correctly. Survived at #940 and killed now: Y05, Y06, Y07, Y08, Y10, Y13, Y15, Y16, Y17, Y18, Y19, Y20, Y23, Y34, Y43, Y45, Y47, Y50, Y52, Y53.
- **N5. New survivors that break no rule item.** Z19: the `wire()` selector widened to `.cc-intcat-actions > *`; clicking the Statewright link opens the fixed address once and also switches the Console to Settings (probe: one request, active tab `settings`). Z11: `user-select:none` on the catalog; the address keeps its own `user-select:all`. Z14: the visible address truncated to nine characters with an ellipsis (the link is unaffected; same root cause as B1, lesser effect). Z23: `esc()` stops escaping; another integration's text would be injected as HTML and no test in these five files notices. Z23 is in code this change does not touch.
- **N6. Legitimate edits pass, as they should (no false refusal found).** Z06 (actions stacked vertically), Z07 (link colour `#5fb0d8`), Z15 (merged paragraph rule), Z16 (catalog as a grid), Z26 (`onEvent` re-renders on `integration.health`), Z27 (style order swapped), Z33 (`::before` on a failing pill, which no card has in the test fixture). The unmutated card also passes my own measurements with configured, failing, stale and needs-config integrations present (no generated content in the tab, four lines naming Statewright, no provider request), in all six themes for the three measured elements, in both colour schemes, and at 1280, 1024, 800, 600, 480 and 360 px. Z08 (`.cc-intcat a { font-size:.7rem }`, link at 11.2 px) is refused by the 12 px floor, which is the floor doing its job.
- **N7. Readability thresholds against the real values.**

  | Element | Font size (floor 12) | Box height (floor 12) | Contrast (floor 4.5) | Opacity |
  |---|---|---|---|---|
  | disclaimer `p` | 14.08 px | 38 px | 7.85 | 1 |
  | link | 16 px | 37 px | 15.19 against its own `#141a22` | 1 |
  | address | 12.8 px | 17 px | **4.56** against `#182332` | 1 |

  The address has 0.8 px and 0.06 of contrast in hand. A slightly darker grey, or a size of `.74rem`, fails. That is not a false refusal today, and a change needs an edit to the pinned styles anyway, but the margin is thin. The contrast formula is the WCAG 2.x one and takes the worse of the two gradient stops. The fade-in is handled correctly: I sampled opacity 0, 0.26, 0.62, 0.89, 0.98, 1 over about 300 ms; `expect.poll(...).toBe(1)` waits for it and fails after 5 s on a permanent reduction (Y16 received 0, Z29 received 0.35), so it does not mask one. The title and the pill are not measured; the pill is 11.2 px and would fail the floor, and the title is the element N2 is about.
- **N8. Test-quality notes, none vacuous for a required negative.**
  - Inside the re-render loop, `expect(handoff).toHaveCount(1)` is satisfied at once by the loading markup, which already holds one card. Z22 (card duplicated from the sixth render) is killed later, by a strict-mode error in `handoff.hover()`; Z21 (card dropped) by the 45 s timeout of the same call.
  - `assert.ok(!/::|content\s*:|url\(|@/.test(STYLES))` tests the literal in the test file. It is redundant with the equality on the line above and can fail only when the reviewer edits the constant.
  - The closing `toHaveText(/...workflows\.$/)` of the readability test reads `textContent`, so it passes on hidden text.
  - Of the four broadcast messages, `init` and `hub.refresh` each cause a render, `integration.health` reaches `onEvent`, and `verdict` reaches neither (the Console routes it to the overview and governance renderers only).
  - Z20, Z21, Y09 and Y11 are killed by a 45 s timeout and not by an assertion (carried N11 of #940).
  - `openCard` requires exactly eleven catalog cards and the first test eleven disabled pills, so a twelfth catalog integration on `main` will fail this spec.
- **N9. Evidence file.** Besides Y48: the IDs Y01 to Y05 are used twice in the same file for different mutants (the author's five and the third audit's); the column headed "jsdom" is the mocha run of both the jsdom and the source suites (Y17 to Y20, Y43 and Y52 fail the source pin, not jsdom); M12 is recorded as "playwright pass", and with the earlier audits' definition the readability test's closing text check now fails. For every other mutant the file names that I could map to an audit definition (M02, M06, M11, M16 to M21, X09, X12, X17, X21, X22, X24, X26, X29, X30, Y05, Y06, Y07, Y15, Y16, Y17 to Y20, Y23, Y43, Y45, Y52) my per-suite results agree.
- **N10. Plan wording.** (a) Item 2 "measures what is rendered ... against the backdrop": the backdrop is a constant (B1). (b) "14 from the third audit ... are all killed": Y48 (N1). (c) Iteration 3, "it makes any new behaviour in these two files fail a named test": Z17, Z19 and Z26 are new behaviour and fail nothing; iteration 4's "Accepted limits" and "Maintenance note" are the accurate statements. (d) "sends four hub events": four WebSocket messages, see N8. Checked and correct: the renderer is 245 lines (243 on `main`), the fetch is at line 197 on `main` and 198 at HEAD, the shipped files are identical to `dd766c15`, the remote-tracking branch is still at `1fd4a557`.
- **N11. jsdom harness residue (carried N8 of #940, re-measured).** After the suites `global.setTimeout`, `setInterval` and `fetch` are the originals. `window`, `document` and `requestAnimationFrame` remain as own keys of `global` with the value `undefined`; they were absent before.
- **N12. Carried, unchanged.** No CSP or `Referrer-Policy` on the Console server; focus on the link is lost on every re-render; the source contract fails on harmless renderer edits that add a listener, a request or a scanned word (intended); `.agent/` is gitignored while the reports are tracked.

## Section 4 razor

Measured from the committed blobs at HEAD with the TypeScript parser. Limits: function 40 lines, file 250 lines, nesting 3.

| File (added or modified against `origin/main`) | Lines | Longest function | Control nesting inside one function | Nesting counting enclosing functions |
|---|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | 245 | `render` 38 | 2 | 4 (`wire`: method, two callbacks, `if`; unchanged from `main`) |
| `src/roadmap/ui/modules/statewright-handoff.js` | 28 | none | 0 | 0 |
| `src/test/roadmap/statewright-handoff-source.test.ts` | 80 | suite callback 23 | 0 | 3 |
| `src/test/roadmap/statewright-handoff.test.ts` | 143 | `cardContract` 23 | 1 | 4 |
| `src/test/ui/statewright-handoff.spec.ts` | 169 | test callback 25 | 1 | 4 |

No breach under the convention all three earlier audits used (control blocks inside a function). The fourth level in the last column is callback nesting in expressions (`suite` > `test` > arrow > `try`, or `readability` > `evaluate` callback > helper arrow > `map` arrow), not block depth. The two changelogs gain one identical three-line entry.

## Mutation tables

Method. Each mutant was applied alone to a disposable export of HEAD, `copy-ui-js` was run, then the three mocha files and the two Playwright specs in full (no fail-fast). Columns `source`, `jsdom` and `catalog` are failing-test counts in `statewright-handoff-source.test` (5 tests), `statewright-handoff.test` (18) and `integration-catalog-renderer.test` (9). The Playwright column gives the number of failing tests of 11 and which: T1 idle and claims, T2 keyboard, T3 mouse click, T4 readability (new), T5 other controls (new), T6 catalog failure, IC the older catalog spec. M01 to X32 use the second auditor's definitions (`muts.cjs`, sha256 `48d3dacb...`); Y01 to Y53 use the third auditor's (`mutants.cjs`, sha256 `4a8132cf...`). I copied both files unmodified from the session scratch directory and checked that every anchor matches the shipped files exactly once. Z01 to Z36 are mine. File: R renderer, H handoff module.

| ID | File | Mutation | source | jsdom | catalog | Playwright | Result | Class of survivor |
|---|---|---|---|---|---|---|---|---|
| M01 | H | img beacon in card | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| M02 | H | link preconnect in card | 2 | 12 | 0 | pass 11 | killed |  |
| M03 | H | link prefetch of /runs | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| M04 | R | fetch statewright api in render() | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| M05 | H | hidden iframe of /runs | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| M06 | H | ping attribute on anchor | 2 | 18 | 0 | FAIL 2 (T2-key+T3-click) | killed |  |
| M07 | H | utm query on href | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| M08 | R | click handler appends ?ws=<page URL> | 2 | 0 | 0 | FAIL 2 (T2-key+T3-click) | killed |  |
| M09 | H | drop noreferrer | 2 | 12 | 0 | FAIL 3 (T1-idle+T2-key+T3-click) | killed |  |
| M10 | H | drop target and noopener | 2 | 12 | 0 | FAIL 3 (T1-idle+T2-key+T3-click) | killed |  |
| M11 | H | extra Connected pill (observed class) | 2 | 6 | 0 | FAIL 2 (T1-idle+T5-other) | killed |  |
| M12 | H | copy adds signed in/partner/synced | 2 | 6 | 0 | FAIL 1 (T4-read) | killed |  |
| M13 | H | card also carries cc-intcat-card | 2 | 6 | 1 | FAIL 7 (IC+T1-idle+T2-key+T3-click+T4-read+T5-other+T6-error) | killed |  |
| M14 | R | header count +1 | 0 | 0 | 1 | pass 11 | killed |  |
| M15 | R | no handoff in fetch-failure markup | 1 | 6 | 0 | FAIL 1 (T6-error) | killed |  |
| M16 | R | handoff only when catalog non-empty | 0 | 6 | 0 | pass 11 | killed |  |
| M17 | R | window.open on render | 2 | 6 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| M18 | R | auto-click link 3 s after render | 1 | 6 | 0 | FAIL 1 (T1-idle) | killed |  |
| M19 | H | Connect account button in card | 2 | 12 | 0 | pass 11 | killed |  |
| M20 | H | tabindex=-1 aria-hidden on anchor | 2 | 12 | 0 | pass 11 | killed |  |
| M21 | R | no handoff in loading markup | 1 | 3 | 0 | pass 11 | killed |  |
| M22 | R | other cards lose Docs link | 0 | 0 | 1 | pass 11 | killed |  |
| X01 | H | second (empty) anchor to statewright login in card | 2 | 12 | 0 | pass 11 | killed |  |
| X02 | H | onmouseover attribute rewrites href with page query | 2 | 18 | 0 | FAIL 3 (T1-idle+T3-click+T5-other) | killed |  |
| X03 | H | rel gains opener token | 2 | 12 | 0 | FAIL 1 (T1-idle) | killed |  |
| X04 | H | rel reordered (noreferrer noopener) [cosmetic control] | 2 | 12 | 0 | FAIL 1 (T1-idle) | killed |  |
| X05 | H | meta refresh to /runs after the card | 2 | 12 | 0 | pass 11 | killed |  |
| X06 | R | base href statewright appended to head | 1 | 6 | 0 | pass 11 | killed |  |
| X07 | R | navigator.sendBeacon with page query in render() | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X08 | R | new Image() beacon with page query in constructor | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X09 | R | document mousedown listener rewrites href with page query (mouse click only) | 2 | 6 | 0 | FAIL 2 (T3-click+T5-other) | killed |  |
| X10 | H | URL constant downgraded to http: | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X11 | H | URL constant changed to look-alike host | 2 | 12 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X12 | R | WebSocket to statewright with page query in render() | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X13 | R | EventSource to statewright in render() | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X14 | R | handoff card injected twice (loaded state) | 1 | 9 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T4-read+T5-other) | killed |  |
| X15 | R | disabled integration cards styled as configured | 0 | 0 | 0 | pass 11 | **SURVIVED** | cosmetic, untouched code |
| X16 | R | other cards: Configure button relabelled Connect | 0 | 0 | 0 | pass 11 | **SURVIVED** | cosmetic, untouched code |
| X17 | R | other cards: Configure click also opens Statewright | 2 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| X18 | R | handoff moved after the catalog sections | 0 | 2 | 0 | pass 11 | killed |  |
| X19 | R | handoff wrapped inside a configured integration card | 0 | 6 | 1 | FAIL 6 (IC+T1-idle+T2-key+T3-click+T4-read+T5-other) | killed |  |
| X20 | H | visible address differs from the link | 2 | 6 | 0 | FAIL 1 (T1-idle) | killed |  |
| X21 | H | style rule hides the disclaimer paragraph | 2 | 0 | 0 | FAIL 2 (T1-idle+T4-read) | killed |  |
| X22 | H | style ::after adds a visible "Connected" to the pill | 2 | 0 | 0 | FAIL 1 (T1-idle) | killed |  |
| X23 | H | style ::after overlays the whole page with the link | 2 | 0 | 0 | FAIL 4 (IC+T1-idle+T5-other) | killed |  |
| X24 | R | scheduler.postTask navigates the Console tab to /runs after 12 s | 2 | 0 | 0 | pass 11 | killed |  |
| X25 | R | click listener sends an extra beacon with page query | 2 | 0 | 0 | FAIL 2 (T2-key+T3-click) | killed |  |
| X26 | R | hovering the card opens /runs (mouseover listener) | 2 | 6 | 0 | FAIL 3 (T1-idle+T3-click+T5-other) | killed |  |
| X27 | R | window.open in the catalog-failure branch only | 2 | 4 | 0 | FAIL 1 (T6-error) | killed |  |
| X28 | R | same-tab location.assign to /runs at end of render() | 2 | 0 | 0 | FAIL 10 (IC+T1-idle+T2-key+T3-click+T4-read+T5-other) | killed |  |
| X29 | R | status line outside the card claims Statewright connected | 1 | 3 | 0 | FAIL 1 (T1-idle) | killed |  |
| X30 | H | pill title/aria-label say Connected | 2 | 6 | 0 | pass 11 | killed |  |
| X31 | H | stylesheet background-image request to statewright | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| X32 | R | window.open on second and later render() calls | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| Y01 | R | computed global: window['op'+'en'](link.href) on render | 0 | 6 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y02 | R | alias: const w = window; w.open(link.href) on render | 1 | 6 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y03 | R | destructured alias: const { open: go } = window; go(link.href) | 0 | 6 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y04 | R | render(): detached <img> whose src is the link href (no provider name, no listed API) | 0 | 0 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y05 | R | Configure click also loads an <img> from the link href | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y06 | R | Configure click also clicks the Statewright link | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y07 | R | onEvent() loads an <img> from the link href on every hub event | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y08 | R | mixed-case inline handler onWheel on the wrapper (loaded state) loads an <img> from the link href | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y09 | R | container.setAttribute('onmousedown', ...) appends the page query to the link | 0 | 0 | 0 | FAIL 2 (T3-click+T5-other) | killed |  |
| Y10 | R | container.setAttribute('oncontextmenu', ...) appends the page query to the link (right-click, copy link) | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y11 | H | handoff module, import time: computed addEventListener + handleEvent object rewrites the link on mousedown | 1 | 0 | 0 | FAIL 2 (T3-click+T5-other) | killed |  |
| Y12 | H | handoff module, import time: plain statement loads an <img> from the provider | 1 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| Y13 | H | handoff module, import time: body.setAttribute('onwheel', ...) contacts the provider on scroll | 1 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y14 | R | renderer STYLE: section .cc-intcat-pill::after adds " · Connected" | 0 | 0 | 0 | FAIL 1 (T1-idle) | killed |  |
| Y15 | R | renderer STYLE: .cc-intcat-sub::after adds "Run history provider: connected, signed in." above the card | 0 | 0 | 0 | FAIL 1 (T1-idle) | killed |  |
| Y16 | R | renderer STYLE: .cc-intcat section p { opacity:0 } hides the disclaimer | 0 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y17 | H | card stylesheet: disclaimer colour changed to the card background colour (#a9b8cb -> #182332) | 2 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y18 | H | card stylesheet: disclaimer font-size typo .88rem -> .08rem | 2 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y19 | H | card stylesheet: disclaimer color:transparent | 2 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y20 | H | card stylesheet: disclaimer margin moves it off-screen (margin:0 0 10px -300vw) | 2 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y21 | R | error status line gains "State&shy;wright connected" (soft hyphen splits the name) | 0 | 0 | 0 | pass 11 | **SURVIVED** | obfuscated |
| Y22 | R | loaded status line gains "Run history provider connected." | 0 | 3 | 0 | pass 11 | killed |  |
| Y23 | R | heading becomes "Integration Catalog · run history connected" in all three states | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y24 | R | render(): <img> to 'https://state'+'wright.ai/t?' + document.URL (split host name, workspace value) | 0 | 0 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y25 | R | render(): <img> to a different host carrying the page URL (workspace value) | 0 | 0 | 0 | pass 11 | **SURVIVED** | out of scope |
| Y26 | R | aliased requestIdleCallback loop clicks the link after 7 s | 0 | 0 | 0 | pass 11 | **SURVIVED** | obfuscated |
| Y27 | R | aliased setTimeout (const later = window.setTimeout) clicks the link after 6 s | 0 | 6 | 0 | pass 11 | killed |  |
| Y28 | R | Web Animations: link.animate([], 6000).finished then loads an <img> from the link href | 0 | 0 | 0 | pass 11 | **SURVIVED** | obfuscated |
| Y29 | R | render(): hidden <iframe> of the link href appended to the container | 0 | 3 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y30 | R | error state only: extra group label 'Connected · signed in' under the card | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain deliberate |
| Y31 | R | other cards: every Docs link retargeted to the Statewright link href after render | 0 | 1 | 1 | pass 11 | killed |  |
| Y32 | R | Reflect.apply(window.open, window, [link.href]) on render | 0 | 6 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y33 | R | optional call window.open?.(link.href) on render | 0 | 6 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y34 | R | aliased addEventListener (container[name]) on 'wheel' loads an <img> from the link href | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y35 | R | aliased addEventListener (container[name]) on 'contextmenu' appends the page query to the link | 0 | 3 | 0 | FAIL 1 (T5-other) | killed |  |
| Y36 | R | form.submit() to the link href in a new tab on render | 0 | 0 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y37 | R | render(): link href gains the page query (document.URL, no listed API) | 0 | 9 | 0 | FAIL 4 (T1-idle+T2-key+T3-click+T5-other) | killed |  |
| Y38 | R | renderer STYLE: .cc-intcat-actions a { pointer-events:none } makes the Statewright link (and Docs links) unclickable | 0 | 0 | 0 | FAIL 3 (T1-idle+T3-click+T5-other) | killed |  |
| Y40 | R | Statewright card pill gains the observed status class after render (classList.add) | 0 | 3 | 0 | pass 11 | killed |  |
| Y41 | R | error state: status text 'Could not load integrations' replaced by 'Provider connected' (no name) | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain deliberate |
| Y43 | H | card stylesheet: link colour equals its background (#f1efe7 -> #141a22), label unreadable | 2 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y44 | R | renderer STYLE: shared .cc-intcat-pill restyled green like a healthy status (colour only) | 0 | 0 | 0 | pass 11 | **SURVIVED** | cosmetic |
| Y45 | H | handoff module, import time: document.title = 'Statewright: connected' | 1 | 0 | 0 | FAIL 1 (T1-idle) | killed |  |
| Y46 | R | loaded state places STATEWRIGHT_HANDOFF.replace('Website handoff', 'Connected') | 0 | 3 | 0 | FAIL 2 (T1-idle+T5-other) | killed |  |
| Y47 | R | render counter: from the 6th render the Statewright pill text becomes "Connected" | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Y48 | R | onEvent() sets the Statewright pill text to "Connected" on any hub event | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain deliberate (N1) |
| Y49 | R | Configure click also sets window.location to the link href (assignment form, same tab) | 0 | 0 | 0 | FAIL 2 (IC+T5-other) | killed |  |
| Y50 | H | card stylesheet: link gets display:block and the card padding grows (harmless restyle, control) | 2 | 0 | 0 | pass 11 | killed |  |
| Y51 | H | card stylesheet: background gains image-set("https://statewright.ai/bg.png" 1x) (remote resource without url() | 2 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T5-other+T6-error) | killed |  |
| Y52 | H | card stylesheet: visible address colour equals the card background (#7f8aa0 -> #111a25) | 2 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Y53 | R | mixed-case inline handler onContextMenu on the wrapper (loaded state) appends the page query to the link | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Z01 | R | STYLE: .cc-intcat p { white-space:nowrap; overflow:hidden; text-overflow:ellipsis } (one-line summaries) | 0 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Z02 | R | STYLE: .cc-intcat p clamped to one line with -webkit-line-clamp | 0 | 0 | 0 | pass 11 | **SURVIVED** | **plausible, blocking (B1)** |
| Z03 | R | STYLE: .cc-intcat p { max-height:1.3em; overflow:hidden } | 0 | 0 | 0 | pass 11 | **SURVIVED** | **plausible, blocking (B1)** |
| Z04 | R | STYLE: .cc-intcat p { display:none } (control) | 0 | 0 | 0 | FAIL 2 (T1-idle+T4-read) | killed |  |
| Z05 | R | STYLE: .cc-intcat-actions { display:none } (control) | 0 | 0 | 0 | FAIL 8 (IC+T1-idle+T2-key+T3-click+T4-read+T5-other+T6-error) | killed |  |
| Z06 | R | STYLE: .cc-intcat-actions stacked vertically (legitimate restyle, should pass) | 0 | 0 | 0 | pass 11 | **SURVIVED** | legitimate edit |
| Z07 | R | STYLE: .cc-intcat a { color:#5fb0d8 } (legitimate link colour, should pass) | 0 | 0 | 0 | pass 11 | **SURVIVED** | legitimate edit |
| Z08 | R | STYLE: .cc-intcat a { font-size:.7rem } (link shrinks to 11.2px) | 0 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Z09 | R | STYLE: light-mode media rule lightens card backgrounds (.cc-intcat-card, .cc-intcat section) and darkens only .cc-intcat-card text | 0 | 0 | 0 | pass 11 | **SURVIVED** | **plausible, blocking (B1)** |
| Z10 | R | STYLE: .cc-intcat > section { background:#c9d4e2 } (card background lightened, text colours unchanged) | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain deliberate (B1 root cause) |
| Z11 | R | STYLE: .cc-intcat * { user-select:none } (address no longer selectable) | 0 | 0 | 0 | pass 11 | **SURVIVED** | cosmetic (N5) |
| Z12 | R | STYLE: .cc-intcat section { max-height:0; overflow:hidden; padding:0; border:0 } (card collapsed) | 0 | 0 | 0 | FAIL 5 (T1-idle+T2-key+T3-click+T4-read+T5-other) | killed |  |
| Z13 | R | STYLE: .cc-intcat p { text-indent:-999em } | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain deliberate (B1 root cause) |
| Z14 | R | STYLE: .cc-intcat-actions span truncated to 9ch with ellipsis (visible address cut) | 0 | 0 | 0 | pass 11 | **SURVIVED** | cosmetic (N5) |
| Z15 | R | STYLE: merged rule .cc-intcat-sub, .cc-intcat p { margin; font-size:.9rem; color } (legitimate refactor, should pass) | 0 | 0 | 0 | pass 11 | **SURVIVED** | legitimate edit |
| Z16 | R | STYLE: .cc-intcat becomes a card grid (legitimate layout restyle) | 0 | 0 | 0 | pass 11 | **SURVIVED** | legitimate edit |
| Z17 | R | render(): new HTTP 404 branch shows a message without the card | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain, boundary (N3) |
| Z18 | R | render(): new !res.ok branch shows a message without the card | 0 | 3 | 0 | pass 11 | killed |  |
| Z19 | R | wire(): selector broadened to '.cc-intcat-actions > *' (clicking the Statewright link also jumps to Settings) | 0 | 0 | 0 | pass 11 | **SURVIVED** | no rule item broken (N5) |
| Z20 | R | wire(): broadened selector and preventDefault (Statewright link dead; control) | 0 | 0 | 0 | FAIL 2 (T2-key+T3-click) | killed |  |
| Z21 | R | render counter: card omitted from the loaded state from the 6th render on | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Z22 | R | render counter: card duplicated in the loaded state from the 6th render on | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |
| Z23 | R | esc() no longer escapes (other integrations; out-of-scope control) | 0 | 0 | 0 | pass 11 | **SURVIVED** | out of scope (N5) |
| Z24 | R | refactor: card placed inside the first category group instead of under the status line | 0 | 8 | 0 | pass 11 | killed |  |
| Z25 | R | render(): normalise external links to rel="noopener" (drops noreferrer from the Statewright link) | 0 | 6 | 0 | FAIL 3 (T1-idle+T2-key+T3-click) | killed |  |
| Z26 | R | onEvent(evt) re-renders on 'integration.health' (legitimate behaviour, should pass) | 0 | 0 | 0 | pass 11 | **SURVIVED** | legitimate edit |
| Z27 | R | ensureStyle(): order swapped to STATEWRIGHT_STYLES + STYLE (equivalent today) | 0 | 0 | 0 | pass 11 | **SURVIVED** | equivalent |
| Z28 | R | ensureStyle(): card styles no longer applied (identifier kept in a comment) | 0 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Z29 | R | STYLE: .cc-intcat section { opacity:.35 } (ancestor opacity; control) | 0 | 0 | 0 | FAIL 1 (T4-read) | killed |  |
| Z30 | R | render(): AbortError branch in catch shows a message without the card | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain, boundary (N3) |
| Z31 | R | STYLE: @media (max-width:900px) hides section p (narrow-viewport-only hiding) | 0 | 0 | 0 | pass 11 | **SURVIVED** | plain deliberate (B1 root cause) |
| Z32 | R | STYLE: .cc-intcat p { color:rgba(169,184,203,.04) !important } (alpha is ignored by the contrast computation) | 0 | 0 | 0 | pass 11 | **SURVIVED** | obfuscated (B1 root cause) |
| Z33 | R | STYLE: .cc-intcat-pill-failing::before { content:"! " } (legitimate decoration of another state; does the whole-tab check refuse it?) | 0 | 0 | 0 | pass 11 | **SURVIVED** | legitimate edit |
| Z34 | R | STYLE: light-theme repair [data-theme="pegasus"] gives catalog cards and the section a white background and darkens only .cc-intcat-card text | 0 | 0 | 0 | pass 11 | **SURVIVED** | **plausible, blocking (B1)** |
| Z35 | R | STYLE: .cc-intcat p clamped to two lines (no effect at 1280px; cuts the disclaimer below about 1000px) | 0 | 0 | 0 | pass 11 | **SURVIVED** | **plausible, blocking (B1)** |
| Z36 | R | onEvent(): pill text set to 'Connected' and a flag keeps it across re-renders | 0 | 0 | 0 | FAIL 1 (T5-other) | killed |  |

Totals: M 22 of 22 killed. X 30 of 32 killed (X15, X16 survive, as before). Y 43 of 51 killed (28 survived at #940; 20 of those are killed now). Z 14 of 36 killed. Of the 22 Z survivors, five carry B1 (Z02, Z03, Z35, Z09, Z34), four are deliberate edits with the same root causes (Z10, Z13, Z31, Z32), two are a missing card in a new state (Z17, Z30), four break no rule item or are out of scope (Z11, Z14, Z19, Z23), and seven are legitimate edits or equivalents that ought to pass (Z06, Z07, Z15, Z16, Z26, Z27, Z33). No mutant errored and none was run twice.

## Tests run at the exact commit

| Command (in an export or a detached worktree of HEAD under my temp directory, Node 22.23.4) | Result |
|---|---|
| `npm run compile` | exit 0 |
| `npx mocha --ui tdd --timeout 15000` on the three compiled test files | 32 passing, six consecutive runs |
| Playwright, the two specs, audit config (host resolver mapped to 127.0.0.1, DNS guard) | 11 passed |
| Playwright, the two specs, standard config, `--repeat-each=5`, idle machine | 55 passed (32.7 s) |
| The same, twice more, the two runs concurrent with `--workers=6` each | 55 passed and 55 passed |
| 141 mutants (54 + 51 + 36), each against mocha (3 files) and Playwright (2 specs, 11 tests) | tables above; the 32 survivors are 32 further green runs of all 43 tests |
| Chromium probes of the unmutated source: metrics, fade-in, six themes, six viewports, two colour schemes, configured and failing integrations, render and event counts | N2, N6, N7, N8 and the remediation table |
| Chromium probes of Y48, Z02, Z03, Z09, Z10, Z13, Z14, Z17, Z19, Z34 and of one-line and two-line clamps at four widths | B1, N1, N3, N5 |
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` | 101 pass, 0 fail |
| `npm run lint` | 0 errors, 136 warnings |
| `node scripts/validate-vsix.cjs --source-only` | PASS, v6.0.12 |
| `npm run test:runner-coverage` | PASS, 752 test files, all claimed |
| `npm run test:citation-parity` | exit 0, 35 tracked plans |
| `npm run test:node` | 1066 pass, 2 fail, 18 skipped. Both failures are subtests of `bundled dependencies (C2 T5)` in `bundleDeps.test.cjs` ("no bundle at dist/extension/main.js"), the known artefact |
| Plan and report hashes | plan LF sha256 equals `plan-iter4.json`; reports 1 to 3 are `56527ea7...`, `4851cf12...`, `1cf54f09...`; evidence file `ae2b209e...` |

## Not verified

- `npm test` (vscode-test) and the full `test:all` gate.
- CI for HEAD. The remote-tracking branch is at `1fd4a557`; I made no GitHub request.
- The plan's installed-host table: both VSIX hashes, the 14-of-14 results, the redirect to `https://statewright.ai/login?redirect=/runs`, the absence of referrer, cookie and opener on the real click. These runs were performed outside the repository. I could not verify them and I do not treat them as false.
- That `https://statewright.ai/runs` exists, requires sign-in and shows runs and transition history. No request was made to the host.
- A fresh VSIX build and the packaging of `statewright-handoff.js`.
- The author's own five mutants in the evidence file (its first Y01 to Y05) and M23, M24: their definitions are not in the repository. For Y48 I can say only that the third audit's definition survives.
- The light-theme title (N2) in an installed VS Code webview. I measured it in Chromium against the real Console server by setting `data-theme="pegasus"` on the document element, which is the attribute the theme code sets.
- The real-browser effect of X15, X16, Y21, Y25, Y26, Y28, Y30, Y41 and Y44. I re-ran them against the suites and rely on the third audit's probes for their effect.
- Whether a reviewer would in fact miss Z02 or Z09. That is the judgement B1 rests on, and I have said so.

## State left behind

- `git status --short` in `C:\dev\mythologiq\FailSafe-653` prints nothing; HEAD is still `b883f81449d888a11edb90a2151a3864d13ede54`. I never built, wrote or mutated anything there. This report is the only file I added, under the gitignored `.agent/staging/`. The three earlier reports and the evidence file are untouched (hashes above).
- I added one detached worktree under my temp directory for the git-dependent guards and removed it with `git worktree remove`; `git worktree list` shows no entry of mine.
- The `node_modules` junctions in my five temporary trees were unlinked with `rmdir` before the trees were deleted; the junction target still has its 505 entries.
- My scripts, mutant definitions, results (`results-orig.jsonl`, `results-y.jsonl`, `results-z.jsonl`, `table.txt`), probe output and screenshots are in a new directory of my own, `C:\Users\krkna\AppData\Local\Temp\a653i4-9n78Dg`. I wrote nothing to and deleted nothing from the session scratch directory used by earlier agents; I read `muts.cjs`, `mutants.cjs`, `orig.cjs`, `run.cjs` and `guard.cjs` there and copied the first two.
- To avoid running the same mutants twice I stopped three of my own runner processes by PID. Their child test runs finished on their own, and every lane was restored to the pristine files and checked by hash before it was used again. No other agent's process was touched.
- The repository's Playwright config creates a disposable `failsafe-playwright-home-*` directory in the system temp folder on each run; those from my runs remain.
- Nothing was committed, pushed or posted.
