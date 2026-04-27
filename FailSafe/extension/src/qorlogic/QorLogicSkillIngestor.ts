import * as fs from 'fs';
import * as path from 'path';
import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';
import type {
  IQorLogicPackageInstaller,
  InstallerRun,
  InstallerRunResult,
  OutputChannelLike,
} from './QorLogicPackageInstaller';

export type QorLogicHost = 'claude' | 'codex' | 'gemini' | 'kilo-code';
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
  skillCount: number;
  failures: QorLogicIngestFailure[];
}

const HOST_SUBDIR: Record<QorLogicHost, { dot: string; sub: string }> = {
  claude: { dot: '.claude', sub: 'skills' },
  codex: { dot: '.codex', sub: 'skills' },
  'kilo-code': { dot: '.kilo-code', sub: 'skills' },
  gemini: { dot: '.gemini', sub: 'commands' },
};

const INSTALL_TIMEOUT_MS = 180_000;

const SYNTHESIZED_SOURCE_YML = [
  'source_type: qorlogic-package',
  'source_name: qor-logic',
  'source_url: https://pypi.org/project/qor-logic/',
  'installed_by: failsafe-v5',
  'admission_state: admitted',
  'trust_tier: curated',
  '',
].join('\n');

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
    };
  }

  private async runHosts(
    py: ResolvedInterpreter,
    options: QorLogicIngestOptions,
  ): Promise<QorLogicIngestResult> {
    const installedHosts: QorLogicHost[] = [];
    const failures: QorLogicIngestFailure[] = [];
    let skillCount = 0;
    for (const host of options.hosts) {
      const result = await this.installSingleHost(py, host, options.scope);
      if (!result.ok) {
        failures.push({ host, error: result.error });
        continue;
      }
      installedHosts.push(host);
      skillCount += this.synthesizeProvenance(host);
    }
    return {
      ok: failures.length === 0 && installedHosts.length > 0,
      installedHosts,
      skillCount,
      failures,
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

  private synthesizeProvenance(host: QorLogicHost): number {
    const skillsRoot = this.hostSkillsRoot(host);
    if (!fs.existsSync(skillsRoot)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(skillsRoot, entry.name);
      const sourcePath = path.join(skillDir, 'SOURCE.yml');
      if (fs.existsSync(sourcePath)) {
        count += 1;
        continue;
      }
      fs.writeFileSync(sourcePath, SYNTHESIZED_SOURCE_YML, 'utf8');
      count += 1;
    }
    return count;
  }

  private hostSkillsRoot(host: QorLogicHost): string {
    const layout = HOST_SUBDIR[host];
    return path.join(this.workspaceRoot, layout.dot, layout.sub);
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
