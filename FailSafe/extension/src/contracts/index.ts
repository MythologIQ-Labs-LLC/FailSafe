// B190: governance contract surface. Schemas are stable JSON; TS mirror in types.ts.
// CONTRACT_VERSIONS lets consumers introspect schema versioning.

export type {
  EvaluationRequestContract,
  LedgerEntryContract,
  IntentContract,
  IntentStatus,
  FailureModeContract,
  ApprovalContract,
  CheckpointContract,
  CheckpointType,
  CheckpointStatus,
  PolicyVerdict,
  ReceiptContract,
  ReceiptVerdict,
  ReceiptEvidence,
  GovernanceConfigContract,
  GovernanceMode,
} from "./types";

export const CONTRACT_VERSIONS: Record<string, string> = {
  evaluation_request: "1.0.0",
  ledger_entry: "1.0.0",
  intent: "1.0.0",
  failure_mode: "1.0.0",
  approval: "1.0.0",
  checkpoint: "1.0.0",
  receipt: "1.0.0",
  governance_config: "1.0.0",
};

/** Filesystem location of the canonical JSON Schema files, relative to the
 *  extension src/ root. Consumers can resolve to absolute paths via
 *  `path.join(__dirname, ...)` from their own module. */
export const CONTRACT_SCHEMAS_DIR = "contracts";
