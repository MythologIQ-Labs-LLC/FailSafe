/**
 * Sentinel Types
 *
 * Sentinel monitoring, verdicts, and heuristic patterns.
 */

import type { RiskGrade } from "./risk";

// =============================================================================
// SENTINEL CORE
// =============================================================================

export type SentinelMode = "heuristic" | "llm-assisted" | "hybrid";
export type OperationalMode = "normal" | "lean" | "surge" | "safe";
export type VerdictDecision =
  | "PASS"
  | "WARN"
  | "BLOCK"
  | "ESCALATE"
  | "QUARANTINE";

export interface SentinelStatus {
  running: boolean;
  mode: SentinelMode;
  operationalMode: OperationalMode;
  uptime: number;
  filesWatched: number;
  eventsProcessed: number;
  queueDepth: number;
  lastVerdict: SentinelVerdict | null;
  llmAvailable: boolean;
}

export interface SentinelEvent {
  id: string;
  timestamp: string;
  priority: "critical" | "high" | "normal" | "low";
  source: "file_watcher" | "agent_message" | "editor" | "mcp" | "manual";
  type: SentinelEventType;
  payload: Record<string, unknown>;
}

export type SentinelEventType =
  | "FILE_CREATED"
  | "FILE_MODIFIED"
  | "FILE_DELETED"
  | "AGENT_CLAIM"
  | "CODE_SUBMITTED"
  | "DEPENDENCY_CHANGED"
  | "SPEC_CHANGED"
  | "MANUAL_AUDIT";

export interface SentinelVerdict {
  id: string;
  eventId: string;
  timestamp: string;
  decision: VerdictDecision;
  riskGrade: RiskGrade;
  confidence: number;
  heuristicResults: HeuristicResult[];
  llmEvaluation?: LLMEvaluation;
  agentDid: string;
  agentTrustAtVerdict: number;
  artifactPath?: string;
  artifactHash?: string;
  summary: string;
  details: string;
  matchedPatterns: string[];
  actions: VerdictAction[];
  ledgerEntryId?: number;
  // P0 Security: Signature field for verification
  signature?: string;
  signatureTimestamp?: string;
  publicKey?: string;
}

export interface HeuristicResult {
  patternId: string;
  matched: boolean;
  severity: "critical" | "high" | "medium" | "low";
  location?: {
    line: number;
    column: number;
    snippet: string;
  };
}

export interface LLMEvaluation {
  model: string;
  promptUsed: string;
  response: string;
  confidence: number;
  processingTime: number;
}

export interface VerdictAction {
  type:
    | "LOG"
    | "TRUST_UPDATE"
    | "SHADOW_ARCHIVE"
    | "L3_QUEUE"
    | "QUARANTINE"
    | "NOTIFY";
  status: "completed" | "pending" | "failed";
  details: string;
}

// =============================================================================
// HEURISTIC PATTERNS
// =============================================================================

export type PatternCategory =
  | "injection"
  | "authentication"
  | "cryptography"
  | "secrets"
  | "pii"
  | "resource"
  | "logic"
  | "complexity"
  | "existence"
  | "dependency";

export interface HeuristicPattern {
  id: string;
  name: string;
  category: PatternCategory;
  severity: "critical" | "high" | "medium" | "low";
  cwe?: string;
  pattern: string; // Regex pattern string
  description: string;
  falsePositiveRate: number;
  remediation: string;
  enabled: boolean;
}
