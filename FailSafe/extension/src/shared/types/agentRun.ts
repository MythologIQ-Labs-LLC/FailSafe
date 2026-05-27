/**
 * Agent Run Types
 *
 * Types for recording and replaying agent execution traces.
 */

import type { GovernanceDecision } from "./governance";

export type RunStepKind =
  | "prompt"
  | "reasoning"
  | "toolCall"
  | "fileEdit"
  | "policyDecision"
  | "mitigation"
  | "verdictPass"
  | "verdictBlock"
  | "trustUpdate"
  | "genomeMatch"
  | "completed";

export interface RunStep {
  seq: number;
  kind: RunStepKind;
  timestamp: string;
  title: string;
  detail?: string;
  artifactPath?: string;
  agentDid?: string;
  governanceDecision?: GovernanceDecision;
  diff?: { additions: number; deletions: number };
}

export type AgentRunSource = "ide-task" | "terminal" | "chat" | "manual" | "implicit";

/**
 * Provenance attribution for an AgentRun — identifies an external system
 * that originated or dispatched the run. Orthogonal to `agentSource`
 * (which describes how the user initiated work: ide-task | terminal | chat |
 * manual | implicit). v1 supports Open Design as the sole external source;
 * the discriminated union is open-ended for future integrations.
 */
export type AgentProvenance =
  | { source: "open-design"; projectId: string; runId?: string };

/**
 * Runtime type guard for OpenDesign provenance specifically. Used by
 * Monitor UI render code that can't rely on compile-time narrowing.
 */
export function isOpenDesignProvenance(
  x: unknown,
): x is Extract<AgentProvenance, { source: "open-design" }> {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { source?: unknown }).source === "open-design" &&
    typeof (x as { projectId?: unknown }).projectId === "string"
  );
}

export interface AgentRun {
  id: string;
  agentDid: string;
  agentType: string;
  agentSource: AgentRunSource;
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "failed";
  steps: RunStep[];
  summary?: string;
  /** Optional external-system provenance (e.g., dispatched by Open Design). */
  provenance?: AgentProvenance;
}
