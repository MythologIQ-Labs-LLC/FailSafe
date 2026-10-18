/**
 * teams-notify-map — pure mapping from FailSafe EventBus governance events to a
 * normalized TeamsNotifyEvent (B-INT-10 / #101). Defensive field access only
 * (no hard dependency on payload internals → no ghost-field risk); carries ONLY
 * a sanitized path/summary — never raw prompts/content/secrets (notify-only
 * privacy criterion). Returns null when an event should not notify (e.g. a
 * non-enforcement verdict). Same event set + semantics as the Slack mapper.
 */

import type { TeamsNotifyEvent } from './teams-notify';
import { notifyPathLabel } from '../notify-event';

/** Verified EventBus event names FailSafe emits for enforcement governance. */
export const TEAMS_NOTIFY_EVENTS = [
  'sentinel.verdict',
  'qorelogic.l3Queued',
  'qorelogic.l3Decided',
  'governance.driftDetected',
] as const;

const DEFAULT_CONSOLE_URL = 'http://127.0.0.1:9376/console/home';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** A path as a notice shows it. Teams markdown is not escaped (B300). */
function pathLabel(raw: unknown, workspaceRoot?: string): string | undefined {
  return notifyPathLabel(raw, workspaceRoot);
}

/** `qorelogic.l3Decided` carries `{ request, decision }`; fall back to a flat payload. */
function decidedPath(p: Record<string, unknown>): unknown {
  const request = p.request;
  if (request && typeof request === 'object' && typeof (request as Record<string, unknown>).filePath === 'string') {
    return (request as Record<string, unknown>).filePath;
  }
  return p.filePath;
}

export function mapGovernanceEvent(
  eventType: string,
  payload: unknown,
  consoleUrl: string = DEFAULT_CONSOLE_URL,
  workspaceRoot?: string,
): TeamsNotifyEvent | null {
  const p = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};
  const ts = str(p.timestamp) ?? str(p.ts);
  const label = (raw: unknown) => pathLabel(raw, workspaceRoot);

  switch (eventType) {
    case 'sentinel.verdict': {
      const decision = str(p.decision)?.toUpperCase();
      // Notify only on enforcement (a blocking decision) — not PASS/WARN/ESCALATE.
      if (!decision || !/^(VETO|BLOCK|FAIL|DENY)/.test(decision)) return null;
      return {
        kind: 'veto',
        title: `Action blocked (${decision})`,
        detail: label(p.artifactPath) ? `Artifact: ${label(p.artifactPath)}` : undefined,
        consoleUrl, ts,
      };
    }
    case 'qorelogic.l3Queued':
      return {
        kind: 'l3-queued',
        title: 'Tier-3 action queued for L3 approval',
        detail: label(p.filePath) ? `Path: ${label(p.filePath)}` : str(p.title),
        consoleUrl, ts,
      };
    case 'qorelogic.l3Decided':
      return {
        kind: 'l3-decided',
        title: `L3 decision: ${str(p.decision) ?? str(p.status) ?? 'recorded'}`,
        detail: label(decidedPath(p)) ? `Path: ${label(decidedPath(p))}` : undefined,
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
