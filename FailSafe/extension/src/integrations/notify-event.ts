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
