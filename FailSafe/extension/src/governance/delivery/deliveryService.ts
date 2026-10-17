/**
 * #532 part B (plan-532b LD2-LD7): the delivery functions shared by the Console routes and the
 * `failsafe.delivery.assessActiveIntent` command.
 *
 * - deliveryCandidates: the registered architecture rows with a document path and HEAD's 50 most
 *   recent commits, the only targets a link may name.
 * - prepareDeliveryEdge: checks a link or unlink request against server state and computes what
 *   would be recorded (document hash, HEAD at link time, commit tree and branch) before the
 *   operator is asked. Request-supplied hashes are never read.
 * - writeDeliveryEdge: appends the LINKED / UNLINKED entry (after the operator confirmed).
 * - assessIntentDelivery: re-checks every edge, reads ledger evidence and applies assessDelivery.
 *
 * Read-only apart from writeDeliveryEdge; nothing here opens a network connection.
 */

import type { ArchitectureGit, ArchitectureIndexState } from '../architecture/ArchitectureIndexDiscovery';
import type {
  EdgeWriteResult, IntentEdge, IntentListing, IntentRecordLookup, LinkEdgeParams,
} from '../IntentService';
import type { Intent, IntentEdgeKind, IntentStatus } from '../types/IntentTypes';
import type { DeliveryAssessment } from './deliveryAssessment';
import type { RecentCommits } from './deliveryGit';

/** The slice of IntentService the delivery functions use. */
export interface DeliveryIntents {
  getActiveIntent(): Promise<Intent | null>;
  listIntents(): Promise<IntentListing>;
  getIntentRecord(intentId: string): Promise<IntentRecordLookup>;
  linkEdge(params: LinkEdgeParams): Promise<EdgeWriteResult>;
  unlinkEdge(params: Omit<LinkEdgeParams, 'provenance'>): Promise<EdgeWriteResult>;
}

export interface DeliveryContext {
  workspaceRoot: string;
  intents: DeliveryIntents;
  /** The FailSafe LedgerManager (or null); read only through findEntriesContaining. */
  ledger: unknown;
  git?: ArchitectureGit;
  indexPathSetting?: string;
}

export interface CandidateRow {
  id: string;
  domain: string;
  docPath: string;
  status: string;
}

export interface DeliveryCandidates {
  architecture: { state: ArchitectureIndexState; rows: CandidateRow[] };
  commits: RecentCommits;
}

export interface DeliveryRequest {
  intentId: string;
  edge: IntentEdgeKind;
  target: string;
}

export type EdgeAction = 'link' | 'unlink';

export type PreparedEdge =
  | {
    ok: true;
    action: EdgeAction;
    intent: { id: string; purpose: string };
    edge: IntentEdgeKind;
    target: string;
    provenance: Record<string, unknown>;
    /** Server-side values shown in the confirmation dialog, exactly what is recorded. */
    facts: string[];
  }
  | { ok: false; status: number; error: string };

export interface DeliveryIntentView {
  id: string;
  purpose: string;
  status: IntentStatus;
  active: boolean;
  sealed: boolean;
}

export type DeliveryView =
  | { integrity: 'invalid' }
  | { integrity: 'valid'; found: false }
  | {
    integrity: 'valid';
    found: true;
    intent: DeliveryIntentView;
    /** True only for the active, unsealed intent: links and unlinks are offered for it alone. */
    linkable: boolean;
    edges: IntentEdge[];
    assessment: DeliveryAssessment;
  };

/** Validate a request body: intentId (uuid), edge, target. Returns an error string when invalid. */
export function parseDeliveryRequest(_body: unknown): DeliveryRequest | string {
  throw new Error('not implemented');
}

export function deliveryCandidates(_ctx: DeliveryContext): DeliveryCandidates {
  throw new Error('not implemented');
}

export async function prepareDeliveryEdge(_ctx: DeliveryContext, _action: EdgeAction, _req: DeliveryRequest): Promise<PreparedEdge> {
  throw new Error('not implemented');
}

export async function writeDeliveryEdge(
  _ctx: DeliveryContext, _prepared: Extract<PreparedEdge, { ok: true }>, _actor: string,
): Promise<EdgeWriteResult> {
  throw new Error('not implemented');
}

export async function assessIntentDelivery(_ctx: DeliveryContext, _intentId: string): Promise<DeliveryView> {
  throw new Error('not implemented');
}
