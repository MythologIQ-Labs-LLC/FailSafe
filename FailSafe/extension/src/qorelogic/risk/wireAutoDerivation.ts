/**
 * wireAutoDerivation — bootstrap helper for the Risk Auto-Derivation pipeline.
 * Extracted from bootstrapServers.ts (Section 4 Razor remediation).
 *
 * Wires two surfaces:
 *  - Hub-refresh hook: feeds each refresh's governancePhase.recentCompletions
 *    through the VETO/DEBUG derivers.
 *  - EventBus subscription: feeds 'genome.failureArchived' events through
 *    the Shadow-Genome deriver.
 *
 * Per plan-qor-model-sourced-risks Phase 3.
 */

import { RiskManager } from "./RiskManager";
import { AuditGateArtifactReader } from "./AuditGateArtifactReader";
import { EventBus } from "../../shared/EventBus";
import { ConsoleServer } from "../../roadmap/ConsoleServer";
import {
  runAutoDerivation,
  deriveFromShadowGenomePattern,
  type GenomeFailureArchivedEvent,
} from "./RiskAutoDerivation";

export interface AutoDerivationOutputLike {
  appendLine: (msg: string) => void;
}

export function wireRiskAutoDerivation(
  consoleServer: ConsoleServer,
  eventBus: EventBus,
  riskManager: RiskManager,
  workspaceRoot: string,
  output: AutoDerivationOutputLike,
): void {
  const artifactReader = new AuditGateArtifactReader(workspaceRoot);
  consoleServer.setAutoDerivationHook((gp) => {
    try { runAutoDerivation(gp.recentCompletions as any, artifactReader, riskManager); }
    catch (e) { output.appendLine(`[risk-auto-derive] ${String(e)}`); }
  });
  eventBus.on("genome.failureArchived" as any, (event: unknown) => {
    try { deriveFromShadowGenomePattern(event as GenomeFailureArchivedEvent, riskManager); }
    catch (e) { output.appendLine(`[risk-auto-derive:genome] ${String(e)}`); }
  });
}
