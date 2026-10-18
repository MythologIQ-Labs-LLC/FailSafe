/**
 * Configuration Types
 *
 * FailSafe extension configuration.
 */

import type { SentinelMode } from "./sentinel";

/** #538: where the Sentinel LLM endpoint came from (see llmDestinationPolicy). */
export type LlmEndpointSource = "workspace-file" | "workspace-setting" | "user-setting" | "default";

export interface FailSafeConfig {
  genesis: {
    livingGraph: boolean;
    cortexOmnibar: boolean;
    theme: "starry-night" | "light" | "high-contrast";
  };
  sentinel: {
    enabled: boolean;
    mode: SentinelMode;
    localModel: string;
    ollamaEndpoint: string;
    /** #538: where ollamaEndpoint came from. Absent (a provider that cannot tell) is treated as not user-chosen. */
    ollamaEndpointSource?: LlmEndpointSource;
  };
  evaluation?: {
    enabled: boolean;
    mode: "production" | "debug" | "audit";
    routing: {
      tier2_risk_threshold: "R1" | "R2";
      tier3_risk_threshold: "R2" | "R3";
      tier2_novelty_threshold: "medium" | "high";
      tier3_novelty_threshold: "low" | "medium" | "high";
      tier2_confidence_threshold: "medium" | "low";
      tier3_confidence_threshold: "low";
    };
    ledger: {
      tier0_enabled: boolean;
      tier1_enabled: boolean;
      tier2_enabled: boolean;
      tier3_enabled: boolean;
    };
  };
  qorelogic: {
    ledgerPath: string;
    strictMode: boolean;
    l3SLA: number;
  };
  feedback: {
    outputDir: string;
  };
  architecture: {
    contributors: number;
    maxComplexity: number;
  };
  governance?: {
    mode?: "observe" | "assist" | "enforce";
    overseerId: string;
  };
}
