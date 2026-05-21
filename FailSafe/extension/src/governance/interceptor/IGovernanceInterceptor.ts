// B151 — Universal Governance Interceptor: the single contract-typed seam
// through which agent tool calls reach the FailSafe enforcement layer.
//
// An interceptor accepts a B190 `EvaluationRequestContract` and resolves a
// B190 `ReceiptContract` carrying the governance verdict. Implementations:
//   - EngineBackedInterceptor — delegates to the in-extension EnforcementEngine.
//   - McpInterceptor (adapters/) — wraps an MCP `{name, arguments}` envelope.
//
// Boundary: this module may import only from `src/contracts/`,
// `src/governance/EnforcementEngine.ts`, and `src/governance/types/IntentTypes.ts`.
// It MUST NOT import from `src/integrations/bicameral/*`. See README.md.

import type { EvaluationRequestContract, ReceiptContract } from "../../contracts";

/**
 * The universal governance seam. One method: evaluate a request, return a
 * receipt. Async so engine-backed and remote-adapter implementations share
 * the same shape.
 */
export interface IGovernanceInterceptor {
  /**
   * Evaluate a governance request and resolve the decision receipt.
   *
   * Implementations must never reject — unrecoverable failures are mapped to a
   * `QUARANTINE` receipt so callers always receive a contract-valid result.
   */
  evaluate(req: EvaluationRequestContract): Promise<ReceiptContract>;
}
