/**
 * #532 part B (plan-532b LD7): `failsafe.delivery.assessActiveIntent`
 * ("FailSafe: Assess Delivery of the Active Intent").
 *
 * Read-only: runs the same assessment as GET /api/v1/delivery/intents/:id for the active intent,
 * shows a one-line summary and returns the typed view. It records nothing and opens no network
 * connection; links are made in the Console (Workspace > Delivery) after a VS Code confirmation.
 */

import * as vscode from "vscode";
import { assessIntentDelivery, type DeliveryIntents, type DeliveryView } from "../governance/delivery/deliveryService";

export const DELIVERY_ASSESS_COMMAND = "failsafe.delivery.assessActiveIntent";

export interface DeliveryAssessmentCommandDeps {
  workspaceRoot: string;
  intents: DeliveryIntents;
  getLedger: () => unknown;
  getIndexPathSetting?: () => string | undefined;
}

export type DeliveryCommandResult = DeliveryView | { integrity: "valid"; found: false; reason: "no-active-intent" };

function summarize(view: DeliveryView): string {
  if (view.integrity === "invalid") return "FailSafe cannot assess delivery: the intent history failed its chain check.";
  if (!view.found) return "FailSafe found no such intent.";
  const a = view.assessment;
  const labels = a.steps.filter((s) => a.gaps.includes(s.key)).map((s) => `${s.label} ${s.status}`);
  // plan-532c LD9: say why complete is not reachable (no review of the implementation is recorded yet).
  const unreachable = a.completeReachable === false
    ? ` Complete is not reachable until FailSafe records a review of the implementation (${a.completeBlockedBy.join(", ")}).` : "";
  if (a.overall === "failing") {
    return `Delivery of "${view.intent.purpose}" is failing: the intent was vetoed. Gaps: ${labels.join(", ")}.${unreachable} Receipt unavailable (#467).`;
  }
  return a.overall === "evidence-complete-except-receipt"
    ? `Delivery of "${view.intent.purpose}": evidence complete except the receipt (unavailable until the ledger repair, #467).`
    : `Delivery of "${view.intent.purpose}" is incomplete: ${labels.join(", ")}.${unreachable} Receipt unavailable (#467).`;
}

export function registerDeliveryAssessmentCommand(context: vscode.ExtensionContext, deps: DeliveryAssessmentCommandDeps): void {
  context.subscriptions.push(vscode.commands.registerCommand(DELIVERY_ASSESS_COMMAND, async (): Promise<DeliveryCommandResult> => {
    const active = await deps.intents.getActiveIntent();
    if (!active) {
      void vscode.window.showInformationMessage("FailSafe: there is no active intent to assess.");
      return { integrity: "valid", found: false, reason: "no-active-intent" };
    }
    const view = await assessIntentDelivery({
      workspaceRoot: deps.workspaceRoot, intents: deps.intents, ledger: deps.getLedger(),
      indexPathSetting: deps.getIndexPathSetting?.(),
    }, active.id);
    void vscode.window.showInformationMessage(summarize(view));
    return view;
  }));
}
