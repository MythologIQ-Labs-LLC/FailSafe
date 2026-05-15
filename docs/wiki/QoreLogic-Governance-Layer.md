# QoreLogic Governance Layer

QoreLogic is the deterministic governance engine at the heart of FailSafe. It enforces safety policies at the editor boundary using code, not prompts.

## Philosophy: Deterministic vs. Prompt-Based

| Aspect | Prompt-Based Safety | QoreLogic Deterministic Governance |
|--------|--------------------|------------------------------------|
| **Decision Maker** | LLM interprets rules | TypeScript code executes rules |
| **Consistency** | Varies with context, temperature, model | Identical output for identical input |
| **Auditability** | Opaque reasoning chain | Explicit code path, logged decisions |
| **Bypass Risk** | LLM can ignore or reinterpret | Code cannot be persuaded |
| **Speed** | Network latency + inference time | Sub-millisecond local execution |

## How QoreLogic Works

### 1. Risk Classification

Files are classified as **L1** (low), **L2** (medium), or **L3** (high) risk based on:

- **File path triggers** — e.g., paths containing `auth/`, `payment/`, `credential` are automatically L3
- **Content triggers** — e.g., content containing `DROP TABLE`, `api_key`, `private_key` triggers L3
- **Configuration overrides** — Custom triggers via `.failsafe/config/policies/risk_grading.json`

### 2. Policy Evaluation

Each risk grade has deterministic requirements:

| Grade | Name | Verification | Auto-Approve | Approval Authority |
|-------|------|-------------|-------------|-------------------|
| **L1** | Routine | Heuristic check, 10% sampling | Yes | System |
| **L2** | Functional | Full Sentinel pass | No | Sentinel |
| **L3** | Critical | Formal verification + human approval | No | Overseer (human) |

### 3. Ledger Recording

Every governance decision is recorded to the append-only SOA ledger with:

- Agent identity and trust score at time of action
- Artifact path and risk grade
- Timestamp and decision rationale
- Cryptographic hash chain linkage

### 4. Trust Dynamics

Agent trust scores evolve based on outcomes:

- Approved L3 actions → trust increase (+5%)
- Rejected or failed actions → trust decrease (-10%)
- Manipulation attempts → severe penalty (-25%) + quarantine
- Trust scores influence future routing decisions

## Source Modules

| Module | Path | Description |
|--------|------|-------------|
| `QoreLogicManager` | `src/qorelogic/QoreLogicManager.ts` | Central manager for all governance operations |
| `PolicyEngine` | `src/qorelogic/policies/PolicyEngine.ts` | Evaluates policies against artifacts |
| `LedgerManager` | `src/qorelogic/ledger/LedgerManager.ts` | SOA Ledger CRUD and chain verification |
| `TrustEngine` | `src/qorelogic/trust/TrustEngine.ts` | Trust scoring, stage management |
| `TrustPersistence` | `src/qorelogic/trust/TrustPersistence.ts` | SQLite persistence with optimistic locking |
| `TrustCalculator` | `src/qorelogic/trust/TrustCalculator.ts` | Score calculation algorithms |
| `ShadowGenomeManager` | `src/qorelogic/shadow/ShadowGenomeManager.ts` | Failure pattern archival |
| `PlanManager` | `src/qorelogic/planning/PlanManager.ts` | Event-sourced plan management |
| `WorkflowRunManager` | `src/qorelogic/planning/WorkflowRunManager.ts` | Workflow run lifecycle |
| `L3ApprovalService` | `src/qorelogic/L3ApprovalService.ts` | L3 approval queue with SLA enforcement |
| `SystemRegistry` | `src/qorelogic/SystemRegistry.ts` | Runtime agent detection and registration |
| `FrameworkSync` | `src/qorelogic/FrameworkSync.ts` | Multi-agent governance injection |
| `DiscoveryGovernor` | `src/qorelogic/DiscoveryGovernor.ts` | DRAFT → CONCEIVED status gates |

## Persona System

QoreLogic defines four governance personas:

### Scrivener (Code Agent)
- **DID Prefix**: `did:myth:scrivener`
- **Default Trust**: 0.35 (CBT - Calculus-Based Trust)
- **Risk Tolerance**: L2 (can propose up to L2; L3 requires escalation)
- **Capabilities**: Code generation, documentation, refactoring, test generation
- **Constraints**: Must cite sources, must not claim file existence without verification, must not modify L3 files without approval

### Sentinel (Verification Agent)
- **DID Prefix**: `did:myth:sentinel`
- **Default Trust**: 1.0 (IBT - Identification-Based Trust)
- **Risk Tolerance**: L0 (observes all, modifies none)
- **Capabilities**: File system validation, heuristic pattern matching, AST analysis, dependency verification
- **Constraints**: Must not modify files, must not make creative decisions, must log all verdicts

### Judge (Ledger Agent)
- **DID Prefix**: `did:myth:judge`
- **Default Trust**: 1.0 (IBT)
- **Capabilities**: Ledger write, signature generation, trust score updates, penalty enforcement, quarantine management
- **Signing**: Ed25519 with 30-day key rotation, Argon2id key derivation
- **Constraints**: Must verify Sentinel verdict before ledger write, must not write unsigned entries, must maintain Merkle chain integrity

### Overseer (Human)
- **DID Prefix**: `did:myth:overseer`
- **Type**: Human
- **Responsibilities**: L3 approval decisions, divergence arbitration, trust recovery authorization
- **SLA**: 2-minute first response, 24-hour full decision
- **Decision options**: APPROVE, APPROVE_WITH_CONDITIONS, REJECT, DEFER, ESCALATE

## Why This Matters

When an LLM is asked to enforce safety rules, it can:

- Reinterpret rules based on context
- Produce inconsistent decisions across similar inputs
- Be influenced by prompt engineering attacks

QoreLogic avoids these risks by executing deterministic TypeScript code. No LLM inference is required for governance decisions. A file containing `api_key` will **always** trigger L3 classification.

## Related Pages

- [[Risk Grading & Policies]] — Detailed risk classification and policy configuration
- [[Trust Engine & Agents]] — Trust dynamics, stages, and agent management
- [[Ledger & Checkpoints]] — SOA Ledger schema and hash chain integrity
- [[SHIELD Lifecycle Workflow]] — How QoreLogic drives the governance lifecycle
