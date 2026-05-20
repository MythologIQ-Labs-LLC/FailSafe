/**
 * Advanced Commands Bootstrap Module
 *
 * Registers Gap commands (break-glass, verdict replay) and ceremony commands.
 */

import * as vscode from "vscode";
import { Logger } from "../shared/Logger";
import type { LedgerManager } from "../qorelogic/ledger/LedgerManager";
import type { PolicyEngine } from "../qorelogic/policies/PolicyEngine";
import type { BreakGlassProtocol } from "../governance/BreakGlassProtocol";
import type { SystemRegistry } from "../qorelogic/SystemRegistry";
import type { CommitGuard } from "../governance/CommitGuard";
import type { ConfigManager } from "../shared/ConfigManager";
import type { EventBus } from "../shared/EventBus";
import type { GovernanceMode } from "../governance/types";

export interface AdvancedCommandsDeps {
  ledgerManager: LedgerManager;
  policyEngine: PolicyEngine;
  breakGlass: BreakGlassProtocol;
  systemRegistry: SystemRegistry;
  commitGuard: CommitGuard;
  configManager: ConfigManager;
  workspaceRoot: string;
  showRevert: (checkpointId: string) => void;
  /** B194 wiring: emit `governance.modeChanged` alongside ledger write. */
  eventBus?: EventBus;
}

export function registerAdvancedCommands(
  context: vscode.ExtensionContext,
  deps: AdvancedCommandsDeps,
  logger: Logger,
): void {
  // Gap 1: Mode-change audit trail
  let lastKnownMode = vscode.workspace
    .getConfiguration("failsafe")
    .get<string>("governance.mode", "observe");

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("failsafe.governance.mode")) {
        const newMode = vscode.workspace
          .getConfiguration("failsafe")
          .get<string>("governance.mode", "observe");
        if (newMode !== lastKnownMode) {
          const previousMode = lastKnownMode;
          lastKnownMode = newMode;
          const timestamp = new Date().toISOString();
          deps.ledgerManager
            .appendEntry({
              eventType: "USER_OVERRIDE",
              agentDid: "vscode-user",
              payload: { action: "governance_mode_changed", previousMode, newMode },
            })
            .catch((err) => logger.error("Failed to record mode change", err));
          // B194: emit transition on the bus for ModeTransitionHistory + UI surfaces.
          if (deps.eventBus) {
            deps.eventBus.emit("governance.modeChanged", {
              previousMode: previousMode as GovernanceMode,
              newMode: newMode as GovernanceMode,
              reason: "config_edit",
              actor: "vscode-user",
              timestamp,
              ledgerEntryRef: null,
            });
          }
        }
      }
    }),
  );

  // Gap 2: Break-glass commands
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.breakGlass", async () => {
      const reason = await vscode.window.showInputBox({
        prompt: "Break-Glass Justification (min 10 chars)",
        validateInput: (v) => (v.length < 10 ? "Min 10 characters" : undefined),
      });
      if (!reason) return;

      const durationStr = await vscode.window.showQuickPick(
        ["15", "30", "60", "120", "240"],
        { placeHolder: "Override duration (minutes)" },
      );
      if (!durationStr) return;

      const currentMode = vscode.workspace
        .getConfiguration("failsafe")
        .get<string>("governance.mode", "observe") as "observe" | "assist" | "enforce";
      try {
        const record = await deps.breakGlass.activate(
          { reason, durationMinutes: parseInt(durationStr, 10), requestedBy: "vscode-user" },
          currentMode,
        );
        vscode.window.showWarningMessage(`Break-glass active until ${record.expiresAt}`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Break-glass failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.revokeBreakGlass", async () => {
      try {
        const record = await deps.breakGlass.revoke("vscode-user");
        vscode.window.showInformationMessage(
          `Break-glass revoked. Mode restored: ${record.previousMode}`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Revoke failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),
  );

  // Gap 4: Verdict Replay command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.replayVerdict", async () => {
      const entryIdStr = await vscode.window.showInputBox({
        prompt: "Ledger Entry ID to replay",
        validateInput: (v) => (/^\d+$/.test(v) ? undefined : "Must be a number"),
      });
      if (!entryIdStr) return;

      const { VerdictReplayEngine } = await import("../governance/VerdictReplayEngine");
      const engine = new VerdictReplayEngine(deps.ledgerManager, deps.policyEngine);
      try {
        const result = await engine.replay(parseInt(entryIdStr, 10));
        if (result.match) {
          vscode.window.showInformationMessage(
            `Verdict replay MATCHED (Entry #${entryIdStr})`,
          );
        } else {
          vscode.window.showWarningMessage(
            `Verdict replay DIVERGED: ${result.divergenceReason}`,
          );
        }
        if (result.warnings.length > 0) {
          logger.warn("Replay warnings", { warnings: result.warnings });
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Replay failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }),
  );

  // Multi-Agent Ceremony (B85) — fire-and-forget; swallow its own errors so a
  // ceremony-init failure (e.g. FirstRunOnboarding configManager wiring) does
  // not surface as an UnhandledPromiseRejection that masks the real activate
  // outcome.
  registerCeremonyCommands(context, deps).catch((err) => {
    logger.warn("registerCeremonyCommands failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Undo Last Attempt (B60)
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.undoLastAttempt", async () => {
      const checkpointId = await vscode.window.showInputBox({
        prompt: "Checkpoint ID to revert to",
        placeHolder: "Enter checkpoint ID",
      });
      if (!checkpointId) return;
      deps.showRevert(checkpointId);
    }),
  );

  // Commit Hook commands (B92)
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.installCommitHook", async () => {
      await deps.commitGuard.install();
      vscode.window.showInformationMessage("FailSafe commit hook installed.");
    }),
    vscode.commands.registerCommand("failsafe.removeCommitHook", async () => {
      await deps.commitGuard.uninstall();
      vscode.window.showInformationMessage("FailSafe commit hook removed.");
    }),
  );
}

async function registerCeremonyCommands(
  context: vscode.ExtensionContext,
  deps: AdvancedCommandsDeps,
): Promise<void> {
  const { AgentConfigInjector } = await import("../qorelogic/AgentConfigInjector");
  const { GovernanceCeremony } = await import("../governance/GovernanceCeremony");
  const ceremony = new GovernanceCeremony(
    deps.systemRegistry,
    new AgentConfigInjector(deps.systemRegistry, deps.workspaceRoot),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.onboardAgent", () =>
      ceremony.showQuickPick(),
    ),
  );

  // First-Run Onboarding (B88)
  const { FirstRunOnboarding } = await import("../genesis/FirstRunOnboarding");
  const onboarding = new FirstRunOnboarding(deps.configManager, ceremony);
  await onboarding.checkAndRun();

  // First-Run Mode Picker (B-EM-3): independent gate (failsafe.onboarded.mode);
  // surfaces three-option modal explaining observe/assist/enforce. Fires once
  // per operator across all workspaces. Dismissal still marks onboarded so
  // the picker does not re-prompt.
  const { FirstRunModePicker } = await import("../governance/FirstRunModePicker");
  const modePicker = new FirstRunModePicker(deps.configManager);
  await modePicker.checkAndRun();
}
