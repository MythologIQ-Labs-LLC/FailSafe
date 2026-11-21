// FailSafe Voice Pack assembler.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 4.
//
// Reads dist/extension/ui/vendor/{piper,whisper}/* (populated by bundle.cjs),
// writes dist/failsafe-voice-pack-<version>.tar.gz + .sha256 + manifest.json.
// Pure Node stdlib + system `tar`; no new npm dependencies.

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');
const { assertVendorAncestry } = require('./vendor-voice.cjs');

const REPO_ROOT = process.env.FAILSAFE_REPO_ROOT || path.resolve(__dirname, '..');
const REQUIRED_ASSETS = Object.freeze([
  'piper/piper.min.js',
  'piper/piper_phonemize.wasm',
  'piper/piper_phonemize.data',
  'whisper/transformers.min.js',
  'whisper/ort-wasm-simd.wasm',
  'whisper/ort-wasm-simd-threaded.wasm',
]);
const MAX_ASSET_BYTES = 75 * 1024 * 1024;

main();

function main() {
  try {
    const version = readVersion();
    const distDir = path.join(REPO_ROOT, 'dist');
    // Reject linked build output before deleting even a stale same-version file.
    assertSafeDistDirectory(distDir);
    fs.mkdirSync(distDir, { recursive: true });
    assertSafeDistDirectory(distDir);

    // Never leave a previous same-version release candidate available if a
    // later packaging attempt fails before producing new verified assets.
    // All failures must leave *neither* a publishable archive nor checksum.
    const tarballPath = path.join(distDir, `failsafe-voice-pack-${version}.tar.gz`);
    const checksumPath = `${tarballPath}.sha256`;
    fs.rmSync(tarballPath, { force: true });
    fs.rmSync(checksumPath, { force: true });

    const stagingDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'failsafe-voice-pack-build-'));
    try {
      const vendorSourceRoot = path.join(REPO_ROOT, 'dist', 'extension', 'ui', 'vendor');
      const collected = collectFiles(vendorSourceRoot, stagingDir);

      writeManifest(stagingDir, version, collected);

      runTarCreate(stagingDir, tarballPath);
      writeSha256(tarballPath);

      console.log(`[package-voice-pack] wrote ${tarballPath}`);
      console.log(`[package-voice-pack] files: ${collected.length}`);
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  } catch (err) {
    // A partial tarball or stale checksum is not a valid release candidate.
    // Cleanup is best-effort, but any failure still exits nonzero.
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
      if (/^\d+\.\d+\.\d+$/.test(String(pkg.version || ''))) {
        const distDir = path.join(REPO_ROOT, 'dist');
        // Cleanup must honor the same boundary as the normal write path.
        if (assertSafeDistDirectory(distDir)) {
          const candidate = path.join(distDir, `failsafe-voice-pack-${pkg.version}.tar.gz`);
          fs.rmSync(candidate, { force: true });
          fs.rmSync(candidate + '.sha256', { force: true });
        }
      }
    } catch (cleanupErr) {
      process.stderr.write('[package-voice-pack] artifact cleanup warning: ' + cleanupErr.message + '\n');
    }
    process.stderr.write(`[package-voice-pack] ERROR: ${err.message || err}\n`);
    process.exit(1);
  }
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    throw new Error('package.json version must be a safe SemVer identifier');
  }
  return pkg.version;
}

/** Build outputs must be a real in-root directory before any unlink/write. */
function assertSafeDistDirectory(distDir) {
  assertVendorAncestry(distDir, fs, REPO_ROOT);
  let st;
  try { st = fs.lstatSync(distDir); }
  catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
  if (!st.isDirectory() || st.isSymbolicLink()) {
    throw new Error('voice pack dist directory must be a real directory');
  }
  return true;
}

function collectFiles(vendorSourceRoot, stagingDir) {
  if (!fs.existsSync(vendorSourceRoot)) {
    throw new Error('vendor source dir not found: ' + vendorSourceRoot);
  }
  const collected = [];
  for (const rel of REQUIRED_ASSETS) {
    // The shared vendor guard rejects symlink/junction ancestry before copying.
    assertVendorAncestry(path.join(vendorSourceRoot, ...rel.split('/')), fs, REPO_ROOT);
    const absSrc = path.join(vendorSourceRoot, ...rel.split('/'));
    let stat;
    try { stat = fs.lstatSync(absSrc); }
    catch { throw new Error('required voice asset missing: ' + rel); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_ASSET_BYTES) {
      throw new Error('required voice asset invalid: ' + rel);
    }
    const absDest = path.join(stagingDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(absDest), { recursive: true });
    fs.copyFileSync(absSrc, absDest, fs.constants.COPYFILE_EXCL);
    // Hash the exact staged bytes that will enter the archive, not a source
    // file that could change after copy.
    collected.push({ rel, abs: absDest });
  }
  return collected;
}

function writeManifest(stagingDir, version, collected) {
  const sha256 = {};
  for (const f of collected) {
    sha256[f.rel] = createHash('sha256').update(fs.readFileSync(f.abs)).digest('hex');
  }
  const manifest = {
    version,
    builtAt: new Date().toISOString(),
    expectedFiles: collected.map((f) => f.rel).sort(),
    sha256,
  };
  fs.writeFileSync(
    path.join(stagingDir, 'voice-pack.manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}

function runTarCreate(stagingDir, tarballPath) {
  const entries = fs.readdirSync(stagingDir);
  // Portability: BSD tar (macOS default) and bsdtar do NOT accept
  // `--force-local`, which previously broke `npm test` on those hosts. The
  // flag was needed because a Windows drive-letter path like
  // `G:\MythologIQ\…\foo.tar.gz` is otherwise interpreted as a `host:path`
  // SSH remote. The portable fix is to never pass a `:`-bearing path to
  // tar at all: cwd into the tarball's directory and pass just the
  // basename for `-czf`. `-C stagingDir` is unaffected (tar resolves it
  // relative to its own cwd, and on every platform a directory path with
  // no `:` is unambiguous).
  const tarballDir = path.dirname(tarballPath);
  const tarballName = path.basename(tarballPath);
  const args = ['-czf', tarballName, '-C', stagingDir, ...entries];
  const result = spawnSync('tar', args, {
    shell: false,
    encoding: 'utf8',
    cwd: tarballDir,
  });
  if (result.status !== 0) {
    throw new Error(`tar -czf failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
}

function writeSha256(tarballPath) {
  const sha = createHash('sha256').update(fs.readFileSync(tarballPath)).digest('hex');
  fs.writeFileSync(`${tarballPath}.sha256`, `${sha}  ${path.basename(tarballPath)}\n`, 'utf8');
}
