/**
 * OpenDesignSseClient — per-run SSE subscription against the local Open
 * Design daemon (`GET /api/runs/<runId>/events`).
 *
 * Parses the SSE wire format line-by-line; emits typed ChatSseEvent payloads
 * via the caller-supplied callback. Reconnects with capped exponential
 * backoff on transient network errors (Last-Event-ID re-attach honored);
 * after maxReconnects exhaustion, emits a sentinel `subscribe-error` event
 * and stops.
 *
 * Plan: plan-open-design-integration-v1.1.md Phase 1; FX723.
 */

import type { ChatSseEvent } from './contracts/sse-chat';
import { isChatSseEvent } from './contracts/sse-chat';

export interface SseSubscribeOptions {
  port?: number;
  fetchImpl?: typeof fetch;
  maxReconnects?: number;
  /** Test seam: backoff sleeper. Default uses setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export type SseEmittedEvent =
  | ChatSseEvent
  | { kind: 'subscribe-error'; reason: string };

export class OpenDesignSseClient {
  private readonly opts: SseSubscribeOptions;

  constructor(opts: SseSubscribeOptions = {}) {
    this.opts = opts;
  }

  subscribeRun(
    runId: string,
    onEvent: (e: SseEmittedEvent) => void,
  ): AbortController {
    const ctrl = new AbortController();
    let reconnects = 0;
    let lastEventId: string | undefined;
    const port = this.opts.port ?? 7456;
    const url = `http://127.0.0.1:${port}/api/runs/${encodeURIComponent(runId)}/events`;
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const sleep =
      this.opts.sleep ??
      ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const maxReconnects = this.opts.maxReconnects ?? 3;

    const start = async (): Promise<void> => {
      while (!ctrl.signal.aborted) {
        try {
          const headers: Record<string, string> = { Accept: 'text/event-stream' };
          if (lastEventId) headers['Last-Event-ID'] = lastEventId;
          const res = await fetchImpl(url, { signal: ctrl.signal, headers });
          if (!res.body) throw new Error('no body');
          await this.consume(res.body, (id, evt) => {
            if (id) lastEventId = id;
            onEvent(evt);
          });
          // Clean disconnect — body ended; do not loop unless an error fired.
          return;
        } catch (e) {
          if (ctrl.signal.aborted) return;
          if (reconnects >= maxReconnects) {
            onEvent({ kind: 'subscribe-error', reason: (e as Error).message });
            return;
          }
          reconnects++;
          await sleep(250 * 2 ** reconnects);
        }
      }
    };
    void start();
    return ctrl;
  }

  /** Parse SSE wire format from a ReadableStream<Uint8Array>. */
  private async consume(
    body: ReadableStream<Uint8Array>,
    onEvent: (id: string | undefined, evt: ChatSseEvent) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = this.parseSseBlock(block);
        if (parsed) onEvent(parsed.id, parsed.payload);
      }
    }
  }

  private parseSseBlock(
    block: string,
  ): { id?: string; payload: ChatSseEvent } | null {
    let id: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return null;
    try {
      const parsed: unknown = JSON.parse(dataLines.join('\n'));
      return isChatSseEvent(parsed) ? { id, payload: parsed } : null;
    } catch {
      return null;
    }
  }
}
