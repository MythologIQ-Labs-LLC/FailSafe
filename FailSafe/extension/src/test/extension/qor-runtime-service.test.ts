import { strict as assert } from 'assert';
import {
  QorRuntimeService,
  type QorFetchFn,
  type QorRuntimeOptions,
} from '../../roadmap/services/QorRuntimeService';

type CapturedCall = { url: string; method: string; body?: string };

interface FakeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function buildOptions(overrides: Partial<QorRuntimeOptions> = {}): QorRuntimeOptions {
  return {
    enabled: true,
    baseUrl: 'http://qor.test',
    timeoutMs: 1000,
    ...overrides,
  };
}

function buildFetchStub(
  responder: (url: string) => FakeResponse,
  calls: CapturedCall[],
): QorFetchFn {
  return async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return responder(url);
  };
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
    async json() { return body; },
  };
}

class MockResponse {
  public statusCode: number | null = null;
  public payload: unknown = null;
  public statusCalls = 0;
  public jsonCalls = 0;

  status(code: number): this {
    this.statusCode = code;
    this.statusCalls += 1;
    return this;
  }
  json(body: unknown): this {
    this.payload = body;
    this.jsonCalls += 1;
    return this;
  }
}

suite('QorRuntimeService', () => {
  test('fetchJson resolves to {ok:true, body} on 200', async () => {
    const calls: CapturedCall[] = [];
    const fetchStub = buildFetchStub(() => jsonResponse(200, { x: 1 }), calls);
    const service = new QorRuntimeService(buildOptions(), fetchStub);

    const result = await service.fetchJson('/health');

    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.body, { x: 1 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://qor.test/health');
    assert.equal(calls[0].method, 'GET');
  });

  test('fetchJson short-circuits with disabled error when enabled=false', async () => {
    const calls: CapturedCall[] = [];
    const fetchStub = buildFetchStub(() => jsonResponse(200, {}), calls);
    const service = new QorRuntimeService(buildOptions({ enabled: false }), fetchStub);

    const result = await service.fetchJson('/health');

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'disabled');
    assert.equal(calls.length, 0, 'fetch must not be invoked when disabled');
  });

  test('fetchJson surfaces upstream non-2xx status with detail', async () => {
    const calls: CapturedCall[] = [];
    const fetchStub = buildFetchStub(() => jsonResponse(500, 'boom'), calls);
    const service = new QorRuntimeService(buildOptions(), fetchStub);

    const result = await service.fetchJson('/x');

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, 'upstream_500');
      assert.equal(result.detail, 'boom');
    }
  });

  test('proxy with enabled=false returns 503 + disabled message and skips fetch', async () => {
    const calls: CapturedCall[] = [];
    const fetchStub = buildFetchStub(() => jsonResponse(200, {}), calls);
    const service = new QorRuntimeService(buildOptions({ enabled: false }), fetchStub);
    const res = new MockResponse();

    await service.proxy({ body: {} } as any, res as any, '/x');

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.payload, { error: 'Qor runtime integration is disabled' });
    assert.equal(res.statusCalls, 1, 'status() called exactly once');
    assert.equal(res.jsonCalls, 1, 'json() called exactly once');
    assert.equal(calls.length, 0, 'fetch must not be invoked when disabled');
  });

  test('proxy with enabled=true forwards 200 body verbatim', async () => {
    const calls: CapturedCall[] = [];
    const fetchStub = buildFetchStub(() => jsonResponse(200, { ping: 'pong' }), calls);
    const service = new QorRuntimeService(buildOptions(), fetchStub);
    const res = new MockResponse();

    await service.proxy({ body: {} } as any, res as any, '/health');

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ping: 'pong' });
    assert.equal(calls.length, 1);
  });

  test('proxy with enabled=true and POST forwards body and returns 502 on upstream error', async () => {
    const calls: CapturedCall[] = [];
    const fetchStub = buildFetchStub(() => jsonResponse(502, 'gone'), calls);
    const service = new QorRuntimeService(buildOptions(), fetchStub);
    const res = new MockResponse();

    await service.proxy({ body: { hello: 'world' } } as any, res as any, '/evaluate', 'POST');

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.payload, { error: 'upstream_502', detail: 'gone' });
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body, JSON.stringify({ hello: 'world' }));
  });

  test('fetchSnapshot returns disabled snapshot when enabled=false', async () => {
    const service = new QorRuntimeService(
      buildOptions({ enabled: false }),
      buildFetchStub(() => jsonResponse(200, {}), []),
    );

    const snap = await service.fetchSnapshot();

    assert.equal(snap.enabled, false);
    assert.equal(snap.connected, false);
    assert.equal(snap.error, 'disabled');
    assert.equal(snap.baseUrl, 'http://qor.test');
  });

  test('fetchSnapshot returns connected=true with policyVersion when health + policy succeed', async () => {
    const calls: CapturedCall[] = [];
    const responder = (url: string): FakeResponse => {
      if (url.endsWith('/health')) return jsonResponse(200, {});
      if (url.endsWith('/policy/version')) return jsonResponse(200, { policyVersion: 'v9' });
      return jsonResponse(404, '');
    };
    const service = new QorRuntimeService(buildOptions(), buildFetchStub(responder, calls));

    const snap = await service.fetchSnapshot();

    assert.equal(snap.enabled, true);
    assert.equal(snap.connected, true);
    assert.equal(snap.policyVersion, 'v9');
    assert.equal(typeof snap.latencyMs, 'number');
  });
});
