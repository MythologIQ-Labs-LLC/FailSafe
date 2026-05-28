// FX721 — OpenDesignDaemonProbe tests.
// Probe contract: discriminated alive/reason result + TTL cache + clock injection.

import { strict as assert } from 'assert';
import { OpenDesignDaemonProbe } from '../../../integrations/open-design/OpenDesignDaemonProbe';

interface FakeRes {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}

function makeFetch(behavior: () => Promise<FakeRes> | FakeRes | never, calls?: { url: string }[]) {
  return (async (url: string | URL, _init?: RequestInit) => {
    if (calls) calls.push({ url: String(url) });
    const res = await behavior();
    return res as unknown as Response;
  }) as unknown as typeof fetch;
}

suite('integrations/open-design OpenDesignDaemonProbe', () => {
  test('alive 200 + version returns alive:true', async () => {
    const fetchImpl = makeFetch(() => ({
      ok: true,
      json: async () => ({ version: '0.9.1' }),
    }));
    const probe = new OpenDesignDaemonProbe({ fetchImpl });
    const r = await probe.probe();
    assert.deepEqual(r, { alive: true, version: '0.9.1' });
  });

  test('refused (network error) returns alive:false reason refused', async () => {
    const fetchImpl = makeFetch(() => {
      const err = new Error('ECONNREFUSED');
      throw err;
    });
    const probe = new OpenDesignDaemonProbe({ fetchImpl });
    const r = await probe.probe();
    assert.deepEqual(r, { alive: false, reason: 'refused' });
  });

  test('timeout (AbortError) returns alive:false reason timeout', async () => {
    const fetchImpl = makeFetch(() => {
      const err = new Error('aborted');
      (err as { name: string }).name = 'AbortError';
      throw err;
    });
    const probe = new OpenDesignDaemonProbe({ fetchImpl });
    const r = await probe.probe();
    assert.deepEqual(r, { alive: false, reason: 'timeout' });
  });

  test('non-200 status returns alive:false reason non_200', async () => {
    const fetchImpl = makeFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));
    const probe = new OpenDesignDaemonProbe({ fetchImpl });
    const r = await probe.probe();
    assert.deepEqual(r, { alive: false, reason: 'non_200' });
  });

  test('parse error (non-JSON body) returns alive:false reason parse_error', async () => {
    const fetchImpl = makeFetch(() => ({
      ok: true,
      json: async () => {
        throw new Error('Unexpected token');
      },
    }));
    const probe = new OpenDesignDaemonProbe({ fetchImpl });
    const r = await probe.probe();
    assert.deepEqual(r, { alive: false, reason: 'parse_error' });
  });

  test('parse error (missing version field) returns alive:false reason parse_error', async () => {
    const fetchImpl = makeFetch(() => ({
      ok: true,
      json: async () => ({ build: 'abc' }),
    }));
    const probe = new OpenDesignDaemonProbe({ fetchImpl });
    const r = await probe.probe();
    assert.deepEqual(r, { alive: false, reason: 'parse_error' });
  });

  test('TTL cache returns cached result without re-fetching', async () => {
    const calls: { url: string }[] = [];
    const fetchImpl = makeFetch(
      () => ({ ok: true, json: async () => ({ version: '0.9.1' }) }),
      calls,
    );
    let now = 1_000;
    const probe = new OpenDesignDaemonProbe({
      fetchImpl,
      ttlMs: 30_000,
      nowMs: () => now,
    });
    const a = await probe.probe();
    const b = await probe.probe(); // within TTL
    assert.deepEqual(a, b);
    assert.equal(calls.length, 1, 'second call within TTL should not hit network');
    now = 1_000 + 30_001; // advance past TTL
    await probe.probe();
    assert.equal(calls.length, 2, 'after TTL expiry, network is re-hit');
  });
});
