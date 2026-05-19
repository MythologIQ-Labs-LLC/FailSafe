/**
 * Governance Type Surface
 *
 * Central declarations for governance-mode + mode-transition primitives.
 * Re-exported by EnforcementEngine and BreakGlassProtocol so the type
 * declaration lives in exactly one place (cycle-1 finding: type was
 * duplicated in EnforcementEngine.ts:35 and BreakGlassProtocol.ts:11).
 */

export type GovernanceMode = "observe" | "assist" | "enforce";

export interface GovernanceModeState {
  mode: GovernanceMode;
  defaulted: boolean;
}

/** Source of a mode transition. */
export type ModeTransitionReason =
  | "config_edit"
  | "break_glass_activated"
  | "revoked"
  | "expired";

/** Payload carried on the bus for `governance.modeChanged`. */
export interface GovernanceModeChangedEvent {
  previousMode: GovernanceMode;
  newMode: GovernanceMode;
  reason: ModeTransitionReason;
  actor: string;
  timestamp: string;
  /** Optional reference to a USER_OVERRIDE ledger entry id. */
  ledgerEntryRef?: string | null;
}

/** Persisted ring-buffer record for the transition feed. */
export interface ModeTransitionRecord extends GovernanceModeChangedEvent {
  /** Stable id for deep-linking from the UI. */
  id: string;
}
