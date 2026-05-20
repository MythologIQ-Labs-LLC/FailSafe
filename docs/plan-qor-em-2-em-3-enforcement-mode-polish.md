# Plan: B-EM-2 + B-EM-3 — Enforcement-mode polish

**change_class**: feature

**doc_tier**: standard

**terms_introduced**:
- term: ModeTransitionHistoryHydrator
  home: `FailSafe/extension/src/governance/ModeTransitionHistory.ts` (extension to existing class)
- term: FirstRunModePicker
  home: `FailSafe/extension/src/governance/FirstRunModePicker.ts`

**boundaries**:
- limitations:
  - B-EM-2: hydration seeds the ring buffer at construction-time only; no incremental re-hydration if the ledger is mutated externally during a session (consistent with existing live-event subscription model — new events arrive via EventBus normally).
  - B-EM-2: only USER_OVERRIDE entries whose payload action is `'governance_mode_changed'`, `'break_glass_activated'`, `'break_glass_revoked'`, or `'break_glass_expired'` are projected; other USER_OVERRIDE entries (e.g. bicameral ratify per B-BIC-1) are skipped.
  - B-EM-3: the wizard fires at most once per workspace per fresh `failsafe.onboarded.mode` global state. Operators can dismiss without choosing — the dismissal is final (no re-prompting).
  - B-EM-3: existing FirstRunOnboarding (agent governance setup) remains independent; the mode picker is a separate gate so the two onboardings can fire in either order.
- non_goals:
  - Bidirectional sync: mutating the ledger does NOT update the ring; events flow event-bus → ring (as before).
  - Per-workspace onboarding state (the gate uses globalState; operators set mode once across all workspaces).
  - Multi-step onboarding tutorial. The wizard is a single modal with three explicit choices.
- exclusions:
  - B-EM-1 (sentinel.mode vs GovernanceMode UI naming) — separate cluster.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX537 | NEW | `FailSafe/extension/src/test/governance/ModeTransitionHistory.hydrate.test.ts` | ModeTransitionHistory.hydrateFromLedger seeds ring buffer from last 10 USER_OVERRIDE entries matching governance_mode_changed/break_glass_* actions, in DESC order; non-matching entries skipped |
| FX538 | NEW | `FailSafe/extension/src/test/governance/FirstRunModePicker.test.ts` | FirstRunModePicker.checkAndRun shows three-option modal only when failsafe.onboarded.mode is false; selecting observe/assist/enforce persists via configManager + writes governance.mode to workspace config + marks onboarded; dismissal still marks onboarded |

## Open Questions

(All resolved during plan authoring; listed for traceability.)

1. **Hydration timing**: must run before the first live event arrives. Resolution: hydration is an async opt-in method `hydrateFromLedger(ledger)` called by `bootstrapCore` (where ModeTransitionHistory is instantiated) after the LedgerManager initializes. Within-process construction ordering already guarantees this; we add the explicit call site.
2. **Hydration ↔ live-event race**: ModeTransitionHistory's constructor wires `eventBus.on(...)` subscriptions immediately (live BEFORE hydration is awaited). If a `governance.modeChanged` event fires DURING the hydration await window, it will `unshift` at index 0, and then hydrated entries will `push()` (via the same unshift-based helper) on top of it, breaking DESC order. Resolution: add a `private hydrating: boolean` flag, set true in constructor, cleared at the end of `hydrateFromLedger()`. While `hydrating`, live events go to a temp queue. After hydration completes, drain the queue into the ring. Test coverage: FX537 case 8 asserts that a live event firing during a deliberate hydration delay ends up at the correct DESC position.
3. **Mode picker action labels**: the picker presents Observe / Assist / Enforce. Each carries a one-line explanation (`'Watch what AI agents do; no blocking'`, `'Warn before risky actions'`, `'Block risky actions; require approval'`). Default highlighted choice: Observe (safest start).
4. **`mode` config target**: VS Code `failsafe.governance.mode` setting at Global scope (so it applies across workspaces by default, consistent with FirstRunOnboarding's `failsafe.onboarded` flag).

## Phase 1: ModeTransitionHistory ledger hydration (B-EM-2)

### Affected Files

- `FailSafe/extension/src/governance/ModeTransitionHistory.ts` — extend with optional `hydrateFromLedger(ledger)` method. Read top 10 USER_OVERRIDE entries via `ledger.getEntriesByType('USER_OVERRIDE', 10)`; project each one whose `payload.action` matches the four mode-transition actions; insert into ring buffer in chronological order (oldest first, so DESC ring matches DESC ledger).
- `FailSafe/extension/src/extension/main.ts` — after both `bootstrapCore` (which builds ModeTransitionHistory) AND `bootstrapQorLogic` (which builds LedgerManager) complete, call `await modeTransitionHistory.hydrateFromLedger(ledgerManager)`. Hydration is non-blocking on failure (logger.warn + continue). LedgerManager is constructed in `bootstrapQorLogic` per `main.ts`, NOT `bootstrapCore`, so this is the only call site.

### Changes

```ts
// In ModeTransitionHistory:
async hydrateFromLedger(ledger: { getEntriesByType(t: 'USER_OVERRIDE', limit: number): Promise<LedgerEntry[]> }): Promise<void> {
  const MATCHING_ACTIONS = ['governance_mode_changed', 'break_glass_activated', 'break_glass_revoked', 'break_glass_expired'] as const;
  let entries: LedgerEntry[];
  try {
    entries = await ledger.getEntriesByType('USER_OVERRIDE', 10);
  } catch {
    return;
  }
  // Project in chronological order (oldest first), then push so DESC ring matches DESC ledger.
  const projected = entries
    .filter((e) => MATCHING_ACTIONS.includes(e.payload?.action as never))
    .reverse(); // ledger returns DESC; reverse to ASC for push semantics
  for (const e of projected) {
    const r = this.projectLedgerEntry(e);
    if (r) this.push(r);
  }
}

private projectLedgerEntry(entry: LedgerEntry): ModeTransitionRecord | null {
  const p = entry.payload as Record<string, unknown> | undefined;
  if (!p) return null;
  const action = p.action;
  if (action === 'governance_mode_changed') {
    if (!p.previousMode || !p.newMode || !p.timestamp) return null;
    return {
      id: this.newId(),
      previousMode: p.previousMode as ModeTransitionRecord['previousMode'],
      newMode: p.newMode as ModeTransitionRecord['newMode'],
      reason: 'config_edit',
      actor: String(entry.agentDid ?? 'unknown'),
      timestamp: String(p.timestamp),
      ledgerEntryRef: entry.id ?? null,
    };
  }
  if (action === 'break_glass_activated' || action === 'break_glass_revoked' || action === 'break_glass_expired') {
    const reasonMap = { break_glass_activated: 'break_glass_activated', break_glass_revoked: 'revoked', break_glass_expired: 'expired' } as const;
    if (!p.previousMode || !p.newMode || !p.timestamp) return null;
    return {
      id: this.newId(),
      previousMode: p.previousMode as ModeTransitionRecord['previousMode'],
      newMode: p.newMode as ModeTransitionRecord['newMode'],
      reason: reasonMap[action as keyof typeof reasonMap],
      actor: String(p.requestedBy ?? entry.agentDid ?? 'unknown'),
      timestamp: String(p.timestamp),
      ledgerEntryRef: entry.id ?? null,
    };
  }
  return null;
}
```

### Unit Tests

- `ModeTransitionHistory.hydrate.test.ts` (FX537) — 7 cases:
  - Empty ledger: hydration leaves ring empty.
  - 10 matching entries: ring contains all 10 in DESC order.
  - >10 matching entries (e.g. 15): ring caps at 10 (most-recent wins via `getEntriesByType` DESC limit).
  - Mixed entries: 5 matching + 5 non-matching (other USER_OVERRIDE actions like bicameral.ratify). Ring contains only the 5 matching.
  - Malformed entry (missing previousMode/newMode/timestamp): skipped without throwing.
  - getEntriesByType throws: hydration swallows error, ring remains empty.
  - Hydration THEN live event: ring contains hydrated + live, capped at 10 (live pushes oldest hydrated out).
  - **(F1 cycle-1 advisory)** Live event arrives DURING hydration: event is queued, hydration completes, queued event drained on top so it ends up at index 0 (DESC order preserved).

## Phase 2: First-run mode picker (B-EM-3)

### Affected Files

- `FailSafe/extension/src/governance/FirstRunModePicker.ts` — NEW. Class pattern mirrors `FirstRunOnboarding`: `checkAndRun()` checks gate flag, shows modal if first-run, persists choice + marks onboarded.
- `FailSafe/extension/src/extension/main.ts` — instantiate FirstRunModePicker + call `checkAndRun()` after activation completes (parallel to existing FirstRunOnboarding call site).

### Changes

```ts
// FirstRunModePicker.ts
import * as vscode from 'vscode';
import type { ConfigManager } from '../shared/ConfigManager';

type GovernanceMode = 'observe' | 'assist' | 'enforce';

export class FirstRunModePicker {
  constructor(private readonly configManager: ConfigManager) {}

  async checkAndRun(): Promise<void> {
    if (this.isOnboarded()) return;

    const picks = [
      { label: '$(eye) Observe', description: 'Watch what AI agents do; no blocking', mode: 'observe' as const },
      { label: '$(warning) Assist', description: 'Warn before risky actions', mode: 'assist' as const },
      { label: '$(shield) Enforce', description: 'Block risky actions; require approval', mode: 'enforce' as const },
    ];

    const chosen = await vscode.window.showQuickPick(picks, {
      title: 'FailSafe — Choose Governance Mode',
      placeHolder: 'Pick how FailSafe should treat AI-agent actions',
      ignoreFocusOut: true,
    });

    if (chosen) {
      await vscode.workspace.getConfiguration('failsafe').update(
        'governance.mode',
        chosen.mode,
        vscode.ConfigurationTarget.Global,
      );
    }

    // Mark onboarded EVEN if dismissed — no re-prompting.
    await this.markOnboarded();
  }

  private isOnboarded(): boolean {
    return !!this.configManager.getGlobalState<boolean>('failsafe.onboarded.mode', false);
  }

  private async markOnboarded(): Promise<void> {
    await this.configManager.setGlobalState('failsafe.onboarded.mode', true);
  }
}
```

### Unit Tests

- `FirstRunModePicker.test.ts` (FX538) — 6 cases:
  - Not first-run (onboarded.mode === true): checkAndRun is a no-op; showQuickPick NOT called.
  - First-run + selects Observe: showQuickPick returns observe entry; `failsafe.governance.mode` config set to `'observe'` at Global scope; onboarded.mode marked true.
  - First-run + selects Assist: same with `'assist'`.
  - First-run + selects Enforce: same with `'enforce'`.
  - First-run + dismisses (returns undefined): NO config write; onboarded.mode still marked true (final).
  - Multiple rapid invocations: second call sees onboarded.mode === true and short-circuits even if first call is still in-flight.

## CI Commands

- `cd FailSafe/extension && npm run compile` — TypeScript builds without errors
- `cd FailSafe/extension && npm run lint` — no new lint violations
- `cd FailSafe/extension && npx mocha out/test/governance/ModeTransitionHistory.hydrate.test.js out/test/governance/FirstRunModePicker.test.js --ui tdd` — 13 cases passing
- `cd FailSafe/extension && npm test` — full mocha suite green
