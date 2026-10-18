// #538 lane A (B273, plan-538a LD11 C1): the production label. A REAL
// ConfigManager reads a workspace sentinel.yaml that names a non-loopback
// host; the endpoint must be labelled workspace-file, and neither LLMClient
// nor VerdictArbiter may send anything there even with an authorizer that
// approves everything, so the zero depends only on the label. Runs in the
// vscode-test extension host (ConfigManager needs vscode). Ran red against
// main, which had no label and sent the probe and the file.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from '../../shared/ConfigManager';
import type * as vscode from 'vscode';
import {
  allowAll, newClient, probe, reachableHostNameEndpoint, startCountingServer, type CountingServer,
} from './utils/llmEgressHarness';
import { fileEvent, makeArbiter } from './arbiterHarness';

function memento(): vscode.Memento {
  const store = new Map<string, unknown>();
  return {
    keys: () => [...store.keys()],
    get: <T>(key: string, fallback?: T) => (store.has(key) ? store.get(key) as T : fallback),
    update: async (key: string, value: unknown) => { store.set(key, value); },
  } as unknown as vscode.Memento;
}

/** A real ConfigManager whose workspace root is `root` (the constructor reads workspaceFolders[0]). */
function configManagerAt(root: string): ConfigManager {
  const context = { globalState: memento(), workspaceState: memento(), subscriptions: [] } as unknown as vscode.ExtensionContext;
  const cm = new ConfigManager(context);
  (cm as unknown as { workspaceRoot: string }).workspaceRoot = root;
  return cm;
}

function writeSentinelYaml(root: string, body: string): void {
  const dir = path.join(root, '.failsafe', 'config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sentinel.yaml'), body);
}

suite('#538 ConfigManager labels a sentinel.yaml endpoint (B273 C1)', () => {
  let root = '';
  let server: CountingServer | undefined;
  setup(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-cm-llm-')); });
  teardown(async () => {
    await server?.close();
    server = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('C1 a real ConfigManager: workspace-file label, and 0 requests through LLMClient and VerdictArbiter', async () => {
    server = await startCountingServer('::');
    const endpoint = await reachableHostNameEndpoint(server);
    writeSentinelYaml(root, `sentinel:\n  mode: llm-assisted\n  ollamaEndpoint: "${endpoint}"\n`);
    const cm = configManagerAt(root);
    assert.equal(cm.getConfig().sentinel.ollamaEndpoint, endpoint, 'the yaml endpoint is the effective one');

    const client = newClient(cm, { authorizer: allowAll() });
    await probe(client, { ask: true });
    await client.callEndpoint('SECRET_FILE_CONTENT_MARKER', 3000).catch(() => undefined);

    const arbiter = makeArbiter(cm, { authorizer: allowAll() });
    await arbiter.checkLLMAvailability();
    const { event, dir } = fileEvent('const SECRET_FILE_CONTENT_MARKER = 1;\n');
    try {
      await arbiter.evaluateEvent(event);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    assert.equal(server.count(), 0, `the yaml-chosen host received ${server.count()} request(s)`);
    const sentinel = cm.getConfig().sentinel as { ollamaEndpointSource?: string };
    assert.equal(sentinel.ollamaEndpointSource, 'workspace-file');
  });
});
