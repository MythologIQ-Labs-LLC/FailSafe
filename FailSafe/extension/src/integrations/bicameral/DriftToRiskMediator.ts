// DriftToRiskMediator — Batch 4 Phase 3 (B-BIC-18). Mirrors Bicameral
// verdict events into FailSafe's Risks Register.
//
// On `bicameral.verdict` with verdict:'drifted' → upsert a risk record keyed
// `bicameral:{decisionId}` (idempotent — RiskRegisterManager dedups on the
// `id` key). On verdict:'ratified' → close that same risk. verdict:'in-sync'
// is a no-op. Mirrors DriftToL3Mediator's shape: a minimal local deps
// interface (no hard RiskRegisterManager/ConsoleServer import → no cycle),
// and a fully exception-isolated body so a register write failure never
// breaks the drift/ratify route response that emitted the event.

import type { EventBus } from "../../shared/EventBus";
import type { FailSafeEvent } from "../../shared/types";
import type { BicameralVerdictEventPayload } from "../../shared/types/events";

/**
 * Minimal Risks-Register surface the mediator needs. Mirrors
 * DriftToL3Mediator's `L3ApprovalQueueDeps` pattern — a structural interface
 * so the mediator does NOT import `RiskRegisterManager` (no import cycle).
 */
export interface RiskRegisterDeps {
  upsertRisk(risk: Record<string, unknown>): void;
  closeRisk(id: string): void;
}

export interface DriftToRiskMediatorDeps {
  eventBus: EventBus;
  riskRegister: RiskRegisterDeps;
}

/** Build the `bicameral:{decisionId}` risk-register key for a decision. */
function riskKey(decisionId: string): string {
  return `bicameral:${decisionId}`;
}

export class DriftToRiskMediator {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: DriftToRiskMediatorDeps) {
    this.unsubscribe = this.deps.eventBus.on(
      "bicameral.verdict",
      (event: FailSafeEvent) => {
        this.onVerdict(event.payload as BicameralVerdictEventPayload);
      },
    );
  }

  /**
   * Mirror one `bicameral.verdict` event into the Risks Register. Fully
   * exception-isolated — a thrown upsertRisk/closeRisk is swallowed so the
   * mediator never propagates an error back to the emitting route.
   */
  private onVerdict(payload: BicameralVerdictEventPayload): void {
    if (!payload || typeof payload.decisionId !== "string") return;
    try {
      if (payload.verdict === "drifted") {
        this.deps.riskRegister.upsertRisk(this.buildRisk(payload));
      } else if (payload.verdict === "ratified") {
        this.deps.riskRegister.closeRisk(riskKey(payload.decisionId));
      }
      // verdict:'in-sync' is a deliberate no-op.
    } catch {
      /* a register write failure must not break the route (Batch 4) */
    }
  }

  /**
   * The risk record written for a drifted decision. The store is untyped
   * `Record<string, unknown>` so these keys are de-facto (matching the
   * existing Risks-tab CRUD payload — OQ-A); `id` and `status` are the only
   * behaviourally-load-bearing keys (upsert key + close target).
   */
  private buildRisk(payload: BicameralVerdictEventPayload): Record<string, unknown> {
    return {
      id: riskKey(payload.decisionId),
      title: `Bicameral decision drift: ${payload.decisionTitle ?? payload.decisionId}`,
      severity: "medium",
      status: "open",
      description: payload.evidence ?? "",
      createdAt: new Date().toISOString(),
    };
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
