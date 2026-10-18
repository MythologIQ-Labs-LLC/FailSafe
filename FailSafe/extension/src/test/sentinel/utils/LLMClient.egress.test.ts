// #538 lane A (B273, plan-538a LD11 E1-E10): where Sentinel and Brainstorm
// content may be sent. Every row counts the requests a real local server
// received. E1-E9a ran red against main's LLMClient, which posted file
// content to any public-looking host the workspace named and followed
// redirects.

import { strict as assert } from 'assert';
import * as os from 'os';
import {
  allowAll, configProvider, fakeAuthorizer, newClient, probe, reachableHostNameEndpoint, recordingHttp,
  startCountingServer, type CountingServer, type Responder,
} from './llmEgressHarness';
import { createLlmHttp } from '../../../sentinel/utils/llmTransport';
import type { ResolveFn } from '../../../shared/net/addressPolicy';

const PROMPT = 'Analyze this code: SECRET_FILE_CONTENT_MARKER';

async function generate(client: ReturnType<typeof newClient>): Promise<{ ok: boolean; error?: string }> {
  try {
    await client.callEndpoint(PROMPT, 3000);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

suite('#538 LLMClient egress: destination policy (B273)', () => {
  let servers: CountingServer[] = [];
  const serve = async (host: string, respond?: Responder) => {
    const s = await startCountingServer(host, respond);
    servers.push(s);
    return s;
  };
  teardown(async () => {
    await Promise.all(servers.map((s) => s.close()));
    servers = [];
  });

  for (const source of ['workspace-file', 'workspace-setting'] as const) {
    test(`E1/E2 ${source} naming a non-loopback host: probe and generate send nothing`, async () => {
      const server = await serve('::');
      const endpoint = await reachableHostNameEndpoint(server);
      const client = newClient(configProvider({ endpoint, source }), { authorizer: allowAll() });
      const probed = await probe(client, { ask: true });
      const r = await generate(client);
      assert.equal(server.count(), 0, `${source}: the non-loopback host received ${server.count()} request(s)`);
      assert.equal(probed, false);
      assert.equal(r.ok, false);
      assert.match(r.error ?? '', /LLM destination refused/);
    });
  }

  test('E3 user-setting with no authorizer: nothing is sent', async () => {
    const server = await serve('::');
    const endpoint = await reachableHostNameEndpoint(server);
    const client = newClient(configProvider({ endpoint, source: 'user-setting' }));
    const probed = await probe(client, { ask: true });
    const r = await generate(client);
    assert.equal(server.count(), 0, `the host received ${server.count()} request(s)`);
    assert.equal(probed, false);
    assert.equal(r.ok, false);
  });

  test('E4 an approval for the other operation does not cover file analysis', async () => {
    const server = await serve('::');
    const endpoint = await reachableHostNameEndpoint(server);
    const auth = fakeAuthorizer((c) => c.request.operation === 'brainstorm-transcript');
    const client = newClient(configProvider({ endpoint, source: 'user-setting' }), { authorizer: auth });
    const probed = await probe(client, { ask: true });
    await generate(client);
    assert.equal(server.count(), 0, `the host received ${server.count()} request(s)`);
    assert.equal(probed, false);
  });

  test('E5 an approval for the same host on another port does not cover this port', async () => {
    const server = await serve('::');
    const endpoint = await reachableHostNameEndpoint(server);
    const other = new URL(endpoint);
    other.port = String(server.port + 1);
    const auth = fakeAuthorizer((c) => c.request.origin === other.origin);
    const client = newClient(configProvider({ endpoint, source: 'user-setting' }), { authorizer: auth });
    const probed = await probe(client, { ask: true });
    await generate(client);
    assert.equal(server.count(), 0, `the host received ${server.count()} request(s)`);
    assert.equal(probed, false);
  });

  test('E6 an endpoint substituted after the probe gets nothing', async () => {
    const a = await serve('::');
    const b = await serve('::');
    const endpointA = await reachableHostNameEndpoint(a);
    const endpointB = await reachableHostNameEndpoint(b);
    const auth = fakeAuthorizer((c) => c.request.origin === new URL(endpointA).origin);
    const config = configProvider({ endpoint: endpointA, source: 'user-setting' });
    const client = newClient(config, { authorizer: auth });
    await probe(client, { ask: true });
    config.set({ endpoint: endpointB });
    const r = await generate(client);
    assert.equal(b.count(), 0, 'the substituted endpoint received a request');
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /LLM destination refused/);
  });

  test('E7 a redirect is never followed, for the probe or for generate', async () => {
    const second = await serve('127.0.0.1');
    const first = await serve('127.0.0.1', (_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://127.0.0.1:${second.port}/api/generate`);
      res.end();
    });
    const client = newClient(configProvider({ endpoint: `http://127.0.0.1:${first.port}`, source: 'default' }));
    const probed = await probe(client);
    const r = await generate(client);
    assert.equal(second.count(), 0, `the redirect target received ${second.count()} request(s)`);
    assert.equal(probed, false);
    assert.equal(first.count(), 2, 'the first server received the probe and the generate call');
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /LLM endpoint returned 302/);
  });

  test('E8 an authorizer that throws refuses', async () => {
    const server = await serve('::');
    const endpoint = await reachableHostNameEndpoint(server);
    const auth = fakeAuthorizer(() => { throw new Error('authorizer broke'); });
    const client = newClient(configProvider({ endpoint, source: 'user-setting' }), { authorizer: auth });
    const probed = await probe(client, { ask: true });
    await generate(client);
    assert.equal(server.count(), 0, `the host received ${server.count()} request(s)`);
    assert.equal(probed, false);
  });

  test('E9a an endpoint carrying a query string is refused', async () => {
    const server = await serve('127.0.0.1');
    const client = newClient(configProvider({ endpoint: `http://127.0.0.1:${server.port}?x=1`, source: 'default' }));
    const probed = await probe(client);
    const r = await generate(client);
    assert.equal(server.count(), 0, `the host received ${server.count()} request(s)`);
    assert.equal(probed, false);
    assert.equal(r.ok, false);
  });

  test('E9b ftp:, file: and URL credentials are refused', async () => {
    const server = await serve('127.0.0.1');
    for (const endpoint of ['ftp://127.0.0.1:21', 'file:///etc/passwd', `http://u:p@127.0.0.1:${server.port}`]) {
      const client = newClient(configProvider({ endpoint, source: 'default' }));
      assert.equal(await probe(client), false, endpoint);
      const r = await generate(client);
      assert.equal(r.ok, false, endpoint);
    }
    assert.equal(server.count(), 0);
  });

  test('E10 the default loopback endpoint still works: one probe, one generate, same response mapping', async () => {
    const server = await serve('127.0.0.1');
    const client = newClient(configProvider({ endpoint: `http://127.0.0.1:${server.port}`, source: 'default' }));
    assert.equal(await probe(client), true);
    const result = await client.callEndpoint(PROMPT, 3000);
    assert.deepEqual(result, { response: 'ESCALATE: model answer', totalDuration: 7 });
    assert.deepEqual(server.received.map((r) => `${r.method} ${r.url}`), ['GET /api/tags', 'POST /api/generate']);
    const body = JSON.parse(server.received[1].body) as { model: string; prompt: string; stream: boolean };
    assert.deepEqual(body, { model: 'phi3:mini', prompt: PROMPT, stream: false });
  });
});

// Post-fix rows (plan-538a LD11 E11, E12 and the audit's S1 variants). With
// the real transport, the host-name rows above would also be refused by the
// address guard (the machine's own name resolves to a private or loopback
// address), so they cannot tell which check refused. These rows inject a
// recording transport and an authorizer that approves everything: only the
// destination policy stands between the endpoint and a request.
suite('#538 LLMClient egress: the policy alone decides (B273 S1)', () => {
  const REMOTE = 'https://llm.example.test:8443/ollama';

  for (const source of ['workspace-file', 'workspace-setting'] as const) {
    test(`S1-E1/E2 ${source} on a remote host with an allow-all authorizer: no request, no authorization asked`, async () => {
      const auth = allowAll();
      const rec = recordingHttp();
      const client = newClient(configProvider({ endpoint: REMOTE, source }), { authorizer: auth, http: rec.fn });
      assert.equal(await probe(client, { ask: true }), false);
      assert.equal((await generate(client)).ok, false);
      assert.equal(rec.calls.length, 0);
      assert.equal(auth.calls.length, 0, 'a workspace source is never offered for approval');
    });
  }

  test('S1-E3 user-setting with no authorizer: no request', async () => {
    const rec = recordingHttp();
    const client = newClient(configProvider({ endpoint: REMOTE, source: 'user-setting' }), { http: rec.fn });
    assert.equal(await probe(client, { ask: true }), false);
    assert.equal((await generate(client)).ok, false);
    assert.equal(rec.calls.length, 0);
  });

  test('S1-E4/E5 the authorizer is asked for exactly this origin and operation; another approval does not count', async () => {
    const rec = recordingHttp();
    const auth = fakeAuthorizer((c) => c.request.operation === 'brainstorm-transcript' || c.request.origin === 'https://llm.example.test:8444');
    const client = newClient(configProvider({ endpoint: REMOTE, source: 'user-setting' }), { authorizer: auth, http: rec.fn });
    assert.equal(await probe(client, { ask: true }), false);
    assert.equal((await generate(client)).ok, false);
    assert.equal(rec.calls.length, 0);
    assert.deepEqual(auth.calls.map((c) => [c.request.origin, c.request.operation]), [
      ['https://llm.example.test:8443', 'sentinel-file-analysis'], ['https://llm.example.test:8443', 'sentinel-file-analysis'],
    ]);
  });

  test('S1-E6 an approval for A does not carry to a substituted B', async () => {
    const rec = recordingHttp();
    const auth = fakeAuthorizer((c) => c.request.origin === 'https://llm.example.test:8443');
    const config = configProvider({ endpoint: REMOTE, source: 'user-setting' });
    const client = newClient(config, { authorizer: auth, http: rec.fn });
    assert.equal(await probe(client, { ask: true }), true);
    config.set({ endpoint: 'https://other.example.test:8443' });
    const r = await generate(client);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /LLM destination refused/);
    assert.deepEqual(rec.calls.map((c) => `${c.target.origin}${c.target.basePath}${c.path}`), ['https://llm.example.test:8443/ollama/api/tags']);
  });

  test('S1-E8 an authorizer that throws: no request', async () => {
    const rec = recordingHttp();
    const auth = fakeAuthorizer(() => { throw new Error('boom'); });
    const client = newClient(configProvider({ endpoint: REMOTE, source: 'user-setting' }), { authorizer: auth, http: rec.fn });
    assert.equal(await probe(client, { ask: true }), false);
    assert.equal((await generate(client)).ok, false);
    assert.equal(rec.calls.length, 0);
  });

  test('E11 an approved user-scope remote works: approved origin, public address class, the prompt as body; callEndpoint and a default probe never ask', async () => {
    const rec = recordingHttp();
    const auth = fakeAuthorizer((c) => c.request.origin === 'https://llm.example.test:8443' && c.request.operation === 'sentinel-file-analysis');
    const client = newClient(configProvider({ endpoint: REMOTE, source: 'user-setting' }), { authorizer: auth, http: rec.fn });
    assert.equal(await probe(client, { ask: true }), true);
    assert.deepEqual(await client.callEndpoint(PROMPT, 3000), { response: 'ok', totalDuration: 3 });
    assert.deepEqual(rec.calls.map((c) => [c.method, `${c.target.origin}${c.target.basePath}${c.path}`, c.addresses]), [
      ['GET', 'https://llm.example.test:8443/ollama/api/tags', 'public'],
      ['POST', 'https://llm.example.test:8443/ollama/api/generate', 'public'],
    ]);
    assert.equal((JSON.parse(rec.calls[1].body ?? '{}') as { prompt?: string }).prompt, PROMPT);
    assert.deepEqual(auth.calls.map((c) => c.options.ask), [true, false], 'callEndpoint never asks');

    const quiet = fakeAuthorizer(() => false);
    const rec2 = recordingHttp();
    const other = newClient(configProvider({ endpoint: REMOTE, source: 'user-setting' }), { authorizer: quiet, http: rec2.fn });
    assert.equal(await probe(other), false);
    assert.equal((await generate(other)).ok, false);
    assert.deepEqual(quiet.calls.map((c) => c.options.ask), [false, false], 'a default probe and callEndpoint never ask');
    assert.equal(rec2.calls.length, 0);
  });

  test('E12 workspace-file http://localhost whose name resolves to a non-loopback address: nothing is sent', async () => {
    const server = await startCountingServer('::');
    try {
      let iface = '';
      for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list ?? []) if (!iface && a.family === 'IPv4' && !a.internal) iface = a.address;
      }
      assert.ok(iface, 'this row needs a non-internal IPv4 interface address');
      let resolved = 0;
      const resolve: ResolveFn = (hostname, _o, cb) => { resolved++; cb(null, hostname === 'localhost' ? [{ address: iface, family: 4 }] : []); };
      const client = newClient(configProvider({ endpoint: `http://localhost:${server.port}`, source: 'workspace-file' }), { http: createLlmHttp(resolve) });
      const probed = await probe(client);
      const r = await generate(client);
      assert.equal(server.count(), 0, 'the remapped localhost reached the server');
      assert.ok(resolved >= 2, 'the name was resolved for the probe and for generate');
      assert.equal(probed, false);
      assert.equal(r.ok, false);
    } finally {
      await server.close();
    }
  });
});
