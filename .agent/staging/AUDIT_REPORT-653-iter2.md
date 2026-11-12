# AUDIT REPORT (iteration 2, re-audit after VETO #938): PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit). No authorship of the change, the remediation or the previous audit.
- **Date:** 2026-11-10
- **Exact source audited:** `dd766c159d6e5d1a64f4470d8c4f053f11821dba` (`git rev-parse HEAD` in the worktree)
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`
- **Previously audited source:** `1fd4a557466b10b990264c5543fda1077233da03` (VETO, ledger entry #938)
- **Plan:** `.failsafe/governance/plans/plan-v6013-statewright-652-website-first.md`, iteration 2 (LF sha256 `ed26bcbb75380258a935fbe34d941c9ba5333c989abd9382644ebc5054689f97`)
- **Environment:** Windows 11, Node 22.23.4, Playwright Chromium, `statewright.ai` mapped to a local TCP sink. No request was made to the real host.

## Verdict: VETO

The three findings of the previous audit are closed as written, and all 22 of its mutants are now killed.
I found no defect in the shipped source: it is static, makes no provider call, carries no identifier and
claims no connection.

The VETO rests on the rule given for this re-audit: a surviving mutant that breaks a required negative or a
plan falsification item is blocking. Of 32 new mutants, 11 survive both suites. Seven of those break a
required negative, and I confirmed each one does so in Chromium (not merely that the tests stay green).
They fall into two findings, R1 and R2 below. One of them (R1, mouse activation) is coverage the iteration 1
Playwright spec had and the remediation removed.

If the Governor does not accept "surviving mutant = blocking" as the bar, the alternative reading is: source
sound, original findings closed, residual test gaps. That is a governance decision, not mine; under the rule
I was given the verdict is VETO.

## Risk grade: L2

Unchanged. User-facing navigation to a third-party site and product-truth copy about that third party. No
credential handling, no data egress by FailSafe, no backend, schema or dependency change, so not L3.

## Status of the previous blocking findings

| Finding | Status | Evidence |
|---|---|---|
| B1 file over 250 lines | **Closed** | `integration-catalog-renderer.js` is 245 lines at HEAD (243 on main, 264 at `1fd4a557`). New `statewright-handoff.js` is 28 lines with no functions. `render()` is 38 lines, nesting 2. |
| B2 no failing test for navigation or provider contact without a click | **Closed as written; residual gap R1** | M02, M06, M17, M18 are killed (table below). The context-level route does observe script-opened popups: with M17 my probe recorded three `https://statewright.ai/runs` requests in the route and zero connections at the sink. |
| B3 no failing test for a false connection claim | **Closed as written; residual gap R2** | M11, M12, M19 are killed by exact card text, exact pill class and the no-control assertion. |

## Blocking findings

### R1. A workspace value can be sent to Statewright, and Statewright can be contacted or opened without a click, with both suites green

Required negatives broken: "no automatic calls to Statewright", "no credentials, workspace information or
identifiers transmitted", and plan falsification item 1. Surviving mutants, each confirmed in Chromium with a
scratch probe against the real Console server (page loaded as `?workspace=secret-workspace`):

| ID | Mutation | jsdom | Playwright | What the probe observed |
|---|---|---|---|---|
| X09 | `document.addEventListener('mousedown', …)` in the constructor rewrites the link href | 22 pass | 7 pass | A mouse click opened `https://statewright.ai/runs?ws=%3Fworkspace%3Dsecret-workspace` |
| X12 | `new WebSocket('wss://statewright.ai/live?w=' + location.search)` in `render()` | 22 pass | 7 pass | 6 TLS connections with `statewright` in the ClientHello reached the sink on render; the route array stayed empty. In the jsdom run the DNS guard logged 22 lookups of the provider host while all tests passed |
| X26 | `mouseover` listener on the container opens `/runs` | 22 pass | 7 pass | Hovering the card opened a second page and one provider request, no click |
| X24 | `scheduler.postTask(() => location.assign('https://statewright.ai/runs'), { delay: 12000 })` | 22 pass | 7 pass | After 14 s the Console tab itself was at `https://statewright.ai/runs` |

Root causes:

1. **Mouse activation is no longer tested.** `statewright-handoff.spec.ts` activates the link only with
   `link.focus()` plus Enter. The iteration 1 spec clicked the link and waited for the exact URL, which would
   have failed X09. This is the usual way an operator opens the link, and it is the path where a workspace
   value leaks.
2. **Neither harness sees WebSocket traffic.** `context.route` does not intercept WebSockets, and the jsdom
   harness records only `fetch`, `window.open`, timers and `HTMLElement.prototype.click`.
3. **Neither harness sees event listeners or non-timer scheduling.** jsdom never dispatches pointer events,
   and its timer stub covers `setTimeout`, `setInterval` and `requestAnimationFrame` only. The Playwright
   idle window is 4 s and the second test has no idle window.

X24 needs deliberately evasive code and no finite idle wait can exclude every delay; I list it for
completeness and would not veto on it alone. X09 and X12 are the substance: plain listeners and a plain
constructor.

Required remediation (any equivalent that turns X09, X12 and X26 red):

- Playwright: add a mouse activation (`link.click()`), then require the popup URL and the single provider
  request to equal `https://statewright.ai/runs` exactly. Hover the card before the idle assertion. Add
  `context.routeWebSocket` for the provider host (or stub `WebSocket` in an init script) and require zero.
- jsdom: record `WebSocket`, `EventSource`, `Image`, `navigator.sendBeacon` and `location.assign/replace`
  on the fake window, and dispatch `mousedown`, `mouseover` and `click` on the link, then re-assert the href.
- Cheapest general guard: a source-level test that the renderer and the handoff module contain no
  `statewright` reference beyond the import and the constants, and that the renderer registers no listener
  other than the existing Configure click. That one test kills X09, X12, X24, X26 and X17.

### R2. A false "Connected" status can be shown for Statewright with both suites green

Required negative broken: "no false connected or authenticated status", and plan falsification item 3.

| ID | Mutation | jsdom | Playwright | What the probe observed |
|---|---|---|---|---|
| X22 | Style rule `.cc-intcat-statewright .cc-intcat-pill::after { content:" - Connected" }` | 22 pass | 7 pass | `getComputedStyle(pill, '::after').content` = `" - Connected"`; the pill reads "Website handoff - Connected" |
| X29 | Status line above the card gains "Statewright: connected, run history synced." | 22 pass | 7 pass | That text is rendered in `.cc-intcat-sub`, directly above the card |
| X30 | Pill gains `title="Connected: signed in" aria-label="Connected"` | 22 pass | 7 pass | Attributes present; a screen reader announces "Connected" |

Root causes: text assertions use `textContent`, which excludes generated content, and `STATEWRIGHT_STYLES`
is asserted nowhere. Exact-attribute checks cover the card and the link but not the pill or the other
descendants. The exact-text check covers the card only, while `statewrightRefs` scans attributes, not text,
outside it.

Required remediation: assert `STATEWRIGHT_STYLES` contains no `content:` and no `url(` (or pin the constant
by equality); in Playwright assert `::before`/`::after` content is `none` on the pill and the link and that
the disclaimer paragraph is visible; assert the attributes of every descendant of the card, not two
elements; assert no text node outside the card mentions Statewright.

## Non-blocking findings

- **N1. Vacuous assertion left in place.** `integration-catalog-renderer.test.ts` still asserts
  `querySelector('.cc-intcat-pill-connected') === null`; that class does not exist in the renderer. The new
  suite covers the case properly, so this is noise, but it is the assertion B3 named.
- **N2. Pre-existing function-length overage made worse.** The first `suite` callback in
  `integration-catalog-renderer.test.ts` was 58 lines on main and is 88 at HEAD (+30, all from this change).
  What this change added there is itself within limits (one 24-line test, five lines in another). The #652
  test in that file is now redundant with `statewright-handoff.test.ts`; moving or deleting it would return
  the file to its main state, as was done for the Playwright spec.
- **N3. Disclaimer can be hidden.** X21 (`.cc-intcat-statewright p { display:none }`) survives; the probe
  confirmed the paragraph is not visible. No false claim is made, so not blocking, but the truthful copy is
  the point of the card. Closed by the visibility assertion in R2.
- **N4. Other integrations: coverage gaps in unchanged code.** X15 (disabled cards styled as configured),
  X16 (Configure relabelled "Connect") and X17 (Configure click also opens Statewright; probe saw one new
  page and one provider request) survive. `card()` and `wire()` are byte-identical to main in this change,
  so falsification item 4 holds for the diff; the gap predates it.
- **N5. Loaded-state placement is guarded in jsdom only by one state.** X18 (card after the sections) fails
  one jsdom test and no Playwright test. Killed, thin.
- **N6. Keyboard test is programmatic focus.** Playwright uses `link.focus()`, so M20 (`tabindex="-1"`,
  `aria-hidden`) is killed only by the jsdom exact-attribute check. Tab order is not exercised.
- **N7. Plan inaccuracies.** (a) "The cited catalog fetch moves from line 196 to 198": the fetch is at 197 on
  main and 198 at HEAD; eleven contract documents cite 196, so the drift is 2 and inside the 3-line
  tolerance. (b) "The run is repeated on the remediated source": no evidence for `dd766c15` is in the
  repository; the installed-host paragraph covers `1fd4a557` only. (c) "Existing full CI 13/13": the PR head
  on GitHub is still `1fd4a557`; the remediation has not been through CI.
- **N8. Timer stub in the extension host.** `statewright-handoff.test.ts` replaces the process-wide
  `setTimeout`/`setInterval` with a counting no-op across an `await`. Under plain mocha this is stable. The
  file also runs under `vscode-test` (`out/test/**/*.test.js`), where any host timer scheduled in that
  window is dropped and counted, which could make the test flaky. Not observed; not run (see below).
- **N9. Changelog wording.** "opens Statewright's Run History website in your browser" is true for a normal
  browser tab. In an embedded surface without `allow-popups` the link does nothing; the visible address
  added in this iteration is the mitigation. The entry is identical in both changelogs, sits under
  `## [Unreleased]` / `### Added`, is under the 1200-character note limit and has no placeholder word.
- **N10. Carried from the previous audit, unchanged.** No portfolio or contract document for the card
  (plan now states this as a decision); no CSP or `Referrer-Policy` on the Console server; copy states
  third-party facts I could not check.

## What I checked and found sound

- **Scope.** Source diff against main is the import, `STYLE + STATEWRIGHT_STYLES`, three markup insertions,
  one new 28-line module, tests, and one changelog bullet in each changelog. No adapter, fetch, credential,
  setting, telemetry, sync, dependency or schema change. `791235d0` touches only governance files (ledger,
  the previous report, gate files, session marker). The ledger content hash for entry #938 matches the
  previous report (`56527ea7…`).
- **Injection.** Both constants are static template literals whose only interpolation is the URL constant.
  The visible-address span is that same constant.
- **Tabnabbing and referrer.** `target="_blank" rel="noopener noreferrer"`; the Playwright test asserts
  `window.opener === null` and `referer === undefined` on the one provider request. M09, M10 and X03 fail.
- **`user-select:all`** on the address span only changes selection behaviour.
- **Section 4 razor**, measured from git objects with the TypeScript parser:

  | File | Lines | Longest function | Max nesting |
  |---|---|---|---|
  | `integration-catalog-renderer.js` | 245 | `render` 38 | 2 |
  | `statewright-handoff.js` | 28 | none | 0 |
  | `statewright-handoff.test.ts` | 99 | `suite` callback 33 | 1 per function, 2 lexical |
  | `statewright-handoff.spec.ts` | 78 | test callback 34 | 1 |
  | `integration-catalog-renderer.test.ts` | 192 | `suite` callback 88 (58 on main), added test 24 | 1 |

  `src/test/ui/integrations-catalog.spec.ts` is byte-identical to main (blob `2a75d9fa` on both).
- **Packaging.** `scripts/bundle.cjs` copies `src/roadmap/ui` recursively to `dist/extension/ui`;
  `.vscodeignore` ships `dist`. `command-center.html` loads `command-center.js` as `type="module"`, which
  imports the renderer, which imports `./statewright-handoff.js`. The Playwright suite loads it that way
  from the real ConsoleServer with no bundler step. An existing `dist` copy matches the source apart from
  line endings.
- **Test honesty.** Selectors match (baseline green, mutants red). The context route sees anchor-opened and
  script-opened popups. The jsdom timer and click stubs count calls, so they fail rather than hide a use.
  The blind spots are the ones listed in R1 and R2.

## Mutation table

Applied one at a time to the working copy, `copy-ui-js` re-run, both jsdom files (22 tests) and both
Playwright specs (7 tests) run, files restored with `git checkout`. Cell = failing tests.

### The 22 mutants of the previous audit

| ID | Mutation | jsdom | Playwright | Result |
|---|---|---|---|---|
| M01 | 1x1 `<img>` beacon in the card | 12 | 2 | killed |
| M02 | `<link rel="preconnect">` | 12 | 0 | killed (was SURVIVED). No sink connection: Chromium did not act on it |
| M03 | `<link rel="prefetch">` of `/runs` | 12 | 2 | killed |
| M04 | `fetch` of a provider URL in `render()` | 7 | 2 | killed |
| M05 | hidden `<iframe>` of `/runs` | 12 | 2 | killed |
| M06 | `ping` on the anchor | 12 | 1 | killed (was SURVIVED) |
| M07 | `?utm_source=failsafe` on the href | 8 | 2 | killed |
| M08 | click handler appends `?ws=<page URL>` | 0 | 1 | killed, Playwright only |
| M09 | drop `noreferrer` | 7 | 1 | killed |
| M10 | drop `target` and `noopener` | 7 | 1 | killed |
| M11 | extra "Connected" pill, real status class | 6 | 1 | killed (was SURVIVED) |
| M12 | copy adds signed in, partner, synced | 6 | 0 | killed (was SURVIVED), jsdom only |
| M13 | card also carries `cc-intcat-card` | 8 | 3 | killed |
| M14 | header count + 1 | 1 | 0 | killed |
| M15 | no handoff in the fetch-failure markup | 5 | 1 | killed |
| M16 | handoff only when the catalog is non-empty | 4 | 0 | killed (was SURVIVED) |
| M17 | `window.open` of `/runs` on render | 3 | 1 | killed (was SURVIVED) |
| M18 | auto-click of the link after 3 s | 3 | 1 | killed (was SURVIVED) |
| M19 | "Connect account" button in the card | 12 | 0 | killed (was SURVIVED), jsdom only |
| M20 | `tabindex="-1" aria-hidden="true"` | 6 | 0 | killed (was SURVIVED), jsdom only |
| M21 | no handoff in the loading markup | 2 | 0 | killed (was SURVIVED) |
| M22 | other cards lose their Docs link | 1 | 0 | killed |

22 of 22 killed.

### 32 new mutants

| ID | Mutation | jsdom | Playwright | Result |
|---|---|---|---|---|
| X01 | second, empty anchor to the provider login | 12 | 0 | killed |
| X02 | `onmouseover` attribute rewrites the href | 12 | 0 | killed |
| X03 | `rel` gains `opener` | 7 | 1 | killed |
| X04 | `rel` reordered (control, harmless) | 6 | 1 | killed (tests are stricter than needed) |
| X05 | `<meta http-equiv="refresh">` to `/runs` | 6 | 0 | killed, jsdom only |
| X06 | `<base href>` to the provider in `<head>` | 6 | 0 | killed, jsdom only |
| X07 | `navigator.sendBeacon` with the page query in `render()` | 0 | 2 | killed, Playwright only |
| X08 | `new Image()` beacon in the constructor | 0 | 2 | killed, Playwright only |
| X09 | `mousedown` listener rewrites the href with the page query | 0 | 0 | **SURVIVED, blocking (R1)** |
| X10 | URL constant changed to `http:` | 8 | 2 | killed |
| X11 | URL constant changed to a look-alike host | 8 | 2 | killed |
| X12 | `WebSocket` to the provider with the page query in `render()` | 0 | 0 | **SURVIVED, blocking (R1)** |
| X13 | `EventSource` to the provider in `render()` | 0 | 2 | killed, Playwright only |
| X14 | card injected twice | 6 | 1 | killed |
| X15 | disabled cards styled as configured | 0 | 0 | SURVIVED, non-blocking (N4, unchanged code) |
| X16 | Configure relabelled "Connect" | 0 | 0 | SURVIVED, non-blocking (N4, unchanged code) |
| X17 | Configure click also opens Statewright | 0 | 0 | SURVIVED, non-blocking (N4, unchanged code) |
| X18 | card moved after the catalog sections | 1 | 0 | killed |
| X19 | card wrapped inside an integration card | 5 | 2 | killed |
| X20 | visible address differs from the link | 6 | 1 | killed |
| X21 | style rule hides the disclaimer | 0 | 0 | SURVIVED, non-blocking (N3) |
| X22 | `::after` adds "Connected" to the pill | 0 | 0 | **SURVIVED, blocking (R2)** |
| X23 | `::after` overlays the page with the link | 0 | 2 | killed, by the older spec only |
| X24 | `scheduler.postTask` navigates the tab after 12 s | 0 | 0 | **SURVIVED, blocking by rule (R1)**, evasive |
| X25 | click listener sends an extra beacon | 0 | 1 | killed |
| X26 | hovering the card opens `/runs` | 0 | 0 | **SURVIVED, blocking (R1)** |
| X27 | `window.open` in the catalog-failure branch | 2 | 1 | killed |
| X28 | same-tab `location.assign` at the end of `render()` | 0 | 6 | killed, Playwright only |
| X29 | status line claims Statewright connected | 0 | 0 | **SURVIVED, blocking (R2)** |
| X30 | pill `title`/`aria-label` say Connected | 0 | 0 | **SURVIVED, blocking (R2)** |
| X31 | stylesheet `background:url(provider)` | 0 | 2 | killed, Playwright only |
| X32 | `window.open` on the second and later `render()` | 0 | 2 | killed, Playwright only |

21 killed, 11 survived: 7 blocking, 4 non-blocking.

## Tests run at the exact commit

| Command | Result |
|---|---|
| `npm run compile` | exit 0 |
| mocha, `statewright-handoff.test.js` + `integration-catalog-renderer.test.js` | 22 passing |
| Playwright, `statewright-handoff.spec.ts` + `integrations-catalog.spec.ts` | 7 passed, 0 sink connections |
| 54 mutants x both suites | tables above |
| Chromium probe of BASE, M17, X05, X09, X12, X17, X21, X22, X24, X26, X29, X30 | results quoted in R1, R2, N3, N4 |
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` | 101 pass, 0 fail |
| `npm run lint` | 0 errors, 136 warnings, none in the changed files |
| `node scripts/validate-vsix.cjs --source-only` | PASS, v6.0.12 |
| `npm run test:runner-coverage` | PASS, 751 files all claimed |
| `npm run test:citation-parity` | PASS |
| `npm run test:node` | 1067 pass, 1 fail, 18 skipped. The failure is `bundleDeps.test.cjs`, the known junction artefact |

## What I could not verify

- `npm test` (vscode-test) and the full `test:all` gate on `dd766c15`; see N8.
- CI on `dd766c15`. `gh pr view 653` (read-only) shows 13 checks SUCCESS on head `1fd4a557`; the
  remediation is not pushed.
- Installed-VSIX behaviour in VS Code or Cursor for the remediated source, and the plan's 14-of-14
  installed-host claim for `1fd4a557`.
- That `https://statewright.ai/runs` exists, needs sign-in and shows runs and transition history.
- A fresh VSIX build. Packaging was assessed from `bundle.cjs`, `.vscodeignore` and an existing `dist` copy.
- Whether X15, X16 and X17 also survive on main; I infer it from `card()` and `wire()` being unchanged.

## State left behind

- `git status --short` shows ` M .qor/gates/2026-11-10T2349-6c3050/plan.json` and
  ` M .qor/gates/2026-11-10T2349-6c3050/plan.provenance`. Both were already modified when I started (the
  iteration 2 plan gate, uncommitted) and `git diff HEAD | sha256sum` is the same before and after my work
  (`ca4e5a82…`). Note this differs from the expected ` M .qor/session/current`.
- `git diff --quiet HEAD -- FailSafe CHANGELOG.md` is clean. Every mutation was restored.
- Two temporary untracked files I created under `FailSafe/extension` (`pw.audit.config.ts`,
  `src/test/ui/zz-audit-probe.spec.ts`) are deleted. `out/` and `test-results/` are gitignored build output.
- This report is the only file added (under the gitignored `.agent/`). `AUDIT_REPORT-653.md` is untouched.
- Nothing was committed, pushed or posted.
