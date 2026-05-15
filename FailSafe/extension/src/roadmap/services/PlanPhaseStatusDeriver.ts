/**
 * PlanPhaseStatusDeriver — derive per-step status for the SHIELD lifecycle row
 * displayed in the FailSafe Monitor.
 *
 * Pure functions over `(ShieldPhase, verdict?)`. Output is a fixed-shape
 * 4-element array representing the SHIELD axis: Plan → Audit → Implement →
 * Substantiate. Plan-file project-specific phases are NOT mapped here; this
 * deriver operates on the SHIELD axis only (per plan-monitor-shield-visibility
 * pre-resolved decision 1, audit Entry #278).
 *
 * Consumed by `WorkspaceArtifactBuilder` and indirectly by the Monitor's
 * compact UI via the hub snapshot.
 */

import type { ShieldPhase } from "./GovernancePhaseTracker";

export interface ShieldPhaseStatus {
  id: "plan" | "audit" | "implement" | "substantiate";
  label: string;
  status: "completed" | "active" | "pending";
}

interface AxisEntry {
  id: ShieldPhaseStatus["id"];
  label: string;
}

const SHIELD_AXIS: ReadonlyArray<AxisEntry> = [
  { id: "plan", label: "Plan" },
  { id: "audit", label: "Audit" },
  { id: "implement", label: "Implement" },
  { id: "substantiate", label: "Substantiate" },
];

/**
 * Map a SHIELD phase + optional verdict to a "completion floor" index.
 * - i < floor → status "completed"
 * - i === floor → status "active"
 * - i > floor → status "pending"
 *
 * Special cases:
 * - IDLE returns -1 so all four phases are pending.
 * - SUBSTANTIATE with PASS / SEAL verdict returns 4 (all completed).
 * - VETO at GATE or SUBSTANTIATE keeps the floor at the active phase
 *   (no advancement; the operator must address findings before progressing).
 */
export function phaseToCompletionFloor(
  shieldPhase: ShieldPhase,
  verdict: string | undefined,
): number {
  switch (shieldPhase) {
    case "IDLE":
      return -1;
    case "PLAN":
      return 0;
    case "GATE":
      return 1;
    case "IMPLEMENT":
      return 2;
    case "SUBSTANTIATE":
      return isTerminalSubstantiate(verdict) ? 4 : 3;
    case "SEALED":
      return 4;
  }
}

function isTerminalSubstantiate(verdict: string | undefined): boolean {
  if (!verdict) return false;
  const upper = verdict.toUpperCase();
  return upper.includes("PASS") || upper.includes("SEAL");
}

export function derivePlanPhaseStatuses(
  shieldPhase: ShieldPhase,
  verdict: string | undefined,
): ShieldPhaseStatus[] {
  const floor = phaseToCompletionFloor(shieldPhase, verdict);
  return SHIELD_AXIS.map((axis, i) => ({
    id: axis.id,
    label: axis.label,
    status: statusForIndex(i, floor),
  }));
}

function statusForIndex(i: number, floor: number): ShieldPhaseStatus["status"] {
  if (i < floor) return "completed";
  if (i === floor) return "active";
  return "pending";
}
