import { strict as assert } from 'assert';
import type { ResolvedInterpreter } from '../../qorlogic/PythonInterpreterResolver';
import type { InstallerRun, InstallerRunResult } from '../../qorlogic/QorLogicPackageInstaller';
import { preflightFrozenDependencies, checkInstalledDependencies } from '../../qorlogic/qorDependencyPreflight';

const py: ResolvedInterpreter = {
  ok: true, command: 'python', args: ['-3'], version: '3.13.5', source: 'probe',
};
const result = (code: number | null, other: Partial<InstallerRunResult> = {}): InstallerRunResult =>
  ({ stdout: '', stderr: '', code, timedOut: false, ...other });

suite('#463: frozen wheel offline dependency preflight', () => {
  test('only dry-runs offline with dependency resolution; never uses --no-deps', async () => {
    let calls = 0;
    const run: InstallerRun = async (cmd, args, opts) => {
      calls++;
      assert.equal(cmd, 'python');
      assert.deepEqual([...args], [
        '-3', '-P', '-m', 'pip', '--isolated', 'install',
        '--dry-run', '--no-index', '--no-cache-dir', '--only-binary', ':all:',
        '/tmp/verified/qor_logic-0.176.1-py3-none-any.whl',
      ]);
      assert.ok(!args.includes('--no-deps'), 'dependencies must be resolved in preflight');
      assert.equal(opts.timeoutMs, 91_000);
      return result(0);
    };
    assert.deepEqual(await preflightFrozenDependencies(
      py, '/tmp/verified/qor_logic-0.176.1-py3-none-any.whl', run, 91_000,
    ), { ok: true });
    assert.equal(calls, 1);
  });

  test('missing dependency blocks before any actual install', async () => {
    const run: InstallerRun = async () => result(1, { stderr: 'dependency unavailable' });
    assert.deepEqual(await preflightFrozenDependencies(py, '/tmp/wheel.whl', run, 9_000),
      { ok: false, error: 'dependency-preflight-failed', details: 'dependency unavailable' });
  });

  test('timeouts, spawn errors and null exit codes cannot pass', async () => {
    for (const failed of [
      result(null, { timedOut: true }),
      result(null, { spawnError: 'ENOENT' }),
      result(null),
    ]) {
      const run: InstallerRun = async () => failed;
      assert.deepEqual(await preflightFrozenDependencies(py, '/tmp/wheel.whl', run, 1),
        { ok: false, error: 'dependency-preflight-unknown' });
    }
  });

  test('thrown process failure cannot be accepted as success', async () => {
    const run: InstallerRun = async () => { throw new Error('broken subprocess'); };
    assert.deepEqual(await preflightFrozenDependencies(py, '/tmp/wheel.whl', run, 1),
      { ok: false, error: 'dependency-preflight-unknown' });
  });

  test('refused dependency diagnostics are capped to avoid unbounded UI/log data', async () => {
    const run: InstallerRun = async () => result(2, { stderr: 'x'.repeat(1900) });
    const out = await preflightFrozenDependencies(py, '/tmp/wheel.whl', run, 1);
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.error, 'dependency-preflight-failed');
      assert.equal(out.details?.length, 1000);
    }
  });
});


suite('#463: existing frozen wheel dependency health', () => {
  test('read-only pip check success enables readiness', async () => {
    let calls = 0;
    const run: InstallerRun = async (cmd, args) => {
      calls++;
      assert.equal(cmd, 'python');
      assert.deepEqual([...args], ['-3', '-P', '-m', 'pip', '--isolated', 'check']);
      return result(0, { stdout: 'No broken requirements found.' });
    };
    assert.deepEqual(await checkInstalledDependencies(py, run, 30_000), { ok: true });
    assert.equal(calls, 1);
  });

  test('missing jsonschema or PyYAML never counts as a ready frozen wheel', async () => {
    const run: InstallerRun = async () => result(1, {
      stdout: 'qor-logic 0.176.1 requires jsonschema, which is not installed.',
    });
    assert.deepEqual(await checkInstalledDependencies(py, run, 30_000), {
      ok: false, error: 'dependencies-unsatisfied',
      details: 'qor-logic 0.176.1 requires jsonschema, which is not installed.',
    });
  });

  test('unknown pip check state fails closed on timeout and spawn errors', async () => {
    for (const failure of [
      result(null, { timedOut: true }),
      result(null, { spawnError: 'ENOENT' }),
      result(null),
    ]) {
      const run: InstallerRun = async () => failure;
      assert.deepEqual(await checkInstalledDependencies(py, run, 200),
        { ok: false, error: 'dependency-check-unavailable' });
    }
  });

  test('subprocess throws and large diagnostics fail closed', async () => {
    const throwing: InstallerRun = async () => { throw new Error('unavailable'); };
    assert.deepEqual(await checkInstalledDependencies(py, throwing, 200),
      { ok: false, error: 'dependency-check-unavailable' });
    const noisy: InstallerRun = async () => result(1, { stderr: 'x'.repeat(2000) });
    const status = await checkInstalledDependencies(py, noisy, 200);
    assert.equal(status.ok, false);
    if (!status.ok) assert.equal(status.details?.length, 1000);
  });
});
