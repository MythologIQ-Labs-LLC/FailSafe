# Plan: v5.1.0 Remaining Publish Scope

**change_class**: feature

**doc_tier**: standard

**terms_introduced**:
- term: WorkspaceTruthRefresh
  home: docs/FEATURE_INDEX.md
- term: GovernanceWatchSurface
  home: docs/FEATURE_INDEX.md
- term: InstallVersionFloor
  home: docs/FEATURE_INDEX.md

**boundaries**:
- limitations: This plan closes the remaining v5.1.0 publish scope; it does not repair the broken META_LEDGER Entry #331 chain.
- non_goals: B195 voice asset unbundling remains deferred to v5.2.0; FailSafe Pro daemon detection remains deferred until Pro launch.
- exclusions: No marketplace publish, version bump, release tag, or historical ledger hash rewrite occurs in this plan.
- precondition: The Entry #331 ledger repair lane was completed by Phase 61 (sealed at Entry #338, 2026-05-13). Runtime implementation now requires only that this Phase 60 plan re-audits PASS.

## Open Questions

- None. B195 is out of scope for v5.1.0; D/TtsEngine flake is already sealed at Entry #319.

## Scope Baseline

- Current FEATURE_INDEX state: 476 total, 411 verified, 22 unverified, 43 n/a.
- Remaining v5.1.0 scope: B192, B193, B194, B197, B198, and B199 Phase 2+ closure from 22 unverified to 0.
- Already sealed: A/B200, C/stale-override detector, D/TtsEngine flake.

## Phase 0: Refactor Enablement Gate

### Affected Files

- `FailSafe/extension/src/qorelogic/planning/PlanManager.ts` - refactor into a <=250-line facade before adding workspace refresh behavior.
- `FailSafe/extension/src/qorelogic/planning/PlanPersistenceStore.ts` - NEW; own `plans.yaml` load/save and refresh.
- `FailSafe/extension/src/qorelogic/planning/RoadmapPersistenceStore.ts` - NEW; own roadmap YAML load/save and refresh.
- `FailSafe/extension/src/qorelogic/planning/PlanStateDeriver.ts` - NEW; own event replay and derived plan state.
- `FailSafe/extension/src/sentinel/SentinelDaemon.ts` - refactor into a <=250-line daemon facade before expanding governance watch coverage.
- `FailSafe/extension/src/sentinel/SentinelWatchPolicy.ts` - NEW; own watched extensions, governance path predicates, and ignore policy.
- `FailSafe/extension/src/sentinel/SentinelEventQueue.ts` - NEW; own event construction, priority sorting, and queue cap.
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` - refactor into a <=250-line composition root before adding refresh calls.
- `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts` - NEW; own hub snapshot assembly and pre-snapshot workspace refresh.
- `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts` - NEW; own route registration and `ApiRouteDeps` construction.
- `FailSafe/extension/src/roadmap/services/ConsoleLifecycleService.ts` - NEW; own start/stop/server registry lifecycle if needed to bring `ConsoleServer.ts` under cap.
- `FailSafe/extension/src/test/planning/PlanManager.test.ts` - extend existing tests for facade/store behavior.
- `FailSafe/extension/src/test/sentinel/SentinelWatchPolicy.test.ts` - NEW; assert watched extension and governance path classification.
- `FailSafe/extension/src/test/sentinel/SentinelEventQueue.test.ts` - NEW; assert priority ordering and queue cap.
- `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts` - NEW; assert snapshot assembly invokes refresh hooks before reading state.
- `FailSafe/extension/src/test/roadmap/ConsoleRouteRegistrar.test.ts` - NEW; assert route registration wires the existing route modules without orphan handlers.

### Changes

- Split first, then add behavior. Phase 2 cannot add new methods or calls to the over-cap files until this phase brings each target facade to <=250 lines.
- Keep extracted helpers behavior-preserving: move existing logic behind named modules, preserve imports, public APIs, emitted events, and route paths.
- `PlanManager.ts` becomes orchestration only: constructor wiring, public plan API, event append API, and delegation to stores/deriver.
- `SentinelDaemon.ts` keeps lifecycle and verdict processing; watch filtering and queue mechanics move to dedicated helpers.
- `ConsoleServer.ts` keeps dependency composition and external public methods; hub snapshot assembly and route registration move out.
- No new dependencies. No release/publish/version work.

### Unit Tests

- Existing `PlanManager.test.ts` covers that extracted stores preserve current load/save/replay behavior.
- `SentinelWatchPolicy.test.ts` invokes the policy directly for `.ts`, `.md`, `.json`, `.yaml`, deleted files, and selected `.failsafe/**` paths.
- `SentinelEventQueue.test.ts` invokes queue insertion with mixed priorities and asserts deterministic order plus 100-event cap.
- `HubSnapshotService.test.ts` invokes snapshot assembly with fake services and asserts refresh hooks run before data reads.
- `ConsoleRouteRegistrar.test.ts` invokes route registration with fake Express app and asserts expected route paths are registered.

### Refactor Verification

- Each edited implementation file must be <=250 lines after the split.
- Each new function must be <=40 lines, nesting depth <=3, and no nested ternaries.
- Existing route paths, watcher event types, EventBus names, and public service APIs must remain behavior-compatible.

## Phase 1: Scope Sync and Coverage Ledger

### Affected Files

- `docs/FEATURE_INDEX.md` - update counts and rows as each phase closes entries.
- `.failsafe/governance/V5_1_0_SCOPE.md` - move A/C/D to sealed, update B count from 46 to 22, keep B195 deferred to v5.2.0.
- `docs/SYSTEM_STATE.md` - reflect the v5.1.0 remaining-scope plan and publish-block status.
- `FailSafe/extension/src/test/scripts/featureIndexClassifierStaleness.test.cjs` - modify; existing classifier-staleness regression coverage. Phase 60 §1 extends its assertion set to validate the post-Phase-62 override count (26 entries) and zero-redundant baseline. Note camelCase filename; the kebab-case name in the prior plan revision was a naming-convention mismatch.
- `FailSafe/extension/src/test/scripts/featureIndexClassifier.test.cjs` - modify; existing classifier summary-count coverage. Phase 60 §1 extends to assert the FEATURE_INDEX summary counts after the §1 scope sync. Note camelCase filename.

### Changes

- Replace stale "46 unverified" scope text with current 22-entry baseline.
- Mark D/TtsEngine flake as sealed rather than pending.
- Keep B195 explicitly deferred with the prompt-on-enable voice asset download direction.
- Add a short "remaining unverified bucket" table grouped by implementation surface. Reflects post-Phase-62 state (FX128 and FX359 removed from `MANUAL_OVERRIDES` at Entries #341-#342 as redundant overrides; their FEATURE_INDEX status is now classifier-determined and re-classified during this §1 scope-sync pass):
  - governance mode / observe-enforce UX: FX044, FX244
  - console / monitor / command center UI: FX145, FX154, FX173, FX174, FX409, FX419 (plus FX128 if classifier-redetermined-unverified after Phase 62 override removal)
  - voice and audio verification: FX196, FX198, FX219, FX221, FX222, FX227, FX231
  - hooks / checkpoint / sentinel / skill provenance / workspace seeding: FX166, FX236, FX258, FX261, FX435 (plus FX359 if classifier-redetermined-unverified after Phase 62 override removal)

### Unit Tests

- `featureIndexClassifierStaleness.test.cjs` invokes the staleness detector and asserts `total_overrides_checked === 26` (post-Phase-62 floor) plus `redundant_count === 0`.
- `featureIndexClassifier.test.cjs` invokes the classifier driver against the current `docs/FEATURE_INDEX.md` and asserts `summary.byCurrentStatus` matches the header narrative.

## Phase 2: Workspace Truth Refresh and Governance Watch Surface

### Affected Files

- `FailSafe/extension/src/qorelogic/planning/PlanManager.ts` - after Phase 0 split, expose `refreshFromWorkspace()` as a facade delegation only.
- `FailSafe/extension/src/qorelogic/planning/PlanPersistenceStore.ts` - implement the `plans.yaml` refresh path.
- `FailSafe/extension/src/qorelogic/planning/RoadmapPersistenceStore.ts` - implement the roadmap YAML refresh path.
- `FailSafe/extension/src/qorelogic/L3ApprovalService.ts` - add `refreshFromWorkspace()` that reloads persisted `l3Queue` before hub snapshots and queue views.
- `FailSafe/extension/src/sentinel/SentinelDaemon.ts` - after Phase 0 split, delegate file inclusion decisions to `SentinelWatchPolicy`.
- `FailSafe/extension/src/sentinel/SentinelWatchPolicy.ts` - include governance extensions and selected `.failsafe/**` files in watcher events.
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` - after Phase 0 split, inject refresh-capable services into `HubSnapshotService`; no snapshot assembly logic remains here.
- `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts` - call service refresh methods before building hub snapshots and route models that expose governance state.
- `FailSafe/extension/src/test/planning/PlanManager.test.ts` - add reload-after-external-write cases.
- `FailSafe/extension/src/test/qorelogic/L3ApprovalService.test.ts` - add reload-after-state-store-mutation case.
- `FailSafe/extension/src/test/sentinel/SentinelWatchPolicy.test.ts` - add governance-file classification cases for `.md`, `.json`, `.yaml`, and `.failsafe/workspace-config.json`.
- `FailSafe/extension/src/test/sentinel/SentinelEventQueue.test.ts` - add governance-file queueing cases using the extracted queue helper.
- `FailSafe/extension/src/test/roadmap/monitor-state-coherence.test.ts` - assert hub rebuild reflects workspace file updates.
- `FailSafe/extension/src/test/roadmap/HubSnapshotService.test.ts` - assert refresh-before-read ordering at the extracted service boundary.

### Changes

- Keep refresh methods explicit and side-effect bounded: reload cached values only; do not start watchers or write files.
- Replace the code-extension-only event filter with a named `WATCHED_EXTENSIONS` set and `WATCHED_GOVERNANCE_PATHS` predicate.
- Keep delete events visible for all watched paths.
- Source Monitor state from refreshed workspace data before using stale in-memory state.
- Do not add snapshot logic back into `ConsoleServer.ts`; `HubSnapshotService` owns the implementation.
- Update FEATURE_INDEX rows FX145 and FX154 when monitor proof is functional.

### Unit Tests

- `PlanManager.test.ts` invokes `refreshFromWorkspace()` after mutating `plans.yaml` and asserts `getAllPlans()` changes.
- `L3ApprovalService.test.ts` mutates the state store after construction, invokes `refreshFromWorkspace()`, and asserts `getQueue()` returns the new queue.
- `SentinelWatchPolicy.test.ts` invokes the path predicate directly and asserts governance files are watched.
- `SentinelEventQueue.test.ts` invokes queue insertion for governance files and asserts queued events are not dropped.
- `monitor-state-coherence.test.ts` changes the backing plan/audit fixture, triggers a hub rebuild through `HubSnapshotService`, and asserts the rendered Monitor state changes.

## Phase 3: Governance Mode Escalation and Install Version Floor

### Affected Files

- `FailSafe/extension/src/governance/EnforcementEngine.ts` - expose a typed governance mode state with explicit `defaulted` signal when config is absent.
- `FailSafe/extension/src/governance/GovernanceStatusBar.ts` - surface Observe/Assist/Enforce mode and defaulted observe state.
- `FailSafe/extension/src/extension/commands.ts` - keep `failsafe.setGovernanceMode` as the single command mutation path and ensure it emits user-visible confirmation.
- `FailSafe/extension/src/roadmap/routes/SettingsRoute.ts` - include governance mode and Qor package version status in the Settings route model.
- `FailSafe/extension/src/roadmap/ui/modules/settings.js` - render governance mode escalation controls and Qor package version warning.
- `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts` - install `qor-logic` with a minimum version and report below-floor installations.
- `FailSafe/extension/src/qorlogic/hostLayouts.ts` - keep the minimum version constant near host layout compatibility text.
- `FailSafe/extension/src/test/governance/GovernanceStatusBar.test.ts` - assert status text for observe, assist, enforce, and defaulted observe.
- `FailSafe/extension/src/test/extension/commands-state.test.ts` - assert `failsafe.setGovernanceMode` persists the selected mode and emits notification.
- `FailSafe/extension/src/test/roadmap/settings-coherence.test.ts` - assert Settings renders escalation controls and package warning states.
- `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts` - assert minimum-version install args and below-floor report.

### Changes

- Do not add a second governance-mode mutation path.
- Add one Settings card control that delegates to the existing command path.
- Use list-form Python argv for install and version checks; no shell command strings.
- Parse `pip show qor-logic` version and compare against the minimum version constant.
- Update FEATURE_INDEX rows FX044, FX244, FX359, and any Settings rows affected by the new warnings.

### Unit Tests

- `GovernanceStatusBar.test.ts` invokes the renderer/update path and asserts exact mode label and default warning state.
- `commands-state.test.ts` selects each mode through the QuickPick stub and asserts workspace config plus notification output.
- `settings-coherence.test.ts` renders Settings with observe/defaulted state and below-floor Qor version, then asserts controls and warning text.
- `QorLogicPackageInstaller.test.ts` invokes `install()` and `version()` with fake runner outputs and asserts minimum-version behavior.

## Phase 4: UI Subscription Hygiene and Remaining Feature Index Closure

### Affected Files

- `FailSafe/extension/src/roadmap/ui/modules/settings.js` - make Settings event binding idempotent and preserve install-card targeted refresh behavior.
- `FailSafe/extension/src/roadmap/ui/modules/operations.js` - add destroy/unsubscribe or idempotent render guards for cached hub data.
- `FailSafe/extension/src/roadmap/ui/modules/brainstorm.js` - stop hidden-tab heartbeat and cancel timers on destroy.
- `FailSafe/extension/src/roadmap/ui/modules/brainstorm-visualizer.js` - cancel animation frame on destroy.
- `FailSafe/extension/src/roadmap/ui/modules/toasts.js` or current toast renderer module - assert severity gating from actual rendered output.
- `FailSafe/extension/src/test/roadmap/settings-coherence.test.ts` - add duplicate-render listener hygiene assertions.
- `FailSafe/extension/src/test/roadmap/operations-phase-progress.test.ts` - assert re-render uses fresh hub data.
- `FailSafe/extension/src/test/roadmap/brainstorm-listener-hygiene.test.ts` - NEW; assert destroy clears timers/listeners.
- `FailSafe/extension/src/test/roadmap/toast-severity-gating.test.ts` - assert rendered warning/error visibility from severity inputs.
- `FailSafe/extension/src/test/roadmap/console-routes.test.ts` - assert GET `/console/agents` renders the agent coverage model.
- `FailSafe/extension/src/test/roadmap/SreRoute.test.ts` - assert SRE Activity Feed renders ALLOW, DENY, and AUDIT event rows.
- `FailSafe/extension/src/test/economics/economics-dashboard.test.ts` - NEW; assert token dashboard renders cost and aggregate rows from service output.
- `FailSafe/extension/src/test/qorelogic/WorkspaceMigration.test.ts` - assert `.failsafe/` seeding updates feature-index row FX435 through observable migration output.

### Changes

- Give each UI module a deterministic `destroy()` or idempotent `bind()` path.
- Replace repeated full-card rebinds with targeted DOM replacement where state updates are local.
- Do not rewrite Command Center layout.
- Add functional tests for every remaining non-governance unverified row.
- Reclassify voice rows only when tests invoke the unit and assert output/state, not when they merely cite existing files.
- Update FEATURE_INDEX rows FX128, FX166, FX173, FX174, FX196, FX198, FX219, FX221, FX222, FX227, FX231, FX236, FX258, FX261, FX409, FX419, and FX435 as tests land.

### Unit Tests

- `settings-coherence.test.ts` renders Settings twice, triggers a single click/change event, and asserts one state mutation.
- `operations-phase-progress.test.ts` renders two hub payloads and asserts the second payload replaces stale phase data.
- `brainstorm-listener-hygiene.test.ts` creates and destroys the module, then asserts intervals/rAF/listeners stop receiving events.
- `toast-severity-gating.test.ts` invokes the toast renderer with info/warn/error and asserts threshold behavior from rendered DOM.
- `console-routes.test.ts`, `SreRoute.test.ts`, and `economics-dashboard.test.ts` invoke the real route/template functions and assert rendered HTML content from model inputs.
- Existing voice tests are extended only where they can invoke `VoiceController`, `SttEngine`, `TtsEngine`, or settings renderers and assert state/output transitions.

## Phase 5: Publish-Block Verification

### Affected Files

- `docs/FEATURE_INDEX.md` - final v5.1.0 coverage state.
- `.failsafe/governance/PUBLISH_BLOCK.md` - flip or remove only after FEATURE_INDEX has 0 unverified entries.
- `docs/SYSTEM_STATE.md` - update v5.1.0 publish-readiness state.
- `FailSafe/extension/scripts/check-e2e-coverage.cjs` - keep release-class coverage enforcement aligned with final feature-index state.
- `FailSafe/extension/src/test/scripts/check-e2e-coverage.test.cjs` - NEW; release-class coverage gate regression coverage.

### Changes

- Run classifier and manual review reconciliation.
- Require every FEATURE_INDEX entry to be `verified` or operator-justified `n/a`.
- Keep `package.json` at `5.1.0`; this plan does not bump version.
- Do not publish until a later `/qor-substantiate` release-class seal and release workflow pass.

### Unit Tests

- `FailSafe/extension/src/test/scripts/feature-index-classifier.test.cjs` asserts final summary has 0 unverified entries.
- `FailSafe/extension/src/test/scripts/check-e2e-coverage.test.cjs` asserts release-class changes fail when a touched UI/route/command surface lacks a functional spec.

## CI Commands

- `cd FailSafe/extension; npm run compile` - TypeScript compilation.
- `cd FailSafe/extension; npm test -- --runInBand` - extension test suite with deterministic serial execution.
- `cd FailSafe/extension; npx playwright test` - browser UI coverage for Monitor, Command Center, Settings, and popout surfaces.
- `cd FailSafe/extension; node ./scripts/check-e2e-coverage.cjs --change-class feature --repo-root ../..` - release-class coverage gate.
- `cd FailSafe/extension; node ./scripts/feature-index-classifier.cjs --repo-root ../..` - final FEATURE_INDEX verification counts.
- `node FailSafe/extension/scripts/check-governance-canaries.cjs --repo-root .` - governance markdown canary scan.
