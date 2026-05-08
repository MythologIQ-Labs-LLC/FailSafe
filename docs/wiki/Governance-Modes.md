# Governance Modes

FailSafe supports three governance modes to match your workflow needs. Mode determines how aggressively FailSafe intervenes in the development workflow.

## Mode Overview

| Mode | Blocking | Friction | Best For |
|------|----------|----------|----------|
| **Observe** | Never | Zero | New users, exploration, learning |
| **Assist** | On warnings | Low | Most development workflows (recommended) |
| **Enforce** | On all L2+ | High | Compliance, regulated industries |

## Switching Modes

### Via Command Palette

```
FailSafe: Set Governance Mode
```

### Via VS Code Settings

```json
{
  "failsafe.governance.mode": "assist"
}
```

### Via @failsafe Chat

```
@failsafe /status
```

## Mode Details

### Observe Mode

**Behavior**: No blocking, just visibility and logging. Zero friction.

- Sentinel audits run but never block saves
- All verdicts are recorded to the SOA Ledger
- Risk grades are computed and displayed
- Trust scores are tracked
- No intent gating
- L3 queue operates in notification-only mode
- Break-glass protocol is available but not required

**Default for**: New installations

**When to use**:
- Evaluating FailSafe for the first time
- Exploring a codebase without constraints
- Learning how governance works
- Projects where governance is advisory only

### Assist Mode

**Behavior**: Smart defaults, auto-intent creation, gentle prompts.

- Sentinel audits run and may prompt for risky changes
- Auto-intent creation when missing (saves proceed with auto-generated intent)
- L2 changes generate warning prompts but proceed
- L3 changes are queued for approval with SLA tracking
- Risk-aware suggestions and guidance
- EnforcementEngine respects mode for enforcement decisions

**Default for**: After initial evaluation (recommended)

**When to use**:
- Day-to-day development with AI assistance
- Teams wanting guardrails without heavy process
- Projects where some risk gating is desired

### Enforce Mode

**Behavior**: Full control, intent-gated saves, L3 approvals required.

- **Intent-gated saves**: Every save requires a declared intent
- **L3 mandatory approval**: Human must approve all L3 changes
- **No auto-approve**: Even L1 changes are logged with full context
- **Break-glass available**: Emergency override with time limit and audit trail
- **Commit hooks enforced**: Pre-commit guard validates governance state
- **SLA enforcement**: L3 queue auto-prunes expired items

**Default for**: Never (opt-in only)

**When to use**:
- Regulated industries (healthcare, finance, government)
- Security-sensitive codebases
- Compliance requirements (SOC 2, GDPR)
- Production deployment pipelines

## Mode Change Audit Trail

All mode changes are recorded to the SOA Ledger:

```
Event: USER_OVERRIDE
Payload: {
  "previousMode": "observe",
  "newMode": "enforce",
  "changedBy": "did:myth:overseer:local",
  "timestamp": "2026-05-08T01:00:00Z"
}
```

This ensures mode changes are always traceable and auditable.

## Break-Glass Protocol

In Enforce mode, FailSafe provides an emergency override mechanism:

### Activate

```
FailSafe: Activate Break-Glass Override
```

### Properties

- **Time-limited**: Override expires after a configurable duration
- **Justification required**: Must provide reason for override
- **Auto-revert**: Automatically returns to Enforce mode when expired
- **Full audit trail**: Override activation and expiration logged to ledger

### Revoke

```
FailSafe: Revoke Break-Glass Override
```

## Related Pages

- [[Architecture Overview]] — How modes fit into the layer architecture
- [[SHIELD Lifecycle Workflow]] — How modes affect SHIELD phase enforcement
- [[Risk Grading & Policies]] — How risk grades interact with governance modes
- [[Troubleshooting & FAQ]] — Common mode-related issues
