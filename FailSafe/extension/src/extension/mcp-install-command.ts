/**
 * registerMcpInstallCommand — `failsafe.mcp.installCatalog` (B-INT-13/14).
 *
 * Governed install of a catalog MCP integration (Context7 / Mermaid Chart):
 * operator picks an entry, FailSafe shows its #108 risk assessment + the exact
 * command to be written, and only on explicit modal confirmation writes the
 * server entry into the workspace `.mcp.json`. No silent install (no-ship rule:
 * the irreversible-ish config write requires per-action operator approval).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { assessCatalog } from '../integrations/mcp-catalog/mcp-catalog';
import { mergeMcpConfig } from '../integrations/mcp-catalog/mcp-installer';

export function registerMcpInstallCommand(context: vscode.ExtensionContext, workspaceRoot: string): void {
  const disposable = vscode.commands.registerCommand('failsafe.mcp.installCatalog', async () => {
    const assessed = assessCatalog();
    const pick = await vscode.window.showQuickPick(
      assessed.map((a) => ({
        label: a.entry.name,
        description: `risk: ${a.assessment.level} (score ${a.assessment.score})`,
        detail: a.entry.description,
        entry: a.entry,
        assessment: a.assessment,
      })),
      { placeHolder: 'Install a governed MCP integration into .mcp.json', matchOnDescription: true },
    );
    if (!pick) return;

    const { entry, assessment } = pick;
    const signals = assessment.signals.length
      ? assessment.signals.map((s) => `• [${s.severity}] ${s.id}: ${s.detail}`).join('\n')
      : '• no risk signals';
    const confirm = await vscode.window.showWarningMessage(
      `Install ${entry.name}?\n\nWrites to .mcp.json:\n  ${entry.install.command} ${entry.install.args.join(' ')}\n\nLocal risk score: ${assessment.level} (${assessment.score})\n${signals}`,
      { modal: true },
      'Install',
    );
    if (confirm !== 'Install') return;

    const cfgPath = path.join(workspaceRoot, '.mcp.json');
    let existing = '';
    try { existing = fs.readFileSync(cfgPath, 'utf-8'); } catch { /* no existing config */ }
    const { text, added } = mergeMcpConfig(existing, entry);
    try {
      fs.writeFileSync(cfgPath, text);
    } catch (e) {
      vscode.window.showErrorMessage(`MCP install: could not write .mcp.json: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    vscode.window.showInformationMessage(
      `${entry.name} ${added ? 'installed to' : 'updated in'} .mcp.json (governed; risk ${assessment.level}). ${entry.install.note ?? ''}`,
    );
  });
  context.subscriptions.push(disposable);
}
