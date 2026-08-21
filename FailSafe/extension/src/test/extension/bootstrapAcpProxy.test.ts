// FailSafe#398 — bootstrapAcpProxy ACP registry drift-check tests.
//
// Runs under the real vscode-test extension host (compiled to
// out/test/**/*.test.js, picked up by .vscode-test.mjs's glob, mocha 'tdd'
// ui) rather than a require.cache-stubbed fake vscode module. A prior
// .test.cjs version of this suite ran standalone via `node --test` but was
// never compiled into out/ (copy-ui-js.cjs only mirrors .js, tsc has no
// allowJs) and used node:test's describe/it, which the real 'tdd' mocha ui
// would not have registered anyway — so it contributed zero real coverage
// (review finding on PR #399, systemic version tracked in #404).
// vscode.window.show*Message, vscode.window.showQuickPick, and
// vscode.commands.registerCommand are the real module, monkey-patched per
// this repo's existing workspaceFolderChangeGuard.test.ts /
// commands-dispatch.test.ts convention.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { bootstrapAcpProxy, verifyGovernedProxyEntries } from '../../extension/bootstrapAcpProxy';
import type { DevinAgent } from '../../integrations/acp/registry/DevinRegistryWriter';

function buildAgent(name: string, cmd: string): DevinAgent {
  return {
    id: 'failsafe-governed',
    name,
    version: '1.0.0',
    distribution: {
      binary: {
        'linux-x86_64': { archive: '', cmd, args: ['/x/acp-proxy.js', '--', 'real-agent'] },
      },
    },
  };
}

interface FakeMemento {
  get: <T>(key: string) => T | undefined;
  update: (key: string, value: unknown) => Promise<void>;
  _state: Map<string, unknown>;
}

function makeMemento(initial?: Record<string, unknown>): FakeMemento {
  const state = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    get: <T>(key: string) => state.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      if (value === undefined) state.delete(key);
      else state.set(key, value);
    },
    _state: state,
  };
}

function makeContext(initialGlobalState?: Record<string, unknown>, extensionPath?: string) {
  const globalState = makeMemento(initialGlobalState);
  const workspaceState = makeMemento();
  const context = {
    extensionPath: extensionPath ?? '/ext',
    subscriptions: [],
    globalState,
    workspaceState,
  } as unknown as vscode.ExtensionContext;
  return { context, globalState, workspaceState };
}

suite('bootstrapAcpProxy', () => {
  let warnings: string[];
  let infos: string[];
  let errors: string[];
  let commands: Map<string, (...args: unknown[]) => unknown>;
  let quickPickAnswer: (items: unknown[]) => unknown;

  let originalWarn: typeof vscode.window.showWarningMessage;
  let originalInfo: typeof vscode.window.showInformationMessage;
  let originalError: typeof vscode.window.showErrorMessage;
  let originalQuickPick: typeof vscode.window.showQuickPick;
  let originalRegisterCommand: typeof vscode.commands.registerCommand;

  setup(() => {
    warnings = [];
    infos = [];
    errors = [];
    commands = new Map();
    quickPickAnswer = () => undefined;

    originalWarn = vscode.window.showWarningMessage;
    originalInfo = vscode.window.showInformationMessage;
    originalError = vscode.window.showErrorMessage;
    originalQuickPick = vscode.window.showQuickPick;
    originalRegisterCommand = vscode.commands.registerCommand;

    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (message: string) => {
      warnings.push(message);
      return Promise.resolve(undefined);
    };
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = (message: string) => {
      infos.push(message);
      return Promise.resolve(undefined);
    };
    (vscode.window as { showErrorMessage: unknown }).showErrorMessage = (message: string) => {
      errors.push(message);
      return Promise.resolve(undefined);
    };
    (vscode.window as { showQuickPick: unknown }).showQuickPick = (items: unknown[]) =>
      Promise.resolve(quickPickAnswer(items));
    (vscode.commands as { registerCommand: unknown }).registerCommand = (
      id: string,
      fn: (...args: unknown[]) => unknown,
    ) => {
      commands.set(id, fn);
      return { dispose: () => commands.delete(id) };
    };
  });

  teardown(() => {
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = originalInfo;
    (vscode.window as { showErrorMessage: unknown }).showErrorMessage = originalError;
    (vscode.window as { showQuickPick: unknown }).showQuickPick = originalQuickPick;
    (vscode.commands as { registerCommand: unknown }).registerCommand = originalRegisterCommand;
  });

  test('registers both install/uninstall commands', () => {
    const { context } = makeContext();
    bootstrapAcpProxy(context, '/repo');
    assert.equal(commands.has('failsafe.acp.installGovernedProxy'), true);
    assert.equal(commands.has('failsafe.acp.uninstallGovernedProxy'), true);
  });

  test('activation with no prior install stays silent and never reads the registry', () => {
    const { context } = makeContext();
    let readCalls = 0;
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => {
      readCalls++;
      return null;
    });
    assert.equal(warnings.length, 0);
    assert.equal(readCalls, 0, 'no expected entry means nothing to compare against');
  });

  test('full bootstrapAcpProxy activation with empty state stays silent (real fs/os path)', () => {
    const { context } = makeContext();
    bootstrapAcpProxy(context, '/repo');
    assert.equal(warnings.length, 0);
    assert.equal(errors.length, 0);
  });

  test('intact live entry installed for this workspace produces no warning', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent, workspaceRoot: '/repo' },
    });
    const text = JSON.stringify({ version: '1.0.0', agents: [agent], extensions: [] });
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => text);
    assert.equal(warnings.length, 0);
  });

  test('tampered entry (cmd rewritten to raw agent) warns with a distinguishing message', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent, workspaceRoot: '/repo' },
    });
    const hijacked = JSON.parse(JSON.stringify(agent)) as DevinAgent;
    hijacked.distribution.binary['linux-x86_64'].cmd = 'real-agent';
    const text = JSON.stringify({ version: '1.0.0', agents: [hijacked], extensions: [] });
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => text);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /no longer matches/);
    assert.match(warnings[0], /FailSafe \(governing real-agent\)/);
    assert.match(warnings[0], /stable/);
  });

  test('missing entry (registry file gone) warns with a distinct "missing" message', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent, workspaceRoot: '/repo' },
    });
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /is missing/);
    assert.doesNotMatch(warnings[0], /no longer matches/);
    assert.doesNotMatch(warnings[0], /could not be parsed/);
  });

  test('malformed registry (unparseable JSON) warns with a distinct message from "missing"/"tampered"', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent, workspaceRoot: '/repo' },
    });
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => '{ not valid json');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /could not be parsed/);
    assert.doesNotMatch(warnings[0], /is missing/);
    assert.doesNotMatch(warnings[0], /no longer matches/);
  });

  test('unrelated registry edits (co-resident agent renamed) do not trigger a false alarm', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent, workspaceRoot: '/repo' },
    });
    const text = JSON.stringify({
      version: '1.0.0',
      agents: [agent, { id: 'some-other-agent', name: 'renamed-agent', distribution: { binary: {} } }],
      extensions: [],
    });
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => text);
    assert.equal(warnings.length, 0);
  });

  test('checks stable and next channels independently — only the drifted channel warns', () => {
    const stableAgent = buildAgent('FailSafe (governing stable-agent)', '/usr/bin/node');
    const nextAgent = buildAgent('FailSafe (governing next-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent: stableAgent, workspaceRoot: '/repo' },
      'failsafe.acp.expectedRegistryEntry.next': { agent: nextAgent, workspaceRoot: '/repo' },
    });
    const nextTampered = JSON.parse(JSON.stringify(nextAgent)) as DevinAgent;
    nextTampered.distribution.binary['linux-x86_64'].cmd = 'raw-next-agent';

    verifyGovernedProxyEntries(context, '/repo', '/home/op', (p) => {
      if (p.includes('.windsurf-next')) {
        return JSON.stringify({ version: '1.0.0', agents: [nextTampered], extensions: [] });
      }
      return JSON.stringify({ version: '1.0.0', agents: [stableAgent], extensions: [] });
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /next-agent/);
    assert.match(warnings[0], /next/);
  });

  test('an intact entry installed for a different workspace discloses the mismatch instead of staying silent', () => {
    // FX898 review: --workspace <root> is baked into the twin's launch args,
    // but the registry (and now globalState) are both machine-global with a
    // single id. An entry that is byte-for-byte "intact" can still be
    // pointed at a DIFFERENT workspace's governance root — selecting it here
    // would silently apply that other workspace's policy, not this one's.
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const { context } = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': { agent, workspaceRoot: '/other-repo' },
    });
    const text = JSON.stringify({ version: '1.0.0', agents: [agent], extensions: [] });
    verifyGovernedProxyEntries(context, '/repo', '/home/op', () => text);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /different workspace/);
    assert.match(warnings[0], /\/other-repo/);
    assert.doesNotMatch(warnings[0], /no longer matches/);
    assert.doesNotMatch(warnings[0], /is missing/);
    assert.doesNotMatch(warnings[0], /could not be parsed/);
  });

  test('a detection error is caught and reported as an error, never thrown from activation', () => {
    const { context, globalState } = makeContext();
    globalState.get = () => {
      throw new Error('boom');
    };
    assert.doesNotThrow(() => bootstrapAcpProxy(context, '/repo'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /drift check failed/);
    assert.match(errors[0], /boom/);
  });

  suite('real registry lifecycle (HOME-scoped temp dir via homeDir param, real fs/os)', () => {
    // Passes a throwaway directory through bootstrapAcpProxy's `homeDir`
    // parameter rather than mutating process.env.HOME — HOME is shared by
    // every test file in this extension-host run, so a leak (a missed
    // restore, a hook ordering surprise) would corrupt unrelated suites,
    // as opposed to a plain function argument, which cannot leak.
    let tmpHome: string;
    let tmpExt: string;

    setup(() => {
      tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-acp-proxy-test-home-'));
      tmpExt = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-acp-proxy-test-ext-'));
      fs.mkdirSync(path.join(tmpExt, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(tmpExt, 'dist', 'acp-proxy.js'), '// stub proxy bundle for tests\n');
    });

    teardown(() => {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpExt, { recursive: true, force: true });
    });

    function seedRegistry(channelDir: string): void {
      const registryPath = path.join(tmpHome, channelDir, 'acp', 'registry.json');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          version: '1.0.0',
          agents: [
            {
              id: 'devin-agent',
              name: 'Devin',
              version: '1.0.0',
              distribution: { binary: { 'linux-x86_64': { archive: '', cmd: 'devin-bin', args: [] } } },
            },
          ],
          extensions: [],
        }),
      );
    }

    test('install persists the expected entry to globalState, never workspaceState — the registry is one machine-global resource, not per-workspace', async () => {
      // FX898 review: workspaceState scoping caused a workspace-B install to
      // read as "tampered" from workspace A's next activation, even though
      // the single shared registry entry was still fully governed.
      seedRegistry('.windsurf');
      quickPickAnswer = (items) => (items as unknown[])[0];

      const { context, globalState, workspaceState } = makeContext(undefined, tmpExt);
      bootstrapAcpProxy(context, '/repo', tmpHome);
      const install = commands.get('failsafe.acp.installGovernedProxy');
      assert.ok(install, 'install command must be registered');
      await install!();

      const stored = globalState.get<{ agent: DevinAgent; workspaceRoot: string }>(
        'failsafe.acp.expectedRegistryEntry.stable',
      );
      assert.ok(stored, 'expected entry must live in globalState');
      assert.equal(stored!.workspaceRoot, '/repo', 'the workspace it was installed for must be recorded');
      assert.equal(
        workspaceState._state.size,
        0,
        'must never persist the expected entry in workspaceState',
      );
      assert.equal(errors.length, 0, JSON.stringify(errors));
    });

    test('uninstall clears the globalState entry it wrote at install', async () => {
      seedRegistry('.windsurf');
      quickPickAnswer = (items) => (items as unknown[])[0];

      const { context, globalState } = makeContext(undefined, tmpExt);
      bootstrapAcpProxy(context, '/repo', tmpHome);
      await commands.get('failsafe.acp.installGovernedProxy')!();
      assert.equal(globalState._state.has('failsafe.acp.expectedRegistryEntry.stable'), true);

      await commands.get('failsafe.acp.uninstallGovernedProxy')!();
      assert.equal(globalState.get('failsafe.acp.expectedRegistryEntry.stable'), undefined);
    });

    test('uninstall clears stale expected state even when no registry file currently exists (stale-state-unclearable fix)', async () => {
      // FX898 review: the uninstall command used to early-return on "no
      // registry found" BEFORE clearing persisted state, so a deleted
      // registry left the drift warning firing forever with no way to quiet it.
      const staleAgent = buildAgent('FailSafe (governing stale-agent)', '/usr/bin/node');
      const { context, globalState } = makeContext(
        { 'failsafe.acp.expectedRegistryEntry.stable': { agent: staleAgent, workspaceRoot: '/repo' } },
        tmpExt,
      );
      bootstrapAcpProxy(context, '/repo', tmpHome); // no registry file exists in tmpHome at all
      await commands.get('failsafe.acp.uninstallGovernedProxy')!();
      assert.equal(globalState.get('failsafe.acp.expectedRegistryEntry.stable'), undefined);
      assert.equal(infos.length, 1);
      assert.match(infos[0], /No Devin registry found/);
    });
  });
});
