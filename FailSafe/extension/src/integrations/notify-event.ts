/**
 * notify-event — shared plumbing for the outbound notify-only channels
 * (Slack #100 / Teams #101).
 *
 * EventBus delivers an ENVELOPE (`{ type, timestamp, payload, seq }`) to every
 * listener, not the raw payload — see `shared/EventBus.emit`. Every other
 * listener in the extension reads `event.payload`; the notifiers must too, or
 * their mappers read governance fields off the envelope and silently produce
 * nothing (FX: #241 follow-up).
 */

import * as path from 'path';
import { fileURLToPath } from 'url';

export interface EventBusEnvelope {
  /** The emitted payload, or the value itself if it was not enveloped. */
  payload: unknown;
  /** Envelope emit time, used only when the payload carries no timestamp. */
  timestamp?: string;
}

/** Read an EventBus callback argument as `{ payload, timestamp }`. */
export function readEventBusEvent(event: unknown): EventBusEnvelope {
  if (event && typeof event === 'object' && 'payload' in event) {
    const e = event as { payload: unknown; timestamp?: unknown };
    return {
      payload: e.payload,
      timestamp: typeof e.timestamp === 'string' ? e.timestamp : undefined,
    };
  }
  return { payload: event };
}

/**
 * Strip the configured webhook URL out of diagnostic text. The URL is the
 * channel's shared secret, so a transport error that echoes it must never reach
 * a log, notification, or telemetry sink.
 */
export function redactWebhookUrl(text: string | undefined, webhookUrl: string | undefined): string | undefined {
  if (!text || !webhookUrl) return text;
  return text.split(webhookUrl).join('[webhook]');
}

/** C0/C1 controls plus invisible and direction-changing characters (#538). */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
const LABEL_MAX = 200;

function flavourOf(p: string): typeof path.posix | null {
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\')) return path.win32;
  if (p.startsWith('/')) return process.platform === 'win32' ? path.win32 : path.posix;
  return null;
}

function fromUri(p: string): string | null {
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) return null;
  try {
    if (/^file:/i.test(p)) return fileURLToPath(p);
  } catch { /* fall through to the URL path's basename */ }
  try {
    return path.posix.basename(new URL(p).pathname) || '';
  } catch {
    return '';
  }
}

function shortLabel(p: string, workspaceRoot?: string): string {
  const mod = flavourOf(p);
  if (mod) {
    if (workspaceRoot && flavourOf(workspaceRoot) === mod) {
      const rel = mod.relative(workspaceRoot, p);
      if (rel && !rel.startsWith('..') && !mod.isAbsolute(rel)) return rel.split(/[\\/]/).join('/');
    }
    return mod.basename(p);
  }
  const display = p.replace(/\\/g, '/');
  const normalized = path.posix.normalize(display);
  if (normalized === '..' || normalized.startsWith('../')) return path.posix.basename(normalized);
  return display;
}

/**
 * The display-only path a notice carries (#538, B263): unsafe characters
 * removed; workspace-relative when inside the workspace; the file name only
 * for any other absolute path, a `..` escape or a URI, so a third-party
 * channel never learns the user's folder layout; capped at 200 characters.
 */
export function notifyPathLabel(raw: unknown, workspaceRoot?: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(UNSAFE_CHARS, '').trim();
  if (!cleaned) return undefined;
  const uri = fromUri(cleaned);
  const label = uri === null ? shortLabel(cleaned, workspaceRoot) : (uri && flavourOf(uri) ? shortLabel(uri, workspaceRoot) : uri);
  if (!label) return undefined;
  return label.length > LABEL_MAX ? `…${label.slice(label.length - (LABEL_MAX - 1))}` : label;
}
