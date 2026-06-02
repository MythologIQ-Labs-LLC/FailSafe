# INTEGRATION — MCP Registry Contract Review (Issue #108)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**READY (read-only); preview stability risk remains.** The official MCP Registry is a good read-only discovery + local-scoring source, and a bad v1 install surface. Reading is public; publishing is preview-era with multiple auth/ownership-verification methods, and the quickstart warns of breaking changes / data resets before GA. Local risk scoring on registry metadata is a strong day-one feature; **automated install stays out of scope.**

## Authentication, permissions, secrets

Read-only search/details needs **no auth** (registry is public for reading). Publishing (out of scope v1) supports GitHub OAuth, GitHub OIDC, DNS verification, HTTP verification, plus a legacy JWT publish layer — do not implement any of it while preview.

## Supported surface, lifecycle, failure modes

The registry hosts **metadata, not artifacts**. MCP spec centers Streamable HTTP + OAuth auth + richer tool annotations; clients may still support stdio/HTTP/legacy SSE. **Security:** the registry project published a stored-XSS advisory (poisoned metadata in the catalogue UI) — render all registry-returned fields as inert text and compute risk annotations locally.

## Threat posture & minimum safe slice (v1)

Threats: UI injection via metadata, falsely trusting registry presence as a quality signal, overfitting to a preview API. v1: public read-only search/details + locally-computed scoring (unknown publisher, remote transport, missing repo, broad tool names, stale version) + explicit "registry unavailable" offline mode. Tests: malformed metadata, missing repo links, transport classification, stale versions, namespace ambiguity, HTML/URL sanitization.

## Deferred / blockers

Blocker = preview stability; manageable for read-only use behind feature flags + offline fallback. No auto-install/auto-launch in v1.

## Implementation checklist (v1)

- [ ] Keep v1 read-only and offline-tolerant.
- [ ] Sanitize every registry-returned field before rendering.
- [ ] Score publisher identity, transport risk, and metadata completeness locally.
- [ ] Never auto-install or auto-launch from this feature.
- [ ] Pin registry parsing tests to representative fixtures.
