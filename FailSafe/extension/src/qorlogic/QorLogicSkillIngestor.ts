import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';
import type {
  IQorLogicPackageInstaller,
  InstallerRun,
  InstallerRunResult,
  OutputChannelLike,
} from './QorLogicPackageInstaller';
import { frozenHostSelectionError, type QorLogicHost } from './hostLayouts';
import { checkFrozenQorPackage, ensureFrozenQorPackage } from './qorPackageEnsure';
import { type HostInstallStatus } from './qorLogicInstallRecord';
import { verifyHostInstallReceipt } from './qorHostReceiptVerify';
import { parseQorHostInstallCount } from './qorHostInstallOutput';

export type { QorLogicHost } from './hostLayouts';
export type QorLogicScope = 'repo' | 'global';

export interface QorLogicIngestOptions {
  hosts: QorLogicHost[];
  scope: QorLogicScope;
}

export interface QorLogicIngestFailure {
  host: QorLogicHost;
  error: string;
}

export interface QorLogicIngestResult {
  ok: boolean;
  installedHosts: QorLogicHost[];
  /** Total file count across hosts, sourced from each host's install record. */
  skillCount: number;
  failures: QorLogicIngestFailure[];
  /**
   * Per-host install status, read from `<base>/.qorlogic-installed.json` after
   * the CLI completes successfully. The record is the canonical source of truth
   * for "what did qor-logic write?" — do NOT infer from directory listings or
   * synthesize per-skill provenance.
   */
  hostStatuses: HostInstallStatus[];
}
export interface HostInstallSuccess {
  ok: true;
  host: QorLogicHost;
  scope: QorLogicScope;
  destination: string;
  installedCount: number;
  command: string;
}

export interface HostInstallError {
  ok: false;
  host: QorLogicHost;
  scope: QorLogicScope;
  error: string;
  stderrTail?: string;
  command: string;
}

export type HostInstallResult = HostInstallSuccess | HostInstallError;

const INSTALL_TIMEOUT_MS = 180_000;

export class QorLogicSkillIngestor {
  constructor(
    private readonly installer: IQorLogicPackageInstaller,
    private readonly resolver: PythonInterpreterResolver,
    private readonly workspaceRoot: string,
    private readonly run: InstallerRun,
    private readonly rescan: (workspaceRoot: string) => Promise<void>,
    private readonly output: OutputChannelLike,
  ) {}

  async ingest(options: QorLogicIngestOptions): Promise<QorLogicIngestResult> {
    const hostError = frozenHostSelectionError(options.hosts);
    if (hostError) return this.failAll(Array.isArray(options.hosts) ? options.hosts : [], hostError);
    if (options.scope !== 'repo') return this.failAll(options.hosts, 'global-scope-receipt-unverified');
    const py = await this.resolver.resolve();
    if (!py.ok) {
      return this.failAll(options.hosts, 'no-python-found');
    }
    const ensured = await this.ensureInstalled();
    if (!ensured.ok) {
      return this.failAll(options.hosts, ensured.error);
    }
    const aggregate = await this.runHosts(py, options);
    await this.rescan(this.workspaceRoot);
    return aggregate;
  }

  /** Resolve Python for the UI's explicit probe stage. */
  async probePython(): Promise<{ ok: true; interpreter: string; command: string } | { ok: false; error: string }> {
    const py = await this.resolver.resolve();
    if (!py.ok) return { ok: false, error: 'no-python-found' };
    return { ok: true, interpreter: py.command, command: `${py.command} ${py.args.join(' ')}` };
  }

  /** Fresh installation requires an approved, hash-verified offline wheel. */
  async ensurePackageInstalled(approvedWheelPath?: string): Promise<{ ok: true; command: string } | { ok: false; error: string; stderrTail?: string }> {
    return ensureFrozenQorPackage(this.installer, approvedWheelPath);
  }

  /**
   * Workspace root accessor — used by orchestrator's `runProvenanceStep`.
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Trigger workspace rescan (broadcast hub.refresh). Used by orchestrator's
   * `runRefreshStep`.
   */
  async rescanWorkspace(): Promise<void> {
    await this.rescan(this.workspaceRoot);
  }

  /** Single-host install for the Console; requires verified package and receipt. */
  async installHost(host: QorLogicHost, scope: QorLogicScope, skillFilter?: ReadonlyArray<string>): Promise<HostInstallResult> {
    const hostError = frozenHostSelectionError([host]);
    if (hostError) return { ok: false, host, scope, command: '', error: hostError };
    // #463: frozen qor-logic 0.176.1 has no --include. Even an empty, explicitly
    // supplied filter is an ambiguous selection request; never install all.
    if (skillFilter !== undefined) {
      return { ok: false, host, scope, command: '',
        error: 'selective-skill-install-unsupported-by-frozen-qor-logic-0.176.1' };
    }
    if (scope !== 'repo') return { ok: false, host, scope, command: '', error: 'global-scope-receipt-unverified' };
    const readiness = await checkFrozenQorPackage(this.installer);
    if (!readiness.ok) {
      return { ok: false, host, scope, command: '', error: readiness.error };
    }
    const py = await this.resolver.resolve();
    if (!py.ok) {
      return { ok: false, host, scope, error: 'no-python-found', command: '' };
    }
    // -P: never import qor from the workspace, which is this run's cwd (LD11).
    const args = [
      ...py.args,
      '-P', '-m', 'qor.cli', 'install',
      '--host', host,
      '--scope', scope,
    ];
    const command = `${py.command} ${args.join(' ')}`;
    this.output.appendLine(`[qor-logic] ${command}`);
    const result = await this.run(py.command, args, {
      timeoutMs: INSTALL_TIMEOUT_MS,
      cwd: this.workspaceRoot,
      env: { QORLOGIC_PROJECT_DIR: this.workspaceRoot },
    });
    const mapped = mapHostResult(result, this.output, host);
    if (!mapped.ok) {
      return {
        ok: false, host, scope, command,
        error: mapped.error,
        stderrTail: result.stderr ? result.stderr.slice(-512) : undefined,
      };
    }
    const verified = verifyHostInstallReceipt(this.workspaceRoot, host);
    if (!verified.ok) return { ok: false, host, scope, command, error: verified.error };
    const status = verified.status;
    if (mapped.installedCount !== status.fileCount) {
      return { ok: false, host, scope, command, error: 'install-output-receipt-count-mismatch' };
    }
    const destination = status.destinations[0] ?? '';
    return {
      ok: true, host, scope, command,
      destination,
      installedCount: status.fileCount,
    };
  }

  private async ensureInstalled(): Promise<{ ok: true } | { ok: false; error: string }> {
    return checkFrozenQorPackage(this.installer);
  }

  private failAll(hosts: QorLogicHost[], error: string): QorLogicIngestResult {
    return {
      ok: false,
      installedHosts: [],
      skillCount: 0,
      failures: hosts.map((host) => ({ host, error })),
      hostStatuses: [],
    };
  }

  private async runHosts(
    py: ResolvedInterpreter,
    options: QorLogicIngestOptions,
  ): Promise<QorLogicIngestResult> {
    const installedHosts: QorLogicHost[] = [];
    const failures: QorLogicIngestFailure[] = [];
    const hostStatuses: HostInstallStatus[] = [];
    let skillCount = 0;
    for (const host of options.hosts) {
      const result = await this.installSingleHost(py, host, options.scope);
      if (!result.ok) {
        failures.push({ host, error: result.error });
        continue;
      }
      const verified = verifyHostInstallReceipt(this.workspaceRoot, host);
      if (!verified.ok) { failures.push({ host, error: verified.error }); continue; }
      if (verified.status.fileCount !== result.installedCount) {
        failures.push({ host, error: 'install-output-receipt-count-mismatch' }); continue;
      }
      installedHosts.push(host);
      hostStatuses.push(verified.status);
      const status = verified.status;
      skillCount += status.fileCount;
    }
    return {
      ok: failures.length === 0 && installedHosts.length > 0,
      installedHosts,
      skillCount,
      failures,
      hostStatuses,
    };
  }

  private async installSingleHost(
    py: ResolvedInterpreter,
    host: QorLogicHost,
    scope: QorLogicScope,
  ): Promise<{ ok: true; installedCount: number } | { ok: false; error: string }> {
    const args = [
      ...py.args,
      '-P', '-m', 'qor.cli', 'install',
      '--host', host,
      '--scope', scope,
    ];
    const cmdString = `${py.command} ${args.join(' ')}`;
    this.output.appendLine(`[qor-logic] ${cmdString}`);
    const result = await this.run(py.command, args, {
      timeoutMs: INSTALL_TIMEOUT_MS,
      cwd: this.workspaceRoot,
      env: { QORLOGIC_PROJECT_DIR: this.workspaceRoot },
    });
    return mapHostResult(result, this.output, host);
  }
}

function mapHostResult(
  result: InstallerRunResult,
  output: OutputChannelLike,
  host: QorLogicHost,
): { ok: true; installedCount: number } | { ok: false; error: string } {
  if (result.timedOut) return { ok: false, error: 'timeout' };
  if (result.spawnError) return { ok: false, error: `spawn-failed: ${result.spawnError}` };
  if (result.code !== 0) {
    if (result.stderr) output.appendLine(result.stderr);
    return { ok: false, error: result.stderr.trim() || `exit-code-${result.code}` };
  }
  const installedCount = parseQorHostInstallCount(result.stdout, host);
  if (installedCount === null) return { ok: false, error: 'install-confirmation-missing-or-invalid' };
  return { ok: true, installedCount };
}
