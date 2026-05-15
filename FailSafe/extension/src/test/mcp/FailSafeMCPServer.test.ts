// Functional tests for FailSafeMCPServer (FX144 + FX392-FX395).
// Replaces the prior `FailSafeServer.test.ts` which was presence-only (it
// constructed a local mock object and asserted on the mock's own return
// value, never invoking FailSafeMCPServer).
//
// Strategy: construct the real server with mock services, then exercise the
// internal validateIntent + isPathSafe gates via cast, plus capture the
// tool-registration calls via a McpServer.tool spy. This gives us:
//   - Constructor + registerTools execution path (smoke)
//   - Tool name + schema verification (presence at the right level — the
//     registrar IS the contract here)
//   - validateIntent + isPathSafe behavior (the security gates the tool
//     handlers compose with)

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { FailSafeMCPServer } from '../../mcp/FailSafeServer';

interface ToolRegistration {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

interface MockIntent { id: string; status: string; }

function makeMocks(activeIntent: MockIntent | null = null) {
  const sentinel: any = {
    auditFile: async (filePath: string) => ({
      decision: 'PASS', summary: `audited ${filePath}`, matchedPatterns: [],
    }),
  };
  const ledger: any = {
    appendEntry: async (entry: Record<string, unknown>) => ({
      id: 42, entryHash: 'sha256:test-hash', ...entry,
    }),
  };
  const intentService: any = {
    getActiveIntent: async () => activeIntent,
  };
  const sessionManager: any = {
    getState: () => ({ isLocked: false }),
  };
  const fakeContext = {} as vscode.ExtensionContext;
  return { fakeContext, sentinel, ledger, intentService, sessionManager };
}

function captureTools(server: FailSafeMCPServer): ToolRegistration[] {
  // Access the bound toolRegistrar via cast and replay the registerTools flow
  // against a capturing replacement. Real McpServer has already received the
  // registrations during construction; we re-run against our spy to inspect.
  const registrations: ToolRegistration[] = [];
  const captureRegistrar = (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>,
  ) => {
    registrations.push({ name, description, schema, handler });
  };
  // Replace toolRegistrar and re-invoke registerTools via cast.
  (server as unknown as { toolRegistrar: typeof captureRegistrar }).toolRegistrar = captureRegistrar;
  // Also override server.tool to capture the third (qorelogic_status) tool which
  // bypasses toolRegistrar in the source.
  const origTool = (server as unknown as { server: { tool: (...args: unknown[]) => unknown } }).server.tool;
  (server as unknown as { server: { tool: typeof captureRegistrar } }).server.tool = captureRegistrar;
  try {
    (server as unknown as { registerTools: () => void }).registerTools();
  } finally {
    (server as unknown as { server: { tool: typeof origTool } }).server.tool = origTool;
  }
  return registrations;
}

suite('FailSafeMCPServer (FX144, FX392-FX395)', () => {
  test('FX144 constructor — registers without throwing when given valid services', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    assert.doesNotThrow(() => {
      new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    });
  });

  test('FX392-FX395 server registers exactly 3 tools with expected names', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const tools = captureTools(server);
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['ledger_log_decision', 'qorelogic_status', 'sentinel_audit_file']);
  });

  test('FX393 sentinel_audit_file tool — schema declares path + intent_id', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const tools = captureTools(server);
    const auditTool = tools.find((t) => t.name === 'sentinel_audit_file');
    assert.ok(auditTool, 'sentinel_audit_file tool should be registered');
    assert.ok('path' in auditTool!.schema, 'schema should declare path');
    assert.ok('intent_id' in auditTool!.schema, 'schema should declare intent_id');
  });

  test('FX394 ledger_log_decision tool — schema declares decision/rationale/risk_grade/intent_id', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const tools = captureTools(server);
    const tool = tools.find((t) => t.name === 'ledger_log_decision');
    assert.ok(tool);
    for (const k of ['decision', 'rationale', 'risk_grade', 'intent_id']) {
      assert.ok(k in tool!.schema, `schema should declare ${k}`);
    }
  });

  test('FX395 qorelogic_status tool — empty schema (no args required)', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const tools = captureTools(server);
    const tool = tools.find((t) => t.name === 'qorelogic_status');
    assert.ok(tool);
    assert.equal(Object.keys(tool!.schema).length, 0, 'qorelogic_status accepts no arguments');
  });

  test('FX395 qorelogic_status handler — returns governance status JSON with locked flag from sessionManager', async () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks(
      { id: 'intent-active', status: 'PASS' },
    );
    sessionManager.getState = () => ({ isLocked: true });
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const tools = captureTools(server);
    const handler = tools.find((t) => t.name === 'qorelogic_status')!.handler;
    const result = await handler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.status, 'ACTIVE');
    assert.equal(parsed.locked, true);
    assert.equal(parsed.active_intent, 'intent-active');
  });

  test('FX395 qorelogic_status handler — null active_intent when no intent active', async () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks(null);
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const tools = captureTools(server);
    const handler = tools.find((t) => t.name === 'qorelogic_status')!.handler;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.active_intent, null);
  });

  test('FX395 qorelogic_status handler — defaults locked=false when sessionManager is undefined', async () => {
    const { fakeContext, sentinel, ledger, intentService } = makeMocks(null);
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, undefined);
    const tools = captureTools(server);
    const handler = tools.find((t) => t.name === 'qorelogic_status')!.handler;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.locked, false);
  });

  test('validateIntent — throws when no active intent matches given id', async () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks(null);
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const validate = (server as unknown as { validateIntent: (id: string) => Promise<void> }).validateIntent.bind(server);
    await assert.rejects(() => validate('any-id'), /MCP Access Denied/);
  });

  test('validateIntent — throws when active intent id does not match', async () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks(
      { id: 'real-intent', status: 'PASS' },
    );
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const validate = (server as unknown as { validateIntent: (id: string) => Promise<void> }).validateIntent.bind(server);
    await assert.rejects(() => validate('wrong-intent'), /MCP Access Denied/);
  });

  test('validateIntent — resolves when active intent id matches', async () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks(
      { id: 'real-intent', status: 'PASS' },
    );
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const validate = (server as unknown as { validateIntent: (id: string) => Promise<void> }).validateIntent.bind(server);
    await assert.doesNotReject(() => validate('real-intent'));
  });

  test('isPathSafe — relative paths are rejected', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const isPathSafe = (server as unknown as { isPathSafe: (p: string) => boolean }).isPathSafe.bind(server);
    assert.equal(isPathSafe('relative/path/file.ts'), false);
    assert.equal(isPathSafe('./file.ts'), false);
    assert.equal(isPathSafe(''), false);
  });

  test('isPathSafe — absolute paths outside workspace are rejected', () => {
    const { fakeContext, sentinel, ledger, intentService, sessionManager } = makeMocks();
    const server = new FailSafeMCPServer(fakeContext, sentinel, ledger, intentService, sessionManager);
    const isPathSafe = (server as unknown as { isPathSafe: (p: string) => boolean }).isPathSafe.bind(server);
    // Outside any open workspace folder
    assert.equal(isPathSafe('/totally/not/in/workspace.ts'), false);
  });
});
