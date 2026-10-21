/**
 * #532 part B (plan-532b LD7): `failsafe.delivery.assessActiveIntent`
 * ("FailSafe: Assess Delivery of the Active Intent").
 *
 * Read-only: runs the same assessment as GET /api/v1/delivery/intents/:id for the active intent,
 * shows a one-line summary and returns the typed view. It records nothing and opens no network
 * connection; links are made in the Console (Workspace > Delivery) after a VS Code confirmation, and
 * reviews with failsafe.delivery.recordReview or the Console (plan-b320).
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
  // plan-b320 LD7: complete is reachable unless the ledger or git cannot be read.
  const unreachable = a.completeReachable === false
    ? ` Complete cannot be assessed while ${a.completeBlockedBy.map((b) => (b === "git-unavailable" ? "git is unavailable" : "the ledger is unavailable")).join(" and ")}.` : "";
  const review = a.steps.find((s) => s.key === "review");
  const purpose = view.intent.purpose;
  if (a.overall === "failing") {
    // Name the actual reason: a review VETO, an unverifiable record, a continuity break or the intent's own VETO.
    const failing = a.steps.find((s) => s.status === "failing");
    const why = failing && failing.key === "review" ? failing.reason : `${failing ? failing.label : "a step"} is failing`;
    return `Delivery of "${purpose}" is failing: ${why.length > 300 ? `${why.slice(0, 299)}…` : why} Gaps: ${labels.join(", ")}.${unreachable} Receipt unavailable (#467).`;
  }
  if (a.overall === "evidence-complete-except-receipt") {
    return `Delivery of "${purpose}": evidence complete except the receipt (unavailable until the ledger repair, #467). New evidence will need a fresh review.`;
  }
  if (a.overall === "awaiting-review") {
    const state = review && review.status === "stale" ? "the latest review PASS is no longer current" : "no review PASS is recorded";
    return `Delivery of "${purpose}" is awaiting review: ${state}. Record a PASS or VETO on the newest linked commit (FailSafe: Record a Delivery Review). Receipt unavailable (#467).`;
  }
  return `Delivery of "${purpose}" is incomplete: ${labels.join(", ")}.${unreachable} Receipt unavailable (#467).`;
}

/** Exported for the unit test of each summary branch. */
export const summarizeDelivery = summarize;

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
