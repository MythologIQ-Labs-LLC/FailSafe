/**
 * #532 (plan-532c LD7, B286): after FailSafe's governed commit, offer to link the commit it made
 * to the active intent as a `committed-under` edge.
 *
 * The target is the commit the governed commit bound to this run (its parent, tree, message and
 * branch tip were checked in commitPushOpenPr), never a re-read HEAD. The edge is prepared with
 * the same delivery functions as the Workspace > Delivery link, so the commit must be one of
 * HEAD's 50 most recent commits and resolve, and a duplicate is refused before any dialog. The
 * operator then approves a modal VS Code dialog built from server-side values (the shared
 * confirmer, one busy guard with the Console routes). Declined, busy, unwired or refused: nothing
 * is written. Nothing leaves the machine.
 */

import type { ArchitectureGit } from '../governance/architecture/ArchitectureIndexDiscovery';
import type { DeliveryContext, DeliveryIntents } from '../governance/delivery/deliveryService';
import type { ConfirmOperatorAction } from './operatorConfirmation';
import type { GovernedCommitLinkFn } from './governedCommitFlow';

export type GovernedLinkOutcome =
  | 'linked' | 'no-intent-service' | 'no-active-intent' | 'no-commit' | 'refused' | 'declined' | 'busy' | 'unwired' | 'failed';

export interface GovernedLinkRequest {
  /** The bound commit from commitPushOpenPr; undefined when it could not be bound. */
  commitSha: string | undefined;
  /** The governed action that made the commit (organize, initialize). */
  action: string;
  /** The paths FailSafe staged for the commit. */
  requestedPaths: string[];
}

export interface GovernedLinkResult {
  outcome: GovernedLinkOutcome;
  detail: string;
}

export async function offerCommittedUnderLink(
  ctx: DeliveryContext, confirm: ConfirmOperatorAction | undefined, req: GovernedLinkRequest,
): Promise<GovernedLinkResult> {
  void ctx; void confirm; void req; // RED STUB
  return { outcome: 'failed', detail: 'not implemented' };
}

export interface GovernedCommitLinkerDeps {
  workspaceRoot: string;
  getIntents: () => DeliveryIntents | null | undefined;
  getLedger: () => unknown;
  confirm: ConfirmOperatorAction | undefined;
  getIndexPathSetting?: () => string | undefined;
  /** One line per outcome (the output channel in production). */
  log: (line: string) => void;
  git?: ArchitectureGit;
}

/** The `linkCommit` callback runGovernedCommitFlow calls after a bound commit. */
export function governedCommitLinker(deps: GovernedCommitLinkerDeps): GovernedCommitLinkFn {
  void deps; // RED STUB
  return async () => undefined;
}
