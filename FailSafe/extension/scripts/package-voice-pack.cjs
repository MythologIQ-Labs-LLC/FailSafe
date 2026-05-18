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

const REPO_ROOT = process.env.FAILSAFE_REPO_ROOT || path.resolve(__dirname, '..');
const VENDOR_SOURCE_DIRS = ['piper', 'whisper'];

main();

function main() {
  try {
    const version = readVersion();
    const distDir = path.join(REPO_ROOT, 'dist');
    fs.mkdirSync(distDir, { recursive: true });

    const stagingDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'failsafe-voice-pack-build-'));
    try {
      const vendorSourceRoot = path.join(REPO_ROOT, 'dist', 'extension', 'ui', 'vendor');
      const collected = collectFiles(vendorSourceRoot, stagingDir);

      writeManifest(stagingDir, version, collected);

      const tarballPath = path.join(distDir, `failsafe-voice-pack-${version}.tar.gz`);
      runTarCreate(stagingDir, tarballPath);
      writeSha256(tarballPath);

      console.log(`[package-voice-pack] wrote ${tarballPath}`);
      console.log(`[package-voice-pack] files: ${collected.length}`);
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  } catch (err) {
    process.stderr.write(`[package-voice-pack] ERROR: ${err.message || err}\n`);
    process.exit(1);
  }
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json missing version field');
  }
  return pkg.version;
}

function collectFiles(vendorSourceRoot, stagingDir) {
  if (!fs.existsSync(vendorSourceRoot)) {
    throw new Error(`vendor source dir not found: ${vendorSourceRoot}`);
  }
  const collected = [];
  for (const sub of VENDOR_SOURCE_DIRS) {
    const subSrc = path.join(vendorSourceRoot, sub);
    if (!fs.existsSync(subSrc)) continue;
    walkAndCopy(subSrc, sub, stagingDir, collected);
  }
  if (collected.length === 0) {
    throw new Error(`vendor dirs empty under ${vendorSourceRoot} — no piper/whisper files found`);
  }
  return collected;
}

function walkAndCopy(absSrcDir, relPrefix, stagingDir, collected) {
  for (const entry of fs.readdirSync(absSrcDir, { withFileTypes: true })) {
    const absSrc = path.join(absSrcDir, entry.name);
    const relPath = `${relPrefix}/${entry.name}`;
    const absDest = path.join(stagingDir, relPath);
    if (entry.isDirectory()) {
      fs.mkdirSync(absDest, { recursive: true });
      walkAndCopy(absSrc, relPath, stagingDir, collected);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(absDest), { recursive: true });
      fs.copyFileSync(absSrc, absDest);
      collected.push({ rel: relPath, abs: absSrc });
    }
  }
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
  // --force-local: tells GNU tar / Cygwin tar to treat Windows-style paths
  // with drive letters (e.g., G:\...) as local filenames rather than as
  // `host:path` SSH remotes. Windows 10+ built-in tar.exe accepts the flag.
  const args = ['--force-local', '-czf', tarballPath, '-C', stagingDir, ...entries];
  const result = spawnSync('tar', args, { shell: false, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`tar -czf failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
}

function writeSha256(tarballPath) {
  const sha = createHash('sha256').update(fs.readFileSync(tarballPath)).digest('hex');
  fs.writeFileSync(`${tarballPath}.sha256`, `${sha}  ${path.basename(tarballPath)}\n`, 'utf8');
}
