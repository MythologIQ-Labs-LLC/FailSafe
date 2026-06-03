/**
 * slack-notify-map — pure mapping from FailSafe EventBus governance events to
 * the normalized SlackNotifyEvent (B-INT-9 / #100). Defensive field access only
 * (no hard dependency on exact payload internals → no ghost-field risk), and it
 * carries ONLY a sanitized path/summary — never raw prompts/content/secrets
 * (the notify-only privacy criterion). Returns null when an event should not
 * notify (e.g. a non-enforcement verdict).
 */

import type { SlackNotifyEvent } from './slack-notify';

/** Verified EventBus event names FailSafe emits for enforcement governance. */
export const SLACK_NOTIFY_EVENTS = [
  'sentinel.verdict',
  'qorelogic.l3Queued',
  'qorelogic.l3Decided',
  'governance.driftDetected',
] as const;

const DEFAULT_CONSOLE_URL = 'http://127.0.0.1:9376/console/home';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

export function mapGovernanceEvent(
  eventType: string,
  payload: unknown,
  consoleUrl: string = DEFAULT_CONSOLE_URL,
): SlackNotifyEvent | null {
  const p = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};
  const ts = str(p.timestamp) ?? str(p.ts);

  switch (eventType) {
    case 'sentinel.verdict': {
      const decision = str(p.decision)?.toUpperCase();
      // Notify only on enforcement (a blocking decision) — not PASS/WARN/ESCALATE.
      if (!decision || !/^(VETO|BLOCK|FAIL|DENY)/.test(decision)) return null;
      return {
        kind: 'veto',
        title: `Action blocked (${decision})`,
        detail: str(p.artifactPath) ? `Artifact: ${str(p.artifactPath)}` : undefined,
        consoleUrl, ts,
      };
    }
    case 'qorelogic.l3Queued':
      return {
        kind: 'l3-queued',
        title: 'Tier-3 action queued for L3 approval',
        detail: str(p.filePath) ? `Path: ${str(p.filePath)}` : str(p.title),
        consoleUrl, ts,
      };
    case 'qorelogic.l3Decided':
      return {
        kind: 'l3-decided',
        title: `L3 decision: ${str(p.decision) ?? str(p.status) ?? 'recorded'}`,
        detail: str(p.filePath) ? `Path: ${str(p.filePath)}` : undefined,
        consoleUrl, ts,
      };
    case 'governance.driftDetected':
      return {
        kind: 'critical-drift',
        title: 'Critical drift detected',
        detail: str(p.summary) ?? str(p.detail),
        consoleUrl, ts,
      };
    default:
      return null;
  }
}
