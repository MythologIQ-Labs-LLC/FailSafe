// Plan docs/plan-qor-bicameral-mcp-integration.md Phase 3 Unit Tests called
// out three activation-time cases. Phase 3 polish moved the wiring logic into
// `bootstrapBicameral.ts` (helper module); these tests exercise it directly
// against a fake VS Code config + a fake ConsoleServer surface so we can
// observe the wiring decisions without booting a real extension host.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { wireBicameralIntegration, maybeAutoConnectBicameral } from '../../extension/bootstrapBicameral';
import { BicameralMcpClient } from '../../integrations/bicameral';
import { configureTrustedExecutables, repoRootsFor, workspaceDirsFor } from '../../shared/exec/trustedExecutable';

interface ServerCalls {
  setCommand: string[];
  setClient: Array<BicameralMcpClient | null>;
  setAutoConnect: boolean[];
  setAutoConnectWriter: number;
  broadcasts: Array<Record<string, unknown>>;
  rewire?: () => Promise<void>;
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
    setBicameralRewire(fn: () => Promise<void>) { calls.rewire = fn; },
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
    // LD15 reads the command and auto-connect from the user level only.
    inspect: <T>(key: string) => ({ key, globalValue: key in values ? values[key] as T : undefined }),
    update: async () => {},
  });
  return () => { (vscode.workspace as unknown as { getConfiguration: any }).getConfiguration = original; };
}

/** The resolver configuration activation sets, rebuilt from the open folders. */
function restoreActivationConfig(): void {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const dirs = workspaceDirsFor(folders[0], folders);
  configureTrustedExecutables({ workspaceDirs: [...dirs, ...repoRootsFor(dirs, os.homedir())] });
}

/**
 * LD14 (d): a real workspace folder and an explicit PATH seam, so the result
 * never depends on what this host has installed. "Installed" is an inert file
 * outside the workspace; the client is lazy, so it is never started.
 */
function bicameralFixture(installed: boolean): { ws: string; bin?: string; install: () => string; restore: () => void } {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'fsbic-act-ws-'));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsbic-act-bin-'));
  const install = (): string => {
    const bin = path.join(binDir, process.platform === 'win32' ? 'bicameral-mcp.exe' : 'bicameral-mcp');
    fs.writeFileSync(bin, 'inert\n');
    fs.chmodSync(bin, 0o755);
    configureTrustedExecutables({ workspaceDirs: [ws], pathEnv: binDir, knownLocations: [] });
    return fs.realpathSync.native(bin);
  };
  configureTrustedExecutables({ workspaceDirs: [ws], pathEnv: '', knownLocations: [] });
  const bin = installed ? install() : undefined;
  return {
    ws, bin, install,
    restore: () => {
      restoreActivationConfig();
      for (const d of [ws, binDir]) fs.rmSync(d, { recursive: true, force: true });
    },
  };
}

async function until(done: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!done() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
}

const commandOf = (c: unknown): string => (c as { opts: { command: string } }).opts.command;

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
    const fx = bicameralFixture(false);
    try {
      const { server, calls } = fakeServer();
      assert.doesNotThrow(() => wireBicameralIntegration(fakeContext(), server, fx.ws));
      // wireFromConfig validates the command via the async symlink-resolving
      // validator (B-BIC-6) — let that fire-and-forget microtask settle.
      await until(() => calls.setClient.length > 0);
      // LD14 (c): an unresolved command gives no client and the default command.
      assert.strictEqual(calls.setCommand[0], 'bicameral-mcp');
      assert.deepStrictEqual(calls.setClient, [null], 'no client for a command that does not resolve');
      assert.strictEqual(calls.setAutoConnect[0], false);
      assert.strictEqual(calls.setAutoConnectWriter, 1, 'writer registered exactly once');
    } finally {
      fx.restore();
      restoreWatch();
      restoreConfig();
    }
  });

  test('wireBicameralIntegration is lazy — does NOT call client.connect at activation', async () => {
    const restoreConfig = patchConfig({});
    const restoreWatch = patchOnDidChangeConfig();
    const fx = bicameralFixture(true);
    try {
      const { server, calls } = fakeServer();
      wireBicameralIntegration(fakeContext(), server, fx.ws);
      // Async command validation (B-BIC-6) — settle before reading setClient.
      await until(() => calls.setClient.length > 0);
      const client = calls.setClient[0];
      assert.ok(client, 'a resolved command gives a client');
      assert.strictEqual(commandOf(client), fx.bin, 'built with the resolved absolute path');
      assert.strictEqual(client.isConnected(), false, 'must not auto-connect at activate time');
    } finally {
      fx.restore();
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

  // ────────────────────────────────────────────────────────────────────
  // LD16: overlapping rewires, and the rewire hook the install route uses.
  // ────────────────────────────────────────────────────────────────────

  test('LD16 (a) two overlapping rewires leave exactly one client not disconnected', async () => {
    const restoreConfig = patchConfig({});
    const restoreOnChange = patchOnDidChangeConfig();
    const fx = bicameralFixture(true);
    const proto = BicameralMcpClient.prototype as unknown as { disconnect: () => Promise<void> };
    const own = Object.prototype.hasOwnProperty.call(proto, 'disconnect');
    const original = proto.disconnect;
    const disconnected = new Set<unknown>();
    proto.disconnect = async function (this: unknown) { disconnected.add(this); };
    try {
      const { server, calls } = fakeServer();
      const context = fakeContext();
      // The second rewire starts while the first is still awaiting its validation.
      wireBicameralIntegration(context, server, fx.ws);
      wireBicameralIntegration(context, server, fx.ws);
      await until(() => calls.setClient.length >= 2, 500);
      const clients = calls.setClient.filter((c): c is BicameralMcpClient => c !== null);
      assert.ok(clients.length >= 1, 'a client was wired');
      const live = clients.filter((c) => !disconnected.has(c));
      assert.equal(live.length, 1, `exactly one client left running, saw ${live.length} of ${clients.length}`);
      assert.strictEqual(live[0], server.getBicameralClient(), 'and it is the current one');
    } finally {
      if (own) proto.disconnect = original; else delete (proto as { disconnect?: unknown }).disconnect;
      fx.restore();
      restoreOnChange();
      restoreConfig();
    }
  });

  test('LD16 (a) a client assigned while a rewire awaits is the one that rewire disconnects', async () => {
    const restoreConfig = patchConfig({});
    const restoreOnChange = patchOnDidChangeConfig();
    const fx = bicameralFixture(true);
    try {
      const { server, calls } = fakeServer();
      wireBicameralIntegration(fakeContext(), server, fx.ws);
      // As auto-connect does, assign a client while the rewire is still awaiting its validation.
      let disconnects = 0;
      server.setBicameralClient({ disconnect: async () => { disconnects++; } } as unknown as BicameralMcpClient);
      await until(() => calls.setClient.length >= 2);
      assert.strictEqual(commandOf(server.getBicameralClient()), fx.bin, 'the rewire assigned its client');
      assert.equal(disconnects, 1, 'and disconnected the client it replaced');
    } finally {
      fx.restore();
      restoreOnChange();
      restoreConfig();
    }
  });

  test('LD16 (b) the rewire hook picks up an install made after activation and catches its own error', async () => {
    const restoreConfig = patchConfig({});
    const restoreOnChange = patchOnDidChangeConfig();
    const fx = bicameralFixture(false);
    try {
      const { server, calls } = fakeServer();
      wireBicameralIntegration(fakeContext(), server, fx.ws);
      await until(() => calls.setClient.length > 0);
      assert.deepStrictEqual(calls.setClient, [null], 'not installed at activation');
      assert.equal(typeof calls.rewire, 'function', 'the server holds a rewire hook');
      const bin = fx.install();
      await calls.rewire!();
      assert.strictEqual(commandOf(server.getBicameralClient()), bin, 'the hook wires the newly installed command');
      const broken = vscode.workspace.getConfiguration;
      (vscode.workspace as unknown as { getConfiguration: any }).getConfiguration = () => { throw new Error('config unavailable'); };
      try {
        await calls.rewire!(); // must resolve: the install route never answers 500 because of it
      } finally {
        (vscode.workspace as unknown as { getConfiguration: any }).getConfiguration = broken;
      }
    } finally {
      fx.restore();
      restoreOnChange();
      restoreConfig();
    }
  });
});
