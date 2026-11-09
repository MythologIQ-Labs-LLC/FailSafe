import * as vscode from 'vscode';
import type { QorLogicSkillIngestor, QorLogicHost, QorLogicScope } from '../qorlogic/QorLogicSkillIngestor';
import { verifyHostInstallReceipt } from '../qorlogic/qorHostReceiptVerify';
import { QOR_LOGIC_HOSTS, frozenHostSelectionError } from '../qorlogic/hostLayouts';
import {
  type QorLogicInstallInvocation,
  type QorLogicInstallReport,
  type InstallCallbacks,
  runInstallStep,
  aggregateReport,
} from './installSkillsReport';
import { resolveInstallSkillsOptions, type InstallSkillsOptions } from './installSkillsOptions';

export type InstallMode = 'prompt' | 'defaults' | 'web';

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
    let result = await ingestor.ensurePackageInstalled();
    if (!result.ok && result.error === 'verified-wheel-required') {
      // #463: require local wheel choice AND explicit operator confirmation.
      // Never silently download or upgrade from a configured pip index.
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
        filters: { "Python wheel": ["whl"] },
        openLabel: "Select Qor-logic 0.176.1 verified wheel",
      });
      if (!selected?.length) throw new Error('verified-wheel-required: selection cancelled');
      const consent = await vscode.window.showWarningMessage(
        'Install frozen Qor-logic 0.176.1 from this wheel? SHA-256 checked before an offline no-dependencies install.',
        { modal: true }, 'Install verified wheel',
      );
      if (consent !== 'Install verified wheel') throw new Error('verified-wheel-required: operator declined');
      result = await ingestor.ensurePackageInstalled(selected[0].fsPath);
    }
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
  skillFilter?: ReadonlyArray<string>,
): Promise<QorLogicInstallInvocation> {
  emit({ phase: 'qorlogic-install', status: 'running', startedAt: new Date().toISOString(), host, scope }, onProgress);
  const inv = await runInstallStep({ phase: 'qorlogic-install', host, scope }, async () => {
    const result = await ingestor.installHost(host, scope, skillFilter);
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
    // Do not pre-read unbounded, attacker-controlled JSON through the Hub.
    // The size-bounded verifier must be the first code to open each receipt.
    const receipts = QOR_LOGIC_HOSTS
      .map((host) => ({ host, result: verifyHostInstallReceipt(workspaceRoot, host) }))
      .filter((entry) => entry.result.ok);
    return {
      summary: {
        hostsVerified: receipts.length,
        totalFiles: receipts.reduce((sum, entry) =>
          sum + (entry.result.ok ? entry.result.status.fileCount : 0), 0),
        destinations: [...new Set(receipts.flatMap((entry) =>
          entry.result.ok ? entry.result.status.destinations : []))].sort(),
        verifiedHosts: receipts.map((entry) => ({
          host: entry.host,
          fileCount: entry.result.ok ? entry.result.status.fileCount : 0,
        })),
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
    const selectionError = frozenHostSelectionError(options.hosts);
    if (selectionError) {
      const at = new Date().toISOString();
      invs.push(emit({ phase: 'qorlogic-install', status: 'error',
        startedAt: at, completedAt: at, error: selectionError }, callbacks.onProgress));
      return finalize(invs, callbacks);
    }
    if (options.scope !== 'repo') {
      const at = new Date().toISOString();
      invs.push(emit({ phase: 'qorlogic-install', status: 'error',
        startedAt: at, completedAt: at, scope: options.scope,
        error: 'Global-scope installation is unavailable: FailSafe cannot verify host receipts outside the workspace. No Python process started.',
      }, callbacks.onProgress));
      return finalize(invs, callbacks);
    }
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

export function createScaffoldWithWebOptions(
  ingestor: QorLogicSkillIngestor,
  callbacks: InstallCallbacks = {},
): (
  hosts: QorLogicHost[], scope: QorLogicScope, skillFilter?: Record<string, string[]>, context?: { operationId: string },
) => Promise<QorLogicInstallReport> {
  return async (hosts, scope, skillFilter, context) => {
    // #538: the Console route passes the approved operation's id; every progress event and
    // the final report carry it.
    const cb = withOperationId(callbacks, context?.operationId);
    const invs: QorLogicInstallInvocation[] = [];
    const selectionError = frozenHostSelectionError(hosts);
    if (selectionError) {
      const at = new Date().toISOString();
      invs.push(emit({ phase: 'qorlogic-install', status: 'error',
        startedAt: at, completedAt: at, scope,
        ...(context?.operationId ? { operationId: context.operationId } : {}),
        error: selectionError }, cb.onProgress));
      return finalize(invs, cb);
    }
    // #463: selection keys, including explicit [], cannot be represented by
    // the frozen 0.176.1 CLI. Refuse BEFORE any Python or pip side effects.
    if (scope !== 'repo' || (skillFilter && Object.keys(skillFilter).length > 0)) {
      const host = hosts.find((h) => skillFilter && Object.prototype.hasOwnProperty.call(skillFilter, h));
      const at = new Date().toISOString();
      invs.push(emit({
        phase: 'qorlogic-install', status: 'error', startedAt: at, completedAt: at,
        ...(context?.operationId ? { operationId: context.operationId } : {}),
        ...(host ? { host, scope } : { scope }),
        error: scope !== 'repo'
          ? 'Global-scope installation is unavailable: host receipts cannot be verified. No Python process started.'
          : 'Selected-skill installation is unavailable with frozen qor-logic 0.176.1; no Python process or install was started.',
      }, cb.onProgress));
      return finalize(invs, cb);
    }
    const probe = await runProbeStep(ingestor, cb.onProgress);
    invs.push(probe);
    if (probe.status === 'error') return finalize(invs, cb);
    const pip = await runPipStep(ingestor, cb.onProgress);
    invs.push(pip);
    if (pip.status === 'error') return finalize(invs, cb);
    for (const host of hosts) {
      const filter = skillFilter ? skillFilter[host] : undefined;
      invs.push(await runHostInstallStep(ingestor, host, scope, cb.onProgress, filter));
    }
    invs.push(await runProvenanceStep(ingestor.getWorkspaceRoot(), cb.onProgress));
    invs.push(await runRefreshStep(ingestor, cb.onProgress));
    return finalize(invs, cb);
  };
}

function withOperationId(callbacks: InstallCallbacks, operationId: string | undefined): InstallCallbacks {
  if (!operationId) return callbacks;
  return {
    onProgress: (i) => callbacks.onProgress?.({ ...i, operationId }),
    onComplete: (r) => callbacks.onComplete?.({ ...r, operationId }),
  };
}

/** Compatibility alias; selected-skill filters are refused by the shared handler. */
export const createScaffoldWithSkillFilter = createScaffoldWithWebOptions;
