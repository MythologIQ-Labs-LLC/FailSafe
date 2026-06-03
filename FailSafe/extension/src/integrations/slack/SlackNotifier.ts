/**
 * SlackNotifier — wires FailSafe governance enforcement events to outbound Slack
 * notify-only posts (B-INT-9 / #100). Subscribes to the verified enforcement
 * events, maps each (pure mapGovernanceEvent), and POSTs to the configured
 * incoming-webhook when enabled. Notify-only + non-blocking: a Slack failure
 * never affects any FailSafe workflow. The webhook URL is read from config and
 * never logged here.
 *
 * The mapping + send are pure/unit-tested; this class is the thin event wiring.
 */

import * as https from 'https';
import type { EventBus } from '../../shared/EventBus';
import { sendSlackNotification, type SlackPostFn } from './slack-sender';
import { mapGovernanceEvent, SLACK_NOTIFY_EVENTS } from './slack-notify-map';

const defaultPost: SlackPostFn = (url, body) =>
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

export interface SlackNotifierConfig { enabled: boolean; webhookUrl?: string }

export class SlackNotifier {
  constructor(
    private readonly eventBus: EventBus,
    private readonly getConfig: () => SlackNotifierConfig,
    private readonly post: SlackPostFn = defaultPost,
  ) {}

  register(): void {
    for (const evt of SLACK_NOTIFY_EVENTS) {
      this.eventBus.on(evt, (payload: unknown) => { void this.handle(evt, payload); });
    }
  }

  private async handle(eventType: string, payload: unknown): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.enabled || !cfg.webhookUrl) return;
    const event = mapGovernanceEvent(eventType, payload);
    if (!event) return;
    await sendSlackNotification(cfg.webhookUrl, event, this.post); // non-blocking by contract
  }
}
