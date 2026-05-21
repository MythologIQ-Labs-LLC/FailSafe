// B151 — EngineBackedInterceptor: routes an EvaluationRequestContract through
// the in-extension EnforcementEngine and maps the verdict to a ReceiptContract.
//
// RD-1: this introduces NO new enforcement surface. It calls
// `EnforcementEngine.evaluateAction` unchanged and inherits the engine's
// existing mode-gating (the enforce branch already threads `featureGate` into
// `evaluateEnforceMode`). Pro-gating is unchanged.
//
// RD-3/RD-4: the evaluation-request id is derived deterministically; receipts
// carry proper `evidence` objects. Engine throws are caught and mapped to a
// `QUARANTINE` receipt — `evaluate` never rejects.

import type { EvaluationRequestContract, ReceiptContract } from "../../contracts";
import type { Verdict } from "../types/IntentTypes";
import type { IGovernanceInterceptor } from "./IGovernanceInterceptor";
import {
  deriveEvaluationRequestId,
  evaluationRequestToProposedAction,
  quarantineReceipt,
  verdictToReceipt,
} from "./contractMappers";

/** Minimal local view of EnforcementEngine — only the method this seam uses. */
export interface EnforcementEngineLike {
  evaluateAction(action: import("../types/IntentTypes").ProposedAction): Promise<Verdict>;
}

/**
 * `IGovernanceInterceptor` backed by the FailSafe EnforcementEngine. Constructor
 * takes the engine and the issuing FailSafe-instance DID stamped onto receipts.
 */
export class EngineBackedInterceptor implements IGovernanceInterceptor {
  private readonly engine: EnforcementEngineLike;
  private readonly issuedBy: string;

  constructor(engine: EnforcementEngineLike, issuedBy: string) {
    this.engine = engine;
    this.issuedBy = issuedBy;
  }

  async evaluate(req: EvaluationRequestContract): Promise<ReceiptContract> {
    const evalReqId = deriveEvaluationRequestId(req);
    try {
      const action = evaluationRequestToProposedAction(req);
      const verdict = await this.engine.evaluateAction(action);
      return verdictToReceipt(verdict, evalReqId, this.issuedBy);
    } catch (err) {
      const detail = err instanceof Error ? err.name : String(err);
      return quarantineReceipt(evalReqId, this.issuedBy, detail);
    }
  }
}
