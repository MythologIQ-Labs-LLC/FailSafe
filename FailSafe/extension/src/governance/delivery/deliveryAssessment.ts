/**
 * #532 part B (plan-532b LD6, plan-532c LD2/LD5, plan-b320 LD7/LD8): the delivery assessment rule,
 * a pure function.
 *
 * Six steps for one intent: the issue it came from, the architecture documents it implements,
 * the commits it was committed under, a review of the implementation, governance evidence
 * already in the FailSafe ledger, and a receipt. Every input is gathered elsewhere
 * (deliveryService.ts, deliveryReview.ts); this module only decides each step's status from what it
 * is given and lists the records behind it. Nothing is inferred: a step without a recorded link is
 * `missing`.
 *
 * `recorded` means present, not passed. The review step is `passing` only for a current covering
 * PASS recorded through the operator-confirmed delivery review (B320/B321); an intent PASS is
 * approval for implementation and is listed, never read as `passing`. A review VETO, an
 * unverifiable review record, a ledger continuity break or the intent's own VETO makes it
 * `failing`; a PASS that no longer matches the workspace is `stale`; no PASS is `missing`, read as
 * awaiting review. Complete means evidence complete except the receipt, which stays unavailable
 * until the ledger repair (#467) and is never claimed.
 */

import type { GovernanceEvidence } from './deliveryEvidence';
import type { ReviewAssessment } from './deliveryReview';

/** `recorded` means present, not passed. `passing` is produced only by a current covering review PASS. */
export type StepStatus = 'recorded' | 'passing' | 'failing' | 'stale' | 'missing' | 'unavailable';
export type StepKey = 'issue' | 'architecture' | 'code' | 'review' | 'governance' | 'receipt';
export type DeliveryOutcome = 'evidence-complete-except-receipt' | 'awaiting-review' | 'incomplete' | 'failing';

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
  /** plan-b320 LD7: derived; false only while the ledger or git cannot be read. */
  completeReachable: boolean;
  completeBlockedBy: string[];
}

export const RECEIPT_REASON = 'Blocked on the damaged ledger (#467), B216.';

/** plan-b320 LD7: the review step with no PASS recorded on a linked commit. */
export const REVIEW_AWAITING_REASON = 'Awaiting review: no PASS is recorded on a linked commit. Record a PASS or VETO on the newest ' +
  'linked commit (Workspace > Delivery, or the command FailSafe: Record a Delivery Review).';
/** plan-b320 should-fix 10: the intent decision is not sticky; only a review VETO is. */
export const INTENT_VETO_NOTE = 'An intent VETO is cleared by a later status change (for example back to PULSE); a review VETO stands until a later PASS names it.';
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
  /** plan-b320 LD8: `stale` when the commit now resolves to a different tree than the one recorded. */
  status: 'recorded' | 'stale' | 'missing';
  reason?: string;
  currentTree?: string;
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
  /** plan-b320 LD6: the operator-confirmed delivery reviews, assessed. */
  review: ReviewAssessment;
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
      : status === 'stale' ? 'A linked commit now resolves to a different tree than the one recorded when it was linked.'
        : 'Every linked commit is present in this repository with the tree recorded when it was linked.';
  return step('code', status, reason, checks.edges.map((e) => ({
    sha: e.sha, tree: e.tree, branch: e.branch, status: e.status, ...(e.reason ? { reason: e.reason } : {}),
    ...(e.currentTree ? { currentTree: e.currentTree } : {}),
    ...(e.files ? { files: e.files.files, filesTruncated: e.files.truncated } : {}), ...origin(e),
  })));
}

/**
 * Review (plan-b320 LD7), in this order: `unavailable` when the ledger or git cannot be read;
 * `failing` for any blocking item (a review VETO, an unverifiable record, a continuity break) or
 * the intent's own VETO; `passing` for a current covering PASS; `stale` when the latest PASS no
 * longer matches the workspace; else `missing` (awaiting review). The intent decision is listed as
 * a record and is never a review.
 */
function reviewStep(review: ReviewAssessment, decision: IntentDecisionInput | null): DeliveryStep {
  const decisionRecords: Array<Record<string, unknown>> = decision ? [{
    record: 'intent-decision', decision: decision.status === 'VETO' ? 'vetoed' : 'approved for implementation (not a review)',
    status: decision.status, actor: decision.actor, timestamp: decision.timestamp, entryHash: decision.entryHash,
    provenance: DECISION_PROVENANCE_NOTE, ...(decision.status === 'VETO' ? { note: INTENT_VETO_NOTE } : {}),
  }] : [];
  if (review.state === 'unavailable') return step('review', 'unavailable', review.reason, decisionRecords);
  const latest = review.latestPass;
  const records: Array<Record<string, unknown>> = [
    ...review.blocking.map((b) => ({
      record: 'blocking', kind: b.kind, id: b.id, hash: b.hash, label: b.label, verdict: b.verdict, commitSha: b.commitSha,
      commitState: b.commitSha ? (b.commitTrusted ? 'sealed' : 'recorded, unverified') : null, timestamp: b.timestamp, note: b.note,
    })),
    ...review.reviews.map((r) => ({
      record: 'review', reviewId: r.reviewId, verdict: r.verdict, commitSha: r.commitSha, tree: r.tree, branch: r.branch,
      covers: r.covers.map((c) => c.commitSha), evidenceCount: r.evidenceCount, evidenceDigest: r.evidenceDigest,
      supersedes: r.supersedes, note: r.note, reviewerDid: r.reviewerDid, proves: r.authentication.proves,
      channel: r.authentication.channel, operationId: r.operationId, entryId: r.entryId, entryHash: r.entryHash,
      timestamp: r.timestamp, mirrorEntryHash: r.mirrorEntryHash,
      ...(latest && latest.review.reviewId === r.reviewId ? { current: latest.current, staleReasons: latest.staleReasons } : {}),
    })),
    ...review.cleared.map((c) => ({
      record: 'cleared', kind: c.kind, id: c.id, hash: c.hash, label: c.label, clearedBy: c.clearedBy,
      ...(c.clearedNote ? { note: c.clearedNote } : {}),
    })),
    ...decisionRecords,
  ];
  if (review.blocking.length) {
    const more = review.blocking.length > 1 ? ` (and ${review.blocking.length - 1} more blocking item${review.blocking.length === 2 ? '' : 's'})` : '';
    return step('review', 'failing', `${review.blocking[0].label}${more}`, records);
  }
  if (decision && decision.status === 'VETO') {
    return step('review', 'failing', `Intent vetoed by ${decision.actor} at ${decision.timestamp}. ${INTENT_VETO_NOTE}`, records);
  }
  if (latest && latest.current) {
    const r = latest.review;
    return step('review', 'passing', `Reviewed: PASS on ${r.commitSha} at ${r.timestamp} (ledger entry #${r.entryId}), covering every linked commit. ` +
      'New evidence will need a fresh review.', records);
  }
  if (latest) {
    return step('review', 'stale', `The latest review PASS (ledger entry #${latest.review.entryId}) is no longer current: ${latest.staleReasons.join('; ')}. Review again.`, records);
  }
  return step('review', 'missing', REVIEW_AWAITING_REASON, records);
}

function governanceStep(evidence: GovernanceEvidence): DeliveryStep {
  if (evidence.state === 'unavailable') return step('governance', 'unavailable', evidence.reason);
  if (!evidence.total) {
    return step('governance', 'missing', 'No FailSafe ledger entry names this intent.');
  }
  const more = evidence.truncated ? ` The newest ${evidence.records.length} are listed; ${evidence.total - evidence.records.length} more are not.` : '';
  return step('governance', 'recorded',
    `${evidence.total} FailSafe ledger entr${evidence.total === 1 ? 'y names' : 'ies name'} this intent. ` +
    `Present, not passed.${more}`,
    evidence.records.map((r) => ({ ...r })));
}

export function assessDelivery(input: DeliveryInputs): DeliveryAssessment {
  const steps = [
    issueStep(input.issue),
    architectureStep(input.architecture),
    codeStep(input.code),
    reviewStep(input.review, input.decision),
    governanceStep(input.governance),
    step('receipt', 'unavailable', RECEIPT_REASON),
  ];
  const gaps = steps.slice(0, 5)
    .filter((s) => s.status !== COMPLETE_STATUS[s.key as Exclude<StepKey, 'receipt'>])
    .map((s) => s.key);
  const review = steps[3];
  const awaiting = gaps.length === 1 && gaps[0] === 'review' && (review.status === 'missing' || review.status === 'stale');
  const overall: DeliveryOutcome = steps.some((s) => s.status === 'failing') ? 'failing'
    : !gaps.length ? 'evidence-complete-except-receipt' : awaiting ? 'awaiting-review' : 'incomplete';
  // completeReachable reflects only the ledger and git. An unreadable architecture index leaves the
  // architecture step `unavailable` (a gap) but is not listed here (review320 note).
  const blockedBy = new Set<string>();
  if (input.governance.state === 'unavailable' || (input.review.state === 'unavailable' && input.review.cause === 'ledger-unavailable')) blockedBy.add('ledger-unavailable');
  if (input.code.state === 'unavailable' || (input.review.state === 'unavailable' && input.review.cause === 'git-unavailable')) blockedBy.add('git-unavailable');
  return { intentId: input.intentId, overall, gaps, steps, completeReachable: blockedBy.size === 0, completeBlockedBy: [...blockedBy] };
}
