# INTEGRATION — Semgrep / SARIF Contract Review (Issue #99)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**READY** — offline-first ingestion. One of the cleanest in the set: start with **offline SARIF import** (vendor-neutral OASIS standard), add **local Semgrep execution** later. Semgrep CE runs locally without an account and emits SARIF/JSON.

## Authentication, permissions, secrets

`semgrep scan` needs no account. `semgrep ci` may need login / `SEMGREP_APP_TOKEN` for AppSec Platform org policies. Secret-minimizing rollout: offline import → local `semgrep scan` → platform integration last. Optional GitHub SARIF upload needs repo access + valid SARIF.

## Supported surface, lifecycle, failure modes

Emits SARIF + JSON. **Exit-code nuance:** `semgrep scan`/`ci` exit 0 on completion unless blocking rules configured (blocking findings in CI → exit 1) — do **not** infer "no findings" from exit code alone. GitHub accepts only a subset of SARIF 2.1.0. Best v1: parse SARIF as data, compute FailSafe risk records locally, defer running scanners or publishing results.

## Threat posture & minimum safe slice (v1)

Threats: malformed SARIF crashing the parser, path confusion, duplicate-finding storms, over-fitting to producer-specific semantics. v1: offline SARIF parser with strict schema validation, stable dedup keys, explicit provenance. Tests: Semgrep CE SARIF fixture, malformed files, duplicate imports, missing region data, GitHub-subset validation, waived-finding requires explicit operator action.

## Deferred / blockers

No meaningful blocker for the offline-parse slice. Local runner + GitHub upload are later, flagged features.

## Implementation checklist (v1)

- [ ] Implement strict SARIF 2.1.0 parser with fixture-based tests.
- [ ] Upsert findings with stable dedup keys and provenance.
- [ ] Keep local import independent of Semgrep account features.
- [ ] Add optional local Semgrep runner after parser stabilizes.
- [ ] Defer GitHub SARIF upload to a separate feature flag.
