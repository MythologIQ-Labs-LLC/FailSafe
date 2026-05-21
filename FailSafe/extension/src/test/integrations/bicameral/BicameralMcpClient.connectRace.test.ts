// FX540 — B-BIC-8 + B-BIC-21: concurrent connect/disconnect race tests.
// Verifies that the in-flight connect promise cache prevents transport leaks
// when multiple callers race on connect(), and that connect/disconnect
// interleaving leaves the client in a coherent state.
import { strict as assert } from 'assert';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';

interface ConnectCall {
  resolve: () => void;
  reject: (err: Error) => void;
}

function makeSlowClient(opts: { connectDelayMs?: number; rejectOn?: number } = {}): {
  fake: {
    callTool: () => Promise<unknown>;
    connect: (transport: unknown) => Promise<void>;
    close: () => Promise<void>;
    listTools: () => Promise<{ tools: never[] }>;
    getServerVersion: () => { name: string; version: string } | undefined;
  };
  spawned: { count: number };
} {
  const spawned = { count: 0 };
  let attempt = 0;
  return {
    spawned,
    fake: {
      callTool: async () => ({ content: [{ type: 'text', text: '{}' }] }),
      connect: async () => {
        attempt++;
        spawned.count++;
        if (opts.rejectOn === attempt) {
          throw new Error('synthetic-connect-failure');
        }
        if (opts.connectDelayMs) {
          await new Promise((r) => setTimeout(r, opts.connectDelayMs));
        }
      },
      close: async () => undefined,
      listTools: async () => ({ tools: [] }),
      getServerVersion: () => ({ name: 'echo-bicameral', version: '0.14.0' }),
    },
  };
}

function newClient(fake: ConnectCall extends never ? never : ReturnType<typeof makeSlowClient>['fake']): BicameralMcpClient {
  return new BicameralMcpClient({
    command: 'noop',
    cwd: '/tmp',
    idleDisconnectMs: 0,
    clientFactory: () => fake as never,
    transportFactory: () => ({ onclose: undefined } as never),
  });
}

suite('BicameralMcpClient connect race (FX540 — B-BIC-8 + B-BIC-21)', () => {
  test('Promise.all([connect(), connect()]) spawns only one transport', async () => {
    const { fake, spawned } = makeSlowClient({ connectDelayMs: 30 });
    const client = newClient(fake);
    await Promise.all([client.connect(), client.connect(), client.connect()]);
    assert.equal(spawned.count, 1, 'three concurrent connect() calls should share one spawn');
    assert.equal(client.isConnected(), true);
  });

  test('connect → disconnect → connect cycles cleanly', async () => {
    const { fake, spawned } = makeSlowClient({});
    const client = newClient(fake);
    await client.connect();
    assert.equal(spawned.count, 1);
    await client.disconnect();
    assert.equal(client.isConnected(), false);
    await client.connect();
    assert.equal(spawned.count, 2, 'reconnect after disconnect should spawn a fresh transport');
    assert.equal(client.isConnected(), true);
  });

  test('connect() rejection clears the cached promise so the next connect() retries', async () => {
    const { fake, spawned } = makeSlowClient({ rejectOn: 1 });
    const client = newClient(fake);
    await assert.rejects(() => client.connect(), /synthetic-connect-failure/);
    assert.equal(client.isConnected(), false);
    // Second attempt should NOT reuse the rejected promise.
    await client.connect();
    assert.equal(spawned.count, 2, 'second connect after rejection must spawn fresh');
    assert.equal(client.isConnected(), true);
  });

  test('concurrent connect() resolves to coherent connected state (no half-init)', async () => {
    const { fake } = makeSlowClient({ connectDelayMs: 20 });
    const client = newClient(fake);
    const promises = Array.from({ length: 5 }, () => client.connect());
    await Promise.all(promises);
    // Capabilities should be populated exactly once.
    assert.equal(client.isConnected(), true);
    assert.ok(client.getCapabilities() instanceof Set);
  });
});
