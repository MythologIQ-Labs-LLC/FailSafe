/**
 * slack-sender — thin, injectable sender for FailSafe → Slack notify-only.
 *
 * POSTs a built Block Kit message to the configured incoming-webhook URL. The
 * `post` transport is injected so tests use no live network (B-BIC-24 lesson).
 * Non-blocking by contract: a missing URL or a transport failure returns a
 * structured result and NEVER throws — a Slack outage must not affect any
 * FailSafe workflow (notify-only posture). The webhook URL is a secret; it is
 * never returned or logged here (callers mask it).
 */

import { buildSlackMessage, type SlackNotifyEvent } from './slack-notify';

export interface SlackPostFn {
  (url: string, body: string): Promise<{ status: number }>;
}

export interface SlackSendResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

/**
 * Build + POST a governance notification. Returns `{ skipped: true }` when no
 * webhook URL is configured, `{ ok: true, status }` on a 2xx, and a non-throwing
 * `{ ok: false, error }` on any failure.
 */
export async function sendSlackNotification(
  webhookUrl: string | undefined,
  event: SlackNotifyEvent,
  post: SlackPostFn,
): Promise<SlackSendResult> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { ok: false, skipped: true };
  }
  const message = buildSlackMessage(event);
  try {
    const res = await post(webhookUrl, JSON.stringify(message));
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, error: `Slack webhook returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
