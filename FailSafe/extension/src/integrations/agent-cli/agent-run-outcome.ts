/**
 * agent-run-outcome: pure risk classification, receipt and outcome builders for the
 * CLI agent wrappers (split from agent-cli-core.ts, which re-exports everything here).
 * No I/O and no process execution.
 */

import { createHash } from 'crypto';
import type { RiskGrade } from '../../shared/types/risk';
import type { IsolatedRunResult, RunStatus } from './isolated-run';
import type { QuarantinedChangeSet } from './agent-run-promotion';

const RISK_ORDER: Record<RiskGrade, number> = { L1: 1, L2: 2, L3: 3 };

/** Max (most severe) of two risk grades. */
export function maxRisk(a: RiskGrade, b: RiskGrade): RiskGrade {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export interface DiffSummary { files: number; additions: number; deletions: number; paths: string[] }

export const EMPTY_DIFF: DiffSummary = { files: 0, additions: 0, deletions: 0, paths: [] };

/** Classify a change set's risk = the MAX tier across its changed paths, using the
 *  injected classifier (PolicyEngine.classifyRisk at runtime). Empty = L1. */
export function classifyDiffRisk(summary: DiffSummary, classify: (path: string) => RiskGrade): RiskGrade {
  let grade: RiskGrade = 'L1';
  for (const p of summary.paths) grade = maxRisk(grade, classify(p));
  return grade;
}

export interface AgentReceipt {
  receiptId: string;
  agent: string;
  /** argv actually spawned — secrets never travel in argv, so this is safe. */
  argv: string[];
  status: RunStatus;
  statusReason: string;
  riskGrade: RiskGrade;
  exitCode: number | null;
  diff: DiffSummary;
  baseHead?: string;
  patchSha256?: string;
  evidence: Array<{ kind: string; ref: string; summary?: string }>;
  issuedAt: string;
  issuedBy: string;
}

/** Build a receipt (conforms to the FailSafe receipt contract shape). Pure:
 *  `issuedAt` is injected so the receipt is deterministic in tests. The receipt
 *  records argv (never env) so no API key can leak through it. */
export function buildAgentReceipt(input: {
  agent: string;
  argv: string[];
  status: RunStatus;
  reason: string;
  riskGrade: RiskGrade;
  exitCode: number | null;
  diff: DiffSummary;
  baseHead?: string;
  patchSha256?: string;
  issuedAt: string;
  issuedBy?: string;
}): AgentReceipt {
  const issuedBy = input.issuedBy ?? `did:failsafe:agent:${input.agent}`;
  const receiptId = createHash('sha256')
    .update(`${input.agent}|${input.issuedAt}|${input.status}|${input.patchSha256 ?? ''}|${input.argv.join(' ')}`)
    .digest('hex')
    .slice(0, 32);
  return {
    receiptId,
    agent: input.agent,
    argv: input.argv,
    status: input.status,
    statusReason: input.reason,
    riskGrade: input.riskGrade,
    exitCode: input.exitCode,
    diff: input.diff,
    baseHead: input.baseHead,
    patchSha256: input.patchSha256,
    evidence: [{ kind: 'cli_agent_quarantine', ref: `${input.diff.files} file(s)`, summary: `+${input.diff.additions}/-${input.diff.deletions}` }],
    issuedAt: input.issuedAt,
    issuedBy,
  };
}

/** Outcome of a governed agent command (both wrappers + the command layer). */
export interface AgentRunOutcome {
  available: boolean;
  spawned: boolean;
  status?: RunStatus;
  reason?: string;
  details?: string[];
  riskGrade?: RiskGrade;
  diff?: DiffSummary;
  receipt?: AgentReceipt;
  stdout?: string;
  error?: string;
  cleanupError?: string;
  /** In-memory change set; present only for QUARANTINED_PENDING_APPROVAL. */
  changeSet?: QuarantinedChangeSet;
}

/** Outcome for a run refused before any process started. */
export function blockedOutcome(agent: string, argv: string[], reason: string, riskGrade: RiskGrade, issuedAt: string): AgentRunOutcome {
  const status: RunStatus = 'BLOCKED_PRE_EXECUTION';
  return {
    available: true, spawned: false, status, reason, details: [], riskGrade, diff: EMPTY_DIFF,
    receipt: buildAgentReceipt({ agent, argv, status, reason, riskGrade, exitCode: null, diff: EMPTY_DIFF, issuedAt }),
  };
}

/** Outcome for an isolated run; risk = max(pre-run floor, every touched path). */
export function isolatedOutcome(
  agent: string, argv: string[], r: IsolatedRunResult,
  ctx: { classify: (path: string) => RiskGrade; issuedAt: string; riskFloor?: RiskGrade },
): AgentRunOutcome {
  const riskGrade = maxRisk(ctx.riskFloor ?? 'L1', classifyDiffRisk(r.stats, ctx.classify));
  const receipt = buildAgentReceipt({
    agent, argv, status: r.status, reason: r.reason, riskGrade, exitCode: r.exitCode, diff: r.stats,
    baseHead: r.baseHead, patchSha256: r.patchSha256, issuedAt: ctx.issuedAt,
  });
  let changeSet: QuarantinedChangeSet | undefined;
  if (r.status === 'QUARANTINED_PENDING_APPROVAL' && r.patch && r.patchSha256 && r.root && r.baseHead && r.preSnapshot) {
    changeSet = {
      receiptId: receipt.receiptId, agent, root: r.root, baseHead: r.baseHead, preSnapshot: r.preSnapshot,
      patch: r.patch, patchSha256: r.patchSha256, stats: r.stats,
    };
  }
  return {
    available: true, spawned: r.agentStarted, status: r.status, reason: r.reason, details: r.details, riskGrade,
    diff: r.stats, receipt, stdout: r.stdout, cleanupError: r.cleanupError, changeSet,
  };
}
