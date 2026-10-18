# Governance webhook integration contract

Contract id: `governance-webhook` (registry row `integration-contract-governance-webhook`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

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

Owner decision 2026-10-18 (#538), accepting the recommendation: **RETIRE**. The recommendation was to retire unless a customer asked for a generic signed webhook; the owner decided to retire. The sender is well built and tested, but nothing configures or calls it, so it delivers no value and keeps an SSRF residual and a DNS-name gap in shipped code. If kept, it needs a governed configuration surface, an event subscription and a separate egress approval before it can be marked anything but inert.

## Retirement review (#538)

The owner decided RETIRE on 2026-10-18 (#538); this review lists what a removal touches and removes nothing. The removal is backlog item [B288], a separate small PR `docs/BACKLOG.md` (`[B288] Retire the governance webhook sender`).

### Inventory

Scope: every file hit by the command below at main 243a34a1, with its hit count; it is a search, not a proof that nothing else refers to the sender (unverified beyond this search).
Command: `git grep -c -I -i -E "GovernanceWebhook|signWebhookBody|buildWebhookRequest|governance-webhook|governance webhook|DEFAULT_MAX_PAYLOAD_BYTES|x-failsafe-signature" 243a34a1 --` reports 17 files (unverified beyond this search).
Blind spots: a dynamic lookup or a caller outside this repository would not be found (unverified beyond this search).
- 9 hits, the owned sender `FailSafe/extension/src/governance/GovernanceWebhook.ts:138` (`export class GovernanceWebhook {`).
- 4 hits, the only product importer `FailSafe/extension/src/extension/bootstrapGovernance.ts:18` (`import { GovernanceWebhook } from "../governance/GovernanceWebhook";`).
- 37 hits `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts:33` (`authenticated integrity (F-4)`).
- 4 hits `FailSafe/extension/src/test/governance/GovernanceWebhook.test.ts:5` (`describe('GovernanceWebhook', () => {`).
- 2 hits, the FX1003 constants `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:60` (`'governance-webhook', 'dependency-admission-lint', 'git-bootstrap',`) and `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:72` (`${SRC}/governance/GovernanceWebhook.ts`).
- 38 hits, this contract `docs/architecture/integrations/governance-webhook.md` (`Governance webhook integration contract`).
- 2 hits, the portfolio `docs/architecture/INTEGRATION_PORTFOLIO.md` (`[governance-webhook](integrations/governance-webhook.md)`).
- 1 hit, the registry row `docs/ARCHITECTURE_INDEX.md` (`integration-contract-governance-webhook`).
- 1 hit, the tier row `docs/GOVERNANCE_INDEX.md` (`docs/architecture/integrations/governance-webhook.md`).
- 2 hits, FX300 and FX919 `docs/FEATURE_INDEX.md` (`GovernanceWebhook bounded`).
- 1 hit, the security model page `docs/wiki/Security-Model.md` (`src/governance/GovernanceWebhook.ts`).
- 2 hits, historic, kept `CHANGELOG.md` (`The governance webhook's outbound contract is provably wired and bounded.`).
- 2 hits, historic, kept `FailSafe/extension/CHANGELOG.md` (`IPv6 SSRF coverage in `).
- 1 hit, a released What's New entry, kept `FailSafe/extension/README.md` (`the governance webhook's payload is provably what was signed`).
- 5 hits, historic, kept `docs/SYSTEM_STATE.md` (`IPv6 private range detection in isPrivateIp()`).
- 1 hit, historic, kept `docs/SHADOW_GENOME.md` (`GovernanceWebhook (B81)`).
- 13 hits, Merkle-chained, never edited `docs/META_LEDGER.md` (`GovernanceWebhook SSRF`).
The historic CHANGELOG line says the outbound contract is "provably wired"; that meant the transport seam, not a caller, and no caller exists `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`const governanceWebhook = new GovernanceWebhook();`).

### What breaks on removal

No setting, command, route, UI module or event subscription reaches the sender; the instance is built and returned only `FailSafe/extension/src/extension/bootstrapGovernance.ts:220` (`governanceWebhook,`).
The substrate field is declared `FailSafe/extension/src/extension/bootstrapGovernance.ts:44` (`governanceWebhook: GovernanceWebhook;`), and its consumers never read it `FailSafe/extension/src/extension/bootstrapMCP.ts:13` (`gov: GovernanceSubstrate,`) `FailSafe/extension/src/extension/bootstrapQorLogic.ts:36` (`gov: GovernanceSubstrate,`) (a search for ".governanceWebhook" has no hit; unverified beyond this search).
Two test files go with it `FailSafe/extension/src/test/governance/GovernanceWebhook.test.ts:5` (`describe('GovernanceWebhook', () => {`).
FX1003 names the file as a scan hit `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:72` (`${SRC}/governance/GovernanceWebhook.ts`), and requires every owned path of this contract to exist, so the removal must also teach FX1003 how a retired contract is held; this file stays as history `docs/architecture/integrations/governance-webhook.md` (`**Owned files:**`).
FX300 and FX919 lose their implementation `docs/FEATURE_INDEX.md` (`governance/GovernanceWebhook.test.ts`).

### Bounded removal proposal (B288)

- Delete the sender `FailSafe/extension/src/governance/GovernanceWebhook.ts:138` (`export class GovernanceWebhook {`).
- Delete its tests `FailSafe/extension/src/test/governance/GovernanceWebhook.test.ts:5` (`describe('GovernanceWebhook', () => {`) and `FailSafe/extension/src/test/governance/GovernanceWebhookIntegrity.test.ts:33` (`authenticated integrity (F-4)`).
- Remove the import, field, construction and return `FailSafe/extension/src/extension/bootstrapGovernance.ts:177` (`const governanceWebhook = new GovernanceWebhook();`).
- Drop the named scan hit and add a retired-contract rule `FailSafe/extension/src/test/docs/integration-contracts.test.cjs:72` (`${SRC}/governance/GovernanceWebhook.ts`).
- Mark FX300 and FX919 retired, keeping the rows `docs/FEATURE_INDEX.md` (`GovernanceWebhook bounded`).
- Remove the security model row `docs/wiki/Security-Model.md` (`src/governance/GovernanceWebhook.ts`).
- Update this contract and its portfolio row `docs/architecture/INTEGRATION_PORTFOLIO.md` (`[governance-webhook](integrations/governance-webhook.md)`).
- Add a CHANGELOG line under Unreleased `CHANGELOG.md` (`## [Unreleased]`).
- Operator action, not a file: comment on #347 that the code carrying the residual is gone `FailSafe/extension/src/governance/GovernanceWebhook.ts:106-109` (`#347 bracketed-private-IPv6 SSRF residual`).

### Settings strategy and migration

Settings: none is contributed for the sender (a search of package.json for "webhook" outside Slack and Teams; unverified beyond this search).
Migration note: none is needed, because no user surface reaches the sender `FailSafe/extension/src/extension/bootstrapGovernance.ts:220` (`governanceWebhook,`).

## Open defects

The bracketed private IPv6 residual is tracked as #347 in the code comment `FailSafe/extension/src/governance/GovernanceWebhook.ts:106-109` (`deliberately-unfixed`).
No BACKLOG item recorded that the sender has no caller at c36b9ee2 (unverified: searched `docs/BACKLOG.md` for "webhook" and "#347"); the bounded removal is now B288 (see the Retirement review above).
