/**
 * #532 part B (plan-532b LD7): `failsafe.delivery.assessActiveIntent`
 * ("FailSafe: Assess Delivery of the Active Intent").
 *
 * Read-only: runs the same assessment as GET /api/v1/delivery/intents/:id for the active intent,
 * shows a one-line summary and returns the typed view.
 */

import * as vscode from "vscode";
import type { DeliveryIntents, DeliveryView } from "../governance/delivery/deliveryService";

export const DELIVERY_ASSESS_COMMAND = "failsafe.delivery.assessActiveIntent";

export interface DeliveryAssessmentCommandDeps {
  workspaceRoot: string;
  intents: DeliveryIntents;
  getLedger: () => unknown;
  getIndexPathSetting?: () => string | undefined;
}

export type DeliveryCommandResult = DeliveryView | { integrity: "valid"; found: false; reason: "no-active-intent" };

export function registerDeliveryAssessmentCommand(_context: vscode.ExtensionContext, _deps: DeliveryAssessmentCommandDeps): void {
  // Red-first stub (#532): the implementation registers the command.
}
