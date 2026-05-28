/**
 * registerSubstrateCommand — wires the `failsafe.substrate.run` command into
 * the extension activate() flow.
 *
 * Composes:
 *   PythonInterpreterResolver(config, vscode, run)  // 3-arg ctor; v2-D4
 *     → QorScriptInvoker(resolver)
 *       → [SecretScannerModule, FeatureIndexVerifyAdapter, ModelPinningLintModule]
 *         → SubstrateRunner(modules, eventBus)
 *
 * Surface:
 *   - Output channel "FailSafe Substrate" (start line + complete line + per-module summary)
 *   - vscode.window.showInformationMessage with total finding count
 *   - One `substrate.run.complete` event on the shared EventBus
 *
 * NOTE: third arg is a ConfigLike (the `vscode.workspace.getConfiguration('failsafe')`
 * surface used at bootstrapServers.ts:162), NOT the FailSafe ConfigManager class —
 * ConfigManager does not implement ConfigLike.get(key:string):string|undefined.
 */

import * as vscode from 'vscode';
import { SubstrateRunner } from '../qorlogic/substrate/SubstrateRunner';
import { SecretScannerModule } from '../qorlogic/substrate/SecretScannerModule';
import { FeatureIndexVerifyAdapter } from '../qorlogic/substrate/FeatureIndexVerifyAdapter';
import { ModelPinningLintModule } from '../qorlogic/substrate/ModelPinningLintModule';
import { QorScriptInvoker } from '../qorlogic/substrate/QorScriptInvoker';
import {
  PythonInterpreterResolver,
  type ConfigLike,
  type RunCommand,
} from '../qorlogic/PythonInterpreterResolver';
import type { EventBus } from '../shared/EventBus';

export function registerSubstrateCommand(
  context: vscode.ExtensionContext,
  eventBus: EventBus,
  config: ConfigLike,
  run: RunCommand,
): void {
  const channel = vscode.window.createOutputChannel('FailSafe Substrate');
  context.subscriptions.push(channel);

  const disposable = vscode.commands.registerCommand('failsafe.substrate.run', async () => {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) {
      vscode.window.showWarningMessage('FailSafe Substrate: no workspace folder open');
      return;
    }
    const resolver = new PythonInterpreterResolver(config, { extensions: vscode.extensions }, run);
    const invoker = new QorScriptInvoker(resolver);
    const runner = new SubstrateRunner(
      [
        new SecretScannerModule(invoker, ws),
        new FeatureIndexVerifyAdapter(ws),
        new ModelPinningLintModule(invoker, ws),
      ],
      eventBus,
    );

    channel.show(true);
    channel.appendLine(`[FailSafe Substrate] starting run at ${new Date().toISOString()}`);
    const report = await runner.runAll();
    channel.appendLine(
      `[FailSafe Substrate] complete: ${report.totalFindings} finding(s) across ${report.moduleResults.length} module(s) in ${report.runDurationMs}ms`,
    );
    for (const r of report.moduleResults) {
      const errSuffix = r.error ? ` (ERROR: ${r.error.kind} — ${r.error.message})` : '';
      const noteSuffix = r.summary.note ? ` (${r.summary.note})` : '';
      channel.appendLine(`  ${r.module}: ${r.findings.length} findings${errSuffix}${noteSuffix}`);
    }
    vscode.window.showInformationMessage(
      `FailSafe Substrate: ${report.totalFindings} finding(s). See "FailSafe Substrate" output channel.`,
    );
  });
  context.subscriptions.push(disposable);
}
