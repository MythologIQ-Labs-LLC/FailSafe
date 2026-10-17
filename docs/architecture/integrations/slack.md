# Slack integration contract

Contract id: `slack` (registry row `integration-contract-slack`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_SLACK_CONTRACT_REVIEW.md`. It scoped v1 to five notice kinds (VETO, L3 queued/decided, release-seal, critical-drift) over an incoming webhook with link-back only; on main two of those kinds never reach Slack (see Feature state).

**Owned files:**
- `FailSafe/extension/src/integrations/slack/`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/notify-event.ts`, `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A team lead wants the people who are not watching the editor to see, in a shared Slack channel, when FailSafe blocks an action or queues or decides an L3 approval, so that a block or a pending approval is not missed.

## Measurable value

Metric: the share of enforcement events (blocking verdict, L3 queued, L3 decided) that produce a Slack post; the notifier subscribes to exactly four event names `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:13-18` (`export const SLACK_NOTIFY_EVENTS = [`).
Baseline: no delivery counts are collected; only the last delivery's health is kept, so delivery rate in the field is unverified.

## Why not simply ask an agent

An agent sees only its own session; it cannot observe FailSafe's verdict and approval events as they are emitted, and it cannot post to a team channel without being handed the channel's secret. This notifier listens on the extension's event bus and posts a fixed, sanitized card with no prompt or file content.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:33` (`Slack notify-only`) lists Slack Incoming Webhooks and Block Kit.
The message is built as Block Kit header, section and context blocks `FailSafe/extension/src/integrations/slack/slack-notify.ts:43-55` (`export function buildSlackMessage(event: SlackNotifyEvent): SlackMessage {`).

## Privileges and scopes

Credential: one Slack incoming-webhook URL held in VS Code Secret Storage; the plain-text setting is deprecated and not read `FailSafe/extension/package.json:398-400` (`Plain-text settings are no longer read`).
The webhook URL grants posting to its one channel and nothing else `FailSafe/extension/package.json:401` (`it grants posting to the target channel`).
A disabled channel never consults the credential store `FailSafe/extension/src/integrations/credentials/credentialGates.ts:186-190` (`if (!enabled) return { enabled: false };`).
The URL is redacted from any failure diagnostic `FailSafe/extension/src/integrations/notify-event.ts:36-38` (`return text.split(webhookUrl).join('[webhook]');`).
Interactive approval from Slack would need a full Slack app with signed callbacks and is marked requires separate approval `FailSafe/extension/src/integrations/slack/slack-notify.ts:5-8` (`Approval decisions are NOT actioned in Slack`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| notify | verified-shipped | `SlackNotifier` `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:58` (`export class SlackNotifier {`) | `FailSafe/extension/src/extension/main.ts:307-312` (`new SlackNotifier(`) | `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts` (unit) | Catalog capability `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:237` (`capabilities: ['notify'],`) |
| veto-notice | verified-shipped | `mapGovernanceEvent` `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:35-38` (`case 'sentinel.verdict': {`) | `FailSafe/extension/src/sentinel/VerdictRouter.ts:35` (`this.eventBus.emit('sentinel.verdict', verdict);`) | `FailSafe/extension/src/test/integrations/slack/slack-notify.test.ts` (unit) | Only BLOCK of the emitted decisions matches; QUARANTINE does not `FailSafe/extension/src/shared/types/sentinel.ts:15-20` (`"QUARANTINE";`) |
| l3-queued-notice | verified-shipped | `mapGovernanceEvent` `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:46-52` (`case 'qorelogic.l3Queued':`) | `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:125` (`this.eventBus.emit('qorelogic.l3Queued', fullRequest);`) | `FailSafe/extension/src/test/integrations/slack/slack-notify.test.ts` (unit) | The queued request carries `filePath`, so the path detail is filled `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:50` (`detail: str(p.filePath) ? `) |
| l3-decided-notice | verified-shipped | `mapGovernanceEvent` `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:53-58` (`case 'qorelogic.l3Decided':`) | `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:156` (`this.eventBus.emit('qorelogic.l3Decided', { request, decision });`) | `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts` (unit) | The decision reaches the title; the path detail never does, because the path is under `request` (F09, [B263]) `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:57` (`detail: str(p.filePath) ? `) |
| critical-drift-notice | shipped-inert | `mapGovernanceEvent` `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:60-65` (`case 'governance.driftDetected':`) | none | none | Absent call site: the only emitter is `FailSafe/extension/src/governance/CheckpointReconciler.ts:112` (`this.eventBus.emit("governance.driftDetected", drift);`) and no non-test file constructs `CheckpointReconciler` (unverified beyond a repository search at c36b9ee2); its payload has no summary (F10, [B264]) |
| release-seal-notice | shipped-inert | `KIND_META` `FailSafe/extension/src/integrations/slack/slack-notify.ts:38` (`'release-seal': { emoji: ':lock:', label: 'Release sealed' },`) | none | none | Absent call site: no subscribed event maps to `release-seal` `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:67-68` (`default:`) (F08, [B262]) |
| interactive-approval | proposed | none | none | none | Not built; the review blocks it in v1 `FailSafe/extension/src/integrations/slack/slack-notify.ts:6-8` (`Approval decisions are NOT actioned in Slack`) |

## Inbound fields

From each event payload only: `decision` and `artifactPath` (verdict), `filePath` or `title` (L3 queued), `decision` or `status` and `filePath` (L3 decided), `summary` or `detail` (drift), and `timestamp` or `ts` `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:31-32` (`const ts = str(p.timestamp) ?? str(p.ts);`).
The event bus envelope is unwrapped before mapping `FailSafe/extension/src/integrations/notify-event.ts:20-28` (`export function readEventBusEvent(event: unknown): EventBusEnvelope {`).
Nothing is read back from Slack; the response body is discarded `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:33-35` (`res.resume();`).

## Outbound fields and egress

Repository content: no; the card carries a title, an optional one-line detail (an artifact path or file path), a timestamp and a Console link `FailSafe/extension/src/integrations/slack/slack-notify.ts:43-55` (`const contextBits: string[] = ['FailSafe governance'];`).
Metadata: yes, a workspace-relative or absolute file path when the event names one, gated by `failsafe.integrations.slack.enabled` and a stored webhook `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:75-76` (`const cfg = this.getConfig();`).
Graph relationships: no `FailSafe/extension/src/integrations/slack/slack-notify.ts:12-14` (`it only ever`).
Governance evidence: yes, the fact of a block or an L3 decision and its decision word, under the same gate `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:56` (`L3 decision: `).
Destination: the webhook URL's host and path over TLS; the URL's scheme and port are not used `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:24-31` (`hostname: u.hostname,`).

## Transformations

A blocking verdict becomes a `veto` notice titled with its decision `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:36-44` (`Notify only on enforcement (a blocking decision)`).
Each kind gets a fixed emoji and label `FailSafe/extension/src/integrations/slack/slack-notify.ts:34-40` (`const KIND_META: Record<SlackNotifyKind`).
The Console link is always the default local address on port 9376, because the notifier never passes the live Console URL `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:78` (`const notice = mapGovernanceEvent(eventType, payload);`).
The envelope's emit time is used when the payload carries no timestamp `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:80` (`if (!notice.ts) notice.ts = timestamp;`).

## Persisted artifacts

Only the last delivery's health evidence, kept in VS Code workspace state `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:65` (`recordIntegrationHealth('slack'`).
A 2xx is recorded as connected, never contract-verified `FailSafe/extension/src/integrations/slack/slack-health.ts:10-12` (`if (r.ok) return ['connected'];`).
No record of which notices were sent is kept (unverified beyond reading the owned files).

## Graph links

Implemented: none; a notice links back to the Console page only `FailSafe/extension/src/integrations/slack/slack-notify.ts:54` (`Open Command Center`).
Proposed (not built): a notice-to-receipt edge recorded by the event that caused it, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Settings: `failsafe.integrations.slack.enabled` and the webhook stored with "FailSafe: Set Integration Credential" `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:233-236` (`then store the Incoming Webhook URL with`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).
Failure: a non-delivery shows one warning per channel per session and logs every one `FailSafe/extension/src/extension/main.ts:294-301` (`if (notifyFailureWarned.has(channel)) return;`).
In Slack: a read-only card with a text link back to the Console; no buttons act `FailSafe/extension/src/integrations/slack/slack-notify.ts:5-8` (`no interactive action callbacks`).

## Governance policy and enforceability limits

Observed: the notifier reports governance events after they happen; it never blocks or changes a workflow `FailSafe/extension/src/integrations/slack/slack-sender.ts:6-9` (`Non-blocking by contract`).
Enforced: the payload carries only typed fields, never raw prompts or content `FailSafe/extension/src/integrations/slack/slack-notify.ts:12-15` (`and this builder adds nothing beyond`).
Advisory: delivery is best effort; a lost post is reported locally, not retried `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:85-91` (`if (!result.ok && !result.skipped) {`).

## Failure, offline, stale and permission semantics

Disabled or no webhook: nothing is sent and nothing recorded `FailSafe/extension/src/integrations/slack/slack-sender.ts:35-36` (`return { ok: false, skipped: true };`).
Enabled with no stored webhook: one warning naming the credential command `FailSafe/extension/src/integrations/credentials/credentialGates.ts:193-197` (`notifications are enabled but no webhook is stored.`).
Non-2xx: an HTTP failure result, 429 recorded as rate limited `FailSafe/extension/src/integrations/slack/slack-health.ts:13-14` (`if (r.status === 429) return ['failing', 'rate_limited'];`).
Offline: a transport error or the 5-second timeout is a network failure `FailSafe/extension/src/integrations/slack/SlackNotifier.ts:31` (`timeout: 5000,`).
Stale: health older than seven days shows the card as stale `FailSafe/extension/src/integrations/catalog/integration-health.ts:48` (`export const HEALTH_STALE_MS = 7 * 24 * 60 * 60 * 1000;`).
A revoked webhook yields a non-2xx and is reported, not retried `FailSafe/extension/src/integrations/slack/slack-sender.ts:44` (`Slack webhook returned HTTP`).

## End-to-end scenario and measurable acceptance

Scenario: enable Slack, store a webhook, trigger a blocking verdict, and see one card in the channel titled "Action blocked (BLOCK)" with the artifact path `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:39-42` (`Action blocked (`).
Metric: one emitted blocking verdict produces exactly one post, a PASS verdict produces none, and a disabled channel neither sends nor reports (threshold: exact counts) `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts:84-88` (`PASS must not notify`).
Existing test: `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts:61-62` (`Slack: a real emitted VETO verdict is delivered`) (unit, real event bus, injected transport).
Installed-extension test: no test installs the packaged VSIX and posts to a Slack endpoint (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. Blocking-verdict and L3 notices work and are tested, but two of the five kinds the design promised cannot fire (drift has no live emitter, release-seal has no event), the L3-decided card loses its path, and the Console link is fixed to the default port. Finishing those is small and keeps the contract honest; until then the settings text overstates the event set.

## Open defects

[B263] L3-decided notices never carry the file path (F09) `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:156` (`{ request, decision }`).
[B264] Drift notices cannot fire on main and would carry no detail (F10) `FailSafe/extension/src/governance/CheckpointReconciler.ts:112` (`governance.driftDetected`).
[B262] The release-seal notice kind is never produced (F08) `FailSafe/extension/src/integrations/slack/slack-notify-map.ts:13-18` (`'governance.driftDetected',`).
The enable setting's description promises critical drift notices `FailSafe/extension/package.json:396` (`VETO, L3 queued/decided, critical drift`).
