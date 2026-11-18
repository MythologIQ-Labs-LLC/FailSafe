// #710 — native extension unit tests for recoverable voice-pack installation.
// These tests exercise actual disk rename/copy operations in disposable directories.
// No downloaded archive or voice content is executed.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicSwapVoicePack, VoiceSwapOps } from '../../voice-pack/transactional-swap';

function fixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-710-swap-'));
  try { run(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function dirs(root: string) {
  const stage = path.join(root, 'stage');
  const final = path.join(root, 'storage', 'voice-pack');
  fs.mkdirSync(path.join(stage, 'piper'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'piper', 'piper.min.js'), 'new');
  const tarball = path.join(stage, 'failsafe-voice-pack-6.0.13.tar.gz');
  fs.writeFileSync(tarball, 'fixture tar');
  fs.mkdirSync(path.dirname(final), { recursive: true });
  return { stage, final, tarball };
}
function old(final: string) {
  fs.mkdirSync(final, { recursive: true });
  fs.writeFileSync(path.join(final, 'old.txt'), 'previous');
}
function opsWithRename(fails: (from: string, to: string) => boolean): VoiceSwapOps {
  return {
    ...fs,
    renameSync(from: fs.PathLike, to: fs.PathLike) {
      if (fails(String(from), String(to))) throw Object.assign(new Error('injected rename failure'), { code: 'EIO' });
      fs.renameSync(from, to);
    },
  };
}

suite('voice-pack transactional replacement #710', () => {
  test('first installation promotes prepared pack and omits downloaded tarball', () => fixture(root => {
    const d = dirs(root);
    const result = atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'a' });
    assert.equal(fs.readFileSync(path.join(d.final, 'piper', 'piper.min.js'), 'utf8'), 'new');
    assert.equal(fs.existsSync(d.tarball), false);
    assert.equal(result.staleBackup, undefined);
  }));

  test('upgrade replaces active pack and removes successful backup', () => fixture(root => {
    const d = dirs(root); old(d.final);
    atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'b' });
    assert.equal(fs.existsSync(path.join(d.final, 'old.txt')), false);
    assert.equal(fs.existsSync(d.final + '.old-b'), false);
  }));

  test('failure of new promotion restores previous active installation', () => fixture(root => {
    const d = dirs(root); old(d.final);
    const ops = opsWithRename((from, to) => from.endsWith('.new-c') && to === d.final);
    assert.throws(() => atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'c', ops }), /injected rename failure/);
    assert.equal(fs.readFileSync(path.join(d.final, 'old.txt'), 'utf8'), 'previous');
    assert.equal(fs.existsSync(d.final + '.old-c'), false);
    assert.equal(fs.existsSync(d.final + '.new-c'), false);
  }));

  test('failed initial install leaves destination absent', () => fixture(root => {
    const d = dirs(root);
    const ops = opsWithRename(from => from.endsWith('.new-d'));
    assert.throws(() => atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'd', ops }), /injected rename/);
    assert.equal(fs.existsSync(d.final), false);
  }));

  test('double rename failure retains recovery backup and both errors', () => fixture(root => {
    const d = dirs(root); old(d.final);
    const ops = opsWithRename(from => from.endsWith('.new-e') || from.endsWith('.old-e'));
    assert.throws(
      () => atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'e', ops }),
      (error: unknown) => error instanceof AggregateError && error.errors.length === 2
        && error.message.includes('.old-e'),
    );
    assert.equal(fs.readFileSync(path.join(d.final + '.old-e', 'old.txt'), 'utf8'), 'previous');
  }));

  test('pre-existing backup path collision refuses replacement', () => fixture(root => {
    const d = dirs(root); old(d.final);
    fs.mkdirSync(d.final + '.old-f');
    assert.throws(() => atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'f' }), /collision/);
    assert.equal(fs.readFileSync(path.join(d.final, 'old.txt'), 'utf8'), 'previous');
  }));

  test('staged symlink does not overwrite active pack', function () {
    if (process.platform === 'win32') this.skip(); // Creating symlinks can require extra Windows privilege.
    fixture(root => {
      const d = dirs(root); old(d.final);
      fs.symlinkSync(path.join(root, 'outside'), path.join(d.stage, 'bad-link'));
      assert.throws(() => atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'g' }), /symlink/);
      assert.equal(fs.readFileSync(path.join(d.final, 'old.txt'), 'utf8'), 'previous');
    });
  });

  test('backup cleanup failure is warning, not a false failed installation', () => fixture(root => {
    const d = dirs(root); old(d.final);
    const ops: VoiceSwapOps = {
      ...fs,
      rmSync(target: fs.PathLike, options?: fs.RmOptions) {
        if (String(target).endsWith('.old-h')) throw new Error('injected backup cleanup failure');
        fs.rmSync(target, options);
      },
    };
    const result = atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'h', ops });
    assert.equal(result.staleBackup, d.final + '.old-h');
    assert.equal(result.cleanupWarnings.length, 1);
    assert.equal(fs.readFileSync(path.join(d.final, 'piper', 'piper.min.js'), 'utf8'), 'new');
  }));

  test('staging cleanup failure is warning after successful promotion', () => fixture(root => {
    const d = dirs(root);
    const ops: VoiceSwapOps = {
      ...fs,
      rmSync(target: fs.PathLike, options?: fs.RmOptions) {
        if (String(target) === d.stage) throw new Error('injected staging cleanup failure');
        fs.rmSync(target, options);
      },
    };
    const result = atomicSwapVoicePack(d.stage, d.final, d.tarball, { token: 'i', ops });
    assert.equal(result.cleanupWarnings.length, 1);
    assert.equal(fs.existsSync(d.final), true);
  }));

  test('rejects aliasing a destination inside staging', () => fixture(root => {
    const d = dirs(root);
    assert.throws(() => atomicSwapVoicePack(d.stage, path.join(d.stage, 'nested'), d.tarball, { token: 'j' }), /disjoint/);
  }));
});
