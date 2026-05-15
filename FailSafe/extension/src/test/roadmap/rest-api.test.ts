// Functional tests for createRestApi (FX191).
// Pure factory returning HTTP wrapper methods. Sink: captured fetch calls
// + asserted error fallbacks.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { createRestApi } from '../../../src/roadmap/ui/modules/rest-api.js';

interface CapturedFetch { url: string; method: string; body: string | undefined; }

function installFetch(handler: (url: string, init?: { method?: string; body?: string }) => { ok?: boolean; status?: number; body?: unknown }): {
  calls: CapturedFetch[];
  restore: () => void;
} {
  const calls: CapturedFetch[] = [];
  const original = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method || 'GET', body: init?.body });
    const r = handler(url, init);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
    };
  };
  return { calls, restore: () => { (globalThis as { fetch?: unknown }).fetch = original; } };
}

const BASE = 'http://test.local:9377';

suite('createRestApi (FX191)', () => {
  let f: ReturnType<typeof installFetch>;
  teardown(() => { if (f) f.restore(); });

  test('FX191 fetchSkills — happy path returns server JSON', async () => {
    f = installFetch(() => ({ body: { skills: [{ name: 'qor-audit' }] } }));
    const api = createRestApi(BASE);
    const out = await api.fetchSkills();
    assert.equal(out.skills.length, 1);
    assert.equal(f.calls[0].url, `${BASE}/api/skills`);
  });

  test('FX191 fetchSkills — non-ok status falls back to {skills:[]}', async () => {
    f = installFetch(() => ({ ok: false, status: 500 }));
    const api = createRestApi(BASE);
    const out = await api.fetchSkills();
    assert.deepEqual(out, { skills: [] });
  });

  test('FX191 fetchSkills — fetch throw falls back to {skills:[]}', async () => {
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: unknown }).fetch = async () => { throw new Error('network down'); };
    try {
      const api = createRestApi(BASE);
      const out = await api.fetchSkills();
      assert.deepEqual(out, { skills: [] });
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  test('FX191 fetchRisks — happy path + non-ok fallback to {risks:[]}', async () => {
    f = installFetch((url) => url.includes('/api/risks')
      ? { body: { risks: [{ id: 'r1', title: 'A' }] } }
      : { ok: false });
    const api = createRestApi(BASE);
    const out = await api.fetchRisks();
    assert.equal(out.risks.length, 1);
    assert.equal(f.calls[0].url, `${BASE}/api/risks`);
  });

  test('FX191 fetchRoadmap — non-ok returns null', async () => {
    f = installFetch(() => ({ ok: false, status: 404 }));
    const api = createRestApi(BASE);
    const out = await api.fetchRoadmap();
    assert.equal(out, null);
  });

  test('FX191 fetchRelevance — without phase parameter omits query string', async () => {
    f = installFetch(() => ({ body: { skills: [] } }));
    const api = createRestApi(BASE);
    await api.fetchRelevance();
    assert.equal(f.calls[0].url, `${BASE}/api/skills/relevance`);
  });

  test('FX191 fetchRelevance — with phase parameter URL-encodes the phase', async () => {
    f = installFetch(() => ({ body: { skills: [] } }));
    const api = createRestApi(BASE);
    await api.fetchRelevance('plan/audit');
    assert.match(f.calls[0].url, /phase=plan%2Faudit/);
  });

  test('FX191 createRisk — POSTs JSON body to /api/v1/risks', async () => {
    f = installFetch(() => ({ body: { ok: true, risk: { id: 'r1' } } }));
    const api = createRestApi(BASE);
    const out = await api.createRisk({ title: 'X', severity: 'high' });
    assert.equal(f.calls[0].url, `${BASE}/api/v1/risks`);
    assert.equal(f.calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(f.calls[0].body!), { title: 'X', severity: 'high' });
    assert.equal(out.ok, true);
  });

  test('FX191 createRisk — non-ok returns null', async () => {
    f = installFetch(() => ({ ok: false, status: 400 }));
    const api = createRestApi(BASE);
    const out = await api.createRisk({ title: '' });
    assert.equal(out, null);
  });

  test('FX191 updateRisk — PUTs JSON body to /api/v1/risks/:id with id-encoded path', async () => {
    f = installFetch(() => ({ body: { ok: true } }));
    const api = createRestApi(BASE);
    await api.updateRisk('risk/with slash', { title: 'New' });
    assert.equal(f.calls[0].method, 'PUT');
    assert.match(f.calls[0].url, /\/api\/v1\/risks\/risk%2Fwith%20slash$/);
  });

  test('FX191 deleteRisk — DELETEs /api/v1/risks/:id', async () => {
    f = installFetch(() => ({ body: { ok: true } }));
    const api = createRestApi(BASE);
    await api.deleteRisk('r1');
    assert.equal(f.calls[0].method, 'DELETE');
    assert.equal(f.calls[0].url, `${BASE}/api/v1/risks/r1`);
  });

  test('FX191 deleteRisk — non-ok returns null', async () => {
    f = installFetch(() => ({ ok: false, status: 404 }));
    const api = createRestApi(BASE);
    const out = await api.deleteRisk('missing');
    assert.equal(out, null);
  });
});
