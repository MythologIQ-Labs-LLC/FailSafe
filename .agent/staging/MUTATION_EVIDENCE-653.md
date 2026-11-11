# Mutation evidence for PR #653 (iteration 7)

Each mutant is applied to `integration-catalog-renderer.js` or `statewright-handoff.js`, the suites are run, and the file is restored. A mutant is killed when at least one suite fails. Windows 11, Node 22.23.4, at the tests of this commit.

- The scripts in `.agent/staging/mutation-653/` (`set3.cjs` to `set7.cjs`) are the definitions that were run. Run `npm run compile`, then `node <script> <path to FailSafe/extension>`. Each script restores the mutated file in a `finally` block; a run that is killed part-way can leave a mutant in place, so check `git status` afterwards.
- Every set reports three suites separately: `source` (the source contract), `jsdom` (the jsdom contract and the existing catalog test) and `playwright` (the Statewright spec).
- Identifiers M, X, Y, Z, V and W follow the auditors' reports where a mutant was taken from one. The script text is the definition actually run and can differ in detail from an auditor's own definition of the same identifier. A01 to A08 are the author's.
- The renderer's style sheet and the line that installs it are pinned in the source contract, so a mutant that edits either fails `source` whatever its effect. The `playwright` column shows whether the browser tests also catch it.
- The suites cannot reach the real provider: the jsdom harness stubs fetch, sockets and event streams, and the Playwright spec maps the provider's host names to 127.0.0.1. Runs before iteration 7 had no such guard (see the plan, iteration 7).

## Set 3

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass"}
M02 preconnect link | source FAIL | jsdom FAIL | playwright pass | killed
M06 ping attribute | source FAIL | jsdom FAIL | playwright FAIL | killed
M11 extra Connected pill | source FAIL | jsdom FAIL | playwright FAIL | killed
M12 false copy | source FAIL | jsdom FAIL | playwright pass | killed
M16 only when catalog non-empty | source pass | jsdom FAIL | playwright pass | killed
M17 window.open on render | source FAIL | jsdom FAIL | playwright FAIL | killed
M18 auto-click after 3 s | source FAIL | jsdom FAIL | playwright FAIL | killed
M19 Connect account button | source FAIL | jsdom FAIL | playwright pass | killed
M20 tabindex -1 aria-hidden | source FAIL | jsdom FAIL | playwright pass | killed
M21 no handoff while loading | source FAIL | jsdom FAIL | playwright pass | killed
A06 query string on the URL | source FAIL | jsdom FAIL | playwright FAIL | killed
A07 visible URL differs from the link | source FAIL | jsdom FAIL | playwright FAIL | killed
X09 mousedown rewrites the link | source FAIL | jsdom pass | playwright FAIL | killed
X12 WebSocket to the provider | source FAIL | jsdom pass | playwright FAIL | killed
X24 postTask navigation | source FAIL | jsdom pass | playwright pass | killed
X26 hover opens the page | source FAIL | jsdom FAIL | playwright FAIL | killed
X17 Configure click also opens Statewright | source FAIL | jsdom pass | playwright FAIL | killed
X22 ::after Connected | source FAIL | jsdom pass | playwright FAIL | killed
X21 style hides the disclaimer | source FAIL | jsdom pass | playwright FAIL | killed
X29 status line claims connected | source FAIL | jsdom FAIL | playwright FAIL | killed
X30 pill title and aria-label | source FAIL | jsdom FAIL | playwright pass | killed
A01 keydown opens a second page | source FAIL | jsdom FAIL | playwright FAIL | killed
A02 queueMicrotask fetch to provider | source FAIL | jsdom FAIL | playwright FAIL | killed
A03 status claim without the name | source pass | jsdom FAIL | playwright pass | killed
A04 style overlays the link invisibly | source FAIL | jsdom pass | playwright FAIL | killed
A05 handoff module runs code on import | source FAIL | jsdom FAIL | playwright FAIL | killed
```

## Set 4

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass"}
Y17 disclaimer colour equals the card background | source FAIL | jsdom pass | playwright FAIL | killed
Y18 disclaimer font-size typo | source FAIL | jsdom pass | playwright FAIL | killed
Y19 disclaimer colour transparent | source FAIL | jsdom pass | playwright FAIL | killed
Y20 disclaimer pushed off screen | source FAIL | jsdom pass | playwright FAIL | killed
Y16 renderer style hides the disclaimer | source FAIL | jsdom pass | playwright FAIL | killed
Y15 renderer style adds a status after the status line | source FAIL | jsdom pass | playwright FAIL | killed
Y06 Configure click activates the Statewright link | source pass | jsdom pass | playwright FAIL | killed
Y05 Configure click loads an image from the link address | source pass | jsdom pass | playwright FAIL | killed
Y07 hub event loads an image from the link address | source pass | jsdom pass | playwright FAIL | killed
Y48 hub event sets the pill to Connected | source FAIL | jsdom pass | playwright FAIL | killed
Y45 handoff module sets the page title | source FAIL | jsdom pass | playwright FAIL | killed
Y23 heading claims a connection | source pass | jsdom pass | playwright FAIL | killed
Y43 link label colour equals its background | source FAIL | jsdom pass | playwright FAIL | killed
Y52 address colour equals the card background | source FAIL | jsdom pass | playwright FAIL | killed
```

## Set 5

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass"}
Z02 shared rule clamps paragraphs to one line | source FAIL | jsdom pass | playwright FAIL | killed
Z03 shared rule caps paragraph height | source FAIL | jsdom pass | playwright FAIL | killed
Z35 shared rule clamps paragraphs to two lines | source FAIL | jsdom pass | playwright FAIL | killed
Z09 light colour-scheme repair lightens the card only | source FAIL | jsdom pass | playwright FAIL | killed
Z34 light theme repair lightens the card only | source FAIL | jsdom pass | playwright FAIL | killed
Z14 shared rule truncates the address | source FAIL | jsdom pass | playwright FAIL | killed
A08 shared rule makes paragraph text translucent | source FAIL | jsdom pass | playwright pass | killed
Y48 hub event sets the pill to Connected | source FAIL | jsdom pass | playwright FAIL | killed
Y16 renderer style hides the disclaimer | source FAIL | jsdom pass | playwright FAIL | killed
Y06 Configure click activates the Statewright link | source pass | jsdom pass | playwright FAIL | killed
```

## Set 6

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass"}
V16 card height cap 120px, overflow hidden | source FAIL | jsdom pass | playwright FAIL | killed
V39 card height cap 100px, overflow hidden | source FAIL | jsdom pass | playwright FAIL | killed
V42 card height cap 120px, overflow auto | source FAIL | jsdom pass | playwright FAIL | killed
V40 action row capped at 36px | source FAIL | jsdom pass | playwright FAIL | killed
V38 one-line clamp at 1400px and wider | source FAIL | jsdom pass | playwright pass | killed
V25 glass cards in the Atmosphere theme only | source FAIL | jsdom pass | playwright pass | killed
Z02 shared rule clamps paragraphs to one line | source FAIL | jsdom pass | playwright FAIL | killed
Z09 light colour-scheme repair lightens the card only | source FAIL | jsdom pass | playwright FAIL | killed
Y48 hub event sets the pill to Connected | source FAIL | jsdom pass | playwright FAIL | killed
```

## Set 7

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass"}
V14 action row positioned outside the card (in the style sheet) | source FAIL | jsdom pass | playwright FAIL | killed
W02 the same rule in a second constant, style sheet untouched | source FAIL | jsdom pass | playwright FAIL | killed
W01 wide-screen clamp in a second constant, style sheet untouched | source FAIL | jsdom pass | playwright pass | killed
W03 a second style element with a hiding rule | source FAIL | jsdom pass | playwright FAIL | killed
V16 card height cap 120px, overflow hidden | source FAIL | jsdom pass | playwright FAIL | killed
X12 WebSocket to the provider on render | source FAIL | jsdom pass | playwright FAIL | killed
```

Total: 65 mutants, 65 killed, 0 survived.

A08 (`.cc-intcat p` translucent text) does not change the Statewright disclaimer, because the card's own later rule overrides it; it does dim the other catalog cards' summaries. It is killed by the style-sheet pin.

Not excluded by tests (auditors' classification): obfuscated mutants and deliberate edits whose intent is plain in a diff; code review is the control for those. Known survivors of the auditors' own definitions are listed in the sixth review report.
