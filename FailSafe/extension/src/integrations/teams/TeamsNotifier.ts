/**
 * TeamsNotifier — wires FailSafe governance enforcement events to outbound
 * Microsoft Teams notify-only posts (B-INT-10 / #101). Subscribes to the
 * verified enforcement events, maps each (pure mapGovernanceEvent), and POSTs an
 * Adaptive Card to the configured Workflows webhook when enabled. Notify-only +
 * non-blocking: a Teams failure never affects any FailSafe workflow. The webhook
 * URL is read from config and never logged here.
 *
 * Mirrors SlackNotifier; the mapping + send are pure/unit-tested, this class is
 * the thin event wiring.
 */

import * as https from 'https';
import type { EventBus } from '../../shared/EventBus';
import { sendTeamsNotification, type TeamsPostFn } from './teams-sender';
import { mapGovernanceEvent, TEAMS_NOTIFY_EVENTS } from './teams-notify-map';
import type { TeamsNotifyKind } from './teams-notify';
import { readEventBusEvent, redactWebhookUrl } from '../notify-event';

const defaultPost: TeamsPostFn = (url, body) =>
  new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 5000,
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });

export interface TeamsNotifierConfig { enabled: boolean; webhookUrl?: string }

/** A notification that was built and attempted but did not reach Teams. */
export interface TeamsDeliveryFailure { kind: TeamsNotifyKind; status?: number; throttled?: boolean; error?: string }

/** Receives every non-delivery. Must never throw — delivery stays non-blocking. */
export type TeamsFailureSink = (failure: TeamsDeliveryFailure) => void;

const defaultOnFailure: TeamsFailureSink = (failure) =>
  console.warn('[FailSafe] Teams governance notification not delivered', failure);

export class TeamsNotifier {
  constructor(
    private readonly eventBus: EventBus,
    private readonly getConfig: () => TeamsNotifierConfig,
    private readonly post: TeamsPostFn = defaultPost,
    private readonly onFailure: TeamsFailureSink = defaultOnFailure,
  ) {}

  register(): void {
    for (const evt of TEAMS_NOTIFY_EVENTS) {
      this.eventBus.on(evt, (event: unknown) => { void this.handle(evt, event); });
    }
  }

  private async handle(eventType: string, event: unknown): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.enabled || !cfg.webhookUrl) return;
    const { payload, timestamp } = readEventBusEvent(event);
    const notice = mapGovernanceEvent(eventType, payload);
    if (!notice) return;
    if (!notice.ts) notice.ts = timestamp;
    const result = await sendTeamsNotification(cfg.webhookUrl, notice, this.post); // non-blocking by contract
    // Notify-only never blocks a workflow, but a dropped governance alert must
    // still leave a trace — silence would read as "no veto happened".
    if (!result.ok && !result.skipped) {
      this.onFailure({
        kind: notice.kind,
        status: result.status,
        throttled: result.throttled,
        error: redactWebhookUrl(result.error, cfg.webhookUrl),
      });
    }
  }
}
