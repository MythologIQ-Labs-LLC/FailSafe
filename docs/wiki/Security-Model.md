# Security Model

FailSafe implements multiple security layers to protect governance integrity, prevent unauthorized access, and maintain audit trail authenticity.

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| LLM bypassing governance rules | Deterministic TypeScript enforcement (not prompt-based) |
| Governance ledger tampering | Merkle hash chain + Ed25519 signatures |
| Secret exposure | Pattern detection + blocking |
| XSS in webview | HTML escaping on all interpolated values |
| SSRF via API | Local-only connections + IPv6 SSRF coverage |
| Command injection | List-form `spawn()` with no shell strings |
| Supply chain (skills) | Allowlist validation for Whisper models (3) and Piper voices (20) |
| Unauthorized API access | `rejectIfRemote` on all endpoints |

## Cryptographic Operations

### Hash Chain

```
Genesis Block (self-referential)
    ↓ SHA-256
Entry 1 (prev_hash = genesis.entry_hash)
    ↓ SHA-256
Entry 2 (prev_hash = entry1.entry_hash)
    ↓ SHA-256
Entry N ...
```

- **Algorithm**: SHA-256 for entry hashing
- **Signing**: Ed25519 for entry signatures
- **Key derivation**: Argon2id for signing key derivation
- **Key storage**: VS Code SecretStorage (not filesystem)
- **Key rotation**: 30-day cycle

### Artifact Hashing

SHA-256 hash of file content at save-time is recorded in the ledger for verification:

```
File Save → SHA-256(content) → Ledger Entry
```

This enables verification that file contents haven't changed since the governance decision was recorded.

## Enforcement Layers

### Save-Time Enforcement

The `EnforcementEngine` evaluates every file save:

1. **Governance mode check** — Observe never blocks, Assist warns, Enforce blocks
2. **Risk classification** — L1/L2/L3 determines enforcement level
3. **Policy evaluation** — Deterministic rules applied
4. **Verdict** — PASS/WARN/BLOCK/ESCALATE/QUARANTINE
5. **Action** — Allow, warn, block, or escalate

### Pre-Commit Guard

Optional git pre-commit hook that queries `GET /api/v1/governance/commit-check` before allowing commits:

```
FailSafe: Install Commit Hook
```

### Break-Glass Protocol

Emergency override for Enforce mode:

- Time-limited activation
- Justification required
- Auto-revert on expiration
- Full audit trail

## Input Validation

### SQL Injection Prevention

- `SchemaVersionManager.hasColumn()` validates table names against a strict whitelist before PRAGMA queries
- All database operations use parameterized queries

### XSS Prevention

- HTML escaping on all dynamic values interpolated into `innerHTML`:
  - Voice settings, audio device data attributes
  - TTS voice picker
  - Ticker bar (Sentinel mode)
  - Risk register cells
  - Governance Sentinel card
  - Settings Configuration card
  - Living Graph tooltips and stats
  - Revert result display

### Command Injection Prevention

- All subprocess invocations use list-form `spawn(cmd, args)`
- No shell strings
- `pip install` bounded by 120s timeout
- `qorlogic install` per host bounded by 180s timeout

### Supply Chain Hardening

- Whisper model IDs validated against `ALLOWED_WHISPER_MODELS` (3 entries)
- Piper voice IDs validated against `ALLOWED_PIPER_VOICES` (20 entries)
- Prevents localStorage-XSS pivot to arbitrary downloads

## Security-Critical Components

All components below are classified L3 and require mandatory `/qor-audit` before changes:

| Component | Path | Description |
|-----------|------|-------------|
| `CryptoService` | `src/shared/CryptoService.ts` | Cryptographic operations |
| `TrustEngine` | `src/qorelogic/trust/TrustEngine.ts` | Trust scoring |
| `EnforcementEngine` | `src/governance/EnforcementEngine.ts` | Policy enforcement |
| `PolicyEngine` | `src/qorelogic/policies/PolicyEngine.ts` | Policy evaluation |
| `LedgerManager` | `src/qorelogic/ledger/LedgerManager.ts` | Ledger operations |
| `GovernanceWebhook` | `src/governance/GovernanceWebhook.ts` | Webhook handling |
| `CommitGuard` | `src/governance/CommitGuard.ts` | Pre-commit validation |

## Vulnerability Reporting

See [SECURITY.md](https://github.com/MythologIQ-Labs-LLC/FailSafe/blob/main/SECURITY.md):

- **Email**: security@mythologiq.dev
- **Response time**: 48-hour acknowledgment, 1-week initial assessment
- **Disclosure**: Coordinated, 90-day timeline
- **Scope**: Extension code, TrustEngine, EnforcementEngine, CryptoService, data exposure risks

## Related Pages

- [[Ledger & Checkpoints]] — Cryptographic chain integrity
- [[Trust Engine & Agents]] — Trust scoring security
- [[Configuration Reference]] — Security-related settings
- [[Risk Grading & Policies]] — L3 security requirements
