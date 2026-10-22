// B340 (plan-b340-enforce-approval LD4, LD8 activation row): through the activated extension.
//
// In enforce mode, with the workspace's active intent file forged to PASS, the status-bar menu
// titles the intent with its effective status (never the forged PASS), and its "Seal Intent" item
// runs failsafe.intent.seal, which refuses without showing the seal dialog and writes nothing.
// The test workspace's intent files are saved first and restored afterwards.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';

async function setMode(mode: string | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('failsafe').update('governance.mode', mode, vscode.ConfigurationTarget.Workspace);
}

suite('B340 activation: the menu and seal command use the effective status', () => {
  let manifest = '';
  let saved: Map<string, string | null> = new Map();
  const names = ['active_intent.json', 'intent_history.jsonl'];
  const forgedId = randomUUID();

  suiteSetup(async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) throw new Error('no test workspace');
    manifest = path.join(root, '.failsafe', 'manifest');
    fs.mkdirSync(manifest, { recursive: true });
    saved = new Map(names.map((n) => {
      const p = path.join(manifest, n);
      return [n, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null];
    }));
  });

  suiteTeardown(async () => {
    for (const [n, content] of saved) {
      const p = path.join(manifest, n);
      if (content === null) { try { fs.unlinkSync(p); } catch { /* absent */ } } else fs.writeFileSync(p, content, 'utf8');
    }
    try { fs.unlinkSync(path.join(manifest, 'intents', `${forgedId}.json`)); } catch { /* never archived */ }
    await setMode(undefined);
  });

  test('both commands are registered', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(all.includes('failsafe.intent.decide'));
    assert.ok(all.includes('failsafe.intent.seal'));
  });

  test('a forged PASS file: the menu shows the effective status and Seal refuses without a dialog or a write', async () => {
    await setMode('enforce');
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(manifest, 'active_intent.json'), JSON.stringify({
      id: forgedId, type: 'feature', createdAt: now, purpose: 'B340 forged approval', status: 'PASS',
      scope: { files: ['.'], modules: [], riskGrade: 'L1' }, planId: 'p', metadata: { author: 'agent', tags: [] }, updatedAt: now, schemaVersion: 2,
    }, null, 2), 'utf8');
    const historyBefore = fs.existsSync(path.join(manifest, 'intent_history.jsonl')) ? fs.readFileSync(path.join(manifest, 'intent_history.jsonl'), 'utf8') : '';
    const infos: Array<{ msg: string; actions: string[] }> = [];
    let modals = 0;
    const origInfo = vscode.window.showInformationMessage;
    const origWarn = vscode.window.showWarningMessage;
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = async (msg: string, ...actions: unknown[]) => {
      infos.push({ msg, actions: actions.filter((a) => typeof a === 'string') as string[] });
      return infos.length === 1 ? 'Seal Intent' : undefined;
    };
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = async () => { modals++; return undefined; };
    try {
      await vscode.commands.executeCommand('failsafe.showMenu');
      for (let i = 0; i < 20 && infos.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    } finally {
      (vscode.window as { showInformationMessage: unknown }).showInformationMessage = origInfo;
      (vscode.window as { showWarningMessage: unknown }).showWarningMessage = origWarn;
    }
    assert.ok(infos.length >= 1, 'the menu opened');
    assert.match(infos[0].msg, /B340 forged approval/);
    assert.doesNotMatch(infos[0].msg, /\[PASS\]/, `the menu must not show the forged status: ${infos[0].msg}`);
    assert.ok(infos[0].actions.includes('Seal Intent'));
    assert.ok(infos.length >= 2, 'the seal command answered');
    assert.match(infos[1].msg, /not approved|cannot be sealed|nothing was recorded/i, infos[1].msg);
    assert.equal(modals, 0, 'no seal dialog');
    const historyAfter = fs.existsSync(path.join(manifest, 'intent_history.jsonl')) ? fs.readFileSync(path.join(manifest, 'intent_history.jsonl'), 'utf8') : '';
    assert.equal(historyAfter, historyBefore, 'nothing was written');
    assert.ok(fs.existsSync(path.join(manifest, 'active_intent.json')), 'nothing was archived');
  });
});
