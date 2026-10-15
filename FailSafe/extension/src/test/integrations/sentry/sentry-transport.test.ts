import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import {
  makeHttpsGet, normalizeBase, RateLimiter, requestWithRetry,
  type CancelSignal, type RequestFn, type SentryGetFn, type SentryResponse, type TransportCtx,
} from '../../../integrations/sentry/sentry-transport';

// FX953 (#478, LD2): every wait is recorded by an injected sleep that advances
// an injected clock, so no test sleeps for real. Header names are lower case,
// as Node delivers them, unless a case says otherwise.

const BASE = 'https://sentry.io';
const URL1 = `${BASE}/api/0/organizations/acme/issues/?project=backend`;
const T0 = 1_700_000_000_000;

interface Harness { ctx: TransportCtx; sleeps: number[]; cancel: { cancelled: boolean } }
function harness(base = BASE, onSleep?: (h: Harness) => void): Harness {
  let now = T0;
  const cancel = { cancelled: false };
  const h = { sleeps: [] as number[], cancel } as Harness;
  const signal: CancelSignal = { get cancelled() { return cancel.cancelled; }, onCancel: () => () => undefined };
  h.ctx = {
    base: normalizeBase(base),
    limiter: new RateLimiter(),
    cancel: signal,
    policy: { now: () => now, sleep: async (ms) => { h.sleeps.push(ms); now += ms; onSleep?.(h); } },
  };
  return h;
}

const resetIn = (ms: number): string => String((T0 + ms) / 1000);

function scripted(responses: Array<SentryResponse | Error>): { get: SentryGetFn; urls: string[] } {
  const urls: string[] = [];
  const get: SentryGetFn = async (url) => {
    urls.push(url);
    const next = responses[Math.min(urls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { get, urls };
}

const ok: SentryResponse = { status: 200, body: '[]', headers: {} };
const r429 = (headers: Record<string, string> = {}): SentryResponse => ({ status: 429, body: '', headers });
const HDR = { Authorization: 'Bearer sntrys_TOPSECRET' };

suite('sentry-transport (#478 FX953)', () => {
  suite('rate limits', () => {
    test('a 429 with reset 2 s ahead sleeps 2000 ms, then succeeds', async () => {
      const h = harness();
      const s = scripted([r429({ 'x-sentry-rate-limit-reset': resetIn(2000) }), ok]);
      const r = await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.equal(r.kind, 'ok');
      assert.deepEqual(h.sleeps, [2000]);
      assert.equal(s.urls.length, 2);
    });
    test('a 429 with reset in the past and no Retry-After backs off 1000 ms', async () => {
      const h = harness();
      assert.equal((await requestWithRetry(URL1, HDR, scripted([r429({ 'x-sentry-rate-limit-reset': resetIn(-5000) }), ok]).get, h.ctx)).kind, 'ok');
      assert.deepEqual(h.sleeps, [1000]);
    });
    test('a 429 without reset honours Retry-After seconds', async () => {
      const h = harness();
      await requestWithRetry(URL1, HDR, scripted([r429({ 'retry-after': '7' }), ok]).get, h.ctx);
      assert.deepEqual(h.sleeps, [7000]);
    });
    test('a malformed reset and an HTTP-date Retry-After fall back to backoff', async () => {
      const h = harness();
      await requestWithRetry(URL1, HDR, scripted([
        r429({ 'x-sentry-rate-limit-reset': 'soon', 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }), ok,
      ]).get, h.ctx);
      assert.deepEqual(h.sleeps, [1000]);
    });
    test('a reset 10 minutes ahead is capped at 60000 ms', async () => {
      const h = harness();
      await requestWithRetry(URL1, HDR, scripted([r429({ 'x-sentry-rate-limit-reset': resetIn(600_000) }), ok]).get, h.ctx);
      assert.deepEqual(h.sleeps, [60000]);
    });
    test('four consecutive 429s return rate_limited after exactly 4 requests', async () => {
      const h = harness();
      const s = scripted([r429()]);
      const r = await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.equal(r.kind, 'rate_limited');
      assert.equal(s.urls.length, 4);
      assert.deepEqual(h.sleeps, [1000, 2000, 4000]);
    });
    test('a 429 with both reset and remaining 0 waits once, not twice', async () => {
      const h = harness();
      await requestWithRetry(URL1, HDR, scripted([
        r429({ 'x-sentry-rate-limit-reset': resetIn(2000), 'x-sentry-rate-limit-remaining': '0' }), ok,
      ]).get, h.ctx);
      assert.deepEqual(h.sleeps, [2000]);
    });
    test('a mixed-case reset header is honoured like the lower-case one', async () => {
      const h = harness();
      await requestWithRetry(URL1, HDR, scripted([r429({ 'X-Sentry-Rate-Limit-Reset': resetIn(3000) }), ok]).get, h.ctx);
      assert.deepEqual(h.sleeps, [3000]);
    });
  });

  suite('5xx and timeouts', () => {
    test('four consecutive 502s return http 502 after exactly 4 requests with sleeps 1/2/4 s', async () => {
      const h = harness();
      const s = scripted([{ status: 502, body: '' }]);
      const r = await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.deepEqual(r, { kind: 'http', status: 502 });
      assert.equal(s.urls.length, 4);
      assert.deepEqual(h.sleeps, [1000, 2000, 4000]);
    });
    test('four consecutive timeouts return transport after exactly 4 requests', async () => {
      const h = harness();
      const s = scripted([new Error('timeout')]);
      const r = await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.equal(r.kind, 'transport');
      assert.equal(s.urls.length, 4);
      assert.deepEqual(h.sleeps, [1000, 2000, 4000]);
    });
    test('a timeout followed by a 200 succeeds', async () => {
      assert.equal((await requestWithRetry(URL1, HDR, scripted([new Error('timeout'), ok]).get, harness().ctx)).kind, 'ok');
    });
  });
  test('400, 401, 403 and 404 are each requested exactly once', async () => {
    for (const status of [400, 401, 403, 404]) {
      const h = harness();
      const s = scripted([{ status, body: '' }]);
      const r = await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.deepEqual(r, { kind: 'http', status });
      assert.equal(s.urls.length, 1, `status ${status}`);
      assert.deepEqual(h.sleeps, []);
    }
  });

  suite('throttle', () => {
    test('remaining 0 with reset 3 s ahead delays the next request by 3000 ms', async () => {
      const h = harness();
      const s = scripted([{ status: 200, body: '[]', headers: { 'x-sentry-rate-limit-remaining': '0', 'x-sentry-rate-limit-reset': resetIn(3000) } }, ok]);
      await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.deepEqual(h.sleeps, []);
      await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.deepEqual(h.sleeps, [3000]);
    });
    test('remaining 0 with reset in the past causes no delay', async () => {
      const h = harness();
      const s = scripted([{ status: 200, body: '[]', headers: { 'x-sentry-rate-limit-remaining': '0', 'x-sentry-rate-limit-reset': resetIn(-1000) } }, ok]);
      await requestWithRetry(URL1, HDR, s.get, h.ctx);
      await requestWithRetry(URL1, HDR, s.get, h.ctx);
      assert.deepEqual(h.sleeps, []);
    });
  });
  test('cancelling during a sleep returns cancelled with no further request', async () => {
    const h = harness(BASE, (hh) => { hh.cancel.cancelled = true; });
    const s = scripted([r429(), ok]);
    const r = await requestWithRetry(URL1, HDR, s.get, h.ctx);
    assert.equal(r.kind, 'cancelled');
    assert.equal(s.urls.length, 1);
  });

  suite('refusal', () => {
    for (const url of [
      'http://sentry.io/api/0/organizations/acme/issues/',
      'https://sentry.io.evil.com/api/0/organizations/acme/issues/',
      'https://evil.com/api/0/organizations/acme/issues/',
      'https://user@sentry.io/api/0/organizations/acme/issues/',
    ]) {
      test(`refuses ${url} with zero requests`, async () => {
        const h = harness();
        const s = scripted([ok]);
        assert.equal((await requestWithRetry(url, HDR, s.get, h.ctx)).kind, 'refused');
        assert.equal(s.urls.length, 0);
      });
    }

    test('a path outside a subpath base is refused', async () => {
      const h = harness('https://host.example/sentry');
      const s = scripted([ok]);
      assert.equal((await requestWithRetry('https://host.example/sentry-evil/api/0/x', HDR, s.get, h.ctx)).kind, 'refused');
      assert.equal((await requestWithRetry('https://host.example/sentry/api/0/x', HDR, s.get, h.ctx)).kind, 'ok');
    });
    test('a base with an upper-case host and :443 accepts the normalized URL', async () => {
      const h = harness('https://SENTRY.example.com:443/sub/');
      assert.equal(h.ctx.base, 'https://sentry.example.com/sub');
      assert.equal((await requestWithRetry('https://sentry.example.com/sub/api/0/organizations/a/issues/', HDR, scripted([ok]).get, h.ctx)).kind, 'ok');
    });
  });
  test('the token never appears in any returned value', async () => {
    const outcomes = [];
    for (const script of [[ok], [r429()], [{ status: 401, body: '' }], [new Error('Bearer sntrys_TOPSECRET leaked')]]) {
      outcomes.push(await requestWithRetry(URL1, HDR, scripted(script as Array<SentryResponse | Error>).get, harness().ctx));
    }
    outcomes.push(await requestWithRetry('http://x/', HDR, scripted([ok]).get, harness().ctx));
    assert.ok(!JSON.stringify(outcomes).includes('TOPSECRET'));
  });

  suite('default HTTPS transport (makeHttpsGet)', () => {
    type FakeReq = EventEmitter & { destroyed?: Error };
    type FakeRes = EventEmitter & { statusCode: number; headers: Record<string, string> };
    // A fake https.request whose destroy(err) emits 'error', as Node's does.
    function fakeRequest(behave: (req: FakeReq, cb: (res: FakeRes) => void) => void) {
      const f = { calls: [] as Array<Record<string, unknown>>, req: undefined as FakeReq | undefined, request: undefined as unknown as RequestFn };
      f.request = ((options: Record<string, unknown>, cb: (res: FakeRes) => void) => {
        f.calls.push(options);
        const req: FakeReq = Object.assign(new EventEmitter(), {
          end() { setImmediate(() => behave(req, cb)); },
          destroy(err?: Error) { req.destroyed = err; if (err) setImmediate(() => req.emit('error', err)); },
        });
        return (f.req = req);
      }) as unknown as RequestFn;
      return f;
    }

    test('passes host, path and headers, and resolves the joined body with all headers', async () => {
      const f = fakeRequest((_req, cb) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: { link: '<x>; rel="next"', 'x-sentry-rate-limit-reset': '123' } });
        cb(res);
        res.emit('data', Buffer.from('[{"id"'));
        res.emit('data', Buffer.from(':"1"}]'));
        res.emit('end');
      });
      const r = await makeHttpsGet(f.request)('https://sentry.example.com/api/0/organizations/a/issues/?project=b', { Authorization: 'Bearer t' });
      assert.equal(f.calls[0].hostname, 'sentry.example.com');
      assert.equal(f.calls[0].path, '/api/0/organizations/a/issues/?project=b');
      assert.equal(f.calls[0].method, 'GET');
      assert.deepEqual(f.calls[0].headers, { Authorization: 'Bearer t' });
      assert.equal(r.status, 200);
      assert.equal(r.body, '[{"id":"1"}]');
      assert.equal(r.headers?.['x-sentry-rate-limit-reset'], '123');
      assert.equal(r.headers?.link, '<x>; rel="next"');
    });
    test('a timeout destroys the request and rejects', async () => {
      const f = fakeRequest((req) => { req.emit('timeout'); });
      await assert.rejects(makeHttpsGet(f.request)('https://s.example/x', {}), /timeout/);
      assert.ok(f.req?.destroyed, 'request destroyed');
    });
    test('a request error rejects', async () => {
      await assert.rejects(makeHttpsGet(fakeRequest((req) => { req.emit('error', new Error('ECONNRESET')); }).request)('https://s.example/x', {}), /ECONNRESET/);
    });
  });
});
