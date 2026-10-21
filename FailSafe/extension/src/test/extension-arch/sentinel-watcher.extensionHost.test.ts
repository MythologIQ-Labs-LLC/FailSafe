// C2 (plan-c2-chokidar, T6): the Sentinel file watcher in the real extension host, running the
// bundled dist/extension/main.js, so the watcher is exercised as shipped.
//
// Runs only in the `architecture-index` vscode-test configuration (.vscode-test.mjs), whose
// workspace is a fresh temp git repository. Activates FailSafe and reads the daemon status from
// failsafe.sentinelStatus, which returns it (the extension-host seam; red-first: the command
// returned undefined before). A file under node_modules/ must never become the last verdict while
// the status is sampled through the whole window; a file under src/ must.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const COMMAND = 'failsafe.sentinelStatus';
const WINDOW_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = { running?: boolean; lastVerdict?: { artifactPath?: string } | null };

const samePath = (a: string | undefined, b: string) => {
  if (!a) return false;
  const norm = (p: string) => path.resolve(p);
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

suite('C2 Sentinel watcher (extension host, temp git workspace)', () => {
  const original = vscode.window.showInformationMessage;
  let root = '';

  suiteSetup(async function () {
    this.timeout(90000);
    root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    assert.ok(root, 'the architecture-index configuration opens a workspace folder');
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
    const deadline = Date.now() + 60000;
    while (!(await vscode.commands.getCommands(true)).includes(COMMAND)) {
      if (Date.now() > deadline) throw new Error(`${COMMAND} was never registered`);
      await sleep(250);
    }
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = async () => undefined;
  });

  suiteTeardown(() => {
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = original;
  });

  const status = async () => (await vscode.commands.executeCommand(COMMAND)) as Status | undefined;

  test('failsafe.sentinelStatus returns the daemon status', async () => {
    const s = await status();
    assert.equal(typeof s, 'object', `the command returned ${String(s)}`);
    assert.equal(s?.running, true);
  });

  test('node_modules/ never becomes the last verdict; src/ does', async function () {
    this.timeout(60000);
    const ignored = path.join(root, 'node_modules', 'n.ts');
    const watched = path.join(root, 'src', 'w.ts');
    const hadSrc = fs.existsSync(path.dirname(watched));
    const hadNodeModules = fs.existsSync(path.dirname(ignored));
    try {
      assert.equal(typeof (await status()), 'object', 'failsafe.sentinelStatus returns no status');
      fs.mkdirSync(path.dirname(ignored), { recursive: true });
      fs.writeFileSync(ignored, 'export const n = 1;\n');
      let samples = 0;
      let hits = 0;
      const end = Date.now() + WINDOW_MS;
      while (Date.now() < end) {
        samples += 1;
        if (samePath((await status())?.lastVerdict?.artifactPath, ignored)) hits += 1;
        await sleep(50);
      }
      assert.equal(hits, 0, `${hits} of ${samples} samples had node_modules/n.ts as the last verdict`);

      fs.mkdirSync(path.dirname(watched), { recursive: true });
      fs.writeFileSync(watched, 'export const w = 1;\n');
      const deadline = Date.now() + 30000;
      let last: string | undefined;
      while (!samePath(last, watched)) {
        if (Date.now() > deadline) throw new Error(`src/w.ts never became the last verdict; last ${String(last)}`);
        await sleep(100);
        last = (await status())?.lastVerdict?.artifactPath;
      }
      console.log(`[sentinel-watcher] ${samples} samples over ${WINDOW_MS} ms, 0 on n.ts; src/w.ts verdict seen`);
    } finally {
      fs.rmSync(hadSrc ? watched : path.dirname(watched), { recursive: true, force: true });
      fs.rmSync(hadNodeModules ? ignored : path.dirname(ignored), { recursive: true, force: true });
    }
  });
});
