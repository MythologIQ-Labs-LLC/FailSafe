# Plan: B199 Phase 2 — Playwright Settings tab E2E + B-EM-4 harness unblocker

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: B199 (Phase 2 of multi-cycle effort)
**target_version**: v5.2.x

**Review boundary**: stage artifacts only; push when sealed (operator-authorized pattern).

## Scope discipline

B199 is CRITICAL and multi-cycle. Phase 1 (Entries #283/#284) shipped methodology + Monitor compact-UI E2E + release-class CI gate. **This cycle ships Phase 2 only.**

Operator argument flagged B-EM-4 (`serveConsoleServerUI` /api/hub override hook) as a potential blocker. Investigation confirms: Settings cards live in **Command Center** (`command-center.html` → `command-center.js`), which bootstraps via `/api/hub` fetch — NOT via the WS `init` payload that the Monitor compact UI consumes. The harness currently injects hub state via init only, so Command Center tests see the real-server hub built from fake managers (no `voicePackInstalled`, no `governanceModeState`, etc.).

**Decision**: bundle B-EM-4 harness unblocker in this same cycle as Phase 2's enabling substrate. B-EM-4 IS Playwright infrastructure — adding the override hook costs ~20 lines and unblocks not just this cycle's Settings cards but all future Command Center sub-tab E2E (Phase 3+). Doing it separately would mean a Phase-2 prep cycle that ships zero coverage.

**Out of scope**: Phase 3+ (Brainstorm, agents, integrations sub-tabs, etc.).

## Decision Log

| Decision | Confidence | Evidence |
|---|---|---|
| Include B-EM-4 harness fix in this cycle | high | Operator hint anticipated scope-down; without B-EM-4 there's no path to Settings E2E. Combining = one cycle delivers both unblocker + coverage. |
| Target the 4 newest Settings cards for E2E (Voice Pack / Bicameral / Governance Mode Transitions / qor-logic floor warning) | high | Per `feedback_e2e_before_claim_closed.md`, these 4 shipped in B194/B195/B197 with JSDOM-only proof — strongest leverage for new coverage. |
| Skip the older Settings cards (Theme, Configuration, QorLogic Skills, Notifications, Brainstorm, Voice Settings) | medium | They've existed for many cycles without E2E and aren't on B199 Phase 2's critical path. Defer to Phase 3+. |
| Reuse `serveConsoleServerUI` fixture; add `/api/hub` override middleware that fires when `fixtures.initialHub` is set | high | Existing pattern; one Express middleware addition. Test files opt in by passing `initialHub`. |

## Infrastructure Citation Inventory

1. **`serveConsoleServerUI` at `src/test/ui/helpers/serveConsoleServerUI.ts`** — currently injects hub via WS `init` only (line 159-164 wsm.setup); does NOT intercept `/api/hub`. Verified.
2. **Express app from `server.app`** — accessible via `(server as unknown as { app: Application }).app` (existing pattern at line 256). New middleware mount: `app.get('/api/hub', (req, res) => ...)` BEFORE `start()` is called, or use `app.use` ordering.
3. **Existing Settings cards location**: `src/roadmap/ui/modules/settings.js` renders them; each sub-card module lives at `src/roadmap/ui/modules/{voice-pack,bicameral,...}-settings-card.js`.
4. **B194 governance-mode card render slot**: `#cc-mode-banner` lives in compact UI (`index.html`); the Command Center-side surface is the Mode Transitions feed in Governance tab. The Settings card Phase 2 covers is the existing `renderGovernanceModeCard` at `settings.js:234` (consumes `hub.governanceModeState`).

## Phase 1: B-EM-4 harness override hook

### Architecture correction (cycle-1 audit findings)

The original plan proposed `app.get('/api/hub', ...)` registered after `ConsoleRouteRegistrar.setupAllRoutes()` (which runs in the `ConsoleServer` constructor). **Express is first-match-wins on `app.get`**, so a later registration is dead code. The audit-verified correct approach uses `app.use` middleware mounted before `attachWebSocket`. Middleware runs in registration order and CAN short-circuit by responding without calling `next()` — Express checks middleware functions BEFORE consulting the router stack for a given request path.

### Affected files
- `src/test/ui/helpers/serveConsoleServerUI.ts` — add a middleware mounted AFTER `applyPrivateCast` and BEFORE `attachWebSocket`:
  ```ts
  const app = (server as unknown as { app: Application }).app;
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.path === '/api/hub' && hubRef.current) {
      res.json(hubRef.current);
      return;
    }
    next();
  });
  ```
  Notes: Hub state comes from `hubRef.current` which is mutated by `setHub()`. Middleware fires PER REQUEST so live updates via `setHub` are immediately reflected on the next `/api/hub` GET. When `hubRef.current` is null/undefined (no `initialHub` passed), the middleware calls `next()` and the real handler fires — preserves back-compat for tests not opting in.
- **No production code changes** — harness-only fix.

### Unit tests
- `src/test/ui/helpers/serveConsoleServerUI.test.ts` (NEW): 3 mocha cases (SG-035 invoke + assert):
  1. With `fixtures.initialHub: { version: 'override-test' }` → fetch `/api/hub` returns body containing `version: 'override-test'` (not the real-server build).
  2. Without `initialHub` → fetch `/api/hub` returns the real server-built hub (existing `version` field, real `bootstrapState` shape).
  3. After `controller.setHub({ version: 'updated' })` → subsequent fetch returns `version: 'updated'`. (Asserts middleware reads `hubRef.current` per-request.)

## Phase 2: Playwright Settings card E2E spec

### Scope (cycle-1 audit findings applied)

Original plan had 7 cases including bicameral autoConnect — but the existing `integrations-bicameral.spec.ts` reaches that surface via dedicated `/api/integrations/bicameral/status` route + stub client, NOT `/api/hub` override. **Bicameral autoConnect is out of scope for this cycle** — its surface is already covered by FX490. The `.skip` hedge on Voice Pack installed is also removed: `setupVoicePackFixture` already supports the installed state.

### Affected files
- `src/test/ui/settings-cards.spec.ts` (NEW, ≤300L). Tests against `command-center.html` → click Settings tab → assert per-card rendering with `initialHub` injected:
  1. **Voice Pack card — absent state**: `initialHub` with no voice-pack fields → card renders Install button + "Not installed" copy.
  2. **Voice Pack card — installed state**: `voicePackInstalled: true` fixture (writes real manifest+stub to tmp dir + calls `setVoicePackPath`) → card renders Uninstall button + disk-usage row.
  3. **Governance Mode card — observe shows '(default)' tag**: `initialHub` with `governanceModeState: { mode: 'observe', defaulted: true }` → three-button picker visible with "(default)" badge near Observe.
  4. **Governance Mode card — assist hides '(default)' tag**: `initialHub` with `{ mode: 'assist', defaulted: false }` → no "(default)" badge.
  5. **qor-logic floor warning — visible** when `meetsFloor: false`: `initialHub` with `bootstrapState.qorLogicInstall.meetsFloor: false` + `installedVersion: '0.30.0'` + `minimumVersion: '0.31.1'` → `.cc-qorlogic-floor-warning` block visible with both versions rendered.
  6. **qor-logic floor warning — absent** when `meetsFloor: true`: no warning block.

### Timing contract
- Harness sequence: `serveConsoleServerUI({ initialHub: ... })` returns controller; THEN `await page.goto(controller.url + '/command-center.html')`; THEN click `.tab-btn[data-target="settings"]`. By the time the page issues its first `/api/hub` GET, the middleware is already mounted with `hubRef.current` set.
- Live update path: `controller.setHub(newHub)` updates `hubRef.current` AND broadcasts `{ type: "init", payload: newHub }` over WS. The page's `connection.js` handler refreshes on init OR on next hub.refresh. Tests that need reactivity wait for the changed DOM rather than re-fetching.

### Test infrastructure leveraged
- Uses `serveConsoleServerUI` fixture (after Phase 1 enhancement).
- Click sequence: `await page.goto('/command-center.html')` → `await page.locator('.tab-btn[data-target="settings"]').click()` → wait for `#settings.active` or settings content marker → assert.

## Phase 3: Doc + indices

### Affected files
- `docs/BACKLOG.md`: B199 status update with Phase 2 progress entry + B-EM-4 marked `[x]`.
- `docs/FEATURE_INDEX.md`: append FX512 (B-EM-4 harness override) + FX513 (Settings card Playwright spec).
- `CHANGELOG.md` `[Unreleased]`: append B199 Phase 2 paragraph.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX512 | NEW | `src/test/ui/helpers/serveConsoleServerUI.test.ts` | serveConsoleServerUI `/api/hub` override returns `fixtures.initialHub` when set; falls through otherwise (B-EM-4 closure) |
| FX513 | NEW | `src/test/ui/settings-cards.spec.ts` | Playwright covers 4 newest Settings cards (Voice Pack absent/installed, Bicameral autoConnect, Governance Mode observe/assist, qor-logic floor warning); reactive to live hub updates |

## CI Commands
- `npm run lint` — ESLint clean.
- `npm test` — mocha pass + B-EM-4 harness unit cases.
- `npx playwright test --grep "settings-cards"` — Playwright pass for new spec.
