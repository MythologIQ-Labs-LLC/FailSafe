# Microsoft Teams integration

> One-line: FailSafe posts an outbound Adaptive Card to a Teams Workflows webhook whenever a governance enforcement event fires, giving a team visibility into vetoes, L3 approvals, and critical drift.

- **Pattern:** notify
- **Direction:** outbound notify
- **Status:** in review (#144)
- **Official docs:** Teams platform — https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/essentials/api · Incoming webhooks / Adaptive Cards — https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/connectors-using
- **Backlog:** #101

## What it does
FailSafe subscribes to its verified governance enforcement events, normalizes each into a concise sanitized event, and POSTs an Adaptive Card to the configured Power Automate Workflows webhook when enabled. It is notify-only and non-blocking: a Teams outage, throttle, or oversized payload never affects any FailSafe workflow. Remote approval is blocked in v1 — the card link-backs to the local Command Center as a markdown text link (Workflows webhooks do not render action buttons).

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.teams.enabled` | `false` | no | Master on/off. When off, no event is posted. |
| `failsafe.integrations.teams.webhookUrl` | — | yes | Teams Workflows incoming-webhook URL the Adaptive Card is POSTed to. |

## Security
The webhook URL is a secret: it is read from config and never logged or returned by the notifier or sender. The mapper carries only a sanitized one-line summary (a path or concise detail) — never raw prompts, content, or secrets. The card is clamped and the sender enforces a conservative byte budget under the Workflows size limit. Off by default; no network unless enabled, and a missing URL is skipped silently.

## Command / wiring
No command. Wired as `TeamsNotifier` in `main.ts`, which subscribes to the governance EventBus and posts on each enforcement event.

## Files
- `teams-notify.ts` — pure logic: builds the Adaptive Card message from a normalized event
- `teams-notify-map.ts` — pure logic: maps an EventBus governance event → normalized `TeamsNotifyEvent` (or null)
- `teams-sender.ts` — injectable transport boundary: build + POST with non-throwing structured result
- `TeamsNotifier.ts` — event→notify class: subscribes to the EventBus, gates on config, sends
- test: `src/test/integrations/teams/teams.test.ts`

## Verified surface
- Transport: Power Automate Workflows incoming webhook via `POST` with `Content-Type: application/json`
- Envelope: `{ type: 'message', attachments: [{ contentType, content }] }`
- Attachment contentType: `application/vnd.microsoft.card.adaptive`
- Card content: `$schema` `http://adaptivecards.io/schemas/adaptive-card.json`, `type: 'AdaptiveCard'`, `version: '1.5'`, `body` of `TextBlock` elements; no `actions` (Workflows cannot render buttons)
- TextBlock `color` values used: `Attention`, `Warning`, `Good`, `Accent`, `Default`
- Constraints honored: 28 KB Workflows message limit (guarded defensively), 429 surfaced distinctly as throttling
- Subscribed EventBus events: `sentinel.verdict`, `qorelogic.l3Queued`, `qorelogic.l3Decided`, `governance.driftDetected`
