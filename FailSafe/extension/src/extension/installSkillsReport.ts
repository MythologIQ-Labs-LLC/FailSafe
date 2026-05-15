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
}

export interface QorLogicInstallReport {
  ok: boolean;
  invocations: QorLogicInstallInvocation[];
  totalInstalled: number;
  destinations: string[];
  failures: Array<{ host: QorLogicHost; error: string }>;
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
  let totalInstalled = 0;
  for (const inv of invocations) {
    if (inv.installedCount) totalInstalled += inv.installedCount;
    if (inv.destination) destinationSet.add(inv.destination);
    if (inv.summary?.destinations) {
      for (const d of inv.summary.destinations) destinationSet.add(d);
    }
    if (inv.phase === 'qorlogic-install' && inv.status === 'error' && inv.host) {
      failures.push({ host: inv.host, error: inv.error ?? 'unknown-error' });
    }
  }
  const ok = invocations.every((i) => i.status === 'success' || i.status === 'running')
    && failures.length === 0;
  return {
    ok,
    invocations,
    totalInstalled,
    destinations: [...destinationSet].sort(),
    failures,
  };
}
