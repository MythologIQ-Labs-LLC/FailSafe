/**
 * DetectionTypes - Detection-only type surface for agent detection.
 *
 * Extends the core SystemManifest / DetectionRules contract with
 * agent-detection-specific fields (exact extension IDs, terminal patterns,
 * weighted signals) WITHOUT modifying the over-cap core system type module.
 * Conversion back to the core SystemManifest contract happens only at the
 * default plugin getManifest() boundary via toSystemManifest().
 */

import {
  DetectionRules as CoreDetectionRules,
  SystemManifest,
} from "./QoreLogicSystem";

export type DetectionPhase = "filesystem" | "runtime" | "user-confirmed";

export type DetectionSignalType =
  | "folderExists"
  | "extensionId"
  | "extensionKeyword"
  | "hostAppName"
  | "terminalPattern";

export interface DetectionSignal {
  type: DetectionSignalType;
  /** The configured marker that matched (folder path, extension id, etc.). */
  value: string;
  /** 0.0-1.0 — higher means a stronger signal. */
  weight: number;
}

export interface AgentDetectionRules extends CoreDetectionRules {
  /** Exact VS Code extension IDs, e.g. "github.copilot". */
  extensionIds?: string[];
  /** Terminal name substrings for runtime-phase detection (wired later). */
  terminalPatterns?: string[];
}

export type AgentSystemManifest = Omit<SystemManifest, "detection"> & {
  detection?: AgentDetectionRules;
};

/** Widen an agent manifest back to the core SystemManifest contract. */
export function toSystemManifest(
  manifest: AgentSystemManifest,
): SystemManifest {
  return manifest;
}

export interface DetectionOutcome {
  detected: boolean;
  /** min(1.0, sum of matched signal weights). */
  confidence: number;
  /** Human-readable "type:value" descriptions of the signals that matched. */
  signals: string[];
  phase: DetectionPhase;
}

/** Canonical weight per signal type (summed, capped at 1.0). */
export const SIGNAL_WEIGHTS: Record<DetectionSignalType, number> = {
  extensionId: 1.0,
  hostAppName: 0.8,
  folderExists: 0.7,
  terminalPattern: 0.6,
  extensionKeyword: 0.4,
};

/** Confidence at or above this threshold means the agent is detected. */
export const DETECTION_THRESHOLD = 0.5;
