import type { QorLogicSkillIngestor, QorLogicHost } from '../qorlogic/QorLogicSkillIngestor';

export type InstallStepId =
  | 'resolve-python'
  | 'pip-install'
  | `qorlogic-install:${QorLogicHost}`
  | 'provenance'
  | 'refresh';

export interface InstallStep {
  id: InstallStepId;
  status: 'pending' | 'running' | 'success' | 'error';
  label: string;
  command?: string;
  path?: string;
  count?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface InstallReport {
  ok: boolean;
  pythonPath?: string;
  packageVersion?: string;
  steps: InstallStep[];
  totalInstalled: number;
  destinations: string[];
  failures: Array<{ host: string; error: string }>;
  // Back-compat fields for the Console scaffold callback shape.
  scaffolded: number;
  skipped: number;
  error?: string;
}

export interface InstallCallbacks {
  onProgress?: (step: InstallStep) => void;
  onComplete?: (report: InstallReport) => void;
}

const DEFAULT_HOSTS: QorLogicHost[] = ['claude', 'codex'];

export function createInstallSkillsHandler(
  ingestor: QorLogicSkillIngestor,
  callbacks: InstallCallbacks = {},
): () => Promise<InstallReport> {
  return async () => {
    const steps: InstallStep[] = [];
    const emit = (step: InstallStep) => {
      steps.push(step);
      callbacks.onProgress?.(step);
    };
    const start: InstallStep = {
      id: 'pip-install',
      status: 'running',
      label: 'Installing QorLogic skills',
      startedAt: new Date().toISOString(),
    };
    emit(start);

    const result = await ingestor.ingest({ hosts: DEFAULT_HOSTS, scope: 'repo' });

    const finalStep: InstallStep = {
      id: 'pip-install',
      status: result.failures.length === 0 ? 'success' : 'error',
      label: result.failures.length === 0
        ? `Installed ${result.skillCount} skills across ${result.installedHosts.length} host(s)`
        : `Installed with ${result.failures.length} failure(s)`,
      count: result.skillCount,
      completedAt: new Date().toISOString(),
      error: collectError(result.failures),
    };
    emit(finalStep);

    const report = buildReport(result, steps);
    callbacks.onComplete?.(report);
    return report;
  };
}

function buildReport(
  ingest: { ok: boolean; installedHosts: QorLogicHost[]; skillCount: number; failures: Array<{ host: string; error: string }> },
  steps: InstallStep[],
): InstallReport {
  const errorString = collectError(ingest.failures);
  return {
    ok: ingest.ok,
    steps,
    totalInstalled: ingest.skillCount,
    destinations: ingest.installedHosts.map((h) => `.${h}/skills/`),
    failures: [...ingest.failures],
    scaffolded: ingest.skillCount,
    skipped: 0,
    error: errorString,
  };
}

function collectError(
  failures: ReadonlyArray<{ host: string; error: string }>,
): string | undefined {
  if (failures.length === 0) return undefined;
  return failures.map((f) => `${f.host}: ${f.error}`).join('; ');
}
