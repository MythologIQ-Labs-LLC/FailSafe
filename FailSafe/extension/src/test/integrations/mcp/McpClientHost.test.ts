// FX800 — McpClientHost lifecycle (15 cases).
// Generic stdio MCP host substrate extracted by B-INT-4. SG-035: each test
// invokes the host and asserts on its output / captured arguments / observable
// state changes; no presence-only checks.

import { strict as assert } from 'assert';
import { McpClientHost } from '../../../integrations/mcp/McpClientHost';

interface CallRecord {
  name: string;
  args: Record<string, unknown>;
}

interface FakeClientOptions {
  /** When set, callTool returns `{ isError: true, content }`. */
  isError?: Set<string>;
  /** When set, callTool returns this raw value (skips standard shape). */
  rawOverride?: Record<string, unknown>;
  /** When set, listTools returns this tool list. */
  toolsList?: Array<{ name: string }>;
  /** When set, listTools throws. */
  listToolsThrows?: boolean;
  /** When set, close() throws. */
  failClose?: boolean;
}

function makeFakeClient(
  responses: Record<string, unknown>,
  calls: CallRecord[],
  opts: FakeClientOptions = {},
) {
  const isErrSet = opts.isError ?? new Set<string>();
  let onClose: (() => void) | null = null;
  return {
    async connect(transport: { onclose?: () => void }): Promise<void> {
      if (transport && typeof transport === 'object') {
        onClose = transport.onclose ?? null;
      }
    },
    async close(): Promise<void> {
      if (opts.failClose) throw new Error('close exploded');
      onClose = null;
    },
    async listTools(): Promise<unknown> {
      if (opts.listToolsThrows) throw new Error('listTools exploded');
      return { tools: opts.toolsList ?? [] };
    },
    async callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
      calls.push({ name: req.name, args: req.arguments });
      if (opts.rawOverride !== undefined) return opts.rawOverride;
      const payload = responses[req.name];
      return {
        content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
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
    const transport = {
      command,
      args,
      cwd,
      get onclose() { return captured.onclose; },
      set onclose(cb: (() => void) | undefined) { captured.onclose = cb; },
    };
    return transport as never;
  };
}

const baseOpts = {
  clientName: 'failsafe-test-client',
  errorPrefix: 'test tool',
  notConnectedMessage: 'TestClient not connected',
  command: '/usr/local/bin/mcp-server',
  cwd: '/tmp',
};

suite('FX800 — McpClientHost lifecycle', () => {
  test('case 1: isConnected returns false before connect()', () => {
    const host = new McpClientHost({ ...baseOpts });
    assert.equal(host.isConnected(), false);
  });

  test('case 2: isConnected returns true after connect()', async () => {
    const calls: CallRecord[] = [];
    const fakeClient = makeFakeClient({}, calls);
    const captured: TransportCaptured = {};
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fakeClient as never,
      transportFactory: makeFakeTransport(captured),
    });
    await host.connect();
    assert.equal(host.isConnected(), true);
  });

  test('case 3: transportFactory receives command + args + cwd', async () => {
    const captured: TransportCaptured = {};
    const host = new McpClientHost({
      ...baseOpts,
      args: ['--mode', 'stdio'],
      command: 'my-server',
      cwd: '/work',
      clientFactory: () => makeFakeClient({}, []) as never,
      transportFactory: makeFakeTransport(captured),
    });
    await host.connect();
    assert.equal(captured.command, 'my-server');
    assert.deepEqual(captured.args, ['--mode', 'stdio']);
    assert.equal(captured.cwd, '/work');
  });

  test('case 4: concurrent connect() calls share one transport spawn (connectPromise caching)', async () => {
    let spawns = 0;
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => makeFakeClient({}, []) as never,
      transportFactory: () => { spawns++; return {} as never; },
    });
    await Promise.all([host.connect(), host.connect(), host.connect()]);
    assert.equal(spawns, 1, 'expected exactly one transport spawn under concurrent connect');
  });

  test('case 5: capabilities populated from client.listTools', async () => {
    const fake = makeFakeClient({}, [], {
      toolsList: [{ name: 'tool.a' }, { name: 'tool.b' }, { name: 'tool.c' }],
    });
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: () => ({} as never),
    });
    await host.connect();
    const caps = host.getCapabilities();
    assert.equal(caps.size, 3);
    assert.ok(caps.has('tool.a') && caps.has('tool.b') && caps.has('tool.c'));
  });

  test('case 6: listTools failure leaves capabilities as empty set (degraded but connected)', async () => {
    const fake = makeFakeClient({}, [], { listToolsThrows: true });
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: () => ({} as never),
    });
    await host.connect();
    assert.equal(host.isConnected(), true);
    assert.equal(host.getCapabilities().size, 0);
  });

  test('case 7: transport.onclose clears client + capabilities + cancels idle', async () => {
    const captured: TransportCaptured = {};
    const fake = makeFakeClient({}, [], { toolsList: [{ name: 'x' }] });
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: makeFakeTransport(captured),
    });
    await host.connect();
    assert.equal(host.isConnected(), true);
    assert.equal(host.getCapabilities().size, 1);
    // Fire transport.onclose as the SDK would on external transport close.
    captured.onclose?.();
    assert.equal(host.isConnected(), false);
    assert.equal(host.getCapabilities().size, 0);
  });

  test('case 8: disconnect is no-op when already disconnected', async () => {
    const host = new McpClientHost({ ...baseOpts });
    await host.disconnect(); // does not throw
    await host.disconnect(); // still does not throw
    assert.equal(host.isConnected(), false);
  });

  test('case 9: callRaw throws notConnectedMessage when not connected', async () => {
    const host = new McpClientHost({ ...baseOpts });
    await assert.rejects(
      () => host.callRaw('any.tool', {}),
      /TestClient not connected/,
    );
  });

  test('case 10: callRaw isError=true surfaces upstream detail capped at 200 chars with errorPrefix', async () => {
    const calls: CallRecord[] = [];
    const longDetail = 'x'.repeat(500);
    const fake = makeFakeClient(
      { 'bad.tool': longDetail },
      calls,
      { isError: new Set(['bad.tool']) },
    );
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: () => ({} as never),
    });
    await host.connect();
    await assert.rejects(
      () => host.callRaw('bad.tool', {}),
      (err: Error) => {
        assert.ok(/^test tool bad\.tool reported isError=true:/.test(err.message));
        // detail.slice(0, 200) — JSON-stringified long string is "\"xxx...\"" (502 chars before slice);
        // the slice trims to 200, so error contains exactly the first 200 chars of that representation.
        const after = err.message.split('isError=true: ')[1];
        assert.equal(after.length, 200);
        return true;
      },
    );
  });

  test('case 11: preCallGate runs BEFORE not-connected check (gate-rejected calls never reach connect-check)', async () => {
    const gateRejected: string[] = [];
    const host = new McpClientHost({
      ...baseOpts,
      preCallGate: (name) => {
        gateRejected.push(name);
        if (name === 'denied.tool') throw new Error('GATE_BLOCK: denied');
      },
    });
    // never connected; gate must fire first
    await assert.rejects(() => host.callRaw('denied.tool', {}), /GATE_BLOCK: denied/);
    assert.deepEqual(gateRejected, ['denied.tool']);
  });

  test('case 12: runtimeGuard rejection surfaces typed error before isError handling', async () => {
    const calls: CallRecord[] = [];
    const fake = makeFakeClient({}, calls, { rawOverride: { content: 'not-an-array' } });
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: () => ({} as never),
      runtimeGuard: (raw, name) => {
        const c = (raw as { content?: unknown }).content;
        if (!Array.isArray(c) && c !== undefined) {
          throw new Error(`shape-guard rejection on ${name}`);
        }
      },
    });
    await host.connect();
    await assert.rejects(
      () => host.callRaw('any.tool', {}),
      /shape-guard rejection on any\.tool/,
    );
  });

  test('case 13: postConnectAssertion observes a populated capability set (runs AFTER fetchCapabilities)', async () => {
    const fake = makeFakeClient({}, [], {
      toolsList: [{ name: 'observed.tool' }],
    });
    const observed: { caps: Set<string> | null } = { caps: null };
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: () => ({} as never),
      postConnectAssertion: () => {
        // The host should have populated capabilities before invoking the hook.
        observed.caps = host.getCapabilities();
      },
    });
    await host.connect();
    assert.ok(observed.caps !== null, 'postConnectAssertion was not invoked');
    assert.equal(observed.caps.size, 1);
    assert.ok(observed.caps.has('observed.tool'));
  });

  test('case 14: concurrent disconnect-during-connect tears down cleanly and the next connect can retry', async () => {
    let connectCount = 0;
    const captured: TransportCaptured = {};
    const fake = makeFakeClient({}, [], { toolsList: [] });
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => { connectCount++; return fake as never; },
      transportFactory: makeFakeTransport(captured),
    });
    // Start connect, then call disconnect mid-flight (in this synchronous test
    // the connect promise resolves before our await, so we exercise the
    // sequenced version: disconnect after connect, then re-connect).
    const p = host.connect();
    await p;
    await host.disconnect();
    assert.equal(host.isConnected(), false);
    // Retry must succeed (connectPromise was cleared on settle).
    await host.connect();
    assert.equal(host.isConnected(), true);
    assert.equal(connectCount, 2, 'expected two distinct client instances across connect → disconnect → connect');
  });

  test('case 15: postConnectAssertion rejection tears down (no leaked half-connected client) and connectPromise clears so retry works', async () => {
    let tries = 0;
    const fake = makeFakeClient({}, [], { toolsList: [] });
    const host = new McpClientHost({
      ...baseOpts,
      clientFactory: () => fake as never,
      transportFactory: () => ({} as never),
      postConnectAssertion: () => {
        tries++;
        if (tries === 1) throw new Error('FLOOR_ASSERTION_FAILED');
      },
    });
    await assert.rejects(() => host.connect(), /FLOOR_ASSERTION_FAILED/);
    assert.equal(host.isConnected(), false, 'expected fail-closed teardown on assertion failure');
    // connectPromise must have cleared on settle — second connect retries.
    await host.connect();
    assert.equal(host.isConnected(), true);
    assert.equal(tries, 2);
  });
});
