/**
 * #532 part B (plan-532b LD6): the delivery assessment rule, a pure function.
 *
 * Five steps for one intent: the issue it came from, the architecture documents it
 * implements, the commits it was committed under, governance evidence already in the
 * FailSafe ledger, and a receipt. Every input is gathered elsewhere (deliveryService.ts);
 * this module only decides each step's status from what it is given and lists the
 * records behind it. Nothing is inferred: a step without a recorded link is `missing`.
 */

import type { GovernanceEvidence } from './deliveryEvidence';

export type StepStatus = 'recorded' | 'stale' | 'missing' | 'unavailable';
export type StepKey = 'issue' | 'architecture' | 'code' | 'governance' | 'receipt';
export type DeliveryOutcome = 'evidence-complete-except-receipt' | 'incomplete';

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
  /** The first four steps that are not `recorded`, in step order. The receipt is never a gap. */
  gaps: StepKey[];
  steps: DeliveryStep[];
}

export const RECEIPT_REASON = 'Blocked on the damaged ledger (#467), B216.';

export interface ArchitectureEdgeCheck {
  target: string;
  docPath: string;
  docSha256: string;
  /** HEAD at link time (null in an unborn repository). */
  sourceSha: string | null;
  status: 'recorded' | 'stale' | 'missing';
  reason?: string;
  currentSha256?: string;
}

export interface CodeEdgeCheck {
  sha: string;
  tree: string;
  branch: string | null;
  status: 'recorded' | 'missing';
  reason?: string;
  /** Display only; never an edge. */
  files?: { files: string[]; truncated: boolean } | null;
}

export type EdgeChecks<T> = { state: 'checked'; edges: T[] } | { state: 'unavailable'; reason: string };

export interface DeliveryInputs {
  intentId: string;
  /** The CREATED entry's provenance (null when the intent was not imported) and its entry hash. */
  issue: { provenance: Record<string, unknown> | null; createdEntryHash: string | null };
  architecture: EdgeChecks<ArchitectureEdgeCheck>;
  code: EdgeChecks<CodeEdgeCheck>;
  governance: GovernanceEvidence;
}

const LABELS: Record<StepKey, string> = {
  issue: 'Issue', architecture: 'Architecture', code: 'Code', governance: 'Governance evidence', receipt: 'Receipt',
};

const step = (key: StepKey, status: StepStatus, reason: string, records: Array<Record<string, unknown>> = []): DeliveryStep =>
  ({ key, label: LABELS[key], status, reason, records });

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
    ...(e.currentSha256 ? { currentSha256: e.currentSha256 } : {}), ...(e.reason ? { reason: e.reason } : {}),
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
    ...(e.files ? { files: e.files.files, filesTruncated: e.files.truncated } : {}),
  })));
}

function governanceStep(evidence: GovernanceEvidence): DeliveryStep {
  if (evidence.state === 'unavailable') return step('governance', 'unavailable', evidence.reason);
  if (!evidence.records.length) {
    return step('governance', 'missing', 'No FailSafe ledger entry names this intent or a linked commit.');
  }
  const more = evidence.truncated ? ' More entries may exist than are listed.' : '';
  return step('governance', 'recorded',
    `${evidence.records.length} FailSafe ledger entr${evidence.records.length === 1 ? 'y names' : 'ies name'} this intent or a linked commit.${more}`,
    evidence.records.map((r) => ({ ...r })));
}

export function assessDelivery(input: DeliveryInputs): DeliveryAssessment {
  const steps = [
    issueStep(input.issue),
    architectureStep(input.architecture),
    codeStep(input.code),
    governanceStep(input.governance),
    step('receipt', 'unavailable', RECEIPT_REASON),
  ];
  const gaps = steps.slice(0, 4).filter((s) => s.status !== 'recorded').map((s) => s.key);
  return { intentId: input.intentId, overall: gaps.length ? 'incomplete' : 'evidence-complete-except-receipt', gaps, steps };
}
