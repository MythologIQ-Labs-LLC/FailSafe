# Plan: Shadow Genome node accessible name carries severity (#242 follow-up)

## Context

`#242`'s accessibility audit (Tranche "populated-fixture Shadow Genome rendered walkthrough", comment 2026-08-23T22:23:46Z) found a static-code accessible-name/parity gap: `shadow-genome-graph.js`'s `nodeSvg()` builds each failure node's accessible name as `aria-label="failure: {label}"` and `<title>{label} (failure)</title>` — severity (`active`/`repeated`/`emerging`/`remediated`/`informational`) is never included in either. Severity is instead conveyed only through the node's `stroke` color, set via an inline `style=` attribute.

The accessible Table-view fallback (`buildTable()`) already includes a "Severity" column, and the inspector drawer (`buildInspector()`) already surfaces severity as visible text via its `sg-drawer-head sg-sev-{severity}` class plus the drawer subtitle. So this is not a total color-only violation of #242's "status is never communicated only by color" acceptance criterion — but it is a real accessible-name/parity gap in the primary Genome Map graph view itself: a screen-reader user, or a forced-colors/high-contrast user, browsing the graph (without switching to Table view or selecting the node to open the drawer) has no way to learn a failure node's severity from the node itself.

That prior audit pass could not attempt a rendered-browser confirmation in its own sandbox (Playwright's pinned Chromium revision `1208` was unavailable; only `1194` was installed, and pointing `executablePath` at the installed `1194` binary got the browser to launch but the app's Governance tab panel never became visible — reproduced identically against the unmodified `shadow-genome-tab.spec.ts` baseline, so a sandbox/tooling limitation, not a regression). This session hit the identical mismatch (`browsers.json` in this `@playwright/test@1.58.1` install also pins revision `1208`; only `1194`/`chromium_headless_shell-1194` are present under `PLAYWRIGHT_BROWSERS_PATH`), and confirmed the same baseline-reproduces-too limitation directly: pointing `launchOptions.executablePath` at `chromium-1194` gets the browser to launch, but `shadow-genome-tab.spec.ts`'s existing (unmodified) `Genome Map — accessibility` spec still times out waiting for `#governance` to become visible after the tab click — on current, unmodified `main`, with no product code touched. This confirms the earlier disclosure rather than being a new finding.

## Non-Goals

- No change to how severity is color-coded (`stroke`/gradient); the fix is additive to the accessible name only.
- No change to the Table view or inspector drawer, which already surface severity as text.
- No attempt to fix the Playwright/Chromium sandbox version mismatch — that is an environment/tooling gap orthogonal to this product fix, already disclosed against `#392`/`#191`/`#194`/this same `#242` thread.
- No broadening into a full Shadow Genome rendered walkthrough (governance-dashboard fixture population, screen-reader manual review) — those remain the other named-outstanding `#242` slices.

## Phase 1: Include severity in the failure-node accessible name

### Affected Files

- `src/roadmap/ui/modules/shadow-genome-graph.js` — `nodeSvg(n, p, deg, sev, sel, nb)`: append `, severity {sv}` to the `aria-label` when `n.type === 'failure'`. Governance and "other"-type nodes are unaffected (they have no severity concept). An unclassified failure node (present in `graph.nodes` but absent from the `sev` map — e.g. no matching `incidents[].id`) reads `severity unclassified` rather than silently omitting the suffix or emitting `severity undefined`.

### Changes

`sev` (a `Map<nodeId, severityString>`, built by `renderGenomeMode` from `d.incidents`) is already threaded into `nodeSvg` and used to pick the node's `stroke`/gradient color (`sv === 'active' ? 'red' : ...`). The fix reads the same already-available `sv` value a second time to build a text suffix, with no new data plumbing. `esc()` (already used on every other interpolated value in this function) is applied to the severity string for consistency, even though the five known severity values are all attacker-controlled-input-free enum-like strings today — defense in depth against a future free-text severity value costs nothing here.

### Unit Tests

Full rendered/browser verification is blocked by the disclosed sandbox limitation above (same class as `#242`'s own prior disclosed blocker on this exact file). Per this repo's evidence-first rule ("no product diff without a reproduced defect, and schema/unit tests alone can't close a rendered-UI claim" — `#367`'s own precedent), the defect itself was reproduced deterministically instead, without a browser: `renderGenomeMode`/`nodeSvg` are pure, DOM-write-only functions (`esc()`'s only DOM dependency is `document.createElement('div')`/`.textContent`/`.innerHTML`, which JSDOM provides identically to a real browser). A new JSDOM-backed test, following the existing `shadow-genome-maturity.test.ts` pattern in the same directory:

- `src/test/roadmap/shadow-genome-graph-severity.test.ts` (new) — renders a fixture graph (one governance node, two failure nodes — one with a matching `incidents[]` severity, one without — and one non-governance/non-failure node) via the real exported `renderGenomeMode`, then asserts via string/DOM inspection that: the classified failure node's `aria-label` ends `, severity active`; the unclassified failure node's ends `, severity unclassified`; the governance and "other" nodes' `aria-label`s are unchanged (no severity suffix at all). A companion case runs the identical fixture against the pre-fix behavior description (stashed/diffed manually during this session, not committed as a test) to confirm the assertion fails on the pre-fix code — confirming the test is load-bearing, not tautological.

This does not supersede the still-outstanding rendered-verification need (a working Playwright/Chromium pairing is required to visually confirm the SVG attribute reaches a real accessibility tree) — carried forward as the same disclosed limitation, not resolved by this plan.

## CI Commands

- `npx tsc -p . --noEmit`
- `npm run lint` (`eslint src --ext ts` — the repo's own lint script scopes to `.ts` only, so `shadow-genome-graph.js` is out of its scope by convention, same as every other `.js` UI module; confirmed 0 errors, no new warnings)
- `npm run compile && npx mocha --ui tdd out/test/roadmap/shadow-genome-graph-severity.test.js` (this sandbox has no `vscode-test` extension host — same disclosed limitation as FX930-934; exact-head CI's `npm test` job is the authoritative full-suite gate)
- `node scripts/check-test-runner-coverage.cjs`
- `node scripts/check-plan-citation-parity.cjs --structure-only`
