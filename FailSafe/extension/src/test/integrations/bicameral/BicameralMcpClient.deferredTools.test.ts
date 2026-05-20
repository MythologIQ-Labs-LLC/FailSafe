// FX527 — Phase 1 of plan-qor-bicameral-cluster-high: deferred-tool wrappers.
// Each wrapper: (1) calls callRaw with correct tool name + argument keys;
// (2) parses returned JSON via runtime guard; (3) rejects malformed payloads.
import { strict as assert } from 'assert';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';

interface CallRecord {
  name: string;
  arguments: Record<string, unknown>;
}

function makeFakeClient(response: unknown): { fake: { callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>; connect: () => Promise<void>; close: () => Promise<void>; listTools: () => Promise<{ tools: never[] }>; getServerVersion: () => { name: string; version: string } }; calls: CallRecord[] } {
  const calls: CallRecord[] = [];
  const fake = {
    callTool: async (req: { name: string; arguments: Record<string, unknown> }) => {
      calls.push({ name: req.name, arguments: req.arguments });
      return { content: [{ type: 'text', text: JSON.stringify(response) }] };
    },
    connect: async () => undefined,
    close: async () => undefined,
    listTools: async () => ({ tools: [] }),
    // B-BIC-22: pass the protocol-floor assertion.
    getServerVersion: () => ({ name: 'echo-bicameral', version: '0.14.0' }),
  };
  return { fake, calls };
}

async function newConnected(response: unknown): Promise<{ client: BicameralMcpClient; calls: CallRecord[] }> {
  const { fake, calls } = makeFakeClient(response);
  const client = new BicameralMcpClient({
    command: 'noop', cwd: '/tmp',
    clientFactory: () => fake as never,
    transportFactory: () => ({ onclose: undefined } as never),
  });
  await client.connect();
  return { client, calls };
}

suite('BicameralMcpClient deferred tools (FX527 — Phase 1 type-surface)', () => {
  test('ingest — calls bicameral.ingest with {repo_path}, parses {ingested}', async () => {
    const { client, calls } = await newConnected({ ingested: 7 });
    const result = await client.ingest({ repoPath: '/x' });
    assert.equal(calls[0].name, 'bicameral.ingest');
    assert.deepEqual(calls[0].arguments, { repo_path: '/x' });
    assert.equal(result.ingested, 7);
  });

  test('ingest — rejects malformed payload', async () => {
    const { client } = await newConnected({ wrong: 'shape' });
    await assert.rejects(() => client.ingest({ repoPath: '/x' }), /unexpected shape/);
  });

  test('search — calls bicameral.search with {query}, parses {results}', async () => {
    const { client, calls } = await newConnected({ results: [{ id: 'd1', title: 't', score: 0.9 }] });
    const result = await client.search({ query: 'foo' });
    assert.equal(calls[0].name, 'bicameral.search');
    assert.deepEqual(calls[0].arguments, { query: 'foo' });
    assert.equal(result.results.length, 1);
  });

  test('search — rejects malformed payload', async () => {
    const { client } = await newConnected({ results: 'not-an-array' });
    await assert.rejects(() => client.search({ query: 'x' }), /unexpected shape/);
  });

  test('brief — calls bicameral.brief with {feature}, parses {brief}', async () => {
    const { client, calls } = await newConnected({ brief: 'summary', feature: 'auth' });
    const result = await client.brief({ feature: 'auth' });
    assert.equal(calls[0].name, 'bicameral.brief');
    assert.deepEqual(calls[0].arguments, { feature: 'auth' });
    assert.equal(result.brief, 'summary');
  });

  test('brief — rejects malformed payload', async () => {
    const { client } = await newConnected({ feature: 'auth' });
    await assert.rejects(() => client.brief({ feature: 'auth' }), /unexpected shape/);
  });

  test('judgeGaps — calls bicameral.judgeGaps with {feature}, parses {gaps}', async () => {
    const { client, calls } = await newConnected({ gaps: [{ id: 'g1', description: 'missing test' }] });
    const result = await client.judgeGaps({ feature: 'auth' });
    assert.equal(calls[0].name, 'bicameral.judgeGaps');
    assert.deepEqual(calls[0].arguments, { feature: 'auth' });
    assert.equal(result.gaps.length, 1);
  });

  test('judgeGaps — rejects malformed payload', async () => {
    const { client } = await newConnected({ gaps: 'no' });
    await assert.rejects(() => client.judgeGaps({ feature: 'auth' }), /unexpected shape/);
  });

  test('resolveCompliance — calls bicameral.resolveCompliance with {decision_id, resolution}, parses {resolved}', async () => {
    const { client, calls } = await newConnected({ resolved: true, message: 'ok' });
    const result = await client.resolveCompliance({ decisionId: 'd1', resolution: 'accept' });
    assert.equal(calls[0].name, 'bicameral.resolveCompliance');
    assert.deepEqual(calls[0].arguments, { decision_id: 'd1', resolution: 'accept' });
    assert.equal(result.resolved, true);
  });

  test('resolveCompliance — rejects malformed payload', async () => {
    const { client } = await newConnected({ message: 'missing-resolved' });
    await assert.rejects(() => client.resolveCompliance({ decisionId: 'd', resolution: 'r' }), /unexpected shape/);
  });

  test('linkCommit — calls bicameral.linkCommit with {commit_sha, decision_id}, parses {linked}', async () => {
    const { client, calls } = await newConnected({ linked: true, commit: 'abc123', decisionId: 'd1' });
    const result = await client.linkCommit({ commitSha: 'abc123', decisionId: 'd1' });
    assert.equal(calls[0].name, 'bicameral.linkCommit');
    assert.deepEqual(calls[0].arguments, { commit_sha: 'abc123', decision_id: 'd1' });
    assert.equal(result.linked, true);
  });

  test('linkCommit — rejects malformed payload', async () => {
    const { client } = await newConnected({ commit: 'abc' });
    await assert.rejects(() => client.linkCommit({ commitSha: 'a', decisionId: 'd' }), /unexpected shape/);
  });

  test('update — calls bicameral.update with {decision_id, payload}, parses {updated}', async () => {
    const { client, calls } = await newConnected({ updated: true });
    const result = await client.update({ decisionId: 'd1', payload: { foo: 'bar' } });
    assert.equal(calls[0].name, 'bicameral.update');
    assert.deepEqual(calls[0].arguments, { decision_id: 'd1', payload: { foo: 'bar' } });
    assert.equal(result.updated, true);
  });

  test('update — rejects malformed payload', async () => {
    const { client } = await newConnected({ wrong: 'no-updated' });
    await assert.rejects(() => client.update({ decisionId: 'd', payload: {} }), /unexpected shape/);
  });

  test('reset — calls bicameral.reset with optional {scope}, parses {reset}', async () => {
    const { client, calls } = await newConnected({ reset: true });
    const result = await client.reset({ scope: 'all' });
    assert.equal(calls[0].name, 'bicameral.reset');
    assert.deepEqual(calls[0].arguments, { scope: 'all' });
    assert.equal(result.reset, true);
  });

  test('reset — calls bicameral.reset with no args when scope omitted', async () => {
    const { client, calls } = await newConnected({ reset: true });
    await client.reset();
    assert.deepEqual(calls[0].arguments, {});
  });

  test('dashboard — calls bicameral.dashboard with empty args, parses object', async () => {
    const { client, calls } = await newConnected({ features: 4, decisions: 10 });
    const result = await client.dashboard();
    assert.equal(calls[0].name, 'bicameral.dashboard');
    assert.deepEqual(calls[0].arguments, {});
    assert.equal(result.features, 4);
  });

  test('dashboard — rejects non-object payload', async () => {
    const { client } = await newConnected('not-an-object');
    await assert.rejects(() => client.dashboard(), /unexpected shape/);
  });

  test('validateSymbols — calls bicameral.validateSymbols with {symbols}, parses {invalid}', async () => {
    const { client, calls } = await newConnected({ invalid: [{ symbol: 'X', reason: 'gone' }] });
    const result = await client.validateSymbols({ symbols: ['X', 'Y'] });
    assert.equal(calls[0].name, 'bicameral.validateSymbols');
    assert.deepEqual(calls[0].arguments, { symbols: ['X', 'Y'] });
    assert.equal(result.invalid.length, 1);
  });

  test('validateSymbols — rejects malformed payload', async () => {
    const { client } = await newConnected({ invalid: 'no' });
    await assert.rejects(() => client.validateSymbols({ symbols: [] }), /unexpected shape/);
  });

  test('getNeighbors — calls bicameral.getNeighbors with {decision_id}, parses {neighbors}', async () => {
    const { client, calls } = await newConnected({ neighbors: [{ id: 'd2', relation: 'depends' }] });
    const result = await client.getNeighbors({ decisionId: 'd1' });
    assert.equal(calls[0].name, 'bicameral.getNeighbors');
    assert.deepEqual(calls[0].arguments, { decision_id: 'd1' });
    assert.equal(result.neighbors.length, 1);
  });

  test('getNeighbors — rejects malformed payload', async () => {
    const { client } = await newConnected({ neighbors: null });
    await assert.rejects(() => client.getNeighbors({ decisionId: 'd' }), /unexpected shape/);
  });
});
