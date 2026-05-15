# Ledger, Checkpoints & Integrity

FailSafe maintains a tamper-evident audit trail through the SOA (Statement of Authority) Ledger, backed by cryptographic hash chains and Merkle verification.

## SOA Ledger

### Overview

The SOA Ledger is an append-only, hash-chained audit trail stored in SQLite at `.failsafe/ledger/soa_ledger.db`.

### Schema

```sql
CREATE TABLE soa_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),

    -- Event Classification
    event_type TEXT NOT NULL CHECK (event_type IN (
        'PROPOSAL', 'AUDIT_PASS', 'AUDIT_FAIL',
        'L3_QUEUED', 'L3_APPROVED', 'L3_REJECTED',
        'TRUST_UPDATE', 'PENALTY_APPLIED',
        'QUARANTINE_START', 'QUARANTINE_END',
        'DIVERGENCE_DECLARED', 'DIVERGENCE_RESOLVED',
        'SYSTEM_EVENT', 'USER_OVERRIDE',
        'PROVENANCE_RECORDED', 'DISCOVERY_RECORDED',
        'DISCOVERY_PROMOTED', 'CHECKPOINT_CREATED',
        'MARKETPLACE_INSTALL', 'MARKETPLACE_UNINSTALL'
    )),

    -- Actor
    agent_did TEXT NOT NULL,
    agent_trust_at_action REAL,
    model_version TEXT,

    -- Artifact
    artifact_path TEXT,
    artifact_hash TEXT,
    risk_grade TEXT CHECK (risk_grade IN ('L1', 'L2', 'L3')),

    -- Verification
    verification_method TEXT,
    verification_result TEXT,
    sentinel_confidence REAL,

    -- Human Oversight
    overseer_did TEXT,
    overseer_decision TEXT,

    -- Payload
    payload TEXT,  -- JSON blob for event-specific data

    -- Merkle Chain
    entry_hash TEXT NOT NULL UNIQUE,
    prev_hash TEXT NOT NULL,
    signature TEXT NOT NULL
);
```

### Hash Chain

Each ledger entry is linked to the previous entry via a hash chain:

```
[Genesis Block] ← self-referential
       ↓
[Entry 1] ← prev_hash = genesis.entry_hash
       ↓
[Entry 2] ← prev_hash = entry1.entry_hash
       ↓
[Entry N] ← prev_hash = entry(N-1).entry_hash
```

Chain integrity can be verified by recomputing hashes from the genesis block forward.

### Cryptographic Properties

| Property | Implementation |
|----------|---------------|
| **Entry hash** | SHA-256 of entry contents |
| **Signing algorithm** | Ed25519 |
| **Key storage** | VS Code SecretStorage |
| **Key derivation** | Argon2id |
| **Key rotation** | 30-day cycle |
| **HMAC keys** | Migrated to SecretStorage (v0.2.0) |

## Checkpoints

### Overview

Governance events are checkpointed into the `failsafe_checkpoints` table with run/phase/status context and deterministic hashes.

### Checkpoint Fields

| Field | Description |
|-------|-------------|
| `run_id` | Governance run identifier |
| `phase` | SHIELD phase |
| `status` | Current status |
| `git_hash` | Current Git HEAD at checkpoint time |
| `payload_hash` | Hash of checkpoint payload |
| `entry_hash` | Computed hash for chain linkage |
| `prev_hash` | Previous checkpoint's entry hash |

### Integrity Verification

- Chain validity is verified on initialization
- Failures are recorded for investigation
- Full chain verification is available through explicit actions in the Command Center
- Checkpoint history and chain validity are exposed over API

### Hub Snapshot

The Command Center hub snapshot includes:

```json
{
  "checkpointSummary": {
    "total": 42,
    "valid": 42,
    "chainValid": true
  },
  "recentCheckpoints": [...]
}
```

## Sentinel RAG Store

Sentinel observations are persisted to a local retrieval store:

### Storage

| Mode | Location | Description |
|------|----------|-------------|
| **Primary** | `.failsafe/rag/sentinel-rag.db` | SQLite RAG store |
| **Fallback** | `.failsafe/rag/sentinel_observations.jsonl` | JSONL when SQLite unavailable |

### Contents

Each observation includes:
- `payload_json` — Full observation payload
- `metadata_json` — Contextual metadata
- Retrieval text — Indexed text for search

### Configuration

```json
{
  "failsafe.sentinel.ragEnabled": true
}
```

Default: `true`. When disabled, observations are not persisted.

## Shadow Genome

The Shadow Genome archives failure patterns for evolutionary learning:

### Storage

`.failsafe/ledger/shadow_genome.db`

### Failure Modes

| Mode | Description |
|------|-------------|
| `HALLUCINATION` | Agent made false claims |
| `INJECTION_VULNERABILITY` | Code injection detected |
| `LOGIC_ERROR` | Logical error in generated code |
| `SPEC_VIOLATION` | Violation of project specification |
| `HIGH_COMPLEXITY` | Exceeded Section 4 Razor limits |
| `SECRET_EXPOSURE` | Secrets or credentials in output |
| `PII_LEAK` | PII detected |
| `DEPENDENCY_CONFLICT` | Conflicting dependencies |
| `TRUST_VIOLATION` | Agent violated trust constraints |

### Remediation States

```
UNRESOLVED → IN_PROGRESS → RESOLVED
                        → WONT_FIX
                        → SUPERSEDED
```

### Retention

The Shadow Genome includes a retention policy managed by `RetentionPolicy` (`src/qorelogic/shadow/RetentionPolicy.ts`).

## Source Modules

| Module | Path | Description |
|--------|------|-------------|
| `LedgerManager` | `src/qorelogic/ledger/LedgerManager.ts` | CRUD operations, chain verification |
| `LedgerQueryAPI` | `src/qorelogic/ledger/LedgerQueryAPI.ts` | Query interface for ledger data |
| `LedgerSchemaManager` | `src/qorelogic/ledger/LedgerSchemaManager.ts` | Schema migrations and versioning |
| `LedgerRetentionPolicy` | `src/qorelogic/ledger/LedgerRetentionPolicy.ts` | Data retention management |
| `CheckpointReconciler` | `src/governance/CheckpointReconciler.ts` | Checkpoint reconciliation |
| `CheckpointManager` | `src/roadmap/services/CheckpointManager.ts` | Bridges QoreLogic ledger and Sentinel |
| `RoadmapServer` | `src/roadmap/RoadmapServer.ts` | Checkpoint API and chain verification |
| `SentinelRagStore` | `src/sentinel/SentinelRagStore.ts` | Sentinel observation persistence |
| `ShadowGenomeManager` | `src/qorelogic/shadow/ShadowGenomeManager.ts` | Failure pattern management |
| `SchemaVersionManager` | `src/qorelogic/shadow/SchemaVersionManager.ts` | Schema versioning |
| `CryptoService` | `src/shared/CryptoService.ts` | Cryptographic operations |
| `ArtifactHasher` | `src/governance/ArtifactHasher.ts` | SHA-256 file content hashing |

## Data Independence

The checkpoint database and Sentinel RAG database are independent:

- `failsafe_checkpoints` (ledger DB) — Governance audit trail
- `sentinel_observations` (RAG DB) — Sentinel monitoring data
- No foreign-key links between them
- `evidenceRefs` is always `[]` (reserved for future use)

## Related Pages

- [[QoreLogic Governance Layer]] — How the ledger supports governance
- [[Sentinel Enforcement Engine]] — How Sentinel feeds the ledger
- [[Trust Engine & Agents]] — How trust events are recorded
- [[Security Model]] — Cryptographic implementation details
