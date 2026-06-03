/**
 * slack-notify — pure Block Kit payload builder for FailSafe → Slack notify-only
 * governance notifications (B-INT-9 / #100, v1).
 *
 * Per the contract review (INTEGRATION_SLACK_CONTRACT_REVIEW.md): outbound
 * notify-only. Approval decisions are NOT actioned in Slack — the message
 * link-backs to the local Command Center (no interactive action callbacks, which
 * would need a full Slack app + signed verification, deferred).
 *
 * The builder takes a NORMALIZED event (not an EventBus payload), so it is pure
 * and unit-testable, and — critically for the privacy criterion — it only ever
 * emits the typed fields below. Raw prompts, stack traces, and secrets are never
 * carried: the caller's mapper is responsible for passing a concise, sanitized
 * `detail`, and this builder adds nothing beyond `kind`/`title`/`detail`/link.
 */

export type SlackNotifyKind = 'veto' | 'l3-queued' | 'l3-decided' | 'release-seal' | 'critical-drift';

export interface SlackNotifyEvent {
  kind: SlackNotifyKind;
  title: string;
  /** Concise, already-sanitized one-line summary. Never raw content/secrets. */
  detail?: string;
  /** Link back to the local Command Center for the operator to act. */
  consoleUrl?: string;
  ts?: string;
}

export interface SlackMessage {
  text: string; // notification fallback
  blocks: Array<Record<string, unknown>>;
}

const KIND_META: Record<SlackNotifyKind, { emoji: string; label: string }> = {
  veto: { emoji: ':no_entry:', label: 'VETO' },
  'l3-queued': { emoji: ':hourglass_flowing_sand:', label: 'L3 approval queued' },
  'l3-decided': { emoji: ':white_check_mark:', label: 'L3 decided' },
  'release-seal': { emoji: ':lock:', label: 'Release sealed' },
  'critical-drift': { emoji: ':warning:', label: 'Critical drift' },
};

/** Build a concise Slack Block Kit message from a normalized governance event. */
export function buildSlackMessage(event: SlackNotifyEvent): SlackMessage {
  const meta = KIND_META[event.kind] ?? { emoji: ':information_source:', label: event.kind };
  const text = `${meta.label}: ${event.title}`;

  const blocks: Array<Record<string, unknown>> = [
    { type: 'header', text: { type: 'plain_text', text: `${meta.emoji} ${meta.label}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: event.detail ? `*${event.title}*\n${event.detail}` : `*${event.title}*` } },
  ];

  const contextBits: string[] = ['FailSafe governance'];
  if (event.ts) contextBits.push(event.ts);
  if (event.consoleUrl) contextBits.push(`<${event.consoleUrl}|Open Command Center>`);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextBits.join(' · ') }] });

  return { text, blocks };
}
