import { strict as assert } from 'assert';
import {
  PythonInterpreterResolver,
  type RunCommand,
  type RunResult,
} from '../../qorlogic/PythonInterpreterResolver';
import {
  QorLogicPackageInstaller,
  type InstallerRun,
  type InstallerRunResult,
  type OutputChannelLike,
} from '../../qorlogic/QorLogicPackageInstaller';
import { MIN_QOR_LOGIC_VERSION } from '../../qorlogic/hostLayouts';

const PINNED_SPEC = `qor-logic>=${MIN_QOR_LOGIC_VERSION}`;

function fixedResolver(command: string, args: string[] = []): PythonInterpreterResolver {
  const config = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: 'Python 3.12.0\n', stderr: '', code: 0 });
  const resolver = new PythonInterpreterResolver(config, null, run);
  // Override resolve for tests that need a known interpreter without probing.
  (resolver as unknown as { cached: unknown }).cached = {
    ok: true,
    command,
    args,
    version: '3.12.0',
    source: 'user-setting',
  };
  return resolver;
}

function noPythonResolver(): PythonInterpreterResolver {
  const config = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: '', stderr: 'not found', code: 127 });
  return new PythonInterpreterResolver(config, null, run);
}

interface RecordedCall {
  cmd: string;
  args: string[];
  timeoutMs: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

function makeInstallerRun(
  responder: (call: RecordedCall) => InstallerRunResult,
): { run: InstallerRun; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const run: InstallerRun = async (cmd, args, options) => {
    const call = { cmd, args: [...args], timeoutMs: options.timeoutMs, cwd: options.cwd, env: options.env };
    calls.push(call);
    return responder(call);
  };
  return { run, calls };
}

const sinkChannel: OutputChannelLike = { appendLine: () => undefined };

function ok(stdout = '', stderr = ''): InstallerRunResult {
  return { stdout, stderr, code: 0, timedOut: false };
}
function fail(code: number, stderr = '', stdout = ''): InstallerRunResult {
  return { stdout, stderr, code, timedOut: false };
}

suite('QorLogicPackageInstaller: isInstalled', () => {
  test('returns false when pip show exits non-zero', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => fail(1, 'WARNING: Package(s) not found: qor-logic'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.isInstalled(), false);
  });

  test('returns true when pip show stdout contains Name: qor-logic', async () => {
    const resolver = fixedResolver('python');
    const { run, calls } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.31.1\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.isInstalled(), true);
    assert.deepEqual(calls[0].args, ['-m', 'pip', 'show', 'qor-logic']);
  });

  test('returns false when resolver yields no-python-found', async () => {
    const resolver = noPythonResolver();
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.isInstalled(), false);
    assert.equal(calls.length, 0, 'should not invoke pip when no Python');
  });
});

suite('QorLogicPackageInstaller: install', () => {
  test('invokes <python> -m pip install qor-logic via list-form spawn', async () => {
    const resolver = fixedResolver('/opt/py/python');
    const { run, calls } = makeInstallerRun(() => ok('Successfully installed qor-logic-0.31.1'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const result = await installer.install();

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, '/opt/py/python');
    assert.deepEqual(calls[0].args, ['-m', 'pip', 'install', '--upgrade', PINNED_SPEC]);
    // Verify args are list-form (no shell concatenation): no single arg contains a space joining flags.
    for (const arg of calls[0].args) {
      assert.equal(arg.includes(' '), false, `arg "${arg}" must not contain spaces (list-form check)`);
    }
  });

  test('uses interpreter prefix args (e.g. py -3) in install command', async () => {
    const resolver = fixedResolver('py', ['-3']);
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    await installer.install();

    assert.equal(calls[0].cmd, 'py');
    assert.deepEqual(calls[0].args, ['-3', '-m', 'pip', 'install', '--upgrade', PINNED_SPEC]);
  });

  test('returns ok:false error:timeout when run times out', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => ({ stdout: '', stderr: '', code: null, timedOut: true }));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const result = await installer.install();

    assert.equal(result.ok, false);
    assert.equal(result.error, 'timeout');
  });

  test('returns ok:false error:pip-failed and surfaces stderr when pip exits non-zero', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => fail(1, 'ERROR: Could not find a version'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const result = await installer.install();

    assert.equal(result.ok, false);
    assert.equal(result.error, 'pip-failed');
    assert.match(result.stderr ?? '', /Could not find a version/);
  });

  test('returns ok:false error:spawn-failed when run reports spawnError', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => ({
      stdout: '', stderr: '', code: null, timedOut: false, spawnError: 'ENOENT',
    }));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const result = await installer.install();

    assert.equal(result.ok, false);
    assert.equal(result.error, 'spawn-failed');
  });

  test('short-circuits with no-python-found when resolver fails; does not invoke run', async () => {
    const resolver = noPythonResolver();
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const result = await installer.install();

    assert.equal(result.ok, false);
    assert.equal(result.error, 'no-python-found');
    assert.equal(calls.length, 0);
  });

  test('respects custom timeoutMs constructor argument', async () => {
    const resolver = fixedResolver('python');
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run, 5_000);

    await installer.install();

    assert.equal(calls[0].timeoutMs, 5_000);
  });

  test('logs the exact command to the output channel', async () => {
    const resolver = fixedResolver('/usr/bin/python3.12');
    const { run } = makeInstallerRun(() => ok());
    const lines: string[] = [];
    const channel: OutputChannelLike = { appendLine: (l) => lines.push(l) };
    const installer = new QorLogicPackageInstaller(resolver, channel, run);

    await installer.install();

    assert.ok(lines.some((l) => l.includes(`/usr/bin/python3.12 -m pip install --upgrade ${PINNED_SPEC}`)));
  });

  test('pins minimum version (>=MIN_QOR_LOGIC_VERSION) and uses --upgrade in argv', async () => {
    const resolver = fixedResolver('python');
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    await installer.install();

    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].args.includes(PINNED_SPEC),
      `captured argv must contain ${PINNED_SPEC}; got ${JSON.stringify(calls[0].args)}`,
    );
    assert.ok(calls[0].args.includes('--upgrade'), 'captured argv must include --upgrade');
  });
});

suite('QorLogicPackageInstaller: version', () => {
  test('parses Version: from pip show output', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.31.1\nLocation: ...\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.version(), '0.31.1');
  });

  test('returns null when pip show fails', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => fail(1));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.version(), null);
  });

  test('returns null when no Python is resolved', async () => {
    const resolver = noPythonResolver();
    const { run } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.version(), null);
  });
});

suite('QorLogicPackageInstaller: verifyInstalledVersion', () => {
  test('returns meetsFloor:true when installed version is above floor', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.46.0\nLocation: ...\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: '0.46.0', minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: true });
  });

  test('returns meetsFloor:false when installed version is below floor', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.20.0\nLocation: ...\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: '0.20.0', minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false });
  });

  test('returns installed:null meetsFloor:false when pip show exits non-zero', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => fail(1, 'WARNING: Package(s) not found: qor-logic'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: null, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false });
  });

  test('returns installed:null meetsFloor:false when run throws', async () => {
    const resolver = fixedResolver('python');
    const run: InstallerRun = async () => { throw new Error('spawn boom'); };
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: null, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false });
  });

  test('returns installed:null meetsFloor:false when no Python is resolved', async () => {
    const resolver = noPythonResolver();
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: null, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false });
    assert.equal(calls.length, 0);
  });

  test('runs pip show via list-form argv (no shell)', async () => {
    const resolver = fixedResolver('python');
    const { run, calls } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.31.1\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    await installer.verifyInstalledVersion();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ['-m', 'pip', 'show', 'qor-logic']);
  });
});
