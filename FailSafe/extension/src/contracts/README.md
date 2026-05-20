# FailSafe Governance Contracts

Canonical JSON Schema definitions for the FailSafe governance surface. These schemas are the **outbound interchange format** for agents, runtime engines, and external observability tools that want to participate in FailSafe governance.

## Why these exist

FailSafe internals use TypeScript types (under `src/shared/types/`). Those types are useful for in-extension code but cannot be consumed by agents written in other languages, by sibling daemons, or by downstream observability tools. The JSON Schemas in this folder are:

- **Language-neutral**: JSON Schema 2020-12 dialect, dereferenceable `$id`.
- **Stable**: changes are versioned; consumers can pin a schema version.
- **Validated**: AJV in tests confirms each schema is well-formed and that representative in-repo fixtures conform.

## The 8 contracts

| Schema | Purpose |
|---|---|
| `evaluation_request.json` | Action submitted to the governance engine for evaluation. |
| `ledger_entry.json` | A Merkle-chained record in the SOA Ledger (META_LEDGER). |
| `intent.json` | Operator/agent declared intent envelope. |
| `failure_mode.json` | Shadow Genome failure pattern record. |
| `approval.json` | L3 approval request + resolution state. |
| `checkpoint.json` | Sovereign Checkpoint Protocol snapshot. |
| `receipt.json` | Governance decision receipt (verdict + evidence + signature). |
| `governance_config.json` | Operator-controlled governance settings. |

## Boundary

- **Schemas only**: no engine wiring lives here. The planned B151 (universal governance interceptor) consumes these in a future cycle.
- **One-way dependency**: `src/contracts/types.ts` IMPORTS from `src/shared/types/` (LedgerEventType, FailureMode, RiskGrade, etc.). Nothing in `src/` imports from `src/contracts/` yet.
- **Hand-written TS mirror**: `types.ts` is hand-maintained to match the schemas. CI test FX546 validates in-repo fixtures against the schemas to catch drift.

## Versioning

v1.0 of each schema ships in this cycle. Future schema changes get a `$schema-version` field, with a migration matrix in this README.

## Origin

These 8 contracts are the "mature definitions from sibling daemon contracts surface" identified in BACKLOG B190. They qualify as FREE-TIER per the FailSafe licensing posture: the schema (interchange surface) is open; the engine that consumes them differs by tier.
