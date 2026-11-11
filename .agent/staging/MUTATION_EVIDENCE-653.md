# Mutation evidence for PR #653 (iteration 5)

Each mutant was applied to `integration-catalog-renderer.js` or `statewright-handoff.js`; the mocha suites (jsdom contract, source contract and the existing catalog test, reported together in the first column) and the Playwright spec were run; the file was then restored. A mutant is killed when at least one suite fails. Windows 11, Node 22.23.4, at the tests of this commit. Identifiers M, X, Y and Z are the auditors' (reports 1 to 4); A is the author's set. Definitions: the auditors' reports, and for A the table below.

## Set 1 (26): first- and second-audit mutants and the author's A01-A07

```
baseline {"jsdom":"pass","playwright":"pass"}
M02 preconnect link | mocha FAIL | playwright pass | killed
M06 ping attribute | mocha FAIL | playwright FAIL | killed
M11 extra Connected pill | mocha FAIL | playwright FAIL | killed
M12 false copy | mocha FAIL | playwright pass | killed
M16 only when catalog non-empty | mocha FAIL | playwright pass | killed
M17 window.open on render | mocha FAIL | playwright FAIL | killed
M18 auto-click after 3 s | mocha FAIL | playwright FAIL | killed
M19 Connect account button | mocha FAIL | playwright pass | killed
M20 tabindex -1 aria-hidden | mocha FAIL | playwright pass | killed
M21 no handoff while loading | mocha FAIL | playwright pass | killed
A06 query string on the URL | mocha FAIL | playwright FAIL | killed
A07 visible URL differs from the link | mocha FAIL | playwright FAIL | killed
X09 mousedown rewrites the link | mocha FAIL | playwright FAIL | killed
X12 WebSocket to the provider | mocha FAIL | playwright FAIL | killed
X24 postTask navigation | mocha FAIL | playwright pass | killed
X26 hover opens the page | mocha FAIL | playwright FAIL | killed
X17 Configure click also opens Statewright | mocha FAIL | playwright FAIL | killed
X22 ::after Connected | mocha FAIL | playwright FAIL | killed
X21 style hides the disclaimer | mocha FAIL | playwright FAIL | killed
X29 status line claims connected | mocha FAIL | playwright FAIL | killed
X30 pill title and aria-label | mocha FAIL | playwright pass | killed
A01 keydown opens a second page | mocha FAIL | playwright FAIL | killed
A02 queueMicrotask fetch to provider | mocha FAIL | playwright FAIL | killed
A03 status claim without the name | mocha FAIL | playwright pass | killed
A04 style overlays the link invisibly | mocha FAIL | playwright FAIL | killed
A05 handoff module runs code on import | mocha FAIL | playwright FAIL | killed
```

## Set 2 (14): third-audit mutants

```
baseline {"jsdom":"pass","playwright":"pass"}
Y17 disclaimer colour equals the card background | mocha FAIL | playwright FAIL | killed
Y18 disclaimer font-size typo | mocha FAIL | playwright FAIL | killed
Y19 disclaimer colour transparent | mocha FAIL | playwright FAIL | killed
Y20 disclaimer pushed off screen | mocha FAIL | playwright FAIL | killed
Y16 renderer style hides the disclaimer | mocha pass | playwright FAIL | killed
Y15 renderer style adds a status after the status line | mocha pass | playwright FAIL | killed
Y06 Configure click activates the Statewright link | mocha pass | playwright FAIL | killed
Y05 Configure click loads an image from the link address | mocha pass | playwright FAIL | killed
Y07 hub event loads an image from the link address | mocha pass | playwright FAIL | killed
Y48 hub event sets the pill to Connected | mocha FAIL | playwright FAIL | killed
Y45 handoff module sets the page title | mocha FAIL | playwright FAIL | killed
Y23 heading claims a connection | mocha pass | playwright FAIL | killed
Y43 link label colour equals its background | mocha FAIL | playwright FAIL | killed
Y52 address colour equals the card background | mocha FAIL | playwright FAIL | killed
```

## Set 3 (10): fourth-audit mutants and re-checks

```
baseline {"jsdom":"pass","playwright":"pass"}
Z02 shared rule clamps paragraphs to one line | mocha pass | playwright FAIL | killed
Z03 shared rule caps paragraph height | mocha pass | playwright FAIL | killed
Z35 shared rule clamps paragraphs to two lines | mocha pass | playwright FAIL | killed
Z09 light colour-scheme repair lightens the card only | mocha pass | playwright FAIL | killed
Z34 light theme repair lightens the card only | mocha pass | playwright FAIL | killed
Z14 shared rule truncates the address | mocha pass | playwright FAIL | killed
A08 shared rule makes paragraph text translucent (equivalent: the card rule overrides it) | mocha pass | playwright pass | SURVIVED
Y48 hub event sets the pill to Connected | mocha FAIL | playwright FAIL | killed
Y16 renderer style hides the disclaimer | mocha pass | playwright FAIL | killed
Y06 Configure click activates the Statewright link | mocha pass | playwright FAIL | killed
```

A01 a keydown listener on the container opens a second page. A02 queueMicrotask fetch to the provider. A03 a second status line claiming a connection without naming the provider. A04 the link made invisible with opacity. A05 the handoff module loads an image on import. A06 a query string on the address. A07 a visible address that differs from the link. A08 `.cc-intcat p { color: rgba(169,184,203,.15) }` in the renderer style sheet.

Not excluded by tests (auditors' classification): obfuscated mutants, and deliberate edits whose intent is plain in a diff. Code review is the control for those. Known survivors are listed in the fourth audit report.
