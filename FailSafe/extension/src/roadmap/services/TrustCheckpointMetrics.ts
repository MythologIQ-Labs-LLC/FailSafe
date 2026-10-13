/**
 * Evidence-honest, bounded policy checkpoint summary (#470).
 *
 * A settings toggle, policy-unrelated checkpoint, or synthetic startup PASS is
 * not proof that a policy was checked. Never calculate a percentage from those.
 * The caller supplies the most recent N checkpoints; this describes that
 * sample window, not the full lifetime of the repository.
 */
export interface PolicyCheckpointView {
  checkpointType?: unknown;
  status?: unknown;
  policyVerdict?: unknown;
  evidenceRefs?: unknown;
}

export interface PolicyTrustSummary {
  overall: number | null;
  status: 'verified' | 'no-evidence' | 'inconclusive';
  checkpointCount: number;
  passCount: number;
  verifiedCount: number;
  inconclusiveCount: number;
  sampleLimit: number;
}

export function summarizePolicyTrust(
  records: readonly PolicyCheckpointView[],
  sampleLimit = 100,
): PolicyTrustSummary {
  const relevant = records.filter((c) => c?.checkpointType === 'policy.checked');
  let passCount = 0;
  let verifiedCount = 0;

  for (const c of relevant) {
    const finalized = c.status === 'validated' || c.status === 'sealed';
    const supportedVerdict = c.policyVerdict === 'PASS' || c.policyVerdict === 'VIOLATION';
    const hasEvidence = Array.isArray(c.evidenceRefs) &&
      c.evidenceRefs.some((ref: unknown) => typeof ref === 'string' && ref.trim().length > 0);
    if (!finalized || !supportedVerdict || !hasEvidence) continue;
    verifiedCount++;
    if (c.policyVerdict === 'PASS') passCount++;
  }

  const inconclusiveCount = relevant.length - verifiedCount;
  const status = relevant.length === 0 ? 'no-evidence'
    : inconclusiveCount > 0 ? 'inconclusive'
      : 'verified';
  return {
    overall: status === 'verified' ? Math.round((passCount / verifiedCount) * 100) : null,
    status,
    checkpointCount: relevant.length,
    passCount,
    verifiedCount,
    inconclusiveCount,
    sampleLimit,
  };
}
