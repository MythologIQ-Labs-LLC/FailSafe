# Governance webhook integration contract

Contract id: `governance-webhook` (registry row `integration-contract-governance-webhook`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

There is no legacy contract review for this integration.

**Owned files:**
- `FailSafe/extension/src/governance/GovernanceWebhook.ts`

## Customer job

A platform or security team wants FailSafe governance events delivered to its own HTTPS endpoint, signed so the receiver can trust them, so that blocks and approvals can feed an existing pipeline (SIEM, ticketing, chat-ops) without a vendor-specific connector.

## Measurable value

Metric: the share of governance events matching a registered webhook's event list that are delivered with a verifiable signature; on main no webhook can be registered, so the value delivered is zero `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`const governanceWebhook = new GovernanceWebhook();`).
Baseline: none; the sender has never been reachable from the product (unverified beyond a repository search for callers at c36b9ee2).

## Why not simply ask an agent

An agent cannot subscribe to FailSafe's internal events, and a receiver cannot verify that an agent's post came from this workspace. The sender signs the exact transmitted bytes with a shared secret and ships only allowlisted fields, which is the part a receiver can check.

## API documentation

none: the receiver is the customer's own endpoint; there is no entry in `docs/integrations/INTEGRATION_DOCS_INDEX.md` (unverified beyond a search of that file for "webhook" outside Slack and Teams).
The wire contract is defined in code: a JSON body of `event`, `payload` and `timestamp` `FailSafe/extension/src/governance/GovernanceWebhook.ts:82-86` (`const body = JSON.stringify({`).

## Privileges and scopes

Credential: an optional shared secret per webhook, used only to compute the signature header `FailSafe/extension/src/governance/GovernanceWebhook.ts:102-104` (`headers[SIGNATURE_HEADER] = signWebhookBody(config.secret, body);`).
The secret is never returned by the registration listing `FailSafe/extension/src/governance/GovernanceWebhook.ts:163-169` (`hasSecret: Boolean(c.secret),`).
Destination must be https and not a literal private IP address `FailSafe/extension/src/governance/GovernanceWebhook.ts:206-212` (`if (parsed.protocol !== 'https:') return false;`).
Host names are not resolved before the check, so a DNS name that resolves to a private address passes `FailSafe/extension/src/governance/GovernanceWebhook.ts:216` (`if (net.isIP(hostname) === 0) return false;`).
A bracketed private IPv6 literal is a known, deliberately unfixed residual (#347) `FailSafe/extension/src/governance/GovernanceWebhook.ts:106-109` (`#347 bracketed-private-IPv6 SSRF residual`).
Any configuration surface that lets a workspace or user register an endpoint would create a new egress path and is marked requires separate approval (unverified: none exists).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| signed-dispatch | shipped-inert | `signWebhookBody` `FailSafe/extension/src/governance/GovernanceWebhook.ts:52-53` (`export function signWebhookBody(secret: string, body: string): string {`) | none | `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts` (unit) | Absent call site: the instance is built at `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`new GovernanceWebhook()`) and only returned `FailSafe/extension/src/extension/bootstrapGovernance.ts:220` (`governanceWebhook,`); no non-test file calls `register` or `dispatch` on it (unverified beyond a repository search) |
| payload-allowlist | shipped-inert | `buildWebhookRequest` `FailSafe/extension/src/governance/GovernanceWebhook.ts:75-84` (`payload: applyPayloadAllowlist(allow, payload),`) | none | `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts` (unit) | Absent call site: as for signed-dispatch `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`new GovernanceWebhook()`) |
| endpoint-guard | shipped-inert | `GovernanceWebhook` `FailSafe/extension/src/governance/GovernanceWebhook.ts:143-146` (`must be HTTPS and not a private IP`) | none | `FailSafe/extension/src/test/governance/GovernanceWebhook.test.ts` (unit) | Absent call site: `register` is never called outside tests `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`new GovernanceWebhook()`) |
| payload-byte-cap | shipped-inert | `DEFAULT_MAX_PAYLOAD_BYTES` `FailSafe/extension/src/governance/GovernanceWebhook.ts:47` (`export const DEFAULT_MAX_PAYLOAD_BYTES = 65536;`) | none | `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts` (unit) | Absent call site: as for signed-dispatch `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`new GovernanceWebhook()`) |
| webhook-configuration | proposed | none | none | none | Not built: no setting, command or route registers a webhook (unverified beyond a search of `FailSafe/extension/package.json` and the routes) |
| event-subscription | proposed | none | none | none | Not built: nothing forwards event bus events to `dispatch` (unverified beyond a repository search) |

## Inbound fields

The caller supplies an event name and a payload object; only own properties named in the allowlist are read `FailSafe/extension/src/governance/GovernanceWebhook.ts:57-67` (`if (Object.prototype.hasOwnProperty.call(payload, key)) {`).
From the receiver only the HTTP status code is read; the response body is discarded `FailSafe/extension/src/governance/GovernanceWebhook.ts:128-130` (`resolve({ success: res.statusCode === 200, statusCode: res.statusCode });`).

## Outbound fields and egress

Repository content: no by construction, unless a future caller allowlists a content field `FailSafe/extension/src/governance/GovernanceWebhook.ts:9-14` (`Explicit allowlist of top-level payload keys permitted to leave the machine.`).
Metadata: yes when dispatched: the event name and an ISO timestamp `FailSafe/extension/src/governance/GovernanceWebhook.ts:187` (`new Date().toISOString()`).
Graph relationships: no `FailSafe/extension/src/governance/GovernanceWebhook.ts:82-86` (`payload: applyPayloadAllowlist(allow, payload),`).
Governance evidence: yes when dispatched, the allowlisted payload fields; on main nothing is dispatched, so nothing leaves `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`new GovernanceWebhook()`).
Consent: registration of an endpoint and its allowlist is the consent; no UI provides it (unverified beyond a search for callers).

## Transformations

Payload filtered to the allowlist, serialized once, size-checked, then signed over the exact bytes sent `FailSafe/extension/src/governance/GovernanceWebhook.ts:87-96` (`enforced BEFORE signing`).
The signature is `sha256=` plus the HMAC-SHA256 hex digest in the `x-failsafe-signature-256` header `FailSafe/extension/src/governance/GovernanceWebhook.ts:49-53` (`export const SIGNATURE_HEADER = 'x-failsafe-signature-256';`).
The port defaults to 443 when the URL has none `FailSafe/extension/src/governance/GovernanceWebhook.ts:111` (`port: parsed.port`).

## Persisted artifacts

None: registrations live in memory only and are lost on reload `FailSafe/extension/src/governance/GovernanceWebhook.ts:139` (`private configs: WebhookConfig[] = [];`).
No delivery log or health evidence is written (unverified beyond reading the owned file).

## Graph links

Implemented: none `FailSafe/extension/src/governance/GovernanceWebhook.ts:82-86` (`const body = JSON.stringify({`).
Proposed (not built): an event-to-receipt edge when a delivery is recorded, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

None: there is no setting, command, route or Console view for webhooks (unverified beyond a search of `FailSafe/extension/package.json`, the route registrar and the Console modules for "webhook" outside Slack and Teams).
The only product reference is the bootstrap field `FailSafe/extension/src/extension/bootstrapGovernance.ts:44` (`governanceWebhook: GovernanceWebhook;`).

## Governance policy and enforceability limits

Enforced in code (inert on main): http, non-URL and literal private-IP endpoints are refused at registration `FailSafe/extension/src/governance/GovernanceWebhook.ts:143-146` (`Invalid webhook URL: must be HTTPS and not a private IP`).
Enforced in code (inert on main): registration without a non-empty allowlist is refused `FailSafe/extension/src/governance/GovernanceWebhook.ts:147-151` (`an explicit, non-empty allowlist of payload field names is required`).
Enforced in code (inert on main): an oversized body is refused before signing `FailSafe/extension/src/governance/GovernanceWebhook.ts:94-96` (`refused fail-closed`).
Observed: delivery is report-only; a failed delivery changes no governance state `FailSafe/extension/src/governance/GovernanceWebhook.ts:182-195` (`Resolve-only contract`).

## Failure, offline, stale and permission semantics

Any builder failure becomes that target's failure result; dispatch never rejects `FailSafe/extension/src/governance/GovernanceWebhook.ts:182-190` (`dispatch()'s Promise.all must`).
Only HTTP 200 counts as success; 201, 202 and 204 are reported as failures `FailSafe/extension/src/governance/GovernanceWebhook.ts:129` (`success: res.statusCode === 200`).
Offline: a socket error or the 5-second timeout resolves as a failure `FailSafe/extension/src/governance/GovernanceWebhook.ts:132-133` (`resolve({ success: false, error: 'Timeout' });`).
There is no retry, queue or backoff (unverified beyond reading the owned file).

## End-to-end scenario and measurable acceptance

Scenario (not reachable on main): register an https endpoint with a secret and an allowlist, dispatch an event, and verify the signature over the received body `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts:41` (`a receiver recomputing over the transmitted body accepts the signature`).
Metric: the transmitted path, signature header and body are byte-identical to the builder's output (threshold: exact equality) `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts:171` (`transmits EXACTLY the builder contract`).
Existing test: `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts:33` (`authenticated integrity (F-4)`) (unit, injected transport).
Installed-extension test: missing; no product path reaches the sender `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`new GovernanceWebhook()`).

## Recommended disposition

Recommendation for the owner: **RETIRE** unless a customer asks for a generic signed webhook. The sender is well built and tested, but nothing configures or calls it, so it delivers no value and keeps an SSRF residual and a DNS-name gap in shipped code. If kept, it needs a governed configuration surface, an event subscription and a separate egress approval before it can be marked anything but inert.

## Open defects

The bracketed private IPv6 residual is tracked as #347 in the code comment `FailSafe/extension/src/governance/GovernanceWebhook.ts:106-109` (`deliberately-unfixed`).
No BACKLOG item records that the sender has no caller (unverified: searched `docs/BACKLOG.md` for "webhook" and "#347" at c36b9ee2).
