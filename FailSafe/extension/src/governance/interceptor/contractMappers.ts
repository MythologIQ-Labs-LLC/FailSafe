// B151 — Pure mappers between B190 contracts and EnforcementEngine shapes.
//
// RD-3: `EvaluationRequestContract` has no `id` field — the evaluation-request
//        id is derived deterministically from the request body so retried or
//        duplicate requests resolve to the same id.
// RD-4: `ReceiptContract` carries `evidence: ReceiptEvidence[]` (objects), not
//        a bare string array. Every mapper populates proper evidence objects.
//
// No I/O, no logging — these functions are pure and synchronous.

import { createHash, randomBytes } from "crypto";
import type {
  EvaluationRequestContract,
  ReceiptContract,
  ReceiptEvidence,
} from "../../contracts";
import type { ProposedAction, Verdict } from "../types/IntentTypes";

/**
 * Derive a deterministic evaluation-request id from the request body.
 * `eval-${sha256(agentDid|action.kind|timestamp)[:16]}`.
 */
export function deriveEvaluationRequestId(req: EvaluationRequestContract): string {
  const seed = `${req.agentDid}|${req.action.kind}|${req.timestamp}`;
  const digest = createHash("sha256").update(seed).digest("hex");
  return `eval-${digest.slice(0, 16)}`;
}

/**
 * Project a `ProposedAction` (engine shape) into an `EvaluationRequestContract`.
 */
export function proposedActionToEvaluationRequest(
  action: ProposedAction,
  agentDid: string,
): EvaluationRequestContract {
  const req: EvaluationRequestContract = {
    agentDid,
    action: { kind: action.type, target: action.targetPath },
    timestamp: action.proposedAt,
  };
  if (action.intentId != null) {
    req.context = { intentId: action.intentId };
  }
  return req;
}

/**
 * Project an `EvaluationRequestContract` back into a `ProposedAction`.
 * Round-trips `proposedActionToEvaluationRequest` on all defined fields.
 */
export function evaluationRequestToProposedAction(
  req: EvaluationRequestContract,
): ProposedAction {
  return {
    type: req.action.kind as ProposedAction["type"],
    targetPath: req.action.target ?? "",
    intentId: req.context?.intentId ?? null,
    proposedAt: req.timestamp,
    proposedBy: req.agentDid,
  };
}

/** Receipt-id factory — `rcpt-${randomBytes(8).hex}`. */
function makeReceiptId(): string {
  return `rcpt-${randomBytes(8).toString("hex")}`;
}

function allowEvidence(verdict: Extract<Verdict, { status: "ALLOW" }>): ReceiptEvidence[] {
  if (!verdict.intentId) return [];
  return [
    { kind: "intent", ref: verdict.intentId, summary: "Action allowed under active intent." },
  ];
}

function blockEvidence(verdict: Extract<Verdict, { status: "BLOCK" }>): ReceiptEvidence[] {
  return [
    {
      kind: "axiom_violation",
      ref: `axiom-${verdict.axiomViolated}`,
      summary: verdict.violation,
    },
  ];
}

function escalateEvidence(
  verdict: Extract<Verdict, { status: "ESCALATE" }>,
): ReceiptEvidence[] {
  return [{ kind: "escalation", ref: verdict.escalationTo, summary: verdict.reason }];
}

/**
 * Project an EnforcementEngine `Verdict` into a B190 `ReceiptContract`.
 * `QUARANTINE` is produced separately by `quarantineReceipt` for engine throws.
 */
export function verdictToReceipt(
  verdict: Verdict,
  evalReqId: string,
  issuedBy: string,
): ReceiptContract {
  const base = {
    receiptId: makeReceiptId(),
    evaluationRequestId: evalReqId,
    issuedAt: new Date().toISOString(),
    issuedBy,
  };
  if (verdict.status === "ALLOW") {
    return { ...base, verdict: "ALLOW", evidence: allowEvidence(verdict) };
  }
  if (verdict.status === "BLOCK") {
    return {
      ...base,
      verdict: "BLOCK",
      evidence: blockEvidence(verdict),
      verdictRationale: verdict.remediation,
    };
  }
  return { ...base, verdict: "ESCALATE", evidence: escalateEvidence(verdict) };
}

/**
 * Build a `QUARANTINE` receipt for an unrecoverable failure (engine throw or
 * contract-validation failure). `summary` carries the failure detail.
 */
export function quarantineReceipt(
  evalReqId: string,
  issuedBy: string,
  summary: string,
): ReceiptContract {
  return {
    receiptId: makeReceiptId(),
    evaluationRequestId: evalReqId,
    issuedAt: new Date().toISOString(),
    issuedBy,
    verdict: "QUARANTINE",
    verdictRationale: summary,
    evidence: [{ kind: "interceptor_error", ref: "quarantine", summary }],
  };
}
