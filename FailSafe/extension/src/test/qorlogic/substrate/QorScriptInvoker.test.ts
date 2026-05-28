import { strict as assert } from 'assert';
import { QorScriptInvoker } from '../../../qorlogic/substrate/QorScriptInvoker';
import {
  PythonInterpreterResolver,
  type RunCommand,
} from '../../../qorlogic/PythonInterpreterResolver';
import type {
  InstallerRun,
  InstallerRunResult,
} from '../../../qorlogic/QorLogicPackageInstaller';

/**
 * FX710 — QorScriptInvoker
 * 6 cases: happy path / missing module / timeout / spawn error / non-zero exit /
 * stdout+stderr capture.
 *
 * Per v2-NEW1: derive `ok` from `code === 0 && !timedOut && !spawnError`;
 * never read a fabricated `.ok` field on InstallerRunResult.
 *
 * Per v2-D4/D5: resolver constructor is required; narrow on `py.ok` before
 * accessing .command/.args; forward `py.args` into the spawn arg list.
 */

function resolvedResolver(command: string, args: string[] = []): PythonInterpreterResolver {
  const cfg = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: 'Python 3.12.0\n', stderr: '', code: 0 });
  const resolver = new PythonInterpreterResolver(cfg, null, run);
  (resolver as unknown as { cached: unknown }).cached = {
    ok: true, command, args, version: '3.12.0', source: 'user-setting',
  };
  return resolver;
}

function unresolvedResolver(): PythonInterpreterResolver {
  const cfg = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: '', stderr: 'not found', code: 127 });
  const resolver = new PythonInterpreterResolver(cfg, null, run);
  (resolver as unknown as { cached: unknown }).cached = {
    ok: false, reason: 'no-python-found', detail: 'no candidate matched',
  };
  return resolver;
}

interface Recorded { cmd: string; args: string[]; timeoutMs: number; cwd?: string }

function recorder(result: InstallerRunResult): { run: InstallerRun; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const run: InstallerRun = async (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], timeoutMs: opts.timeoutMs, cwd: opts.cwd });
    return result;
  };
  return { run, calls };
}

// Inject a custom InstallerRun into the invoker by patching the imported binding.
// QorScriptInvoker uses defaultInstallerRun internally; for tests we re-export
// a runtime-swappable form via __setInstallerRun (test seam).
function makeInvoker(resolver: PythonInterpreterResolver, run: InstallerRun): QorScriptInvoker {
  const inv = new QorScriptInvoker(resolver);
  (inv as unknown as { run: InstallerRun }).run = run;
  return inv;
}

suite('QorScriptInvoker (FX710)', () => {
  test('happy path: ok=true, code=0, captures stdout/stderr, forwards py.args and module ref', async () => {
    const { run, calls } = recorder({ stdout: 'OK', stderr: '', code: 0, timedOut: false });
    const inv = makeInvoker(resolvedResolver('py', ['-3']), run);
    const result = await inv.invoke({ module: 'secret_scanner', args: ['--staged', '--out', '/tmp/x.json'], cwd: '/ws' });
    assert.equal(result.ok, true);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'OK');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, 'py');
    assert.deepEqual(calls[0].args, ['-3', '-m', 'qor.scripts.secret_scanner', '--staged', '--out', '/tmp/x.json']);
    assert.equal(calls[0].cwd, '/ws');
  });

  test('missing module: stderr "No module named" → ok=false, error.kind=module-missing', async () => {
    const { run } = recorder({ stdout: '', stderr: 'ModuleNotFoundError: No module named qor.scripts.x', code: 1, timedOut: false });
    const inv = makeInvoker(resolvedResolver('python3'), run);
    const result = await inv.invoke({ module: 'x', args: [] });
    assert.equal(result.ok, false);
    assert.equal(result.error?.kind, 'module-missing');
  });

  test('timeout: timedOut=true → ok=false, error.kind=timeout', async () => {
    const { run } = recorder({ stdout: '', stderr: '', code: null, timedOut: true });
    const inv = makeInvoker(resolvedResolver('python3'), run);
    const result = await inv.invoke({ module: 'secret_scanner', args: [], timeoutMs: 500 });
    assert.equal(result.ok, false);
    assert.equal(result.error?.kind, 'timeout');
    assert.match(result.error!.message, /timed out after 500ms/);
  });

  test('spawn error from resolver (py.ok=false): ok=false, error.kind=spawn-error', async () => {
    const { run } = recorder({ stdout: '', stderr: '', code: 0, timedOut: false });
    const inv = makeInvoker(unresolvedResolver(), run);
    const result = await inv.invoke({ module: 'secret_scanner', args: [] });
    assert.equal(result.ok, false);
    assert.equal(result.error?.kind, 'spawn-error');
    assert.match(result.error!.message, /python unresolved/);
  });

  test('non-zero exit (no module-missing signal): ok=false, error.kind=other', async () => {
    const { run } = recorder({ stdout: '', stderr: 'generic failure', code: 2, timedOut: false });
    const inv = makeInvoker(resolvedResolver('python3'), run);
    const result = await inv.invoke({ module: 'secret_scanner', args: [] });
    assert.equal(result.ok, false);
    assert.equal(result.error?.kind, 'other');
    assert.equal(result.code, 2);
  });

  test('stdout+stderr both captured even on failure', async () => {
    const { run } = recorder({ stdout: 'partial-out', stderr: 'partial-err', code: 3, timedOut: false });
    const inv = makeInvoker(resolvedResolver('python3'), run);
    const result = await inv.invoke({ module: 'm', args: [] });
    assert.equal(result.stdout, 'partial-out');
    assert.equal(result.stderr, 'partial-err');
    assert.equal(result.ok, false);
  });
});
