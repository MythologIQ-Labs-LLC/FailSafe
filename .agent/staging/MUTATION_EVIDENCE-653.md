# Mutation evidence for PR #653 (iteration 6)

Each mutant is applied to `integration-catalog-renderer.js` or `statewright-handoff.js`, the suites are run, and the file is restored. A mutant is killed when at least one suite fails. Windows 11, Node 22.23.4, at the tests of this commit.

- The scripts that define and run every mutant are in `.agent/staging/mutation-653/` (`set3.cjs` to `set6.cjs`; run `node <script> FailSafe/extension` after `npm run compile`). Identifiers M, X, Y, Z and V follow the auditors' reports where the mutant was taken from one; the script text is the definition actually run, and it can differ in detail from an auditor's own definition of the same identifier. A01 to A08 are the author's.
- Sets 3 to 5 report the three mocha files together (jsdom contract, source contract, existing catalog test). Set 6 reports the source contract separately.
- Since iteration 6 the renderer's style sheet is pinned by digest, so every mutant that edits that sheet fails the source contract whatever its effect. The Playwright column shows whether the browser tests also catch it.

## Set 3

```
baseline {"jsdom":"pass","playwright":"pass"}
M02 preconnect link | mocha (all three files) FAIL | playwright pass | killed
M06 ping attribute | mocha (all three files) FAIL | playwright FAIL | killed
M11 extra Connected pill | mocha (all three files) FAIL | playwright FAIL | killed
M12 false copy | mocha (all three files) FAIL | playwright pass | killed
M16 only when catalog non-empty | mocha (all three files) FAIL | playwright pass | killed
M17 window.open on render | mocha (all three files) FAIL | playwright FAIL | killed
M18 auto-click after 3 s | mocha (all three files) FAIL | playwright FAIL | killed
M19 Connect account button | mocha (all three files) FAIL | playwright pass | killed
M20 tabindex -1 aria-hidden | mocha (all three files) FAIL | playwright pass | killed
M21 no handoff while loading | mocha (all three files) FAIL | playwright pass | killed
A06 query string on the URL | mocha (all three files) FAIL | playwright FAIL | killed
A07 visible URL differs from the link | mocha (all three files) FAIL | playwright FAIL | killed
X09 mousedown rewrites the link | mocha (all three files) FAIL | playwright FAIL | killed
X12 WebSocket to the provider | mocha (all three files) FAIL | playwright FAIL | killed
X24 postTask navigation | mocha (all three files) FAIL | playwright pass | killed
X26 hover opens the page | mocha (all three files) FAIL | playwright FAIL | killed
X17 Configure click also opens Statewright | mocha (all three files) FAIL | playwright FAIL | killed
X22 ::after Connected | mocha (all three files) FAIL | playwright FAIL | killed
X21 style hides the disclaimer | mocha (all three files) FAIL | playwright FAIL | killed
X29 status line claims connected | mocha (all three files) FAIL | playwright FAIL | killed
X30 pill title and aria-label | mocha (all three files) FAIL | playwright pass | killed
A01 keydown opens a second page | mocha (all three files) FAIL | playwright FAIL | killed
A02 queueMicrotask fetch to provider | mocha (all three files) FAIL | playwright FAIL | killed
A03 status claim without the name | mocha (all three files) FAIL | playwright pass | killed
A04 style overlays the link invisibly | mocha (all three files) FAIL | playwright FAIL | killed
A05 handoff module runs code on import | mocha (all three files) FAIL | playwright FAIL | killed
```

## Set 4

```
baseline {"jsdom":"pass","playwright":"pass"}
Y17 disclaimer colour equals the card background | mocha (all three files) FAIL | playwright FAIL | killed
Y18 disclaimer font-size typo | mocha (all three files) FAIL | playwright FAIL | killed
Y19 disclaimer colour transparent | mocha (all three files) FAIL | playwright FAIL | killed
Y20 disclaimer pushed off screen | mocha (all three files) FAIL | playwright FAIL | killed
Y16 renderer style hides the disclaimer | mocha (all three files) FAIL | playwright FAIL | killed
Y15 renderer style adds a status after the status line | mocha (all three files) FAIL | playwright FAIL | killed
Y06 Configure click activates the Statewright link | mocha (all three files) pass | playwright FAIL | killed
Y05 Configure click loads an image from the link address | mocha (all three files) pass | playwright FAIL | killed
Y07 hub event loads an image from the link address | mocha (all three files) pass | playwright FAIL | killed
Y48 hub event sets the pill to Connected | mocha (all three files) FAIL | playwright FAIL | killed
Y45 handoff module sets the page title | mocha (all three files) FAIL | playwright FAIL | killed
Y23 heading claims a connection | mocha (all three files) pass | playwright FAIL | killed
Y43 link label colour equals its background | mocha (all three files) FAIL | playwright FAIL | killed
Y52 address colour equals the card background | mocha (all three files) FAIL | playwright FAIL | killed
```

## Set 5

```
baseline {"jsdom":"pass","playwright":"pass"}
Z02 shared rule clamps paragraphs to one line | mocha (all three files) FAIL | playwright FAIL | killed
Z03 shared rule caps paragraph height | mocha (all three files) FAIL | playwright FAIL | killed
Z35 shared rule clamps paragraphs to two lines | mocha (all three files) FAIL | playwright FAIL | killed
Z09 light colour-scheme repair lightens the card only | mocha (all three files) FAIL | playwright FAIL | killed
Z34 light theme repair lightens the card only | mocha (all three files) FAIL | playwright FAIL | killed
Z14 shared rule truncates the address | mocha (all three files) FAIL | playwright FAIL | killed
A08 shared rule makes paragraph text translucent | mocha (all three files) FAIL | playwright pass | killed
Y48 hub event sets the pill to Connected | mocha (all three files) FAIL | playwright FAIL | killed
Y16 renderer style hides the disclaimer | mocha (all three files) FAIL | playwright FAIL | killed
Y06 Configure click activates the Statewright link | mocha (all three files) pass | playwright FAIL | killed
```

## Set 6

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass"}
V16 card height cap 120px, overflow hidden | source FAIL | mocha (all three files) pass | playwright FAIL | killed
V39 card height cap 100px, overflow hidden | source FAIL | mocha (all three files) pass | playwright FAIL | killed
V42 card height cap 120px, overflow auto | source FAIL | mocha (all three files) pass | playwright FAIL | killed
V40 action row capped at 36px | source FAIL | mocha (all three files) pass | playwright FAIL | killed
V38 one-line clamp at 1400px and wider | source FAIL | mocha (all three files) pass | playwright pass | killed
V25 glass cards in the Atmosphere theme only | source FAIL | mocha (all three files) pass | playwright pass | killed
Z02 shared rule clamps paragraphs to one line | source FAIL | mocha (all three files) pass | playwright FAIL | killed
Z09 light colour-scheme repair lightens the card only | source FAIL | mocha (all three files) pass | playwright FAIL | killed
Y48 hub event sets the pill to Connected | source FAIL | mocha (all three files) pass | playwright FAIL | killed
```

A08 (`.cc-intcat p` translucent text) does not change the Statewright disclaimer, because the card's own later rule overrides it; it does dim the other catalog cards' summaries. It is now killed by the style-sheet pin.

Not excluded by tests (auditors' classification): obfuscated mutants and deliberate edits whose intent is plain in a diff; code review is the control for those. Known survivors are listed in the fifth audit report.
