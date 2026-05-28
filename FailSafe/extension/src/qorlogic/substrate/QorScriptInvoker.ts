import {
  defaultInstallerRun,
  type InstallerRun,
} from '../QorLogicPackageInstaller';
import {
  PythonInterpreterResolver,
  type InterpreterResult,
} from '../PythonInterpreterResolver';
import type { ModuleResult } from './types';

export interface InvokeOptions {
  module: string;
  args: string[];
  timeoutMs?: number;
  cwd?: string;
}

export interface InvokeResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: ModuleResult['error'];
}

/**
 * QorScriptInvoker — invoke `python -m qor.scripts.<module>` and shape the
 * subprocess outcome into a discriminable result.
 *
 * Composes against the REAL FailSafe primitives:
 *   - PythonInterpreterResolver (3-arg ctor `(config, vscode, run)`) is injected.
 *   - defaultInstallerRun (from QorLogicPackageInstaller) is the default
 *     spawn driver; tests swap via the `run` instance field.
 *   - InstallerRunResult exposes `{stdout, stderr, code, timedOut, spawnError?}`
 *     — NO `ok` field; we derive ok = (code === 0 && !timedOut && !spawnError).
 */
export class QorScriptInvoker {
  // Tests inject a custom run by reassigning this field after construction.
  private run: InstallerRun = defaultInstallerRun;

  constructor(private readonly resolver: PythonInterpreterResolver) {}

  async invoke(opts: InvokeOptions): Promise<InvokeResult> {
    const startedAt = Date.now();
    const py: InterpreterResult = await this.resolver.resolve();

    if (!py.ok) {
      return {
        ok: false,
        code: null,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startedAt,
        error: {
          kind: 'spawn-error',
          message: `python unresolved: ${py.reason}${py.detail ? ' — ' + py.detail : ''}`,
        },
      };
    }

    const timeoutMs = opts.timeoutMs ?? 60_000;
    const args = [...py.args, '-m', `qor.scripts.${opts.module}`, ...opts.args];
    const result = await this.run(py.command, args, {
      timeoutMs,
      cwd: opts.cwd,
    });
    const durationMs = Date.now() - startedAt;

    const ok = result.code === 0 && !result.timedOut && !result.spawnError;
    if (ok) {
      return {
        ok: true,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      };
    }

    let errorKind: NonNullable<ModuleResult['error']>['kind'] = 'other';
    let errorMsg = result.stderr.slice(0, 200) || 'unknown';
    if (result.timedOut) {
      errorKind = 'timeout';
      errorMsg = `process timed out after ${timeoutMs}ms`;
    } else if (result.spawnError) {
      errorKind = 'spawn-error';
      errorMsg = result.spawnError;
    } else if (/ModuleNotFoundError|No module named/i.test(result.stderr)) {
      errorKind = 'module-missing';
      errorMsg = `qor.scripts.${opts.module} not installed`;
    }
    return {
      ok: false,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      error: { kind: errorKind, message: errorMsg },
    };
  }
}
