import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
import { MIN_QOR_LOGIC_VERSION, TESTED_AGAINST_QOR_LOGIC_VERSION, FROZEN_QOR_LOGIC_VERSION } from '../../qorlogic/hostLayouts';
import { FROZEN_QOR_WHEEL_NAME, FROZEN_QOR_WHEEL_SHA256, withVerifiedQorWheel } from '../../qorlogic/frozenWheel';


function fixedResolver(command: string, args: string[] = []): PythonInterpreterResolver {
  const config = { get: () => undefined, inspect: () => undefined };
  const run: RunCommand = async () => ({ stdout: 'Python 3.12.0\n', stderr: '', code: 0 });
  const resolver = new PythonInterpreterResolver(config, null, run, (c) => c);
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
  const config = { get: () => undefined, inspect: () => undefined };
  const run: RunCommand = async () => ({ stdout: '', stderr: 'not found', code: 127 });
  return new PythonInterpreterResolver(config, null, run, (c) => c);
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
    assert.deepEqual(calls[0].args, ['-P', '-m', 'pip', 'show', 'qor-logic']);
  });

  test('returns false when resolver yields no-python-found', async () => {
    const resolver = noPythonResolver();
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    assert.equal(await installer.isInstalled(), false);
    assert.equal(calls.length, 0, 'should not invoke pip when no Python');
  });
});

suite('QorLogicPackageInstaller: verified offline install', () => {
  test('implicit install refuses before resolving Python or making subprocesses', async () => {
    const resolver = noPythonResolver();
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);
    assert.deepEqual(await installer.install(), { ok: false, command: '', error: 'verified-wheel-required' });
    assert.equal(calls.length, 0);
  });

  test('existing future/older version refuses replacement, with no pip install', async () => {
    for (const version of ['0.177.0', '0.169.0', '0.31.1']) {
      const { run, calls } = makeInstallerRun(() => ok(`Name: qor-logic\\nVersion: ${version}\\n`));
      const result = await new QorLogicPackageInstaller(fixedResolver('python'), sinkChannel, run)
        .install('/tmp/' + FROZEN_QOR_WHEEL_NAME);
      assert.equal(result.ok, false);
      assert.equal(result.error, 'version-divergence');
      assert.equal(result.version, version);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].args, ['-P', '-m', 'pip', 'show', 'qor-logic']);
    }
  });

  test('already-installed frozen exact version causes no mutation', async () => {
    const { run, calls } = makeInstallerRun(() => ok(`Name: qor-logic\\nVersion: ${FROZEN_QOR_LOGIC_VERSION}\\n`));
    const result = await new QorLogicPackageInstaller(fixedResolver('python'), sinkChannel, run)
      .install('/tmp/' + FROZEN_QOR_WHEEL_NAME);
    assert.equal(result.ok, true);
    assert.equal(result.version, FROZEN_QOR_LOGIC_VERSION);
    assert.equal(calls.length, 1, 'read-only pip show only');
  });

  test('missing and ambiguous pip metadata do not trigger an install', async () => {
    for (const result of [fail(2, 'failed'), ok('Version: 0.176.1\\n'), fail(1, 'failed')]) {
      const { run, calls } = makeInstallerRun(() => result);
      const out = await new QorLogicPackageInstaller(fixedResolver('python'), sinkChannel, run)
        .install('/tmp/' + FROZEN_QOR_WHEEL_NAME);
      assert.equal(out.error, 'package-state-unknown');
      assert.equal(calls.length, 1);
    }
  });

  test('absent package plus invalid path or wrong bytes refuses before pip install', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qorwheel-test-'));
    try {
      const fake = path.join(dir, FROZEN_QOR_WHEEL_NAME);
      fs.writeFileSync(fake, Buffer.from('untrusted wheel'));
      for (const file of [fake, path.join(dir, 'not-the-wheel.whl')]) {
        const { run, calls } = makeInstallerRun(() => fail(1, 'WARNING: Package(s) not found: qor-logic'));
        const out = await new QorLogicPackageInstaller(fixedResolver('python'), sinkChannel, run).install(file);
        assert.equal(out.error, file === fake ? 'unverified-wheel' : 'invalid-wheel-path');
        assert.equal(calls.length, 1, 'pip show only, no pip install');
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('wheel verifier independently rejects fake content and cleans staged files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qorwheel-test-'));
    try {
      const file = path.join(dir, FROZEN_QOR_WHEEL_NAME);
      fs.writeFileSync(file, 'fake wheel');
      assert.match(FROZEN_QOR_WHEEL_SHA256, /^[a-f0-9]{64}$/);
      let consumed = false;
      await assert.rejects(withVerifiedQorWheel(file, async () => { consumed = true; }), /unverified-wheel/);
      assert.equal(consumed, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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

    assert.deepEqual(status, { installed: '0.46.0', minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: true, testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION, matchesTested: false });
  });

  test('returns meetsFloor:false when installed version is below floor', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.20.0\nLocation: ...\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: '0.20.0', minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false, testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION, matchesTested: false });
  });


  // FX944 (#233 Scope A) — the tested-against boundary.
  //
  // `matchesTested` is the ONE assertion standing between a real comparison and
  // a hardcoded true. Scope A ships this field instead of a `maximum` because a
  // ceiling has to be guessed before the breakage is known, while this records
  // a result: the version the FX942 probe last passed on.
  test('FX944 - reports testedAgainst, with matchesTested tracking the comparison', async () => {
    const differing = await new QorLogicPackageInstaller(
      fixedResolver('python'),
      sinkChannel,
      makeInstallerRun(() => ok(['Name: qor-logic', 'Version: 0.1.0-not-the-tested-one', ''].join('\n'))).run,
    ).verifyInstalledVersion();
    assert.equal(differing.testedAgainst, TESTED_AGAINST_QOR_LOGIC_VERSION);
    assert.equal(differing.matchesTested, false,
      'a version that is not the tested-against one must not report a match');

    const equal = await new QorLogicPackageInstaller(
      fixedResolver('python'),
      sinkChannel,
      makeInstallerRun(() => ok(`Name: qor-logic
Version: ${TESTED_AGAINST_QOR_LOGIC_VERSION}
`)).run,
    ).verifyInstalledVersion();
    assert.equal(equal.matchesTested, true,
      'the exact tested-against version must report a match');

    // Guards the hardcode: the two cases must disagree. If matchesTested were a
    // constant, this fails regardless of which constant was chosen.
    assert.notEqual(differing.matchesTested, equal.matchesTested);
  });

  test('FX944 - an unresolvable version is untested, not silently matched', async () => {
    const status = await new QorLogicPackageInstaller(
      fixedResolver('python'), sinkChannel, makeInstallerRun(() => fail(1, 'not found')).run,
    ).verifyInstalledVersion();
    assert.equal(status.matchesTested, false,
      'nothing was verified, so nothing may be reported as tested');
    assert.equal(status.testedAgainst, TESTED_AGAINST_QOR_LOGIC_VERSION);
  });

  test('returns installed:null meetsFloor:false when pip show exits non-zero', async () => {
    const resolver = fixedResolver('python');
    const { run } = makeInstallerRun(() => fail(1, 'WARNING: Package(s) not found: qor-logic'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: null, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false, testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION, matchesTested: false });
  });

  test('returns installed:null meetsFloor:false when run throws', async () => {
    const resolver = fixedResolver('python');
    const run: InstallerRun = async () => { throw new Error('spawn boom'); };
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: null, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false, testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION, matchesTested: false });
  });

  test('returns installed:null meetsFloor:false when no Python is resolved', async () => {
    const resolver = noPythonResolver();
    const { run, calls } = makeInstallerRun(() => ok());
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    const status = await installer.verifyInstalledVersion();

    assert.deepEqual(status, { installed: null, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: false, testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION, matchesTested: false });
    assert.equal(calls.length, 0);
  });

  test('runs pip show via list-form argv (no shell)', async () => {
    const resolver = fixedResolver('python');
    const { run, calls } = makeInstallerRun(() => ok('Name: qor-logic\nVersion: 0.31.1\n'));
    const installer = new QorLogicPackageInstaller(resolver, sinkChannel, run);

    await installer.verifyInstalledVersion();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ['-P', '-m', 'pip', 'show', 'qor-logic']);
  });
});
