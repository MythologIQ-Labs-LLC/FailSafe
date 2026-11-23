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

const REQUIRED_ASSETS = Object.freeze([
  'piper/piper.min.js',
  'piper/piper_phonemize.wasm',
  'piper/piper_phonemize.data',
  'whisper/transformers.min.js',
  'whisper/ort-wasm-simd.wasm',
  'whisper/ort-wasm-simd-threaded.wasm',
]);
const MAX_ASSET_BYTES = 75 * 1024 * 1024;

function main() {
  const repoRoot = process.env.FAILSAFE_REPO_ROOT || path.resolve(__dirname, '..');
  try {
    packageVoicePack(repoRoot);
  } catch (err) {
    process.stderr.write(`[package-voice-pack] ERROR: ${err.message || err}\n`);
    process.exit(1);
  }
}

/**
 * Build the Voice Pack under repoRoot/dist. `repoRoot` is the single trusted
 * root for the version, the dist directory and the vendor sources. Any failure
 * removes this version's archive and checksum before rethrowing.
 */
function packageVoicePack(repoRoot, run = spawnSync) {
  try {
    const version = readVersion(repoRoot);
    const distDir = path.join(repoRoot, 'dist');
    // Reject linked build output before deleting even a stale same-version file.
    assertSafeDistDirectory(repoRoot, distDir);
    fs.mkdirSync(distDir, { recursive: true });

    // Never leave a previous same-version release candidate available if a
    // later packaging attempt fails before producing new verified assets.
    // All failures must leave *neither* a publishable archive nor checksum.
    const tarballPath = removeCandidateArtifacts(repoRoot, distDir, version);
    buildVoicePack(repoRoot, version, tarballPath, run);
  } catch (err) {
    cleanupAfterFailure(repoRoot);
    throw err;
  }
}

/** Remove this version's archive and checksum, only inside a real in-root dist directory. */
function removeCandidateArtifacts(repoRoot, distDir, version) {
  const tarballPath = path.join(distDir, `failsafe-voice-pack-${version}.tar.gz`);
  if (assertSafeDistDirectory(repoRoot, distDir)) {
    fs.rmSync(tarballPath, { force: true });
    fs.rmSync(`${tarballPath}.sha256`, { force: true });
  }
  return tarballPath;
}

function buildVoicePack(repoRoot, version, tarballPath, run) {
  const stagingDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'failsafe-voice-pack-build-'));
  try {
    const vendorSourceRoot = path.join(repoRoot, 'dist', 'extension', 'ui', 'vendor');
    const collected = collectFiles(repoRoot, vendorSourceRoot, stagingDir);

    writeManifest(stagingDir, version, collected);

    runTarCreate(stagingDir, tarballPath, run);
    writeSha256(tarballPath);

    console.log(`[package-voice-pack] wrote ${tarballPath}`);
    console.log(`[package-voice-pack] files: ${collected.length}`);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function cleanupAfterFailure(repoRoot) {
  // A partial tarball or stale checksum is not a valid release candidate.
  // An unreadable or unsafe version has no candidate to clean up.
  let version;
  try { version = readVersion(repoRoot); } catch { return; }
  try {
    // Cleanup must honor the same boundary as the normal write path, for
    // every version readVersion accepts, prereleases included (#707 V3).
    removeCandidateArtifacts(repoRoot, path.join(repoRoot, 'dist'), version);
  } catch (cleanupErr) {
    process.stderr.write('[package-voice-pack] artifact cleanup warning: ' + cleanupErr.message + '\n');
  }
}

function readVersion(repoRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    throw new Error('package.json version must be a safe SemVer identifier');
  }
  return pkg.version;
}

/** Build outputs must be a real in-root directory before any unlink/write. */
function assertSafeDistDirectory(repoRoot, distDir) {
  assertVendorAncestry(distDir, fs, repoRoot);
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

function collectFiles(repoRoot, vendorSourceRoot, stagingDir) {
  if (!fs.existsSync(vendorSourceRoot)) {
    throw new Error('vendor source dir not found: ' + vendorSourceRoot);
  }
  const collected = [];
  for (const rel of REQUIRED_ASSETS) {
    // The shared vendor guard rejects symlink/junction ancestry before copying.
    assertVendorAncestry(path.join(vendorSourceRoot, ...rel.split('/')), fs, repoRoot);
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

function runTarCreate(stagingDir, tarballPath, run = spawnSync) {
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
  const result = run('tar', args, {
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

module.exports = { packageVoicePack };
if (require.main === module) main();
