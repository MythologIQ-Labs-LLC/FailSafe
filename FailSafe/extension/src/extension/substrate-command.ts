/**
 * registerSubstrateCommand — wires the `failsafe.substrate.run` command into
 * the extension activate() flow, plus (B-SUBSTRATE-3) an optional auto-hook that
 * runs the same substrate modules whenever /qor-substantiate seals a session.
 *
 * Composes:
 *   PythonInterpreterResolver(config, vscode, run)  // 3-arg ctor; v2-D4
 *     → QorScriptInvoker(resolver)
 *       → [SecretScannerModule, FeatureIndexVerifyAdapter, ModelPinningLintModule,
 *          DependencyAdmissionLintModule]
 *         → SubstrateRunner(modules, eventBus)
 *   (extracted into `createSubstrateRunner` so the Command Palette command and
 *    the seal auto-hook share ONE module list.)
 *
 * Surface:
 *   - Output channel "FailSafe Substrate" (start line + complete line + per-module summary)
 *   - vscode.window.showInformationMessage with total finding count (manual run only)
 *   - One `substrate.run.complete` event on the shared EventBus per run
 *
 * Seal auto-hook (B-SUBSTRATE-3): when a `mutationBus` is supplied, a watcher on
 * docs/META_LEDGER.md runs the substrate (WARN-only, no popup) on each NEW
 * `SESSION SEAL` entry — i.e. when /qor-substantiate seals — so all modules
 * surface at seal time instead of only via Command Palette.
 *
 * NOTE: third arg is a ConfigLike (the `vscode.workspace.getConfiguration('failsafe')`
 * surface), NOT the FailSafe ConfigManager class — ConfigManager does not
 * implement ConfigLike.get(key:string):string|undefined.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { SubstrateRunner } from '../qorlogic/substrate/SubstrateRunner';
import { SecretScannerModule } from '../qorlogic/substrate/SecretScannerModule';
import { FeatureIndexVerifyAdapter } from '../qorlogic/substrate/FeatureIndexVerifyAdapter';
import { ModelPinningLintModule } from '../qorlogic/substrate/ModelPinningLintModule';
import { DependencyAdmissionLintModule } from '../qorlogic/substrate/DependencyAdmissionLintModule';
import { TrackerEvidenceLintModule } from '../qorlogic/substrate/TrackerEvidenceLintModule';
import { QorScriptInvoker } from '../qorlogic/substrate/QorScriptInvoker';
import { SealWatchState } from '../qorlogic/substrate/seal-detection';
import { readMetaLedgerArtifact } from '../qorlogic/consumer/consumer-adapter';
import {
  PythonInterpreterResolver,
  type ConfigLike,
  type RunCommand,
} from '../qorlogic/PythonInterpreterResolver';
import type { EventBus } from '../shared/EventBus';
import type { WorkspaceMutationBus } from '../shared/WorkspaceMutationBus';
import type { RunReport } from '../qorlogic/substrate/types';

/** Build the canonical substrate module list. Shared by the manual command and
 *  the seal auto-hook so both surfaces run exactly the same checks. */
export function createSubstrateRunner(
  ws: string,
  eventBus: EventBus,
  config: ConfigLike,
  run: RunCommand,
): SubstrateRunner {
  const resolver = new PythonInterpreterResolver(config, { extensions: vscode.extensions }, run);
  const invoker = new QorScriptInvoker(resolver);
  return new SubstrateRunner(
    [
      new SecretScannerModule(invoker, ws),
      new FeatureIndexVerifyAdapter(ws),
      new ModelPinningLintModule(invoker, ws),
      new DependencyAdmissionLintModule(ws),
      new TrackerEvidenceLintModule(ws),
    ],
    eventBus,
  );
}

function appendReport(channel: vscode.OutputChannel, report: RunReport): void {
  channel.appendLine(
    `[FailSafe Substrate] complete: ${report.totalFindings} finding(s) across ${report.moduleResults.length} module(s) in ${report.runDurationMs}ms`,
  );
  for (const r of report.moduleResults) {
    const errSuffix = r.error ? ` (ERROR: ${r.error.kind} — ${r.error.message})` : '';
    const noteSuffix = r.summary.note ? ` (${r.summary.note})` : '';
    channel.appendLine(`  ${r.module}: ${r.findings.length} findings${errSuffix}${noteSuffix}`);
  }
}

export function registerSubstrateCommand(
  context: vscode.ExtensionContext,
  eventBus: EventBus,
  config: ConfigLike,
  run: RunCommand,
  mutationBus?: WorkspaceMutationBus,
): void {
  const channel = vscode.window.createOutputChannel('FailSafe Substrate');
  context.subscriptions.push(channel);

  const runSubstrate = async (label: string): Promise<void> => {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) {
      vscode.window.showWarningMessage('FailSafe Substrate: no workspace folder open');
      return;
    }
    channel.appendLine(`[FailSafe Substrate] starting ${label} at ${new Date().toISOString()}`);
    const report = await createSubstrateRunner(ws, eventBus, config, run).runAll();
    appendReport(channel, report);
    if (label === 'manual run') {
      vscode.window.showInformationMessage(
        `FailSafe Substrate: ${report.totalFindings} finding(s). See "FailSafe Substrate" output channel.`,
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.substrate.run', async () => {
      channel.show(true);
      await runSubstrate('manual run');
    }),
  );

  // B-SUBSTRATE-3: auto-run on each new /qor-substantiate seal.
  // Ledger reads go through the qorlogic consumer adapter (#233 migration) so
  // a malformed/unsupported ledger is a visible, logged condition instead of
  // an indistinguishable silent no-fire; `unavailable` matches the previous
  // missing-file posture (no watcher wired at all).
  if (mutationBus) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) {
      const ledgerPath = path.join(ws, 'docs', 'META_LEDGER.md');
      const initialLedger = readMetaLedgerArtifact(ws);
      if (initialLedger.state !== 'unavailable') {
        // Seed state from the ledger as it exists now so the pre-existing latest
        // seal does NOT trigger a run at activation. A malformed/unsupported
        // ledger at wiring time seeds from no entries (never guessed compatible).
        const state = new SealWatchState(initialLedger.data ?? []);
        const disposable = mutationBus.registerWatcher(
          ledgerPath,
          () => {
            const ledger = readMetaLedgerArtifact(ws);
            if (ledger.state === 'malformed' || ledger.state === 'unsupported') {
              channel.appendLine(
                `[FailSafe Substrate] META_LEDGER.md is ${ledger.state} (${ledger.reason}) — skipping seal auto-hook check`,
              );
              return;
            }
            if (state.shouldFire(ledger.data ?? [])) {
              channel.appendLine('[FailSafe Substrate] new SESSION SEAL detected — auto-running substrate');
              void runSubstrate('seal auto-hook');
            }
          },
          1500,
        );
        context.subscriptions.push({ dispose: () => disposable.dispose() });
      }
    }
  }
}
