/**
 * #531 LD5: `failsafe.architecture.bootstrapIndex` ("FailSafe: Bootstrap Architecture Index").
 *
 * Runs the same bootstrap function as the Console route, through the same confirmer instance
 * (so one busy guard covers both), and returns the typed result.
 */

import * as vscode from "vscode";
import type { ConfirmOperatorAction } from "./operatorConfirmation";
import { runArchitectureIndexBootstrap, type BootstrapResult } from "../governance/architecture/ArchitectureIndexBootstrap";

export const ARCHITECTURE_BOOTSTRAP_COMMAND = "failsafe.architecture.bootstrapIndex";

export function readArchitectureIndexPath(): string | undefined {
  return vscode.workspace.getConfiguration("failsafe.architecture").get<string>("indexPath");
}

export interface ArchitectureIndexCommandDeps {
  workspaceRoot: string;
  confirm: ConfirmOperatorAction;
  getLedger: () => unknown;
  broadcast: (data: Record<string, unknown>) => void;
}

function report(result: BootstrapResult): void {
  const info = (m: string): void => { void vscode.window.showInformationMessage(m); };
  const warn = (m: string): void => { void vscode.window.showWarningMessage(m); };
  switch (result.status) {
    case "created": {
      const ledger = typeof result.ledger === "object"
        ? `Recorded as ledger entry #${result.ledger.entryId}.`
        : result.ledger === "failed" ? "The ledger entry could not be written." : "The FailSafe ledger is unavailable, so the creation is not recorded.";
      info(`FailSafe created ${result.path} with ${result.rows} row(s). ${ledger}`);
      return;
    }
    case "reuse": info(`An architecture index already exists at ${result.path}; FailSafe left it unchanged.`); return;
    case "appeared": warn(`A file appeared at ${result.path} before FailSafe could write it; it was not overwritten.`); return;
    case "confirmation":
      if (result.confirmation === "busy") warn("Another FailSafe confirmation is open; nothing was created.");
      return;
    case "refused": warn(`FailSafe cannot create the architecture index here (${result.state}).`); return;
    case "outside-workspace": warn(`${result.path} resolves outside the workspace; nothing was created.`); return;
    default: void vscode.window.showErrorMessage(`FailSafe could not write ${result.path}: ${result.error}`);
  }
}

export function registerArchitectureIndexCommand(context: vscode.ExtensionContext, deps: ArchitectureIndexCommandDeps): void {
  context.subscriptions.push(vscode.commands.registerCommand(ARCHITECTURE_BOOTSTRAP_COMMAND, async (): Promise<BootstrapResult> => {
    const result = await runArchitectureIndexBootstrap({
      workspaceRoot: deps.workspaceRoot, indexPathSetting: readArchitectureIndexPath(), confirm: deps.confirm,
      source: "command", ledger: deps.getLedger(),
    });
    if (result.status === "created") deps.broadcast({ type: "architecture.index.changed", path: result.path });
    report(result);
    return result;
  }));
}
