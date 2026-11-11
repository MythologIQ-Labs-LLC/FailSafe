# Mutation evidence for PR #653 (iteration 4)

Each mutant was applied to `integration-catalog-renderer.js` or `statewright-handoff.js`, the jsdom and source-contract suites and the Playwright spec were run, and the file was restored. A mutant is killed when at least one suite fails. Run on Windows 11, Node 22.23.4, at the tests of this commit.

## Earlier set (26): iteration 2 mutants, second-audit survivors, five more

```
baseline {"jsdom":"pass","playwright":"pass"}
M02 preconnect link | jsdom FAIL | playwright pass | killed
M06 ping attribute | jsdom FAIL | playwright FAIL | killed
M11 extra Connected pill | jsdom FAIL | playwright FAIL | killed
M12 false copy | jsdom FAIL | playwright pass | killed
M16 only when catalog non-empty | jsdom FAIL | playwright pass | killed
M17 window.open on render | jsdom FAIL | playwright FAIL | killed
M18 auto-click after 3 s | jsdom FAIL | playwright FAIL | killed
M19 Connect account button | jsdom FAIL | playwright pass | killed
M20 tabindex -1 aria-hidden | jsdom FAIL | playwright pass | killed
M21 no handoff while loading | jsdom FAIL | playwright pass | killed
M23 query string on the URL | jsdom FAIL | playwright FAIL | killed
M24 visible URL differs from the link | jsdom FAIL | playwright FAIL | killed
X09 mousedown rewrites the link | jsdom FAIL | playwright FAIL | killed
X12 WebSocket to the provider | jsdom FAIL | playwright FAIL | killed
X24 postTask navigation | jsdom FAIL | playwright pass | killed
X26 hover opens the page | jsdom FAIL | playwright FAIL | killed
X17 Configure click also opens Statewright | jsdom FAIL | playwright FAIL | killed
X22 ::after Connected | jsdom FAIL | playwright FAIL | killed
X21 style hides the disclaimer | jsdom FAIL | playwright FAIL | killed
X29 status line claims connected | jsdom FAIL | playwright FAIL | killed
X30 pill title and aria-label | jsdom FAIL | playwright pass | killed
Y01 keydown opens a second page | jsdom FAIL | playwright FAIL | killed
Y02 queueMicrotask fetch to provider | jsdom FAIL | playwright FAIL | killed
Y03 status claim without the name | jsdom FAIL | playwright pass | killed
Y04 style overlays the link invisibly | jsdom FAIL | playwright FAIL | killed
Y05 handoff module runs code on import | jsdom FAIL | playwright FAIL | killed
```

## Third-audit set (14)

```
baseline {"jsdom":"pass","playwright":"pass"}
Y17 disclaimer colour equals the card background | jsdom FAIL | playwright FAIL | killed
Y18 disclaimer font-size typo | jsdom FAIL | playwright FAIL | killed
Y19 disclaimer colour transparent | jsdom FAIL | playwright FAIL | killed
Y20 disclaimer pushed off screen | jsdom FAIL | playwright FAIL | killed
Y16 renderer style hides the disclaimer | jsdom pass | playwright FAIL | killed
Y15 renderer style adds a status after the status line | jsdom pass | playwright FAIL | killed
Y06 Configure click activates the Statewright link | jsdom pass | playwright FAIL | killed
Y05 Configure click loads an image from the link address | jsdom pass | playwright FAIL | killed
Y07 hub event loads an image from the link address | jsdom pass | playwright FAIL | killed
Y48 hub event sets the pill to Connected | jsdom FAIL | playwright pass | killed
Y45 handoff module sets the page title | jsdom FAIL | playwright FAIL | killed
Y23 heading claims a connection | jsdom pass | playwright FAIL | killed
Y43 link label colour equals its background | jsdom FAIL | playwright FAIL | killed
Y52 address colour equals the card background | jsdom FAIL | playwright FAIL | killed
```

Not excluded by tests (third auditor's classification): obfuscated mutants and deliberate edits whose intent is plain in a diff. Code review is the control for those.
