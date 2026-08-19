# Governance Mode Transitions (B194)

## Mode values

FailSafe operates in one of three governance modes, declared by `failsafe.governance.mode` in VS Code workspace config:

- **observe** — read-only audit. Verdicts are advisory; no blocking.
- **assist** — verdicts surface as advisory prompts before destructive actions, but the operator can always proceed.
- **enforce** — verdicts gate actions; L3-classified operations require approval. **Default for fresh installs** since 2026-08-19 (`EnforcementEngine.getGovernanceModeState` returns `{ mode: 'enforce', defaulted: true }` when config is missing; `package.json` manifest default is `enforce`).

## Transition triggers

Every change to the live governance mode emits a typed `governance.modeChanged` event on the EventBus, plus the existing `governance.breakGlass{Activated,Revoked,Expired}` events (enriched in v5.2.x with full transition context).

| Trigger | Source | Reason value |
|---|---|---|
| User edits `failsafe.governance.mode` in `settings.json` or via the `failsafe.setGovernanceMode` quickpick | `bootstrapAdvancedCommands.ts` config-change listener | `config_edit` |
| Operator invokes `failsafe.breakGlass` command | `BreakGlassProtocol.activate` | `break_glass_activated` |
| Operator runs `failsafe.revokeBreakGlass` | `BreakGlassProtocol.revoke` | `revoked` |
| Auto-expiry timer fires after the break-glass `expiresAt` | `BreakGlassProtocol.handleExpiry` | `expired` |

## Event payload

```ts
interface GovernanceModeChangedEvent {
  previousMode: "observe" | "assist" | "enforce";
  newMode: "observe" | "assist" | "enforce";
  reason: "config_edit" | "break_glass_activated" | "revoked" | "expired";
  actor: string;          // "vscode-user", "operator-id", or "system:break-glass-timer"
  timestamp: string;      // ISO 8601
  ledgerEntryRef?: string | null;
}
```

The break-glass-flavored events carry `overrideId` plus the same shape (with `requestedBy` instead of `actor` on the payload — `ModeTransitionHistory` normalizes both into the unified `ModeTransitionRecord.actor` field).

The auto-expiry payload uses `requestedBy: 'system:break-glass-timer'`, matching the `agentDid` of the corresponding ledger entry at `BreakGlassProtocol.ts:208-216` for downstream correlation.

## UI surfaces

### Monitor sidebar (compact UI)

**Removed 2026-08-19** (enforce-default flip, plan-qor155-align-enforce-default): the B194 observe-mode advisory banner (`renderModeBanner`, `#mode-banner`) no longer exists — enforce-by-default made the escalation advisory obsolete. The negative contract (no `#mode-banner` in any mode) is pinned by `src/test/ui/governance-mode-transitions.spec.ts`.

### Command Center Governance tab

`governance.js:renderModeTransitions` renders a "Mode Transitions" card listing the last 10 entries from `hub.recentModeTransitions`. Each row:

- Shows `<timestamp> · <previousMode> → <newMode> · reason: <reason>, by <actor>`
- Carries `data-transition-ts="<timestamp>"` for future deep-link integrations
- Click adds `.cc-mode-transition--highlighted` for 3 seconds (matches the existing `.cc-verdict--highlighted` flash)

All operator-provided values (`reason`, `actor`) pass through `this.esc()` (textContent-based escape) before interpolation — XSS-safe.

### Settings tab

Existing `renderGovernanceModeCard` gets `governanceModeState` from the populated hub field; its absent-hub fallback is `{ mode: 'enforce', defaulted: true }` (flipped 2026-08-19). The observe-default hint paragraph was removed with the flip; the `(default)` tag remains.

## Architecture

```
config edit ──┐
              ├──> EventBus ──> ModeTransitionHistory (ring)
break-glass ──┘                 │
                                ├──> HubSnapshotService.assembleHubPayload
                                │      └──> hub.recentModeTransitions (last 10)
                                │      └──> hub.governanceModeState (from EnforcementEngine)
                                │
                                └──> Monitor banner + Governance tab feed
```

`ModeTransitionHistory` is constructed in `bootstrapCore.ts` and exposed on `CoreSubstrate.modeTransitionHistory`. It owns its bus subscriptions and disposes them on extension deactivate.

## V1 limitations (deferred follow-ups)

- **Ring is in-memory only** — transitions survive within a single extension session. Reload empties the ring. Cross-session persistence (replay from META_LEDGER USER_OVERRIDE entries) tracked as **B-EM-2**.
- **`sentinel.mode` collision** — `governance.js:102` historically rendered `sentinel.mode` (`heuristic | hybrid | llm`) as if it were governance mode. Out of scope for this cycle; tracked as **B-EM-1**.
- **First-run onboarding wizard** — the original B194 line proposed walking the operator from observe → assist on first install. Superseded 2026-08-19: enforce is now the default and a one-time upgrade notice (`modeDefaultNotice.ts`) surfaces the change; the `FirstRunModePicker` (B-EM-3, no-reprompt) remains the guided entry.

## Verification

| Test ID | Path | Asserts |
|---|---|---|
| FX504 | `src/test/governance/GovernanceModeEvent.test.ts` | Event emission shapes + BreakGlass payload enrichment |
| FX505 | `src/test/governance/ModeTransitionHistory.test.ts` | Ring boundedness, ordering, eviction, dispose, payload preservation |
| FX507 | (removed 2026-08-19) | Banner removed with the enforce-default flip; negative contract in FX509 spec |
| FX508 | `src/test/roadmap/governance-mode-transitions.test.ts` | Governance feed render + XSS-escape + deep-link flash |
| FX509 | `src/test/ui/governance-mode-transitions.spec.ts` | Playwright: Monitor renders with no `#mode-banner` element in any mode |
