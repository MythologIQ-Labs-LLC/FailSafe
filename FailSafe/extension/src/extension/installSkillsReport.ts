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
  summary?: { hostsVerified: number; totalFiles: number; destinations: string[] };
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
  const destinationSet = new Set<string>();
  let reportedFiles = 0;
  let successfulHosts = 0;
  let provenance: QorLogicInstallInvocation['summary'] | undefined;
  for (const inv of invocations) {
    if (inv.phase === 'qorlogic-install') {
      if (inv.status === 'success') {
        successfulHosts += 1;
        reportedFiles += inv.installedCount ?? 0;
      }
      if (inv.status === 'error' && inv.host) {
        failures.push({ host: inv.host, error: inv.error ?? 'unknown-error' });
      }
    }
    if (inv.phase === 'provenance' && inv.status === 'success') {
      provenance = inv.summary;
    }
  }
  // #463: no successful host install without corresponding on-disk, hashed
  // provenance. A zero-exit subprocess is insufficient; partial reports
  // without a provenance phase must not claim delivery.
  const provenanceSufficient = successfulHosts === 0
    || !!provenance && provenance.hostsVerified >= successfulHosts
      && provenance.totalFiles >= reportedFiles;
  const ok = invocations.every((i) => i.status === 'success')
    && failures.length === 0 && provenanceSufficient;
  // A successful operation reports only verified destination/count evidence.
  // Failed runs retain diagnostics but do not claim completed installations.
  if (ok && provenance && successfulHosts > 0) {
    for (const d of provenance.destinations) destinationSet.add(d);
  }
  return {
    ok,
    invocations,
    totalInstalled: ok ? reportedFiles : 0,
    destinations: [...destinationSet].sort(),
    failures,
  };
}
