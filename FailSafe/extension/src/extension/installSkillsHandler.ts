import * as vscode from 'vscode';
import type { QorLogicSkillIngestor, QorLogicHost, QorLogicScope } from '../qorlogic/QorLogicSkillIngestor';
import { getQorLogicInstallStatus } from '../qorlogic/qorLogicInstallRecord';
import {
  type QorLogicInstallInvocation,
  type QorLogicInstallReport,
  type InstallCallbacks,
  runInstallStep,
  aggregateReport,
} from './installSkillsReport';
import { resolveInstallSkillsOptions, type InstallSkillsOptions } from './installSkillsOptions';

export type InstallMode = 'prompt' | 'defaults';

export const DEFAULT_HOSTS: QorLogicHost[] = ['claude', 'codex'];
export const DEFAULT_OPTIONS: InstallSkillsOptions = { hosts: DEFAULT_HOSTS, scope: 'repo' };

function emit(
  invocation: QorLogicInstallInvocation,
  onProgress?: (i: QorLogicInstallInvocation) => void,
): QorLogicInstallInvocation {
  onProgress?.(invocation);
  return invocation;
}

export async function runProbeStep(
  ingestor: QorLogicSkillIngestor,
  onProgress?: (i: QorLogicInstallInvocation) => void,
): Promise<QorLogicInstallInvocation> {
  emit({ phase: 'python-probe', status: 'running', startedAt: new Date().toISOString() }, onProgress);
  const inv = await runInstallStep({ phase: 'python-probe' }, async () => {
    const result = await ingestor.probePython();
    if (!result.ok) throw new Error(result.error);
    return { interpreter: result.interpreter, command: result.command };
  });
  return emit(inv, onProgress);
}

export async function runPipStep(
  ingestor: QorLogicSkillIngestor,
  onProgress?: (i: QorLogicInstallInvocation) => void,
): Promise<QorLogicInstallInvocation> {
  emit({ phase: 'pip-install', status: 'running', startedAt: new Date().toISOString() }, onProgress);
  const inv = await runInstallStep({ phase: 'pip-install' }, async () => {
    const result = await ingestor.ensurePackageInstalled();
    if (!result.ok) {
      const err = new Error(result.error) as Error & { stderrTail?: string };
      err.stderrTail = result.stderrTail;
      throw err;
    }
    return { command: result.command };
  });
  return emit(inv, onProgress);
}

export async function runHostInstallStep(
  ingestor: QorLogicSkillIngestor,
  host: QorLogicHost,
  scope: QorLogicScope,
  onProgress?: (i: QorLogicInstallInvocation) => void,
): Promise<QorLogicInstallInvocation> {
  emit({ phase: 'qorlogic-install', status: 'running', startedAt: new Date().toISOString(), host, scope }, onProgress);
  const inv = await runInstallStep({ phase: 'qorlogic-install', host, scope }, async () => {
    const result = await ingestor.installHost(host, scope);
    if (!result.ok) {
      const err = new Error(result.error) as Error & { stderrTail?: string };
      err.stderrTail = result.stderrTail;
      throw err;
    }
    return { destination: result.destination, installedCount: result.installedCount, command: result.command };
  });
  return emit(inv, onProgress);
}

export async function runProvenanceStep(
  workspaceRoot: string,
  onProgress?: (i: QorLogicInstallInvocation) => void,
): Promise<QorLogicInstallInvocation> {
  emit({ phase: 'provenance', status: 'running', startedAt: new Date().toISOString() }, onProgress);
  const inv = await runInstallStep({ phase: 'provenance' }, async () => {
    const status = getQorLogicInstallStatus(workspaceRoot);
    const hostsVerified = status.hosts.filter((h) => h.installed).length;
    return {
      summary: {
        hostsVerified,
        totalFiles: status.totalFiles,
        destinations: [...status.destinations],
      },
    };
  });
  return emit(inv, onProgress);
}

export async function runRefreshStep(
  ingestor: QorLogicSkillIngestor,
  onProgress?: (i: QorLogicInstallInvocation) => void,
): Promise<QorLogicInstallInvocation> {
  emit({ phase: 'refresh', status: 'running', startedAt: new Date().toISOString() }, onProgress);
  const inv = await runInstallStep({ phase: 'refresh' }, async () => {
    await ingestor.rescanWorkspace();
    return {};
  });
  return emit(inv, onProgress);
}

function finalize(
  invocations: QorLogicInstallInvocation[],
  callbacks: InstallCallbacks,
): QorLogicInstallReport {
  const report = aggregateReport(invocations);
  callbacks.onComplete?.(report);
  return report;
}

export function createInstallSkillsHandler(
  context: vscode.ExtensionContext,
  ingestor: QorLogicSkillIngestor,
  callbacks: InstallCallbacks = {},
  mode: InstallMode = 'prompt',
): () => Promise<QorLogicInstallReport | null> {
  return async () => {
    const options = mode === 'defaults'
      ? DEFAULT_OPTIONS
      : await resolveInstallSkillsOptions(context);
    if (!options) return null;
    const invs: QorLogicInstallInvocation[] = [];
    const probe = await runProbeStep(ingestor, callbacks.onProgress);
    invs.push(probe);
    if (probe.status === 'error') return finalize(invs, callbacks);
    const pip = await runPipStep(ingestor, callbacks.onProgress);
    invs.push(pip);
    if (pip.status === 'error') return finalize(invs, callbacks);
    for (const host of options.hosts) {
      invs.push(await runHostInstallStep(ingestor, host, options.scope, callbacks.onProgress));
    }
    invs.push(await runProvenanceStep(ingestor.getWorkspaceRoot(), callbacks.onProgress));
    invs.push(await runRefreshStep(ingestor, callbacks.onProgress));
    return finalize(invs, callbacks);
  };
}
