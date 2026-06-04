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

export class TeamsNotifier {
  constructor(
    private readonly eventBus: EventBus,
    private readonly getConfig: () => TeamsNotifierConfig,
    private readonly post: TeamsPostFn = defaultPost,
  ) {}

  register(): void {
    for (const evt of TEAMS_NOTIFY_EVENTS) {
      this.eventBus.on(evt, (payload: unknown) => { void this.handle(evt, payload); });
    }
  }

  private async handle(eventType: string, payload: unknown): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.enabled || !cfg.webhookUrl) return;
    const event = mapGovernanceEvent(eventType, payload);
    if (!event) return;
    await sendTeamsNotification(cfg.webhookUrl, event, this.post); // non-blocking by contract
  }
}
