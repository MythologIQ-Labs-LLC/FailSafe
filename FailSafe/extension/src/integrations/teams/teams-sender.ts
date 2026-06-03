/**
 * teams-sender — thin, injectable sender for FailSafe → Microsoft Teams
 * notify-only (B-INT-10 / #101).
 *
 * POSTs a built Adaptive Card message to the configured Workflows webhook. The
 * `post` transport is injected so tests use no live network. Non-blocking by
 * contract: a missing URL, an oversized payload, throttling (429), or any
 * transport failure returns a structured result and NEVER throws — a Teams
 * outage must not affect any FailSafe workflow. The webhook URL is a secret;
 * it is never returned or logged here (callers mask it).
 *
 * The contract caps Workflows messages at 28 KB and throttles above 4 req/s; we
 * guard the size defensively and surface 429 distinctly so callers can see
 * throttling without a thrown error.
 */

import { buildTeamsMessage, type TeamsNotifyEvent } from './teams-notify';

/** Conservative budget below the contract's 28 KB Workflows limit. */
export const TEAMS_MAX_BYTES = 26_000;

export interface TeamsPostFn {
  (url: string, body: string): Promise<{ status: number }>;
}

export interface TeamsSendResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  throttled?: boolean;
  error?: string;
}

/**
 * Build + POST a governance notification. Returns `{ skipped: true }` when no
 * webhook URL is configured, `{ ok: false, error: 'payload too large' }` when
 * the body exceeds the budget (never sent), `{ ok: true, status }` on a 2xx,
 * `{ ok: false, throttled: true, status: 429 }` on throttling, and a
 * non-throwing `{ ok: false, error }` on any other failure.
 */
export async function sendTeamsNotification(
  webhookUrl: string | undefined,
  event: TeamsNotifyEvent,
  post: TeamsPostFn,
): Promise<TeamsSendResult> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { ok: false, skipped: true };
  }
  const body = JSON.stringify(buildTeamsMessage(event));
  if (Buffer.byteLength(body, 'utf8') > TEAMS_MAX_BYTES) {
    return { ok: false, error: 'payload exceeds Teams Workflows size budget' };
  }
  try {
    const res = await post(webhookUrl, body);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status };
    }
    if (res.status === 429) {
      return { ok: false, throttled: true, status: 429, error: 'Teams webhook throttled (HTTP 429)' };
    }
    return { ok: false, status: res.status, error: `Teams webhook returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
