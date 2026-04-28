import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';
import type {
  IQorLogicPackageInstaller,
  InstallerRun,
  InstallerRunResult,
  OutputChannelLike,
} from './QorLogicPackageInstaller';
import { type QorLogicHost } from './hostLayouts';
import { getHostInstallStatus, type HostInstallStatus } from './qorLogicInstallRecord';

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

  private async ensureInstalled(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (await this.installer.isInstalled()) return { ok: true };
    const result = await this.installer.install();
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error ?? 'install-failed' };
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
      installedHosts.push(host);
      // The CLI returned 0; read its install record (canonical truth).
      // No directory walks, no synthesized provenance.
      const status = getHostInstallStatus(this.workspaceRoot, host);
      hostStatuses.push(status);
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
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const args = [
      ...py.args,
      '-m', 'qor.cli', 'install',
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
    return mapHostResult(result, this.output);
  }
}

function mapHostResult(
  result: InstallerRunResult,
  output: OutputChannelLike,
): { ok: true } | { ok: false; error: string } {
  if (result.timedOut) return { ok: false, error: 'timeout' };
  if (result.spawnError) return { ok: false, error: `spawn-failed: ${result.spawnError}` };
  if (result.code !== 0) {
    if (result.stderr) output.appendLine(result.stderr);
    return { ok: false, error: result.stderr.trim() || `exit-code-${result.code}` };
  }
  return { ok: true };
}
