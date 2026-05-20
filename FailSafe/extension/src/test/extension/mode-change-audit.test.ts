// Functional test for Mode-Change Audit Trail (FX263) — USER_OVERRIDE ledger entry on governance.mode config change.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { registerAdvancedCommands, type AdvancedCommandsDeps } from '../../extension/bootstrapAdvancedCommands';
import { Logger } from '../../shared/Logger';

interface CapturedLedger {
  entries: any[];
}

function makeStubs(captured: CapturedLedger): AdvancedCommandsDeps {
  return {
    ledgerManager: {
      appendEntry: async (e: any) => {
        captured.entries.push(e);
        return { id: captured.entries.length };
      },
    } as never,
    policyEngine: {} as never,
    breakGlass: { activate: async () => ({ expiresAt: '' }) } as never,
    systemRegistry: {} as never,
    commitGuard: {} as never,
    configManager: {} as never,
    workspaceRoot: '/tmp',
    showRevert: () => {},
  };
}

function makeContext(): vscode.ExtensionContext {
  const subs: vscode.Disposable[] = [];
  return {
    subscriptions: subs,
    extensionUri: vscode.Uri.parse('file:///tmp'),
  } as unknown as vscode.ExtensionContext;
}

suite('Mode-Change Audit Trail (FX263)', () => {
  let originalMode: string | undefined;
  let originalRegisterCommand: typeof vscode.commands.registerCommand;

  suiteSetup(async () => {
    originalMode = vscode.workspace.getConfiguration('failsafe').get<string>('governance.mode');
    // Isolation: stub vscode.commands.registerCommand for this suite. The
    // tests exercise registerAdvancedCommands purely for its
    // onDidChangeConfiguration audit-trail wiring, not for command
    // registration. The real extension's activate path registers the same
    // commands in the live workbench, so calling the unstubbed
    // registerCommand here triggers "command 'failsafe.breakGlass' already
    // exists" races. The stub returns a disposable no-op.
    originalRegisterCommand = vscode.commands.registerCommand;
    (vscode.commands as { registerCommand: unknown }).registerCommand = (
      _command: string,
      _callback: (...args: unknown[]) => unknown,
    ): vscode.Disposable => ({ dispose: () => undefined });
  });

  suiteTeardown(async () => {
    (vscode.commands as { registerCommand: unknown }).registerCommand = originalRegisterCommand;
    if (originalMode !== undefined) {
      await vscode.workspace.getConfiguration('failsafe')
        .update('governance.mode', originalMode, vscode.ConfigurationTarget.Global);
    }
  });

  test('FX263 — config change governance.mode emits USER_OVERRIDE ledger entry', async () => {
    const captured: CapturedLedger = { entries: [] };
    const deps = makeStubs(captured);
    const ctx = makeContext();
    const logger = new Logger('test');

    // Set baseline so we know what to flip from
    await vscode.workspace.getConfiguration('failsafe')
      .update('governance.mode', 'observe', vscode.ConfigurationTarget.Global);

    registerAdvancedCommands(ctx, deps, logger);

    // Trigger change
    await vscode.workspace.getConfiguration('failsafe')
      .update('governance.mode', 'enforce', vscode.ConfigurationTarget.Global);

    // Allow event to fire
    await new Promise(r => setTimeout(r, 100));

    const entry = captured.entries.find(e => e.eventType === 'USER_OVERRIDE');
    assert.ok(entry, 'USER_OVERRIDE ledger entry should be emitted on mode change');
    assert.equal(entry.agentDid, 'vscode-user');
    assert.equal(entry.payload.action, 'governance_mode_changed');
    assert.equal(entry.payload.previousMode, 'observe');
    assert.equal(entry.payload.newMode, 'enforce');

    // Cleanup subscriptions
    for (const sub of (ctx as any).subscriptions) {
      try { sub.dispose(); } catch { /* ignore */ }
    }
  });

  test('FX263 — same-value config write does NOT emit duplicate ledger entry', async () => {
    const captured: CapturedLedger = { entries: [] };
    const deps = makeStubs(captured);
    const ctx = makeContext();
    const logger = new Logger('test');

    await vscode.workspace.getConfiguration('failsafe')
      .update('governance.mode', 'assist', vscode.ConfigurationTarget.Global);

    registerAdvancedCommands(ctx, deps, logger);

    // Write same value — should not trigger USER_OVERRIDE
    await vscode.workspace.getConfiguration('failsafe')
      .update('governance.mode', 'assist', vscode.ConfigurationTarget.Global);

    await new Promise(r => setTimeout(r, 100));

    const userOverrides = captured.entries.filter(e => e.eventType === 'USER_OVERRIDE');
    assert.equal(userOverrides.length, 0);

    for (const sub of (ctx as any).subscriptions) {
      try { sub.dispose(); } catch { /* ignore */ }
    }
  });
});
