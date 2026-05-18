# Governance Cache Invalidation

FailSafe's governance services hold cached state in memory (plans, L3 queue, trust agents, checkpoint chain validity). When workspace files backing this state are mutated externally — by a parallel tool, the operator's editor, or a future FailSafe Pro daemon — the in-process cache becomes stale without notice. This doc describes the `WorkspaceMutationBus` substrate that closes the gap.

## Architecture

```
                                  ┌─────────────────────────────┐
                                  │  WorkspaceMutationBus       │
                                  │  (src/shared/...)           │
                                  │                             │
                                  │  registerWatcher(path, cb)  │
                                  │   → Node fs.watch(path)     │
                                  │   → 200ms debounce          │
                                  │   → cb() after settle       │
                                  │   → Disposable returned     │
                                  └──────────┬──────────────────┘
                                             │
                ┌────────────────────────────┼───────────────────────────────┐
                │                            │                               │
       ┌────────▼─────────┐         ┌────────▼──────────┐           ┌────────▼────────────┐
       │ PlanManager      │         │ HubSnapshotService │           │ TrustEngine         │
       │ subscribes:      │         │ subscribes:        │           │ subscribes:         │
       │  .failsafe/      │         │  <ledger db path>  │           │  <ledger db path>   │
       │  plans.yaml      │         │  → clears          │           │  → refreshFromDb()  │
       │  .qorelogic/     │         │  cachedChainValid  │           │  (Pro coexistence)  │
       │  roadmap.yaml    │         │  + chainValidAt    │           │                     │
       └──────────────────┘         └────────────────────┘           └─────────────────────┘

       ┌────────────────────────────┐
       │ ConsoleLifecycleService    │
       │ migrated subscription:     │
       │  docs/META_LEDGER.md       │
       │  → broadcast hub.refresh   │
       │  (1500ms debounce)         │
       └────────────────────────────┘
```

## Why a separate bus (vs reusing EventBus)

- **EventBus** carries SHIELD lifecycle events (`plan.created`, `blocker.added`, `sentinel.verdict`, `qorelogic.trustUpdated`). It is in-process semantic event distribution — no fs-watch backing.
- **WorkspaceMutationBus** carries filesystem-level events (a path mutated). External writers (Pro daemon, manual file edits) produce events here that EventBus never sees.
- Keeping them separate avoids complecting: a service that wants both in-process semantic events AND fs-coexistence subscribes to both buses with different concerns per subscription.

## Why targeted-path watching (vs workspace-root recursive)

SentinelDaemon's `chokidar.watch(workspaceRoot, { recursive: true })` already watches the full tree at code-extension granularity. Adding another recursive watcher would double fs-pressure for no benefit; this bus exists to deliver mutation signals to a small known set of governance services (currently 4 subscriptions + 1 migration; bounded). Each service registers exactly the path it cares about; fs.watch handles are negligible at that count.

## Subscriber catalog (v1)

| Subscriber | Watch path | Callback effect |
|---|---|---|
| `PlanManager` (bootstrapCore) | `<workspaceRoot>/.failsafe/plans.yaml` + `<workspaceRoot>/.qorelogic/roadmap.yaml` | `refreshFromWorkspace()` — re-reads YAML stores + rebuilds plans Map |
| `HubSnapshotService` (ConsoleServer) | `ledgerManager.getLedgerPath()` (SQLite db) | `refreshChainValidity()` — clears `cachedChainValid` + `chainValidAt` so next `getCheckpointSummary()` re-walks via `verifyCheckpointChain()` |
| `TrustEngine` (bootstrapQorLogic, after `initialize()` resolves db path) | `ledgerManager.getLedgerPath()` (SQLite db) | `refreshFromDb()` — re-reads `agent_trust` table |
| `ConsoleLifecycleService.watchMetaLedger` (migration) | `<workspaceRoot>/docs/META_LEDGER.md` | broadcast `hub.refresh` (WebSocket) |

L3ApprovalService is **intentionally not subscribed** — its backing `VscodeStateStore` wraps `vscode.Memento`, which has no filesystem path to watch. The existing `HubSnapshotService.buildHubSnapshot()` pull-call to `qorelogicManager.refreshL3Queue?.()` handles its in-process staleness. (See [BACKLOG.md](BACKLOG.md) B-SC-6 for an EventBus-driven alternative.)

## Debounce policy

- Default debounce: **200ms** per-path. Tuned to handle Windows fs.watch's habit of firing 2-3 events per single logical write while still feeling instantaneous to operators.
- META_LEDGER override: **1500ms** (legacy behavior preserved from `ConsoleLifecycleService.watchMetaLedger`). META_LEDGER mutations come from substantiate-seal commits that touch many entries at once; the longer debounce coalesces the burst before broadcasting `hub.refresh`.
- No operator-tunable configuration in v1 (out of scope; see BACKLOG B-SC-2).

## Failure modes — graceful degradation

- **ENOENT** (watch target file doesn't exist yet): bus logs `[WorkspaceMutationBus] watch target missing: <path>` and returns a no-op `Disposable`. Caller's `dispose()` is safe to call.
- **fs.watch throws** (unsupported platform, EACCES, ENFILE): same no-op fallback. Logged.
- **Windows fs.watch unreliability**: known to miss some events under load. Mitigation: `HubSnapshotService.buildHubSnapshot()` retains its existing defensive pull-calls (`planManager.refreshFromWorkspace?.()` + `qorelogicManager.refreshL3Queue?.()`). Belt-and-suspenders: event-driven invalidation is the primary mechanism; pull-on-build catches missed events on the next hub rebuild. No periodic poll in v1 (BACKLOG B-SC-1).

## FailSafe-Pro coexistence

When FailSafe Pro ships, it can write to the same workspace files (`.failsafe/plans.yaml`, the SQLite db, `docs/META_LEDGER.md`) without IPC handshake. fs.watch in the extension picks up the mutation events naturally; subscribers refresh; UI re-renders. The trust posture is **shared filesystem**, not cross-process events. Pro-side writes go through standard `fs.writeFileSync` / SQLite transactions; the extension's bus subscribers don't need to know anything about Pro.

## Bootstrap wiring

- `bootstrapCore` constructs `WorkspaceMutationBus` alongside `EventBus`; both are included in `CoreSubstrate` and threaded down.
- `bootstrapQorLogic` passes the bus to `TrustEngine` as its third constructor parameter.
- `bootstrapServers` passes the bus to `ConsoleServer` via `options.mutationBus`; `ConsoleServer` threads it to `HubSnapshotService` (via `deps`) and `ConsoleLifecycleService` (via `deps`).
- `PlanManager` receives the bus directly in `bootstrapCore`.

All bus subscriptions are constructor-time + optional. Services constructed without a bus (typical in test fixtures) degrade to the pull-on-build mechanism with no behavior change.
