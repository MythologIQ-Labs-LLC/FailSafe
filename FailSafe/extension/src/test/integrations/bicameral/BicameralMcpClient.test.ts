// Functional tests for BicameralMcpClient. SG-035: each test invokes the
// unit and asserts on its output / captured arguments.

import { strict as assert } from 'assert';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';

interface CallRecord {
  name: string;
  args: Record<string, unknown>;
}

function makeFakeClient(
  responses: Record<string, unknown>,
  calls: CallRecord[],
  opts: { failClose?: boolean; isError?: Set<string> } = {},
) {
  const isErrSet = opts.isError ?? new Set<string>();
  return {
    async connect(_transport: unknown): Promise<void> { /* noop */ },
    async close(): Promise<void> {
      if (opts.failClose) throw new Error('close exploded');
    },
    async callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
      calls.push({ name: req.name, args: req.arguments });
      const payload = responses[req.name];
      return {
        content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
        isError: isErrSet.has(req.name),
      };
    },
  };
}

function makeFakeTransport(captured: { command?: string; args?: string[]; cwd?: string }) {
  return (command: string, args: string[], cwd: string) => {
    captured.command = command;
    captured.args = args;
    captured.cwd = cwd;
    return {} as never;
  };
}

suite('integrations/bicameral BicameralMcpClient', () => {
  test('isConnected returns false before connect()', () => {
    const client = new BicameralMcpClient({ command: 'bicameral-mcp', cwd: '/tmp' });
    assert.equal(client.isConnected(), false);
  });

  test('history throws when called before connect()', async () => {
    const client = new BicameralMcpClient({ command: 'bicameral-mcp', cwd: '/tmp' });
    await assert.rejects(client.history(), /not connected/);
  });

  test('preflight throws when called before connect()', async () => {
    const client = new BicameralMcpClient({ command: 'bicameral-mcp', cwd: '/tmp' });
    await assert.rejects(client.preflight('foo.ts'), /not connected/);
  });

  test('connect passes command/args/cwd to the transport factory', async () => {
    const captured: { command?: string; args?: string[]; cwd?: string } = {};
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: '/home/user/bin/bicameral-mcp',
      args: ['--verbose'],
      cwd: '/repo',
      transportFactory: makeFakeTransport(captured),
      clientFactory: () => makeFakeClient({}, calls) as never,
    });
    await client.connect();
    assert.equal(captured.command, '/home/user/bin/bicameral-mcp');
    assert.deepEqual(captured.args, ['--verbose']);
    assert.equal(captured.cwd, '/repo');
    assert.equal(client.isConnected(), true);
  });

  test('connect is idempotent — second call does not re-initialize', async () => {
    let factoryCalls = 0;
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => { factoryCalls += 1; return makeFakeClient({}, calls) as never; },
    });
    await client.connect();
    await client.connect();
    assert.equal(factoryCalls, 1);
  });

  test('history calls tools/call with name=bicameral.history and parses feature briefs', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient({
        'bicameral.history': {
          features: [
            { feature: 'auth', decisions: [{ id: 'd1', title: 'idempotency', source: 's', status: 'in-sync', bindings: [] }] },
            { feature: 'payments', decisions: [] },
          ],
        },
      }, calls) as never,
    });
    await client.connect();
    const briefs = await client.history();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'bicameral.history');
    assert.deepEqual(calls[0].args, {});
    assert.equal(briefs.length, 2);
    assert.equal(briefs[0].feature, 'auth');
    assert.equal(briefs[0].decisions[0].id, 'd1');
  });

  test('history returns empty array on malformed payload (defensive)', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient({ 'bicameral.history': 'not-json' }, calls) as never,
    });
    await client.connect();
    const briefs = await client.history();
    assert.deepEqual(briefs, []);
  });

  test('preflight passes filePath in arguments.file', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient({
        'bicameral.preflight': { prior_decisions: [], drifted: [], open_questions: [] },
      }, calls) as never,
    });
    await client.connect();
    await client.preflight('src/middleware/idempotency.ts');
    assert.equal(calls[0].name, 'bicameral.preflight');
    assert.equal(calls[0].args.file, 'src/middleware/idempotency.ts');
  });

  test('drift passes filePath in arguments.file_path', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient({
        'bicameral.drift': { drift: [{ decisionId: 'd1', filePath: 'x.ts', status: 'drifted' }] },
      }, calls) as never,
    });
    await client.connect();
    const drifts = await client.drift('x.ts');
    assert.equal(calls[0].name, 'bicameral.drift');
    assert.equal(calls[0].args.file_path, 'x.ts');
    assert.equal(drifts.length, 1);
    assert.equal(drifts[0].status, 'drifted');
  });

  test('ratify passes decision_id and verdict', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient({ 'bicameral.ratify': {} }, calls) as never,
    });
    await client.connect();
    await client.ratify('decision-123', 'ratify');
    assert.equal(calls[0].name, 'bicameral.ratify');
    assert.equal(calls[0].args.decision_id, 'decision-123');
    assert.equal(calls[0].args.verdict, 'ratify');
  });

  test('throws when MCP server returns isError=true', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient(
        { 'bicameral.history': {} },
        calls,
        { isError: new Set(['bicameral.history']) },
      ) as never,
    });
    await client.connect();
    await assert.rejects(client.history(), /isError=true/);
  });

  test('disconnect is idempotent when not connected', async () => {
    const client = new BicameralMcpClient({ command: 'bicameral-mcp', cwd: '/tmp' });
    await assert.doesNotReject(client.disconnect());
    await assert.doesNotReject(client.disconnect());
  });

  test('disconnect swallows close() errors', async () => {
    const calls: CallRecord[] = [];
    const client = new BicameralMcpClient({
      command: 'bicameral-mcp',
      cwd: '/tmp',
      transportFactory: () => ({} as never),
      clientFactory: () => makeFakeClient({}, calls, { failClose: true }) as never,
    });
    await client.connect();
    await assert.doesNotReject(client.disconnect());
    assert.equal(client.isConnected(), false);
  });
});
