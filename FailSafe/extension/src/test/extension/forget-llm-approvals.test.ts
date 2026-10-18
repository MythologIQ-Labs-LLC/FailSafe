// #538 lane A (B273, plan-538a LD14 R1): "FailSafe: Forget Sentinel LLM
// Approvals" is registered at activation and runs. What it clears is held by
// llmEgressAuthorizer.test.ts (F1); this row proves the command reaches it.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';

const COMMAND = 'failsafe.sentinel.forgetLlmApprovals';

suite('#538 Forget Sentinel LLM Approvals command (B273 LD14)', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
  });

  test('R1 the command is registered and runs', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(all.includes(COMMAND), `${COMMAND} is not registered`);
    await vscode.commands.executeCommand(COMMAND);
  });
});
