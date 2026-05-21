# Plan: Batch 4 — B-BIC-17/18 bicameral governance integration (v2)

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**Risk Grade**: L2 — introduces a new event-bus channel and wires bicameral verdicts into Sentinel classification + the Risks Register; no health/safety/legal impact.
**Branch**: `feat/b151-governance-interceptor` working tree (cycle 4 of 4; Review Boundary — uncommitted, operator commits at handoff).
**Issue**: B-BIC-17, B-BIC-18 (FailSafe extension BACKLOG).
**Scope**: surface bicameral verdict events into the FailSafe governance core — Sentinel priority classification (B-BIC-17) and a Risks Register mirror for drifted decisions (B-BIC-18). Both consume one new `bicameral.verdict` event.

> **v2** — addresses audit #1 VETO: F1 (route deps thread through `ConsoleRouteRegistrar`, not `bootstrapBicameral`), F2 (risks are untyped `Record<string,unknown>` — no fabricated schema), F3 (the `RiskRegisterManager` wiring channel is now defined concretely), F4 (the event defines its own `verdict` enum — `BicameralDriftStatus` has no `'ratified'`).
> **v3** — addresses audit #2 VETO F5: the `ConsoleRouteHost` interface has no `eventBus` member, so `eventBus` must be added to that interface AND populated in `ConsoleServer.buildRouteHost()` before the registrar can thread it into the route deps. `ConsoleServer.ts` is added to Phase 1 Affected Files.

**terms_introduced**:
- term: bicameral.verdict event
  home: FailSafe/extension/src/shared/types/events.ts
- term: DriftToRiskMediator
  home: FailSafe/extension/src/integrations/bicameral/DriftToRiskMediator.ts

**boundaries**:
- limitations: B-BIC-17 is **classification-only** — bicameral verdicts get a Sentinel priority + notify flag; they do NOT enter full `VerdictArbiter` arbitration (arbitration requires a readable file artifact). B-BIC-17's BACKLOG text asks exactly for "priority/notification classification" — this is in scope; arbitration is not.
- non_goals: changing the bicameral MCP client/transport; changing `VerdictArbiter`; a bespoke UI for the new risk entries (they render through the existing Risks tab automatically).
- exclusions: the B151 `McpInterceptor` path and the 3 migrated tool endpoints' response shapes are unchanged — Batch 4 only *adds* an event emit alongside the existing handlers.

## Resolved Decisions

- **RD-1 — One shared `bicameral.verdict` event with its own verdict enum.** No `bicameral.*` member exists in `FailSafeEventType`. A single `bicameral.verdict` event is added to `shared/types/events.ts`. **The event defines its own `verdict` enum — `'drifted' | 'in-sync' | 'ratified'`** — it does NOT reuse `BicameralDriftStatus.status` (`'in-sync'|'drifted'|'unknown'`, no `ratified`) nor `BicameralRatifyVerdict` (`'ratify'|'reject'`). Payload: `{ decisionId: string, verdict: 'drifted'|'in-sync'|'ratified', decisionTitle?: string, evidence?: string }`. The drift handler maps each `BicameralDriftStatus` to the event verdict (`drifted`→`'drifted'`, `in-sync`→`'in-sync'`, `unknown`→ skip); the ratify handler emits `verdict:'ratified'`.
- **RD-2 — B-BIC-17 is classification-only.** `SentinelWatchPolicy` is today a pure file-path classifier. B-BIC-17 adds a sibling pure method `classifyBicameralVerdict(verdict)` returning `{ priority, notify }` — `'drifted'` → `{priority:'high', notify:true}`, `'ratified'`/`'in-sync'` → `{priority:'normal', notify:false}`. It does NOT make a verdict a `SentinelEvent` nor route it to `VerdictArbiter`.
- **RD-3 — B-BIC-18 via a `DriftToRiskMediator`; risks are untyped records.** `RiskRegisterManager` stores risks as `Array<Record<string, unknown>>` (no typed schema; verified `RiskRegisterManager.ts:23/29`). B-BIC-18 adds `upsertRisk(risk: Record<string, unknown>)` (idempotent on the `id` key) and `closeRisk(id: string)`. A new `DriftToRiskMediator` (mirroring `DriftToL3Mediator`) consumes `bicameral.verdict`: `'drifted'` upserts a risk record keyed `bicameral:{decisionId}`; `'ratified'` closes it. The risk record the mediator writes carries the keys the existing Risks-tab CRUD route already uses (`id`, `title`, `severity`, `status`, `description`, `createdAt`) — but since the store is untyped, only `id` and `status` are load-bearing (upsert key + close target) and the tests assert only those.
- **RD-4 — Route-deps + RiskRegisterManager wiring channels (audit F1/F3/F5).** The bicameral route deps are assembled in `ConsoleRouteRegistrar.ts` at the `setupBicameralRoutes(app, {...})` call (`:226`), NOT in `bootstrapBicameral.ts`. The registrar reaches dependencies through the `ConsoleRouteHost` interface (`ConsoleRouteRegistrar.ts:35-79`), which today has **no `eventBus` member** — so `eventBus` is added to the `ConsoleRouteHost` interface and populated in `ConsoleServer.buildRouteHost()` (`ConsoleServer.ts:264-302`, the exact pattern `getMcpInterceptor`/`getBicameralOpenFileInEditor` already follow), then threaded from `host.eventBus` into the `setupBicameralRoutes` deps. `RiskRegisterManager` is held by `ConsoleServer`; it is delivered to the `DriftToRiskMediator` by adding a `riskRegister` field to `BicameralIntegrationDeps` and passing it at the `wireBicameralIntegration(...)` call site in `bootstrapServers.ts:96` (sourced from `consoleServer`).

## Open Questions

- **OQ-A** — the mediator's risk record. Default: `{ id: 'bicameral:'+decisionId, title: 'Bicameral decision drift: '+(decisionTitle||decisionId), severity: 'medium', status: 'open', description: evidence||'', createdAt: <ISO> }`. `closeRisk` sets `status:'closed'`. The store is untyped `Record<string,unknown>` so these keys are de-facto (matching the existing Risks-tab CRUD payload); `id` and `status` are the only behaviourally-load-bearing keys.

## Phase 1 — The `bicameral.verdict` event channel

### Affected Files (tests first)

**NEW (tests)**
- `FailSafe/extension/src/test/roadmap/routes/BicameralRoute.verdict-event.test.ts` — FX580 (4 cases)

**MODIFIED**
- `FailSafe/extension/src/shared/types/events.ts` — add `bicameral.verdict` to `FailSafeEventType` with the RD-1 payload (own `verdict` enum).
- `FailSafe/extension/src/roadmap/routes/BicameralRoute.ts` — `BicameralRouteDeps` gains an optional `eventBus` handle; the `bicameral-drift` handler emits one `bicameral.verdict` per `drifted`/`in-sync` decision in its result (skipping `unknown`); the `bicameral-ratify` handler emits a `bicameral.verdict` with `verdict:'ratified'`. Emits are non-blocking and absent-eventBus-safe.
- `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts` — add an `eventBus` member to the `ConsoleRouteHost` interface (`:35-79`); at the `setupBicameralRoutes(app, {...})` call (`:226`), thread `host.eventBus` into the route deps.
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — populate `eventBus: this.eventBus` in the `buildRouteHost()` return object (`:264-302`), mirroring the existing `getMcpInterceptor` field.

### Unit tests

| File | Cases | Asserts behaviour |
|---|---|---|
| FX580 BicameralRoute.verdict-event.test.ts | 4 | the `bicameral-drift` handler, given a result with two `drifted` decisions, emits two `bicameral.verdict` events each carrying the `decisionId` + `verdict:'drifted'`; an `in-sync`-only result emits `verdict:'in-sync'` events (and `unknown` rows emit nothing); the `bicameral-ratify` handler emits one `bicameral.verdict` with `verdict:'ratified'` + the `decisionId`; with no `eventBus` wired, both handlers still succeed and emit nothing (no throw). |

## Phase 2 — B-BIC-17: Sentinel verdict classification

### Affected Files

**NEW (tests)**
- `FailSafe/extension/src/test/sentinel/SentinelWatchPolicy.bicameral.test.ts` — FX581 (3 cases)

**MODIFIED**
- `FailSafe/extension/src/sentinel/SentinelWatchPolicy.ts` — new pure method `classifyBicameralVerdict(verdict: string): { priority: 'high'|'normal'; notify: boolean }`.

### Unit tests

| File | Cases | Asserts behaviour |
|---|---|---|
| FX581 SentinelWatchPolicy.bicameral.test.ts | 3 | `classifyBicameralVerdict('drifted')` → `{priority:'high', notify:true}`; `classifyBicameralVerdict('ratified')` and `'in-sync'` → `{priority:'normal', notify:false}`; an unknown verdict → the safe `{priority:'normal', notify:false}` default. |

## Phase 3 — B-BIC-18: Risks Register mirror

### Affected Files

**NEW (tests)**
- `FailSafe/extension/src/test/roadmap/RiskRegisterManager.keyed.test.ts` — FX582 (4 cases)
- `FailSafe/extension/src/test/integrations/bicameral/DriftToRiskMediator.test.ts` — FX583 (5 cases)

**NEW (impl)**
- `FailSafe/extension/src/integrations/bicameral/DriftToRiskMediator.ts` — consumes `bicameral.verdict`; on `verdict:'drifted'` calls `riskRegister.upsertRisk(...)` keyed `bicameral:{decisionId}`; on `verdict:'ratified'` calls `riskRegister.closeRisk('bicameral:'+decisionId)`; `'in-sync'` is a no-op. Typed against a minimal local `RiskRegisterDeps` interface (`{ upsertRisk(r): void; closeRisk(id): void }`) — mirrors `DriftToL3Mediator`'s `L3ApprovalQueueDeps`, no import cycle. Exception-isolated.

**MODIFIED**
- `FailSafe/extension/src/roadmap/services/RiskRegisterManager.ts` — `upsertRisk(risk: Record<string,unknown>)` (find by the `id` key in the loaded list; replace in place or append; `writeRisks`) and `closeRisk(id: string)` (find by `id`, set `status:'closed'`, `writeRisks`; no-op when absent). Both built on the existing `getRisks`/`writeRisks`.

### Unit tests

| File | Cases | Asserts behaviour |
|---|---|---|
| FX582 RiskRegisterManager.keyed.test.ts | 4 | `upsertRisk` on a fresh register appends the record; `upsertRisk` with an existing `id` replaces in place (list length unchanged, no duplicate `id`); `closeRisk(id)` sets that record's `status` to `'closed'`; `closeRisk` on an unknown id is a no-op (no throw, register unchanged). |
| FX583 DriftToRiskMediator.test.ts | 5 | a `bicameral.verdict` with `verdict:'drifted'` → `upsertRisk` called once with `id='bicameral:'+decisionId` and `status:'open'`; two drifted verdicts for distinct decisions → two upserts with distinct ids; a repeat drifted verdict for the same decision → `upsertRisk` again with the same id (idempotent — RiskRegisterManager dedups); `verdict:'ratified'` → `closeRisk('bicameral:'+decisionId)` once; a thrown `upsertRisk`/`closeRisk` is swallowed (the mediator never propagates). |

## Phase 4 — Wiring + Documentation

### Affected Files

**MODIFIED**
- `FailSafe/extension/src/extension/bootstrapBicameral.ts` — `BicameralIntegrationDeps` gains a `riskRegister` field; `wireBicameralIntegration` constructs the `DriftToRiskMediator` from it and subscribes both consumers (the Sentinel classifier path and the `DriftToRiskMediator`) to the `bicameral.verdict` event on `deps.eventBus`.
- `FailSafe/extension/src/extension/bootstrapServers.ts` — at the `wireBicameralIntegration(...)` call (`:96`), pass `riskRegister` (obtained from `consoleServer`) in the deps object.
- `docs/FEATURE_INDEX.md` — four rows FX580-FX583.
- `docs/INTEGRATIONS.md` — short note: bicameral drift surfaces as Sentinel-classified events + Risks Register entries; ratify closes them.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX580 | NEW | `src/test/roadmap/routes/BicameralRoute.verdict-event.test.ts` | `BicameralRoute` drift/ratify handlers emit `bicameral.verdict` events (one per drifted/in-sync decision; one `ratified` on ratify); eventBus-absent-safe. |
| FX581 | NEW | `src/test/sentinel/SentinelWatchPolicy.bicameral.test.ts` | `SentinelWatchPolicy.classifyBicameralVerdict` maps `drifted`→high/notify, `ratified`/`in-sync`→normal, unknown→safe default. |
| FX582 | NEW | `src/test/roadmap/RiskRegisterManager.keyed.test.ts` | `RiskRegisterManager.upsertRisk`/`closeRisk` give keyed idempotent create + close-by-id over the untyped risk store. |
| FX583 | NEW | `src/test/integrations/bicameral/DriftToRiskMediator.test.ts` | `DriftToRiskMediator` mirrors `bicameral.verdict` to the Risks Register — drift upserts a `bicameral:{decisionId}` risk, ratify closes it; exception-isolated. |

## Boundary Preservation Rules

1. The `bicameral.verdict` emit is additive in the drift/ratify handlers — the existing response bodies, the `DriftToL3Mediator` forward, and the B-BIC-1 ledger append are unchanged.
2. `DriftToRiskMediator` depends on a minimal local `RiskRegisterDeps` interface, not a hard `RiskRegisterManager`/`ConsoleServer` import — no cycle.
3. `SentinelWatchPolicy.classifyBicameralVerdict` is a pure sibling method; `SentinelDaemon`'s file-watch path and `VerdictArbiter` are untouched.
4. `RiskRegisterManager` gains two methods built on its existing `getRisks`/`writeRisks` — no storage-format change to `risks.json`.

## CI Commands

- `npm --prefix FailSafe/extension run compile` — `tsc -p ./` + `copy-ui-js.cjs`.
- `npm --prefix FailSafe/extension test -- --grep "bicameral|SentinelWatchPolicy|RiskRegister|DriftToRisk"` — scoped Mocha for FX580-FX583.
- Degraded posture: all four FX suites are pure-logic / fs-based and run under plain `npx mocha` on the compiled `out/` tree; `vscode-test` is blocked by the stuck `vscode-updating` mutex.
- `npm --prefix FailSafe/extension run lint` — eslint clean on new + modified files.

## Risk Grade L2 — Impact Assessment

- **purpose**: make bicameral decision-drift visible in the two governance surfaces operators already watch — Sentinel priority/notification, and the Risks Register — instead of drift being siloed in the bicameral card.
- **affected_stakeholders**: operators using bicameral MCP with Sentinel and/or the Risks tab.
- **identified_risks**: a noisy emit flooding Sentinel/Risks on a large drift result; a risk entry never closing if the ratify event is missed; a mediator exception breaking the drift/ratify route response.
- **mitigations**: the emit is one event per decision (bounded by the decision set, same bound as `DriftToL3Mediator`); `closeRisk` is idempotent and keyed; `DriftToRiskMediator` is fully exception-isolated and the route emit is non-blocking + absent-eventBus-safe (FX580 covers it).
- **residual_risks**: B-BIC-17 is classification-only — no full `VerdictArbiter` arbitration this cycle (RD-2); a separate larger effort if arbitration is later wanted.

## Cycle Exit Criteria

- FX580-FX583 written and green (16 new cases).
- `npm run lint` clean.
- The drift/ratify route response shapes + `DriftToL3Mediator` forward unchanged — verified by `git diff` + existing `BicameralRoute` specs still green.
- `risks.json` storage format unchanged.

## Delegation

- Plan complete → `/qor-audit`. VETO (plan-text) → `/qor-plan`; PASS → `/qor-implement`.
