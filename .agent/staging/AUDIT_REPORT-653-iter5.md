# AUDIT REPORT (iteration 5, fifth audit after VETOs #938, #939, #940 and #941): PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit). No authorship of the change, of any remediation or of any earlier audit.
- **Date:** 2026-11-11
- **Exact source audited:** `54f676468aeb14a5d8edc027e737949cc14eef76` (`git rev-parse HEAD` in `C:\dev\mythologiq\FailSafe-653`, branch `feat/652-statewright-website-handoff`)
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`
- **Previously audited:** `1fd4a557` (VETO, #938), `dd766c15` (VETO, #939), `45a78c4d` (VETO, #940), `b883f814` (VETO, #941)
- **Plan:** `.failsafe/governance/plans/plan-v6013-statewright-652-website-first.md`, iteration 5 (LF sha256 `3f900467333bcbe172ecb7c73ed4e303863eac0145760ef42cf4443f08200f7a`, equal to `plan_content_hash` in `plan-iter5.json`)
- **Environment:** Windows 11, Node 22.23.4, Playwright Chromium. No request reached `statewright.ai`: Playwright routes fulfilled the host, Chromium ran with `--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost` for every mutation, probe and repeat run, and a Node preload refused every non-loopback DNS lookup in the mutation runs (it refused 27 lookups of `statewright.ai`, all from jsdom's WebSocket under mutant X12).
- **Method:** every mutant and probe ran in disposable `git archive` exports of HEAD under a new directory of my own in the system temp folder. The audited worktree was never built in, written to or mutated.

## Verdict: VETO

Two blocking findings under the verdict rule I was given. The first stands by itself. The second is a boundary call and I say so.

- **B1 (solid).** The new readability test scrolls its target into view before it measures, and that scroll also moves the content of boxes a reader cannot scroll (`overflow:hidden`), the card included. The check "every line lies inside the card" is then satisfied for text the reader cannot see. With one shared rule in the renderer's `STYLE` that caps card height, the link and the address are invisible at 600 px (and the disclaimer loses its last line with a lower cap) while all 47 tests pass. Item 1 of the fourth audit's closed list is therefore not effective for clipping by the card or by any ancestor, which the item itself says it covers, and the plan's sentence "a height cap ... fails" is not true for a cap on the card.
- **B2 (boundary).** A shared rule that applies only in a view the tests do not sample hides the disclaimer with every test green. Measured: a one-line clamp for wide screens (`@media (min-width:1400px)`) hides 103 of the disclaimer's 166 characters, including the whole sentence "FailSafe does not read Statewright history or enforce Statewright workflows", at 1400 px and wider. This is the fourth audit's Z35 one step further out. I place it on the blocking side because I cannot draw a principled line between "600 px was unsampled then" and "1400 px is unsampled now". I also think sampling more views cannot end this class; see "On the verdict rule".

What is sound, and it is most of it:

- The shipped source is unchanged since `dd766c15` and I found no safety or truthfulness defect in it. It is static, makes no provider call, sends nothing and claims no connection.
- All three items of the fourth audit's closed list are implemented, and every mutant that audit named is now killed: Z02, Z03, Z35, Z09, Z34 (its blocking five), Z10, Z13, Z31, Z32, Z14 and Y48.
- 141 earlier mutants re-run with the auditors' own definitions: 120 killed, 21 survive, and every survivor is one the fourth audit classed as non-blocking. Eleven changed from survived to killed; none changed the other way.
- No razor breach, no flake in 375 repeated Playwright tests, no false refusal of a legitimate state at HEAD in the five tested views, regression guards green.

**If the Governor's bar is "the mutants the fourth audit named are killed", this is a PASS.** Under the rule as written ("any item of the fourth audit's closed list not implemented or not effective" is blocking), B1 is a hit: the test passes on a card whose link nobody can see.

### On the verdict rule

I report under the rule as written. Three observations, as the brief allows.

1. B1 is a defect in a test, with a two-line fix that I have prototyped and checked against HEAD. It is the kind of risk tests should carry.
2. B2 is not. Each audit since the third has found the next view, value or condition that the tests did not sample, and a sixth would find another (`min-width:2000px`, a theme, a print sheet). The class ends only if the renderer's shared style sheet is pinned for review, as the card's own styles already are, or if the owner records that conditional shared rules are a code-review risk. Remediation item 2 below does the first. The second is the owner's decision, not mine.
3. After those two items, what remains is deliberate or obfuscated edits, style sheets outside the two shipped files, and new render states. That belongs to code review and to the owner. I recommend that the check of the next iteration be a confirmation of the list below (re-run V16, V39, V38, V25 and the Z set), not a sixth open-ended mutation hunt.

## Risk grade: L2

Unchanged from the four earlier audits. User-facing navigation to a third-party site and product-truth copy about that third party. No credential handling, no data egress by FailSafe, no backend, schema or dependency change, so not L3. This iteration changed one test file, the plan, the evidence file, the ledger and gate files only.

## Status of #941 B1 and of the closed remediation list

| Item | Status | Evidence |
|---|---|---|
| **B1 of #941** (one shared rule in the renderer's `STYLE` clips or washes out the disclaimer with every test green: Z02, Z03, Z35, Z09, Z34) | **Closed for the five mutants and the four same-cause variants. Open for clipping by the card or an ancestor (B1 below) and for rules conditional on an unsampled view (B2 below)** | Z02 and Z03 fail all five readability views (`clipped` expected 0, received 1 or 3). Z35 fails the two 600 px views (received 2). Z09 fails the three light-scheme views with contrast `1.8804590513212347`, the value the fourth audit measured by hand. Z34 fails the two Pegasus views with `2.018152120768678`. Z10 fails five views (1.35), Z13 five (clipped 1), Z31 the two narrow views, Z32 five (`textAlpha` 0.04) |
| **Item 1**: every character or line rectangle of the disclaimer, link and address lies inside the element, the card and the viewport | **Implemented. Effective for clipping by the element itself. Not effective for clipping by the card or by an ancestor** | Kills Z01, Z02, Z03, Z13, Z14, Z35 and my V01, V03, V07, V14, V17, V18, V23. Misses V16, V39, V42 (height cap on the card) and V05, V40 (height cap on the action row). Cause: `await target.scrollIntoViewIfNeeded()` runs before every measurement and scrolls `overflow:hidden` boxes; the frames are the element, the card and the viewport only. See B1 |
| **Item 2**: contrast against the rendered backdrop, opaque text colour, a narrow viewport and the light theme | **Implemented and effective for what the list asked** | Backdrop is the nearest ancestor with a gradient or a non-transparent `background-color`; the worse gradient stop is used; the WCAG 2.x formula is correct (I recomputed 7.85, 15.19 and 4.56 independently and measured 8.23, 15.19 and 4.94 from screenshots). `textAlpha` must be 1. Five views: default 1280, default 600, default with light scheme, Pegasus 1280, Pegasus 600. Each view is live: Z35 fails exactly the two narrow ones, Z09 exactly the three light-scheme ones, Z34 exactly the two Pegasus ones. Limits in N6 |
| **Item 3**: read the pill immediately after the hub events and before the re-render loop | **Implemented and effective** | Y48 with the third audit's definition: source 0, jsdom 0, Playwright fails in the "other controls" test with `Expected: "Website handoff" Received: "Connected"`. The link `href` is read at the same point and that check is live too (my V41: `onEvent` appends the page address to the link; it fails there and would be repaired by the next render). Probe with an instrumented build: `integration.health` reaches the catalog's `onEvent` and causes no render (render count 6 before and after; events recorded `["integration.health"]`); `init`, `hub.refresh` and `verdict` do not reach `onEvent`; nothing re-renders in the following six seconds; with Y48 the pill reads `CONNECTED` for those six seconds and `WEBSITE HANDOFF` again after the loop |

Byte-identity claims, checked with `git rev-parse <rev>:<path>`:

| File | `origin/main` | `dd766c15` | `b883f814` | HEAD |
|---|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | `d2308b43` | `8a15f1ae` | `8a15f1ae` | `8a15f1ae` |
| `src/roadmap/ui/modules/statewright-handoff.js` | absent | `fda005ad` | `fda005ad` | `fda005ad` |
| `src/test/roadmap/integration-catalog-renderer.test.ts` | `b2b261cc` | `0f5695ad` | `b2b261cc` | `b2b261cc` |
| `src/test/ui/integrations-catalog.spec.ts` | `2a75d9fa` | `2a75d9fa` | `2a75d9fa` | `2a75d9fa` |
| `src/test/roadmap/statewright-handoff.test.ts` | absent | `97832987` | `04e6509f` | `04e6509f` |
| `src/test/roadmap/statewright-handoff-source.test.ts` | absent | absent | `0ae8e2f9` | `0ae8e2f9` |
| `src/test/ui/statewright-handoff.spec.ts` | absent | `f2768596` | `f9ac7202` | `3ed53327` |

All four claims hold. `54f67646` changes `statewright-handoff.spec.ts`, the plan, the evidence file and gate files; `08f78e44` adds the fourth report, the ledger entry and gate files. Nothing else.

## Blocking findings

### B1. The readability test scrolls clipped boxes before it measures, so a card that cuts off its own link or disclaimer passes

Rule item: "any item of the fourth audit's closed list not implemented or not effective" (item 1). Rule item (d) for V39. Plan claim contradicted: iteration 5, item 1, "every rendered line of the disclaimer, the link and the address must lie inside its element, the card and the viewport. A line clamp, a height cap or a truncation fails."

Each mutant is one rule added at the end of the renderer's `STYLE`. Suites: source 5 tests, jsdom 18, catalog 9, Playwright 15 (10 in the Statewright spec, 5 in the older catalog spec).

| ID | Rule added to `STYLE` | source | jsdom | catalog | Playwright | Measured in Chromium, page as loaded |
|---|---|---|---|---|---|---|
| V16 | `.cc-intcat > * { max-height:120px; overflow:hidden; }` | 0 | 0 | 0 | 15 pass | 600 px: link 25 of 25 characters hidden, address 27 of 27 hidden; the card ends after the disclaimer (screenshot `shot-V16-600.png`). 1280 px: the bottom 6 px of the link box is cut, the text is readable |
| V39 | the same with `max-height:100px` | 0 | 0 | 0 | 15 pass | 600 px: the disclaimer loses its last line (21 of 166 characters, from " or enforce Statewright workflows."), link and address fully hidden. 1280 px: link and address fully hidden |
| V42 | the same as V16 with `overflow:auto` | 0 | 0 | 0 | 15 pass | the link is below the fold of a card that scrolls inside itself; not probed further |
| V05 | `.cc-intcat-actions { height:36px; overflow:hidden; }` | 0 | 0 | 0 | 15 pass | 600 px: the two-line link box (58 px) is cut to 36 px; about 4 px of the first line and 2 px of the second are shaved. Readable; cosmetic |
| V40 | the same with `overflow:clip` | 0 | 0 | 0 | 15 pass | as V05 |

What the test does under V16 at 600 px, recorded by resetting and inspecting scroll offsets around a verbatim copy of the test's own `evaluate` callback: `readability(link)` returns `clipped: 0` of 2 lines, and afterwards `section.cc-intcat-statewright` has `scrollTop = 81`. Under V39 the card is scrolled by 19 px for the disclaimer and by 101 px for the link. `scrollIntoViewIfNeeded` scrolls every ancestor that can be scrolled by script, and an `overflow:hidden` box can. The test then compares the line rectangles with the card's box and finds them inside.

Root causes in `readability()`:

1. `await target.scrollIntoViewIfNeeded()` on the measured element (line 104), run again for every poll and every measurement. It changes what is being measured.
2. `frames` holds the element, the card and the viewport. A clipping box between the element and the card (the action row) or above the card is never compared (V05 and V40 survive even without the scroll).

The same scroll hides a real state at HEAD, see N4: below a viewport width of about 520 px the Console cuts the card's text off at the right edge, and the test, pointed at 360 px, would pass because it scrolls `div.app-layout` (`overflow-x:hidden`) sideways by 162 px first. The five tested views (600 and 1280 px) are not affected: nothing is scrolled there at HEAD and my independent measurement agrees with the test's.

Why I call it blocking, and how firmly: the rule has no plausibility test for a closed-list item that does not work, and this one fails on a case its own text names ("it also covers clipping by an ancestor"). As mutants, V16 and V39 are not plausible accidents: every catalog card is taller than the Statewright card at every width (194 against 142 px at 1280; 230 to 263 against 201 px at 600), so any cap that cuts the Statewright card cuts every other card more, in plain view. V05 is the plausible one and its effect is cosmetic. If the Governor reads "effective" as "kills the mutants the list named", B1 moves to the non-blocking list. I do not read it that way, because the test's own comment and the plan both say that a height cap fails, and it does not.

### B2. A shared rule conditional on a view the tests do not sample hides the disclaimer (boundary call)

Rule item broken: (d) "hides the card or its disclaimer or makes them unreadable".

| ID | Rule added to `STYLE` | source | jsdom | catalog | Playwright | Measured in Chromium |
|---|---|---|---|---|---|---|
| V38 | `@media (min-width: 1400px) { .cc-intcat p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; max-width:60ch; } }` | 0 | 0 | 0 | 15 pass | 1400 and 1920 px: 103 of 166 characters hidden. The card reads "View your workflow runs and transition history on Statewright's website..." and nothing more (screenshot `shot-V38-1920.png`). 1280 px: no effect |
| V25 | `[data-theme="atmosphere"] .cc-intcat-card, [data-theme="atmosphere"] .cc-intcat section { background:rgba(255,255,255,.55); }` plus dark text for `.cc-intcat-card p` and `.cc-intcat-head strong` | 0 | 0 | 0 | 15 pass | Atmosphere theme: disclaimer contrast 2.02 by the test's formula and 1.47 measured from pixels; address 3.47 and 1.48. Default theme: no effect |

Same class, written with knowledge of the test views, listed for completeness and not relied on: V20 (two-line clamp between 700 and 1100 px; 48 characters hidden at 700 px, 21 at 800 px), V21 (one-line clamp when the window is at most 800 px high; 124 characters hidden at 600 x 720), V19 (two-line clamp at 480 px and below, where the layout is already cut). Also unsampled: print (V26, contrast 2.02), the catalog-failure state (V36, the card dimmed to 45 per cent, pixel contrast 2.83 and 2.21).

Why I place V38 on the blocking side: it is the fourth audit's Z02 and Z35 inside a wide-screen breakpoint. It names neither the provider nor the card, its intent (shorter summaries on wide screens) is benign, 1400 px is an ordinary breakpoint and 1440 and 1920 px are ordinary desktop widths. It was not written to dodge the tests in the way V20 was.

Why it is a boundary call: the Console's style sheets contain no `min-width` media query today (only `max-width` 900 and 1100 px, which the 600 px view does cover), so the edit is less likely than an unconditional clamp. Whoever writes a wide-screen rule looks at a wide screen, where the truncated Statewright card is the first card on the page. V25 has no driver comparable to the one behind Z34 (the catalog really is broken in the light theme; nothing is broken in Atmosphere). A Governor may hold that the fourth audit fixed the sample at "1280, 600 and the light theme" and that anything beyond is code review's. That reading is defensible. I decide the other way because the rule did not change and the measured effect, the loss of the sentence that says what FailSafe does not do, is the effect the rule exists for.

What unconditional rules can still do: nothing I could find. The layout stops shrinking at about 547 px, so the disclaimer never has more than four lines at any width, including with the root font size raised to 20 and 24 px. A three-line clamp fails the 600 px views (V01), a four-line clamp never bites (V02), and height caps on the paragraph fail (V03). The 600 px view is the worst case for every unconditional width-driven clip.

### Required remediation

A closed list. Item 1 closes B1. Item 2 closes B2 and every other mutant whose only edit is the renderer's `STYLE`. Item 3 is record-keeping.

1. **Measure the page the reader has.** In `readability()`, do not scroll boxes the reader cannot scroll: remove `target.scrollIntoViewIfNeeded()` (in the five views the card sits between 309 and 564 px from the top of a 900 px viewport, so nothing needs scrolling), or keep it and fail when any ancestor whose computed overflow is `hidden` or `clip` has a non-zero `scrollTop` or `scrollLeft` afterwards. Add to `frames` the padding box of every ancestor whose computed `overflow-x` or `overflow-y` is not `visible`. I ran this as a prototype beside the test's own callback: no refusal at HEAD at 600, 800, 1024, 1280 and 1920 px in seven theme settings, two colour schemes and three catalog states (default, mixed configured and failing, catalog unavailable); V16 and V39 fail on the link and the address (V39 also on the disclaimer), V05 and V40 fail on the link at 600 px.
2. **Pin the renderer's `STYLE` constant by string equality in the source contract**, as item 1 of the third audit's list did for `STATEWRIGHT_STYLES`. Any shared rule, in any media query, theme, container query or state, then fails a named test and is reviewed against the card. This is a review trigger, not a proof, and it makes every catalog restyle touch the test; the plan's maintenance note already accepts that for listeners and requests. It replaces further viewport and theme sampling, which cannot be completed. If the owner prefers not to pin the sheet, the alternative is an owner decision recorded in the plan's "Accepted limits" that conditional shared rules are a code-review risk; I cannot take that decision.
3. **Correct the records**: ledger entries #940 and #941 (N1), the evidence rows for M12 and Y48 and the word "equivalent" for A08 (N8), and the plan sentences in N9.

Optional and cheap: a hit test in `readability()` (`document.elementFromPoint` at the centre of each line rectangle must return the element or a descendant). It catches overlap and `clip-path` (V13, V09) and, without the scroll, card clipping as well.

## Non-blocking findings

- **N1. Ledger entries #940 and #941 record the wrong decision (class: governance record error).** In `docs/META_LEDGER.md` the `**Decision**` paragraphs of entries #939, #940 and #941 are the same text apart from one number. All three say "iteration 2 (plan sha256 ed26bcbb...; exact source dd766c159d6e...)", "a second fresh auditor", "Blocking R1 ... Blocking R2 ... Eleven of 32 new mutants survived". That is the second audit. Entry #940 should describe the third audit (source `45a78c4d`, B1 and B2 of that report) and entry #941 the fourth (source `b883f814`, its B1). Each also says "The three findings of Entry #94x are closed", naming itself. The headers, report hashes, chain hashes and the gate files `audit-iter3.json` and `audit-iter4.json` are correct (right iteration, right `audited_candidate`, right violations), so the chain is intact and the error is in the prose only. It is outside the rule's blocking list (it is neither the plan nor shipped source), and I put it first because a ledger that names the wrong audited commit for two verdicts should be corrected before this change is sealed.
- **N2. Survivors carried from the earlier audits, unchanged class.** Plain deliberate: Y30, Y41. Obfuscated: Y21, Y26, Y28. Out of scope: Y25, Z23. Cosmetic or untouched code: X15, X16, Y44, Z11. No rule item: Z19. Legitimate edits that pass, as they should: Z06, Z07, Z15, Z16, Z26, Z27, Z33.
- **N3. Defect inherited from `main`: the card title is unreadable in the Pegasus light theme.** `<strong>Statewright AI</strong>` computes `rgb(15, 23, 42)` on the card's `#182332` to `#111a25` gradient: contrast 1.13 at the top stop and 1.02 at the bottom; 1.11 measured from pixels. Every existing catalog card title has the same colour on `#141a22` to `#10161e`: 1.02 at both stops. Same rule (`.cc-intcat-head strong` has no colour), same cause, not worsened. In the other six theme settings the Statewright title measures 12.85 to 15.85. The pill (6.35), disclaimer (7.85), link (15.19) and address (4.56) are unaffected by the theme. Fix for all twelve cards: one colour on `.cc-intcat-head strong` in the renderer's `STYLE`. Track in its own issue.
- **N4. Defect inherited from `main`: below about 520 px of viewport width the Console cuts content off with no way to scroll to it.** `div.app-layout` has `overflow-x:hidden` and a content width of 547 px. Measured at HEAD on the page as loaded, hidden characters of the Statewright disclaimer and address, and of the first catalog card's summary:

  | Viewport | Statewright disclaimer | Statewright address | Catalog card summary |
  |---|---|---|---|
  | 520 px and wider | 0 of 166 | 0 of 27 | 0 of 145 |
  | 500 px | 0 | 3 | 3 |
  | 480 px | 6 | 8 | 11 |
  | 400 px | 39 | 23 | 47 |
  | 360 px | 56 | 27 | 64 |
  | 320 px | 80 | 27 | 81 |

  It affects every catalog card equally and every Console tab, and this change does not worsen it. Chrome's minimum window is about 500 px wide, so the top rows are reachable on a desktop. The fourth audit reported the card as passing at 480 and 360 px; a measurement that calls `scrollIntoViewIfNeeded` first would see that, for the reason in B1. V04 (`.cc-intcat-actions > * { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }`, a plausible "one-line action labels" restyle) survives and widens the uncut minimum from about 520 to about 600 px: 6 disclaimer characters hidden at 547 px, 27 at 500 px, none at 600 px. Boundary: I class it as a worsening of this inherited defect, not as a hit on (d).
- **N5. A new render state can omit the card (carried N3 of #941; class "plain").** Z17 (HTTP 404 branch) and Z30 (`AbortError` branch) survive. The plan now states this. An equality on the number of `innerHTML` assignments in the source contract would enforce "one placement per state".
- **N6. What `readability()` does not measure.** None of these is a false refusal of HEAD.
  - The backdrop's alpha is ignored. A legitimate `.cc-intcat-actions { background:rgba(255,255,255,.03); }` (V27) is refused: the address is compared with opaque white and reported at 3.47, while the rendered contrast is unchanged. The same blindness could pass dark text over a nearly transparent light layer.
  - Colours are parsed as the first three numbers of the computed string. A legitimate `.cc-intcat a { color:oklch(0.95 0.01 90); }` (V32) is refused with a reported contrast of 1.04 for a near-white label.
  - Overlap is not measured: V13 (action row moved to the card's corner with `position:absolute`) covers 94 of 166 disclaimer characters at 600 px; V15 (negative margin) covers the descenders of the last line. Plain, unlikely edits.
  - Paint-level hiding is not measured: `clip-path` (V09), `-webkit-text-fill-color:transparent` (V10), `filter:opacity(0)` (V11), `mix-blend-mode:darken` (V12) each leave the disclaimer at a pixel contrast of 1.02 with the test green; `::first-line` (V31) likewise for one line. All are plain deliberate edits.
  - The font floor reads the computed size. `zoom:.8` on the catalog (V22) renders the address at about 10 px and passes. Readable; cosmetic.
  - Hover is not sampled (V30: link label equal to its background while hovered; not probed, the colours are equal by construction).
  - The title and the pill are not measured. The pill is 11.2 px and would fail the floor; the title is N3.
- **N7. Thin margins at HEAD.** The address has 0.8 px of font size and 0.06 of contrast in hand (table below). Any darker grey or a size of `.74rem` fails. Both need an edit to the pinned styles, so this is a note for whoever makes that edit.
- **N8. Evidence file against my results.** 50 rows. 40 agree with my per-suite results. Seven (A01 to A07) cannot be reproduced: their definitions are one line of prose each. Three differ, none in the killed column:
  - M12: recorded "playwright pass"; with the first audit's definition the five readability tests fail on the closing text check (carried N9 of #941, not corrected).
  - Y48, both rows: recorded "mocha FAIL"; with the third audit's definition mocha passes (source 0, jsdom 0) and only Playwright fails. The file says its Y identifiers use the auditors' definitions.
  - A08 is recorded as "equivalent". It leaves the Statewright disclaimer unchanged (contrast 7.85, pixels 8.23), because the card's later rule of equal specificity wins. It is not an equivalent mutant: the summaries of all eleven catalog cards become nearly invisible (alpha 0.15, pixel contrast 1.26) and no test notices. That is outside this change's scope, but "equivalent" overstates it.
- **N9. Plan wording.** (a) Iteration 5, item 1: "A line clamp, a height cap or a truncation fails" is true for a cap on the paragraph and false for a cap on the card or the action row (B1). (b) Item 2: "the background that is actually rendered behind the text" is the nearest painted ancestor colour with alpha ignored (N6). (c) "The pill, disclaimer, link and address are readable in that theme and are now tested there": the pill is readable (6.35) but not measured by any test. (d) "Iteration 5 fixes the test and the record": the test is fixed; the Y48 record still shows a mocha failure the audit definition does not produce (N8). Checked and correct: the shipped files are identical to `dd766c15`; the renderer is 245 lines (243 on `main`); the title defect is shared by all eleven catalog cards on `main`; the three existing render states are tested; five views are run; the Y48 history is described accurately.
- **N10. Test-quality notes, none vacuous for a required negative.**
  - Every new assertion is failed by at least one mutant: `lines >= 1` (V06, V08), `clipped === 0` (Z02), `fontPx >= 12` (Y18), `textAlpha === 1` (Z32), `contrast >= 4.5` (Z09), the opacity poll (Y16), the pill read (Y48), the `href` read (V41). `expect.poll(...opacity).toBe(1)` does not mask a permanent reduction: it fails after 5 s (Y16 received 0, Z29 0.35). The fade-in sampled as 0, 0.18, 0.42, 0.62, 0.8, 0.89, 0.98, 1 over about 300 ms.
  - Z31 is killed by that 5 s timeout and not by an assertion (the hidden paragraph cannot be scrolled into view).
  - `readability()` stays inside the function limit by packing: two lines of more than 160 characters (the longer is 178) hold the luminance and backdrop logic. Within the razor as measured; hard to review.
  - Carried: `openCard` requires exactly eleven catalog cards; the closing `toHaveText` reads `textContent`; inside the re-render loop `toHaveCount(1)` is satisfied by the loading markup.
- **N11. Carried, unchanged.** No CSP or `Referrer-Policy` on the Console server; focus on the link is lost on every re-render; the source contract fails on harmless renderer edits that add a listener, a request or a scanned word (intended); the jsdom harness leaves `window`, `document` and `requestAnimationFrame` as `undefined` own keys of `global` (not re-measured this time); `.agent/` is gitignored while the reports are tracked.

## Margins at HEAD

The five views the tests assert, three elements each. "Contrast" is the test's formula against the worse gradient stop; "pixels" is my measurement from a screenshot of the element (modal colour against the most distant pixel). "Clipped" is the test's count of line rectangles outside a frame. Opacity 1 and text alpha 1 in every cell. Thresholds: font at least 12 px, contrast at least 4.5, clipped 0.

| View | Element | Font px | Contrast | Pixels | Clipped / lines | Font margin | Contrast margin |
|---|---|---|---|---|---|---|---|
| default, 1280 px, dark scheme | disclaimer | 14.08 | 7.85 | 8.23 | 0 / 2 | 2.08 | 3.35 |
| | link | 16 | 15.19 | 15.19 | 0 / 1 | 4 | 10.69 |
| | address | 12.8 | 4.56 | 4.94 | 0 / 1 | **0.8** | **0.06** |
| default, 600 px, dark scheme | disclaimer | 14.08 | 7.85 | 8.32 | 0 / 4 | 2.08 | 3.35 |
| | link | 16 | 15.19 | 15.19 | 0 / 2 | 4 | 10.69 |
| | address | 12.8 | 4.56 | 4.94 | 0 / 1 | **0.8** | **0.06** |
| default, 1280 px, light scheme | disclaimer | 14.08 | 7.85 | 8.23 | 0 / 2 | 2.08 | 3.35 |
| | link | 16 | 15.19 | 15.19 | 0 / 1 | 4 | 10.69 |
| | address | 12.8 | 4.56 | 4.94 | 0 / 1 | **0.8** | **0.06** |
| Pegasus, 1280 px, light scheme | disclaimer | 14.08 | 7.85 | 8.23 | 0 / 2 | 2.08 | 3.35 |
| | link | 16 | 15.19 | 15.19 | 0 / 1 | 4 | 10.69 |
| | address | 12.8 | 4.56 | 4.94 | 0 / 1 | **0.8** | **0.06** |
| Pegasus, 600 px, light scheme | disclaimer | 14.08 | 7.85 | 8.32 | 0 / 4 | 2.08 | 3.35 |
| | link | 16 | 15.19 | 15.19 | 0 / 2 | 4 | 10.69 |
| | address | 12.8 | 4.56 | 4.94 | 0 / 1 | **0.8** | **0.06** |

The three elements carry their own colours on the card's own opaque gradient, so theme, colour scheme and width do not change the numbers; only the line counts move. Not asserted by any test: title 16 px, contrast 12.85 (1.02 to 1.13 in Pegasus, N3); pill 11.2 px, contrast 6.35.

False-refusal check at HEAD beyond the five views (the test's own callback, plus my per-character measurement on the page as loaded): 234 grid points over seven theme settings (none, Pegasus, Mythiq, Midnight, Aurora, Crimson, Atmosphere), both colour schemes, thirteen widths from 320 to 1920 px, and three catalog states (all disabled; a mix of observed, failing, stale and unverified integrations; catalog unavailable). At 520 px and wider the test's thresholds pass at every point and no character is hidden or covered. Below 520 px characters are really hidden (N4), and the test's callback passes there down to 360 px only because of the scroll in B1. With forced colours active the browser repaints the card (white or yellow on black, black or dark blue on white) at contrast 13.99 to 21. So: no false refusal of a legitimate state, and no unreadable state specific to the Statewright card.

## Section 4 razor

Measured from the committed blobs at HEAD with the TypeScript parser. Limits: function 40 lines, file 250 lines, nesting 3.

| File (added or modified against `origin/main`) | Lines | Longest function | Control nesting inside one function | Nesting counting enclosing functions |
|---|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | 245 | `render` 38 | 2 | 4 (`wire`, unchanged from `main`) |
| `src/roadmap/ui/modules/statewright-handoff.js` | 28 | none | 0 | 0 |
| `src/test/roadmap/statewright-handoff-source.test.ts` | 80 | suite callback 23 | 0 | 3 |
| `src/test/roadmap/statewright-handoff.test.ts` | 143 | `cardContract` 23 | 1 | 4 |
| `src/test/ui/statewright-handoff.spec.ts` | 206 | "other controls" test callback 30 | 1 | 4 |

No breach under the convention all four earlier audits used (control blocks inside a function). `readability()` is 26 lines and its `evaluate` callback 23, with one `for` loop; the fourth level in the last column is arrow functions inside expressions. The two changelogs gain one identical three-line entry.

## Mutation tables

Method. Each mutant was applied alone to a disposable export of HEAD, `copy-ui-js` was run, then the three mocha files and the two Playwright specs in full (no fail-fast). Columns `source`, `jsdom` and `catalog` are failing-test counts in `statewright-handoff-source.test` (5 tests), `statewright-handoff.test` (18) and `integration-catalog-renderer.test` (9). The Playwright column gives the number of failing tests of 15 and which: T1 idle and claims, T2 keyboard, T3 mouse click, R readability (n of the five views), T5 other controls, T6 catalog failure, IC the older catalog spec. M01 to X32 use the second auditor's definitions (sha256 `48d3dacb...`), Y01 to Y53 the third auditor's (`4a8132cf...`), Z01 to Z36 the fourth auditor's (`z.cjs` in that auditor's scratch directory); I copied the three files unmodified and checked that every anchor matches the shipped files exactly once. V01 to V42 are mine; A08 is the author's, rebuilt from its description. The last column gives a change against the fourth report and, for survivors, the class. Thirteen mutants were run twice by accident of scheduling (M22, X01 to X06, Z23 to Z28); both runs agree in every column.

| ID | File | Mutation | source | jsdom | catalog | Playwright | Result | Change, class |
|---|---|---|---|---|---|---|---|---|
| M01 | H | img beacon in card | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| M02 | H | link preconnect in card | 2 | 12 | 0 | pass 15 | killed |  |
| M03 | H | link prefetch of /runs | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| M04 | R | fetch statewright api in render() | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| M05 | H | hidden iframe of /runs | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| M06 | H | ping attribute on anchor | 2 | 18 | 0 | FAIL 2 (T2+T3) | killed |  |
| M07 | H | utm query on href | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| M08 | R | click handler appends ?ws=<page URL> | 2 | 0 | 0 | FAIL 2 (T2+T3) | killed |  |
| M09 | H | drop noreferrer | 2 | 12 | 0 | FAIL 3 (T1+T2+T3) | killed |  |
| M10 | H | drop target and noopener | 2 | 12 | 0 | FAIL 3 (T1+T2+T3) | killed |  |
| M11 | H | extra Connected pill (observed class) | 2 | 6 | 0 | FAIL 2 (T1+T5) | killed |  |
| M12 | H | copy adds signed in/partner/synced | 2 | 6 | 0 | FAIL 5 (R5of5) | killed |  |
| M13 | H | card also carries cc-intcat-card | 2 | 6 | 1 | FAIL 11 (IC+R5of5+T1+T2+T3+T5+T6) | killed |  |
| M14 | R | header count +1 | 0 | 0 | 1 | pass 15 | killed |  |
| M15 | R | no handoff in fetch-failure markup | 1 | 6 | 0 | FAIL 1 (T6) | killed |  |
| M16 | R | handoff only when catalog non-empty | 0 | 6 | 0 | pass 15 | killed |  |
| M17 | R | window.open on render | 2 | 6 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| M18 | R | auto-click link 3 s after render | 1 | 6 | 0 | FAIL 2 (T1+T5) | killed |  |
| M19 | H | Connect account button in card | 2 | 12 | 0 | pass 15 | killed |  |
| M20 | H | tabindex=-1 aria-hidden on anchor | 2 | 12 | 0 | pass 15 | killed |  |
| M21 | R | no handoff in loading markup | 1 | 3 | 0 | pass 15 | killed |  |
| M22 | R | other cards lose Docs link | 0 | 0 | 1 | pass 15 | killed |  |
| X01 | H | second (empty) anchor to statewright login in card | 2 | 12 | 0 | pass 15 | killed |  |
| X02 | H | onmouseover attribute rewrites href with page query | 2 | 18 | 0 | FAIL 3 (T1+T3+T5) | killed |  |
| X03 | H | rel gains opener token | 2 | 12 | 0 | FAIL 1 (T1) | killed |  |
| X04 | H | rel reordered (noreferrer noopener) [cosmetic control] | 2 | 12 | 0 | FAIL 1 (T1) | killed |  |
| X05 | H | meta refresh to /runs after the card | 2 | 12 | 0 | pass 15 | killed |  |
| X06 | R | base href statewright appended to head | 1 | 6 | 0 | pass 15 | killed |  |
| X07 | R | navigator.sendBeacon with page query in render() | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X08 | R | new Image() beacon with page query in constructor | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X09 | R | document mousedown listener rewrites href with page query (mouse click only) | 2 | 6 | 0 | FAIL 2 (T3+T5) | killed |  |
| X10 | H | URL constant downgraded to http: | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X11 | H | URL constant changed to look-alike host | 2 | 12 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X12 | R | WebSocket to statewright with page query in render() | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X13 | R | EventSource to statewright in render() | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X14 | R | handoff card injected twice (loaded state) | 1 | 9 | 0 | FAIL 9 (R5of5+T1+T2+T3+T5) | killed |  |
| X15 | R | disabled integration cards styled as configured | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic, untouched code |
| X16 | R | other cards: Configure button relabelled Connect | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic, untouched code |
| X17 | R | other cards: Configure click also opens Statewright | 2 | 0 | 0 | FAIL 1 (T5) | killed |  |
| X18 | R | handoff moved after the catalog sections | 0 | 2 | 0 | pass 15 | killed |  |
| X19 | R | handoff wrapped inside a configured integration card | 0 | 6 | 1 | FAIL 10 (IC+R5of5+T1+T2+T3+T5) | killed |  |
| X20 | H | visible address differs from the link | 2 | 6 | 0 | FAIL 1 (T1) | killed |  |
| X21 | H | style rule hides the disclaimer paragraph | 2 | 0 | 0 | FAIL 6 (R5of5+T1) | killed |  |
| X22 | H | style ::after adds a visible "Connected" to the pill | 2 | 0 | 0 | FAIL 1 (T1) | killed |  |
| X23 | H | style ::after overlays the whole page with the link | 2 | 0 | 0 | FAIL 4 (IC+T1+T5) | killed |  |
| X24 | R | scheduler.postTask navigates the Console tab to /runs after 12 s | 2 | 0 | 0 | pass 15 | killed |  |
| X25 | R | click listener sends an extra beacon with page query | 2 | 0 | 0 | FAIL 2 (T2+T3) | killed |  |
| X26 | R | hovering the card opens /runs (mouseover listener) | 2 | 6 | 0 | FAIL 3 (T1+T3+T5) | killed |  |
| X27 | R | window.open in the catalog-failure branch only | 2 | 4 | 0 | FAIL 1 (T6) | killed |  |
| X28 | R | same-tab location.assign to /runs at end of render() | 2 | 0 | 0 | FAIL 14 (IC+R5of5+T1+T2+T3+T5) | killed |  |
| X29 | R | status line outside the card claims Statewright connected | 1 | 3 | 0 | FAIL 1 (T1) | killed |  |
| X30 | H | pill title/aria-label say Connected | 2 | 6 | 0 | pass 15 | killed |  |
| X31 | H | stylesheet background-image request to statewright | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| X32 | R | window.open on second and later render() calls | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| Y01 | R | computed global: window['op'+'en'](link.href) on render | 0 | 6 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y02 | R | alias: const w = window; w.open(link.href) on render | 1 | 6 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y03 | R | destructured alias: const { open: go } = window; go(link.href) | 0 | 6 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y04 | R | render(): detached <img> whose src is the link href (no provider name, no listed API) | 0 | 0 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y05 | R | Configure click also loads an <img> from the link href | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y06 | R | Configure click also clicks the Statewright link | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y07 | R | onEvent() loads an <img> from the link href on every hub event | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y08 | R | mixed-case inline handler onWheel on the wrapper (loaded state) loads an <img> from the link href | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y09 | R | container.setAttribute('onmousedown', ...) appends the page query to the link | 0 | 0 | 0 | FAIL 2 (T3+T5) | killed |  |
| Y10 | R | container.setAttribute('oncontextmenu', ...) appends the page query to the link (right-click, copy link) | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y11 | H | handoff module, import time: computed addEventListener + handleEvent object rewrites the link on mousedown | 1 | 0 | 0 | FAIL 2 (T3+T5) | killed |  |
| Y12 | H | handoff module, import time: plain statement loads an <img> from the provider | 1 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| Y13 | H | handoff module, import time: body.setAttribute('onwheel', ...) contacts the provider on scroll | 1 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y14 | R | renderer STYLE: section .cc-intcat-pill::after adds " · Connected" | 0 | 0 | 0 | FAIL 1 (T1) | killed |  |
| Y15 | R | renderer STYLE: .cc-intcat-sub::after adds "Run history provider: connected, signed in." above the card | 0 | 0 | 0 | FAIL 1 (T1) | killed |  |
| Y16 | R | renderer STYLE: .cc-intcat section p { opacity:0 } hides the disclaimer | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y17 | H | card stylesheet: disclaimer colour changed to the card background colour (#a9b8cb -> #182332) | 2 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y18 | H | card stylesheet: disclaimer font-size typo .88rem -> .08rem | 2 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y19 | H | card stylesheet: disclaimer color:transparent | 2 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y20 | H | card stylesheet: disclaimer margin moves it off-screen (margin:0 0 10px -300vw) | 2 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y21 | R | error status line gains "State&shy;wright connected" (soft hyphen splits the name) | 0 | 0 | 0 | pass 15 | **SURVIVED** | obfuscated |
| Y22 | R | loaded status line gains "Run history provider connected." | 0 | 3 | 0 | pass 15 | killed |  |
| Y23 | R | heading becomes "Integration Catalog · run history connected" in all three states | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y24 | R | render(): <img> to 'https://state'+'wright.ai/t?' + document.URL (split host name, workspace value) | 0 | 0 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y25 | R | render(): <img> to a different host carrying the page URL (workspace value) | 0 | 0 | 0 | pass 15 | **SURVIVED** | out of scope |
| Y26 | R | aliased requestIdleCallback loop clicks the link after 7 s | 0 | 0 | 0 | pass 15 | **SURVIVED** | obfuscated |
| Y27 | R | aliased setTimeout (const later = window.setTimeout) clicks the link after 6 s | 0 | 6 | 0 | pass 15 | killed |  |
| Y28 | R | Web Animations: link.animate([], 6000).finished then loads an <img> from the link href | 0 | 0 | 0 | pass 15 | **SURVIVED** | obfuscated |
| Y29 | R | render(): hidden <iframe> of the link href appended to the container | 0 | 3 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y30 | R | error state only: extra group label 'Connected · signed in' under the card | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate |
| Y31 | R | other cards: every Docs link retargeted to the Statewright link href after render | 0 | 1 | 1 | pass 15 | killed |  |
| Y32 | R | Reflect.apply(window.open, window, [link.href]) on render | 0 | 6 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y33 | R | optional call window.open?.(link.href) on render | 0 | 6 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y34 | R | aliased addEventListener (container[name]) on 'wheel' loads an <img> from the link href | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y35 | R | aliased addEventListener (container[name]) on 'contextmenu' appends the page query to the link | 0 | 3 | 0 | FAIL 1 (T5) | killed |  |
| Y36 | R | form.submit() to the link href in a new tab on render | 0 | 0 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y37 | R | render(): link href gains the page query (document.URL, no listed API) | 0 | 9 | 0 | FAIL 4 (T1+T2+T3+T5) | killed |  |
| Y38 | R | renderer STYLE: .cc-intcat-actions a { pointer-events:none } makes the Statewright link (and Docs links) unclickable | 0 | 0 | 0 | FAIL 3 (T1+T3+T5) | killed |  |
| Y40 | R | Statewright card pill gains the observed status class after render (classList.add) | 0 | 3 | 0 | pass 15 | killed |  |
| Y41 | R | error state: status text 'Could not load integrations' replaced by 'Provider connected' (no name) | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate |
| Y43 | H | card stylesheet: link colour equals its background (#f1efe7 -> #141a22), label unreadable | 2 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y44 | R | renderer STYLE: shared .cc-intcat-pill restyled green like a healthy status (colour only) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic |
| Y45 | H | handoff module, import time: document.title = 'Statewright: connected' | 1 | 0 | 0 | FAIL 1 (T1) | killed |  |
| Y46 | R | loaded state places STATEWRIGHT_HANDOFF.replace('Website handoff', 'Connected') | 0 | 3 | 0 | FAIL 2 (T1+T5) | killed |  |
| Y47 | R | render counter: from the 6th render the Statewright pill text becomes "Connected" | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Y48 | R | onEvent() sets the Statewright pill text to "Connected" on any hub event | 0 | 0 | 0 | FAIL 1 (T5) | killed | was SURVIVED |
| Y49 | R | Configure click also sets window.location to the link href (assignment form, same tab) | 0 | 0 | 0 | FAIL 2 (IC+T5) | killed |  |
| Y50 | H | card stylesheet: link gets display:block and the card padding grows (harmless restyle, control) | 2 | 0 | 0 | pass 15 | killed |  |
| Y51 | H | card stylesheet: background gains image-set("https://statewright.ai/bg.png" 1x) (remote resource without url() | 2 | 0 | 0 | FAIL 5 (T1+T2+T3+T5+T6) | killed |  |
| Y52 | H | card stylesheet: visible address colour equals the card background (#7f8aa0 -> #111a25) | 2 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Y53 | R | mixed-case inline handler onContextMenu on the wrapper (loaded state) appends the page query to the link | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Z01 | R | STYLE: .cc-intcat p { white-space:nowrap; overflow:hidden; text-overflow:ellipsis } (one-line summaries) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| Z02 | R | STYLE: .cc-intcat p clamped to one line with -webkit-line-clamp | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | was SURVIVED |
| Z03 | R | STYLE: .cc-intcat p { max-height:1.3em; overflow:hidden } | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | was SURVIVED |
| Z04 | R | STYLE: .cc-intcat p { display:none } (control) | 0 | 0 | 0 | FAIL 6 (R5of5+T1) | killed |  |
| Z05 | R | STYLE: .cc-intcat-actions { display:none } (control) | 0 | 0 | 0 | FAIL 12 (IC+R5of5+T1+T2+T3+T5+T6) | killed |  |
| Z06 | R | STYLE: .cc-intcat-actions stacked vertically (legitimate restyle, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| Z07 | R | STYLE: .cc-intcat a { color:#5fb0d8 } (legitimate link colour, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| Z08 | R | STYLE: .cc-intcat a { font-size:.7rem } (link shrinks to 11.2px) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Z09 | R | STYLE: light-mode media rule lightens card backgrounds (.cc-intcat-card, .cc-intcat section) and darkens only .cc-intcat-card text | 0 | 0 | 0 | FAIL 3 (R3of5) | killed | was SURVIVED |
| Z10 | R | STYLE: .cc-intcat > section { background:#c9d4e2 } (card background lightened, text colours unchanged) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | was SURVIVED |
| Z11 | R | STYLE: .cc-intcat * { user-select:none } (address no longer selectable) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic |
| Z12 | R | STYLE: .cc-intcat section { max-height:0; overflow:hidden; padding:0; border:0 } (card collapsed) | 0 | 0 | 0 | FAIL 9 (R5of5+T1+T2+T3+T5) | killed |  |
| Z13 | R | STYLE: .cc-intcat p { text-indent:-999em } | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | was SURVIVED |
| Z14 | R | STYLE: .cc-intcat-actions span truncated to 9ch with ellipsis (visible address cut) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | was SURVIVED |
| Z15 | R | STYLE: merged rule .cc-intcat-sub, .cc-intcat p { margin; font-size:.9rem; color } (legitimate refactor, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| Z16 | R | STYLE: .cc-intcat becomes a card grid (legitimate layout restyle) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| Z17 | R | render(): new HTTP 404 branch shows a message without the card | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain, boundary (N5) |
| Z18 | R | render(): new !res.ok branch shows a message without the card | 0 | 3 | 0 | pass 15 | killed |  |
| Z19 | R | wire(): selector broadened to '.cc-intcat-actions > *' (clicking the Statewright link also jumps to Settings) | 0 | 0 | 0 | pass 15 | **SURVIVED** | no rule item broken |
| Z20 | R | wire(): broadened selector and preventDefault (Statewright link dead; control) | 0 | 0 | 0 | FAIL 2 (T2+T3) | killed |  |
| Z21 | R | render counter: card omitted from the loaded state from the 6th render on | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Z22 | R | render counter: card duplicated in the loaded state from the 6th render on | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| Z23 | R | esc() no longer escapes (other integrations; out-of-scope control) | 0 | 0 | 0 | pass 15 | **SURVIVED** | out of scope |
| Z24 | R | refactor: card placed inside the first category group instead of under the status line | 0 | 8 | 0 | pass 15 | killed |  |
| Z25 | R | render(): normalise external links to rel="noopener" (drops noreferrer from the Statewright link) | 0 | 6 | 0 | FAIL 3 (T1+T2+T3) | killed |  |
| Z26 | R | onEvent(evt) re-renders on 'integration.health' (legitimate behaviour, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| Z27 | R | ensureStyle(): order swapped to STATEWRIGHT_STYLES + STYLE (equivalent today) | 0 | 0 | 0 | pass 15 | **SURVIVED** | equivalent |
| Z28 | R | ensureStyle(): card styles no longer applied (identifier kept in a comment) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Z29 | R | STYLE: .cc-intcat section { opacity:.35 } (ancestor opacity; control) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| Z30 | R | render(): AbortError branch in catch shows a message without the card | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain, boundary (N5) |
| Z31 | R | STYLE: @media (max-width:900px) hides section p (narrow-viewport-only hiding) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed | was SURVIVED |
| Z32 | R | STYLE: .cc-intcat p { color:rgba(169,184,203,.04) !important } (alpha is ignored by the contrast computation) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | was SURVIVED |
| Z33 | R | STYLE: .cc-intcat-pill-failing::before { content:"! " } (legitimate decoration of another state; does the whole-tab check refuse it?) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| Z34 | R | STYLE: light-theme repair [data-theme="pegasus"] gives catalog cards and the section a white background and darkens only .cc-intcat-card text | 0 | 0 | 0 | FAIL 2 (R2of5) | killed | was SURVIVED |
| Z35 | R | STYLE: .cc-intcat p clamped to two lines (no effect at 1280px; cuts the disclaimer below about 1000px) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed | was SURVIVED |
| Z36 | R | onEvent(): pill text set to 'Connected' and a flag keeps it across re-renders | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| V01 | R | STYLE: .cc-intcat p clamped to three lines | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| V03 | R | STYLE: .cc-intcat p { max-height:4.2em; overflow:hidden } (three lines of height) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| V05 | R | STYLE: .cc-intcat-actions { height:36px; overflow:hidden } (uniform action row; clips a wrapped link through an ancestor) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic (link label shaved below about 640 px); same root cause as B1 |
| V07 | R | STYLE: .cc-intcat-actions { line-height:0 } (gap hack; the link inherits it) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| V09 | R | STYLE: .cc-intcat p { clip-path:inset(0 0 100% 0) } | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate; (d) |
| V11 | R | STYLE: .cc-intcat p { filter:opacity(0) } | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate; (d) |
| V13 | R | STYLE: actions moved to the top-right corner of every catalog child (position:absolute); card summaries padded, the section paragraph not | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain, unlikely; (d) by overlap at 600 px (N6) |
| V15 | R | STYLE: .cc-intcat-actions { margin-top:-18px } (link box overlaps the last disclaimer line) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic (overlap of descenders) |
| V17 | R | STYLE: .cc-intcat p { white-space:nowrap } (no overflow rule) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| V19 | R | STYLE: @media (max-width:480px) two-line clamp on .cc-intcat p (below the narrow test view) | 0 | 0 | 0 | pass 15 | **SURVIVED** | not reachable in a desktop window; the layout is already cut there |
| V21 | R | STYLE: @media (max-height:800px) one-line clamp (the readability views are 900px tall) | 0 | 0 | 0 | pass 15 | **SURVIVED** | contrived condition; (d); B2 class, not relied on |
| V23 | R | STYLE: container query (max-width:700px) two-line clamp | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| V25 | R | STYLE: glass cards in the Atmosphere theme only (an untested theme): translucent white background, dark text for .cc-intcat-card only | 0 | 0 | 0 | pass 15 | **SURVIVED** | **B2** class, lower plausibility; (d) in the Atmosphere theme |
| V27 | R | STYLE: .cc-intcat-actions gets a faint translucent strip rgba(255,255,255,.03) (legitimate restyle, should pass) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | killed, but it is a legitimate restyle: false refusal (N6) |
| V29 | R | STYLE: .cc-intcat > * { content-visibility:auto } (rendering optimisation; legitimate, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| V31 | R | STYLE: .cc-intcat p::first-line { color:transparent } | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate; first line hidden |
| V33 | R | render(): error state escapes the card by accident (esc(STATEWRIGHT_HANDOFF)) | 0 | 6 | 0 | FAIL 1 (T6) | killed |  |
| V35 | R | render(): the ensureStyle() call is dropped (no catalog or card styles are injected) | 0 | 0 | 0 | FAIL 6 (R5of5+T1) | killed |  |
| V37 | R | STYLE: sticky heading and status line with an opaque background (legitimate, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| V02 | R | STYLE: .cc-intcat p clamped to four lines (the disclaimer never exceeds four lines at the default font size) | 0 | 0 | 0 | pass 15 | **SURVIVED** | no effect at any width or font size measured |
| V04 | R | STYLE: .cc-intcat-actions > * one-line labels with ellipsis (min-width:0; nowrap; overflow hidden) | 0 | 0 | 0 | pass 15 | **SURVIVED** | plausible; worsens the inherited narrow-window cut (N4) |
| V06 | R | STYLE: .cc-intcat { font-size:0 } (whitespace-gap hack; the link uses font:inherit) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| V08 | R | STYLE: .cc-intcat p { letter-spacing:-.6em } (glyphs collapsed on each other) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| V10 | R | STYLE: .cc-intcat p { -webkit-text-fill-color:transparent } | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate; (d) |
| V12 | R | STYLE: .cc-intcat p { mix-blend-mode:darken } | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate; (d) |
| V14 | R | STYLE: actions moved to the top-right corner, positioning context given to .cc-intcat-card only | 0 | 0 | 0 | FAIL 5 (R5of5) | killed |  |
| V16 | R | STYLE: .cc-intcat > * { max-height:120px; overflow:hidden } (uniform card height) | 0 | 0 | 0 | pass 15 | **SURVIVED** | **B1** (link and address hidden at 600 px) |
| V18 | R | STYLE: .cc-intcat p { height:40px } (text overflows onto the action row) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| V20 | R | STYLE: @media (min-width:700px) and (max-width:1100px) two-line clamp (between the two test widths) | 0 | 0 | 0 | pass 15 | **SURVIVED** | contrived range; (d); B2 class, not relied on |
| V22 | R | STYLE: .cc-intcat { zoom:.8 } (denser catalog; computed font sizes unchanged) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic (rendered size 80% of computed) |
| V24 | R | STYLE: theme-token repair: cards and the section take var(--bg-panel); only .cc-intcat-card text takes var(--text-main) | 0 | 0 | 0 | FAIL 2 (R2of5) | killed |  |
| V26 | R | STYLE: @media print white cards, dark text for .cc-intcat-card only | 0 | 0 | 0 | pass 15 | **SURVIVED** | out of scope (print) |
| V28 | R | STYLE: .cc-intcat { max-height:70vh; overflow:auto } (scrolling catalog; legitimate, should pass) | 0 | 0 | 0 | pass 15 | **SURVIVED** | legitimate edit |
| V30 | R | STYLE: .cc-intcat a:hover { color:#141a22 } (link label equals its background while hovered) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic (hover only) |
| V32 | R | STYLE: .cc-intcat a { color:oklch(0.95 0.01 90) } (near-white link in a modern colour space; legitimate, should pass) | 0 | 0 | 0 | FAIL 5 (R5of5) | killed | killed, but it is a legitimate restyle: false refusal (N6) |
| V34 | R | render(): loaded state wraps the card and sections in a closed <details> | 0 | 6 | 0 | FAIL 13 (IC+R5of5+T1+T2+T3+T5) | killed |  |
| V36 | R | error state only: wrapper gets a dimming class (.cc-intcat-error { opacity:.45 }) | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain deliberate; degraded in the error state only |
| V38 | R | STYLE: @media (min-width:1400px) one-line clamp with max-width:60ch (media range above every view) | 0 | 0 | 0 | pass 15 | **SURVIVED** | **B2** (boundary; plausible wide-screen rule; (d) at 1400 px and wider) |
| V39 | R | STYLE: .cc-intcat > * { max-height:100px; overflow:hidden } (card clips its own content; the disclaimer loses its last line at 600px) | 0 | 0 | 0 | pass 15 | **SURVIVED** | **B1** (disclaimer loses its last line at 600 px; link and address hidden) |
| V40 | R | STYLE: .cc-intcat-actions { height:36px; overflow:clip } (as V05 but not scrollable by script) | 0 | 0 | 0 | pass 15 | **SURVIVED** | cosmetic; same root cause as B1 (frames) |
| A08 | R | author A08 as described in the evidence file: .cc-intcat p { color:rgba(169,184,203,.15) } in the renderer style sheet | 0 | 0 | 0 | pass 15 | **SURVIVED** | equivalent for the Statewright card only (N8) |
| V41 | R | onEvent() appends the page address to the link href (repaired by the next render; checks the href read after the hub event) | 0 | 0 | 0 | FAIL 1 (T5) | killed |  |
| V42 | R | STYLE: .cc-intcat > * { max-height:120px; overflow:auto } (cards scroll inside; the link is below the fold of the card at 600px) | 0 | 0 | 0 | pass 15 | **SURVIVED** | plain; link below the fold of a scrolling card; same root cause as B1 |

Totals. M 22 of 22 killed. X 30 of 32 killed (X15, X16 survive, as before). Y 44 of 51 killed (43 at #941; Y48 is killed now). Z 24 of 36 killed (14 at #941; ten more now: Z02, Z03, Z09, Z10, Z13, Z14, Z31, Z32, Z34, Z35). The twelve Z survivors are the seven legitimate or equivalent edits (Z06, Z07, Z15, Z16, Z26, Z27, Z33), the two missing-card states (Z17, Z30) and Z11, Z19, Z23. New set: 43 run (V01 to V42 and A08), 16 killed, 27 survive. Of the 27: three carry B1 (V16, V39, V42) and two share its root cause with a cosmetic effect (V05, V40); two carry B2 (V38, V25) and three are contrived members of that class (V19, V20, V21); six are plain deliberate (V09, V10, V11, V12, V31, V36); one is plain and unlikely (V13); one worsens an inherited defect (V04); five are cosmetic or out of scope (V15, V22, V26, V30, A08 for the other cards); four are legitimate edits or have no effect (V02, V28, V29, V37). Two of the 16 kills are false refusals of legitimate restyles (V27, V32). No mutant errored.

## Tests run at the exact commit

| Command (in an export or a detached worktree of HEAD under my temp directory, Node 22.23.4) | Result |
|---|---|
| `npm run compile` | exit 0 (eleven trees) |
| `npx mocha --ui tdd --timeout 15000` on the three compiled test files | 32 passing, six consecutive runs |
| Playwright, the two specs, audit config (the repository config plus the host-resolver mapping) | 15 passed |
| The same with `--repeat-each=5`, while nine mutation lanes were running | 75 passed (1.6 min) |
| The same, idle machine (4 per cent CPU before the run) | 75 passed (1.1 min) |
| The same, three runs at once with `--workers=6` each and six CPU-burning processes | 75, 75 and 75 passed |
| 184 mutants (54 + 51 + 36 + 43), each against mocha (3 files) and Playwright (2 specs, 15 tests) | tables above; the 48 survivors are 48 further green runs of all 47 tests |
| Chromium probe of the unmutated source: 234 grid points (themes, schemes, widths, catalog states), forced colours, fade-in, card heights, line heights, large root font | margins table, N3, N4, N6 |
| Chromium probe of an instrumented build (render count, events reaching `onEvent`) and of Y48 on the same timeline | item 3 above |
| Chromium probes of 27 surviving mutants on the page as loaded (per-character visibility, hit test, pixel contrast, what the test's scroll moved), and five screenshots | B1, B2, N4, N6 |
| Prototype of remediation item 1 on HEAD and on V16, V39, V05, V40 | remediation item 1 |
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` | 101 pass, 0 fail |
| `npm run lint` | 0 errors, 136 warnings |
| `node scripts/validate-vsix.cjs --source-only` | PASS, v6.0.12 |
| `npm run test:runner-coverage` | PASS, 752 test files, all claimed |
| `npm run test:citation-parity` | exit 0, 35 tracked plans |
| `npm run test:node` | 1066 pass, 2 fail, 18 skipped. Both failures are subtests of `bundled dependencies (C2 T5)` in `bundleDeps.test.cjs`, the known artefact of junction-linked worktrees |
| Plan and report hashes | plan LF sha256 equals `plan-iter5.json`; reports 1 to 4 are `56527ea7...`, `4851cf12...`, `1cf54f09...`, `077afc9d...`, equal to ledger entries #938 to #941; evidence file `1ed35d19...` |

## Not verified

- `npm test` (vscode-test) and the full `test:all` gate.
- CI for HEAD, and behaviour of the readability test on Linux with other fonts. The local remote-tracking ref `origin/feat/652-statewright-website-handoff` points at HEAD; I made no GitHub request. All three measured elements have `line-height: normal`, so a line rectangle cannot outgrow its box with another font, but I did not run it.
- The plan's installed-host table: both VSIX hashes, the 14-of-14 results, the redirect to `https://statewright.ai/login?redirect=/runs`, the absence of referrer, cookie and opener on the real click. These runs were performed outside the repository. I could not verify them and I do not treat them as false.
- That `https://statewright.ai/runs` exists, requires sign-in and shows runs and transition history. No request was made to the host.
- A fresh VSIX build and the packaging of `statewright-handoff.js`.
- The author's mutants A01 to A07: their definitions are not in the repository.
- The real-browser effect of X15, X16, Y21, Y25, Y26, Y28, Y30, Y41, Y44, Z17, Z23 and Z30. I re-ran them against the suites and rely on the earlier audits' probes for their effect. V30 (hover) and V42 were not probed; V26 was probed with print media emulated, not on paper.
- The Pegasus title (N3) and the narrow-window cut (N4) in an installed VS Code webview. I measured both in Chromium against the real Console server.
- Whether a reviewer would in fact miss V38. That is the judgement B2 rests on, and I have said so.
- That remediation item 2 has no cost I have not seen. I did not implement it; it is one equality on a 28-line constant.

## State left behind

- `git status --short` in `C:\dev\mythologiq\FailSafe-653` prints nothing; HEAD is still `54f676468aeb14a5d8edc027e737949cc14eef76`. I never built, wrote or mutated anything there. This report is the only file I added, under the gitignored `.agent/staging/`. The four earlier reports and the evidence file are untouched (hashes above).
- I added one detached worktree under my temp directory for the git-dependent guards and removed it with `git worktree remove`; `git worktree list` shows no entry of mine.
- The `node_modules` junctions in my eleven temporary trees were unlinked with `rmdir` before the trees were deleted; the junction target still has its 505 entries.
- My scripts, mutant definitions (`p.cjs`, `extra.cjs`), results (`results-*.jsonl`, `table-annotated.md`), probe specs and output (`probe-head.jsonl`, `probe-mut.jsonl`, `probe2.jsonl`), screenshots and logs are in a new directory of my own, `C:\Users\krkna\AppData\Local\Temp\a653i5-a9c7A3`. I wrote nothing to and deleted nothing from the fourth auditor's directory; I read its `run.cjs`, `guard.cjs`, `validate.cjs`, `z.cjs`, `razor.cjs`, the two definition files and its Playwright audit config, and copied them.
- When I split the work over more lanes, two of my own runner processes began repeating mutants that other lanes had finished. I stopped those two by PID; their child test runs finished on their own, and the thirteen repeated mutants agree in every column. No other agent's process was touched.
- The repository's Playwright config creates a disposable `failsafe-playwright-home-*` directory in the system temp folder on each run; those from my runs remain.
- Nothing was committed, pushed or posted.
