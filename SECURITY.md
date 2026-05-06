# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 4.x.x   | Yes       |
| 3.x.x   | No        |
| 2.x.x   | No        |
| 1.x.x   | No        |
| < 1.0   | No        |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Email**: Send details to security@mythologiq.dev
2. **Subject**: [SECURITY] FailSafe - Brief description
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution Timeline**: Depends on severity

### Disclosure Policy

- We follow coordinated disclosure
- Please allow 90 days before public disclosure
- We will credit reporters (unless anonymity requested)

### Scope

In scope:
- Code vulnerabilities in FailSafe extension
- TrustEngine, EnforcementEngine, PolicyEngine security
- CryptoService integrity issues
- Data exposure risks

Out of scope:
- Social engineering
- Physical security
- Third-party VSCode vulnerabilities

## Security Architecture

FailSafe implements multiple security layers:

- **TrustEngine**: Agent trust scoring
- **EnforcementEngine**: Policy enforcement
- **CryptoService**: Cryptographic operations
- **Merkle Ledger**: Tamper-evident audit trail

All security-critical components require L3 risk grade and mandatory `/qor-audit` before changes.

---
_Thank you for helping keep FailSafe secure._
