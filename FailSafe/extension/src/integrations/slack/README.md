# Slack integration

> One-line: FailSafe posts an outbound Block Kit message to a Slack incoming webhook whenever a governance enforcement event fires, giving a team visibility into vetoes, L3 approvals, and critical drift.

- **Pattern:** notify
- **Direction:** outbound notify
- **Status:** shipped v5.4.x
- **Official docs:** Incoming Webhooks — https://api.slack.com/messaging/webhooks · Block Kit — https://api.slack.com/block-kit
- **Backlog:** #100

## What it does
FailSafe subscribes to its verified governance enforcement events, normalizes each into a concise sanitized event, and POSTs a Block Kit message to the configured incoming webhook when enabled. It is notify-only and non-blocking: a Slack outage never affects any FailSafe workflow. Approval decisions are not actioned in Slack — the message link-backs to the local Command Center (interactive action callbacks would need a full Slack app + signed verification, deferred).

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.slack.enabled` | `false` | no | Master on/off. When off, no event is posted. |
| `failsafe.integrations.slack.webhookUrl` | — | yes | Slack incoming-webhook URL the Block Kit message is POSTed to. |

## Security
The webhook URL is a secret: it is read from config and never logged or returned by the notifier or sender. The mapper carries only a sanitized one-line summary (a path or concise detail) — never raw prompts, stack traces, or secrets. Off by default; no network unless enabled, and a missing URL is skipped silently.

## Command / wiring
No command. Wired as `SlackNotifier` in `main.ts`, which subscribes to the governance EventBus and posts on each enforcement event.

## Files
- `slack-notify.ts` — pure logic: builds the Block Kit message from a normalized event
- `slack-notify-map.ts` — pure logic: maps an EventBus governance event → normalized `SlackNotifyEvent` (or null)
- `slack-sender.ts` — injectable transport boundary: build + POST with non-throwing structured result
- `SlackNotifier.ts` — event→notify class: subscribes to the EventBus, gates on config, sends
- test: `src/test/integrations/slack/slack.test.ts`

## Verified surface
- Transport: Slack incoming webhook via `POST` with `Content-Type: application/json`
- Payload: `{ text, blocks }` — `text` is the notification fallback; `blocks` is a Block Kit array
- Block types used: `header` (with `plain_text`), `section` (with `mrkdwn`), `context` (with `mrkdwn` elements)
- Link-back rendered as Slack mrkdwn link `<url|Open Command Center>`
- Subscribed EventBus events: `sentinel.verdict`, `qorelogic.l3Queued`, `qorelogic.l3Decided`, `governance.driftDetected`
