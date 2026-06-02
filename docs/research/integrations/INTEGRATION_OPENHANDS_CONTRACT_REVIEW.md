# INTEGRATION — OpenHands Contract Review (Issue #105)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**CONDITIONAL — start-of-run gating only; no mid-run tool mutation.** Viable as observer/governor only if FailSafe accepts OpenHands' core rule: the tool set is part of the system prompt and cannot change mid-conversation. Gate **conversation start**, never attempt dynamic policy mutation during a live run.

## Authentication, permissions, secrets

SDK-centric, not SaaS-auth. Relevant controls: model credentials, tool lists, MCP config, confirmation policy, security analyzer. **Persistence concern:** persisted conversation state can include tools, MCP servers, tool outputs, workspace context, and **secrets** — if persistence-aware observation is enabled, treat the persistence directory as sensitive (encrypt / isolate / disable for higher-risk runs).

## Supported surface, lifecycle, failure modes

Confirmation policies: `AlwaysConfirm`, `NeverConfirm`, `ConfirmRisky`; security analyzers score action risk. Conversations persist/resume, but **the SDK verifies tools must match exactly on resume** — mismatch fails verification. Correct adapter stance: observe events, set confirmation/security policy before execution, and on material policy change, **fork or start a new conversation** rather than mutating a live one.

## Threat posture & minimum safe slice (v1)

Threats: secret persistence, unnoticed drift between persisted and runtime tool sets, over-permissive confirmation policies for shell/file ops. v1: event observer + startup policy gate (confirmation + security analyzer), persistence disabled or isolated. Tests: resume with matching tools, resume with mismatched tools, action-rejection feedback, persistence-directory hygiene, unsupported-version degradation.

## Deferred / blockers

Conceptual, not technical: FailSafe cannot promise mid-run policy mutation because OpenHands explicitly does not support it.

## Implementation checklist (v1)

- [ ] Gate policy before conversation start.
- [ ] Default to confirm-risky or stricter policy profiles.
- [ ] Treat persistence directories as sensitive.
- [ ] Reject mid-run policy mutation and require fork/new conversation.
- [ ] Map OpenHands events to FailSafe transparency schema.
