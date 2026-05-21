// B151 — Universal Governance Interceptor public surface.
// Re-exports the interface, the engine-backed implementation, the MCP adapter,
// the pure contract mappers, and the AJV validator factory.

export type { IGovernanceInterceptor } from "./IGovernanceInterceptor";
export { EngineBackedInterceptor } from "./EngineBackedInterceptor";
export { McpInterceptor } from "./adapters/McpInterceptor";
export type { McpEnvelope, McpInterceptorBackingClient } from "./adapters/McpInterceptor";
export {
  deriveEvaluationRequestId,
  proposedActionToEvaluationRequest,
  evaluationRequestToProposedAction,
  verdictToReceipt,
  quarantineReceipt,
} from "./contractMappers";
export { getValidator } from "./ajv-instance";
