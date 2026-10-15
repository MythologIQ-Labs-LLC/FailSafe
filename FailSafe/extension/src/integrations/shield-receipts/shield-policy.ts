/**
 * shield-policy — what a SHIELD receipt must satisfy to verify (#476).
 * Defaults: Qor-logic 0.176.1 artifacts, risk grades L1-L3, receipts at most
 * 14 days old, 5 minutes of allowed clock skew.
 */

export interface ShieldPolicy {
  readonly pinnedQorVersion: string;
  readonly acceptedRiskGrades: readonly string[];
  readonly maxReceiptAgeMs: number;
  readonly clockSkewMs: number;
}

export const DEFAULT_SHIELD_POLICY: ShieldPolicy = Object.freeze({
  pinnedQorVersion: '0.176.1',
  acceptedRiskGrades: Object.freeze(['L1', 'L2', 'L3']),
  maxReceiptAgeMs: 14 * 24 * 60 * 60 * 1000,
  clockSkewMs: 5 * 60 * 1000,
});
