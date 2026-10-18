# Microsoft Teams integration contract

Contract id: `teams` (registry row `integration-contract-teams`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_MICROSOFT_TEAMS_CONTRACT_REVIEW.md`. It required a Workflows webhook with Adaptive Cards under 28 KB, link-back only, exponential backoff on throttling and a documented workflow owner and co-owner before enablement; the code has the first three, surfaces throttling without retrying it, and has no owner check.

**Owned files:**
- `FailSafe/extension/src/integrations/teams/`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/notify-event.ts`, `FailSafe/extension/src/integrations/credentials/`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A team that lives in Microsoft Teams wants FailSafe's blocks and L3 approvals posted to a channel, so that people outside the editor see that an action was stopped or is waiting for a decision.

## Measurable value

Metric: the share of enforcement events (blocking verdict, L3 queued, L3 decided) that produce a Teams card; the notifier subscribes to the same four event names as Slack `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:14-19` (`export const TEAMS_NOTIFY_EVENTS = [`).
Baseline: no delivery counts are collected; only the last delivery's health is kept, so delivery rate in the field is unverified.

## Why not simply ask an agent

An agent cannot see FailSafe's verdict and approval events as they are emitted, and would need the channel's secret webhook to post. This notifier listens on the extension's event bus and posts a fixed card with no prompt or file content.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:58` (`Microsoft Teams`) lists the Teams platform and Incoming webhooks / Adaptive Cards documentation; the row still says "PR #144" under "In review", which is stale `docs/integrations/INTEGRATION_DOCS_INDEX.md:58` (`src/integrations/teams/`).
The payload is a message with one Adaptive Card 1.5 attachment `FailSafe/extension/src/integrations/teams/teams-notify.ts:68-77` (`version: '1.5',`).

## Privileges and scopes

Credential: one Teams Workflows webhook URL in VS Code Secret Storage; the plain-text setting is deprecated and not read `FailSafe/extension/package.json:414-416` (`Plain-text settings are no longer read`).
The webhook URL grants posting to its target channel `FailSafe/extension/package.json:417` (`it grants posting to the target channel`).
A disabled channel never consults the credential store `FailSafe/extension/src/integrations/credentials/credentialGates.ts:186-190` (`if (!enabled) return { enabled: false };`).
The URL is redacted from failure diagnostics `FailSafe/extension/src/integrations/notify-event.ts:39-41` (`return text.split(webhookUrl).join('[webhook]');`).
The workflow belongs to a person, not a channel, and the code does not check for a co-owner (unverified beyond reading the owned files).
Remote approval from Teams is blocked in v1 and marked requires separate approval `FailSafe/extension/src/integrations/teams/teams-notify.ts:8-10` (`remote approval is BLOCKED in v1`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| notify | verified-shipped | `TeamsNotifier` `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:59` (`export class TeamsNotifier {`) | `FailSafe/extension/src/extension/main.ts:313-318` (`new TeamsNotifier(`) | `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts` (unit) | Catalog capability `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:225` (`capabilities: ['notify'],`) |
| veto-notice | verified-shipped | `mapGovernanceEvent` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:52-55` (`case 'sentinel.verdict': {`) | `FailSafe/extension/src/sentinel/VerdictRouter.ts:35` (`this.eventBus.emit('sentinel.verdict', verdict);`) | `FailSafe/extension/src/test/integrations/teams/teams.test.ts` (unit) | Only BLOCK of the emitted decisions matches; QUARANTINE does not `FailSafe/extension/src/shared/types/sentinel.ts:15-20` (`"QUARANTINE";`) |
| l3-queued-notice | verified-shipped | `mapGovernanceEvent` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:63-69` (`case 'qorelogic.l3Queued':`) | `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:125` (`this.eventBus.emit('qorelogic.l3Queued', fullRequest);`) | `FailSafe/extension/src/test/integrations/teams/teams.test.ts` (unit) | The queued request carries `filePath` `FailSafe/extension/src/shared/types/l3-approval.ts:21` (`filePath: string;`); on main (unreleased) it is shown as a path label (see Transformations) |
| l3-decided-notice | verified-shipped | `mapGovernanceEvent` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:70-75` (`case 'qorelogic.l3Decided':`) | `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:156` (`this.eventBus.emit('qorelogic.l3Decided', { request, decision });`) | `FailSafe/extension/src/test/integrations/teams/teams.test.ts` (unit) | The decision reaches the title. In v6.0.8 the path detail is missing because the path is under `request` (F09) `FailSafe/extension/src/qorelogic/L3ApprovalService.ts:156` (`{ request, decision }`); fixed on main, unreleased ([B263], see Transformations) |
| critical-drift-notice | shipped-inert | `mapGovernanceEvent` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:77-82` (`case 'governance.driftDetected':`) | none | none | Absent call site: the only emitter is `FailSafe/extension/src/governance/CheckpointReconciler.ts:112` (`this.eventBus.emit("governance.driftDetected", drift);`) and no non-test file constructs `CheckpointReconciler` (unverified beyond a repository search at c36b9ee2); its payload has no summary (F10, [B264]) |
| release-seal-notice | shipped-inert | `KIND_META` `FailSafe/extension/src/integrations/teams/teams-notify.ts:42` (`'release-seal': { icon:`) | none | none | Absent call site: no subscribed event maps to `release-seal` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:84-85` (`default:`) (F08, [B262]) |
| throttle-backoff | proposed | none | none | none | Not built: a 429 is returned as throttled and not retried `FailSafe/extension/src/integrations/teams/teams-sender.ts:61-62` (`Teams webhook throttled (HTTP 429)`) |
| remote-approval | proposed | none | none | none | Not built; blocked in v1 `FailSafe/extension/src/integrations/teams/teams-notify.ts:8-10` (`remote approval is BLOCKED in v1`) |

## Inbound fields

From each event payload only: `decision` and `artifactPath` (verdict), `filePath` or `title` (L3 queued), `decision` or `status` and `request.filePath`, or a flat `filePath` (L3 decided), `summary` or `detail` (drift), and `timestamp` or `ts` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:47-48` (`const ts = str(p.timestamp) ?? str(p.ts);`).
The event bus envelope is unwrapped before mapping `FailSafe/extension/src/integrations/notify-event.ts:23-31` (`export function readEventBusEvent(event: unknown): EventBusEnvelope {`).
Nothing is read back from Teams; the response body is discarded `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:34-36` (`res.resume();`).

## Outbound fields and egress

Repository content: no; the card carries a label, a title (clamped to 300 characters), an optional detail (clamped to 600), a timestamp and a Console text link `FailSafe/extension/src/integrations/teams/teams-notify.ts:55-66` (`clamp(event.title, 300)`).
Metadata: yes, a file path when the event names one, shown relative to the workspace when it is inside it and as the file name only otherwise (an absolute path elsewhere, a `..` escape or a URI), with control and invisible characters removed and capped at 200 characters `FailSafe/extension/src/integrations/notify-event.ts:93` (`export function notifyPathLabel(`); Teams markdown in the label is not escaped ([B300]); gated by `failsafe.integrations.teams.enabled` and a stored webhook `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:78-79` (`const cfg = this.getConfig();`).
Graph relationships: no `FailSafe/extension/src/integrations/teams/teams-notify.ts:12-14` (`emits only the typed fields below`).
Governance evidence: yes, the fact of a block or an L3 decision and its decision word, under the same gate `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:73` (`L3 decision: `).
Destination: the webhook URL's host and path over TLS; the URL's scheme and port are not used `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:25-32` (`hostname: u.hostname,`).

## Transformations

A blocking verdict becomes a `veto` card titled with its decision `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:53-61` (`Notify only on enforcement (a blocking decision)`).
Each kind gets a fixed icon, label and Adaptive Card color `FailSafe/extension/src/integrations/teams/teams-notify.ts:38-44` (`const KIND_META: Record<TeamsNotifyKind`).
The Console link is a markdown text link, never an action button `FailSafe/extension/src/integrations/teams/teams-notify.ts:62-65` (`link-back is a markdown TEXT link`).
The Console link is always the default local address on port 9376, because the notifier never passes the live Console URL `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:81` (`const notice = mapGovernanceEvent(eventType, payload, undefined, this.workspaceRoot);`).
On main (unreleased, #538): every path line uses the shared path label `FailSafe/extension/src/integrations/notify-event.ts:93` (`export function notifyPathLabel(`), and the L3-decided path is read from `request.filePath`, falling back to a flat `filePath` `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:36` (`return (request as Record<string, unknown>).filePath;`).

## Persisted artifacts

Only the last delivery's health evidence, kept in VS Code workspace state `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:66` (`recordIntegrationHealth('teams'`).
A 2xx is recorded as connected; a message refused for size is recorded as refused `FailSafe/extension/src/integrations/teams/teams-health.ts:12-15` (`return ['failing', 'refused'];`).
No record of which cards were sent is kept (unverified beyond reading the owned files).

## Graph links

Implemented: none; a card links back to the Console page only `FailSafe/extension/src/integrations/teams/teams-notify.ts:65` (`Open Command Center`).
Proposed (not built): a notice-to-receipt edge recorded by the event that caused it, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Settings: `failsafe.integrations.teams.enabled` and the webhook stored with "FailSafe: Set Integration Credential" `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:221-224` (`then store the Incoming Webhook URL with`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).
Failure: a non-delivery shows one warning per channel per session and logs every one `FailSafe/extension/src/extension/main.ts:294-301` (`if (notifyFailureWarned.has(channel)) return;`).
In Teams: a read-only card; Workflows webhooks render no action buttons `FailSafe/extension/src/integrations/teams/teams-notify.ts:78` (`Workflows webhooks do not render action buttons`).

## Governance policy and enforceability limits

Observed: the notifier reports governance events after they happen and never blocks a workflow `FailSafe/extension/src/integrations/teams/teams-sender.ts:6-9` (`Non-blocking by`).
Enforced: a body over the 26,000-byte budget is never sent `FailSafe/extension/src/integrations/teams/teams-sender.ts:52-54` (`return { ok: false, error: TEAMS_PAYLOAD_TOO_LARGE };`).
Enforced: the card carries only typed fields, never raw prompts or content `FailSafe/extension/src/integrations/teams/teams-notify.ts:12-14` (`never raw prompts/content/secrets`).
Advisory: delivery is best effort; a lost post is reported locally, not retried `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:88-95` (`if (!result.ok && !result.skipped) {`).

## Failure, offline, stale and permission semantics

Disabled or no webhook: nothing is sent and nothing recorded `FailSafe/extension/src/integrations/teams/teams-sender.ts:49-50` (`return { ok: false, skipped: true };`).
Enabled with no stored webhook: one warning naming the credential command `FailSafe/extension/src/integrations/credentials/credentialGates.ts:193-197` (`notifications are enabled but no webhook is stored.`).
Throttled (429): a distinct throttled result recorded as rate limited `FailSafe/extension/src/integrations/teams/teams-health.ts:13` (`return ['failing', 'rate_limited'];`).
Offline: a transport error or the 5-second timeout is a network failure `FailSafe/extension/src/integrations/teams/TeamsNotifier.ts:32` (`timeout: 5000,`).
Stale: health older than seven days shows the card as stale `FailSafe/extension/src/integrations/catalog/integration-health.ts:48` (`export const HEALTH_STALE_MS = 7 * 24 * 60 * 60 * 1000;`).
An orphaned or deleted workflow yields a non-2xx and is reported, not retried `FailSafe/extension/src/integrations/teams/teams-sender.ts:64` (`Teams webhook returned HTTP`).

## End-to-end scenario and measurable acceptance

Scenario: enable Teams, store a Workflows webhook, trigger a blocking verdict, and see one Adaptive Card titled "Action blocked (BLOCK)" `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:56-59` (`Action blocked (`).
Metric: one emitted blocking verdict produces exactly one post, and a 429 is reported as throttled (threshold: exact counts) `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts:182` (`Teams: throttling is reported distinctly`).
Existing test: `FailSafe/extension/src/test/integrations/notifier-wiring.test.ts:98` (`Teams: a real emitted VETO verdict is delivered`) (unit, real event bus, injected transport).
Installed-extension test: no test installs the packaged VSIX and posts to a Teams endpoint (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. The Teams notifier mirrors Slack and has the same gaps (drift and release-seal cards cannot fire, a fixed Console port), plus the review's throttle backoff and owner checklist. Fix them together with Slack; the shared mapper shape makes this one change.

## Open defects

[B300] A path label is rendered as Teams markdown, so an agent-chosen path such as `[Approve](https://e.example)` can render as a link `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:27` (`Teams markdown is not escaped (B300).`).
[B264] Drift notices cannot fire on main and would carry no detail (F10) `FailSafe/extension/src/governance/CheckpointReconciler.ts:112` (`governance.driftDetected`).
[B262] The release-seal notice kind is never produced (F08) `FailSafe/extension/src/integrations/teams/teams-notify-map.ts:14-19` (`'governance.driftDetected',`).
