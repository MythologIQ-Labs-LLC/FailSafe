# Plan: B151 Universal Governance Interceptor (v2)

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**Risk Grade**: L2 — architectural change, migrates existing code paths, behavioural parity required, no health/safety/legal impact.
**Branch**: `feat/b151-governance-interceptor` (cut from `feat/b190-governance-contracts`; rebases onto `main` after PR #79 merges).
**Issue**: #80.
**Scope (operator-confirmed Option B)**: `IGovernanceInterceptor` interface + `EngineBackedInterceptor` impl + `McpInterceptor` adapter + migration of `BicameralRoute` through the interceptor, with behavioural-parity tests.

> **v2** — supersedes v1 after audit #1 VETO (`.failsafe/governance/AUDIT_REPORT_b151-governance-interceptor.md`, 6 findings F1-F6). v1's free-tier-observe predecessor is archived at `.failsafe/archive/plans/plan-qor-b151-governance-interceptor-OBSERVE-SURFACE-superseded-2026-05-20.md`.

**terms_introduced**:
- term: IGovernanceInterceptor
  home: FailSafe/extension/src/governance/interceptor/IGovernanceInterceptor.ts
- term: EngineBackedInterceptor
  home: FailSafe/extension/src/governance/interceptor/EngineBackedInterceptor.ts
- term: McpInterceptor
  home: FailSafe/extension/src/governance/interceptor/adapters/McpInterceptor.ts
- term: Behavioural-parity test
  home: FailSafe/extension/src/test/roadmap/routes/BicameralRoute.parity.test.ts

**boundaries**:
- limitations: only the MCP adapter ships in this cycle; LangChain / AutoGen / CrewAI adapters are deferred to follow-up cycles. The interface is designed so each future adapter is a single new file under `adapters/`.
- non_goals: extracting `EnforcementEngine` into a separate runtime (B152); exposing OpenTelemetry / Prometheus surfaces (B153); changing the B190 contract schemas; modifying `EnforcementEngine` internals or its axiom evaluators; touching the L3 approval flow; adding new Shadow Genome consultation logic (the interceptor inherits whatever `EnforcementEngine.evaluateAction` already does).
- exclusions: any edit inside `src/integrations/bicameral/` — the adapter wraps the existing client externally; the bicameral module is unchanged.

## Resolved Decisions (were Open Questions in v1)

- **RD-1 — Licensing-posture boundary (was OQ-1; cleared audit finding F1).** `PRIVATE/docs/LICENSING_POSTURE.md` was amended 2026-05-20 (operator decision): the free B151 interceptor delivers real deterministic verdicts in observe/assist modes and consults the local Shadow Genome — Shadow Genome is core/free; only org-wide aggregation + enforce-mode OS-level hard-block remain Pro. **The interceptor introduces no new enforcement surface**: `EnforcementEngine.evaluateAction` (`EnforcementEngine.ts:101`) dispatches by governance mode, and the enforce branch already passes `featureGate` into `evaluateEnforceMode` (`EnforcementEngine.ts:129-135`). `EngineBackedInterceptor` calls `evaluateAction` unchanged and inherits that existing Pro-gating. Routing B151 through the in-extension engine is now posture-compliant.
- **RD-2 — Endpoint scope (cleared finding F4).** `BicameralRoute.ts` exposes **3** bicameral HTTP routes: `/api/actions/bicameral-history` (line 166), `/api/actions/bicameral-drift` (line 186), `/api/actions/bicameral-ratify` (line 217). There is **no** `bicameral-preflight` HTTP route (`bicameral.preflight` exists only as a `callRaw` wrapper at `BicameralMcpClient.ts:199`, not HTTP-surfaced). Phase 3 migrates the 3 real routes; FX551 is 6 cases (3 routes × success + error).
- **RD-3 — `evaluationRequestId` provenance (cleared finding F3).** `EvaluationRequestContract` (`contracts/evaluation_request.json`) has no `id` field (`required:[agentDid,action,timestamp]`, `additionalProperties:false`). The id is **derived deterministically** by a pure function `deriveEvaluationRequestId(req)` in `contractMappers.ts` — `sha256(agentDid|action.kind|timestamp)`, hex, truncated, prefixed `eval-`. Deterministic so retried/duplicate requests resolve to the same id. Both `McpInterceptor` and `EngineBackedInterceptor` derive it identically from the request; no `id` field is assumed on the contract.
- **RD-4 — Receipt evidence shape (cleared finding F2).** `ReceiptContract` (`contracts/receipt.json:18-30`) carries `evidence: ReceiptEvidence[]` where each item is `{kind: string, ref: string, summary?: string}` — there is no `evidenceRefs` field, and the schema is `additionalProperties:false`. All mappers and assertions populate `evidence` with proper objects.

## Open Questions

Each carries a default for audit to challenge. None blocks plan submission.

- **OQ-A** — Pre-migration response snapshots for FX551 parity — captured from a live route, or synthesised from existing fixture data?
  Default: synthesise from `BicameralMcpClient.callRaw.test.ts` and `BicameralMcpClient.deferredTools.test.ts` fixtures (both exist in `src/test/integrations/bicameral/`). Live-server capture would couple parity tests to runtime state and reintroduce flakiness.
- **OQ-B** — `EngineBackedInterceptor` must map engine outputs to the B190 `receipt.verdict` enum (`ALLOW | BLOCK | ESCALATE | MODIFY | QUARANTINE`). `EnforcementEngine.Verdict` (`governance/types/IntentTypes.ts`) has only `ALLOW | BLOCK | ESCALATE`.
  Default: map engine throws / unrecoverable runtime errors to `QUARANTINE`; leave `MODIFY` unused this cycle (no upstream verdict produces it). Receipt enum stays B190-stable; no engine change requested.

## Phase 1 — Interceptor surface (no migration yet)

### Affected Files (tests listed first per TDD-Light)

**NEW (tests)**
- `FailSafe/extension/src/test/governance/interceptor/IGovernanceInterceptor.contract.test.ts` — FX547 (5 cases)
- `FailSafe/extension/src/test/governance/interceptor/contractMappers.test.ts` — FX550 (6 cases)
- `FailSafe/extension/src/test/governance/interceptor/ajv-instance.test.ts` — FX552 (3 cases)

**NEW (impl)**
- `FailSafe/extension/src/governance/interceptor/IGovernanceInterceptor.ts` — interface only: `evaluate(req: EvaluationRequestContract): Promise<ReceiptContract>`.
- `FailSafe/extension/src/governance/interceptor/contractMappers.ts` — pure functions: `deriveEvaluationRequestId(req)`, `proposedActionToEvaluationRequest(action, agentDid)`, `evaluationRequestToProposedAction(req)`, `verdictToReceipt(verdict, evalReqId, issuedBy)`.
- `FailSafe/extension/src/governance/interceptor/ajv-instance.ts` — module-scope cached `Ajv2020` factory + `getValidator(schemaName)` returning a cached compiled `ValidateFunction`.
- `FailSafe/extension/src/governance/interceptor/index.ts` — re-exports the interface + contractMappers + ajv-instance.
- `FailSafe/extension/src/governance/interceptor/README.md` — boundary doc (content filled in Phase 4).

### Mapper semantics (binds RD-3 + RD-4)

- `deriveEvaluationRequestId(req)` → `eval-${sha256(`${req.agentDid}|${req.action.kind}|${req.timestamp}`).slice(0,16)}`.
- `verdictToReceipt(verdict, evalReqId, issuedBy)` → `ReceiptContract` with `receiptId = rcpt-${randomBytes(8).hex}`, `evaluationRequestId = evalReqId`, `issuedAt = new Date().toISOString()`, `issuedBy`, and:
  - `ALLOW` → `verdict:'ALLOW'`, `evidence:[{kind:'intent', ref:intentId, summary:'Action allowed under active intent.'}]` when `intentId` present, else `evidence:[]`.
  - `BLOCK` → `verdict:'BLOCK'`, `evidence:[{kind:'axiom_violation', ref:axiomViolated, summary:violation}]`, `verdictRationale:remediation`.
  - `ESCALATE` → `verdict:'ESCALATE'`, `evidence:[{kind:'escalation', ref:escalationTo, summary:reason}]`.
- `proposedActionToEvaluationRequest(action, agentDid)` → `EvaluationRequestContract` with `agentDid`, `action:{kind:action.type, target:action.targetPath}`, `context:{intentId:action.intentId ?? undefined}`, `timestamp:action.proposedAt`.

### Unit tests

| File | Cases | Asserts behaviour (not artefact presence) |
|---|---|---|
| FX547 IGovernanceInterceptor.contract.test.ts | 5 | A test double `class StubInterceptor implements IGovernanceInterceptor` compiles and is constructible; `evaluate(validReq)` resolves a `ReceiptContract` that passes AJV `receipt.json` validation; the returned receipt's `evaluationRequestId` equals `deriveEvaluationRequestId(req)`; `receipt.evidence` is an array of `{kind,ref}` objects (never a bare string array); `receipt.issuedAt` parses as RFC3339. |
| FX550 contractMappers.test.ts | 6 | `deriveEvaluationRequestId` is deterministic for identical `(agentDid,action.kind,timestamp)` and differs when timestamp differs; `verdictToReceipt({status:'ALLOW',intentId},id,by)` → `verdict='ALLOW'`, `evidence[0]={kind:'intent',ref:intentId,...}`; `verdictToReceipt({status:'BLOCK',violation,axiomViolated,remediation},id,by)` → `verdict='BLOCK'`, `evidence[0].kind='axiom_violation'`, `evidence[0].summary=violation`; `verdictToReceipt({status:'ESCALATE',escalationTo,reason},id,by)` → `verdict='ESCALATE'`, `evidence[0]={kind:'escalation',ref:escalationTo,...}`; every receipt produced validates against `receipt.json` via AJV; `evaluationRequestToProposedAction(proposedActionToEvaluationRequest(a,d))` round-trips to a `ProposedAction` equal to `a` on all defined fields. |
| FX552 ajv-instance.test.ts | 3 | `getValidator('evaluation_request')` returns a function on first call; the second call returns the **same** reference (`===` cache-hit assertion); `getValidator('not_a_schema')` throws an error whose message names the missing schema. |

## Phase 2 — Engine-backed implementation + MCP adapter

### Affected Files

**NEW (tests)**
- `FailSafe/extension/src/test/governance/interceptor/EngineBackedInterceptor.test.ts` — FX548 (5 cases)
- `FailSafe/extension/src/test/governance/interceptor/McpInterceptor.test.ts` — FX549 (5 cases)

**NEW (impl)**
- `FailSafe/extension/src/governance/interceptor/EngineBackedInterceptor.ts` — implements `IGovernanceInterceptor`: maps the incoming `EvaluationRequestContract` to a `ProposedAction` via `contractMappers.evaluationRequestToProposedAction`, calls `EnforcementEngine.evaluateAction()` (`EnforcementEngine.ts:101`), derives the id via `deriveEvaluationRequestId`, maps the returned `Verdict` to a `ReceiptContract` via `verdictToReceipt`. Engine throws are caught and returned as `QUARANTINE` receipts (no rethrow). Constructor takes the `EnforcementEngine` and an `issuedBy` DID string.
- `FailSafe/extension/src/governance/interceptor/adapters/McpInterceptor.ts` — accepts an MCP `{name, arguments}` envelope, builds an `EvaluationRequestContract` (`action.kind = 'tool_call'`, `action.target = name`, `action.payload = arguments`, `agentDid` from injected config, `timestamp = now`), validates it against the `evaluation_request` schema via `ajv-instance`, dispatches to a backing `IGovernanceInterceptor`, returns the `ReceiptContract`. AJV validation failure → `QUARANTINE` receipt (id via `deriveEvaluationRequestId`) **without** invoking the backing interceptor.

### Unit tests

| File | Cases | Asserts behaviour (not artefact presence) |
|---|---|---|
| FX548 EngineBackedInterceptor.test.ts | 5 | With an `EnforcementEngine` test double whose `evaluateAction` resolves `{status:'ALLOW',intentId}`, `evaluate(req)` → receipt `verdict='ALLOW'` with `evidence[0].kind='intent'`; engine returning `{status:'BLOCK',violation,axiomViolated,remediation}` → receipt `verdict='BLOCK'` with `evidence[0].summary=violation`; engine returning `{status:'ESCALATE',escalationTo,reason}` → receipt `verdict='ESCALATE'` with `evidence[0].ref=escalationTo`; engine `evaluateAction` throwing → receipt `verdict='QUARANTINE'` with the error name in `evidence[0].summary` and no rethrow; every returned receipt validates against `receipt.json` via AJV. |
| FX549 McpInterceptor.test.ts | 5 | With a backing interceptor returning an ALLOW receipt, `intercept({name:'bicameral.history',arguments:{}})` returns that receipt; the `EvaluationRequestContract` passed to the backing interceptor validates against `evaluation_request.json` (captured + AJV-checked in the test); malformed input `{name:'',arguments:null}` → `QUARANTINE` receipt and the backing interceptor's `evaluate` is **not** called; the QUARANTINE receipt's `evaluationRequestId` is a non-empty `eval-`-prefixed string; the AJV validator is fetched from cache (not recompiled) across 100 consecutive `intercept()` calls — gates FX552 regression. |

## Phase 3 — Migrate BicameralRoute through McpInterceptor

### Affected Files

**NEW (tests + fixture)**
- `FailSafe/extension/src/test/roadmap/routes/BicameralRoute.parity.test.ts` — FX551 (6 cases)
- `FailSafe/extension/src/test/roadmap/routes/__fixtures__/bicameral-route-pre-migration.json` — recorded response shapes captured from synthesised inputs against the **pre-migration** `BicameralRoute`. Created in Phase 3 step 1 before any migration edit.

**MODIFIED**
- `FailSafe/extension/src/roadmap/routes/BicameralRoute.ts` — each of the 3 endpoints (`bicameral-history` line 166, `bicameral-drift` line 186, `bicameral-ratify` line 217) routes its request through an injected `McpInterceptor` instead of calling `BicameralMcpClient` methods directly. Receipt→HTTP-response mapping is a small declarative table inside this file.
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — accepts an `McpInterceptor` reference (in addition to the existing raw `BicameralMcpClient` setter), plumbed to the route registrar.
- `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts` — passes the interceptor into `BicameralRoute` setup.
- `FailSafe/extension/src/extension/bootstrapBicameral.ts` — at wire-up, constructs `new McpInterceptor(bicameralClient, new EngineBackedInterceptor(enforcementEngine, issuedByDid))` and registers it with `ConsoleServer`.

### Unit tests

| File | Cases | Asserts behaviour (not artefact presence) |
|---|---|---|
| FX551 BicameralRoute.parity.test.ts | 6 | For each of the 3 endpoints — (a) the success response body for a representative input matches the recorded pre-migration snapshot after timestamp normalisation, with HTTP status preserved; (b) the error envelope for a representative malformed input matches the recorded pre-migration error shape, with HTTP status preserved. The snapshot is loaded from `__fixtures__/bicameral-route-pre-migration.json`; the test fails loud if the fixture is missing rather than silently passing. |

## Phase 4 — Documentation + Feature Inventory

### Affected Files

**MODIFIED**
- `docs/FEATURE_INDEX.md` — five new rows: FX547, FX548, FX549, FX550, FX551 with source / test / verification columns. FX552 is internal infrastructure (AJV cache), not a user-facing feature → not indexed, per the FEATURE_INDEX user-surface contract.
- `FailSafe/extension/src/governance/interceptor/README.md` — boundary documentation: allowed imports (`src/contracts/`, `src/governance/EnforcementEngine.ts`, `src/governance/types/IntentTypes.ts`), forbidden imports (`src/integrations/bicameral/*`), the verdict→receipt mapping table, the QUARANTINE policy, and a note that the interceptor inherits the engine's existing mode-gating (no new enforce surface — RD-1).

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX547 | NEW | `FailSafe/extension/src/test/governance/interceptor/IGovernanceInterceptor.contract.test.ts` | `IGovernanceInterceptor.evaluate(req)` returns a `ReceiptContract` that validates against `receipt.json`, with `evaluationRequestId` derived from the request and `evidence` as `{kind,ref}` objects. |
| FX548 | NEW | `FailSafe/extension/src/test/governance/interceptor/EngineBackedInterceptor.test.ts` | `EngineBackedInterceptor.evaluate(req)` maps every `EnforcementEngine.Verdict` variant to a schema-valid `ReceiptContract` with correct `evidence`; an engine throw → `QUARANTINE` receipt without rethrow. |
| FX549 | NEW | `FailSafe/extension/src/test/governance/interceptor/McpInterceptor.test.ts` | `McpInterceptor.intercept(envelope)` builds a schema-valid `EvaluationRequestContract`, dispatches to the backing interceptor, and returns its `ReceiptContract`; malformed input → `QUARANTINE` receipt with the backing interceptor **not** invoked. |
| FX550 | NEW | `FailSafe/extension/src/test/governance/interceptor/contractMappers.test.ts` | `contractMappers` derives a deterministic `evaluationRequestId`, round-trips `ProposedAction ↔ EvaluationRequestContract`, and projects `Verdict → ReceiptContract` with correct `evidence` objects per verdict variant. |
| FX551 | NEW | `FailSafe/extension/src/test/roadmap/routes/BicameralRoute.parity.test.ts` | All 3 `BicameralRoute` endpoints produce response bodies matching the recorded pre-migration snapshot (post timestamp normalisation), HTTP status preserved on success and error paths. |

## Boundary Preservation Rules

1. `src/governance/interceptor/*` may import from `src/contracts/`, `src/governance/EnforcementEngine.ts`, and `src/governance/types/IntentTypes.ts` (for `ProposedAction` / `Verdict` shapes) — and from nothing else inside `src/`.
2. `src/governance/interceptor/*` MUST NOT import from `src/integrations/bicameral/*`. The dependency direction is one-way: `BicameralRoute` imports `McpInterceptor`; `McpInterceptor` receives a `BicameralMcpClient` by constructor injection (typed against a minimal local interface, not an import of the bicameral module).
3. `src/integrations/bicameral/*` is **untouched** in this cycle.
4. Each contract type referenced in code is imported by name from `src/contracts/types.ts`; no schema is duplicated.
5. The interceptor introduces **no new enforcement surface** — `EngineBackedInterceptor` calls `EnforcementEngine.evaluateAction` unchanged and inherits the engine's existing mode-gating (`featureGate` already threaded into `evaluateEnforceMode`).

## Behavioural-Parity Strategy (Phase 3 detail)

1. **Step 1 — snapshot capture (Phase 3 commit 1)**: add `BicameralRoute.parity.test.ts` with cases `.skip()`d; add a snapshot-capture script that drives the pre-migration `BicameralRoute` against deterministic fixture inputs and writes responses (after timestamp normalisation) to `__fixtures__/bicameral-route-pre-migration.json`. Commit the fixture as the parity baseline.
2. **Step 2 — migration (Phase 3 commit 2)**: migrate `BicameralRoute` to route through `McpInterceptor`; activate `BicameralRoute.parity.test.ts` (remove `.skip()`). All 6 cases must pass green on that commit.
3. **Step 3 — cleanup**: remove the snapshot-capture script (it remains in git history); the fixture stays as the ground-truth artefact.

Timestamp normalisation: any string field matching `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/` is replaced with `"<ts>"` before comparison. Receipt-only fields (`receiptId`, `issuedAt`) are exempt from byte-identity and are validated only against the receipt schema.

## CI Commands

- `npm --prefix FailSafe/extension run compile` — `tsc -p ./` + `copy-ui-js.cjs` mirror; verifies new `.ts` files compile and `.json` schemas mirror into `out/contracts/`.
- `npm --prefix FailSafe/extension test -- --grep "interceptor|BicameralRoute"` — scoped Mocha run for FX547-FX552 plus the FX551 parity suite; fast iteration during implement.
- `npm --prefix FailSafe/extension test` — full Mocha run. The implement phase captures the pre-change pass/fail baseline **before** the first edit (clean tree, run, record), then the post-implement run must show that baseline pass-count **plus the 30 new cases** (FX547:5 + FX548:5 + FX549:5 + FX550:6 + FX551:6 + FX552:3 = 30) and **zero new failures**. No absolute baseline number is asserted in this plan — it is measured at implement-start to avoid stale-citation drift.
- `npm --prefix FailSafe/extension run lint` — eslint must be clean across all new + modified files.
- `node FailSafe/extension/scripts/release-gate.cjs --check-only` — release-gate dry-run; not a hard audit gate but run pre-substantiate.

## Risk Grade L2 — Impact Assessment

Provided though `high_risk_target=false`, per `/qor-auto-dev-1` guidance for elevated-risk targets.

- **purpose**: introduce a single contract-typed seam through which agent tool calls reach the FailSafe enforcement layer, so B152 (runtime extraction) and B153 (OTel / Prometheus export) can land without re-churning the public surface.
- **affected_stakeholders**: operators running FailSafe with bicameral MCP enabled; downstream agent-framework integrators awaiting future-cycle adapters; FailSafe-Pro consumers — no impact this cycle, shared-filesystem coexistence preserved.
- **identified_risks**:
  - behavioural regression in the 3 bicameral HTTP endpoints during route migration;
  - receipt-verdict semantic drift if mapper edge cases are missed;
  - AJV runtime overhead if validators are recompiled per call;
  - contract drift between `types.ts` and the `.json` schemas if a mapper relies on a field one side does not define.
- **mitigations**:
  - FX551 parity test gates the migration (6 cases × 3 endpoints, snapshot-based);
  - FX548 + FX550 exhaustively cover verdict→receipt mapping for every `Verdict` variant plus the synthetic `QUARANTINE` path;
  - FX552 asserts the AJV instance caches compiled validators across calls;
  - every receipt returned by the interceptor is round-trip-validated against `receipt.json` in FX548/FX550 — caught at test time, not in prod;
  - mapper field names verified against `receipt.json` + `evaluation_request.json` during planning (RD-3, RD-4) — `evidence` objects, no `evidenceRefs`; derived id, no `req.id`.
- **residual_risks**:
  - no framework adapters beyond MCP this cycle; LangChain / AutoGen / CrewAI consumers wait for follow-up cycles;
  - the parity test compares only fixture-driven inputs, so an endpoint behaviour exercised only by unrecorded operator input could regress silently — accepted residual, since exhaustive route testing is out of scope and the 3 endpoints have small input domains;
  - `MODIFY` verdict path is defined in the receipt enum but unexercised this cycle (no upstream verdict produces it).

## Cycle Exit Criteria

- All FX547-FX552 tests written and green (30 new cases).
- Full `npm test` shows the implement-start baseline pass-count + 30 new cases, zero new failures.
- `npm run lint` clean.
- `BicameralRoute.parity.test.ts` committed activated (not `.skip()`).
- Migration edits live only inside the files listed under Phase 3 "MODIFIED" — verified by `git diff --name-only` at substantiate time.
- `src/integrations/bicameral/*` is zero-diff this cycle — verified by `git diff --name-only -- 'FailSafe/extension/src/integrations/bicameral/'` returning empty.

## Delegation

- Plan complete → `/qor-audit` (next phase per `/qor-auto-dev-1` Step 3).
- Audit VETO with plan-text findings → return to `/qor-plan`.
- Audit VETO with process-loop findings → `/qor-remediate`.
- Audit VETO with research-drift findings → `/qor-research`, then return.
- PASS → `/qor-implement` on `feat/b151-governance-interceptor`.
