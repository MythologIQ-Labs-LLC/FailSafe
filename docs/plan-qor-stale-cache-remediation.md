# Plan: Stale-Cache Remediation (B192 — workspace-mutation event bus)

**Plan slug**: `plan-qor-stale-cache-remediation`
**Target version**: v5.2.x (no in-cycle version bump; bump deferred to release runbook)
**change_class**: `feature`
**Risk grade**: L2 (touches 4 governance services + bootstrap wiring; introduces new substrate; no L3 governance bypass)
**doc_tier**: `standard`
**high_risk_target**: false
**Review boundary**: stage artifacts only (no push / PR / merge / tag / publish)
**Resolves**: B192 (Stale-cache pattern across governance services) including the FailSafe-Pro-coexistence concern
**Carry-over governance**: feedback_no_ship_without_approval.md, feedback_per_feature_tdd.md, feedback_e2e_before_claim_closed.md, feedback_voice_separate_download.md (out-of-scope reference)

## terms_introduced

- term: WorkspaceMutationBus
  home: FailSafe/extension/src/shared/WorkspaceMutationBus.ts
- term: refreshChainValidity
  home: FailSafe/extension/src/roadmap/services/HubSnapshotService.ts (method)
- term: governance-mutation event
  home: docs/governance-cache-invalidation.md

## boundaries

- limitations:
  - Watches only specific file paths registered by services (NOT workspace-root-wide; that's SentinelDaemon's territory)
  - Uses Node stdlib `fs.watch` (no new dep); degrades silently on platforms where fs.watch is unsupported (matches existing `watchMetaLedger` posture)
  - 200ms per-path debounce hardcoded (operator-visible tuning out of scope for v1)
  - In-process only; no IPC handshake with external processes (Pro coexistence works via the shared filesystem, NOT via cross-process events)
- non_goals:
  - Replacing SentinelDaemon's chokidar watcher (separate concern; B193 territory)
  - Adding chokidar to the new bus (stdlib fs.watch is sufficient for targeted-path watching)
  - Workspace-root recursive watching (intentionally avoided to prevent fs-pressure regression)
  - Event-driven refresh for runtime-populated services (DiscoveryGovernor / WorkflowRunManager / PluginRegistry — no construction-time fs read, so no stale-cache exposure)
- exclusions:
  - B193 SentinelDaemon governance-file extension support (its own plan cycle)
  - Cross-process IPC for Pro coexistence (Pro repo, not this repo)
  - SentinelDaemon-style verdict pipeline on governance-file mutations (out of scope; this plan is about cache invalidation, not new verdicts)

## Open Questions

- **Bus injection style**: should `WorkspaceMutationBus` be passed as a constructor argument to each service (explicit DI) OR be resolved via a `WorkspaceContext` service-locator pattern? Plan defaults to **explicit DI as an optional constructor parameter** (matches existing EventBus shape; back-compat with current test fixtures).
- **Debounce tuning**: 200ms per-path debounce is the default. The existing `watchMetaLedger` uses 1500ms. Migration preserves the 1500ms for the META_LEDGER hub-refresh broadcast specifically; new subscriptions use 200ms. Operator confirms split-debounce is acceptable.
- **fs.watch unreliability on Windows**: Node's fs.watch is famously flaky on Windows (missed events, ENOSPC on large directories). Mitigation: HubSnapshotService keeps belt-and-suspenders defensive `refreshFromWorkspace?.()` pull calls. Open question: do we ALSO add a periodic fallback poll (e.g., every 30s re-check mtime) for paths where reliability is critical (SQLite db, META_LEDGER)? Plan defaults to **no periodic fallback** for v1; revisit if reliability is observably bad.
- **TrustEngine vs Pro coexistence**: TrustEngine subscribes to its own `qorelogic.trustUpdated` / `agentQuarantined` / `agentReleased` EventBus events for in-process mutations. Adding a fs-watch on the SQLite db path catches external (Pro-side) mutations. **Is FailSafe Pro guaranteed to write to the SAME SQLite db file**, or might it write to a sibling? Plan assumes same db file per `reference_voice_pack.md` posture. If Pro writes to a sibling, the subscription path needs adjustment.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX498 | NEW | src/test/shared/WorkspaceMutationBus.test.ts | `registerWatcher(path, onMutation)` returns Disposable; mutation event fires `onMutation` after debounce window; dispose stops subsequent firings; ENOENT path returns no-op Disposable without throwing |
| FX499 | MODIFIED | src/test/planning/PlanManager.test.ts (existing) | PlanManager construction with WorkspaceMutationBus dep subscribes to `.failsafe/plans.yaml` + `.qorelogic/roadmap.yaml`; simulated bus event triggers `refreshFromWorkspace()`; assertion: subsequent `getActivePlan()` reflects externally-written plan state |
| FX501 | NEW | src/test/roadmap/HubSnapshotService.test.ts (extend existing) | HubSnapshotService construction with bus dep subscribes to the SQLite db path resolved via `qorelogicManager.getLedgerManager().getLedgerPath()` (new accessor — see Phase 3); mutation event clears `cachedChainValid` + `chainValidAt` AND triggers re-run of `verifyCheckpointChain()`; subsequent `getCheckpointSummary()` returns fresh chain validity |
| FX502 | MODIFIED | src/test/qorelogic/trust/TrustEngine.test.ts (existing) | TrustEngine construction with bus dep + ledgerManager subscribes to SQLite db path via `ledgerManager.getLedgerPath()`; external db mutation event triggers existing `refreshFromDb()`; assertion: `getAllAgents()` reflects externally-written trust records |
| FX503 | MODIFIED | src/test/roadmap/ConsoleLifecycleService.test.ts (existing or new) | `watchMetaLedger` migrates from raw `fs.watch` to `WorkspaceMutationBus.registerWatcher` with 1500ms debounce preserved; META_LEDGER mutation event still broadcasts `hub.refresh` |

## CI Commands

- `cd FailSafe/extension && npm run compile` — TypeScript clean across new + modified files
- `cd FailSafe/extension && npm test` — mocha extends current baseline; +12 cases land in Phases 1-4
- `cd FailSafe/extension && npm run lint` — ESLint 0 errors in new files
- `cd FailSafe/extension && npm run build:package` — VSIX still builds with the new bus wired in

---

## Phase 1: WorkspaceMutationBus Substrate

### Affected Files

**Tests (red-then-green, declared first per TDD discipline):**

- `FailSafe/extension/src/test/shared/WorkspaceMutationBus.test.ts` — NEW. 5 cases for FX498:
  - `registerWatcher(absPath, onMutation)` returns an object with a `dispose()` method that is a function
  - When `absPath` exists and is mutated (fs.writeFileSync), `onMutation` fires within the debounce window
  - Rapid successive mutations within debounce window coalesce to a single `onMutation` call
  - `dispose()` stops `onMutation` from firing on subsequent mutations
  - ENOENT path → `registerWatcher` returns a no-op Disposable + logs warning (no throw)

**Source (NEW under `src/shared/`):**

- `FailSafe/extension/src/shared/WorkspaceMutationBus.ts` — NEW (≤ 100 lines). Exports `WorkspaceMutationBus` class with single public method:
  ```ts
  registerWatcher(absPath: string, onMutation: () => void, debounceMs?: number): { dispose: () => void };
  ```
  Each call opens its own `fs.watch(absPath)` with `{ persistent: false }`; per-watcher debounce timer (default 200ms; override per-call); fires `onMutation` on `change` event after debounce settles; `dispose()` clears timer + closes the watcher. Failures (unsupported platform, ENOENT, EACCES) log a `[WorkspaceMutationBus]` warning and return a no-op `{ dispose: () => {} }` Disposable so callers don't crash. Pure stdlib (`node:fs`); no chokidar, no new deps.

### Changes

Single-file substrate. The bus is a thin aggregator: it doesn't maintain a global watcher; each `registerWatcher` call holds its own `fs.watch` handle. This keeps the design simple (no path-registry data structure to manage; no shared state across subscribers; each subscription is independent and tear-down is local).

### Unit Tests

Cases declared above. Each test invokes the bus (`registerWatcher`) AND mutates the watched path (`fs.writeFileSync`) AND asserts on the `onMutation` call count (or absence thereof). No presence-only assertions; SG-035 acceptance question survives at each case.

---

## Phase 2: PlanManager Subscription

### Affected Files

**Tests (extend existing):**

- `FailSafe/extension/src/test/planning/PlanManager.test.ts` — EXTEND. New cases for FX499:
  - PlanManager construction with `WorkspaceMutationBus` dep registers watchers on `.failsafe/plans.yaml` + `.qorelogic/roadmap.yaml`
  - Simulated bus-emitted mutation event triggers `refreshFromWorkspace()`; subsequent `getActivePlan()` reflects externally-written plan state (mutation happens via direct file write, not through PlanManager's own API)
  - PlanManager construction without bus dep (back-compat) doesn't throw; behaves as today

**Source (MODIFY):**

- `FailSafe/extension/src/qorelogic/planning/PlanManager.ts` — MODIFY. Constructor signature gains optional `mutationBus?: WorkspaceMutationBus` parameter. When provided, constructor calls `mutationBus.registerWatcher(path.join(workspaceRoot, '.failsafe', 'plans.yaml'), () => this.refreshFromWorkspace())` and the same for `roadmap.yaml`. Disposables stored in a `private disposables: Array<{dispose: () => void}>` and torn down in a new `dispose()` method.

### Changes

One service gains optional DI on its constructor. The bus is plumbed through bootstrap (see Phase 4). Existing tests that construct PlanManager without the bus continue to work unchanged. Existing `refreshFromWorkspace()` method is the callback body — no behavior change inside it, just a new trigger mechanism.

**Scope note (audit cycle 1 F1 remediation)**: L3ApprovalService was originally listed alongside PlanManager in this phase, but audit cycle 1 surfaced that VscodeStateStore wraps `vscode.Memento` (in-process VS Code state with NO filesystem backing file). There is no path for fs.watch to subscribe to. The existing `HubSnapshotService.buildHubSnapshot` (line 134) already pull-calls `qorelogicManager.refreshL3Queue?.()` which forwards to `L3ApprovalService.refreshFromWorkspace()` — the in-process pull mechanism is sufficient. L3ApprovalService is dropped from this cycle's scope; in-process EventBus signaling for L3 queue mutations is a separate-cycle concern (B-SC-6 in Out of Scope).

### Unit Tests

Cases declared above. Tests directly mutate the watched files (`fs.writeFileSync(plans.yaml, ...)`) and assert on observable state change in the service's public API after the bus event propagates.

---

## Phase 3: CheckpointStore refreshChainValidity + HubSnapshotService Subscription

### Affected Files

**Tests (extend existing):**

- `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts` — EXTEND. New cases for FX501:
  - HubSnapshotService construction with bus dep subscribes to the SQLite db path (resolved via `getLedgerManager().getDatabasePath?.()` if available, else falls back to the canonical `.failsafe/ledger/soa_ledger.db`)
  - Mutation event clears `cachedChainValid` + `chainValidAt` on the HubSnapshotService
  - Subsequent `getCheckpointSummary()` triggers re-run of `verifyCheckpointChain()` (asserted via spy on the underlying CheckpointStore call)
  - Construction without bus (back-compat) doesn't throw; behaves as today

**Source (MODIFY):**

- `FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts` — MODIFY. **Add public accessor** (audit cycle 1 F2 remediation):

  ```ts
  getLedgerPath(): string { return this.ledgerPath; }
  ```

  Returns the SQLite db file path (private field `ledgerPath` at line 58, resolved from `configProvider.getLedgerPath()` at line 85). Required so HubSnapshotService + TrustEngine can resolve the watch target without a constructor injection of `configProvider`. Single-line addition; no behavior change for existing callers.

- `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts` — MODIFY. Constructor accepts an optional `mutationBus?: WorkspaceMutationBus` via the `deps` object. When provided, resolves the SQLite db path via `this.deps.qorelogicManager.getLedgerManager().getLedgerPath()` (new accessor above), then subscribes to that path's mutations with a new private `refreshChainValidity()` callback that sets `this.cachedChainValid = null; this.chainValidAt = null` so the next `getCheckpointSummary()` call re-walks the chain via `verifyCheckpointChain()`. Disposable stored alongside any other lifecycle hooks.

- No changes to `CheckpointStore.ts` itself (it's pure functions; the cache lives on HubSnapshotService's instance fields `cachedChainValid` + `chainValidAt` at lines 57-58).

### Changes

The B192 named CheckpointStore as the third stale-cache risk, but the actual cache lives one layer up — on HubSnapshotService's `cachedChainValid` + `chainValidAt` fields. The fix lives where the cache lives. New private method `refreshChainValidity()` is the bus callback; idempotent (calling it twice in a row just re-clears + re-walks).

### Unit Tests

Cases declared above. The test directly mutates the SQLite db file (e.g., `fs.writeFileSync(dbPath, Buffer.alloc(0))` or similar minimal mutation) and asserts on the cache-clear behavior + the `verifyCheckpointChain` call count.

---

## Phase 4: TrustEngine Subscription + watchMetaLedger Migration + Bootstrap Wiring

### Affected Files

**Tests (extend existing):**

- `FailSafe/extension/src/test/qorelogic/trust/TrustEngine.test.ts` — EXTEND. New cases for FX502:
  - TrustEngine construction with bus dep subscribes to the SQLite db path
  - External db file mutation event triggers existing `refreshFromDb()`; subsequent `getAllAgents()` reflects externally-written trust records
  - Construction without bus (back-compat) doesn't throw; existing EventBus subscriptions still work for in-process events
- `FailSafe/extension/src/test/roadmap/ConsoleLifecycleService.test.ts` — NEW or EXTEND. Case for FX503:
  - `watchMetaLedger` calls `WorkspaceMutationBus.registerWatcher` (assertion via spy) instead of raw `fs.watch`
  - 1500ms debounce preserved for this specific subscription
  - Mutation event still broadcasts `hub.refresh` to subscribers

**Source (MODIFY):**

- `FailSafe/extension/src/qorelogic/trust/TrustEngine.ts` — MODIFY. Constructor gains optional `mutationBus?: WorkspaceMutationBus` parameter. When provided + after `initialize()` resolves the db path via the existing `ledgerManager.getLedgerPath()` (new accessor added in Phase 3 per F2 remediation), subscribes the db path mutations to call existing `refreshFromDb()` (line 51). Stored Disposable.
- `FailSafe/extension/src/roadmap/services/ConsoleLifecycleService.ts` — MODIFY. `watchMetaLedger()` (lines 76-87) migrates from raw `fs.watch` to `WorkspaceMutationBus.registerWatcher(ledgerPath, () => this.deps.broadcast({type: 'hub.refresh'}), 1500)`. Disposable stored in `this.ledgerWatcherDispose` (replacing the existing `this.ledgerWatcher` FSWatcher). Class-level cleanup tears down the Disposable on extension deactivate.
- `FailSafe/extension/src/extension/bootstrapCore.ts` — MODIFY. Construct `new WorkspaceMutationBus()` alongside existing `new EventBus()`; add `workspaceMutationBus` to the `CoreSubstrate` return type.
- `FailSafe/extension/src/extension/bootstrapServers.ts` — MODIFY. Pass `deps.workspaceMutationBus` through to ConsoleServer's deps + HubSnapshotService construction.
- `FailSafe/extension/src/extension/bootstrapSentinel.ts` (or wherever PlanManager / L3ApprovalService / TrustEngine are constructed) — MODIFY. Thread `workspaceMutationBus` through to each constructor.

### Changes

Bootstrap wiring is the load-bearing change; without it, none of the Phases 1-3 subscriptions actually fire in production. Each modified constructor accepts the bus as an OPTIONAL parameter so existing test fixtures that construct these services directly (with no bus) don't need updates unless they explicitly want event-driven refresh behavior.

### Unit Tests

Cases declared above. The watchMetaLedger migration test asserts that the bus's `registerWatcher` is called (via spy) and the raw `fs.watch` is NOT called.

---

## Phase 5: Docs + FEATURE_INDEX + CHANGELOG + Memory

### Affected Files

- `docs/governance-cache-invalidation.md` — NEW. Describes the architecture: WorkspaceMutationBus contract, subscriber catalog (which services subscribe to which paths), debounce policy, FailSafe-Pro-coexistence behavior, fallback (HubSnapshotService pull-calls remain as belt-and-suspenders).
- `docs/FEATURE_INDEX.md` — APPEND FX498–FX503 entries; mark `verified` as Phase 1-4 tests land.
- `CHANGELOG.md` — APPEND under existing `[Unreleased] — v5.2.0 (draft)` block: stale-cache remediation entry summarizing the bus + subscribers + Pro-coexistence.
- `FailSafe/extension/README.md` — APPEND bullet under "What's New (Unreleased)" pointing at the new doc.
- `README.md` (root) — APPEND bullet under "Upcoming".
- Memory (out-of-tree): NEW `reference_workspace_mutation_bus.md` describing the architecture for future cycles; link in `MEMORY.md`.

### Changes

Doc-only phase. Standard Section 5 pattern matching prior cycles (bicameral / voice-pack).

---

## Phase Affected Files Summary

**Phase 1** (substrate): 1 NEW source file + 1 NEW test file.
**Phase 2** (PlanManager subscription — L3ApprovalService dropped per F1): 1 MODIFIED source file + 1 EXTENDED test file.
**Phase 3** (LedgerManager.getLedgerPath accessor + HubSnapshotService refreshChainValidity): 2 MODIFIED source files + 1 EXTENDED test file.
**Phase 4** (TrustEngine + watchMetaLedger migration + bootstrap wiring): 2 MODIFIED source files + 3 MODIFIED bootstrap files + 1-2 EXTENDED test files.
**Phase 5** (docs): 5 modified docs (1 new architecture doc + FEATURE_INDEX + CHANGELOG + 2 READMEs) + 1 NEW memory file.

Total: 1 new source + 8 modified source + 1 new test + 4 modified tests + 1 new doc + 4 modified docs + 1 memory.

## Acceptance Criteria

- All 3 fs-backed cache-vulnerable services (PlanManager / HubSnapshotService.CheckpointStore cache / TrustEngine) refresh observably when their watched paths are mutated externally.
- `ConsoleLifecycleService.watchMetaLedger` migrated to the bus; raw `fs.watch` removed from that surface.
- `LedgerManager.getLedgerPath()` accessor added (F2 remediation).
- All existing tests continue to pass; new bus-driven tests cover the cache-invalidation behavior.
- HubSnapshotService's defensive `refreshFromWorkspace?.()` calls remain (belt-and-suspenders).
- No new npm dependencies (Node stdlib `fs.watch` only).
- Cycle ends with stage-only review boundary honored: no GitHub Release, no marketplace publish, no version bump.

## Out of Scope (Backlog Candidates)

- **B-SC-1** — Periodic fallback poll for Windows fs.watch reliability (e.g., 30s mtime check on critical paths). Defer until reliability is observably bad.
- **B-SC-2** — Operator-tunable debounce timings via VS Code settings. Currently hardcoded (200ms default + 1500ms META_LEDGER override).
- **B-SC-3** — Cross-process IPC for Pro coexistence (vs the current shared-filesystem-only approach). Lives in Pro repo.
- **B-SC-4** — SentinelDaemon governance-file extension support (B193 — its own plan cycle).
- **B-SC-5** — Periodic chain-validity re-check (independent of mutation events). Currently only re-checked on file mutation; would catch silent corruption.
- **B-SC-6** — L3ApprovalService in-process EventBus subscription for queue mutations (per audit cycle 1 F1). VscodeStateStore is Memento-backed, no filesystem to watch. The existing `HubSnapshotService.buildHubSnapshot` → `qorelogicManager.refreshL3Queue()` pull-call already handles staleness; an EventBus-driven alternative is a separate-cycle architectural choice (could publish `qorelogic.l3Queue.mutated` events on writes). Not blocking; pull mechanism works today.
