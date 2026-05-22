// Plan docs/plan-qor-bicameral-mcp-integration.md Phase 3 Unit Tests called
// out three activation-time cases. Phase 3 polish moved the wiring logic into
// `bootstrapBicameral.ts` (helper module); these tests exercise it directly
// against a fake VS Code config + a fake ConsoleServer surface so we can
// observe the wiring decisions without booting a real extension host.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';

import { wireBicameralIntegration, maybeAutoConnectBicameral } from '../../extension/bootstrapBicameral';
import type { BicameralMcpClient } from '../../integrations/bicameral';

interface ServerCalls {
  setCommand: string[];
  setClient: Array<BicameralMcpClient | null>;
  setAutoConnect: boolean[];
  setAutoConnectWriter: number;
  broadcasts: Array<Record<string, unknown>>;
}

function fakeServer(): { server: any; calls: ServerCalls } {
  const calls: ServerCalls = {
    setCommand: [], setClient: [], setAutoConnect: [],
    setAutoConnectWriter: 0, broadcasts: [],
  };
  let currentClient: BicameralMcpClient | null = null;
  const server = {
    setBicameralCommand(cmd: string) { calls.setCommand.push(cmd); },
    setBicameralClient(c: BicameralMcpClient | null) {
      calls.setClient.push(c);
      currentClient = c;
    },
    // B-BIC-2: typed accessor for the lazily-wired client.
    getBicameralClient() { return currentClient; },
    setBicameralAutoConnect(v: boolean) { calls.setAutoConnect.push(v); },
    setBicameralAutoConnectWriter() { calls.setAutoConnectWriter += 1; },
    broadcastEvent(d: Record<string, unknown>) { calls.broadcasts.push(d); },
  };
  return { server, calls };
}

function fakeContext(): vscode.ExtensionContext {
  return { subscriptions: [] as { dispose: () => void }[] } as unknown as vscode.ExtensionContext;
}

function patchConfig(values: Record<string, unknown>): () => void {
  const original = vscode.workspace.getConfiguration;
  (vscode.workspace as unknown as { getConfiguration: any }).getConfiguration = (_section?: string) => ({
    get: <T>(key: string, defaultValue?: T) => (key in values ? values[key] as T : defaultValue),
    update: async () => {},
  });
  return () => { (vscode.workspace as unknown as { getConfiguration: any }).getConfiguration = original; };
}

function patchOnDidChangeConfig(): () => void {
  const original = vscode.workspace.onDidChangeConfiguration;
  (vscode.workspace as unknown as { onDidChangeConfiguration: any }).onDidChangeConfiguration = () => ({
    dispose: () => {},
  });
  return () => { (vscode.workspace as unknown as { onDidChangeConfiguration: any }).onDidChangeConfiguration = original; };
}

suite('bootstrapBicameral — wireBicameralIntegration', () => {

  test('extension wires without throwing when bicameral-mcp is not installed (default command)', async () => {
    const restoreConfig = patchConfig({});
    const restoreWatch = patchOnDidChangeConfig();
    try {
      const { server, calls } = fakeServer();
      assert.doesNotThrow(() => wireBicameralIntegration(fakeContext(), server, '/tmp/ws'));
      // wireFromConfig validates the command via the async symlink-resolving
      // validator (B-BIC-6) — let that fire-and-forget microtask settle.
      await new Promise((r) => setTimeout(r, 25));
      // Default command set + a client constructed (lazy — no connect).
      assert.strictEqual(calls.setCommand[0], 'bicameral-mcp');
      assert.strictEqual(calls.setClient.length, 1);
      assert.ok(calls.setClient[0], 'BicameralMcpClient constructed but not connected');
      assert.strictEqual(calls.setAutoConnect[0], false);
      assert.strictEqual(calls.setAutoConnectWriter, 1, 'writer registered exactly once');
    } finally {
      restoreWatch();
      restoreConfig();
    }
  });

  test('wireBicameralIntegration is lazy — does NOT call client.connect at activation', async () => {
    const restoreConfig = patchConfig({});
    const restoreWatch = patchOnDidChangeConfig();
    try {
      const { server, calls } = fakeServer();
      wireBicameralIntegration(fakeContext(), server, '/tmp/ws');
      // Async command validation (B-BIC-6) — settle before reading setClient.
      await new Promise((r) => setTimeout(r, 25));
      const client = calls.setClient[0]! as { isConnected: () => boolean };
      assert.strictEqual(client.isConnected(), false, 'must not auto-connect at activate time');
    } finally {
      restoreWatch();
      restoreConfig();
    }
  });

  test('unsafe command (path traversal) sets client to null without throwing', async () => {
    const restoreConfig = patchConfig({ command: '../../../etc/passwd' });
    const restoreWatch = patchOnDidChangeConfig();
    try {
      const { server, calls } = fakeServer();
      assert.doesNotThrow(() => wireBicameralIntegration(fakeContext(), server, '/tmp/ws'));
      // Async command validation (B-BIC-6) — settle before asserting.
      await new Promise((r) => setTimeout(r, 25));
      // Spawn-boundary validator rejects → command falls back to default, client = null.
      assert.strictEqual(calls.setCommand[0], 'bicameral-mcp');
      assert.strictEqual(calls.setClient[0], null);
    } finally {
      restoreWatch();
      restoreConfig();
    }
  });

  test('maybeAutoConnectBicameral is a no-op when autoConnect=false (default)', async () => {
    const restoreConfig = patchConfig({});
    try {
      const { server, calls } = fakeServer();
      const messages: string[] = [];
      maybeAutoConnectBicameral(server, '/tmp/ws', { appendLine: (m) => messages.push(m) });
      // Allow the IIFE to flush.
      await new Promise((r) => setTimeout(r, 30));
      assert.deepStrictEqual(calls.broadcasts, [], 'no bicameral.connected broadcast when autoConnect=false');
      assert.deepStrictEqual(calls.setClient, [], 'no client mutation when autoConnect=false');
      assert.deepStrictEqual(messages, [], 'output channel quiet when autoConnect=false');
    } finally {
      restoreConfig();
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // FX515 — B-BIC-2: disposer registration + rewire cleanup.
  // ────────────────────────────────────────────────────────────────────

  test('FX515 wireBicameralIntegration pushes a context.subscriptions disposer that disconnects the client', async () => {
    const restoreConfig = patchConfig({ command: 'bicameral-mcp', autoConnect: false });
    const restoreOnChange = patchOnDidChangeConfig();
    try {
      const { server, calls } = fakeServer();
      const context = fakeContext();
      wireBicameralIntegration(context, server, '/tmp/ws');
      // After wiring: subscriptions array contains the onDidChangeConfiguration
      // listener (1) + the disconnect disposer (2). Find the disposer (the one
      // without a `.dispose()`-only shape — both have it; identify by side effect.
      // Replace the wired client with a fake that records disconnect calls.
      const disconnectCalls: number[] = [];
      const fakeClient = {
        disconnect: async () => { disconnectCalls.push(1); },
      } as unknown as BicameralMcpClient;
      server.setBicameralClient(fakeClient);
      // Dispose every subscription; the disposer that captures `getBicameralClient`
      // will trigger disconnect.
      for (const sub of (context as unknown as { subscriptions: { dispose: () => void }[] }).subscriptions) {
        sub.dispose();
      }
      // Allow void-catch microtask flush
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(disconnectCalls.length, 1, 'disposer should have invoked client.disconnect once');
      // Sanity: wiring also pushed setClient calls
      assert.ok(calls.setClient.length >= 1);
    } finally {
      restoreOnChange();
      restoreConfig();
    }
  });

  test('FX515 wireFromConfig calls disconnect on the prior client before assigning a new one', async () => {
    const restoreConfig = patchConfig({ command: 'bicameral-mcp', autoConnect: false });
    const restoreOnChange = patchOnDidChangeConfig();
    try {
      const { server } = fakeServer();
      const context = fakeContext();
      wireBicameralIntegration(context, server, '/tmp/ws');
      // After initial wireFromConfig, replace current client with a fake we can observe.
      const disconnectCalls: number[] = [];
      const priorFake = {
        disconnect: async () => { disconnectCalls.push(1); },
      } as unknown as BicameralMcpClient;
      server.setBicameralClient(priorFake);
      // Now simulate a config-change rewire by calling wireBicameralIntegration's
      // internal flow indirectly: invoking the function again replaces the client
      // and should disconnect the prior one.
      wireBicameralIntegration(context, server, '/tmp/ws');
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(disconnectCalls.length, 1, 'prior client should have been disconnected during rewire');
    } finally {
      restoreOnChange();
      restoreConfig();
    }
  });
});
