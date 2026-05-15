/**
 * Bootstrap Startup Checks
 *
 * Extracted from main.ts to satisfy Section 4 Razor (B97).
 * Framework sync detection and hook sentinel config sync.
 */

import * as vscode from "vscode";
import { syncHookSentinel } from "../shared/hookSentinel";
import type { SystemRegistry } from "../qorelogic/SystemRegistry";

export function bootstrapStartupChecks(
  context: vscode.ExtensionContext,
  core: { workspaceRoot: string },
  qor: { systemRegistry: SystemRegistry },
): void {
  // Framework sync detection (delayed to avoid blocking activation)
  setTimeout(async () => {
    const { FrameworkSync } = await import("../qorelogic/FrameworkSync");
    const frameworkSync = new FrameworkSync(
      core.workspaceRoot,
      qor.systemRegistry,
    );
    const systems = await frameworkSync.detectSystems();
    const ungoverned = systems.filter(
      (s) => s.isInstalled && !s.hasGovernance,
    );
    if (ungoverned.length > 0) {
      const choice = await vscode.window.showInformationMessage(
        `FailSafe detected ${ungoverned.length} ungoverned AI system(s).`,
        "View Details",
        "Ignore",
      );
      if (choice === "View Details")
        vscode.commands.executeCommand("failsafe.syncFramework");
    }
  }, 3000);

  // B107: Sync VS Code sentinel.enabled setting with hook sentinel file
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders?.[0]) {
    const wsRoot = workspaceFolders[0].uri.fsPath;
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("failsafe.sentinel.enabled")) {
          const enabled = vscode.workspace
            .getConfiguration("failsafe")
            .get<boolean>("sentinel.enabled", true);
          syncHookSentinel(wsRoot, enabled);
        }
      }),
    );
  }
}
