# Plan: B-B199-2 — Replay + Genome behavioral E2E (current-surface scope)

**change_class**: feature

**doc_tier**: standard

**terms_introduced**: (none — new test files only)

**boundaries**:
- limitations:
  - Tests target the CURRENT replay.js + genome.js UI surfaces. Timeline scrubbing, snapshot diff content rendering, and time-travel state restoration mentioned in the original B-B199-2 description are **future features (B146-B149)** not present in the shipped UI; this cycle does NOT add them. The backlog entry will be amended to reflect the actual scope shipped.
  - Tests mock `/api/v1/runs`, `/api/v1/runs/:id`, and `/api/v1/genome` via Playwright's `page.route()`. The real handlers are exercised by mocha unit tests; this cycle covers UI rendering against fixtures, not route-handler logic.
  - WebSocket-driven re-render assertions verify that the renderer's `onEvent()` method is invoked and DOM updates; they do not require a live WS connection (Playwright stubs the event).
- non_goals:
  - Adding new replay or genome features.
  - Backend test coverage of /api/v1/runs / /api/v1/genome handlers (covered by mocha).
- exclusions:
  - B-B199-1 (Brainstorm behavioral E2E) — separate cluster.
  - B146-B149 marquee replay features (timeline scrub, time-travel, snapshot diff).

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX535 | NEW | `FailSafe/extension/src/test/ui/replay-tab.spec.ts` | ReplayRenderer behavioral E2E: empty state, list view with active+completed runs, click-to-detail navigation, step kind badges + diff stats, governance card render, back button, agentRun WS event triggers re-render |
| FX536 | NEW | `FailSafe/extension/src/test/ui/genome-tab.spec.ts` | GenomeRenderer behavioral E2E: empty-pattern state, pattern-card render with mode colors, show-all toggle, unresolved-entries table, all-resolved empty state, failureArchived WS event triggers re-render |

## Open Questions

(All resolved in cycle-2 plan after the cycle-1 VETO; listed for traceability.)

1. **WS-driven re-render assertion mechanism**: Verified via grep — no `window.failsafe*` global exists. ReplayRenderer/GenomeRenderer are constructed inside `command-center.js` module scope (lines 29-30) and accessed via `renderers.agents.onEvent(evt)` (line 77 — TabGroup wrapper propagates to all sub-renderers per `tab-group.js:58`). Resolution: add a single-line test-only global at the end of `command-center.js init`: `globalThis.__failsafeRenderers = renderers;` Playwright specs then use `page.evaluate(() => window.__failsafeRenderers.agents.onEvent({type: 'agentRun'}))` which TabGroup propagates to ReplayRenderer (no-op for unrelated sub-renderers like Operations/Timeline).
2. **page.route() glob**: existing UI specs (`voice-pack.spec.ts:54,64,97,106`, `monitor.spec.ts:30,60`) use `**/api/...` prefix. Bare `/api/v1/runs` would silently fail. All routes in FX535/FX536 use `**/api/v1/runs`, `**/api/v1/runs/*`, `**/api/v1/genome` prefixes. More-specific route registered AFTER catch-all per Playwright last-match-wins semantics.
3. **Tests do NOT cover**: the `decision.mitigation` field on governance cards (FX535.6 fixture omits it intentionally — happy-path is enough for current cycle); the unresolved-rows slice(0,20) cap (FX536.5 fixture has 3 entries — overflow case deferred). Both flagged for follow-up if real-world bugs surface.

## Phase 0: Test-only renderer global

### Affected Files

- `FailSafe/extension/src/roadmap/ui/command-center.js` — add a single line at the end of the init function (after `renderers` is constructed): `if (typeof globalThis !== 'undefined') globalThis.__failsafeRenderers = renderers;`. Benign in production (the property is namespaced under `__failsafe*`); load-bearing for FX535.8 + FX536.6 WS-trigger assertions. No production behavior change.

### Changes

```js
// At end of init(), after renderers map is constructed and client.on() handlers registered:
if (typeof globalThis !== 'undefined') {
  globalThis.__failsafeRenderers = renderers;
}
```

### Unit Tests

Covered by FX535.8 + FX536.6 (consumers of the global).

## Phase 1: Replay-tab Playwright spec (FX535)

### Affected Files

- `FailSafe/extension/src/test/ui/replay-tab.spec.ts` — NEW. Playwright spec exercising ReplayRenderer through real DOM. Uses `serveConsoleServerUI` for harness; `page.route()` intercepts `/api/v1/runs` + `/api/v1/runs/:id` to inject test fixtures. Navigates the page to the Agents tab → Replay sub-pill and drives the renderer.

### Changes

Spec structure (8 cases):

1. **FX535.1 — empty state**: `page.route('**/api/v1/runs', returns {active:[], completed:[]})`; navigate to Agents→Replay; assert `'No agent runs recorded'` text visible.
2. **FX535.2 — list view: active + completed sections**: fixture with 2 active + 3 completed; assert section headers contain `'Active Runs (2)'` and `'Recent Runs (3)'`; assert 5 `.cc-replay-run` cards present.
3. **FX535.3 — completed cap at 20**: fixture with 1 active + 25 completed; assert exactly 20 completed cards rendered (slice limit).
4. **FX535.4 — click run card → detail view**: fixture run id `'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'` (valid UUID matching `AgentApiRoute.ts:10` pattern); `page.route('**/api/v1/runs/aaaaaaaa-*', returns {run: {id, steps: [3 steps]}})` registered AFTER the list route so Playwright's last-match-wins semantics route specific URLs correctly; click card; assert `.cc-replay-back` visible + 3 step blocks rendered.
5. **FX535.5 — step kind badge + diff stats**: detail-view fixture with step `{kind: 'file_edit', diffStats: {additions: 12, deletions: 4}}`; assert badge text contains `'file_edit'`; assert `+12` and `-4` text present.
6. **FX535.6 — governance decision card**: detail-view fixture with step `{governanceDecision: {action: 'BLOCK', riskCategory: 'security', confidence: 0.87}}`; assert action badge `'BLOCK'` visible; `'security'` text present; `'87%'` text present.
7. **FX535.7 — back button returns to list**: navigate to detail (via FX535.4 fixtures); click `.cc-replay-back`; assert list-view section header re-visible.
8. **FX535.8 — agentRun WS event triggers re-render**: navigate to list (initial fetch); via `page.evaluate(() => window.__failsafeRenderers.agents.onEvent({type: 'agentRun'}))` trigger the TabGroup-wrapped event (propagates to ReplayRenderer per `tab-group.js:58`); count `**/api/v1/runs` requests via `let count=0; page.route(..., (route) => { count++; route.fulfill(...); })`; assert `count === 2` (initial + post-event).

### Unit Tests

See above — Playwright spec itself.

## Phase 2: Genome-tab Playwright spec (FX536)

### Affected Files

- `FailSafe/extension/src/test/ui/genome-tab.spec.ts` — NEW. Mirror of Phase 1 structure but for GenomeRenderer.

### Changes

Spec structure (6 cases):

1. **FX536.1 — empty pattern state (unresolved-only mode)**: `page.route('**/api/v1/genome', returns {patterns: [], allPatterns: [], unresolved: []})`; navigate to Agents→Genome; assert `'No failure patterns'` visible + body text `'No unresolved failure patterns.'`.
2. **FX536.2 — pattern cards render with mode colors**: fixture with 3 patterns `[{failureMode: 'COMPLEXITY_VIOLATION', count: 5, component: 'foo.ts'}, {failureMode: 'SECURITY_STUB', count: 1, component: 'bar.ts'}, {failureMode: 'HALLUCINATION', count: 8, component: 'baz.ts'}]`; assert 3 `.cc-card` elements present in `.cc-grid-4`; each contains the failureMode label + count.
3. **FX536.3 — show-all toggle switches between filtered + all**: fixture with `patterns: [1 entry]`, `allPatterns: [3 entries]`; assert initial render shows 1 card; click `.cc-genome-toggle`; assert 3 cards now visible.
4. **FX536.4 — pattern-card count cap at 12**: fixture with `allPatterns: [15 entries]`; toggle to show-all; assert exactly 12 cards rendered (slice limit).
5. **FX536.5 — unresolved entries table renders rows**: fixture with `unresolved: [3 entries with mixed remediationStatus]`; assert `'Unresolved Entries (3)'` header; assert 3 rows present in the bordered card; assert status colors match `unresolved → red`, `investigating → gold`, `mitigated → green` via inline-style assertion.
6. **FX536.6 — failureArchived WS event triggers re-render**: navigate to genome (initial fetch); via `page.evaluate(() => window.__failsafeRenderers.agents.onEvent({type: 'genome.failureArchived'}))`; count `**/api/v1/genome` requests via Playwright counter; assert exactly 2 requests after the synthesized event.

### Unit Tests

See above — Playwright spec itself.

## Phase 3: BACKLOG amendment

### Affected Files

- `docs/BACKLOG.md` — amend B-B199-2 entry:
  - Mark as `[x]` closed for the CURRENT-SURFACE scope.
  - Add note that B146-B149 future-feature E2E (timeline scrub, time-travel, snapshot diff) opens a new follow-up item if/when those features ship.

### Changes

Replace B-B199-2 line with:
```
- [x] **[B-B199-2] (v5.2.0-baseline — Complete via plan-qor-b199-2-replay-genome-e2e)** Agents Replay + Genome behavioral E2E (current surface): ReplayRenderer list/detail/empty/step-kind/diff-stats/governance-card/back/WS-agentRun → FX535 (8 cases); GenomeRenderer pattern-cards/show-all-toggle/empty/unresolved-table/WS-failureArchived → FX536 (6 cases). NOTE: marquee future features (timeline scrubbing, time-travel state restoration, snapshot diff rendering, B146-B149) NOT present in current UI; new E2E item will open when those ship.
```

## CI Commands

- `cd FailSafe/extension && npm run compile` — TypeScript builds without errors
- `cd FailSafe/extension && npm run lint` — no new lint violations
- `cd FailSafe/extension && npx playwright test src/test/ui/replay-tab.spec.ts src/test/ui/genome-tab.spec.ts` — both new specs green (target: 14 passing)
- `cd FailSafe/extension && npm run test:ui` — full Playwright suite green (80 existing + 14 new = 94 passing)
