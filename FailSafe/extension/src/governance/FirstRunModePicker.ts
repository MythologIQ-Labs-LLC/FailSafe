// B-EM-3: first-run governance-mode picker. Shows a guided three-option
// QuickPick on first activation per global state, persists the choice to
// `failsafe.governance.mode`, marks onboarded so the picker fires at most
// once per operator.

import * as vscode from "vscode";
import type { ConfigManager } from "../shared/ConfigManager";

type GovernanceMode = "observe" | "assist" | "enforce";

interface ModePick extends vscode.QuickPickItem {
  mode: GovernanceMode;
}

const ONBOARDED_KEY = "failsafe.onboarded.mode";

export class FirstRunModePicker {
  constructor(private readonly configManager: ConfigManager) {}

  async checkAndRun(): Promise<void> {
    if (this.isOnboarded()) return;

    const picks: ModePick[] = [
      {
        label: "$(eye) Observe",
        description: "Watch what AI agents do; no blocking",
        mode: "observe",
      },
      {
        label: "$(warning) Assist",
        description: "Warn before risky actions",
        mode: "assist",
      },
      {
        label: "$(shield) Enforce",
        description: "Block risky actions; require approval",
        mode: "enforce",
      },
    ];

    const chosen = await vscode.window.showQuickPick(picks, {
      title: "FailSafe — Choose Governance Mode",
      placeHolder: "Pick how FailSafe should treat AI-agent actions",
      ignoreFocusOut: true,
    });

    if (chosen) {
      await vscode.workspace
        .getConfiguration("failsafe")
        .update("governance.mode", chosen.mode, vscode.ConfigurationTarget.Global);
    }

    // Mark onboarded EVEN if dismissed (no re-prompting per B-EM-3 design).
    await this.markOnboarded();
  }

  private isOnboarded(): boolean {
    return !!this.configManager.getGlobalState<boolean>(ONBOARDED_KEY, false);
  }

  private async markOnboarded(): Promise<void> {
    await this.configManager.setGlobalState(ONBOARDED_KEY, true);
  }
}
