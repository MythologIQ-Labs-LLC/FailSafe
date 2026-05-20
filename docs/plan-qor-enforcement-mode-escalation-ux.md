# Plan: B194 enforcement-mode escalation UX (governance-mode transition surfacing)

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: B194
**target_version**: v5.2.x (no in-cycle bump; rolls into v5.2.0 release)
**Review boundary**: stage artifacts only — no push, tag, PR, marketplace publish, GitHub Release upload. Consistent with prior three cycles (bicameral #372, stale-cache #373, voice-substrate #374).

**terms_introduced**:
- term: `GovernanceModeChangedEvent`
  home: `docs/governance-mode-transitions.md` (NEW)
- term: `ModeTransitionRecord`
  home: `docs/governance-mode-transitions.md` (NEW)
- term: `ModeTransitionHistory`
  home: `docs/governance-mode-transitions.md` (NEW)

**boundaries**:
- limitations:
  - Surfaces ONLY governance mode (`observe | assist | enforce`); does not unify with `sentinel.mode` (`heuristic | hybrid | llm`) — these are orthogonal axes and the existing `governance.js:102` collision is tracked separately as B-EM-1.
  - Transition history is V1 in-memory ring (last 10 entries, capped); survives within one extension session only. Persistence to META_LEDGER + cross-session replay tracked as B-EM-2.
- non_goals:
  - Full BreakGlass payload redesign — only the existing `governance.breakGlass{Activated,Revoked,Expired}` payloads gain `{ previousMode, newMode, reason, requestedBy }` so the transition feed has actor + reason context.
  - First-run onboarding wizard (the B194 original line proposed walking operator from observe → assist). V1 surfaces the gap; full wizard tracked as B-EM-3.
- exclusions:
  - B-EM-1: `sentinel.mode` vs `GovernanceMode` name collision in `governance.js:102`, `integrity.js:66`, `operations.js:38,188`, `tickers.js:9`.
  - B-EM-2: cross-session transition-history persistence.
  - B-EM-3: first-run onboarding wizard.
  - B-SC-6: in-process L3 staleness (deferred from B192).

## Open Questions

(none — research closed all 8 starting questions; design decisions captured in Decision Log below)

## Decision Log (orchestrator autonomy resolutions)

| Decision | Evidence | Confidence | Risk impact |
|---|---|---|---|
| Fix silent `hub.governanceModeState` non-population bug in scope | `settings.js:235` consumes the field; `HubSnapshotService.ts:197-244` (`assembleHubPayload`) never sets it. Without the fix, the new UI work is invisible. | high | low (additive write) |
| In-memory ring buffer (10 entries) for V1 transition history | Persistence is non-trivial (META_LEDGER schema impact, replay on hub-rebuild). V1 surfaces the surface; persistence is B-EM-2. | medium | low (V1 is degraded by reload, not broken) |
| Architect-reviewer subagent for cycle-1 audit | SG-007 self-audit blindness recurrence pattern; this is the fourth consecutive plan authored by the same agent. Step 1.a Option B explicit. | high | low |
| Extend BreakGlass event payloads in same phase as new `governance.modeChanged` event | Existing payloads omit `previousMode/newMode/reason/requestedBy` — exactly the data the transition feed needs. Single phase keeps emitters coherent. | high | low |

## Infrastructure Citation Inventory (Phase 72 grep-evidence; SG-CitationDrift-A)

Every load-bearing infrastructure citation below is paired with the canonical grep-evidence statement.

1. **GovernanceMode type lives at `src/governance/EnforcementEngine.ts:35`**:
   `git show HEAD:FailSafe/extension/src/governance/EnforcementEngine.ts | grep -nE 'GovernanceMode = ' -> 35:export type GovernanceMode = "observe" | "assist" | "enforce";`
2. **Default-to-observe at `EnforcementEngine.ts:88-98`**:
   `git show HEAD:FailSafe/extension/src/governance/EnforcementEngine.ts | grep -nE 'getGovernanceMode' -> 88:  getGovernanceMode(): GovernanceModeState {`
3. **Config-change listener at `bootstrapAdvancedCommands.ts:32-56`**:
   `git show HEAD:FailSafe/extension/src/extension/bootstrapAdvancedCommands.ts | grep -nE 'governance.mode' -> 33:  let lastKnownMode = ...; 44:    if (e.affectsConfiguration("failsafe.governance.mode"))`
4. **BreakGlass activate emits `governance.breakGlassActivated` at `BreakGlassProtocol.ts:64`**:
   `git show HEAD:FailSafe/extension/src/governance/BreakGlassProtocol.ts | grep -nE "breakGlass(Activated|Revoked|Expired)" -> 64,96,207`
5. **HubSnapshotService.assembleHubPayload at `HubSnapshotService.ts:197-244` does NOT set `governanceModeState`**:
   `git show HEAD:FailSafe/extension/src/roadmap/services/HubSnapshotService.ts | grep -nE 'governanceModeState' -> (no matches)` — verified open at line 197.
6. **Settings card consumes `hub.governanceModeState` at `settings.js:235`**:
   `git show HEAD:FailSafe/extension/src/roadmap/ui/modules/settings.js | grep -nE 'governanceModeState' -> 234:function renderGovernanceModeCard(hub) { const state = hub?.governanceModeState ?? { mode: 'observe', defaulted: true };`
7. **Verdict deep-link pattern (`data-verdict-ts`) at `governance.js:57,162`**:
   `git show HEAD:FailSafe/extension/src/roadmap/ui/modules/governance.js | grep -nE 'data-verdict-ts' -> 57,162`
8. **Sentinel-monitor.js does NOT currently render governance mode**:
   `git show HEAD:FailSafe/extension/src/roadmap/ui/modules/sentinel-monitor.js | grep -nE 'governance' -> (no matches)`
9. **EventBus emit signature is `emit<T = unknown>(eventType: FailSafeEventType, payload: T)` where `FailSafeEventType` is a closed string-literal union**:
   `git show HEAD:FailSafe/extension/src/shared/types/events.ts | grep -nE 'FailSafeEventType' -> 7:export type FailSafeEventType =` followed by 44 string-literal members at lines 8-50.
   `git show HEAD:FailSafe/extension/src/shared/EventBus.ts | grep -nE 'emit' -> 8:emit<T = unknown>(eventType: FailSafeEventType, payload: T): void`.
   Existing emits use `"governance.breakGlass*" as never` casts when adding members ahead of the type definition update (BreakGlassProtocol.ts:64,96,207). New event MUST be added to `events.ts:7-50` union AND no `as never` cast is required if the union is updated in the same commit.
10. **GovernanceMode type duplicated at `BreakGlassProtocol.ts:11`**:
    `git show HEAD:FailSafe/extension/src/governance/BreakGlassProtocol.ts | grep -nE 'GovernanceMode' -> 11:export type GovernanceMode = "observe" | "assist" | "enforce";`

## Phase 1: Event emission + typed payload

### Affected files

- `src/governance/types.ts` — NEW (~30L). Central `GovernanceMode` + `GovernanceModeState` + `GovernanceModeChangedEvent` + `ModeTransitionRecord` interface types. Re-exported by EnforcementEngine + BreakGlassProtocol (resolves duplication finding).
- `src/governance/EnforcementEngine.ts` — re-export `GovernanceMode` from `types.ts` instead of redeclaring at line 35.
- `src/governance/BreakGlassProtocol.ts` — re-export `GovernanceMode` from `types.ts` (line 11 redeclaration removed). Three break-glass emit sites enriched per the explicit payload mapping below.
- `src/extension/bootstrapAdvancedCommands.ts` — extend the existing config-change listener (lines 32-56) to ALSO emit `governance.modeChanged` on the bus alongside the existing USER_OVERRIDE ledger write. Payload: `{ previousMode, newMode, reason: 'config_edit', actor: 'user', timestamp: ISO8601, ledgerEntryRef: <USER_OVERRIDE entry id when ledger write succeeds, otherwise null> }`. Dedup logic at line 43 preserved (no emission on same-value writes).
- `src/shared/types/events.ts` — extend the `FailSafeEventType` string-literal union at lines 7-50 by adding `"governance.modeChanged"` as a new literal member. **CRITICAL** (per cycle-1 F1): the registry is closed and typed; the new emit will NOT compile without this addition. Once added, all four new emit call-sites (config listener + 3 break-glass sites) drop their `as never` casts and use the typed name directly.

### BreakGlass emit payload mapping (cycle-1 F3 remediation)

Each existing break-glass emit gains the enriched payload shape using fields already present on `BreakGlassRecord` (see `BreakGlassProtocol.ts:141-149`):

| Emit site | Current payload | Enriched payload |
|---|---|---|
| `activate` (line 64) | `{ overrideId, expiresAt }` | `{ overrideId: record.id, previousMode: record.previousMode, newMode: record.overrideMode, reason: record.reason, requestedBy: record.requestedBy, expiresAt: record.expiresAt, timestamp: record.activatedAt }` |
| `revoke` (line 96) | `{ overrideId }` | `{ overrideId: record.id, previousMode: record.overrideMode, newMode: record.previousMode, reason: 'revoked', requestedBy: record.revokedBy, timestamp: record.revokedAt }` (note: `revoke()` body restores `record.previousMode` at line 99, so post-revoke the operator returns to that mode) |
| `handleExpiry` (line 207, expired) | `{ overrideId }` | `{ overrideId: record.id, previousMode: record.overrideMode, newMode: record.previousMode, reason: 'expired', requestedBy: 'system:break-glass-timer', timestamp: <now ISO> }` — **actor string MUST match the ledger entry's `agentDid` at `BreakGlassProtocol.ts:199`** (`"system:break-glass-timer"`); the event payload and ledger entry refer to the same actor and must carry the identical string for downstream join/correlation. Per cycle-2 F5 remediation. |

### Unit tests

- `src/test/governance/GovernanceModeEvent.test.ts` — NEW (≤80L). 5 mocha cases under SG-035 (invoke unit, assert output):
  1. Config-change listener emits `governance.modeChanged` with full payload (previousMode/newMode/reason/actor/timestamp) when mode changes from observe → assist.
  2. Same-value config write (observe → observe) does NOT emit (idempotency); existing dedup logic in `bootstrapAdvancedCommands.ts:50-54` preserved.
  3. BreakGlassProtocol.activate() emits enriched `governance.breakGlassActivated` payload matching the mapping table above (`overrideId / previousMode / newMode / reason / requestedBy / expiresAt / timestamp`).
  4. BreakGlassProtocol.revoke() emits enriched `governance.breakGlassRevoked` payload matching the mapping table above (`overrideId / previousMode (=record.overrideMode at revoke time) / newMode (=record.previousMode) / reason='revoked' / requestedBy=record.revokedBy / timestamp=record.revokedAt`).
  5. BreakGlassProtocol auto-expiry emits enriched `governance.breakGlassExpired` payload matching the mapping table above (`overrideId / previousMode / newMode / reason='expired' / requestedBy='system:break-glass-timer' / timestamp`). Per cycle-3 F7 remediation: the test descriptor MUST use the canonical actor string `'system:break-glass-timer'` that the emitter actually produces (matches the ledger `agentDid` at `BreakGlassProtocol.ts:199`).
- `src/test/extension/mode-change-audit.test.ts` — EXTEND (existing FX263). Add 2 cases asserting (a) event fires alongside ledger write; (b) event payload matches ledger entry's reason/actor/timestamp triple.

## Phase 2: HubSnapshotService population + ModeTransitionHistory + Monitor banner

### Affected files

- `src/governance/ModeTransitionHistory.ts` — NEW (~90L). Ring buffer subscribed to `governance.modeChanged` + the three `governance.breakGlass*` events. Capped at 10 records (eviction by oldest). `getRecent(limit?: number): ModeTransitionRecord[]` accessor. `dispose()` releases bus subscriptions.
- `src/extension/bootstrapCore.ts` — instantiate `ModeTransitionHistory` alongside `EventBus`; expose on `CoreSubstrate.modeTransitionHistory`.
- `src/extension/bootstrapServers.ts` — thread `modeTransitionHistory` into ConsoleServer options.
- `src/roadmap/services/HubSnapshotService.ts` — populate two fields in `assembleHubPayload` (line 197-244): `governanceModeState` from injected `getGovernanceMode` callback dep; `recentModeTransitions` from `modeTransitionHistory.getRecent(10)`. Both deps added to constructor options with `?` markers so existing tests without bus continue to work unchanged (matches the WorkspaceMutationBus integration pattern from B192).
- `src/roadmap/ConsoleServer.ts` — `ConsoleServerOptions` gains `modeTransitionHistory?` and `getGovernanceMode?`; `buildHubService` threads them through to HubSnapshotService.
- `src/roadmap/ui/modules/sentinel-monitor.js` — render an observe-mode advisory banner ONLY when `governanceModeState.mode === 'observe'`. Banner copy: "Observe mode (read-only). Switch to assist or enforce when ready →" with click handler `window.open('/command-center.html#settings', '_blank')` to land on Settings tab (where the existing `renderGovernanceModeCard` at `settings.js:234` shows the three-button picker). Hidden in assist/enforce. Renders ABOVE existing alerts so it's the first thing the operator sees. **Per cycle-1 F2 remediation**: URL fragment is exactly `#settings` — no query suffix, no focus parameter (V1 simplification; cross-tab focus-scroll deferred to B-EM-3 onboarding wizard). **Per cycle-2 F6 remediation**: target is `'_blank'` to match the three established `window.open` call patterns in the same module (`sentinel-monitor.js:44,87,109`). The existing `command-center.js` tab-routing handles `#settings` by selecting the Settings tab.

### Unit tests

- `src/test/governance/ModeTransitionHistory.test.ts` — NEW (≤90L). 5 mocha cases:
  1. `getRecent(0)` returns `[]` on empty history.
  2. After 3 emits, `getRecent(10)` returns 3 records in reverse-chronological order.
  3. After 15 emits, `getRecent(10)` returns exactly 10 records (oldest 5 evicted).
  4. `dispose()` releases subscriptions (subsequent emits don't grow history).
  5. Records carry full payload (previousMode, newMode, reason, actor, timestamp).
- `src/test/roadmap/HubSnapshotService.test.ts` — EXTEND. 2 new cases:
  1. With injected EnforcementEngine, `governanceModeState` field populates correctly.
  2. With injected modeTransitionHistory, `recentModeTransitions` reflects the ring contents.
- `src/test/roadmap/sentinel-monitor.test.ts` — NEW or EXTEND. 3 mocha cases:
  1. `mode === 'observe'` + `defaulted: false` → banner renders with the explicit "Switch to assist or enforce" CTA.
  2. `mode === 'assist'` → no banner.
  3. `mode === 'enforce'` → no banner.

## Phase 3: Command Center Governance tab transition feed + doc

### Affected files

- `src/roadmap/ui/modules/governance.js` — add a new "Mode transitions" subsection at the top of the Governance tab (before the existing audit-log table). Renders `hub.recentModeTransitions` as a chronological list (newest first). Each row carries `data-transition-ts="${ts}"` so it can participate in the existing deep-link highlight pattern. Each row content:
  ```
  [ts ISO] previousMode → newMode (reason: "${reason}", by ${actor})
  ```
  `escapeHtml` applied to `reason` and `actor` (XSS guard; matches existing pattern).
- `src/roadmap/ui/command-center.css` — add `.cc-mode-transition` class (single row styling); `.cc-mode-transition--highlighted` reuses the same 3s flash as `.cc-verdict--highlighted` (from sentinel-alert-deeplink fix).
- `docs/governance-mode-transitions.md` — NEW (≤200L). Documents: GovernanceMode values, transition triggers (config / BreakGlass), event payload shape, UI surfaces (Monitor banner + Governance feed + Settings card), known V1 limitations (in-memory only, B-EM-1/2/3 follow-ups).
- `docs/FEATURE_INDEX.md` — add FX504-509 rows (per Phase 73).
- `docs/BACKLOG.md` — mark `B194` as `[x]` with link to plan + audit + entry # placeholder; append three new entries `B-EM-1` / `B-EM-2` / `B-EM-3` carrying the deferred follow-ups from Boundaries.
- `CHANGELOG.md` — append to `[Unreleased] — v5.2.0 (draft)` under `### Added`: "Enforcement-mode escalation UX (B194). New `governance.modeChanged` event + ModeTransitionHistory ring + Monitor observe-mode banner + Governance tab Mode Transitions feed."

### Unit tests

- `src/test/roadmap/governance-mode-transitions.test.ts` — NEW (≤100L). 4 mocha cases (JSDOM):
  1. Empty `recentModeTransitions` → section renders header only (no list).
  2. 3 transitions → 3 rows in reverse-chronological order with correct `data-transition-ts`.
  3. Reason with `<script>...</script>` is escaped (XSS guard).
  4. Click on row triggers deep-link highlight via `cc-mode-transition--highlighted` class (using same trigger pattern as verdict deep-link).

## Phase 4: Playwright E2E coverage (B199 compliance)

### Affected files

- `src/test/ui/governance-mode-transitions.spec.ts` — NEW (≤200L). 3 Playwright cases:
  1. **Monitor observe-mode banner**: harness with `governanceModeState: { mode: 'observe', defaulted: true }` → banner visible with assertable text "Switch to assist or enforce". Switch to `{ mode: 'assist' }` via WebSocket hub update → banner disappears.
  2. **Transition feed renders**: harness emits `governance.modeChanged` event → new row appears in Governance tab feed with previousMode → newMode + reason + actor. Verify `data-transition-ts` attribute matches the timestamp.
  3. **Deep-link highlight**: click on a transition row → page scrolls + 3s flash applied via `.cc-mode-transition--highlighted` class. Assert class present then removed after timeout.

### Unit tests

(none new — Phase 4 IS the test phase for the UI flow)

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX504 | NEW | `src/test/governance/GovernanceModeEvent.test.ts` | `governance.modeChanged` event emitted with full payload `{previousMode,newMode,reason,actor,timestamp}` on config-change AND idempotently suppressed on same-value writes |
| FX505 | NEW | `src/test/governance/ModeTransitionHistory.test.ts` | ModeTransitionHistory ring buffer accumulates events in reverse-chronological order, capped at 10 with oldest-eviction |
| FX506 | NEW | `src/test/roadmap/HubSnapshotService.test.ts` (extended) | Hub payload populates `governanceModeState` from EnforcementEngine + `recentModeTransitions` from ModeTransitionHistory |
| FX507 | NEW | `src/test/roadmap/sentinel-monitor.test.ts` (new or extended) | Monitor sidebar renders observe-mode advisory banner iff `governanceModeState.mode === 'observe'`; hidden in assist/enforce |
| FX508 | NEW | `src/test/roadmap/governance-mode-transitions.test.ts` | Governance tab Mode Transitions feed renders `recentModeTransitions` with reverse-chronological order + XSS-escaped reason/actor + `data-transition-ts` for deep-linking |
| FX509 | NEW | `src/test/ui/governance-mode-transitions.spec.ts` | Playwright: observe-mode banner reactivity to live hub update + transition feed renders on event + deep-link click highlights with 3s flash |

## CI Commands

- `npm run lint` — ESLint clean (target: 0 errors; existing 94 baseline warnings tolerated).
- `npm test` — mocha vscode-test pass (baseline 2280 + 18+ new functional cases).
- `npx playwright test --grep "governance-mode-transitions"` — Playwright pass for new spec.
- `npm run check:types` — TypeScript clean.
- `node scripts/check-e2e-coverage.cjs` — release-class CI gate (Option C): asserts every UI-surface file change has a `.spec.ts` companion. Should PASS because Phase 4 ships the spec.

## Phase ordering rationale

- Phase 1 establishes the event + types (foundation; nothing else compiles without it).
- Phase 2 builds the ring + populates the hub payload + adds the Monitor banner (banner is the simplest UI consumer; validates the data flow).
- Phase 3 adds the richer Command Center feed (uses the same data already populated in Phase 2).
- Phase 4 closes the B199 E2E gap (no UI-surface ship without spec, per CI gate Option C).

Each phase is independently verifiable via its named tests; Phase 4 is the final acceptance gate before substantiate.
