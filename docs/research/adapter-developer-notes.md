# agent-failsafe Adapter — Developer Notes for FailSafe Team

**Version:** 0.3.0 | **Last updated:** 2026-03-10

---

## Overview

`agent-failsafe` is a standalone Python package (PyPI: `agent-failsafe`) that bridges FailSafe governance controls into the Microsoft Agent Governance Toolkit. It is not part of the Microsoft monorepo. It is MythologIQ IP.

The adapter does not contain governance logic. It translates FailSafe decisions into formats that four Microsoft packages understand: agent-os (policy engine), agent-mesh (trust/identity), agent-hypervisor (execution rings), and agent-sre (reliability/SLOs).

**The adapter adapts to FailSafe. It does not modify FailSafe behavior.**

---

## Architecture

```
FailSafe VS Code Extension
    |
    |-- stdio JSON-RPC (MCP 2024-11-05)
    |-- .failsafe/ledger/ledger.db (SQLite, direct read)
    |-- .failsafe/config/policies/*.yaml (direct read)
    |
agent-failsafe adapter (15 source files, ~3,400 lines)
    |
    |-- FailSafeInterceptor  --> agent-os ToolCallInterceptor chain
    |-- FailSafeKernel       --> agent-os adapter registry
    |-- FailSafeTrustMapper  --> agent-mesh DID translation
    |-- FailSafeRingAdapter  --> agent-hypervisor execution rings
    |-- FailSafeComplianceSLI --> agent-sre SLO monitoring
    |-- FailSafeAuditSink    --> agent-mesh audit backends
    |-- FailSafeApprovalBackend --> agent-os L3 escalation
```

There are two client implementations. Only one is active at a time:

- **MCPFailSafeClient** — Primary. Communicates with the FailSafe MCP server over stdio. This is the intended production path.
- **LocalFailSafeClient** — Fallback. Reads YAML policies and the SQLite ledger directly. No dependency on a running FailSafe process. Used for testing and offline scenarios.

---

## FailSafe Contracts

These are the interfaces the adapter depends on. Changes to any of these will break the adapter.

### 1. MCP Server (stdio JSON-RPC)

The adapter spawns a subprocess using a caller-provided command and communicates via MCP protocol version `2024-11-05`. The adapter identifies itself as `"agent-failsafe"` version `"0.3.0"`.

**Required MCP tools:**

| Tool | Parameters | Returns |
|---|---|---|
| `sentinel_audit_file` | `path: string`, `intent_id: string` | `SentinelVerdict` JSON (see below) |
| `ledger_log_decision` | `decision: string`, `rationale: string`, `risk_grade: string`, `intent_id: string` | Ignored (fire-and-forget) |
| `qorelogic_status` | *(none)* | `{ "active_intent": "string" }` |

### 2. SentinelVerdict JSON Shape

This is the most critical contract. The adapter parses this response from `sentinel_audit_file`:

```json
{
  "decision": "PASS | WARN | BLOCK | ESCALATE | QUARANTINE",
  "riskGrade": "L1 | L2 | L3",
  "id": "string",
  "summary": "string",
  "matchedPatterns": ["string"],
  "ledgerEntryId": null | number
}
```

**Field-by-field behavior in the adapter:**

- `decision` — Mapped to `VerdictDecision` enum. Unknown values will raise an error.
- `riskGrade` — Mapped to `RiskGrade` enum (`L1`, `L2`, `L3`). Unknown values will raise an error.
- `id` — Used as the nonce for idempotency tracking.
- `summary` — Passed through as `reason` in the `DecisionResponse`. Truncated to 200 characters when forwarded to SRE signals.
- `matchedPatterns` — Stored in conditions but not currently acted upon by the adapter.
- `ledgerEntryId` — Stored in `DecisionResponse.ledger_entry_id`. Null is acceptable.

### 3. SQLite Ledger

**Path:** `.failsafe/ledger/ledger.db`

The `LocalFailSafeClient` and the Shadow Genome reader query this database directly (read-only for genome queries, read-write for local decision logging).

**Required schema:**

```sql
CREATE TABLE ledger (
    id        INTEGER PRIMARY KEY,
    eventType TEXT,
    agentDid  TEXT,
    payload   TEXT,   -- JSON string
    timestamp TEXT
);
```

**Shadow Genome query:** The adapter reads rows where `eventType = 'DIVERGENCE_DECLARED'` and parses the `payload` JSON column. If FailSafe changes this event type string or the payload structure, Shadow Genome integration will silently return empty results.

**Connection settings the adapter uses:** WAL journal mode, busy timeout of 5000ms. FailSafe should not use exclusive locking on this database.

### 4. YAML Policy Files

**Path:** `.failsafe/config/policies/*.yaml`

The `LocalFailSafeClient` reads these files to perform offline risk grading. The adapter expects a `risk_grading.yaml` file containing L3 trigger keywords (auth, login, crypto, payment, private_key, password, api_key). The exact schema is parsed by `patterns.py` which looks for trigger word lists.

### 5. DID Format

The adapter translates between two DID namespaces:

- **FailSafe side:** `did:myth:{persona}:{32-char-hex}`
- **Microsoft toolkit side:** `did:mesh:{hash}`

Valid personas: `scrivener`, `sentinel`, `judge`, `overseer`.

The adapter validates the `did:myth:` prefix and splits on `:` expecting exactly 4 segments. DIDs that do not match this format will fail validation.

### 6. Risk Grades and Their Consequences

The adapter maps risk grades to execution privilege rings in the hypervisor:

| Risk Grade | Execution Ring | Meaning |
|---|---|---|
| L1 | Ring 2 (Restricted) | Automated, minimal constraints |
| L2 | Ring 1 (Privileged) | Sentinel review, elevated monitoring |
| L3 | Ring 0 (Root) | Human approval required |

A `QUARANTINE` verdict triggers the hypervisor kill switch regardless of risk grade.

---

## Data Flow

**Happy path (MCP client):**

```
1. Microsoft toolkit triggers a tool call
2. FailSafeInterceptor builds a DecisionRequest
3. MCPFailSafeClient calls sentinel_audit_file via stdio
4. FailSafe MCP server returns SentinelVerdict JSON
5. Adapter maps verdict to DecisionResponse
6. FailSafeKernel dispatches the decision to:
   a. SLI tracker (compliance rate metric)
   b. Audit sink (HMAC-signed, Merkle-chained SQLite entry)
   c. Approval backend (if L3 escalation needed)
7. Ring adapter assigns execution privilege level
8. Interceptor returns allow/deny to the toolkit
```

**Failure path:**

The adapter defaults to `fail_open = True`. If FailSafe is unreachable or returns malformed data, the adapter logs a warning and allows the action to proceed. This applies to both the interceptor and the governance pipeline. Set `fail_open = False` to make FailSafe unavailability a hard block.

Exception messages from FailSafe are never forwarded to the toolkit. The adapter returns a generic "FailSafe unavailable" message to prevent information leakage.

---

## Configuration

The adapter does not have its own config file. All configuration is passed programmatically:

- **MCP server command** — Passed to `MCPFailSafeClient` constructor as `server_command: list[str]`.
- **HMAC key for audit sink** — Required parameter, no default. Using `b"failsafe-dev-key"` logs a warning. This key is for the adapter's own audit chain, not FailSafe's ledger.
- **fail_open** — Boolean on `FailSafeInterceptor` and `GovernancePipeline`. Default: `True`.
- **Trust thresholds** — Hardcoded: CBT below 0.5, KBT 0.5 to 0.8, IBT at or above 0.8.
- **Shadow Genome store** — In-memory with FIFO eviction. Not persisted by the adapter.

---

## Breaking Change Risks

Changes to these FailSafe surfaces will break the adapter. Ordered by severity.

### High Risk

1. **SentinelVerdict JSON field names or values.** Any rename of `decision`, `riskGrade`, `id`, `summary`, `matchedPatterns`, or `ledgerEntryId` will cause parse failures. Adding new `decision` or `riskGrade` values without updating the adapter enums will raise errors.

2. **MCP tool names.** Renaming `sentinel_audit_file`, `ledger_log_decision`, or `qorelogic_status` will cause the adapter to receive "tool not found" errors.

3. **MCP tool parameter names.** The adapter sends parameters by name (`path`, `intent_id`, etc.). Renamed parameters will be silently ignored by the MCP server, producing incorrect behavior.

4. **Ledger SQLite schema.** Changing table name, column names, or the `DIVERGENCE_DECLARED` event type string will break both the local client and Shadow Genome queries.

### Medium Risk

5. **DID format.** Changing from 4-segment `did:myth:persona:hash` to any other format will break DID translation. Adding new personas is safe (the adapter does not validate persona names).

6. **MCP protocol version.** The adapter hardcodes MCP `2024-11-05`. A server requiring a newer protocol version may reject the handshake.

7. **WAL mode compatibility.** If FailSafe switches the ledger to exclusive locking or a different journal mode, concurrent reads from the adapter may fail.

### Low Risk

8. **YAML policy file structure.** Only affects the `LocalFailSafeClient` fallback path. The MCP client path is unaffected.

9. **New fields in SentinelVerdict.** Adding new fields is safe. The adapter ignores unknown fields.

10. **New GovernanceAction values.** The adapter's `GovernanceAction` enum will not recognize them, but the MCP client passes actions as strings, so new actions work through the MCP path without adapter changes.

---

## Summary of Adapter Assumptions

For quick reference, these are behaviors the adapter assumes FailSafe will maintain:

- The MCP server is reachable via stdio and speaks MCP 2024-11-05.
- `sentinel_audit_file` is synchronous and returns a complete verdict in a single response.
- `ledger_log_decision` is fire-and-forget; the adapter does not check its return value.
- The SQLite ledger is a shared resource that tolerates concurrent WAL-mode readers.
- Risk grading is a three-tier system (L1/L2/L3) with no intermediate grades.
- DID hashes are 32 hex characters. The adapter does not validate hash length but splits on `:`.
- FailSafe does not require authentication from the adapter (no tokens, no API keys).
