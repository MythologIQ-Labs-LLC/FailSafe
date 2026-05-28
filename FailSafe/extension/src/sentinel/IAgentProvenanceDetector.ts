/**
 * Pluggable provenance-detection contract for AgentRunRecorder.
 *
 * Implementations inspect a single file-path emitted by a file-edit event
 * and return an AgentProvenance descriptor when the path matches the
 * detector's pattern. Pure-function shape — no I/O, no side effects.
 *
 * v1 ships a single implementation: OpenDesignProvenanceDetector.
 */

import type { AgentProvenance } from "../shared/types/agentRun";

export interface IAgentProvenanceDetector {
  /** Returns provenance when filePath matches the detector's pattern; else null. */
  detectFromFilePath(filePath: string): AgentProvenance | null;
}
