// Functional tests for ConnectionClient (FX171) — WebSocket/SSE connection module.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { ConnectionClient } from '../../../src/roadmap/ui/modules/connection.js';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  close() { this.closed = true; this.onclose?.(); }
  static reset() { MockWebSocket.instances = []; }
}

function setupDom(): { cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  const prevWS = (global as any).WebSocket;
  const prevES = (global as any).EventSource;
  const prevFetch = (global as any).fetch;
  const prevSetTimeout = (global as any).setTimeout;
  // navigator on global may be defined as getter — use Object.defineProperty to override
  let navigatorRestore: PropertyDescriptor | undefined;
  try {
    navigatorRestore = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'TestChromeUserAgent', vendor: 'Google Inc' },
      configurable: true, writable: true,
    });
  } catch { /* fallback */ }
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).WebSocket = MockWebSocket;
  (global as any).EventSource = class { onopen: any; onmessage: any; onerror: any; close() {} };
  (global as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  MockWebSocket.reset();
  return {
    cleanup: () => {
      (global as any).window = prevWin;
      (global as any).document = prevDoc;
      (global as any).WebSocket = prevWS;
      (global as any).EventSource = prevES;
      (global as any).fetch = prevFetch;
      (global as any).setTimeout = prevSetTimeout;
      if (navigatorRestore) {
        try { Object.defineProperty(global, 'navigator', navigatorRestore); } catch { /* ignore */ }
      }
    },
  };
}

suite('ConnectionClient (FX171)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX171 constructor — initializes default state (disconnected, no ws)', () => {
    const c = new ConnectionClient();
    assert.equal(c.state, 'disconnected');
    assert.equal(c.ws, null);
    assert.equal(c.useFallback, false);
    assert.equal(c.reconnectAttempts, 0);
  });

  test('FX171 on — registers callbacks and notify dispatches', () => {
    const c = new ConnectionClient();
    let received: string | null = null;
    c.on('connection', (state: string) => { received = state; });
    c.notify('connection', 'connected');
    assert.equal(received, 'connected');
  });

  test('FX171 setState — only fires connection callback on actual transition', () => {
    const c = new ConnectionClient();
    let count = 0;
    c.on('connection', () => count++);
    c.setState('connected');
    c.setState('connected'); // duplicate, should not fire
    c.setState('disconnected');
    assert.equal(count, 2);
  });

  test('FX171 connectWs — creates WebSocket + sets state to connecting', () => {
    const c = new ConnectionClient({ wsUrl: 'ws://localhost:9999' });
    c.connectWs();
    assert.equal(c.state, 'connecting');
    assert.equal(MockWebSocket.instances.length, 1);
  });

  test('FX171 connectWs — onopen transitions to connected state', () => {
    const c = new ConnectionClient({ wsUrl: 'ws://localhost:9999' });
    c.connectWs();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    assert.equal(c.state, 'connected');
    assert.equal(c.reconnectAttempts, 0);
  });

  test('FX171 onclose — transitions to disconnected', () => {
    const c = new ConnectionClient({ wsUrl: 'ws://localhost:9999' });
    c.connectWs();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onclose?.();
    assert.equal(c.state, 'disconnected');
    assert.equal(c.ws, null);
  });

  test('FX171 handleServerMessage — init event notifies hub callback', () => {
    const c = new ConnectionClient();
    let hubData: any = null;
    c.on('hub', (data: any) => { hubData = data; });
    c.handleServerMessage({ type: 'init', payload: { hub: 'data' } });
    assert.deepEqual(hubData, { hub: 'data' });
  });

  test('FX171 handleServerMessage — verdict event notifies verdict callback', () => {
    const c = new ConnectionClient();
    c.callbacks.verdict = [];
    let verdict: any = null;
    c.callbacks.verdict.push((v: any) => { verdict = v; });
    c.handleServerMessage({ type: 'verdict', payload: { decision: 'BLOCK' } });
    assert.equal(verdict.type, 'verdict');
    assert.deepEqual(verdict.payload, { decision: 'BLOCK' });
  });

  test('FX171 handleServerMessage — marketplace.* events forwarded to event callback', () => {
    const c = new ConnectionClient();
    const events: any[] = [];
    c.on('event', (e: any) => events.push(e));
    c.handleServerMessage({ type: 'marketplace.installed', payload: { id: 'x' } });
    c.handleServerMessage({ type: 'marketplace.scanning', payload: {} });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'marketplace.installed');
  });

  test('FX171 handleServerMessage — adapter.* events forwarded to event callback', () => {
    const c = new ConnectionClient();
    const events: any[] = [];
    c.on('event', (e: any) => events.push(e));
    c.handleServerMessage({ type: 'adapter.installed' });
    c.handleServerMessage({ type: 'adapter.config.updated' });
    assert.equal(events.length, 2);
  });

  test('FX171 handleServerMessage — unknown type falls through to event catchall', () => {
    const c = new ConnectionClient();
    const events: any[] = [];
    c.on('event', (e: any) => events.push(e));
    c.handleServerMessage({ type: 'governance.alert', payload: { severity: 'high' } });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'governance.alert');
  });

  test('FX171 handleServerMessage — message without type is ignored', () => {
    const c = new ConnectionClient();
    const events: any[] = [];
    c.on('event', (e: any) => events.push(e));
    c.handleServerMessage({ payload: 'no type' });
    assert.equal(events.length, 0);
  });

  test('FX171 scheduleReconnect — falls back to SSE after 3 failed attempts', () => {
    const c = new ConnectionClient();
    // Replace setTimeout to avoid actual timer wait
    (global as any).setTimeout = (cb: any) => 0;
    c.reconnectAttempts = 3;
    c.scheduleReconnect();
    assert.equal(c.useFallback, true);
  });

  test('FX171 setWebLlmStatus — merges status + notifies webLlmStatus callback', () => {
    const c = new ConnectionClient();
    let received: any = null;
    c.on('webLlmStatus', (s: any) => { received = s; });
    c.setWebLlmStatus({ wasmReady: true });
    assert.equal(received.wasmReady, true);
    assert.equal(received.browserSupported, c.webLlmState.browserSupported);
  });

  test('FX171 switchServer — closes existing ws + reconnects to new port', () => {
    const c = new ConnectionClient({ wsUrl: 'ws://localhost:9999' });
    (global as any).setTimeout = (cb: any) => 0;
    c.connectWs();
    const ws1 = MockWebSocket.instances[0];
    c.switchServer(8888);
    // Old ws should be closed
    assert.equal(ws1.closed, true);
    assert.equal(c.baseUrl, 'http://localhost:8888');
    assert.equal(c.wsUrl, 'ws://localhost:8888');
  });

  test('FX171 fetchHub — successful fetch caches data + notifies hub callback', async () => {
    (global as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ panels: ['x'] }) });
    const c = new ConnectionClient();
    let received: any = null;
    c.on('hub', (data: any) => { received = data; });
    const result = await c.fetchHub();
    assert.deepEqual(result, { panels: ['x'] });
    assert.deepEqual(received, { panels: ['x'] });
    assert.deepEqual(c.lastHubData, { panels: ['x'] });
  });

  test('FX171 fetchHub — failed fetch returns null (graceful)', async () => {
    (global as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const c = new ConnectionClient();
    const result = await c.fetchHub();
    assert.equal(result, null);
  });
});
