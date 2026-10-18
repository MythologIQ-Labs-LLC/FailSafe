// #538 lane A (B273, plan-538a LD4 T1-T5): the LLM transport checks every
// resolved address before connecting, never follows a redirect, caps the
// response and enforces an overall deadline. Real requests reach real local
// servers; the resolver is injected so a name can be remapped.

import { strict as assert } from 'assert';
import * as http from 'http';
import * as os from 'os';
import type { AddressInfo } from 'net';
import type { LookupAddress } from 'dns';
import { createLlmHttp } from '../../../sentinel/utils/llmTransport';
import { parseLlmEndpoint, type LlmTarget } from '../../../sentinel/utils/llmDestinationPolicy';
import { ADDRESS_REFUSED, guardedLookup, type ResolveFn } from '../../../shared/net/addressPolicy';
import { startCountingServer, type CountingServer } from './llmEgressHarness';

function target(raw: string): LlmTarget {
  const r = parseLlmEndpoint(raw);
  assert.ok(r.ok, raw);
  return r.target;
}

/** A resolver answering `name` with `addresses` and counting calls; other names fail. */
function resolverFor(name: string, addresses: LookupAddress[]): { resolve: ResolveFn; calls: () => number } {
  let calls = 0;
  const resolve: ResolveFn = (hostname, _options, callback) => {
    calls++;
    if (hostname === name) callback(null, addresses);
    else callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), []);
  };
  return { resolve, calls: () => calls };
}

/** A non-internal IPv4 address of this machine (the all-interfaces server listens on it). */
function interfaceAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  throw new Error('this row needs a non-internal IPv4 interface address to prove the guard is what refuses');
}

function directGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

suite('#538 LLM transport (B273 LD4)', () => {
  let servers: CountingServer[] = [];
  teardown(async () => { await Promise.all(servers.map((s) => s.close())); servers = []; });
  const serve = async (host: string, respond?: Parameters<typeof startCountingServer>[1]) => {
    const s = await startCountingServer(host, respond);
    servers.push(s);
    return s;
  };

  test('T1 a loopback destination whose name resolves to a non-loopback address is refused before connecting', async () => {
    const server = await serve('::');
    const iface = interfaceAddress();
    assert.equal(await directGet(`http://${iface}:${server.port}/control`), 200, 'control: the interface address reaches the server');
    const before = server.received.length;
    const r = resolverFor('localhost', [{ address: iface, family: 4 }]);
    const send = createLlmHttp(r.resolve);
    await assert.rejects(
      send({ target: target(`http://localhost:${server.port}`), path: '/api/tags', method: 'GET', timeoutMs: 2000, addresses: 'loopback' }),
      (e: NodeJS.ErrnoException) => e.code === ADDRESS_REFUSED,
    );
    assert.equal(r.calls(), 1, 'the resolver was asked once');
    assert.equal(server.received.length, before, 'the remapped name reached the server');
  });

  test('T2 guardedLookup refuses any forbidden address in the answer, and answers both callback shapes', async () => {
    const lookup = (addresses: LookupAddress[], all: boolean) => new Promise<{ err: NodeJS.ErrnoException | null; value: unknown }>((resolve) => {
      const fn = guardedLookup('public', resolverFor('h.example', addresses).resolve);
      (fn as unknown as (h: string, o: object, cb: (...a: unknown[]) => void) => void)('h.example', { all }, (err: unknown, value: unknown, family?: unknown) => {
        resolve({ err: err as NodeJS.ErrnoException | null, value: all ? value : { address: value, family } });
      });
    });
    for (const bad of ['127.0.0.1', '10.1.2.3', '169.254.1.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:10.0.0.1',
      '::ffff:0:a00:1', '64:ff9b::a00:1', '64:ff9b:1::1', '2002:a00:1::1', '::a00:1', 'fec0::1']) {
      const family = bad.includes(':') ? 6 : 4;
      const r = await lookup([{ address: '203.0.113.7', family: 4 }, { address: bad, family }], true);
      assert.equal(r.err?.code, ADDRESS_REFUSED, bad);
    }
    assert.equal((await lookup([], true)).err?.code, ADDRESS_REFUSED, 'an empty answer is refused');
    const ok = await lookup([{ address: '203.0.113.7', family: 4 }, { address: '2606:4700::1111', family: 6 }], true);
    assert.equal(ok.err, null);
    assert.deepEqual(ok.value, [{ address: '203.0.113.7', family: 4 }, { address: '2606:4700::1111', family: 6 }]);
    const single = await lookup([{ address: '2606:4700::1111', family: 6 }], false);
    assert.equal(single.err, null);
    assert.deepEqual(single.value, { address: '2606:4700::1111', family: 6 });
  });

  test('T2b an approved remote name that resolves to loopback is refused (the server on 127.0.0.1 gets nothing)', async () => {
    const server = await serve('127.0.0.1');
    assert.equal(await directGet(`http://127.0.0.1:${server.port}/control`), 200, 'control');
    const before = server.received.length;
    const r = resolverFor('llm.example.test', [{ address: '127.0.0.1', family: 4 }]);
    await assert.rejects(
      createLlmHttp(r.resolve)({ target: target(`http://llm.example.test:${server.port}`), path: '/api/generate', method: 'POST', body: '{"prompt":"x"}', timeoutMs: 2000, addresses: 'public' }),
      (e: NodeJS.ErrnoException) => e.code === ADDRESS_REFUSED,
    );
    assert.equal(server.received.length, before);
  });

  test('T3 a 3xx is returned to the caller and never followed', async () => {
    const second = await serve('127.0.0.1');
    const first = await serve('127.0.0.1', (_req, res) => {
      res.statusCode = 307;
      res.setHeader('Location', `http://127.0.0.1:${second.port}/api/generate`);
      res.end();
    });
    const res = await createLlmHttp()({ target: target(`http://127.0.0.1:${first.port}`), path: '/api/generate', method: 'POST', body: '{"prompt":"x"}', timeoutMs: 2000, addresses: 'loopback' });
    assert.equal(res.status, 307);
    assert.equal(first.count(), 1);
    assert.equal(second.count(), 0);
  });

  test('T4 a response over the cap is aborted', async () => {
    const server = await serve('127.0.0.1', (_req, res) => {
      res.end(Buffer.alloc(9 * 1024 * 1024, 0x61));
    });
    await assert.rejects(
      createLlmHttp()({ target: target(`http://127.0.0.1:${server.port}`), path: '/api/generate', method: 'POST', body: '{}', timeoutMs: 10000, addresses: 'loopback' }),
      /too large/,
    );
  });

  test('T5 the timeout is an overall deadline: a server that keeps trickling bytes is cut off', async () => {
    const timers: NodeJS.Timeout[] = [];
    const drip = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const t = setInterval(() => { if (!res.writableEnded) res.write(' '); }, 100);
      timers.push(t);
      res.on('close', () => clearInterval(t));
    });
    await new Promise<void>((r) => drip.listen(0, '127.0.0.1', () => r()));
    const port = (drip.address() as AddressInfo).port;
    const started = Date.now();
    try {
      await assert.rejects(
        createLlmHttp()({ target: target(`http://127.0.0.1:${port}`), path: '/api/generate', method: 'POST', body: '{}', timeoutMs: 1000, addresses: 'loopback' }),
        /timed out/,
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 1500, `the call ran ${elapsed} ms past a 1000 ms deadline`);
    } finally {
      timers.forEach(clearInterval);
      drip.closeAllConnections();
      await new Promise<void>((r) => drip.close(() => r()));
    }
  });
});
