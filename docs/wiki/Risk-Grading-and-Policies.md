# Risk Grading & Policy Configuration

FailSafe uses a three-tier risk classification system to determine the governance requirements for each file and change.

## Risk Grades

| Grade | Name | Description | Verification | Auto-Approve | Authority |
|-------|------|-------------|-------------|-------------|-----------|
| **L1** | Routine | Low impact, non-functional changes | Heuristic check, 10% sampling | Yes | System |
| **L2** | Functional | Medium impact, logic changes | Full Sentinel pass | No | Sentinel |
| **L3** | Critical | High impact, security-sensitive | Formal + human approval | No | Overseer (human) |

## L1 — Routine

Low-risk changes that have minimal functional impact.

**Examples**:
- Documentation updates
- Whitespace/formatting changes
- Comment additions
- Typo fixes

**Governance**:
- Heuristic check only
- 10% random sampling for verification
- Auto-approved (no human review)
- Minimal ledger recording

## L2 — Functional

Medium-risk changes that affect behavior.

**Examples**:
- Bug fixes
- Feature additions
- API integrations
- UI behavior changes

**Governance**:
- Full Sentinel pass (all engines)
- No auto-approve
- Sentinel verdict determines outcome
- Full ledger recording with policy hash

## L3 — Critical

High-risk changes touching security-sensitive areas.

**Examples**:
- Authentication logic
- Encryption implementation
- Payment processing
- Data migration
- Credential handling

**Governance**:
- Formal verification required
- Human (Overseer) approval required
- Full audit trail with SLA enforcement
- Time-limited approval queue (default: 120s first response SLA)

## Automatic Classification

### File Path Triggers

Files are classified as L3 when their paths contain these patterns:

| Trigger | Example Paths |
|---------|---------------|
| `auth` | `src/auth/login.ts`, `api/auth/handler.ts` |
| `login` | `routes/login.ts` |
| `password` | `utils/password.ts` |
| `payment` | `services/payment.ts` |
| `billing` | `billing/invoice.ts` |
| `encrypt` | `crypto/encrypt.ts` |
| `crypto` | `utils/crypto.ts` |
| `migration` | `migrations/001_create_users.ts` |
| `admin` | `admin/panel.ts` |
| `secret` | `config/secret.ts` |
| `credential` | `auth/credential-store.ts` |

### Content Triggers

Files are classified as L3 when their content contains these patterns:

| Trigger | Pattern |
|---------|---------|
| `CREATE TABLE` | SQL schema changes |
| `DROP TABLE` | SQL destructive operations |
| `ALTER TABLE` | SQL schema modifications |
| `def authenticate` | Authentication function definition |
| `class Auth` | Authentication class |
| `bcrypt` | Password hashing |
| `AES` / `RSA` | Encryption algorithms |
| `private_key` | Private key references |
| `api_key` | API key references |
| `password` | Password field references |
| `credential` | Credential references |

### Override Rules

These rules take precedence over automatic classification:

1. **Explicit L3 in spec** → Always L3 (cannot be downgraded)
2. **Security keyword + logic change** → L3
3. **Test file only** → Maximum L1 (even if content triggers fire)
4. **Documentation only** → L1

## Custom Risk Configuration

Create or edit `.failsafe/config/policies/risk_grading.json` to customize triggers:

```json
{
  "filePathTriggers": {
    "L3": ["auth", "payment", "credential"],
    "L2": ["service", "handler", "controller"]
  },
  "contentTriggers": {
    "L3": ["DROP TABLE", "api_key", "private_key", "EXEC sp_"],
    "L2": ["TODO", "HACK", "FIXME"]
  }
}
```

**Behavior**:
- Top-level sections replace defaults entirely
- Include full sections if you want to preserve default triggers
- Missing sections fall back to defaults
- Changes are loaded on startup

## Policy Evaluation

The `PolicyEngine` (`src/qorelogic/policies/PolicyEngine.ts`) evaluates policies against artifacts:

```
File Change
    │
    ├── Risk Classification
    │   ├── Path triggers → L1/L2/L3
    │   ├── Content triggers → L1/L2/L3
    │   └── Override rules → Final grade
    │
    ├── Grade Requirements
    │   ├── L1 → Heuristic check, sampling
    │   ├── L2 → Full Sentinel pass
    │   └── L3 → Formal + human approval
    │
    └── Policy Hash
        └── Computed for replay fidelity
```

## L3 Approval Workflow

```
SENTINEL_VERDICT: L3_REQUIRED
    │
    ├── QUEUED (SLA: 2 minutes first response)
    │   └── Timeout → NOTIFY_URGENT
    │
    ├── UNDER_REVIEW (SLA: 24 hours full decision)
    │   ├── APPROVE → COMMIT_TO_LEDGER, +5% trust
    │   ├── APPROVE_WITH_CONDITIONS → AWAIT_REMEDIATION
    │   ├── REJECT → ARCHIVE_TO_SHADOW_GENOME, -10% trust
    │   ├── DEFER → AWAIT_RESPONSE
    │   └── ESCALATE → Additional reviewers
    │
    └── SLA BREACH ESCALATION
        ├── 4 hours: Secondary Overseer notified
        ├── 8 hours: All Overseers notified
        └── 24 hours: Auto-defer with incident logged
```

## L3 SLA Configuration

```json
{
  "failsafe.qorelogic.l3SLA": 120
}
```

Default: 120 seconds for first response. The L3 approval queue auto-prunes expired items on read.

## Related Pages

- [[QoreLogic Governance Layer]] — How risk grades feed into governance decisions
- [[Sentinel Enforcement Engine]] — How patterns are detected
- [[Governance Modes]] — How modes affect risk grade enforcement
- [[Trust Engine & Agents]] — How L3 approval affects trust scores
