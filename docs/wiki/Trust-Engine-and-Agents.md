# Trust Engine & Agent Management

FailSafe implements a dynamic trust model for AI agents based on the Lewicki-Bunker trust framework. Trust scores evolve based on agent behavior and directly influence governance routing decisions.

## Trust Model

### Trust Stages

| Stage | Name | Range | Description | Verification Rate |
|-------|------|-------|-------------|-------------------|
| **CBT** | Calculus-Based Trust | 0.0 – 0.5 | Probationary period, high verification | 100% |
| **KBT** | Knowledge-Based Trust | 0.5 – 0.8 | Standard operation, normal verification | Risk-based |
| **IBT** | Identification-Based Trust | 0.8 – 1.0 | Trusted status, expedited verification | Sampling |

### Score Dynamics

| Event | Delta | Cap/Floor |
|-------|-------|-----------|
| Successful L3 approval | +5% | Cap: 1.0 |
| Failed action | -10% | Floor: 0.0 |
| Trust violation | Force demotion + -25% | Target: next stage ceiling |
| Manipulation attempt | -25% + quarantine | 48h quarantine minimum |

### Recovery

- **Asymmetric**: Trust is hard to earn, easy to lose
- **Cooldown after violation**: 48 hours
- **Probationary period**: 5 verifications OR 30 days (whichever is longer)
- **Probationary floor**: 0.35 (prevents single-failure blocking)

### Influence Weights

| State | Weight |
|-------|--------|
| Starting | 1.0 |
| Maximum | 2.0 |
| Minimum | 0.1 |
| Probationary cap | 1.2 |

## Source Modules

| Module | Path | Description |
|--------|------|-------------|
| `TrustEngine` | `src/qorelogic/trust/TrustEngine.ts` | Central trust management |
| `TrustPersistence` | `src/qorelogic/trust/TrustPersistence.ts` | SQLite persistence with optimistic locking |
| `TrustCalculator` | `src/qorelogic/trust/TrustCalculator.ts` | Score computation algorithms |
| `AgentRevocation` | `src/qorelogic/trust/AgentRevocation.ts` | Agent revocation and cleanup |

## Trust Persistence

Trust state is persisted to SQLite with:

- **Optimistic locking**: Version-based concurrency control
- **Exponential backoff**: Retry for concurrent agent trust updates
- **Cache invalidation**: Event-driven via EventBus (`trustUpdated`, `agentQuarantined`, `agentReleased`)
- **Real timestamps**: DB `updated_at` (not `new Date()`) for accurate audit trails

## Agent Personas

### System Agents

| Persona | DID Prefix | Default Trust | Stage | Role |
|---------|-----------|---------------|-------|------|
| **Scrivener** | `did:myth:scrivener` | 0.35 | CBT | Code generation |
| **Sentinel** | `did:myth:sentinel` | 1.0 | IBT | Verification |
| **Judge** | `did:myth:judge` | 1.0 | IBT | Ledger management |
| **Overseer** | `did:myth:overseer` | — | — | Human approver |

### Agent Constraints

**Scrivener** (code agent):
- Must cite sources for non-trivial claims
- Must not claim file existence without verification
- Must not modify L3 files without explicit approval
- Must include risk self-assessment in proposals

**Sentinel** (verification agent):
- Must not modify files
- Must not make creative decisions
- Must log all verdicts to SOA Ledger
- Must escalate uncertainty to QoreLogic

**Judge** (ledger agent):
- Must verify Sentinel verdict before ledger write
- Must not write unsigned entries
- Must maintain Merkle chain integrity
- Must enforce remediation track rules

## Agent Registry

All agents are tracked in the `agent_registry` table:

```sql
CREATE TABLE agent_registry (
    did TEXT PRIMARY KEY,
    persona TEXT NOT NULL,
    trust_score REAL DEFAULT 0.35,
    trust_stage TEXT DEFAULT 'CBT',
    is_probationary INTEGER DEFAULT 1,
    is_quarantined INTEGER DEFAULT 0,
    total_proposals INTEGER DEFAULT 0,
    successful_proposals INTEGER DEFAULT 0,
    failed_proposals INTEGER DEFAULT 0
);
```

## Quarantine

When an agent is quarantined:

1. All pending actions are blocked
2. Agent is flagged in the registry
3. Quarantine reason and timestamp recorded
4. EventBus broadcasts `agentQuarantined` event
5. Minimum 48-hour quarantine period
6. Release requires manual intervention

## Multi-Agent Governance

FailSafe detects and governs multiple AI agents simultaneously:

### Supported Agents

| Agent | Detection Method | Governance Injection |
|-------|-----------------|---------------------|
| Claude CLI | Terminal correlation | `.claude/` skill injection |
| GitHub Copilot | VS Code API detection | `.github/prompts/` injection |
| Codex CLI | Terminal correlation | `.codex/commands/` injection |
| Gemini | Process detection | `.agent/workflows/` injection |
| Cursor | Editor API | `.cursor/rules/` injection |

### Governance Ceremony

```
FailSafe: Set Up Agent Governance
```

Single-command opt-in/opt-out for governance injection across all detected AI agents. The ceremony:

1. Detects running agents via `SystemRegistry`
2. Shows coverage options to the user
3. Injects governance configuration into agent directories
4. Records ceremony to SOA Ledger

### Terminal Correlator

Maps terminal sessions to agent systems for cross-agent audit correlation. This enables the governance layer to attribute actions to specific agents even when multiple agents operate concurrently.

## Trust Events

The SOA Ledger records these trust-related event types:

| Event | Description |
|-------|-------------|
| `TRUST_UPDATE` | Score change (up or down) |
| `PENALTY_APPLIED` | Penalty for failed action |
| `QUARANTINE_START` | Agent quarantined |
| `QUARANTINE_END` | Agent released from quarantine |
| `PROVENANCE_RECORDED` | AI authorship attribution recorded |

## Related Pages

- [[QoreLogic Governance Layer]] — How trust feeds into governance decisions
- [[Sentinel Enforcement Engine]] — How Sentinel verdicts affect trust
- [[Ledger & Checkpoints]] — How trust events are recorded
- [[Risk Grading & Policies]] — How trust influences risk routing
