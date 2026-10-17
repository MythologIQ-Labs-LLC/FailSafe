/**
 * #532 part B (plan-532b LD7): delivery assessment routes.
 *
 *   GET  /api/v1/delivery/intents          the active intent and archived sealed intents
 *   GET  /api/v1/delivery/intents/:id      one intent's edges and five-step assessment
 *   GET  /api/v1/delivery/candidates       registered architecture rows and HEAD's 50 recent commits
 *   POST /api/actions/delivery/link        {intentId, edge, target}: record an edge after the modal
 *   POST /api/actions/delivery/unlink      {intentId, edge, target}: remove an edge after the modal
 *
 * Every route is loopback-only and rate limited. Writes act only after the operator approves a
 * modal VS Code dialog built from server-side values. Nothing leaves the machine.
 */

import type { Application, Request, Response } from "express";
import type { ConfirmOperatorAction } from "../../extension/operatorConfirmation";
import type { ArchitectureGit } from "../../governance/architecture/ArchitectureIndexDiscovery";
import type { DeliveryIntents } from "../../governance/delivery/deliveryService";

export interface DeliveryRouteDeps {
  rejectIfRemote(req: Request, res: Response): boolean;
  workspaceRoot: string;
  /** Read at request time (bootstrapServers wires it after the routes register); absent -> 503. */
  getIntentService: () => DeliveryIntents | null | undefined;
  /** Read at request time; null, disabled and stub ledgers all count as unavailable. */
  getLedgerManager: () => unknown;
  /** `failsafe.architecture.indexPath`, read at request time. */
  getIndexPathSetting?: () => string | undefined;
  /** Modal confirmer; a lazy getter on the registrar's deps. Absent -> writes answer 503. */
  confirmOperatorAction?: ConfirmOperatorAction;
  broadcast?: (data: Record<string, unknown>) => void;
  git?: ArchitectureGit;
}

export function setupDeliveryRoutes(_app: Application, _deps: DeliveryRouteDeps): void {
  // Red-first stub (#532): routes are registered by the implementation.
}
