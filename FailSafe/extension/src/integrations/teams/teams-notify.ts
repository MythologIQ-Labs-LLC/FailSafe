/**
 * teams-notify — pure Adaptive Card payload builder for FailSafe → Microsoft
 * Teams notify-only governance notifications (B-INT-10 / #101, v1).
 *
 * Per the contract review (INTEGRATION_MICROSOFT_TEAMS_CONTRACT_REVIEW.md): the
 * supported path is a Power Automate **Workflows** incoming webhook that posts
 * an **Adaptive Card** (legacy M365 connector / MessageCard is deprecated). The
 * Workflows path does NOT render action buttons, so the link-back to the local
 * Command Center is a markdown text link, never an Action.OpenUrl button — and
 * remote approval is BLOCKED in v1 (notify-only, like Slack #100).
 *
 * Mirrors the Slack builder: takes a NORMALIZED, already-sanitized event (the
 * mapper passes a concise `detail` only — never raw prompts/content/secrets) and
 * emits only the typed fields below. Kept well under the 28 KB Workflows limit
 * (the `detail` is clamped; the sender enforces the budget defensively).
 */

export type TeamsNotifyKind = 'veto' | 'l3-queued' | 'l3-decided' | 'release-seal' | 'critical-drift';

export interface TeamsNotifyEvent {
  kind: TeamsNotifyKind;
  title: string;
  /** Concise, already-sanitized one-line summary. Never raw content/secrets. */
  detail?: string;
  /** Link back to the local Command Center for the operator to act. */
  consoleUrl?: string;
  ts?: string;
}

/** The Workflows webhook envelope: a message carrying one Adaptive Card attachment. */
export interface TeamsMessage {
  type: 'message';
  attachments: Array<{ contentType: string; content: Record<string, unknown> }>;
}

const ADAPTIVE_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive';
/** Adaptive Card TextBlock color per kind (shape + color, colorblind-safe label). */
const KIND_META: Record<TeamsNotifyKind, { icon: string; label: string; color: string }> = {
  veto: { icon: '🚫', label: 'VETO', color: 'Attention' },
  'l3-queued': { icon: '⏳', label: 'L3 approval queued', color: 'Warning' },
  'l3-decided': { icon: '✅', label: 'L3 decided', color: 'Good' },
  'release-seal': { icon: '🔒', label: 'Release sealed', color: 'Accent' },
  'critical-drift': { icon: '⚠️', label: 'Critical drift', color: 'Attention' },
};

/** Clamp so the card stays well under the 28 KB Workflows limit. */
function clamp(s: string, max = 600): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Build a concise Teams Adaptive Card message from a normalized governance event. */
export function buildTeamsMessage(event: TeamsNotifyEvent): TeamsMessage {
  const meta = KIND_META[event.kind] ?? { icon: 'ℹ️', label: event.kind, color: 'Default' };

  const body: Array<Record<string, unknown>> = [
    { type: 'TextBlock', text: `${meta.icon} ${meta.label}`, weight: 'Bolder', size: 'Medium', color: meta.color, wrap: true },
    { type: 'TextBlock', text: clamp(event.title, 300), weight: 'Bolder', wrap: true },
  ];
  if (event.detail) {
    body.push({ type: 'TextBlock', text: clamp(event.detail), wrap: true, isSubtle: true });
  }
  // Context line: link-back is a markdown TEXT link (Workflows can't render buttons).
  const ctx: string[] = ['FailSafe governance'];
  if (event.ts) ctx.push(event.ts);
  if (event.consoleUrl) ctx.push(`[Open Command Center](${event.consoleUrl})`);
  body.push({ type: 'TextBlock', text: ctx.join(' · '), wrap: true, isSubtle: true, size: 'Small' });

  return {
    type: 'message',
    attachments: [
      {
        contentType: ADAPTIVE_CONTENT_TYPE,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.5',
          body,
          // No `actions` — Workflows webhooks do not render action buttons (notify-only).
        },
      },
    ],
  };
}
