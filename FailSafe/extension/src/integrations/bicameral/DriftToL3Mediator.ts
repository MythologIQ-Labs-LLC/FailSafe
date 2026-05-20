// DriftToL3Mediator — bridges Bicameral drift events into FailSafe's L3 approval queue.
// Plan: docs/plan-qor-bicameral-cluster-high.md Phase 3 (B-BIC-16).
//
// On drift result: enqueue L3 entry for each NEWLY-drifted decision (edge
// transition; de-dup by `bicameral:{decisionId}`).
// On L3 decision: if the entry was minted by us, auto-ratify upstream via
// BicameralMcpClient. Only APPROVED + APPROVED_WITH_CONDITIONS → 'ratify';
// REJECTED → 'reject'. DEFERRED + EXPIRED + others leave Bicameral untouched.

import type { Logger } from '../../shared/Logger';
import type { EventBus } from '../../shared/EventBus';
import type { FailSafeEvent } from '../../shared/types';
import type { L3ApprovalRequest, L3ApprovalState } from '../../shared/types/l3-approval';
import type { BicameralMcpClient } from './BicameralMcpClient';
import type { BicameralDriftStatus } from './types';

/** L3ApprovalService emits `qorelogic.l3Decided` with this payload shape
 *  (verified: L3ApprovalService.ts:72-74 + :142). EventBus.emit wraps it
 *  in a FailSafeEvent so subscribers receive event.payload here. */
interface L3DecidedPayload {
  request: L3ApprovalRequest;
  decision: L3ApprovalState;
}

interface L3ApprovalQueueDeps {
  queueL3Approval(
    request: Omit<L3ApprovalRequest, 'id' | 'state' | 'queuedAt' | 'slaDeadline'>,
  ): Promise<string>;
}

export interface DriftToL3MediatorDeps {
  client: BicameralMcpClient;
  l3Service: L3ApprovalQueueDeps;
  eventBus: EventBus;
  logger: Logger;
}

export class DriftToL3Mediator {
  private queued = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: DriftToL3MediatorDeps) {
    this.unsubscribe = this.deps.eventBus.on(
      'qorelogic.l3Decided',
      (event: FailSafeEvent) => {
        void this.onL3Decision(event.payload as L3DecidedPayload);
      },
    );
  }

  async onDriftResult(drifted: BicameralDriftStatus[]): Promise<void> {
    for (const d of drifted) {
      if (d.status !== 'drifted') continue;
      const key = `bicameral:${d.decisionId}`;
      if (this.queued.has(key)) continue;
      this.queued.add(key);
      try {
        await this.deps.l3Service.queueL3Approval({
          filePath: d.filePath ?? '<unknown>',
          riskGrade: 'L2',
          agentDid: 'bicameral-mcp',
          agentTrust: 0,
          sentinelSummary: `Bicameral decision drifted: ${d.decisionId}`,
          flags: ['bicameral-drift'],
          kind: 'bicameral-drift-resolution',
          meta: { decisionId: d.decisionId },
        });
      } catch (err) {
        // Roll back the de-dup mark so a retry can succeed.
        this.queued.delete(key);
        this.deps.logger.warn('DriftToL3Mediator enqueue failed', {
          decisionId: d.decisionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async onL3Decision(payload: L3DecidedPayload): Promise<void> {
    if (!payload || typeof payload !== 'object') return;
    const { request, decision } = payload;
    if (!request || request.kind !== 'bicameral-drift-resolution') return;
    const decisionId = request.meta?.decisionId;
    if (typeof decisionId !== 'string' || decisionId.length === 0) return;

    let verdict: 'ratify' | 'reject';
    if (decision === 'APPROVED' || decision === 'APPROVED_WITH_CONDITIONS') {
      verdict = 'ratify';
    } else if (decision === 'REJECTED') {
      verdict = 'reject';
    } else {
      // DEFERRED / EXPIRED / UNDER_REVIEW / QUEUED: no-op. Bicameral side
      // remains untouched; operator can re-decide later.
      return;
    }

    try {
      await this.deps.client.ratify(decisionId, verdict);
      this.queued.delete(`bicameral:${decisionId}`);
    } catch (err) {
      this.deps.logger.warn('DriftToL3Mediator ratify failed', {
        decisionId,
        verdict,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.queued.clear();
  }
}
