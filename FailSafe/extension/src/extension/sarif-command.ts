/**
 * registerSarifImportCommand — `failsafe.sarif.import` (B-INT-9 / #99 v1 next slice).
 *
 * Operator picks a SARIF file; FailSafe parses it offline and upserts the
 * findings as WARN-only risk records (keyed-idempotent, so re-importing the same
 * scan updates rather than duplicates). Thin glue over the unit-tested
 * `importSarifText` orchestrator.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { importSarifText } from '../integrations/sarif/sarif-to-risk';
import { RiskRegisterManager } from '../roadmap/services/RiskRegisterManager';

export function registerSarifImportCommand(context: vscode.ExtensionContext, workspaceRoot: string): void {
  const disposable = vscode.commands.registerCommand('failsafe.sarif.import', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import SARIF',
      filters: { 'SARIF / JSON': ['sarif', 'json'] },
    });
    if (!picked || picked.length === 0) return;
    const file = picked[0].fsPath;

    let text: string;
    try {
      text = fs.readFileSync(file, 'utf-8');
    } catch (e) {
      vscode.window.showErrorMessage(`SARIF import: cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const riskManager = new RiskRegisterManager(workspaceRoot);
    const result = importSarifText(text, (risk) => riskManager.upsertRisk(risk));

    if (result.risks === 0 && result.errors.length) {
      vscode.window.showWarningMessage(`SARIF import: ${result.errors[0]}`);
      return;
    }
    const warnSuffix = result.errors.length ? ` (${result.errors.length} parse warning(s))` : '';
    vscode.window.showInformationMessage(
      `SARIF import: ${result.findings} finding(s) → ${result.risks} risk(s) upserted from ${vscode.workspace.asRelativePath(file)}${warnSuffix}.`,
    );
  });
  context.subscriptions.push(disposable);
}
