/**
 * OpenDesignL3Executor — Buffer & auto-execute side of B-OD-8.
 *
 * Mirrors DriftToL3Mediator (B-BIC-16): subscribes to the existing
 * `qorelogic.l3Decided` event and filters by `kind`. When an
 * `open-design-create-artifact` item is APPROVED, it re-invokes the buffered
 * create_artifact call against the live Open Design client via the sanctioned
 * one-shot-token path (`executeApprovedCreateArtifact`) and anchors the
 * operator's decision into META_LEDGER as a USER_OVERRIDE entry.
 *
 * This keeps the generic L3ApprovalService unchanged — the service already
 * emits the full request (kind + meta) + decision; only this listener knows
 * how to execute an Open Design create_artifact.
 *
 * Plan: plan-b-od-8-create-artifact-l3.md Phase 3; FX810.
 */

import type { EventBus } from '../../shared/EventBus';
import type { FailSafeEvent } from '../../shared/types';
import type { L3ApprovalRequest, L3ApprovalState } from '../../shared/types/l3-approval';
import type { OpenDesignMcpClient } from './OpenDesignMcpClient';
import { OPEN_DESIGN_CREATE_ARTIFACT_KIND } from './OpenDesignMcpAllowlist';

interface L3DecidedPayload {
  request: L3ApprovalRequest;
  decision: L3ApprovalState;
}

/** Minimal ledger surface (structurally satisfied by LedgerManager). The
 *  eventType is pinned to the single value this executor writes so the wider
 *  LedgerManager.appendEntry signature remains assignable. */
export interface OpenDesignLedgerLike {
  isAvailable(): boolean;
  appendEntry(entry: {
    eventType: 'USER_OVERRIDE';
    agentDid: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface OpenDesignL3ExecutorDeps {
  eventBus: EventBus;
  /** Resolves the live client (may be (re)constructed by the wizard). */
  getClient: () => OpenDesignMcpClient | null;
  ledgerManager?: OpenDesignLedgerLike;
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

export class OpenDesignL3Executor {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: OpenDesignL3ExecutorDeps) {
    this.unsubscribe = this.deps.eventBus.on(
      'qorelogic.l3Decided',
      (event: FailSafeEvent) => {
        void this.onL3Decision(event.payload as L3DecidedPayload);
      },
    );
  }

  private async onL3Decision(payload: L3DecidedPayload): Promise<void> {
    if (!payload || typeof payload !== 'object') return;
    const { request, decision } = payload;
    // Only our own kind, and only a literal APPROVED decision, executes.
    // REJECTED / DEFERRED / EXPIRED / other kinds leave the daemon untouched
    // (fail-closed). APPROVED_WITH_CONDITIONS is intentionally treated as a
    // decline here — processL3Decision only ever emits 'APPROVED' | 'REJECTED'
    // on l3Decided, so a conditional approval never reaches this path; the
    // strict equality keeps the gate fail-closed if that ever changes upstream.
    if (!request || request.kind !== OPEN_DESIGN_CREATE_ARTIFACT_KIND) return;
    if (decision !== 'APPROVED') {
      this.appendLedger('open-design.create_artifact.declined', {
        approvalId: request.id,
        decision,
      });
      return;
    }

    const meta = request.meta as { tool?: unknown; args?: unknown } | undefined;
    const args =
      meta && meta.args !== null && typeof meta.args === 'object' && !Array.isArray(meta.args)
        ? (meta.args as Record<string, unknown>)
        : null;
    if (!args) return;

    const client = this.deps.getClient();
    if (!client) return; // daemon not connected; nothing to execute

    try {
      const result = await client.executeApprovedCreateArtifact(args);
      this.appendLedger('open-design.create_artifact.executed', {
        approvalId: request.id,
        isError: result?.isError === true,
      });
    } catch (err) {
      // Isolated — a failed execution must not break the event bus.
      this.deps.logger?.warn('OpenDesignL3Executor execute failed', {
        approvalId: request.id,
        error: err instanceof Error ? err.message : String(err),
      });
      this.appendLedger('open-design.create_artifact.failed', {
        approvalId: request.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private appendLedger(action: string, extra: Record<string, unknown>): void {
    if (!this.deps.ledgerManager?.isAvailable()) return;
    void this.deps.ledgerManager
      .appendEntry({
        eventType: 'USER_OVERRIDE',
        agentDid: 'vscode-user',
        payload: { action, tool: 'create_artifact', ...extra },
      })
      .catch(() => undefined); // non-blocking by design
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
