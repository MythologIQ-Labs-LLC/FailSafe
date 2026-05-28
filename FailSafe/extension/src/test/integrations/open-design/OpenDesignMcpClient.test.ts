// FX722 — OpenDesignMcpClient tests.
// Mirrors BicameralMcpClient.test.ts structure (transplant per plan v1.1).
// Asserts surface contracts + allowlist gating + concurrent-connect coalescing
// + transport.onclose teardown + capability cache from listTools().

import { strict as assert } from 'assert';
import { OpenDesignMcpClient } from '../../../integrations/open-design/OpenDesignMcpClient';

interface CallRecord {
  name: string;
  args: Record<string, unknown>;
}

interface FakeClientOpts {
  failClose?: boolean;
  isError?: Set<string>;
  tools?: Array<{ name: string }>;
}

function makeFakeClient(
  responses: Record<string, unknown>,
  calls: CallRecord[],
  opts: FakeClientOpts = {},
) {
  const isErrSet = opts.isError ?? new Set<string>();
  return {
    async connect(_transport: unknown): Promise<void> {
      /* noop */
    },
    async close(): Promise<void> {
      if (opts.failClose) throw new Error('close exploded');
    },
    async listTools(): Promise<unknown> {
      return { tools: opts.tools ?? [{ name: 'list_projects' }, { name: 'get_file' }] };
    },
    async callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
      calls.push({ name: req.name, args: req.arguments });
      const payload = responses[req.name];
      return {
        content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}) }],
        isError: isErrSet.has(req.name),
      };
    },
  };
}

interface TransportCaptured {
  command?: string;
  args?: string[];
  cwd?: string;
  onclose?: () => void;
}

function makeFakeTransport(captured: TransportCaptured) {
  return (command: string, args: string[], cwd: string) => {
    captured.command = command;
    captured.args = args;
    captured.cwd = cwd;
    const t: { onclose?: () => void } = {};
    Object.defineProperty(t, 'onclose', {
      set: (fn: () => void) => {
        captured.onclose = fn;
      },
      get: () => captured.onclose,
      configurable: true,
    });
    return t as never;
  };
}

suite('integrations/open-design OpenDesignMcpClient', () => {
  test('isConnected returns false before connect()', () => {
    const c = new OpenDesignMcpClient({ command: 'od', args: ['mcp'], cwd: '/tmp' });
    assert.equal(c.isConnected(), false);
  });

  test('callRaw throws when not connected (read tool)', async () => {
    const c = new OpenDesignMcpClient({ command: 'od', cwd: '/tmp' });
    await assert.rejects(c.callRaw('list_projects', {}), /not connected/);
  });

  test('connect passes command/args/cwd to transport factory + populates capabilities', async () => {
    const captured: TransportCaptured = {};
    const calls: CallRecord[] = [];
    const c = new OpenDesignMcpClient({
      command: '/usr/local/bin/od',
      args: ['mcp'],
      cwd: '/repo',
      transportFactory: makeFakeTransport(captured),
      clientFactory: () => makeFakeClient({}, calls, { tools: [{ name: 'list_projects' }, { name: 'get_file' }, { name: 'get_artifact' }] }) as never,
    });
    await c.connect();
    assert.equal(captured.command, '/usr/local/bin/od');
    assert.deepEqual(captured.args, ['mcp']);
    assert.equal(captured.cwd, '/repo');
    assert.equal(c.isConnected(), true);
    const caps = c.getCapabilities();
    assert.equal(caps.size, 3);
    assert.equal(caps.has('list_projects'), true);
    assert.equal(caps.has('get_artifact'), true);
  });

  test('concurrent connect() calls share a single doConnect promise', async () => {
    let connectCount = 0;
    const calls: CallRecord[] = [];
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport({}),
      clientFactory: () => {
        connectCount++;
        return makeFakeClient({}, calls) as never;
      },
    });
    await Promise.all([c.connect(), c.connect(), c.connect()]);
    assert.equal(connectCount, 1, 'concurrent connects should coalesce into one client construction');
  });

  test('callRaw on read-only tool reaches transport', async () => {
    const calls: CallRecord[] = [];
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport({}),
      clientFactory: () => makeFakeClient({ list_projects: { projects: [] } }, calls) as never,
    });
    await c.connect();
    const r = await c.callRaw('list_projects', { limit: 10 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'list_projects');
    assert.deepEqual(calls[0].args, { limit: 10 });
    assert.equal(r.isError, false);
  });

  test('callRaw on write tool throws WRITE_TOOL_NOT_ENABLED before reaching transport', async () => {
    const calls: CallRecord[] = [];
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport({}),
      clientFactory: () => makeFakeClient({}, calls) as never,
    });
    await c.connect();
    await assert.rejects(
      c.callRaw('delete_project', { projectId: 'p1' }),
      /WRITE_TOOL_NOT_ENABLED/,
    );
    await assert.rejects(c.callRaw('write_file', { path: '/x', content: 'y' }), /WRITE_TOOL_NOT_ENABLED/);
    await assert.rejects(c.callRaw('create_artifact', {}), /WRITE_TOOL_NOT_ENABLED/);
    assert.equal(calls.length, 0, 'no write call should have reached the transport');
  });

  test('callRaw surfaces isError content via thrown error message', async () => {
    const calls: CallRecord[] = [];
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport({}),
      clientFactory: () =>
        makeFakeClient({ list_files: 'permission denied' }, calls, {
          isError: new Set(['list_files']),
        }) as never,
    });
    await c.connect();
    await assert.rejects(c.callRaw('list_files', {}), /isError=true/);
  });

  test('disconnect tears down + capabilities cleared; subsequent isConnected=false', async () => {
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport({}),
      clientFactory: () => makeFakeClient({}, []) as never,
    });
    await c.connect();
    assert.equal(c.isConnected(), true);
    await c.disconnect();
    assert.equal(c.isConnected(), false);
    assert.equal(c.getCapabilities().size, 0);
  });

  test('transport.onclose teardown resets state', async () => {
    const captured: TransportCaptured = {};
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport(captured),
      clientFactory: () => makeFakeClient({}, []) as never,
    });
    await c.connect();
    assert.equal(c.isConnected(), true);
    assert.equal(typeof captured.onclose, 'function');
    captured.onclose!();
    assert.equal(c.isConnected(), false);
    assert.equal(c.getCapabilities().size, 0);
  });

  test('disconnect tolerates client.close() throwing', async () => {
    const c = new OpenDesignMcpClient({
      command: 'od',
      cwd: '/tmp',
      transportFactory: makeFakeTransport({}),
      clientFactory: () => makeFakeClient({}, [], { failClose: true }) as never,
    });
    await c.connect();
    await c.disconnect();
    assert.equal(c.isConnected(), false);
  });
});
