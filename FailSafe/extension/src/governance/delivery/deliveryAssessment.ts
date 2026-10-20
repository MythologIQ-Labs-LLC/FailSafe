/**
 * #532 part B (plan-532b LD6, plan-532c LD2/LD5): the delivery assessment rule, a pure function.
 *
 * Six steps for one intent: the issue it came from, the architecture documents it implements,
 * the commits it was committed under, a review of the implementation, governance evidence
 * already in the FailSafe ledger, and a receipt. Every input is gathered elsewhere
 * (deliveryService.ts); this module only decides each step's status from what it is given and
 * lists the records behind it. Nothing is inferred: a step without a recorded link is `missing`.
 *
 * `recorded` means present, not passed. No source records a review of the implementation yet
 * (B320, B321), so the review step is `missing`, or `failing` when the intent was vetoed; an
 * intent PASS is approval for implementation and is listed, never read as `passing`. Complete is
 * therefore unreachable in this slice, and the assessment says why.
 */

import type { GovernanceEvidence } from './deliveryEvidence';

/** `recorded` means present, not passed. `passing` is defined but nothing produces it until B320/B321. */
export type StepStatus = 'recorded' | 'passing' | 'failing' | 'stale' | 'missing' | 'unavailable';
export type StepKey = 'issue' | 'architecture' | 'code' | 'review' | 'governance' | 'receipt';
export type DeliveryOutcome = 'evidence-complete-except-receipt' | 'incomplete' | 'failing';

export interface DeliveryStep {
  key: StepKey;
  label: string;
  status: StepStatus;
  reason: string;
  records: Array<Record<string, unknown>>;
}

export interface DeliveryAssessment {
  intentId: string;
  overall: DeliveryOutcome;
  /** The first five steps that are not at their complete status, in step order. The receipt is never a gap. */
  gaps: StepKey[];
  steps: DeliveryStep[];
  /** plan-532c LD2: false until FailSafe records a review of the implementation (B320, B321). */
  completeReachable: boolean;
  completeBlockedBy: string[];
}

export const RECEIPT_REASON = 'Blocked on the damaged ledger (#467), B216.';

/** plan-532c LD5: why the review step is missing in this slice. */
export const REVIEW_MISSING_REASON = 'FailSafe records no review of the implementation yet: no command records a review verdict (B320) ' +
  'and no governance event names the commit it evaluated (B321).';
export const COMPLETE_BLOCKED_BY: readonly string[] = Object.freeze(['B320', 'B321']);
/** plan-532c LD5: the intent history chain is unkeyed and its actor is free text. */
export const DECISION_PROVENANCE_NOTE = 'Recorded in the local intent history; the chain shows the entry is unchanged since it was chained, not who wrote it.';

/** Who created an edge (plan-532c LD6); absent on edges recorded before it. */
export interface EdgeOriginFields {
  via?: string | null;
  action?: string | null;
}

export interface ArchitectureEdgeCheck extends EdgeOriginFields {
  target: string;
  docPath: string;
  docSha256: string;
  /** HEAD at link time (null in an unborn repository). */
  sourceSha: string | null;
  status: 'recorded' | 'stale' | 'missing';
  reason?: string;
  currentSha256?: string;
}

export interface CodeEdgeCheck extends EdgeOriginFields {
  sha: string;
  tree: string;
  branch: string | null;
  status: 'recorded' | 'missing';
  reason?: string;
  /** Display only; never an edge. */
  files?: { files: string[]; truncated: boolean } | null;
}

export type EdgeChecks<T> = { state: 'checked'; edges: T[] } | { state: 'unavailable'; reason: string };

export interface IntentDecisionInput {
  status: 'PASS' | 'VETO';
  actor: string;
  timestamp: string;
  entryHash: string | null;
}

export interface DeliveryInputs {
  intentId: string;
  /** The CREATED entry's provenance (null when the intent was not imported) and its entry hash. */
  issue: { provenance: Record<string, unknown> | null; createdEntryHash: string | null };
  architecture: EdgeChecks<ArchitectureEdgeCheck>;
  code: EdgeChecks<CodeEdgeCheck>;
  governance: GovernanceEvidence;
  /** plan-532c LD5: the intent decision (PASS approved for implementation, VETO blocked), or null. */
  decision: IntentDecisionInput | null;
}

const LABELS: Record<StepKey, string> = {
  issue: 'External issue', architecture: 'Governing architecture', code: 'Implementation', review: 'Review',
  governance: 'Governance evidence', receipt: 'Delivery receipt',
};

/** The status at which a step counts as complete; anything else is a gap. */
const COMPLETE_STATUS: Record<Exclude<StepKey, 'receipt'>, StepStatus> = {
  issue: 'recorded', architecture: 'recorded', code: 'recorded', review: 'passing', governance: 'recorded',
};

const step = (key: StepKey, status: StepStatus, reason: string, records: Array<Record<string, unknown>> = []): DeliveryStep =>
  ({ key, label: LABELS[key], status, reason, records });

const origin = (e: EdgeOriginFields): Record<string, unknown> =>
  ({ ...(e.via ? { via: e.via } : {}), ...(e.action ? { action: e.action } : {}) });

/** Issue: recorded when the CREATED entry carries provenance with a content hash. Never re-fetched, never stale. */
function issueStep(issue: DeliveryInputs['issue']): DeliveryStep {
  const p = issue.provenance;
  if (!p || typeof p.contentSha256 !== 'string' || !p.contentSha256) {
    return step('issue', 'missing', 'This intent was not imported from an issue, so there is no recorded issue content.');
  }
  return step('issue', 'recorded', 'The intent records the issue content it was created from.', [{
    source: p.source ?? null, key: p.key ?? null, externalRef: p.externalRef ?? null, url: p.url ?? null,
    fetchedAt: p.fetchedAt ?? null, contentSha256: p.contentSha256, createdEntryHash: issue.createdEntryHash,
  }]);
}

/** Missing with no edge or any missing edge, else stale if any edge is stale, else recorded. */
function edgeStatus(statuses: string[]): StepStatus {
  if (!statuses.length || statuses.includes('missing')) return 'missing';
  return statuses.includes('stale') ? 'stale' : 'recorded';
}

function architectureStep(checks: EdgeChecks<ArchitectureEdgeCheck>): DeliveryStep {
  if (checks.state === 'unavailable') return step('architecture', 'unavailable', checks.reason);
  const status = edgeStatus(checks.edges.map((e) => e.status));
  const reason = !checks.edges.length ? 'No architecture document is linked to this intent.'
    : status === 'missing' ? 'A linked document is gone, outside the workspace, or no longer registered with that path.'
      : status === 'stale' ? 'A linked document changed since it was linked.'
        : 'Every linked document still has the hash recorded at link time.';
  return step('architecture', status, reason, checks.edges.map((e) => ({
    target: e.target, docPath: e.docPath, docSha256: e.docSha256, sourceSha: e.sourceSha, status: e.status,
    ...(e.currentSha256 ? { currentSha256: e.currentSha256 } : {}), ...(e.reason ? { reason: e.reason } : {}), ...origin(e),
  })));
}

function codeStep(checks: EdgeChecks<CodeEdgeCheck>): DeliveryStep {
  if (checks.state === 'unavailable') return step('code', 'unavailable', checks.reason);
  const status = edgeStatus(checks.edges.map((e) => e.status));
  const reason = !checks.edges.length ? 'No commit is linked to this intent.'
    : status === 'missing' ? 'A linked commit cannot be found in this repository.'
      : 'Every linked commit is present in this repository.';
  return step('code', status, reason, checks.edges.map((e) => ({
    sha: e.sha, tree: e.tree, branch: e.branch, status: e.status, ...(e.reason ? { reason: e.reason } : {}),
    ...(e.files ? { files: e.files.files, filesTruncated: e.files.truncated } : {}), ...origin(e),
  })));
}

/**
 * Review: no source records a review of the implementation yet (B320, B321). A standing VETO is
 * `failing` ("Intent vetoed"); otherwise `missing`. A standing PASS is listed as approval for
 * implementation and changes no status.
 */
function reviewStep(decision: IntentDecisionInput | null): DeliveryStep {
  if (!decision) return step('review', 'missing', REVIEW_MISSING_REASON);
  const vetoed = decision.status === 'VETO';
  const record = {
    decision: vetoed ? 'vetoed' : 'approved for implementation (not a review)',
    status: decision.status, actor: decision.actor, timestamp: decision.timestamp, entryHash: decision.entryHash,
    provenance: DECISION_PROVENANCE_NOTE,
  };
  return vetoed
    ? step('review', 'failing', `Intent vetoed by ${decision.actor} at ${decision.timestamp}.`, [record])
    : step('review', 'missing', REVIEW_MISSING_REASON, [record]);
}

function governanceStep(evidence: GovernanceEvidence): DeliveryStep {
  if (evidence.state === 'unavailable') return step('governance', 'unavailable', evidence.reason);
  if (!evidence.records.length) {
    return step('governance', 'missing', 'No FailSafe ledger entry names this intent.');
  }
  const more = evidence.truncated ? ' More entries may exist than are listed.' : '';
  return step('governance', 'recorded',
    `${evidence.records.length} FailSafe ledger entr${evidence.records.length === 1 ? 'y names' : 'ies name'} this intent. ` +
    `Present, not passed.${more}`,
    evidence.records.map((r) => ({ ...r })));
}

export function assessDelivery(input: DeliveryInputs): DeliveryAssessment {
  const steps = [
    issueStep(input.issue),
    architectureStep(input.architecture),
    codeStep(input.code),
    reviewStep(input.decision),
    governanceStep(input.governance),
    step('receipt', 'unavailable', RECEIPT_REASON),
  ];
  const gaps = steps.slice(0, 5)
    .filter((s) => s.status !== COMPLETE_STATUS[s.key as Exclude<StepKey, 'receipt'>])
    .map((s) => s.key);
  const overall: DeliveryOutcome = steps.some((s) => s.status === 'failing') ? 'failing'
    : gaps.length ? 'incomplete' : 'evidence-complete-except-receipt';
  return {
    intentId: input.intentId, overall, gaps, steps,
    completeReachable: false, completeBlockedBy: [...COMPLETE_BLOCKED_BY],
  };
}
