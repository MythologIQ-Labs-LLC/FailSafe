// #707/#710: fail-closed Voice Pack producer tests (six-asset contract).
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import * as cp from 'child_process';

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'package-voice-pack.cjs');
const REQUIRED = [
  'piper/piper.min.js',
  'piper/piper_phonemize.wasm',
  'piper/piper_phonemize.data',
  'whisper/transformers.min.js',
  'whisper/ort-wasm-simd.wasm',
  'whisper/ort-wasm-simd-threaded.wasm',
];
function fixture(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-producer-'));
  try { run(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function seed(root: string) {
  const source = path.join(root, 'dist', 'extension', 'ui', 'vendor');
  for (const rel of REQUIRED) {
    const file = path.join(source, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture:' + rel);
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '6.0.13' }));
  return source;
}
function execute(root: string) {
  return cp.spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8', env: { ...process.env, FAILSAFE_REPO_ROOT: root },
  });
}
function digest(file: string) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
suite('package-voice-pack.cjs exact asset inventory #707', () => {
  test('positive producer creates archive and sha256 with exactly six required assets', () => fixture(root => {
    const source = seed(root);
    fs.writeFileSync(path.join(source, 'piper', 'VENDOR.md'), 'metadata not executable');
    const result = execute(root);
    assert.equal(result.status, 0, result.stderr);
    const tarball = path.join(root, 'dist', 'failsafe-voice-pack-6.0.13.tar.gz');
    assert.ok(fs.existsSync(tarball));
    const checksum = fs.readFileSync(tarball + '.sha256', 'utf8').trim().split(/\s+/)[0];
    assert.equal(checksum, digest(tarball));

    const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-verify-'));
    try {
      const unpack = cp.spawnSync('tar', ['-xzf', path.basename(tarball), '-C', extract], {
        cwd: path.dirname(tarball), encoding: 'utf8',
      });
      assert.equal(unpack.status, 0, unpack.stderr);
      const manifest = JSON.parse(fs.readFileSync(path.join(extract, 'voice-pack.manifest.json'), 'utf8'));
      assert.equal(manifest.version, '6.0.13');
      assert.deepEqual([...manifest.expectedFiles].sort(), [...REQUIRED].sort());
      assert.equal(fs.existsSync(path.join(extract, 'piper', 'VENDOR.md')), false);
      for (const rel of REQUIRED) {
        assert.equal(manifest.sha256[rel], digest(path.join(source, ...rel.split('/'))));
        assert.equal(digest(path.join(extract, ...rel.split('/'))), manifest.sha256[rel]);
      }
    } finally {
      fs.rmSync(extract, { recursive: true, force: true });
    }
  }));

  test('symlinked Whisper directory cannot import external files into voice pack', function () {
    if (process.platform === 'win32') this.skip(); // Symlink privilege varies by Windows host.
    fixture(root => {
      const source = seed(root);
      const outside = path.join(root, 'outside-whisper');
      fs.renameSync(path.join(source, 'whisper'), outside);
      fs.symlinkSync(outside, path.join(source, 'whisper'), 'dir');
      const result = execute(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /voice vendor ancestor must be a real directory/);
      assert.equal(fs.existsSync(path.join(root, 'dist', 'failsafe-voice-pack-6.0.13.tar.gz')), false);
      assert.deepEqual(fs.readdirSync(outside).sort(), [
        'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd.wasm', 'transformers.min.js',
      ].sort());
    });
  });

  test('symlinked parent UI directory is refused before packaging', function () {
    if (process.platform === 'win32') this.skip(); // Symlink privilege varies by Windows host.
    fixture(root => {
      seed(root);
      const ui = path.join(root, 'dist', 'extension', 'ui');
      const outside = path.join(root, 'outside-ui');
      fs.renameSync(ui, outside);
      fs.symlinkSync(outside, ui, 'dir');
      const result = execute(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /voice vendor ancestor must be a real directory/);
      assert.equal(fs.existsSync(path.join(root, 'dist', 'failsafe-voice-pack-6.0.13.tar.gz')), false);
      assert.ok(fs.existsSync(path.join(outside, 'vendor', 'piper', 'piper.min.js')));
    });
  });

  test('linked dist cannot delete a foreign archive or checksum before asset validation', function () {
    if (process.platform === 'win32') this.skip(); // Windows symlink privilege varies.
    fixture(root => {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '6.0.13' }));
      const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-foreign-'));
      try {
        const archive = path.join(foreign, 'failsafe-voice-pack-6.0.13.tar.gz');
        const checksum = archive + '.sha256';
        fs.writeFileSync(archive, 'FOREIGN_ARCHIVE');
        fs.writeFileSync(checksum, 'FOREIGN_CHECKSUM');
        fs.symlinkSync(foreign, path.join(root, 'dist'), 'dir');
        const result = execute(root);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /voice pack dist directory must be a real directory/);
        assert.equal(fs.readFileSync(archive, 'utf8'), 'FOREIGN_ARCHIVE');
        assert.equal(fs.readFileSync(checksum, 'utf8'), 'FOREIGN_CHECKSUM');
      } finally { fs.rmSync(foreign, { recursive: true, force: true }); }
    });
  });

  test('dangling dist symlink is an occupied path and never replaced', function () {
    if (process.platform === 'win32') this.skip(); // Windows symlink privilege varies.
    fixture(root => {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '6.0.13' }));
      const dist = path.join(root, 'dist');
      fs.symlinkSync(path.join(root, 'not-present'), dist, 'dir');
      const result = execute(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /voice pack dist directory must be a real directory/);
      assert.equal(fs.lstatSync(dist).isSymbolicLink(), true);
    });
  });

  test('invalid version is refused before any archive cleanup or directory creation', () => fixture(root => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '../../../../other' }));
    const result = execute(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /version must be a safe SemVer identifier/);
    assert.equal(fs.existsSync(path.join(root, 'dist')), false);
  }));

  test('missing Piper asset causes a nonzero result and no successful tarball', () => fixture(root => {
    const source = seed(root);
    fs.rmSync(path.join(source, 'piper', 'piper.min.js'));
    const result = execute(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required voice asset missing/);
    assert.equal(fs.existsSync(path.join(root, 'dist', 'failsafe-voice-pack-6.0.13.tar.gz')), false);
  }));

  test('missing Whisper asset fails before packaging', () => fixture(root => {
    const source = seed(root);
    fs.rmSync(path.join(source, 'whisper', 'transformers.min.js'));
    const result = execute(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required voice asset missing/);
  }));

  test('zero-byte required asset is refused', () => fixture(root => {
    const source = seed(root);
    fs.writeFileSync(path.join(source, 'piper', 'piper_phonemize.wasm'), '');
    const result = execute(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required voice asset invalid/);
  }));

  test('failed repack removes stale previously valid artifacts for the same version', () => fixture(root => {
    const source = seed(root);
    const first = execute(root);
    assert.equal(first.status, 0, first.stderr);
    const tarball = path.join(root, 'dist', 'failsafe-voice-pack-6.0.13.tar.gz');
    assert.equal(fs.existsSync(tarball), true);
    assert.equal(fs.existsSync(tarball + '.sha256'), true);

    // An operator must never mistake yesterday's archive for a successful
    // repack when a required input has gone missing.
    fs.rmSync(path.join(source, 'whisper', 'transformers.min.js'));
    const second = execute(root);
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /required voice asset missing/);
    assert.equal(fs.existsSync(tarball), false, 'stale archive must not be publishable');
    assert.equal(fs.existsSync(tarball + '.sha256'), false, 'stale checksum must not be publishable');
  }));

  test('absent vendor root is an explicit failure', () => fixture(root => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '6.0.13' }));
    const result = execute(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /vendor source dir not found/);
  }));

  // #707 V3: the normal path already deletes stale files before packaging, so
  // only a failure after tar writes a partial archive reaches failure cleanup.
  test('a tar failure after writing a partial prerelease archive leaves no archive or checksum', () => fixture(root => {
    seed(root);
    const producer = require(SCRIPT);
    for (const version of ['6.1.0-rc.1', '6.1.0']) {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
      const tarball = path.join(root, 'dist', `failsafe-voice-pack-${version}.tar.gz`);
      let calls = 0;
      let existedOnReturn = false;
      const run = (_command: string, args: string[], opts: { cwd: string }) => {
        calls++;
        fs.writeFileSync(path.join(opts.cwd, args[1]), 'partial archive');
        existedOnReturn = fs.existsSync(tarball);
        return { status: 1, stderr: 'simulated tar failure' };
      };
      assert.throws(() => producer.packageVoicePack(root, run), /tar -czf failed \(exit 1\): simulated tar failure/);
      assert.equal(calls, 1, version + ': tar ran once');
      assert.equal(existedOnReturn, true, version + ': the partial archive existed when tar returned');
      assert.equal(fs.existsSync(tarball), false, version + ': partial archive removed');
      assert.equal(fs.existsSync(tarball + '.sha256'), false, version + ': no checksum');
    }
  }));
});
