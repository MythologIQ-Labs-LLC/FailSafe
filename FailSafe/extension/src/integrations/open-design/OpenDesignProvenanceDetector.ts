/**
 * IAgentProvenanceDetector implementation for Open Design.
 *
 * Thin class wrapper around the pure-function extractor so the recorder
 * can register multiple detectors uniformly. v1 is the only detector;
 * future detectors (e.g., for other dispatchers) follow this same shape.
 */

import { IAgentProvenanceDetector } from "../../sentinel/IAgentProvenanceDetector";
import { AgentProvenance } from "../../shared/types/agentRun";
import { extractOpenDesignProvenance } from "./provenance";

export class OpenDesignProvenanceDetector implements IAgentProvenanceDetector {
  detectFromFilePath(filePath: string): AgentProvenance | null {
    return extractOpenDesignProvenance(filePath);
  }
}
