// B-EM-3: first-run governance-mode picker. Shows a guided three-option
// QuickPick on first activation, persists the choice to
// `failsafe.governance.mode`, marks onboarded so the picker fires at most
// once per REPOSITORY (#295: workspaceState-gated; the choice writes at
// Workspace scope, and an explicit mode configured at any scope suppresses
// the prompt so pre-existing installs are never re-prompted per repo).

import * as vscode from "vscode";
import type { ConfigManager } from "../shared/ConfigManager";
import { getLesson } from "../education/lessons";

type GovernanceMode = "observe" | "assist" | "enforce";

interface ModePick extends vscode.QuickPickItem {
  mode: GovernanceMode;
}

const ONBOARDED_KEY = "failsafe.onboarded.mode";

export class FirstRunModePicker {
  constructor(private readonly configManager: ConfigManager) {}

  async checkAndRun(): Promise<void> {
    if (this.isOnboarded()) return;

    // #295: an explicit prior choice at ANY scope beats a fresh prompt —
    // repositories opened by a pre-existing install are silently onboarded.
    const existing = vscode.workspace
      .getConfiguration("failsafe")
      .inspect<string>("governance.mode");
    if (
      existing &&
      (existing.globalValue !== undefined ||
        existing.workspaceValue !== undefined ||
        existing.workspaceFolderValue !== undefined)
    ) {
      await this.markOnboarded();
      return;
    }

    // Educational Component (v5.2.0): the quickpick item `detail` is drawn
    // from the lesson registry — a native (no webview expander) surfacing of
    // the `governance-mode` micro-lesson. `getLesson` falls back gracefully,
    // so an absent/empty lesson simply yields no detail line.
    const modeLesson = getLesson("governance-mode", "beginner");

    const picks: ModePick[] = [
      {
        label: "$(shield) Enforce",
        description: "Default — block risky actions; require approval",
        detail: modeLesson,
        mode: "enforce",
      },
      {
        label: "$(warning) Assist",
        description: "Warn before risky actions",
        detail: modeLesson,
        mode: "assist",
      },
      {
        label: "$(eye) Observe",
        description: "Watch what AI agents do; no blocking",
        detail: modeLesson,
        mode: "observe",
      },
    ];

    const chosen = await vscode.window.showQuickPick(picks, {
      title: "FailSafe — Choose Governance Mode",
      placeHolder: "Pick how FailSafe should treat AI-agent actions (dismissing keeps the Enforce default)",
      ignoreFocusOut: true,
    });

    if (chosen) {
      await vscode.workspace
        .getConfiguration("failsafe")
        .update("governance.mode", chosen.mode, vscode.ConfigurationTarget.Workspace);
    }

    // Mark onboarded EVEN if dismissed (no re-prompting per B-EM-3 design).
    await this.markOnboarded();
  }

  private isOnboarded(): boolean {
    return !!this.configManager.getWorkspaceState<boolean>(ONBOARDED_KEY, false);
  }

  private async markOnboarded(): Promise<void> {
    await this.configManager.setWorkspaceState(ONBOARDED_KEY, true);
  }
}
