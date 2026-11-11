# AUDIT REPORT (iteration 6, bounded confirmation check after VETOs #938 to #942): PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit). No authorship of the change, of any remediation or of any earlier audit.
- **Date:** 2026-11-11
- **Exact source audited:** `2132e5931d36a57bab8604efd00beae213fd5e8b` (`git rev-parse HEAD` in `C:\dev\mythologiq\FailSafe-653`, branch `feat/652-statewright-website-handoff`; equal to the PR's `headRefOid`)
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`
- **Previously audited:** `1fd4a557` (#938), `dd766c15` (#939), `45a78c4d` (#940), `b883f814` (#941), `54f67646` (#942). All VETO.
- **Plan:** `.failsafe/governance/plans/plan-v6013-statewright-652-website-first.md`, iteration 6 (LF sha256 `476a2e41137dcf7b35e5f72336a3aa1d6032214c827b378b2f5f9bbe060e4bb4`, equal to `plan_content_hash` in `plan-iter6.json`)
- **Environment:** Windows 11, Node 22.23.4, Playwright Chromium. No request reached `statewright.ai`: Playwright routes fulfilled the host, Chromium ran with `--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost` in every run of mine, and a Node preload refused every non-loopback DNS lookup (it refused 27 lookups of `statewright.ai`, all from jsdom's WebSocket under the second auditor's mutant X12).
- **Method:** all mutation, probe, repeat and guard runs were done in nine disposable `git archive` exports of HEAD and one detached worktree, all under a new directory of my own in the system temp folder. The audited worktree was never built in, written to or mutated.

## Verdict and scope statement

**This is a bounded confirmation check. It is not an open-ended audit.** It was commissioned by the implementer, not by the owner. It confirms or refutes three things: that the fifth audit's closed list (ledger #942) is implemented and effective as specified, that nothing earlier audits recorded as working has regressed, and that the records are true. I did not run a new mutant campaign. A PASS from this check would not have meant that no further survivor class exists, and this VETO does not mean that one of the open-ended classes has come back.

## Verdict: VETO

One blocking finding. It is narrow, it was introduced by this iteration, and its fix is one expression in one test.

- **B1.** Item 1 of the closed list said to *add* the clipping ancestors to the boxes that every line of text must lie inside. The implementation added them and at the same time *removed the card's own box* from that list. The fourth audit's closed list required the card's box, and the fifth audit recorded that check as implemented and effective. With it gone, text that leaves the card but stays on screen passes the browser test. The fifth auditor's own mutant V14 shows it: recorded at #942 as failing all five readability views, it now passes all 15 Playwright tests. It is still killed, but only by the new style-sheet pin; with the pin test alone disabled it survives every suite. The same rule delivered through a second constant, which the pin does not see, survives the complete suite at HEAD. The plan still says the lines "must lie inside its element, the card and the viewport".

Everything else in the bounded scope holds:

- Item 1 does what it was written to do. The check no longer scrolls, the `scrolled` assertion can fail, and V16, V39, V42, V05 and V40 each fail in the browser with the pin test disabled.
- Item 2 is implemented and effective for every mutant whose only edit is the renderer's `STYLE`. V38, V25, V19, V20, V21 are killed by the pin and only by the pin.
- Item 3: the ledger chain verifies, entries #940 and #941 are unaltered, #942 and #943 are true, and the committed scripts reproduce every result in the evidence file.
- 184 earlier mutants re-run with the auditors' own definitions: 170 killed, 14 survive. No mutant moved from killed to survived. 34 moved from survived to killed.
- The shipped source is byte-identical to `dd766c15` and I found no defect in it against the owner-approved scope or any required negative.
- No razor breach, no flake in 225 repeated Playwright tests, no false refusal in the five asserted views, guards green, CI green on the exact commit (13 of 13).

**How firm B1 is.** The facts are measured and not in doubt. Whether they amount to a VETO depends on one reading, and I state it so the owner can overrule it. The verdict rule blocks when "a closed-list item is not implemented or not effective as specified". I read "add every ancestor with non-visible overflow to the frames" as "the frames grow", and a change that grows them by four boxes and shrinks them by one is not that. The other clauses of the rule are not hit: V14 does not survive at HEAD (the pin kills it), and no required negative lost coverage. If the owner reads item 1 as only its two named mechanisms and its named mutants, B1 becomes the first observation below and this check is a PASS. I do not read it that way, because this check exists to confirm that the list was applied without loss, and a check the previous closed list required was lost.

## Risk grade: L2

Unchanged from the five earlier audits. User-facing navigation to a third-party site and product-truth copy about that third party. No credential handling, no data egress by FailSafe, no backend, schema or dependency change, so not L3. This iteration (`3473d01e`, `2132e593`) changed two test files, the plan, the evidence file, four evidence scripts, the ledger and gate files only.

## Status of the closed list

| Item | Status | Evidence |
|---|---|---|
| **1.** Fix `readability()`: remove the scroll (or fail on a scrolled clipping ancestor) and add every ancestor with non-visible overflow to the frames | **Implemented and effective for what it names (V16, V39, V42, V05, V40, each without the pin). Implemented with one unrequested removal, the card's box, which loses a check the fourth list required: B1** | Sections "Item 1" and "B1" |
| **2.** Pin the renderer's `STYLE` in the source contract as a review trigger | **Implemented and effective as specified.** A SHA-256 digest is used in place of a literal copy. The pin covers the constant's text, not how the style element is composed (observation O1) | Section "Item 2" |
| **3.** Correct the records (ledger text of #940 and #941, evidence file, plan wording) | **Done.** Minor leftovers under "Records check" | Section "Records check" |

### Item 1: `readability()` in `src/test/ui/statewright-handoff.spec.ts`

What changed (`git diff 54f67646..HEAD`): `await target.scrollIntoViewIfNeeded()` is removed; `clips` is the element plus every ancestor whose computed `overflow` is not `visible`; `frames` is the bounding box of each of those plus the viewport; a new field `scrolled` counts the boxes in `clips` with a non-zero `scrollTop` or `scrollLeft`, and `expectReadable` asserts it is 0 before it asserts `clipped` is 0.

**The five named mutants, with the fifth auditor's own definitions (`p.cjs`, sha256 `f3cefd85...`, anchors verified against HEAD).** "Pin on" is the suite as committed. "Pin off" is the same run with only the test "the catalog style sheet is the reviewed one" excluded (mocha `--grep ... --invert`; 32 tests run, 0 failed in every row).

| ID | Rule added to `STYLE` | Pin on: source / jsdom / catalog / Playwright | Pin off: mocha / Playwright | Failing assertion |
|---|---|---|---|---|
| V16 | `.cc-intcat > * { max-height:120px; overflow:hidden; }` | 1 / 0 / 0 / FAIL 2 of 15 | 0 / FAIL 2 of 15 | readability, two of five views: `clipped` expected 0, received 2 |
| V39 | the same with `max-height:100px` | 1 / 0 / 0 / FAIL 5 | 0 / FAIL 5 | readability, five of five views: `clipped` expected 0, received 1 |
| V42 | as V16 with `overflow:auto` | 1 / 0 / 0 / FAIL 2 | 0 / FAIL 2 | readability, two views: received 2 |
| V05 | `.cc-intcat-actions { height:36px; overflow:hidden; }` | 1 / 0 / 0 / FAIL 2 | 0 / FAIL 2 | readability, two views: received 2 |
| V40 | the same with `overflow:clip` | 1 / 0 / 0 / FAIL 2 | 0 / FAIL 2 | readability, two views: received 2 |

All five survived every suite at the fifth audit. The readability fix is effective for V16 and V39 on its own.

**Nothing is scrolled before measurement.** A probe on unmutated HEAD, using a verbatim copy of `readability()` extracted from the committed spec, recorded the window offset and the scroll offsets of every ancestor (not only the clipping ones) before and after each measurement. In the five asserted views, 15 measurements: window `0,0`, no ancestor scrolled, before and after. The same held in 228 further measurements across widths, themes and colour schemes. The boxes compared at HEAD, besides the element and the viewport, are `main.content-area` (`overflow:auto`, the page's scroller), `div.viewport-hub`, `div.app-layout` and `body` (all `hidden`).

**The `scrolled` assertion can fail.** Probe at 600 px with the V16 rule injected by `addStyleTag`, measuring the link:

| State | `clipped` / lines | `scrolled` |
|---|---|---|
| As first shown | 2 / 2 | 0 |
| After `link.scrollIntoViewIfNeeded()`, which is what the iteration-5 test did | 0 / 2 | 1 (card `scrollTop` 81) |
| Card scroll reset to 0 | 2 / 2 | 0 |

With the V39 rule the card's `scrollTop` after the scroll is 101. Both numbers equal the fifth auditor's. So the old failure mode (text reported as inside because a clipped box was scrolled) now trips `scrolled`, and the unscrolled page trips `clipped`.

**No false refusal at HEAD in the five asserted views.** All pass. Font 14.08 / 16 / 12.8 px, contrast 7.85 / 15.19 / 4.56, opacity 1, text alpha 1, `clipped` 0, `scrolled` 0 for the disclaimer, link and address, identical in the five views apart from line counts (disclaimer 2 lines at 1280 px and 4 at 600 px; link 1 and 2). An independent hit test (`document.elementFromPoint` at five points of every line rectangle) missed 0 of 130 points. The text sits between 231 and 421 px from the top of the 900 px viewport.

**Width sweep, for the owner's information (only the five views are asserted).** Unmutated HEAD, the same check, viewport height 900 px:

| Theme / colour scheme | Widths that pass | Widths that fail |
|---|---|---|
| default / dark | 525, 530, 535, 540, 545, 546, 547, 548, 550, 560, 600, 640, 700, 768, 800, 900, 901, 1024, 1100, 1101, 1280, 1366, 1400, 1440, 1600, 1920 | 500, 510, 520 |
| default / light | 547 to 1920 (18 widths, all pass) | 520 |
| Pegasus / dark | 547 to 1920 (18 widths, all pass) | 520 |
| Pegasus / light | 547 to 1920 (18 widths, all pass) | 520 |

The failures at 520 px and below are real and inherited: the Console layout stops shrinking at 547 px and `div.app-layout` (`overflow-x:hidden`) cuts the right edge off. At 520 px the address box crosses that edge (`clipped` 1 of 1; the hit test misses its right end); at 500 px the disclaimer is cut as well. This is the fifth audit's N4, which the plan lists as inherited from `main`. So the unmutated card passes the check from 525 px to 1920 px in the default and Pegasus themes under both colour schemes, and correctly fails below that. The catalog-unavailable state passes at 600 and 1280 px. The numbers do not move with theme or scheme because the three elements carry their own colours on the card's own opaque gradient.

### Item 2: the style-sheet pin in `src/test/roadmap/statewright-handoff-source.test.ts`

- **The digest matches HEAD.** Recomputed from the committed blob with the test's own two extraction lines: `b1c2787e452233ccc314d4fc21e76320855dd3efeaa1be6f87ad3e438c1c9197`, 2094 characters, 28 rules. `read()` normalises CRLF to LF first, so the result does not depend on the checkout's line endings (the worktree is CRLF, the blob LF).
- **Any one-character change fails.** 6282 single-character deletions, substitutions and insertions over the whole sheet: none keeps the digest. In the real suites, 66 of the 184 re-run mutants change the text of `STYLE`; the pin test failed for exactly those 66 and for none of the other 118.
- **The named mutants.** V38, V25, V19, V20, V21: source 1, jsdom 0, catalog 0, Playwright 15 pass. Killed by the pin and by nothing else; with the pin test disabled all five survive, as at #942. Z02, Z09, Z34, Z35: killed by the pin and, independently, by the browser test (5, 3, 2 and 2 readability views, with the pin on or off; Z09 at contrast 1.8805 and Z34 at 2.0182, the values the fourth and fifth audits measured).
- **Does a digest satisfy "string equality as a review trigger"?** Yes for the trigger: equal digests mean equal text for every practical purpose, and any edit to the sheet fails a named test. The trade-off is in what the reviewer sees. With a literal copy the test file holds the reviewed sheet, an edit shows up twice in the diff (source and test), and a failing assertion prints the changed line. With a digest the test diff is one changed hash, the failure prints two hashes and no message, and the reviewer must read the renderer's diff to see what changed. Both can be updated mechanically. The digest saves 28 lines in a 91-line file. The comment above the assertion says what a change requires. I consider the item met; a literal copy would be a stronger prompt to a human reviewer.
- **Is the extraction robust?** It fails closed for the cases the brief asked about, and it has one boundary. Simulated with the test's own two lines on edited copies of the committed file:

| Edit to the renderer | Pin |
|---|---|
| Constant moved elsewhere in the file, text unchanged (legitimate) | passes, correctly |
| Another template literal declared before the sheet (legitimate) | passes, correctly |
| Constant renamed (`STYLES`), or declared with `let` | fails: the opening text is not found, the slice starts at offset 14 of the file and no longer equals the sheet |
| Interpolation inside the sheet (`${EXTRA}`) | fails |
| Sheet followed by `+ EXTRA` or `.concat(EXTRA)` instead of `;` | fails: the slice runs to the next `` `; `` in the file |
| **Rules in a second constant, concatenated in `ensureStyle()`** | **passes; the new rules are not pinned** |
| **A literal string concatenated in `ensureStyle()`, a second `<style>` element, or `STYLE.replace(...)`** | **passes** |
| The original declaration kept inside a comment and the real one edited under another name (a decoy) | passes |

  So a moved or renamed constant cannot make the test pin the wrong text or nothing: it fails. What the test pins is the constant, not the composition `el.textContent = STYLE + STATEWRIGHT_STYLES`. See O1.

## Blocking finding

### B1. The card's box was removed from the frames, so text that leaves the card but stays on screen now passes the browser test

Rule item: "a closed-list item is not implemented ... as specified" (item 1: "add every ancestor with non-visible overflow to the frames"). Plan sentence contradicted: iteration 5, item 1, as edited in iteration 6: "every rendered line of the disclaimer, the link and the address must lie inside its element, the card and the viewport."

What happened. At `54f67646` the frames were `[el, el.closest('.cc-intcat-statewright'), viewport]`. The fifth list said: "Add to `frames` the padding box of every ancestor whose computed `overflow-x` or `overflow-y` is not visible." At HEAD the frames are `[el, ...ancestors that clip, viewport]`. The card has `overflow: visible`, so it is no longer a frame. The fourth audit's closed list, item 1, required "the element's box, the card's box and the viewport", and the fifth audit's status table recorded that as implemented.

Evidence.

| Run | source | jsdom | catalog | Playwright | Result |
|---|---|---|---|---|---|
| V14 at the fifth audit (`54f67646`), from that auditor's raw results | 0 | 0 | 0 | FAIL 5 (readability, 5 of 5: `clipped` expected 0, received 1) | killed by the browser test |
| V14 at HEAD, suite as committed | 1 (the pin) | 0 | 0 | 15 pass | killed by the pin only |
| V14 at HEAD, pin test alone disabled | 0 | 0 | 0 | 15 pass | **survives** |
| W02 at HEAD, suite as committed: the V14 rule in a second constant concatenated in `ensureStyle()`, `STYLE` untouched | 0 | 0 | 0 | 15 pass | **survives all 48 tests** |
| V14, pin disabled, with the card restored to `clips` (prototype) | 0 | 0 | 0 | FAIL 5 | killed by the browser test |
| W02 with the card restored to `clips` (prototype) | 0 | 0 | 0 | FAIL 5 | killed |

V14 is the fifth auditor's: `.cc-intcat-card { position:relative; } .cc-intcat-actions { position:absolute; top:12px; right:14px; }`. The Statewright card is a `section`, not a `.cc-intcat-card`, so its action row has no positioned ancestor inside the catalog and is laid out against `div.tab-panel`.

What the reader sees with that rule (Chromium, unmutated HEAD plus the rule, screenshots `shot-V14-600.png` and `shot-V14-1280.png` in my directory): the link and the address leave the card and land 52 to 89 px from the top of the page, on the Integrations sub-view bar. At 600 px the link button covers the first sub-view pills and the address is printed over the "MCP" and "Agent Governance" pills, where neither text can be read. The card is left with its title, pill and disclaimer and no link. For that state the HEAD test returns `clipped: 0`, `scrolled: 0`, opacity 1 and contrast 15.19 and 4.56 for the link and the address: fully readable.

Why I call it blocking, and the limit of that. It is a property of the test at HEAD, not a hypothetical future edit: a check that existed, that an earlier closed list required and that an earlier audit recorded as effective, is gone, and the commit that removed it is the one under confirmation. The pin hides the loss for any edit made inside `STYLE`, which is why the brief asked for the item-1 mutants to be run with the pin disabled; V14 is the same question asked of a mutant the brief did not name. The risk carried by the loss is small: the rule has to reach the page through something other than the two pinned sheets (a second constant as in W02, or a style sheet outside the two files), and V14 as a deliberate layout change would be seen by whoever made it. I do not rest the verdict on the size of the risk. I rest it on the item not being implemented as specified, and I have said above how the owner may read it otherwise.

### Required remediation

1. Restore the card to the boxes compared. In `readability()`:

   `const clips = chain.filter((n) => n === el || n.matches('.cc-intcat-statewright') || !/^visible( visible)?$/.test(getComputedStyle(n).overflow));`

   I ran this as a prototype in a disposable copy. Unmutated HEAD: the Statewright spec passes twice over (20 of 20). V14 and W02 fail five of five readability views again. V16 (2 views), V39 (5), V42 (2), V05 (2) and V40 (2) still fail with the pin disabled. V13 still survives the browser test, as it did at #942 (overlap is not measured; a known limit). The function stays inside the razor (the line grows by 39 characters).
2. Or, if the owner prefers the test as it is, record that decision in the plan's "Accepted limits" and correct the iteration-5 sentence so it no longer says "the card". That is the owner's decision, not the implementer's.

Nothing else in this check requires a change.

## Regression table

Method. Each of the 184 mutants of the earlier audits was applied alone to a disposable export of HEAD with the fifth auditor's unmodified runner; `copy-ui-js` was run, then the three mocha files and the two Playwright specs in full. Definitions: M01 to X32 the second auditor's file (sha256 `48d3dacb...`), Y01 to Y53 the third auditor's (`4a8132cf...`), Z01 to Z36 the fourth auditor's `z.cjs` (`ff2ed950...`, identical in the fourth and fifth auditors' directories), V01 to V42 and A08 the fifth auditor's `p.cjs` (`f3cefd85...`). I copied the files unmodified and checked that every anchor matches the committed files exactly once and that no mutant is a no-op. I compared my per-suite failure counts and the set of failing Playwright tests with the fifth auditor's raw result files, mutant by mutant. No mutant errored.

| Set | Run | Killed now | Killed at #942 | Survivors now |
|---|---|---|---|---|
| M01 to M22 | 22 | 22 | 22 | none |
| X01 to X32 | 32 | 30 | 30 | X15, X16 |
| Y01 to Y53 | 51 | 45 | 44 | Y21, Y25, Y26, Y28, Y30, Y41 |
| Z01 to Z36 | 36 | 30 | 24 | Z17, Z19, Z23, Z26, Z27, Z30 |
| V01 to V42, A08 | 43 | 43 | 16 | none |
| **Total** | **184** | **170** | **136** | **14** |

- **Killed to survived: none.**
- **Survived to killed: 34.** Five by the readability fix, with or without the pin: V05, V16, V39, V40, V42. Twenty-nine by the pin alone (no other test fails): V02, V04, V09, V10, V11, V12, V13, V15, V19, V20, V21, V22, V25, V26, V28, V29, V30, V31, V36, V37, V38, A08, Y44, Z06, Z07, Z11, Z15, Z16, Z33.
- **Every column other than the pin is unchanged for 175 mutants.** For the 118 mutants that do not touch `STYLE`, the jsdom, catalog and source counts are identical to #942 for all of them and the set of failing Playwright tests is identical for all but X18. For the 66 that do touch `STYLE`, the source count is higher by exactly one (the pin) and the Playwright set is identical for all but eight.
- **Playwright column, stronger now (8):** V05, V16, V39, V40, V42 (pass to 2, 2, 5, 2, 2 readability views); Z01 and V17 (2 views to 5); X18 (pass to 5 views: the card moved below the catalog is below the fold, and the check no longer scrolls to it; X18 was and is also killed by jsdom).
- **Playwright column, weaker now (1): V14** (5 readability views to pass). This is B1.
- **Survivors, all carried with the class the earlier auditors gave them:** X15, X16 (cosmetic, untouched code); Y21, Y26, Y28 (obfuscated); Y30, Y41 (plain deliberate); Y25, Z23 (out of scope); Z17, Z30 (a new render state omits the card; plain, boundary); Z19 (no rule item broken); Z26, Z27 (legitimate or equivalent edits that should pass).
- **Legitimate restyles now refused by the pin**, as the fifth auditor said they would be: Z06, Z07, Z15, Z16, Z33, V02, V28, V29, V37. This is the intended cost of a review trigger.

The complete 184-row table is the appendix.

## Records check

**Ledger, entries #938 to #943, read in full.**

- Chain: `python -I -m qor.cli verify-ledger --post-anchor`, run read-only from the worktree root, prints `OK ... chain hash verified (post-anchor)` for #940, #941, #942 and #943 and ends `post-anchor clean (boundary=#382)`, exit 0.
- Sealed text: `git diff <rev> HEAD -- docs/META_LEDGER.md` shows 0 deleted or changed lines against `origin/main`, `791235d0`, `fa98425b`, `43615b1f`, `08f78e44` and `3473d01e`. The ledger only grew (90 lines since `origin/main`, 30 since `08f78e44`, none in `2132e593`). The text of entries #938, #939 and #940 extracted at `08f78e44` and at HEAD hashes the same; #941 was the last entry at `08f78e44` and the diff shows only lines appended after it. Entries #940 and #941 are byte-for-byte as sealed, with their content, previous and chain hashes unchanged.
- Content hashes: the LF sha256 of each cited file equals the entry: reports 1 to 5 `56527ea7...`, `4851cf12...`, `1cf54f09...`, `077afc9d...`, `b7550e12...`; the correction file `c8af02b0...` (#943).
- **#942 is true.** I checked each statement of its Decision against the fifth report: source `54f67646`, 184 mutants, 375 Playwright runs, 234 combinations at 520 px and wider, 47 tests, B1 and B2 as written, the closed list, the recommendation of a confirmation check, N1 to N11.
- **#943 is true and corrects without altering.** Its summary of the third audit (source `45a78c4d`; B1 unpinned style values; B2 the Configure click, a boundary call; a three-item list) and of the fourth (source `b883f814`; B1 a shared rule in the renderer's sheet; a three-item list) matches those reports, and the fuller text in `LEDGER_CORRECTION-940-941.md` matches them figure for figure (51 new mutants with 28 survivors and 95 Playwright runs in the third; 141 mutants, 165 runs, 43 tests and contrast 1.88 to 2.02 in the fourth).
- Leftovers, none material:
  - Entry #939's own Decision says "The three findings of Entry #939 are closed". It means #938. Entry #943 does not mention it. The fifth audit's N1 noted that all three entries name themselves.
  - Entry #943 carries `Author: Judge` and `Phase: GATE`. It is a correction written by the implementer, not a Judge's verdict; its `Verdict` line does say "CORRECTION (no verdict)".
  - The correction file says #940 and #941 repeat #939 "word for word". They differ from it in one number, the entry they name.
  - The chain hash seals the cited report file, not the Decision paragraph. The only protection of the paragraph text is git history, which is what I checked.

**Evidence file `.agent/staging/MUTATION_EVIDENCE-653.md` (LF sha256 `c9d1de23...`), 59 rows in four sets.**

- I ran the four committed scripts unmodified (`set3.cjs` to `set6.cjs`; each lane copy equal to the committed blob) against exports of HEAD, as the file instructs, with my resolver mapping and DNS guard added around them. **All 59 rows reproduce**: every baseline is green, every per-suite pass or fail equals the file, every mutant is killed, all four scripts exit 0.
- The rows the fifth audit said were wrong:
  - **M12.** File: mocha FAIL, Playwright pass. Reproduced with the committed definition, which inserts the false claims *before* "FailSafe does not read", so the closing-text check still matches. With the first auditor's definition Playwright fails five views (my regression row: 2 / 6 / 0 / FAIL 5). The file now says its definitions can differ from an auditor's. Accurate as stated.
  - **Y48** (sets 4, 5 and 6). File: mocha FAIL in sets 4 and 5; source FAIL, jsdom pass, Playwright FAIL in set 6. Reproduced. The committed definition selects `.cc-intcat-statewright`, so it trips the source contract's name scan; the third auditor's definition does not (my regression row: 0 / 0 / 0 / FAIL 1, Playwright only). The set-6 row shows the Playwright failure as well, so the browser kill is on record. Accurate as stated.
  - **A08.** The file no longer calls it equivalent without qualification: it says the rule does not change the Statewright disclaimer, does dim the other cards, and is now killed by the pin. My run: 1 / 0 / 0 / Playwright pass. Accurate.
- Against my own runs with the auditors' definitions: the file names 45 distinct M, X, Y, Z and V identifiers. For 44 of them the killed result and the Playwright pass or fail agree with my regression row for the same identifier (M02, M06, M11, M16 to M21, X09, X12, X17, X21, X22, X24, X26, X29, X30, Y05, Y06, Y07, Y15 to Y20, Y23, Y43, Y45, Y48, Y52, Z02, Z03, Z09, Z14, Z34, Z35, V16, V25, V38, V39, V40, V42). The one that differs is M12, for the reason above.
- **The scripts reproduce the results, not the file's text.** Not material, and worth tidying:
  - Eight rows carry a different identifier in the file than the script prints: set 3 prints `M23`, `M24`, `Y01` to `Y05` where the file has `A06`, `A07`, `A01` to `A05`; set 5 prints `Z10` where the file has `A08`. The script labels collide with the auditors' identifiers for different mutants.
  - The scripts print the column as `jsdom`; the file prints `mocha (all three files)`. In set 6 that label is wrong: the script runs the source contract separately and the column is the other two files.
  - All four scripts open with the comment "Iteration 3 ... Usage: node mutate3.cjs".
  - The set-6 entries named V40 and V25 are simplified forms of the fifth auditor's (V40 is `max-height:36px; overflow:hidden`, which is closer to V05; V25 changes the background only). The file's general caveat covers this.

**Plan, iteration 6, read sentence by sentence.**

- Supported by the repository: the summary of the fifth audit; "changes tests, this plan and the records only" (`git diff 54f67646..HEAD --stat`: two test files, plan, evidence, scripts, ledger, reports, gates); "byte-identical to `dd766c15`"; "The check no longer scrolls anything"; the description of what is compared; "A height cap on the card, or on the row that holds the link, now fails in the browser test itself" (table above); the pin by digest and "a review trigger, not a proof"; "Entry #943 corrects ... without altering them"; the A08 note; the address margins (12.8 px and 4.56 measured); the Pegasus title (I measured contrast 1.02 for the Statewright title and 1.02 for another card's title); the cut below about 520 px (fails at 520, passes at 525); no Content-Security-Policy or Referrer-Policy on the Console server (carried from the earlier audits; I did not re-measure it).
- Not supported:
  - Iteration 5, item 1, as edited in this iteration: "must lie inside its element, **the card** and the viewport". False at HEAD (B1).
  - "With the style sheets pinned, each of these needs a reviewed change to a pinned sheet first." Overstated: a rule can reach the card without touching a pinned sheet (O1), and the bullet above it already names style sheets outside the two files.
  - "results are reported per suite (source contract, jsdom, Playwright)": true of set 6 only; sets 3 to 5 report the three mocha files together, as the evidence file itself says.
- Could not verify, and I do not treat as false: the installed-host table (both VSIX hashes, 14 of 14, the redirect to the login page, no referrer, cookie or opener on the real click), and that the Y48 and M12 rows were re-run by the author. Those runs were made outside the repository.

## Shipped-source review

Byte identity, by `git rev-parse <rev>:<path>`: `integration-catalog-renderer.js` is `8a15f1ae` at HEAD and at `dd766c15`; `statewright-handoff.js` is `fda005ad` at both; `integration-catalog-renderer.test.ts` is `b2b261cc` at HEAD and at `origin/main`; `integrations-catalog.spec.ts` is `2a75d9fa` at both.

I re-read both shipped files and the renderer's diff against `main` independently.

- `statewright-handoff.js` is a header comment and three constants: the address, five style rules and one block of markup. Nothing runs on import. The markup has one anchor with `href="https://statewright.ai/runs" target="_blank" rel="noopener noreferrer"`, the same address as selectable text, a pill that reads "Website handoff" with no status class, and the disclaimer. No script, handler, image, form, frame, preconnect or query string.
- The renderer's diff against `main` is five lines: the import, `STYLE + STATEWRIGHT_STYLES` in `ensureStyle()`, and the card placed after the status line in each of the three render states (loading, catalog unavailable, loaded). The fetch, the one click listener, the header counts and every other card's markup are untouched.
- Required negatives. No automatic call to Statewright: nothing in either file contacts it; four seconds idle, hovering, six re-renders, hub events, a wheel and a right-click produce no request in Chromium. Nothing transmitted: the address is a constant with no parameters and `noreferrer` suppresses the referrer (one request, referrer undefined, opener null, on keyboard and on mouse activation). No false status: the only status word is "Website handoff"; the copy says Statewright handles sign-in and that FailSafe does not read its history or enforce its workflows; the catalog's counts and its eleven pills are unchanged. No change to other integrations: the diff does not touch them and the older catalog spec passes. Catalog unavailable: the error line is shown with the card and its link, and no request is made.

**No defect found against the owner-approved scope or the required negatives.** Known and inherited, not introduced here: the card title inherits the theme's text colour and is unreadable on the dark card in the Pegasus theme, as every catalog card's title is on `main`; a malformed `integrations` value leaves the catalog on "Loading" with the card still shown.

## Tests and guards run

| Command (disposable exports or my detached worktree of HEAD, Node 22.23.4) | Result |
|---|---|
| `npm run compile` | exit 0 in all ten trees |
| `npx mocha --ui tdd --timeout 15000` on the three compiled files | 33 passing; ten consecutive runs (five under load, five idle) |
| Playwright, the two specs | 15 passed |
| The same with `--repeat-each=5`, while six mutation lanes and two evidence-script lanes were running Playwright on the same 16 cores | 75 passed (1.4 min) |
| The same with `--workers=8`, CPU 71 to 91 per cent | 75 passed (1.3 min) |
| The same, idle machine (CPU 14 per cent) | 75 passed (1.1 min) |
| 184 earlier mutants, each against mocha (3 files) and Playwright (15 tests) | regression table; the 14 survivors and the 30 pin-only kills are 44 further green runs of the 15 Playwright tests |
| 14 runs with the pin test disabled (V16, V39, V42, V05, V40, V38, V25, V19, V20, V21, Z02, Z09, Z34, Z35), then V14 | item 1, item 2, B1 |
| The four committed evidence scripts, unmodified | 59 of 59 rows reproduced |
| Probe of unmutated HEAD: five views, 88 width / theme / scheme points, two catalog-unavailable points, the `scrolled` probe, the V14 rule, title and pill colours | item 1, B1, records |
| Prototype of the B1 fix on HEAD, V14, V16, V39, V42, V05, V40, V13, W02 | remediation |
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` | 101 pass, 0 fail |
| `npm run lint` | 0 errors, 136 warnings |
| `node scripts/validate-vsix.cjs --source-only` | PASS, v6.0.12 |
| `npm run test:runner-coverage` | PASS, 752 test files, all claimed |
| `npm run test:citation-parity` | exit 0, 35 tracked plans |
| `npm run test:node` | 1066 pass, 2 fail, 18 skipped. Both failures are subtests of `bundled dependencies (C2 T5)` in `bundleDeps.test.cjs`, the known artefact of junction-linked worktrees |

No reproducible flake. One Playwright test timed out once, on a mutated build (W01), while about ten Playwright sessions were running at once: `openCard` waited five seconds for the card and did not find it. W01 was green in two reruns and the unmutated suite was green in all 240 tests, so I record it as a load artefact of my own rig and not as a flake of HEAD.

**Section 4 razor**, from the committed blobs with the TypeScript parser. Limits: function 40 lines, file 250 lines, nesting 3.

| File (added or modified against `origin/main`) | Lines | Longest function | Control nesting inside one function |
|---|---|---|---|
| `src/roadmap/ui/modules/integration-catalog-renderer.js` | 245 | `render` 38 | 2 |
| `src/roadmap/ui/modules/statewright-handoff.js` | 28 | none | 0 |
| `src/test/roadmap/statewright-handoff-source.test.ts` | 91 | suite callback 29 | 0 |
| `src/test/roadmap/statewright-handoff.test.ts` | 143 | `cardContract` 23 | 1 |
| `src/test/ui/statewright-handoff.spec.ts` | 209 | "other controls" callback 30; `readability` 27 | 1 |
| `.agent/staging/mutation-653/set3.cjs` to `set6.cjs` | 70, 59, 55, 55 | 7 | 3 (try, for, if at top level) |

No breach, under the convention the five earlier audits used. `readability()` holds one line of 178 characters (the backdrop logic); within the razor as measured, hard to review.

## CI status

`gh pr view 653 --json headRefOid`: `2132e5931d36a57bab8604efd00beae213fd5e8b`, equal to the audited commit; the PR is a draft and open. `gh pr checks 653`: 13 of 13 pass. At my first read 12 had passed and "Full Test Suite (test:all)" was pending; at my second it had passed in 14 m 19 s. I confirmed with `gh run view` that the "PR Full Test", "Cross-platform compile", "Repo Standards Enforcement" and "VSIX Proprietary Guardrails" runs carry `headSha` `2132e593...`. I made read-only requests only and triggered nothing.

## Observations for the owner (not part of the verdict)

Classes are the earlier auditors': plausible, plain deliberate, obfuscated, inherited from `main`, cosmetic.

- **O1. What the pin does not see (new; W01 plausible, the others plain deliberate or obfuscated).** The pin covers the text of the `STYLE` constant. It does not cover the line that builds the style element. W01 puts the fifth audit's V38 rule (one-line clamp at 1400 px and wider) in a second constant and changes `STYLE + STATEWRIGHT_STYLES` to `STYLE + WIDE + STATEWRIGHT_STYLES`: all 48 tests pass at HEAD (three runs; the first had the load timeout noted above). A developer who adds a block of responsive rules may well put them in their own constant, so I class W01 as plausible; a literal string, a second `<style>` element, `STYLE.replace(...)` and a decoy comment also pass and are deliberate. This is the same class the fifth audit closed for `STYLE` ("a rule conditional on a view no test samples"), one line further out. It can be closed in the source contract by pinning `ensureStyle()` as well (for example, exactly one `el.textContent = STYLE + STATEWRIGHT_STYLES;` and exactly one `createElement('style')`). I did not look for further routes; style sheets outside the two files remain, as the fifth auditor said.
- **O2. Plan wording.** The three sentences listed under "Records check".
- **O3. The no-scroll check refuses a card that is below the fold (maintenance note).** `main.content-area` is the page's scroller and is now a frame, so a line the reader could reach by scrolling counts as clipped. In the asserted views the text ends 409 px or 421 px down a 900 px viewport, so there is room. A legitimate future change that pushes the card below 900 px (a banner, more status text) will fail the five views until the test scrolls the page deliberately. X18 shows the effect.
- **O4. Below 525 px the unmutated card fails the same check (inherited from `main`).** Correctly: the layout cuts the address off. Not an asserted view.
- **O5. Frames are border boxes with a 1 px tolerance (cosmetic).** The list said padding boxes. A clip of up to the border width plus 1 px passes.
- **O6. Evidence scripts run without a network guard.** As documented (`node <script> FailSafe/extension`) they start Chromium with the repository's config, which has no resolver mapping, and Node with no DNS guard. Playwright routing fulfils page requests to the provider, but set 3 includes a mutant that adds a `preconnect` to `statewright.ai` (M02) and others that open sockets; I cannot exclude that a run as documented makes a real connection attempt to the provider. I ran them with the mapping and the guard; under the guard the committed scripts caused no lookup of the host. A resolver rule in the scripts would settle it.
- **O7. Records leftovers.** The #939 self-reference, the `Author: Judge` line of #943, the evidence labels and the stale script headers, all under "Records check".
- **O8. Inherited from `main`, restated by measurement.** Pegasus title contrast 1.02 (Statewright) and 1.02 (another card); the pill is 11.2 px, below the 12 px floor the test applies to the other three elements, at contrast 6.35; neither is measured by the test. The plan lists both.
- **O9. The digest assertion has no message.** When it fails it prints two hashes. The comment above it explains; a message string would put the explanation in the failure.
- **O10. Carried survivors, unchanged class:** obfuscated Y21, Y26, Y28; plain deliberate Y30, Y41; plain, boundary (a new render state omits the card) Z17, Z30; out of scope Y25, Z23; cosmetic or untouched code X15, X16; no rule item Z19; legitimate or equivalent Z26, Z27. The paint-level and overlap limits the fifth audit listed (V09 to V13, V15, V22, V30, V31, V36) now need an edit outside the pinned sheets to reach the page; inside `STYLE` the pin catches them.

**My opinion on the bounded scope.** I do not think the bounded scope was used to avoid a real problem: the shipped code is five lines of wiring and one static card, six reads of it have found no defect, and the open classes (deliberate or obfuscated edits, sheets outside the two files, new render states) are ones tests cannot close and a reviewer can see. Two things should be settled before the owner relies on that, both small: B1, and whether the pin's boundary in O1 is closed in the test or accepted in the plan, because the plan currently describes the pin as wider than it is. After that I would regard the remaining risk as appropriately carried by code review and the owner, and a seventh open-ended audit as poor value.

## Not verified

- `npm test` (vscode-test) and the full `test:all` gate locally. CI ran `test:all` on the exact commit and it passed.
- Behaviour of the readability test on Linux or macOS with other fonts, other than through CI's pass.
- The plan's installed-host table and the author's statement that rows were re-run. Performed outside the repository; not treated as false.
- That `https://statewright.ai/runs` exists, requires sign-in and shows runs and transition history. No request was made to the host.
- A fresh VSIX build and the packaging of `statewright-handoff.js` (only `validate-vsix --source-only`).
- Whether the evidence scripts, run as documented without my guard, contact the provider (O6). I did not run them unguarded.
- The author's mutants A01 to A07 against an auditor's definition: they have none; I ran the committed definitions.
- Which two of the five views fail for V16, V42, V05 and V40: the runner keeps only the start of each test title. My separate probe at 600 px shows the link's two lines outside the card's clip box, and the fifth audit measured the effect at 600 px.
- The real-browser effect of the 14 carried survivors; I re-ran them against the suites and rely on the earlier audits' probes.
- The absence of Content-Security-Policy and Referrer-Policy on the Console server. Carried from the earlier audits; not re-measured.

## State left behind

- `git status --short` in `C:\dev\mythologiq\FailSafe-653` prints nothing; HEAD is still `2132e5931d36a57bab8604efd00beae213fd5e8b`. I never built, wrote or mutated anything there. This report is the only file I added, under the gitignored `.agent/staging/`. The five earlier reports, the correction file and the evidence file are untouched (hashes above).
- I added one detached worktree under my temp directory and removed it with `git worktree remove`; `git worktree list` shows no entry of mine. I also ran `git worktree prune`, which removes only administrative entries whose directories no longer exist.
- The `node_modules` junctions in my nine exports and the worktree were unlinked with `rmdir` before the trees were deleted; the junction target still has its 505 entries.
- My scripts, the copied mutant definitions, results (`results-*.jsonl`, `table.md`), probe templates and output (`probe6.jsonl`, `probe6-narrow.jsonl`, `probe7.jsonl`), the two screenshots, logs and the reproduced evidence output (`committed-set3.log` to `committed-set6.log`) are in a new directory of my own, `C:\Users\krkna\AppData\Local\Temp\a653i6-i2QvG3`. I wrote nothing to and deleted nothing from the earlier auditors' directories; I read and copied `run.cjs`, `guard.cjs`, `validate.cjs`, `razor.cjs`, `z.cjs`, `p.cjs` and the two definition files from the fifth auditor's, and read its result files.
- The repository's Playwright config creates a disposable `failsafe-playwright-home-*` directory in the system temp folder on each run; those from my runs remain.
- Nothing was committed, pushed or posted. No workflow was triggered or re-run.

## Appendix: all 184 earlier mutants at HEAD

Columns "Fifth audit" and "Now" are failing-test counts source / jsdom / catalog / Playwright (of 5 then 6, 18, 9 and 15 tests). Playwright tests: T1 idle and claims, T2 keyboard, T3 mouse click, R readability (n of the five views), T5 other controls, T6 catalog failure, IC the older catalog spec. File: R renderer, H handoff module.

| ID | File | Mutation | Fifth audit: source/jsdom/catalog/Playwright | Now: source/jsdom/catalog/Playwright | Pin fails | Result now | Change |
|---|---|---|---|---|---|---|---|
| M01 | H | img beacon in card | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| M02 | H | link preconnect in card | 2/12/0/pass killed | 2/12/0/pass | no | killed |  |
| M03 | H | link prefetch of /runs | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| M04 | R | fetch statewright api in render() | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| M05 | H | hidden iframe of /runs | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| M06 | H | ping attribute on anchor | 2/18/0/FAIL 2 (T2+T3) killed | 2/18/0/FAIL 2 (T2+T3) | no | killed |  |
| M07 | H | utm query on href | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| M08 | R | click handler appends ?ws=<page URL> | 2/0/0/FAIL 2 (T2+T3) killed | 2/0/0/FAIL 2 (T2+T3) | no | killed |  |
| M09 | H | drop noreferrer | 2/12/0/FAIL 3 (T1+T2+T3) killed | 2/12/0/FAIL 3 (T1+T2+T3) | no | killed |  |
| M10 | H | drop target and noopener | 2/12/0/FAIL 3 (T1+T2+T3) killed | 2/12/0/FAIL 3 (T1+T2+T3) | no | killed |  |
| M11 | H | extra Connected pill (observed class) | 2/6/0/FAIL 2 (T1+T5) killed | 2/6/0/FAIL 2 (T1+T5) | no | killed |  |
| M12 | H | copy adds signed in/partner/synced | 2/6/0/FAIL 5 (R5of5) killed | 2/6/0/FAIL 5 (R5of5) | no | killed |  |
| M13 | H | card also carries cc-intcat-card | 2/6/1/FAIL 11 (IC+R5of5+T1+T2+T3+T5+T6) killed | 2/6/1/FAIL 11 (IC+R5of5+T1+T2+T3+T5+T6) | no | killed |  |
| M14 | R | header count +1 | 0/0/1/pass killed | 0/0/1/pass | no | killed |  |
| M15 | R | no handoff in fetch-failure markup | 1/6/0/FAIL 1 (T6) killed | 1/6/0/FAIL 1 (T6) | no | killed |  |
| M16 | R | handoff only when catalog non-empty | 0/6/0/pass killed | 0/6/0/pass | no | killed |  |
| M17 | R | window.open on render | 2/6/0/FAIL 4 (T1+T2+T3+T5) killed | 2/6/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| M18 | R | auto-click link 3 s after render | 1/6/0/FAIL 2 (T1+T5) killed | 1/6/0/FAIL 2 (T1+T5) | no | killed |  |
| M19 | H | Connect account button in card | 2/12/0/pass killed | 2/12/0/pass | no | killed |  |
| M20 | H | tabindex=-1 aria-hidden on anchor | 2/12/0/pass killed | 2/12/0/pass | no | killed |  |
| M21 | R | no handoff in loading markup | 1/3/0/pass killed | 1/3/0/pass | no | killed |  |
| M22 | R | other cards lose Docs link | 0/0/1/pass killed | 0/0/1/pass | no | killed |  |
| X01 | H | second (empty) anchor to statewright login in card | 2/12/0/pass killed | 2/12/0/pass | no | killed |  |
| X02 | H | onmouseover attribute rewrites href with page query | 2/18/0/FAIL 3 (T1+T3+T5) killed | 2/18/0/FAIL 3 (T1+T3+T5) | no | killed |  |
| X03 | H | rel gains opener token | 2/12/0/FAIL 1 (T1) killed | 2/12/0/FAIL 1 (T1) | no | killed |  |
| X04 | H | rel reordered (noreferrer noopener) [cosmetic control] | 2/12/0/FAIL 1 (T1) killed | 2/12/0/FAIL 1 (T1) | no | killed |  |
| X05 | H | meta refresh to /runs after the card | 2/12/0/pass killed | 2/12/0/pass | no | killed |  |
| X06 | R | base href statewright appended to head | 1/6/0/pass killed | 1/6/0/pass | no | killed |  |
| X07 | R | navigator.sendBeacon with page query in render() | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X08 | R | new Image() beacon with page query in constructor | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X09 | R | document mousedown listener rewrites href with page query (mouse click only) | 2/6/0/FAIL 2 (T3+T5) killed | 2/6/0/FAIL 2 (T3+T5) | no | killed |  |
| X10 | H | URL constant downgraded to http: | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X11 | H | URL constant changed to look-alike host | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/12/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X12 | R | WebSocket to statewright with page query in render() | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X13 | R | EventSource to statewright in render() | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X14 | R | handoff card injected twice (loaded state) | 1/9/0/FAIL 9 (R5of5+T1+T2+T3+T5) killed | 1/9/0/FAIL 9 (R5of5+T1+T2+T3+T5) | no | killed |  |
| X15 | R | disabled integration cards styled as configured | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| X16 | R | other cards: Configure button relabelled Connect | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| X17 | R | other cards: Configure click also opens Statewright | 2/0/0/FAIL 1 (T5) killed | 2/0/0/FAIL 1 (T5) | no | killed |  |
| X18 | R | handoff moved after the catalog sections | 0/2/0/pass killed | 0/2/0/FAIL 5 (R5of5) | no | killed |  |
| X19 | R | handoff wrapped inside a configured integration card | 0/6/1/FAIL 10 (IC+R5of5+T1+T2+T3+T5) killed | 0/6/1/FAIL 10 (IC+R5of5+T1+T2+T3+T5) | no | killed |  |
| X20 | H | visible address differs from the link | 2/6/0/FAIL 1 (T1) killed | 2/6/0/FAIL 1 (T1) | no | killed |  |
| X21 | H | style rule hides the disclaimer paragraph | 2/0/0/FAIL 6 (R5of5+T1) killed | 2/0/0/FAIL 6 (R5of5+T1) | no | killed |  |
| X22 | H | style ::after adds a visible "Connected" to the pill | 2/0/0/FAIL 1 (T1) killed | 2/0/0/FAIL 1 (T1) | no | killed |  |
| X23 | H | style ::after overlays the whole page with the link | 2/0/0/FAIL 4 (IC+T1+T5) killed | 2/0/0/FAIL 4 (IC+T1+T5) | no | killed |  |
| X24 | R | scheduler.postTask navigates the Console tab to /runs after 12 s | 2/0/0/pass killed | 2/0/0/pass | no | killed |  |
| X25 | R | click listener sends an extra beacon with page query | 2/0/0/FAIL 2 (T2+T3) killed | 2/0/0/FAIL 2 (T2+T3) | no | killed |  |
| X26 | R | hovering the card opens /runs (mouseover listener) | 2/6/0/FAIL 3 (T1+T3+T5) killed | 2/6/0/FAIL 3 (T1+T3+T5) | no | killed |  |
| X27 | R | window.open in the catalog-failure branch only | 2/4/0/FAIL 1 (T6) killed | 2/4/0/FAIL 1 (T6) | no | killed |  |
| X28 | R | same-tab location.assign to /runs at end of render() | 2/0/0/FAIL 14 (IC+R5of5+T1+T2+T3+T5) killed | 2/0/0/FAIL 14 (IC+R5of5+T1+T2+T3+T5) | no | killed |  |
| X29 | R | status line outside the card claims Statewright connected | 1/3/0/FAIL 1 (T1) killed | 1/3/0/FAIL 1 (T1) | no | killed |  |
| X30 | H | pill title/aria-label say Connected | 2/6/0/pass killed | 2/6/0/pass | no | killed |  |
| X31 | H | stylesheet background-image request to statewright | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| X32 | R | window.open on second and later render() calls | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| Y01 | R | computed global: window['op'+'en'](link.href) on render | 0/6/0/FAIL 4 (T1+T2+T3+T5) killed | 0/6/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y02 | R | alias: const w = window; w.open(link.href) on render | 1/6/0/FAIL 4 (T1+T2+T3+T5) killed | 1/6/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y03 | R | destructured alias: const { open: go } = window; go(link.href) | 0/6/0/FAIL 4 (T1+T2+T3+T5) killed | 0/6/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y04 | R | render(): detached <img> whose src is the link href (no provider name, no listed API) | 0/0/0/FAIL 4 (T1+T2+T3+T5) killed | 0/0/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y05 | R | Configure click also loads an <img> from the link href | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y06 | R | Configure click also clicks the Statewright link | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y07 | R | onEvent() loads an <img> from the link href on every hub event | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y08 | R | mixed-case inline handler onWheel on the wrapper (loaded state) loads an <img> from the link href | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y09 | R | container.setAttribute('onmousedown', ...) appends the page query to the link | 0/0/0/FAIL 2 (T3+T5) killed | 0/0/0/FAIL 2 (T3+T5) | no | killed |  |
| Y10 | R | container.setAttribute('oncontextmenu', ...) appends the page query to the link (right-click, copy link) | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y11 | H | handoff module, import time: computed addEventListener + handleEvent object rewrites the link on mousedown | 1/0/0/FAIL 2 (T3+T5) killed | 1/0/0/FAIL 2 (T3+T5) | no | killed |  |
| Y12 | H | handoff module, import time: plain statement loads an <img> from the provider | 1/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 1/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| Y13 | H | handoff module, import time: body.setAttribute('onwheel', ...) contacts the provider on scroll | 1/0/0/FAIL 1 (T5) killed | 1/0/0/FAIL 1 (T5) | no | killed |  |
| Y14 | R | renderer STYLE: section .cc-intcat-pill::after adds " · Connected" | 0/0/0/FAIL 1 (T1) killed | 1/0/0/FAIL 1 (T1) | yes | killed |  |
| Y15 | R | renderer STYLE: .cc-intcat-sub::after adds "Run history provider: connected, signed in." above the card | 0/0/0/FAIL 1 (T1) killed | 1/0/0/FAIL 1 (T1) | yes | killed |  |
| Y16 | R | renderer STYLE: .cc-intcat section p { opacity:0 } hides the disclaimer | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Y17 | H | card stylesheet: disclaimer colour changed to the card background colour (#a9b8cb -> #182332) | 2/0/0/FAIL 5 (R5of5) killed | 2/0/0/FAIL 5 (R5of5) | no | killed |  |
| Y18 | H | card stylesheet: disclaimer font-size typo .88rem -> .08rem | 2/0/0/FAIL 5 (R5of5) killed | 2/0/0/FAIL 5 (R5of5) | no | killed |  |
| Y19 | H | card stylesheet: disclaimer color:transparent | 2/0/0/FAIL 5 (R5of5) killed | 2/0/0/FAIL 5 (R5of5) | no | killed |  |
| Y20 | H | card stylesheet: disclaimer margin moves it off-screen (margin:0 0 10px -300vw) | 2/0/0/FAIL 5 (R5of5) killed | 2/0/0/FAIL 5 (R5of5) | no | killed |  |
| Y21 | R | error status line gains "State&shy;wright connected" (soft hyphen splits the name) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Y22 | R | loaded status line gains "Run history provider connected." | 0/3/0/pass killed | 0/3/0/pass | no | killed |  |
| Y23 | R | heading becomes "Integration Catalog · run history connected" in all three states | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y24 | R | render(): <img> to 'https://state'+'wright.ai/t?' + document.URL (split host name, workspace value) | 0/0/0/FAIL 4 (T1+T2+T3+T5) killed | 0/0/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y25 | R | render(): <img> to a different host carrying the page URL (workspace value) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Y26 | R | aliased requestIdleCallback loop clicks the link after 7 s | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Y27 | R | aliased setTimeout (const later = window.setTimeout) clicks the link after 6 s | 0/6/0/pass killed | 0/6/0/pass | no | killed |  |
| Y28 | R | Web Animations: link.animate([], 6000).finished then loads an <img> from the link href | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Y29 | R | render(): hidden <iframe> of the link href appended to the container | 0/3/0/FAIL 4 (T1+T2+T3+T5) killed | 0/3/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y30 | R | error state only: extra group label 'Connected · signed in' under the card | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Y31 | R | other cards: every Docs link retargeted to the Statewright link href after render | 0/1/1/pass killed | 0/1/1/pass | no | killed |  |
| Y32 | R | Reflect.apply(window.open, window, [link.href]) on render | 0/6/0/FAIL 4 (T1+T2+T3+T5) killed | 0/6/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y33 | R | optional call window.open?.(link.href) on render | 0/6/0/FAIL 4 (T1+T2+T3+T5) killed | 0/6/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y34 | R | aliased addEventListener (container[name]) on 'wheel' loads an <img> from the link href | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y35 | R | aliased addEventListener (container[name]) on 'contextmenu' appends the page query to the link | 0/3/0/FAIL 1 (T5) killed | 0/3/0/FAIL 1 (T5) | no | killed |  |
| Y36 | R | form.submit() to the link href in a new tab on render | 0/0/0/FAIL 4 (T1+T2+T3+T5) killed | 0/0/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y37 | R | render(): link href gains the page query (document.URL, no listed API) | 0/9/0/FAIL 4 (T1+T2+T3+T5) killed | 0/9/0/FAIL 4 (T1+T2+T3+T5) | no | killed |  |
| Y38 | R | renderer STYLE: .cc-intcat-actions a { pointer-events:none } makes the Statewright link (and Docs links) uncli | 0/0/0/FAIL 3 (T1+T3+T5) killed | 1/0/0/FAIL 3 (T1+T3+T5) | yes | killed |  |
| Y40 | R | Statewright card pill gains the observed status class after render (classList.add) | 0/3/0/pass killed | 0/3/0/pass | no | killed |  |
| Y41 | R | error state: status text 'Could not load integrations' replaced by 'Provider connected' (no name) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Y43 | H | card stylesheet: link colour equals its background (#f1efe7 -> #141a22), label unreadable | 2/0/0/FAIL 5 (R5of5) killed | 2/0/0/FAIL 5 (R5of5) | no | killed |  |
| Y44 | R | renderer STYLE: shared .cc-intcat-pill restyled green like a healthy status (colour only) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Y45 | H | handoff module, import time: document.title = 'Statewright: connected' | 1/0/0/FAIL 1 (T1) killed | 1/0/0/FAIL 1 (T1) | no | killed |  |
| Y46 | R | loaded state places STATEWRIGHT_HANDOFF.replace('Website handoff', 'Connected') | 0/3/0/FAIL 2 (T1+T5) killed | 0/3/0/FAIL 2 (T1+T5) | no | killed |  |
| Y47 | R | render counter: from the 6th render the Statewright pill text becomes "Connected" | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y48 | R | onEvent() sets the Statewright pill text to "Connected" on any hub event | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Y49 | R | Configure click also sets window.location to the link href (assignment form, same tab) | 0/0/0/FAIL 2 (IC+T5) killed | 0/0/0/FAIL 2 (IC+T5) | no | killed |  |
| Y50 | H | card stylesheet: link gets display:block and the card padding grows (harmless restyle, control) | 2/0/0/pass killed | 2/0/0/pass | no | killed |  |
| Y51 | H | card stylesheet: background gains image-set("https://statewright.ai/bg.png" 1x) (remote resource without url() | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) killed | 2/0/0/FAIL 5 (T1+T2+T3+T5+T6) | no | killed |  |
| Y52 | H | card stylesheet: visible address colour equals the card background (#7f8aa0 -> #111a25) | 2/0/0/FAIL 5 (R5of5) killed | 2/0/0/FAIL 5 (R5of5) | no | killed |  |
| Y53 | R | mixed-case inline handler onContextMenu on the wrapper (loaded state) appends the page query to the link | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Z01 | R | STYLE: .cc-intcat p { white-space:nowrap; overflow:hidden; text-overflow:ellipsis } (one-line summaries) | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z02 | R | STYLE: .cc-intcat p clamped to one line with -webkit-line-clamp | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z03 | R | STYLE: .cc-intcat p { max-height:1.3em; overflow:hidden } | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z04 | R | STYLE: .cc-intcat p { display:none } (control) | 0/0/0/FAIL 6 (R5of5+T1) killed | 1/0/0/FAIL 6 (R5of5+T1) | yes | killed |  |
| Z05 | R | STYLE: .cc-intcat-actions { display:none } (control) | 0/0/0/FAIL 12 (IC+R5of5+T1+T2+T3+T5+T6) killed | 1/0/0/FAIL 12 (IC+R5of5+T1+T2+T3+T5+T6) | yes | killed |  |
| Z06 | R | STYLE: .cc-intcat-actions stacked vertically (legitimate restyle, should pass) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Z07 | R | STYLE: .cc-intcat a { color:#5fb0d8 } (legitimate link colour, should pass) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Z08 | R | STYLE: .cc-intcat a { font-size:.7rem } (link shrinks to 11.2px) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z09 | R | STYLE: light-mode media rule lightens card backgrounds (.cc-intcat-card, .cc-intcat section) and darkens only  | 0/0/0/FAIL 3 (R3of5) killed | 1/0/0/FAIL 3 (R3of5) | yes | killed |  |
| Z10 | R | STYLE: .cc-intcat > section { background:#c9d4e2 } (card background lightened, text colours unchanged) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z11 | R | STYLE: .cc-intcat * { user-select:none } (address no longer selectable) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Z12 | R | STYLE: .cc-intcat section { max-height:0; overflow:hidden; padding:0; border:0 } (card collapsed) | 0/0/0/FAIL 9 (R5of5+T1+T2+T3+T5) killed | 1/0/0/FAIL 9 (R5of5+T1+T2+T3+T5) | yes | killed |  |
| Z13 | R | STYLE: .cc-intcat p { text-indent:-999em } | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z14 | R | STYLE: .cc-intcat-actions span truncated to 9ch with ellipsis (visible address cut) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z15 | R | STYLE: merged rule .cc-intcat-sub, .cc-intcat p { margin; font-size:.9rem; color } (legitimate refactor, shoul | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Z16 | R | STYLE: .cc-intcat becomes a card grid (legitimate layout restyle) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Z17 | R | render(): new HTTP 404 branch shows a message without the card | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Z18 | R | render(): new !res.ok branch shows a message without the card | 0/3/0/pass killed | 0/3/0/pass | no | killed |  |
| Z19 | R | wire(): selector broadened to '.cc-intcat-actions > *' (clicking the Statewright link also jumps to Settings) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Z20 | R | wire(): broadened selector and preventDefault (Statewright link dead; control) | 0/0/0/FAIL 2 (T2+T3) killed | 0/0/0/FAIL 2 (T2+T3) | no | killed |  |
| Z21 | R | render counter: card omitted from the loaded state from the 6th render on | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Z22 | R | render counter: card duplicated in the loaded state from the 6th render on | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| Z23 | R | esc() no longer escapes (other integrations; out-of-scope control) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Z24 | R | refactor: card placed inside the first category group instead of under the status line | 0/8/0/pass killed | 0/8/0/pass | no | killed |  |
| Z25 | R | render(): normalise external links to rel="noopener" (drops noreferrer from the Statewright link) | 0/6/0/FAIL 3 (T1+T2+T3) killed | 0/6/0/FAIL 3 (T1+T2+T3) | no | killed |  |
| Z26 | R | onEvent(evt) re-renders on 'integration.health' (legitimate behaviour, should pass) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Z27 | R | ensureStyle(): order swapped to STATEWRIGHT_STYLES + STYLE (equivalent today) | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Z28 | R | ensureStyle(): card styles no longer applied (identifier kept in a comment) | 0/0/0/FAIL 5 (R5of5) killed | 0/0/0/FAIL 5 (R5of5) | no | killed |  |
| Z29 | R | STYLE: .cc-intcat section { opacity:.35 } (ancestor opacity; control) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z30 | R | render(): AbortError branch in catch shows a message without the card | 0/0/0/pass SURVIVED | 0/0/0/pass | no | **SURVIVED** |  |
| Z31 | R | STYLE: @media (max-width:900px) hides section p (narrow-viewport-only hiding) | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| Z32 | R | STYLE: .cc-intcat p { color:rgba(169,184,203,.04) !important } (alpha is ignored by the contrast computation) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| Z33 | R | STYLE: .cc-intcat-pill-failing::before { content:"! " } (legitimate decoration of another state; does the whol | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| Z34 | R | STYLE: light-theme repair [data-theme="pegasus"] gives catalog cards and the section a white background and da | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| Z35 | R | STYLE: .cc-intcat p clamped to two lines (no effect at 1280px; cuts the disclaimer below about 1000px) | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| Z36 | R | onEvent(): pill text set to 'Connected' and a flag keeps it across re-renders | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| V01 | R | STYLE: .cc-intcat p clamped to three lines | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| V02 | R | STYLE: .cc-intcat p clamped to four lines (the disclaimer never exceeds four lines at the default font size) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V03 | R | STYLE: .cc-intcat p { max-height:4.2em; overflow:hidden } (three lines of height) | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| V04 | R | STYLE: .cc-intcat-actions > * one-line labels with ellipsis (min-width:0; nowrap; overflow hidden) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V05 | R | STYLE: .cc-intcat-actions { height:36px; overflow:hidden } (uniform action row; clips a wrapped link through a | 0/0/0/pass SURVIVED | 1/0/0/FAIL 2 (R2of5) | yes | killed | was SURVIVED |
| V06 | R | STYLE: .cc-intcat { font-size:0 } (whitespace-gap hack; the link uses font:inherit) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| V07 | R | STYLE: .cc-intcat-actions { line-height:0 } (gap hack; the link inherits it) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| V08 | R | STYLE: .cc-intcat p { letter-spacing:-.6em } (glyphs collapsed on each other) | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| V09 | R | STYLE: .cc-intcat p { clip-path:inset(0 0 100% 0) } | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V10 | R | STYLE: .cc-intcat p { -webkit-text-fill-color:transparent } | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V11 | R | STYLE: .cc-intcat p { filter:opacity(0) } | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V12 | R | STYLE: .cc-intcat p { mix-blend-mode:darken } | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V13 | R | STYLE: actions moved to the top-right corner of every catalog child (position:absolute); card summaries padded | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V14 | R | STYLE: actions moved to the top-right corner, positioning context given to .cc-intcat-card only | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/pass | yes | killed |  |
| V15 | R | STYLE: .cc-intcat-actions { margin-top:-18px } (link box overlaps the last disclaimer line) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V16 | R | STYLE: .cc-intcat > * { max-height:120px; overflow:hidden } (uniform card height) | 0/0/0/pass SURVIVED | 1/0/0/FAIL 2 (R2of5) | yes | killed | was SURVIVED |
| V17 | R | STYLE: .cc-intcat p { white-space:nowrap } (no overflow rule) | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| V18 | R | STYLE: .cc-intcat p { height:40px } (text overflows onto the action row) | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| V19 | R | STYLE: @media (max-width:480px) two-line clamp on .cc-intcat p (below the narrow test view) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V20 | R | STYLE: @media (min-width:700px) and (max-width:1100px) two-line clamp (between the two test widths) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V21 | R | STYLE: @media (max-height:800px) one-line clamp (the readability views are 900px tall) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V22 | R | STYLE: .cc-intcat { zoom:.8 } (denser catalog; computed font sizes unchanged) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V23 | R | STYLE: container query (max-width:700px) two-line clamp | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| V24 | R | STYLE: theme-token repair: cards and the section take var(--bg-panel); only .cc-intcat-card text takes var(--t | 0/0/0/FAIL 2 (R2of5) killed | 1/0/0/FAIL 2 (R2of5) | yes | killed |  |
| V25 | R | STYLE: glass cards in the Atmosphere theme only (an untested theme): translucent white background, dark text f | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V26 | R | STYLE: @media print white cards, dark text for .cc-intcat-card only | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V27 | R | STYLE: .cc-intcat-actions gets a faint translucent strip rgba(255,255,255,.03) (legitimate restyle, should pas | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| V28 | R | STYLE: .cc-intcat { max-height:70vh; overflow:auto } (scrolling catalog; legitimate, should pass) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V29 | R | STYLE: .cc-intcat > * { content-visibility:auto } (rendering optimisation; legitimate, should pass) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V30 | R | STYLE: .cc-intcat a:hover { color:#141a22 } (link label equals its background while hovered) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V31 | R | STYLE: .cc-intcat p::first-line { color:transparent } | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V32 | R | STYLE: .cc-intcat a { color:oklch(0.95 0.01 90) } (near-white link in a modern colour space; legitimate, shoul | 0/0/0/FAIL 5 (R5of5) killed | 1/0/0/FAIL 5 (R5of5) | yes | killed |  |
| V33 | R | render(): error state escapes the card by accident (esc(STATEWRIGHT_HANDOFF)) | 0/6/0/FAIL 1 (T6) killed | 0/6/0/FAIL 1 (T6) | no | killed |  |
| V34 | R | render(): loaded state wraps the card and sections in a closed <details> | 0/6/0/FAIL 13 (IC+R5of5+T1+T2+T3+T5) killed | 0/6/0/FAIL 13 (IC+R5of5+T1+T2+T3+T5) | no | killed |  |
| V35 | R | render(): the ensureStyle() call is dropped (no catalog or card styles are injected) | 0/0/0/FAIL 6 (R5of5+T1) killed | 0/0/0/FAIL 6 (R5of5+T1) | no | killed |  |
| V36 | R | error state only: wrapper gets a dimming class (.cc-intcat-error { opacity:.45 }) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V37 | R | STYLE: sticky heading and status line with an opaque background (legitimate, should pass) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V38 | R | STYLE: @media (min-width:1400px) one-line clamp with max-width:60ch (media range above every view) | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |
| V39 | R | STYLE: .cc-intcat > * { max-height:100px; overflow:hidden } (card clips its own content; the disclaimer loses  | 0/0/0/pass SURVIVED | 1/0/0/FAIL 5 (R5of5) | yes | killed | was SURVIVED |
| V40 | R | STYLE: .cc-intcat-actions { height:36px; overflow:clip } (as V05 but not scrollable by script) | 0/0/0/pass SURVIVED | 1/0/0/FAIL 2 (R2of5) | yes | killed | was SURVIVED |
| V41 | R | onEvent() appends the page address to the link href (repaired by the next render; checks the href read after t | 0/0/0/FAIL 1 (T5) killed | 0/0/0/FAIL 1 (T5) | no | killed |  |
| V42 | R | STYLE: .cc-intcat > * { max-height:120px; overflow:auto } (cards scroll inside; the link is below the fold of  | 0/0/0/pass SURVIVED | 1/0/0/FAIL 2 (R2of5) | yes | killed | was SURVIVED |
| A08 | R | author A08 as described in the evidence file: .cc-intcat p { color:rgba(169,184,203,.15) } in the renderer sty | 0/0/0/pass SURVIVED | 1/0/0/pass | yes | killed | was SURVIVED |

Totals: 184 run, 170 killed, 14 survive. "Pin fails" is yes for exactly the 66 mutants that change the text of the renderer's STYLE constant.
