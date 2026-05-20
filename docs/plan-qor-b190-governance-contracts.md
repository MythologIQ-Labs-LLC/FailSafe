# Plan: B190 — Governance Decision Contract schemas import

**change_class**: feature

**doc_tier**: standard

**terms_introduced**:
- term: governance-contracts
  home: `FailSafe/extension/src/contracts/README.md`

**boundaries**:
- limitations:
  - **Schemas only** — NO engine wiring. B151 (interceptor) consumes these in a future cycle; this cycle just lands the canonical surface.
  - Schemas mirror existing in-repo TypeScript shapes (LedgerEntry, L3ApprovalRequest, CheckpointRecord, GenesisIntent) PLUS new shapes for evaluation_request, receipt, governance_config that don't yet have direct in-repo representation but exist conceptually across the codebase.
  - Hand-written TS mirror types in `src/contracts/types.ts` — NOT generated from schemas. Reasoning: avoiding new toolchain (json-schema-to-typescript) keeps build pipeline unchanged; hand-mapping is small (~8 interfaces) and trivially auditable.
  - JSON Schema dialect: `https://json-schema.org/draft/2020-12/schema`. AJV 8.x is available transitively via @modelcontextprotocol/sdk; we add it as an explicit devDependency for test-time validation.
- non_goals:
  - Generating TS types from schemas at build time (deferred — possibly never needed).
  - Wiring schemas into existing validation paths (ledger writes, L3 approval, etc.). Existing code keeps its current TS-type-based validation; schemas are the OUTBOUND interchange format for B151 consumers.
  - Versioning + migration tooling for schemas. v1.0 of each schema ships; future versions get a $schema-version field then.
- exclusions:
  - B151 (universal governance interceptor) — separate strategic cycle.
  - B152 (runtime extraction) / B153 (OTel/Prometheus telemetry).

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX545 | NEW | `FailSafe/extension/src/test/contracts/schemas.wellformed.test.ts` | Each of 8 JSON Schema files compiles via AJV without error; schema reports its $id matches the filename; $schema dialect is 2020-12 |
| FX546 | NEW | `FailSafe/extension/src/test/contracts/fixtures.match.test.ts` | Representative fixtures (LedgerEntry, L3ApprovalRequest, ShadowGenomeEntry as failure_mode, CheckpointRecord, GenesisConcept as intent) validate against their respective schemas |

## Open Questions

(All resolved.)

1. **JSON Schema dialect**: `2020-12` (current standard). AJV 8 supports it via `AJV2020`.
2. **Schema $id convention**: `https://failsafe.mythologiq.studio/contracts/<name>.json` — namespaced, stable, dereferenceable in the future when we publish.
3. **Type generation**: hand-written. Trade-off acknowledged: schema and TS type drift is possible; FX546 catches the most common case (existing-code fixtures must satisfy schemas).
4. **AJV as runtime dep or devDep**: devDep only. The schemas themselves are static .json files; they don't need a validator at runtime for the current scope (B151 will add runtime validation if needed).
5. **Receipt + evaluation_request + governance_config field set**: defined from conceptual model since no in-repo type exists yet. Receipt mirrors the verdict+evidence+signatures pattern from existing AUDIT_PASS/AUDIT_FAIL ledger payloads. evaluation_request mirrors the ProposalEvent + L3ApprovalRequest input fields. governance_config mirrors the existing `failsafe.governance.*` VS Code settings.

## Phase 1: 8 JSON Schema files

### Affected Files

- `FailSafe/extension/src/contracts/evaluation_request.json` — NEW
- `FailSafe/extension/src/contracts/ledger_entry.json` — NEW (mirrors LedgerEntry)
- `FailSafe/extension/src/contracts/intent.json` — NEW (mirrors GenesisConcept / CortexIntent)
- `FailSafe/extension/src/contracts/failure_mode.json` — NEW (mirrors ShadowGenomeEntry)
- `FailSafe/extension/src/contracts/approval.json` — NEW (mirrors L3ApprovalRequest)
- `FailSafe/extension/src/contracts/checkpoint.json` — NEW (mirrors CheckpointRecord)
- `FailSafe/extension/src/contracts/receipt.json` — NEW (governance decision receipt)
- `FailSafe/extension/src/contracts/governance_config.json` — NEW (operator settings)
- `FailSafe/extension/src/contracts/README.md` — NEW (explains the canonical surface)

### Changes

Each schema:
- Has `$schema: "https://json-schema.org/draft/2020-12/schema"`
- Has `$id: "https://failsafe.mythologiq.studio/contracts/<name>.json"`
- Has `title`, `description`, `type: "object"`, `required` array, `properties` map, `additionalProperties: false`

### Unit Tests

See FX545 (Phase 3).

## Phase 2: TypeScript mirror types + index

### Affected Files

- `FailSafe/extension/src/contracts/types.ts` — NEW. Hand-written TS interfaces matching each schema's `properties` shape. Imports existing types (`LedgerEventType`, `RiskGrade`, `L3ApprovalState`, `FailureMode`, `RemediationStatus`) from `shared/types/` where they already exist so the contract types compose with the in-repo type system.
- `FailSafe/extension/src/contracts/index.ts` — NEW. Re-exports all 8 types + a `CONTRACT_VERSIONS` map for callers that want to introspect schema versioning.

### Changes

```ts
// types.ts
import type { LedgerEventType, FailureMode, RemediationStatus } from '../shared/types/ledger';
import type { RiskGrade } from '../shared/types/risk';
import type { L3ApprovalState } from '../shared/types/l3-approval';

export interface EvaluationRequest {
  agentDid: string;
  action: { kind: string; target?: string; payload?: Record<string, unknown> };
  context?: { intentId?: string; riskGrade?: RiskGrade };
  timestamp: string;
}

export interface LedgerEntryContract {
  id: number;
  timestamp: string;
  eventType: LedgerEventType;
  agentDid: string;
  agentTrustAtAction: number;
  modelVersion?: string;
  artifactPath?: string;
  artifactHash?: string;
  riskGrade?: RiskGrade;
  payload: Record<string, unknown>;
  entryHash: string;
  prevHash: string;
  signature: string;
}

// ... 6 more interfaces ...
```

### Unit Tests

Covered by FX546 (fixtures-match).

## Phase 3: Tests

### Affected Files

- `FailSafe/extension/src/test/contracts/schemas.wellformed.test.ts` — NEW (FX545)
- `FailSafe/extension/src/test/contracts/fixtures.match.test.ts` — NEW (FX546)
- `FailSafe/extension/package.json` — add `"ajv": "^8.17.1"` to devDependencies (transitive surface explicit)

### Changes

FX545 — each schema file is loaded via `fs.readFileSync`, parsed, compiled via AJV2020. Assertions:
- compile succeeds
- `$schema` value is the 2020-12 dialect URL
- `$id` matches the filename pattern
- top-level type is `'object'`
- `additionalProperties` is `false`

FX546 — for 5 contracts that mirror in-repo types, build a representative fixture from existing test data shape + validate via the compiled schema:
- LedgerEntry fixture against `ledger_entry.json`
- L3ApprovalRequest fixture against `approval.json`
- ShadowGenomeEntry fixture against `failure_mode.json`
- CheckpointRecord fixture against `checkpoint.json`
- GenesisConcept fixture against `intent.json`

Plus negative cases: malformed fixture (missing required field) is rejected.

## CI Commands

- `cd FailSafe/extension && npm install` — installs ajv devDep
- `cd FailSafe/extension && npm run compile` — TS builds
- `cd FailSafe/extension && npx mocha out/test/contracts/*.test.js --ui tdd` — 15 cases pass
