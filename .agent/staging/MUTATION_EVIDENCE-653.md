# Mutation evidence for PR #653 (iteration 8)

Each mutant is applied to `integration-catalog-renderer.js` or `statewright-handoff.js`, the suites are run, and the file is restored. A mutant is killed when at least one suite fails. Windows 11, Node 22.23.4, at the tests of this commit.

- The scripts in `.agent/staging/mutation-653/` (`set3.cjs` to `set7.cjs`) are the definitions that were run. Run `npm run compile`, then `node <script> <path to FailSafe/extension>`. Each script restores the mutated file in a `finally` block; a run that is killed part-way can leave a mutant in place, so check `git status` afterwards.
- Every set reports three suites separately: `source` (the source contract), `jsdom` (the jsdom contract and the existing catalog test) and `playwright` (the Statewright spec).
- Identifiers M, X, Y, Z, V, W and E follow the auditors' reports where a mutant was taken from one. The script text is the definition actually run and can differ in detail from an auditor's own definition of the same identifier. A01 to A08, X12w and X12x are the author's.
- The renderer's style sheet and the line that installs it are pinned in the source contract, and the installed style element is checked in jsdom.
- **Network.** Every test process of every run loads `no-network.cjs` through `NODE_OPTIONS`. It refuses every lookup and connection to a host other than this machine before anything is sent, and the runner prints the refused attempts per mutant. The Playwright spec also maps the provider's host names to 127.0.0.1. Runs recorded before iteration 8 did not load this guard. Every baseline below made no attempt. The only mutants that made attempts are X12w and X12x, eight each; all came from the existing catalog test (identical to `main`, no stubs of its own) and all were refused.

## Set 3

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass","refused":0}
M02 preconnect link | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
M06 ping attribute | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
M11 extra Connected pill | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
M12 false copy | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
M16 only when catalog non-empty | source pass | jsdom FAIL | playwright pass | network attempts refused 0 | killed
M17 window.open on render | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
M18 auto-click after 3 s | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
M19 Connect account button | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
M20 tabindex -1 aria-hidden | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
M21 no handoff while loading | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
A06 query string on the URL | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
A07 visible URL differs from the link | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
X09 mousedown rewrites the link | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
X12 WebSocket to the provider | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
X24 postTask navigation | source FAIL | jsdom pass | playwright pass | network attempts refused 0 | killed
X26 hover opens the page | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
X17 Configure click also opens Statewright | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
X22 ::after Connected | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
X21 style hides the disclaimer | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
X29 status line claims connected | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
X30 pill title and aria-label | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
A01 keydown opens a second page | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
A02 queueMicrotask fetch to provider | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
A03 status claim without the name | source pass | jsdom FAIL | playwright pass | network attempts refused 0 | killed
A04 style overlays the link invisibly | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
A05 handoff module runs code on import | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
```

## Set 4

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass","refused":0}
Y17 disclaimer colour equals the card background | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y18 disclaimer font-size typo | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y19 disclaimer colour transparent | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y20 disclaimer pushed off screen | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y16 renderer style hides the disclaimer | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y15 renderer style adds a status after the status line | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y06 Configure click activates the Statewright link | source pass | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y05 Configure click loads an image from the link address | source pass | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y07 hub event loads an image from the link address | source pass | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y48 hub event sets the pill to Connected | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y45 handoff module sets the page title | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y23 heading claims a connection | source pass | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y43 link label colour equals its background | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y52 address colour equals the card background | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
```

## Set 5

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass","refused":0}
Z02 shared rule clamps paragraphs to one line | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Z03 shared rule caps paragraph height | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Z35 shared rule clamps paragraphs to two lines | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Z09 light colour-scheme repair lightens the card only | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Z34 light theme repair lightens the card only | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Z14 shared rule truncates the address | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
A08 shared rule makes paragraph text translucent | source FAIL | jsdom pass | playwright pass | network attempts refused 0 | killed
Y48 hub event sets the pill to Connected | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y16 renderer style hides the disclaimer | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y06 Configure click activates the Statewright link | source pass | jsdom pass | playwright FAIL | network attempts refused 0 | killed
```

## Set 6

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass","refused":0}
V16 card height cap 120px, overflow hidden | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
V39 card height cap 100px, overflow hidden | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
V42 card height cap 120px, overflow auto | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
V40 action row capped at 36px | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
V38 one-line clamp at 1400px and wider | source FAIL | jsdom pass | playwright pass | network attempts refused 0 | killed
V25 glass cards in the Atmosphere theme only | source FAIL | jsdom pass | playwright pass | network attempts refused 0 | killed
Z02 shared rule clamps paragraphs to one line | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Z09 light colour-scheme repair lightens the card only | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
Y48 hub event sets the pill to Connected | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
```

## Set 7

```
baseline {"source":"pass","jsdom":"pass","playwright":"pass","refused":0}
V14 action row positioned outside the card (in the style sheet) | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
W02 the same rule in a second constant, style sheet untouched | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
W01 wide-screen clamp in a second constant, style sheet untouched | source FAIL | jsdom FAIL | playwright pass | network attempts refused 0 | killed
W03 a second style element with a hiding rule | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 0 | killed
V16 card height cap 120px, overflow hidden | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
X12w WebSocket to the provider through the jsdom window (audit #945) | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 8 | killed
X12x XMLHttpRequest to the provider through the jsdom window | source FAIL | jsdom FAIL | playwright FAIL | network attempts refused 8 | killed
E01 wide-screen clamp appended to the style element text | source pass | jsdom FAIL | playwright pass | network attempts refused 0 | killed
E02 wide-screen clamp appended to the style element as a node | source pass | jsdom FAIL | playwright pass | network attempts refused 0 | killed
X12 WebSocket to the provider on render | source FAIL | jsdom pass | playwright FAIL | network attempts refused 0 | killed
```

Total: 69 mutants, 69 killed, 0 survived.

A08 (`.cc-intcat p` translucent text) does not change the Statewright disclaimer, because the card's own later rule overrides it; it does dim the other catalog cards' summaries. It is killed by the style-sheet pin.

Not excluded by tests (auditors' classification): obfuscated mutants and deliberate edits whose intent is plain in a diff; code review is the control for those. Known survivors of the auditors' own definitions are listed in the confirmation reports.
