/**
 * runQorlogicCli — the Console skill-enumeration runner (`python -m qor.cli …`
 * with the workspace as cwd), moved out of bootstrapServers.ts so it can be
 * tested without VS Code (v6.0.8 lane A, LD11). `-P` keeps Python from
 * importing a `qor/cli.py` planted in the workspace.
 */

import type { InstallerRun } from './QorLogicPackageInstaller';
import type { PythonInterpreterResolver } from './PythonInterpreterResolver';

export async function runQorlogicCli(
  resolver: Pick<PythonInterpreterResolver, 'resolve'>,
  workspaceRoot: string,
  extra: ReadonlyArray<string>,
  run: InstallerRun,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const py = await resolver.resolve();
  if (!py.ok) return { stdout: '', stderr: 'no-python-found', code: -1 };
  const r = await run(py.command, [...py.args, '-P', '-m', 'qor.cli', ...extra], {
    timeoutMs: 180_000, cwd: workspaceRoot, env: { QORLOGIC_PROJECT_DIR: workspaceRoot },
  });
  return { stdout: r.stdout, stderr: r.stderr, code: r.code };
}
