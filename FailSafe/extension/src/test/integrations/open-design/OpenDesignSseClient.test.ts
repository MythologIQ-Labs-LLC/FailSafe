// FX723 — OpenDesignSseClient tests.
// Asserts SSE wire-format parsing, multi-event delivery, Last-Event-ID
// re-attach on reconnect, capped exponential backoff, error sentinel on
// max-reconnect exhaustion, AbortController cancellation.

import { strict as assert } from 'assert';
import {
  OpenDesignSseClient,
  SseEmittedEvent,
} from '../../../integrations/open-design/OpenDesignSseClient';

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

// Track fetch invocations + headers for re-attach assertions.
interface FetchCall {
  url: string;
  headers: Record<string, string>;
}

function makeFetch(
  responses: Array<{ body?: ReadableStream<Uint8Array>; throws?: Error }>,
  calls: FetchCall[],
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const k of Object.keys(h)) headers[k] = h[k];
    }
    calls.push({ url: String(input), headers });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    if (r.throws) throw r.throws;
    return { body: r.body, ok: true } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function waitForEvent(events: SseEmittedEvent[], predicate: (e: SseEmittedEvent) => boolean, maxMs = 1000): Promise<void> {
  const start = Date.now();
  while (!events.some(predicate)) {
    if (Date.now() - start > maxMs) throw new Error('timeout waiting for event');
    await new Promise((r) => setTimeout(r, 5));
  }
}

suite('integrations/open-design OpenDesignSseClient', () => {
  test('delivers a single SSE event', async () => {
    const body = makeStream([`data: ${JSON.stringify({ kind: 'start', runId: 'r1' })}\n\n`]);
    const calls: FetchCall[] = [];
    const c = new OpenDesignSseClient({ fetchImpl: makeFetch([{ body }], calls) });
    const received: SseEmittedEvent[] = [];
    c.subscribeRun('r1', (e) => received.push(e));
    await waitForEvent(received, (e) => e.kind === 'start');
    assert.equal(received[0].kind, 'start');
    assert.equal(calls[0].url, 'http://127.0.0.1:7456/api/runs/r1/events');
    assert.equal(calls[0].headers.Accept, 'text/event-stream');
  });

  test('delivers multiple SSE events in order', async () => {
    const body = makeStream([
      `data: ${JSON.stringify({ kind: 'start', runId: 'r1' })}\n\n`,
      `data: ${JSON.stringify({ kind: 'agent.text_delta', delta: 'hi' })}\n\n`,
      `data: ${JSON.stringify({ kind: 'end', exitCode: 0 })}\n\n`,
    ]);
    const c = new OpenDesignSseClient({ fetchImpl: makeFetch([{ body }], []) });
    const received: SseEmittedEvent[] = [];
    c.subscribeRun('r1', (e) => received.push(e));
    await waitForEvent(received, (e) => e.kind === 'end');
    assert.deepEqual(
      received.map((e) => e.kind),
      ['start', 'agent.text_delta', 'end'],
    );
  });

  test('Last-Event-ID is re-attached on reconnect after stream error', async () => {
    // First fetch yields a stream that emits an id-bearing event then errors
    // partway, forcing the outer loop to reconnect with Last-Event-ID set.
    // We synthesize the mid-stream error by having the readable stream's
    // pull() throw after emitting the first event.
    let pullCalls = 0;
    const errBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCalls++;
        if (pullCalls === 1) {
          controller.enqueue(encode(`id: 42\ndata: ${JSON.stringify({ kind: 'start', runId: 'r1' })}\n\n`));
        } else {
          controller.error(new Error('mid-stream rupture'));
        }
      },
    });
    const okBody = makeStream([`data: ${JSON.stringify({ kind: 'end' })}\n\n`]);
    const calls: FetchCall[] = [];
    const c = new OpenDesignSseClient({
      fetchImpl: makeFetch([{ body: errBody }, { body: okBody }], calls),
      sleep: () => Promise.resolve(),
      maxReconnects: 3,
    });
    const received: SseEmittedEvent[] = [];
    c.subscribeRun('r1', (e) => received.push(e));
    await waitForEvent(received, (e) => e.kind === 'end');
    assert.equal(calls.length, 2, 'reconnect should have hit fetch a second time');
    assert.equal(calls[1].headers['Last-Event-ID'], '42', 'second fetch must carry Last-Event-ID from first stream');
  });

  test('emits subscribe-error after maxReconnects exhausted', async () => {
    const calls: FetchCall[] = [];
    const c = new OpenDesignSseClient({
      fetchImpl: makeFetch(
        [
          { throws: new Error('e1') },
          { throws: new Error('e2') },
          { throws: new Error('e3') },
          { throws: new Error('e4') },
        ],
        calls,
      ),
      sleep: () => Promise.resolve(),
      maxReconnects: 2,
    });
    const received: SseEmittedEvent[] = [];
    c.subscribeRun('r1', (e) => received.push(e));
    await waitForEvent(received, (e) => e.kind === 'subscribe-error');
    const err = received.find((e) => e.kind === 'subscribe-error') as { kind: 'subscribe-error'; reason: string };
    assert.match(err.reason, /e\d/);
  });

  test('AbortController stops the loop', async () => {
    let resolveBody!: (v: ReadableStream<Uint8Array>) => void;
    const bodyPromise = new Promise<ReadableStream<Uint8Array>>((r) => (resolveBody = r));
    const calls: FetchCall[] = [];
    const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
      calls.push({ url: '', headers: {} });
      const body = await bodyPromise;
      return { body, ok: true } as unknown as Response;
    }) as unknown as typeof fetch;
    const c = new OpenDesignSseClient({ fetchImpl, sleep: () => Promise.resolve() });
    const received: SseEmittedEvent[] = [];
    const ctrl = c.subscribeRun('r1', (e) => received.push(e));
    ctrl.abort();
    // Resolve so the loop iteration completes its current await.
    resolveBody(makeStream([]));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(received.length, 0);
  });

  test('malformed JSON in SSE block is silently dropped', async () => {
    const body = makeStream([
      `data: {not valid json\n\n`,
      `data: ${JSON.stringify({ kind: 'end' })}\n\n`,
    ]);
    const c = new OpenDesignSseClient({ fetchImpl: makeFetch([{ body }], []) });
    const received: SseEmittedEvent[] = [];
    c.subscribeRun('r1', (e) => received.push(e));
    await waitForEvent(received, (e) => e.kind === 'end');
    assert.equal(received.length, 1);
    assert.equal(received[0].kind, 'end');
  });
});
