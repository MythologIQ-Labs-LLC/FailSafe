// Build-pipeline test for scripts/package-voice-pack.cjs.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 4.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import * as cp from 'child_process';

const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'package-voice-pack.cjs');

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256OfFile(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function runScript(env: NodeJS.ProcessEnv): cp.SpawnSyncReturns<string> {
  return cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, ...env } });
}

suite('package-voice-pack.cjs', () => {

  test('reads from dist/extension/ui/vendor/{piper,whisper} and writes dist/failsafe-voice-pack-<version>.tar.gz', () => {
    const repoRoot = mkTempDir('failsafe-pack-asm-');
    try {
      const distVendorDir = path.join(repoRoot, 'dist', 'extension', 'ui', 'vendor');
      fs.mkdirSync(path.join(distVendorDir, 'piper'), { recursive: true });
      fs.mkdirSync(path.join(distVendorDir, 'whisper'), { recursive: true });
      fs.writeFileSync(path.join(distVendorDir, 'piper', 'piper.min.js'), 'PIPER-JS', 'utf8');
      fs.writeFileSync(path.join(distVendorDir, 'whisper', 'transformers.min.js'), 'TRANSFORMERS-JS', 'utf8');
      fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ version: '5.2.0' }), 'utf8');

      const r = runScript({ FAILSAFE_REPO_ROOT: repoRoot });
      assert.strictEqual(r.status, 0, `script exit 0; stderr=${r.stderr}`);

      const tarball = path.join(repoRoot, 'dist', 'failsafe-voice-pack-5.2.0.tar.gz');
      assert.ok(fs.existsSync(tarball), 'tarball written');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('manifest.json inside the tarball lists every expected file with correct sha256', () => {
    const repoRoot = mkTempDir('failsafe-pack-asm-manifest-');
    try {
      const distVendorDir = path.join(repoRoot, 'dist', 'extension', 'ui', 'vendor');
      fs.mkdirSync(path.join(distVendorDir, 'piper'), { recursive: true });
      fs.mkdirSync(path.join(distVendorDir, 'whisper'), { recursive: true });
      fs.writeFileSync(path.join(distVendorDir, 'piper', 'a.js'), 'AAA', 'utf8');
      fs.writeFileSync(path.join(distVendorDir, 'whisper', 'b.wasm'), 'BBB', 'utf8');
      fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ version: '5.2.0' }), 'utf8');

      const r = runScript({ FAILSAFE_REPO_ROOT: repoRoot });
      assert.strictEqual(r.status, 0, `script exit 0; stderr=${r.stderr}`);

      const extractDir = mkTempDir('failsafe-pack-asm-extract-');
      try {
        const tarball = path.join(repoRoot, 'dist', 'failsafe-voice-pack-5.2.0.tar.gz');
        // Cygwin tar quirks on Windows: drive-letter paths look like `host:path`
        // SSH remotes. --force-local makes the `-f` arg treat them as local;
        // forward-slash normalization works around the `-C` arg's separate path.
        const ex = cp.spawnSync('tar', [
          '--force-local',
          '-xzf', tarball,
          '-C', extractDir.replace(/\\/g, '/'),
        ], { encoding: 'utf8' });
        assert.strictEqual(ex.status, 0, `tar -xzf exit 0; stderr=${ex.stderr}`);

        const manifestPath = path.join(extractDir, 'voice-pack.manifest.json');
        assert.ok(fs.existsSync(manifestPath), 'manifest in tarball');
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.strictEqual(m.version, '5.2.0');
        assert.deepStrictEqual(m.expectedFiles.sort(), ['piper/a.js', 'whisper/b.wasm']);
        assert.strictEqual(m.sha256['piper/a.js'], sha256OfFile(path.join(distVendorDir, 'piper', 'a.js')));
        assert.strictEqual(m.sha256['whisper/b.wasm'], sha256OfFile(path.join(distVendorDir, 'whisper', 'b.wasm')));
      } finally {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('companion .sha256 file matches the tarball digest', () => {
    const repoRoot = mkTempDir('failsafe-pack-asm-sha-');
    try {
      const distVendorDir = path.join(repoRoot, 'dist', 'extension', 'ui', 'vendor');
      fs.mkdirSync(path.join(distVendorDir, 'piper'), { recursive: true });
      fs.writeFileSync(path.join(distVendorDir, 'piper', 'p.js'), 'P', 'utf8');
      fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ version: '5.2.0' }), 'utf8');

      const r = runScript({ FAILSAFE_REPO_ROOT: repoRoot });
      assert.strictEqual(r.status, 0);

      const tarball = path.join(repoRoot, 'dist', 'failsafe-voice-pack-5.2.0.tar.gz');
      const sha256File = `${tarball}.sha256`;
      assert.ok(fs.existsSync(sha256File), '.sha256 file written');

      const declared = fs.readFileSync(sha256File, 'utf8').trim().split(/\s+/)[0];
      const actual = sha256OfFile(tarball);
      assert.strictEqual(declared, actual);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test('errors clearly when source vendor dir is missing', () => {
    const repoRoot = mkTempDir('failsafe-pack-asm-missing-');
    try {
      fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ version: '5.2.0' }), 'utf8');
      // No dist/extension/ui/vendor/ created.

      const r = runScript({ FAILSAFE_REPO_ROOT: repoRoot });
      assert.notStrictEqual(r.status, 0, 'script must exit non-zero');
      assert.match(r.stderr, /vendor|missing|not found/i, 'descriptive error on stderr');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
