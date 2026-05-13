import * as vscode from 'vscode';
import { Intent } from './types/IntentTypes';
import type { GovernanceMode, GovernanceModeState } from './EnforcementEngine';

const INTENT_COLOR_MAP: Record<string, string> = {
  PULSE: 'charts.yellow',
  PASS: 'charts.green',
  VETO: 'charts.red',
  SEALED: 'charts.blue',
};

const MODE_LABEL_MAP: Record<GovernanceMode, string> = {
  observe: 'Observe',
  assist: 'Assist',
  enforce: 'Enforce',
};

export class GovernanceStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private modeItem: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'failsafe.showMenu';
    this.modeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.modeItem.command = 'failsafe.setGovernanceMode';
  }

  update(intent: Intent | null) {
    if (!intent) {
      this.item.text = '$(circle-outline) FailSafe: Idle';
      this.item.color = new vscode.ThemeColor('descriptionForeground');
      this.item.tooltip = 'No active intent. Writes will be BLOCKED.';
    } else {
      const color = INTENT_COLOR_MAP[intent.status] || 'descriptionForeground';
      this.item.text = `$(shield) FailSafe: ${intent.status}`;
      this.item.color = new vscode.ThemeColor(color);
      this.item.tooltip = `Active Intent: ${intent.purpose}\nScope: ${intent.scope.files.length} files`;
    }
    this.item.show();
  }

  updateMode(state: GovernanceModeState): void {
    const label = this.renderModeLabel(state);
    this.modeItem.text = label;
    this.modeItem.tooltip = state.defaulted
      ? 'Governance mode defaulted to Observe. Click to choose Assist or Enforce.'
      : `Governance mode: ${MODE_LABEL_MAP[state.mode]}. Click to change.`;
    this.modeItem.show();
  }

  renderModeLabel(state: GovernanceModeState): string {
    const friendly = MODE_LABEL_MAP[state.mode];
    if (state.defaulted) {
      return `Mode: ${friendly} (default)`;
    }
    return `Mode: ${friendly}`;
  }

  dispose() {
    this.item.dispose();
    this.modeItem.dispose();
  }
}
