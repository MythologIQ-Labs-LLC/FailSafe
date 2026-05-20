// FX541 — B-BIC-22: MCP protocol/version floor assertion at connect-time.
import { strict as assert } from 'assert';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';
import { MIN_BICAMERAL_VERSION } from '../../../integrations/bicameral/install-handler';

function makeClientWithVersion(version: string | undefined | null): {
  callTool: () => Promise<unknown>;
  connect: () => Promise<void>;
  close: () => Promise<void>;
  listTools: () => Promise<{ tools: never[] }>;
  getServerVersion: () => { name: string; version: string } | undefined;
} {
  return {
    callTool: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    connect: async () => undefined,
    close: async () => undefined,
    listTools: async () => ({ tools: [] }),
    getServerVersion: () => (version === null ? undefined : { name: 'echo', version: version as string }),
  };
}

function newClient(fake: ReturnType<typeof makeClientWithVersion>): BicameralMcpClient {
  return new BicameralMcpClient({
    command: 'noop',
    cwd: '/tmp',
    idleDisconnectMs: 0,
    clientFactory: () => fake as never,
    transportFactory: () => ({ onclose: undefined } as never),
  });
}

suite('BicameralMcpClient protocol floor (FX541 — B-BIC-22)', () => {
  test(`connect accepts when server version equals MIN_BICAMERAL_VERSION (${MIN_BICAMERAL_VERSION})`, async () => {
    const client = newClient(makeClientWithVersion(MIN_BICAMERAL_VERSION));
    await client.connect();
    assert.equal(client.isConnected(), true);
  });

  test('connect accepts when server version is above floor', async () => {
    const client = newClient(makeClientWithVersion('0.15.2'));
    await client.connect();
    assert.equal(client.isConnected(), true);
  });

  test('connect rejects with informative error when server version is below floor', async () => {
    const client = newClient(makeClientWithVersion('0.13.5'));
    await assert.rejects(
      () => client.connect(),
      /below the supported floor 0\.14\.0/,
    );
    assert.equal(client.isConnected(), false, 'client tears down on floor violation');
  });

  test('connect rejects when getServerVersion returns undefined', async () => {
    const client = newClient(makeClientWithVersion(null));
    await assert.rejects(
      () => client.connect(),
      /Bicameral server did not report a version/,
    );
    assert.equal(client.isConnected(), false);
  });

  test('connect rejects when version field is empty string', async () => {
    const client = newClient(makeClientWithVersion(''));
    await assert.rejects(
      () => client.connect(),
      /did not report a version/,
    );
  });
});
