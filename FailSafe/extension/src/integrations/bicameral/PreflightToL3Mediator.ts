// PreflightToL3Mediator — surfaces bicameral.preflight decision-drift onto
// the L3 approval card. Plan: docs/plan-qor-b-int-2-preflight-l3.md Phase 1
// (B-INT-2).
//
// When a tier-3 action is queued for L3, this mediator runs bicameral.preflight
// against the target file (async, after the entry is queued — RD-1) and, when
// the file conflicts with prior decisions, attaches the drift evidence onto the
// pending L3 entry via L3PreflightDeps.attachPreflightEvidence.
//
// Graceful degradation (RD-4): a null/disconnected client is a no-op; a thrown
// preflight is swallowed — the L3 entry simply stands without a conflict line.

import type { Logger } from '../../shared/Logger';
import type { BicameralMcpClient } from './BicameralMcpClient';
import type { BicameralDecision, BicameralDriftStatus } from './types';

/** Flag appended to an L3 entry whose target file drifts from a decision. */
const PREFLIGHT_CONFLICT_FLAG = 'bicameral-preflight-conflict';

/** Minimal L3 surface this mediator needs — declared locally (not a hard
 *  import of L3ApprovalService) so there is no integrations→qorelogic import
 *  cycle. Mirrors the L3ApprovalQueueDeps precedent in DriftToL3Mediator. */
export interface L3PreflightDeps {
  attachPreflightEvidence(
    approvalId: string,
    preflightMeta: Record<string, unknown>,
    flag: string,
  ): Promise<void>;
}

/** Either a live client or a lazy accessor (the wired client can be re-built
 *  on config change — see bootstrapBicameral). */
type ClientSource = BicameralMcpClient | (() => BicameralMcpClient | null);

export interface PreflightToL3MediatorDeps {
  client: ClientSource;
  l3Service: L3PreflightDeps;
  logger: Logger;
}

/** One drifted decision, joined with its human-readable title. */
interface DriftedDecisionEvidence {
  decisionId: string;
  title: string;
  status: string;
  evidence?: string;
}

export class PreflightToL3Mediator {
  constructor(private readonly deps: PreflightToL3MediatorDeps) {}

  /** Run preflight for a freshly-queued tier-3 L3 entry and, when the target
   *  file drifts from prior decisions, attach the evidence onto the entry.
   *  Exception-isolated: a thrown/rejected preflight never propagates. */
  async onTier3Queued(approvalId: string, targetPath: string): Promise<void> {
    try {
      const client = this.resolveClient();
      if (!client || !client.isConnected()) return;
      if (!approvalId || !targetPath) return;

      const result = await client.preflight(targetPath);
      const drifted = result.drifted.filter((d) => d.status === 'drifted');
      if (drifted.length === 0) return;

      const driftedDecisions = drifted.map((d) =>
        this.toEvidence(d, result.priorDecisions),
      );
      await this.deps.l3Service.attachPreflightEvidence(
        approvalId,
        { driftedDecisions, checkedAt: new Date().toISOString() },
        PREFLIGHT_CONFLICT_FLAG,
      );
    } catch (err) {
      this.deps.logger.warn('PreflightToL3Mediator preflight failed', {
        approvalId,
        targetPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private resolveClient(): BicameralMcpClient | null {
    const src = this.deps.client;
    return typeof src === 'function' ? src() : src;
  }

  private toEvidence(
    drift: BicameralDriftStatus,
    priorDecisions: BicameralDecision[],
  ): DriftedDecisionEvidence {
    const match = priorDecisions.find((p) => p.id === drift.decisionId);
    return {
      decisionId: drift.decisionId,
      title: match?.title ?? drift.decisionId,
      status: drift.status,
      evidence: drift.evidence,
    };
  }
}
