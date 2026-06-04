/**
 * agent-observe-command — Group C read-only observe/audit commands:
 *   `FailSafe: Audit Agent MCP Policy (Cline/Roo/Kilo)`  (#106)
 *   `FailSafe: Import OpenHands Run (observe)`            (#105)
 *
 * Both are READ-ONLY. The MCP policy audit scans known workspace config files,
 * flags risky posture (remote MCP, wildcard auto-approval, shell-capable tools),
 * and upserts the findings as risk records — secrets are redacted by the pure
 * auditor before they reach a record. The OpenHands observer maps an exported
 * run's events into normalized transparency records and degrades on an
 * unsupported version. Neither spawns a process or mutates an agent.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { auditMcpConfig } from '../integrations/agent-observe/mcp-policy-audit';
import { observeOpenHandsRun } from '../integrations/agent-observe/openhands-observer';
import { RiskRegisterManager } from '../roadmap/services/RiskRegisterManager';

/** Best-effort known MCP/tool config locations (workspace-relative). `.mcp.json`
 *  is the shared project MCP config Cline/Roo/Kilo all read. */
const MCP_CONFIG_CANDIDATES: Array<{ agent: string; rel: string }> = [
  { agent: 'project', rel: '.mcp.json' },
  { agent: 'cline', rel: 'cline_mcp_settings.json' },
  { agent: 'cline', rel: path.join('.cline', 'mcp_settings.json') },
  { agent: 'roo', rel: path.join('.roo', 'mcp.json') },
  { agent: 'kilo', rel: path.join('.kilocode', 'mcp.json') },
];

export function registerAgentObserveCommands(context: vscode.ExtensionContext, workspaceRoot: string): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.agentAudit.run', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      if (!cfg.get<boolean>('integrations.agentAudit.enabled', false)) {
        vscode.window.showWarningMessage('Agent MCP-policy audit is disabled. Enable `failsafe.integrations.agentAudit.enabled`.');
        return;
      }
      const riskManager = new RiskRegisterManager(workspaceRoot);
      let scanned = 0;
      let total = 0;
      let high = 0;
      for (const cand of MCP_CONFIG_CANDIDATES) {
        const file = path.join(workspaceRoot, cand.rel);
        let text: string;
        try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
        scanned++;
        for (const risk of auditMcpConfig(cand.agent, text)) {
          riskManager.upsertRisk(risk as unknown as Record<string, unknown>);
          total++;
          if (risk.severity === 'high') high++;
        }
      }
      if (scanned === 0) { vscode.window.showInformationMessage('Agent MCP-policy audit: no Cline/Roo/Kilo/project MCP config found in this workspace.'); return; }
      vscode.window.showInformationMessage(`Agent MCP-policy audit: scanned ${scanned} config(s) → ${total} risk(s) upserted (${high} high-severity).`);
    }),

    vscode.commands.registerCommand('failsafe.openhands.observe', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      if (!cfg.get<boolean>('integrations.openhands.enabled', false)) {
        vscode.window.showWarningMessage('OpenHands observer is disabled. Enable `failsafe.integrations.openhands.enabled`.');
        return;
      }
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Observe OpenHands run', filters: { 'OpenHands run (JSON)': ['json'] } });
      if (!picked || picked.length === 0) return;
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readFileSync(picked[0].fsPath, 'utf-8')); } catch (e) {
        vscode.window.showErrorMessage(`OpenHands observe: cannot read/parse file: ${e instanceof Error ? e.message : String(e)}`); return;
      }
      // Accept either a bare events array or a { version, events } envelope.
      const env = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
      const events = env && Array.isArray(env.events) ? env.events : parsed;
      const version = (env && typeof env.version === 'string' ? env.version : undefined) ?? (cfg.get<string>('integrations.openhands.version', '') || undefined);

      const result = observeOpenHandsRun(events, version);
      if (!result.supported) { vscode.window.showWarningMessage(`OpenHands observe: ${result.degraded}`); return; }
      const high = result.records.filter((r) => r.riskHint === 'high').length;
      vscode.window.showInformationMessage(`OpenHands observe: mapped ${result.records.length} event(s) (${high} high-risk) from ${vscode.workspace.asRelativePath(picked[0].fsPath)}.`);
    }),
  );
}
