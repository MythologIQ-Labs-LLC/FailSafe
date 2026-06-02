# INTEGRATION — Microsoft Teams Contract Review (Issue #101)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**READY (notify-only); remote approval BLOCKED in v1.** Notification path via Workflows-generated incoming webhooks works, but the contract is operationally weaker than Slack: workflows are owner-linked, can orphan without co-owners, have payload/throughput limits, and the workflow path does **not** support button rendering. Link-back approval is the only safe v1 design.

## Authentication, permissions, secrets

Sender needs only the generated webhook URL (treat as secret). Operational trust boundary is larger: workflows belong to specific users, not a team/channel, and can orphan. **Require an owner + at least one co-owner documented before enabling Teams notifications in shared production.**

## Supported surface, lifecycle, rate limits, failure modes

Workflows receive HTTP POST and post messages/Adaptive Cards to channels/chats. Limits: **28 KB** message size; throttling above **4 req/s** (use exponential backoff). Legacy M365 connectors are nearing deprecation — Workflows is the forward path. Failure modes: oversized payloads, throttling, owner departure, private-channel posting limits.

## Threat posture & minimum safe slice (v1)

Threats: webhook leakage, silent workflow orphaning, dropped/throttled notices during incident bursts, falsely assuming card buttons can execute governance actions. v1: outbound notifications only, <28 KB, exponential backoff, enablement checklist requiring co-owners. Tests: payload-size budget, 429-style throttling, disabled integration, recovery after owner changes.

## Deferred / blockers

"Notify-ready, approval-blocked": Teams is a visibility sink, not yet a safe governance action surface.

## Implementation checklist (v1)

- [ ] Require workflow owner and co-owner before enablement.
- [ ] Keep payloads well below 28 KB.
- [ ] Implement 4 req/s-aware backoff.
- [ ] Use cards for visibility and links only.
- [ ] Explicitly avoid remote approval actions in v1.
