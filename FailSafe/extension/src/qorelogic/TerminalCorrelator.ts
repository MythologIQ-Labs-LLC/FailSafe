import * as vscode from 'vscode';
import { AgentTerminalInfo } from './SystemRegistry';

const AGENT_PATTERNS: Record<string, string> = {
  claude: 'claude',
  copilot: 'copilot',
  cursor: 'cursor',
  codex: 'codex',
  windsurf: 'windsurf',
  'devin-desktop': 'devin', // GH #161: Devin Desktop (formerly Windsurf)
};

export class TerminalCorrelator {
  correlate(terminal: vscode.Terminal): AgentTerminalInfo | undefined {
    const name = terminal.name.toLowerCase();
    for (const [agentType, pattern] of Object.entries(AGENT_PATTERNS)) {
      if (name.includes(pattern)) {
        const idx = vscode.window.terminals.indexOf(terminal);
        return { name: terminal.name, terminalIndex: idx, agentType };
      }
    }
    return undefined;
  }

  correlateAll(): AgentTerminalInfo[] {
    const results: AgentTerminalInfo[] = [];
    for (const terminal of vscode.window.terminals) {
      const match = this.correlate(terminal);
      if (match) results.push(match);
    }
    return results;
  }
}
