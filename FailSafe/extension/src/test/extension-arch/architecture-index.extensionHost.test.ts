// #531 LD7: the managed architecture index in the real extension host.
//
// Runs only in the `architecture-index` vscode-test configuration (.vscode-test.mjs), whose
// workspace is a fresh temp git repository seeded with docs/architecture/RUNTIME.md and one
// commit. Activates FailSafe, answers ONLY the bootstrap dialog's title (every other warning
// returns undefined, as in commands-dispatch.test.ts), runs failsafe.architecture.bootstrapIndex
// and checks the typed result, the file, its rows, state `present` with zero problems and the
// ledger entry. A second run must report reuse and leave the file byte-identical.

import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ARCHITECTURE_BOOTSTRAP_TITLE } from '../../extension/operatorConfirmation';
import { discoverArchitectureIndex } from '../../governance/architecture/ArchitectureIndexDiscovery';

const COMMAND = 'failsafe.architecture.bootstrapIndex';
const INDEX = 'docs/ARCHITECTURE_INDEX.md';

suite('#531 managed architecture index (extension host, temp git workspace)', () => {
  const original = vscode.window.showWarningMessage;
  const dialogs: string[] = [];
  let root = '';

  suiteSetup(async function () {
    this.timeout(90000);
    root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    assert.ok(root, 'the architecture-index configuration opens a workspace folder');
    assert.ok(fs.existsSync(path.join(root, '.git')), `workspace ${root} is the temp git repository`);
    assert.ok(fs.existsSync(path.join(root, 'docs', 'architecture', 'RUNTIME.md')), 'seeded candidate present');
    assert.equal(fs.existsSync(path.join(root, ...INDEX.split('/'))), false, 'no index before the test');
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
    const deadline = Date.now() + 60000;
    while (!(await vscode.commands.getCommands(true)).includes(COMMAND)) {
      if (Date.now() > deadline) throw new Error(`${COMMAND} was never registered`);
      await new Promise((r) => setTimeout(r, 250));
    }
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = async (message: string, ...rest: unknown[]) => {
      dialogs.push(message);
      if (message !== ARCHITECTURE_BOOTSTRAP_TITLE) return undefined;
      const items = rest.filter((x): x is string => typeof x === 'string');
      return items[0];
    };
  });

  suiteTeardown(() => {
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = original;
  });

  test('bootstrap creates the index after the modal; the file validates as present and the creation is ledgered', async function () {
    this.timeout(60000);
    const result = await vscode.commands.executeCommand(COMMAND) as Record<string, unknown>;
    assert.equal(dialogs.filter((d) => d === ARCHITECTURE_BOOTSTRAP_TITLE).length, 1, 'one bootstrap dialog');
    assert.equal(result.status, 'created', JSON.stringify(result));
    assert.equal(result.path, INDEX);
    const bytes = fs.readFileSync(path.join(root, ...INDEX.split('/')));
    assert.equal(result.docSha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.match(String(result.sourceSha), /^[0-9a-f]{40}$/, 'the seeded commit');
    const ledger = result.ledger as { entryId?: number } | string;
    assert.equal(typeof ledger, 'object', `the ledger is available in the test host; got ${JSON.stringify(ledger)}`);
    assert.ok((ledger as { entryId: number }).entryId > 0, `ledger entry id ${JSON.stringify(ledger)}`);
    const snap = discoverArchitectureIndex({ workspaceRoot: root });
    assert.equal(snap.state, 'present', JSON.stringify(snap.problems));
    assert.deepEqual(snap.problems, []);
    assert.deepEqual(snap.rows.map((r) => [r.docPath, r.status]),
      [[INDEX, 'canonical'], ['docs/architecture/RUNTIME.md', 'proposed']]);
  });

  test('a second run reports reuse, shows no dialog and leaves the file byte-identical', async function () {
    this.timeout(60000);
    const target = path.join(root, ...INDEX.split('/'));
    const before = fs.readFileSync(target);
    const shown = dialogs.length;
    const result = await vscode.commands.executeCommand(COMMAND) as Record<string, unknown>;
    assert.equal(result.status, 'reuse', JSON.stringify(result));
    assert.equal(result.path, INDEX);
    assert.equal(dialogs.slice(shown).filter((d) => d === ARCHITECTURE_BOOTSTRAP_TITLE).length, 0);
    assert.ok(fs.readFileSync(target).equals(before), 'byte-identical after the second run');
  });
});
