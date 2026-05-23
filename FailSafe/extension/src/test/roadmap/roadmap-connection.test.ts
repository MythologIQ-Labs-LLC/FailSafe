// Functional tests for the inline WebSocket lifecycle in roadmap.js
// (WebPanelClient class). The Monitor's connection state machine was
// previously association-verified through FX171 ConnectionClient; this
// suite exercises the actual class painted into index.html, closing the
// reality-vs-promise gap.
//
// Pattern reference: src/test/roadmap/connection.test.ts (MockWebSocket
// shape + JSDOM setup) and monitor-state-coherence.test.ts (force-paint).
//
// The constructor at roadmap.js:54-55 auto-calls this.connect() and
// this.fetchHub(); each test installs a MockWebSocket + fetch stub
// BEFORE construction so the auto-connect counts under our control.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module — resolved from the compiled out/ tree.
// roadmap.js → monitor-render.js → education-lesson.js → education/lessons.js:
// that last hop crosses out of ui/ into education/, which has no .js sibling
// under src/, so the import chain MUST resolve from out/ (where tsc emits
// education/lessons.js).
import { WebPanelClient } from '../../roadmap/ui/roadmap.js';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  close(): void { this.closed = true; this.onclose?.(); }
  static reset(): void { MockWebSocket.instances = []; }
}

interface DomCleanup { cleanup: () => void; }

function setupDom(): DomCleanup {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  const prevWS = (global as any).WebSocket;
  const prevFetch = (global as any).fetch;
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).WebSocket = MockWebSocket;
  // Pending promise prevents fetchHub from ever resolving and mutating state
  // mid-test; tests assert state set by connect() only.
  (global as any).fetch = () => new Promise(() => {});
  MockWebSocket.reset();
  return {
    cleanup: () => {
      (global as any).window = prevWin;
      (global as any).document = prevDoc;
      (global as any).WebSocket = prevWS;
      (global as any).fetch = prevFetch;
    },
  };
}

interface SpyTracker {
  calls: number;
  restore: () => void;
}

function spyPaintPendingSentinel(): SpyTracker {
  const proto = (WebPanelClient as any).prototype;
  const original = proto.paintPendingSentinel;
  let calls = 0;
  proto.paintPendingSentinel = function spy() { calls += 1; };
  return {
    get calls() { return calls; },
    restore: () => { proto.paintPendingSentinel = original; },
  } as unknown as SpyTracker;
}

suite('Roadmap inline WebSocket lifecycle (FX-MONITOR-WS)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('1. constructor — initializes connectionState=connecting, firstHubLoaded=false', () => {
    const spy = spyPaintPendingSentinel();
    try {
      const client = new WebPanelClient();
      assert.equal(client.connectionState, 'connecting');
      assert.equal(client.firstHubLoaded, false);
    } finally {
      spy.restore();
    }
  });

  test('2. connect() called by constructor — creates WS once + paints pending sentinel', () => {
    const spy = spyPaintPendingSentinel();
    try {
      const client = new WebPanelClient();
      assert.equal(MockWebSocket.instances.length, 1,
        'WebSocket constructor should be called exactly once by auto-connect');
      assert.equal(client.connectionState, 'connecting');
      assert.ok(spy.calls >= 1,
        `paintPendingSentinel should fire while !firstHubLoaded (got ${spy.calls})`);
    } finally {
      spy.restore();
    }
  });

  test('3. ws.onopen — transitions to connected, paintPendingSentinel NOT called again', () => {
    const spy = spyPaintPendingSentinel();
    try {
      const client = new WebPanelClient();
      const initialCalls = spy.calls;
      const ws = MockWebSocket.instances[0];
      ws.onopen?.();
      assert.equal(client.connectionState, 'connected');
      assert.equal(client.reconnectTimer, null,
        'reconnect timer must be cleared on connected');
      assert.equal(spy.calls, initialCalls,
        `paintPendingSentinel must NOT fire on connected transition ` +
        `(got ${spy.calls}, expected ${initialCalls})`);
    } finally {
      spy.restore();
    }
  });

  test('4. ws.onclose — transitions to disconnected + schedules reconnect + repaints pending', () => {
    const prevSetTimeout = (global as any).setTimeout;
    let timeoutScheduled = false;
    (global as any).setTimeout = (_cb: unknown, _delay: unknown) => {
      timeoutScheduled = true; return 1;
    };
    const spy = spyPaintPendingSentinel();
    try {
      const client = new WebPanelClient();
      const initialCalls = spy.calls;
      const ws = MockWebSocket.instances[0];
      ws.onclose?.();
      assert.equal(client.connectionState, 'disconnected');
      assert.equal(timeoutScheduled, true,
        'scheduleReconnect must call setTimeout');
      assert.ok(spy.calls > initialCalls,
        `paintPendingSentinel must fire on disconnected when !firstHubLoaded ` +
        `(got ${spy.calls}, was ${initialCalls})`);
    } finally {
      spy.restore();
      (global as any).setTimeout = prevSetTimeout;
    }
  });

  test('5. ws.onerror — transitions to error + paints pending sentinel', () => {
    const spy = spyPaintPendingSentinel();
    try {
      const client = new WebPanelClient();
      const initialCalls = spy.calls;
      const ws = MockWebSocket.instances[0];
      ws.onerror?.();
      assert.equal(client.connectionState, 'error');
      assert.ok(spy.calls > initialCalls,
        `paintPendingSentinel must fire on error when !firstHubLoaded ` +
        `(got ${spy.calls}, was ${initialCalls})`);
    } finally {
      spy.restore();
    }
  });

  test('6. setConnectionState(disconnected) with firstHubLoaded=true — no pending repaint', () => {
    const spy = spyPaintPendingSentinel();
    try {
      const client = new WebPanelClient();
      // Simulate hub data already painted; subsequent disconnect should
      // not blank the UI back to neutral pending.
      (client as any).firstHubLoaded = true;
      const callsBefore = spy.calls;
      client.setConnectionState('disconnected');
      assert.equal(client.connectionState, 'disconnected');
      assert.equal(spy.calls, callsBefore,
        `paintPendingSentinel must NOT fire when firstHubLoaded=true ` +
        `(got ${spy.calls}, expected ${callsBefore})`);
    } finally {
      spy.restore();
    }
  });
});
