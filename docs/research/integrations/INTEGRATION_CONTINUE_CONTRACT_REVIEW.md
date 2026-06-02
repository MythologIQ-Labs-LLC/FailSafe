# INTEGRATION — Continue Contract Review (Issue #104)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**READY (with version pin).** Continue CLI is a strong v1 wrapper target: headless mode, API-key auth, structured JSON output, and explicit tool-permission controls are all documented. Caveat: doc drift around the exact `--allow` grammar — resolve by pinning the tested CLI version and exercising it in contract tests.

## Authentication, permissions, secrets

`CONTINUE_API_KEY` (personal or org-scoped) for CI/headless. Tool permissions via CLI flags + persistent `~/.continue/permissions.yaml`. **Inject credentials via environment only, never as CLI args** (process-listing/log leakage). Continue writes verbose logs to `~/.continue/logs/cn.log` — ensure secrets/prompts aren't echoed there during guarded runs.

## Supported surface, lifecycle, failure modes

`cn -p` runs a single headless task, `--format json` emits structured output, can resume sessions, and headless mode auto-excludes interactive-approval tools unless explicitly allowed. **Contract gap:** one doc shows `--allow Write --allow Edit`, another `--allow Write()` + Bash filters like `Bash(curl*)` — pin a known-good version and add spawn-level contract tests before shipping.

## Threat posture & minimum safe slice (v1)

Threats: over-broad `--allow "*"`, Bash/write side effects, API-key leakage via logs, hidden syntax drift. v1: read-only / no-tool wrapper first; explicit `Write`/`Edit` allow paths only after version-pinned validation. Tests: missing binary, invalid API key, no-tool mode, write-allowed mode, JSON parsing, permissions-syntax contract tests against the pinned CLI.

## Deferred / blockers

No platform blocker; clear version-pin requirement before enabling write paths.

## Implementation checklist (v1)

- [ ] Pin a Continue CLI version in tests.
- [ ] Use `CONTINUE_API_KEY` via env only.
- [ ] Start with no-tool or read-only tool profile.
- [ ] Validate actual `--allow` grammar on the pinned version.
- [ ] Parse JSON output and redact logs.
