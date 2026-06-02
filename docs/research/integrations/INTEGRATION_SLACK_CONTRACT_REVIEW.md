# INTEGRATION — Slack Contract Review (Issue #100)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**READY (notify-only); interactive approval BLOCKED in v1.** Incoming webhooks post Block Kit messages fine, but interaction handling needs a full Slack app + signed callback verification. v1 posts governance cards; approval decisions route back to the local Command Center (link-back), not remote execution in Slack.

## Authentication, permissions, secrets

Notify-only credential = the webhook URL (treat as secret, mask in settings, rotate by replacement). Remote action approval would need a full Slack app with interactivity, a Request URL, and signing-secret signature verification — out of scope for v1. Never include raw prompts, stack traces, or secrets in channel payloads.

## Supported surface, lifecycle, failure modes

Incoming webhooks accept JSON text + blocks (up to 50 blocks/message). Without app interactivity, buttons are presentation-only. Delivery is best-effort (not transactional) — treat Slack as an asymmetric best-effort notification sink. v1 failure modes: leaked webhook URL, malformed blocks, transient POST failure.

## Threat posture & minimum safe slice (v1)

Threats: channel oversharing, spoofed interaction endpoints (if interactivity added wrong), treating delivery as a governance dependency. v1: concise outbound notifications only (VETO, L3 queued/decided, release-seal, critical-drift). Tests: masked-secret config display, payload rendering, fallback text, malformed payload, non-blocking on POST failure.

## Deferred / blockers

Remote approval blocked: incoming webhooks insufficient; needs a Slack app + interactivity + callback verification (separate issue).

## Implementation checklist (v1)

- [ ] Support outbound webhook URL only in v1.
- [ ] Keep cards concise and non-sensitive.
- [ ] Use buttons only as links back to FailSafe, not action callbacks.
- [ ] Make failures non-blocking and observable.
- [ ] Defer full Slack app interactivity to a separate issue.
