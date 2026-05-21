// FX526 — Phase 1 of plan-qor-bicameral-cluster-high: BicameralMcpClient.callRaw.
import { strict as assert } from 'assert';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';

interface FakeClient {
  callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
  connect: (transport: unknown) => Promise<void>;
  close: () => Promise<void>;
  listTools: () => Promise<{ tools: Array<{ name: string }> }>;
  getServerVersion: () => { name: string; version: string } | undefined;
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    callTool: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    connect: async () => undefined,
    close: async () => undefined,
    listTools: async () => ({ tools: [] }),
    // B-BIC-22: protocol-floor assertion needs getServerVersion. Default fixture
    // returns the minimum floor so existing tests pass through the assertion.
    getServerVersion: () => ({ name: 'echo-bicameral', version: '0.14.0' }),
    ...overrides,
  };
}

suite('BicameralMcpClient.callRaw (FX526 — Phase 1 type-surface foundation)', () => {
  test('callRaw passes through name+args to underlying client.callTool', async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const fake = makeClient({
      callTool: async (req) => {
        calls.push(req);
        return { content: [{ type: 'text', text: '{"echo":true}' }] };
      },
    });
    const client = new BicameralMcpClient({
      command: 'noop', cwd: '/tmp',
      clientFactory: () => fake as never,
      transportFactory: () => ({ onclose: undefined } as never),
    });
    await client.connect();
    const result = await client.callRaw('bicameral.ingest', { repo_path: '/x' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'bicameral.ingest');
    assert.deepEqual(calls[0].arguments, { repo_path: '/x' });
    assert.ok(result.content);
  });

  test('callRaw throws when result.isError === true', async () => {
    const fake = makeClient({
      callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'boom' }] }),
    });
    const client = new BicameralMcpClient({
      command: 'noop', cwd: '/tmp',
      clientFactory: () => fake as never,
      transportFactory: () => ({ onclose: undefined } as never),
    });
    await client.connect();
    await assert.rejects(
      () => client.callRaw('bicameral.ingest', {}),
      /bicameral tool bicameral\.ingest reported isError=true/,
    );
  });

  test('callRaw throws when client is not connected', async () => {
    const client = new BicameralMcpClient({ command: 'noop', cwd: '/tmp' });
    await assert.rejects(
      () => client.callRaw('bicameral.history', {}),
      /BicameralMcpClient not connected/,
    );
  });

  test('B-BIC-11: structured isError payload surfaces detail text in thrown Error', async () => {
    const fake = makeClient({
      callTool: async () => ({
        isError: true,
        content: [{ type: 'text', text: 'tool-specific failure: invalid decision-id "missing-d1"' }],
      }),
    });
    const client = new BicameralMcpClient({
      command: 'noop', cwd: '/tmp', idleDisconnectMs: 0,
      clientFactory: () => fake as never,
      transportFactory: () => ({ onclose: undefined } as never),
    });
    await client.connect();
    await assert.rejects(
      () => client.callRaw('bicameral.ratify', { decision_id: 'missing-d1' }),
      /reported isError=true: tool-specific failure: invalid decision-id "missing-d1"/,
    );
  });

  test('B-BIC-23: callRaw rejects malformed (non-ToolCallResult) responses via runtime guard', async () => {
    const fake = makeClient({
      callTool: async () => 'not-an-object' as unknown as never,
    });
    const client = new BicameralMcpClient({
      command: 'noop', cwd: '/tmp', idleDisconnectMs: 0,
      clientFactory: () => fake as never,
      transportFactory: () => ({ onclose: undefined } as never),
    });
    await client.connect();
    await assert.rejects(
      () => client.callRaw('bicameral.history', {}),
      /failed runtime type guard/,
    );
  });
});
