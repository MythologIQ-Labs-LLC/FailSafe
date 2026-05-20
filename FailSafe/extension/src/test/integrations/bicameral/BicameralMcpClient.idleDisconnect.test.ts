// FX544 — B-BIC-9: idle disconnect TTL behavior.
// Verifies that the IdleScheduler integration fires disconnect after the
// configured idle window, that inflight calls suppress the disconnect,
// that transport.onclose cancels pending idle fire, and that
// idleDisconnectMs=0 disables the feature.
import { strict as assert } from 'assert';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';

function makeFake(): {
  callTool: (req: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
  connect: () => Promise<void>;
  close: () => Promise<void>;
  listTools: () => Promise<{ tools: never[] }>;
  getServerVersion: () => { name: string; version: string };
} {
  return {
    callTool: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    connect: async () => undefined,
    close: async () => undefined,
    listTools: async () => ({ tools: [] }),
    getServerVersion: () => ({ name: 'echo', version: '0.14.0' }),
  };
}

function newClient(idleMs: number, fake?: ReturnType<typeof makeFake>): BicameralMcpClient {
  const f = fake ?? makeFake();
  const transport = { onclose: undefined as undefined | (() => void) };
  const client = new BicameralMcpClient({
    command: 'noop',
    cwd: '/tmp',
    idleDisconnectMs: idleMs,
    clientFactory: () => f as never,
    transportFactory: () => transport as never,
  });
  // Expose transport so tests can fire onclose manually.
  (client as unknown as { __testTransport: typeof transport }).__testTransport = transport;
  return client;
}

suite('BicameralMcpClient idle disconnect (FX544 — B-BIC-9)', () => {
  test('idleDisconnectMs=0 disables the feature (no auto-disconnect)', async () => {
    const client = newClient(0);
    await client.connect();
    await client.callRaw('bicameral.history', {});
    // Wait briefly; no timer should fire.
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(client.isConnected(), true);
    await client.disconnect();
  });

  test('idle window with no calls fires disconnect after TTL', async () => {
    const client = newClient(40);
    await client.connect();
    await client.callRaw('bicameral.history', {});
    // After TTL + buffer, the idle fire should have triggered disconnect.
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.isConnected(), false, 'idle TTL should have disconnected the client');
  });

  test('long-running call (inflight) suppresses idle fire', async () => {
    const fake = makeFake();
    let resolveCall: (() => void) | null = null;
    fake.callTool = () => new Promise<unknown>((res) => {
      resolveCall = () => res({ content: [{ type: 'text', text: '{}' }] });
    });
    const client = newClient(30, fake);
    await client.connect();
    const callPromise = client.callRaw('bicameral.history', {});
    // Wait past the idle TTL while the call is still in-flight.
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.isConnected(), true, 'inflight call must suppress idle disconnect');
    // Resolve the call; idle timer resets from completion.
    resolveCall!();
    await callPromise;
    await client.disconnect();
  });

  test('explicit disconnect cancels pending idle fire (no double-disconnect race)', async () => {
    const client = newClient(40);
    await client.connect();
    await client.callRaw('bicameral.history', {});
    await client.disconnect();
    // Wait past the would-be idle TTL; nothing should crash or re-fire.
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.isConnected(), false);
  });

  test('transport.onclose cancels pending idle fire', async () => {
    const client = newClient(40);
    await client.connect();
    await client.callRaw('bicameral.history', {});
    // Simulate transport crash by firing onclose directly.
    const transport = (client as unknown as { __testTransport: { onclose?: () => void } }).__testTransport;
    transport.onclose?.();
    assert.equal(client.isConnected(), false);
    // Wait past idle TTL; no callback should re-fire / no errors.
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.isConnected(), false);
  });
});
