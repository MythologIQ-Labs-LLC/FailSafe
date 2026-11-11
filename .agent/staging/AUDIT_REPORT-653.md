# AUDIT REPORT: PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit), no authorship of the change
- **Date:** 2026-11-10
- **Target:** `MythologIQ-Labs-LLC/FailSafe` PR #653 (draft), branch `feat/652-statewright-website-handoff`
- **Exact source audited:** `1fd4a557466b10b990264c5543fda1077233da03` (PR `headRefOid` matches)
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`
- **Plan:** `.failsafe/governance/plans/plan-v6013-statewright-652-website-first.md` (iteration 1)
- **Diff:** 4 files, +124 / -3 (plan, `integration-catalog-renderer.js`, jsdom test, Playwright spec)

## Verdict: VETO

Three blocking findings. The shipped code itself is small, static and behaves as scoped in every case I
exercised; the VETO is for one absolute repository-standard breach and for two plan falsification items
that no test enforces (demonstrated by surviving mutations).

## Risk grade: L2

User-facing external navigation to a third-party site plus product-truth copy about that third party.
No credential handling, no data egress by FailSafe, no backend, schema or dependency change, so not L3.
Not L1 because the card introduces a new third-party destination in a governed product surface and the
negative requirements (no automatic contact, no false status) are the whole value of the change.

## Blocking findings

### B1. Section 4 razor: touched source file exceeds the 250-line file cap

Evidence:

```
git show 1fd4a557:FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js | wc -l   -> 264
git show origin/main:FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js | wc -l -> 243
```

`AGENTS.md:15` and `.github/PULL_REQUEST_TEMPLATE.md:29` state the limit as absolute (40 lines/function,
250 lines/file, nesting <= 3). The file was compliant on main (243) and this change takes it to 264. No
script or CI job enforces the cap (`grep` of `scripts/`, `.eslintrc.cjs`, workflows found none), which is
why CI is green. The plan does not disclose or request acceptance of razor debt.

Other razor measurements at the exact commit (all pass): `render()` spans lines 191-228 (38 lines),
`card()` 150-176 (27), nesting in `render()` is 2. New test bodies: jsdom #652 test 25 lines, Playwright
#652 test 32 lines. Test files are 192 and 188 lines.

Required remediation: bring the file to <= 250 lines, for example by moving `STATEWRIGHT_STYLES` and
`STATEWRIGHT_HANDOFF` (or the existing `STYLE` block) into a sibling module under
`src/roadmap/ui/modules/`. Constraint: eleven contract documents cite
`integration-catalog-renderer.js:196` for the `fetch('/api/v1/integrations/catalog')` call, which is at
line 197 in both base and head, and FX1003 tolerates 3 lines. One added import line keeps it in range;
anything larger needs the citations re-pointed. Re-run `node --test src/test/docs/integration-contracts.test.cjs`.

### B2. Plan falsification item 1 has no test that fails: automatic navigation and automatic provider contact on render go undetected

Plan: "Fail if navigation begins on render without an operator click or if any remote Statewright API
call is made." Mutations that violate it and pass both the jsdom suite and the Playwright spec:

| Mutation | jsdom | Playwright |
|---|---|---|
| M17 `window.open('https://statewright.ai/runs','_blank','noopener')` at the end of `render()` | pass | pass |
| M18 `setTimeout(() => link.click(), 3000)` at the end of `render()` | pass | pass |
| M02 `<link rel="preconnect" href="https://statewright.ai">` in the card | pass | pass |
| M06 `ping="https://statewright.ai/track"` on the anchor (extra click-time POST) | pass | pass |

I confirmed M17 and M18 are real violations and not blocked by the browser, using a scratch Playwright
probe against the real Console helper with `statewright.ai` mapped to 127.0.0.1:

```
baseline exit=0 PROBE pages=1 pageLevelRequests=[] contextLevelRequests=[]
M17      exit=0 PROBE pages=4 pageLevelRequests=[] contextLevelRequests=["https://statewright.ai/runs" x3]
M18      exit=0 PROBE pages=1 pageLevelRequests=[] contextLevelRequests=["https://statewright.ai/runs" x3]
```

Root cause in `src/test/ui/integrations-catalog.spec.ts`: the listener is `page.on('request')`, which
only sees requests of the Console page. A popup or auto-clicked new tab is a different page, so its
requests never reach `providerRequests`. The spec also never asserts that the context has exactly one
page before the click, and never inspects requests after the click. The jsdom test only records calls
to the injected global `fetch`, so it cannot see `window.open`, element-initiated loads or `ping`.
(M01 image, M03 prefetch, M05 iframe and M04 fetch are caught.)

Required remediation: in the Playwright spec, record provider requests at context level
(`page.context().on('request')`), assert `page.context().pages().length === 1` after render and after a
short settle, assert exactly one provider request (`GET https://statewright.ai/runs`) after the click,
and assert the anchor has no `ping` attribute. In jsdom, assert the handoff contains no
`link`, `img`, `iframe`, `script`, `form` or `[ping]` elements and that `window.open` was not called.
Re-run M02, M06, M17, M18 and show them red.

### B3. Plan falsification item 3 has no test that fails: a false connected status, authenticated claim or partnership claim goes undetected

Plan: "Fail if the card claims connected, live data, local history, approval enforcement, installed
credential or active subscription." Surviving mutations:

| Mutation | jsdom | Playwright |
|---|---|---|
| M11 add `<span class="cc-intcat-pill cc-intcat-pill-observed">Connected</span>` to the card head | pass | pass |
| M12 append "Signed in. Official Statewright partner: live run data is synced." to the copy | pass | pass |
| M19 add `<button class="cc-intcat-btn" data-id="statewright">Connect account</button>` | pass | pass |

Root cause: the jsdom negative assertion is vacuous. It checks
`handoff.querySelector('.cc-intcat-pill-connected') === null`, but that class does not exist anywhere in
the renderer (`grep -c "pill-connected"` on the head file returns 0). The real status classes are
`cc-intcat-pill-configured|needs|disabled|observed|failing|stale`; the "connected" state renders with
`cc-intcat-pill-observed`. The copy assertions are positive substring matches only, so added claims pass.
The control check is limited to `.cc-intcat-configure`.

Required remediation: assert the card contains exactly one pill, whose class list is exactly
`cc-intcat-pill` and whose text is exactly `Website handoff`; assert the card's full normalized text
equals the approved copy (or a deny-list covering connected, signed in, authenticated, synced, live,
partner, subscription, enforced); assert the card contains no `button`, `input` or `form` and exactly one
anchor. Re-run M11, M12, M19 and show them red.

## Non-blocking findings

- **N1. Silent no-op in embedded VS Code surfaces.** The installed VS Code 1.145.3 Simple Browser hosts
  pages in `<iframe sandbox="allow-scripts allow-forms allow-same-origin allow-downloads">` (read from
  `resources/app/extensions/simple-browser/dist/extension.js`): no `allow-popups`, so a `target="_blank"`
  anchor does nothing and shows no error. The repository already documents the same for the sidebar
  webview iframe (`src/roadmap/ui/modules/console-nav.js:1-6`). FailSafe itself does not put this renderer
  there: `IntegrationCatalogRenderer` is imported only by `command-center.js`; the full Console is opened
  with `vscode.env.openExternal` (`src/extension/commands.ts:102`), while the sidebar iframe and
  `simpleBrowser.show` (`commands.ts:136`) load `?ui=compact` (`index.html`). So the dead click needs an
  operator who opens the Console URL inside Simple Browser manually. The existing "Docs" links have the
  same behaviour. Recommend showing the URL as visible, copyable text in the card, and recording the
  limitation in the installed-host acceptance the plan already requires.
- **N2. Empty-catalog path is untested.** M16 (render the handoff only when `integrations.length > 0`)
  survives both suites. An HTTP 500 with a JSON error body takes this path, not the `catch`. The shipped
  code is correct here (see probe table below); only the test is missing.
- **N3. Keyboard accessibility is untested.** M20 (`tabindex="-1" aria-hidden="true"` on the anchor)
  survives. Issue #652 acceptance 2 asks for keyboard focus; plan step 4 promises "accessible link
  properties".
- **N4. Loading state is untested.** M21 (drop the handoff from the "Loading" markup) survives. Low value.
- **N5. Inconsistent placement.** The card sits above the status line in the loading and error states
  and below it in the loaded state, so it shifts when the catalog arrives.
- **N6. No documentation or contract for a first-class integration entry.** No row in
  `docs/architecture/INTEGRATION_PORTFOLIO.md`, no contract under `docs/architecture/integrations/`, no
  `docs/FEATURE_INDEX.md` update (FX839 still describes the sub-view without it), no CHANGELOG entry. The
  FX1003 expected set is built from `INTEGRATION_CATALOG` and network scans, so a static anchor is outside
  it by construction; the suite still passes (101/101) and nothing in it is made false. The #532 standard
  is one contract per integration, and the card labels itself "Statewright AI website integration".
- **N7. Ordering inversion.** Implementation and tests are committed on the branch (`c495aedd` onwards)
  while the plan header says /qor-plan and /qor-audit are pending. Declared in the plan and the PR is a
  draft, but it is implement-before-audit.
- **N8. Copy asserts facts about a third-party site that I could not verify.** "View your workflow runs
  and transition history on Statewright's website" and the `/runs` path are taken from issue #652
  ("provider's documented `/runs` page"). I made no request to statewright.ai, as instructed.
- **N9. Pre-existing, not introduced here.** No CSP, `Referrer-Policy` or other security headers on the
  Console server (`grep` for `setHeader|helmet|Referrer-Policy` in `src/roadmap` found only an audio
  content type). `render()` throws and stays on "Loading" when `integrations` is not an array or contains
  `null`; the handoff link is still present in both cases. The jsdom `suite` and Playwright `describe`
  callbacks were already longer than 40 lines on main (58 and 49) and are now 88 and 81.

## What I checked and found sound

- **Scope.** The diff contains only what the plan lists. No fetch, adapter, credential, setting,
  telemetry, sync, dependency, backend or schema change. `INTEGRATION_CATALOG` is untouched.
- **Injection.** `STATEWRIGHT_HANDOFF` and `STATEWRIGHT_STYLES` are static literals with no
  interpolation. The error text beside the card is escaped (`esc(err)`); a hostile error message rendered
  as text in my probe with zero `img/script/iframe` elements created.
- **Tabnabbing and referrer.** `rel="noopener noreferrer"` is present and both suites fail when either
  token is dropped (M09, M10). This matters here: the Console URL carries `?workspace=<path>&ui=console`
  (`commands.ts:71-75`), and `noreferrer` keeps it out of the `Referer` header.
- **No identifiers in the URL.** Exact `href` equality in jsdom and exact `waitForURL` in Playwright
  catch a static query string (M07) and a click-time rewrite that appends the page URL (M08).
- **Other integrations unchanged.** Card counts, header counts and existing links are guarded (M13, M14,
  M22 all fail). The new CSS selectors are unique (`.cc-intcat-statewright`, `.cc-intcat-web-link`). The
  `const` declarations after the class are only read inside methods, so there is no TDZ fault.
- **Catalog unavailable.** Probe of a scratch copy of the head renderer under jsdom:

  | Case | Statewright links | Status line | Threw |
  |---|---|---|---|
  | fetch rejects | 1 | Could not load integrations: TypeError | no |
  | non-JSON body | 1 | Could not load integrations: SyntaxError | no |
  | HTTP 500, JSON error body | 1 | No catalog integrations available. | no |
  | HTTP 500, HTML body | 1 | Could not load integrations: SyntaxError | no |
  | empty list | 1 | No catalog integrations available. | no |
  | null body | 1 | No catalog integrations available. | no |
  | never resolves | 1 | Loading | no |
  | `integrations` is an object / contains null (pre-existing) | 1 | Loading | TypeError |

- **FX1003 comment is accurate.** `src/test/docs/integration-contracts.test.cjs` resolves every
  `path:L` citation within 3 lines; eleven contracts cite line 196 of this file and the fetch is at 197 in
  both base and head. Appending the constants after the class is what keeps that true.
- **Packaging.** `scripts/bundle.cjs:135-138` copies `src/roadmap/ui` to `dist/extension/ui`;
  `.vscodeignore` excludes `src/**` and `out/**` and ships `dist`; `*.test.ts` is excluded and the spec
  lives under `src/`. No orphan file, no new dependency. No guardrail enumerates catalog UI strings beyond
  `integration-claims.test.cjs` F7, which still passes.
- **Truthfulness.** The shipped copy makes no partnership, enforcement, connection or data claim, and
  states that FailSafe does not read Statewright history or enforce Statewright workflows.

## Mutation table

Each mutation was applied to the working copy of `integration-catalog-renderer.js`, both focused suites
were run, and the file was restored. Playwright ran with `statewright.ai` mapped to 127.0.0.1.

| ID | Mutation | jsdom suite | Playwright spec | Result |
|---|---|---|---|---|
| M01 | 1x1 `<img>` beacon to statewright.ai in the card | pass | FAIL (#652) | killed |
| M02 | `<link rel="preconnect">` to statewright.ai | pass | pass | **SURVIVED** |
| M03 | `<link rel="prefetch">` of `/runs` | pass | FAIL (#652) | killed |
| M04 | `fetch('https://statewright.ai/api/health')` in `render()` | FAIL (#652) | FAIL (#652) | killed |
| M05 | hidden `<iframe>` of `/runs` | pass | FAIL (#652) | killed |
| M06 | `ping` attribute on the anchor | pass | pass | **SURVIVED** |
| M07 | `?utm_source=failsafe` on the href | FAIL (#652, fetch-failure) | FAIL (#652) | killed |
| M08 | click handler appends `?ws=<page URL>` | pass | FAIL (#652) | killed |
| M09 | drop `noreferrer` | FAIL (#652) | FAIL (#652) | killed |
| M10 | drop `target` and `noopener` | FAIL (#652) | FAIL (#652) | killed |
| M11 | extra "Connected" pill with the real observed class | pass | pass | **SURVIVED** |
| M12 | copy adds signed in, official partner, live data synced | pass | pass | **SURVIVED** |
| M13 | card also carries `cc-intcat-card` (inflates count) | FAIL (2 tests) | FAIL (2 tests) | killed |
| M14 | header count `integrations.length + 1` | FAIL (#479 header counts) | pass | killed |
| M15 | no handoff in the fetch-failure markup | FAIL (fetch-failure) | pass | killed |
| M16 | handoff only when the catalog is non-empty | pass | pass | **SURVIVED** |
| M17 | `window.open` of `/runs` on render | pass | pass | **SURVIVED** |
| M18 | auto-click of the link 3 s after render | pass | pass | **SURVIVED** |
| M19 | "Connect account" button in the card | pass | pass | **SURVIVED** |
| M20 | `tabindex="-1" aria-hidden="true"` on the anchor | pass | pass | **SURVIVED** |
| M21 | no handoff in the loading markup | pass | pass | **SURVIVED** |
| M22 | other cards lose their Docs link | FAIL (#479 SARIF docs link) | pass | killed |

12 killed, 10 survived. M02 is recorded as survived on the test result only; I did not verify that
Chromium opens a connection for a `preconnect` link inserted through `innerHTML`.

## Tests I ran (Node 22.23.4, Windows, exact commit)

| Command | Result |
|---|---|
| `npm run compile` (tsc + copy-ui-js) | exit 0 |
| `node node_modules/mocha/bin/mocha.js --ui tdd out/test/roadmap/integration-catalog-renderer.test.js` | 10 passing |
| `node node_modules/@playwright/test/cli.js test src/test/ui/integrations-catalog.spec.ts` | 6 passed |
| same spec with the offline host mapping config | 6 passed |
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` | 101 pass, 0 fail |
| 22 mutations x (jsdom suite + Playwright spec) | table above |
| scratch jsdom probe of catalog-unavailable cases | table above |
| scratch Playwright probe of M17 / M18 | output in B2 |

PR check rollup read through `gh pr view 653` showed the listed checks as SUCCESS on the same head; I
did not re-run `test:all`.

## What I could not verify

- Behaviour in an installed VSIX in VS Code or Cursor, and in Cursor's or VS Code's integrated browser.
  The Simple Browser result in N1 is from reading the installed extension's sandbox attribute, not from a
  click test.
- That `https://statewright.ai/runs` exists, is owned by Statewright, requires sign-in, and shows runs
  and transition history. No request was made to that host.
- That Chromium acts on M02's `preconnect`.
- The full `test:all` gate and VSIX build on this machine (not run); packaging was assessed by reading
  `bundle.cjs` and `.vscodeignore`, not by building a VSIX.
- A complete read of GitHub's check list: the rollup output I captured was truncated after ten entries.

## State left behind

- `git status --short` shows only ` M .qor/session/current` (pre-existing). The renderer was restored
  after every mutation and `git diff --quiet HEAD -- FailSafe` is clean.
- `FailSafe/extension/out/` now exists from `npm run compile`; it is gitignored build output.
- This report is the only file added (under the gitignored `.agent/`).
- Nothing was committed, pushed or posted.
