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
import { openHandsImportFromVscode } from './openhands-import-command';
import { RiskRegisterManager } from '../roadmap/services/RiskRegisterManager';
import { writeInChunks, type ImportBatch, type ImportWriteOutcome } from '../roadmap/services/riskImportBatch';
import { healthFromMcpScan, recordIntegrationHealth } from '../integrations/agent-observe/agent-observe-health';

/** Best-effort known MCP/tool config locations (workspace-relative). `.mcp.json`
 *  is the shared project MCP config Cline/Roo/Kilo all read. */
const MCP_CONFIG_CANDIDATES: Array<{ agent: string; rel: string }> = [
  { agent: 'project', rel: '.mcp.json' },
  { agent: 'cline', rel: 'cline_mcp_settings.json' },
  { agent: 'cline', rel: path.join('.cline', 'mcp_settings.json') },
  { agent: 'roo', rel: path.join('.roo', 'mcp.json') },
  { agent: 'kilo', rel: path.join('.kilocode', 'mcp.json') },
];

export interface McpPolicyScanResult {
  scanned: number;
  total: number;
  high: number;
  /** #241 (FX910): risk-sink writes that threw — surfaced, never loop-aborting. */
  failed: number;
  /** v6.0.8 #528: what the register write did, per chunk. */
  write: ImportWriteOutcome;
}

/**
 * #241 named-candidate fix (FX910): the scan loop behind
 * `failsafe.agentAudit.run`, extracted so the sink-failure behavior is
 * testable. A throwing `upsert` no longer aborts the remaining configs
 * mid-loop — it is counted in `failed` and the scan continues.
 */
export function runMcpPolicyScan(
  workspaceRoot: string,
  upsert: (risk: Record<string, unknown>) => unknown,
  readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf-8'),
  batch?: ImportBatch,
): McpPolicyScanResult {
  // Scan every config first; v6.0.8 #528 then writes the findings in chunks.
  let scanned = 0;
  const found: Array<Record<string, unknown>> = [];
  for (const cand of MCP_CONFIG_CANDIDATES) {
    const file = path.join(workspaceRoot, cand.rel);
    let text: string;
    try { text = readFile(file); } catch { continue; }
    scanned++;
    for (const risk of auditMcpConfig(cand.agent, text)) found.push(risk as unknown as Record<string, unknown>);
  }
  let high = 0;
  const write = writeInChunks(found, {
    write: (risk, side: { high: number }) => {
      const result = upsert(risk);
      if (risk.severity === 'high') side.high++;
      return result;
    },
    newSide: () => ({ high: 0 }),
    keep: (side) => { high += side.high; },
  }, batch);
  return { scanned, total: write.written, high, failed: write.failed, write };
}

export function registerAgentObserveCommands(context: vscode.ExtensionContext, workspaceRoot: string): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.agentAudit.run', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      if (!cfg.get<boolean>('integrations.agentAudit.enabled', false)) {
        vscode.window.showWarningMessage('Agent MCP-policy audit is disabled. Enable `failsafe.integrations.agentAudit.enabled`.');
        return;
      }
      const sink = new RiskRegisterManager(workspaceRoot).importSink();
      // #517 LD8: a re-scan never resets the status the operator triaged.
      // v6.0.8 #528: one register update per 500 findings.
      const r = runMcpPolicyScan(workspaceRoot, (risk) => sink.upsertRisk(risk, { keepStored: ['status'] }), undefined, sink.batch);
      recordIntegrationHealth('agent-audit', ...healthFromMcpScan(r));
      if (r.scanned === 0) { vscode.window.showInformationMessage('Agent MCP-policy audit: no Cline/Roo/Kilo/project MCP config found in this workspace.'); return; }
      if (r.failed > 0) {
        const reason = r.write.writeError ? ` (${r.write.writeError})` : '';
        vscode.window.showWarningMessage(`Agent MCP-policy audit: ${r.failed} finding(s) could not be written to the Risk Register${reason} — findings may be missing. Check FailSafe logs and re-run.`);
      }
      vscode.window.showInformationMessage(`Agent MCP-policy audit: scanned ${r.scanned} config(s) → ${r.total} risk(s) upserted (${r.high} high-severity).`);
    }),

    // #477: the import logic lives in openhands-import-command.ts.
    vscode.commands.registerCommand('failsafe.openhands.observe', () => openHandsImportFromVscode(workspaceRoot)),
  );
}
