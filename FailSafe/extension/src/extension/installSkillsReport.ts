import type { QorLogicHost, QorLogicScope } from '../qorlogic/QorLogicSkillIngestor';

export type InstallPhase =
  | 'python-probe'
  | 'pip-install'
  | 'qorlogic-install'
  | 'provenance'
  | 'refresh';

export interface QorLogicInstallInvocation {
  phase: InstallPhase;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  completedAt?: string;
  host?: QorLogicHost;
  scope?: QorLogicScope;
  command?: string;
  interpreter?: string;
  destination?: string;
  installedCount?: number;
  version?: string;
  summary?: { hostsVerified: number; totalFiles: number; destinations: string[];
    verifiedHosts?: Array<{ host: QorLogicHost; fileCount: number }> };
  error?: string;
  stderrTail?: string;
  /** #538: the approved Console operation this step belongs to. */
  operationId?: string;
}

export interface QorLogicInstallReport {
  ok: boolean;
  invocations: QorLogicInstallInvocation[];
  totalInstalled: number;
  destinations: string[];
  failures: Array<{ host: QorLogicHost; error: string }>;
  /** #538: the approved Console operation this report belongs to. */
  operationId?: string;
}

export interface InstallCallbacks {
  onProgress?: (invocation: QorLogicInstallInvocation) => void;
  onComplete?: (report: QorLogicInstallReport) => void;
}

export type InstallStepInput = Omit<QorLogicInstallInvocation, 'status' | 'startedAt' | 'completedAt'>;

export async function runInstallStep(
  base: InstallStepInput,
  fn: () => Promise<Partial<QorLogicInstallInvocation>>,
): Promise<QorLogicInstallInvocation> {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    return {
      ...base, ...result,
      status: 'success',
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      startedAt,
      completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function aggregateReport(
  invocations: QorLogicInstallInvocation[],
): QorLogicInstallReport {
  const failures: Array<{ host: QorLogicHost; error: string }> = [];
  const successful = invocations.filter(
    (i) => i.phase === 'qorlogic-install' && i.status === 'success',
  );
  const provenance = invocations.find(
    (i) => i.phase === 'provenance' && i.status === 'success',
  )?.summary;
  for (const inv of invocations) {
    if (inv.phase === 'qorlogic-install' && inv.status === 'error' && inv.host) {
      failures.push({ host: inv.host, error: inv.error ?? 'unknown-error' });
    }
  }
  // #463: a count of receipts can be from *other* hosts. Bind every claimed
  // successful host to that specific host's on-disk file hash evidence.
  const claimsVerified = successful.length === 0 || !!provenance?.verifiedHosts
    && successful.every((inv) => {
      const proof = provenance.verifiedHosts!.find((v) => v.host === inv.host);
      return !!proof && proof.fileCount >= (inv.installedCount ?? 0)
        && proof.fileCount > 0;
    });
  // Partial progress is still reported when one host fails but the other
  // host has verified receipts. Without proof, report no installation.
  const totalInstalled = claimsVerified
    ? successful.reduce((sum, inv) => sum + (inv.installedCount ?? 0), 0)
    : 0;
  const ok = invocations.every((i) => i.status === 'success')
    && failures.length === 0 && claimsVerified;
  return {
    ok,
    invocations,
    totalInstalled,
    destinations: claimsVerified && provenance && successful.length > 0
      ? [...new Set(provenance.destinations)].sort() : [],
    failures,
  };
}
