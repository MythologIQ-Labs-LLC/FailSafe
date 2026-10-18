// #538 lane A (B273, plan-538a LD11 E1-E10): where Sentinel and Brainstorm
// content may be sent. Every row counts the requests a real local server
// received. E1-E9a ran red against main's LLMClient, which posted file
// content to any public-looking host the workspace named and followed
// redirects.

import { strict as assert } from 'assert';
import {
  allowAll, configProvider, fakeAuthorizer, newClient, probe, reachableHostNameEndpoint,
  startCountingServer, type CountingServer, type Responder,
} from './llmEgressHarness';

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
