const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { downloadAndUnzipVSCode } = require('@vscode/test-electron');

// Release-gate determinism: pin the VS Code (Electron) version we rebuild
// better-sqlite3 against. MUST match VSCODE_TEST_VERSION in .vscode-test.mjs so
// the native module ABI matches the editor the test host launches. Defaulting
// to 'stable' silently tracks VS Code auto-update — the 2026-06-03 stable bump
// 1.122.1 -> 1.123.0 (Electron/V8 13.x) removed APIs used by better-sqlite3@12.6.2
// and dead-tagged v5.4.0/v5.4.1. Override via FAILSAFE_VSCODE_TEST_VERSION only
// for a deliberate, verified compatibility bump.
const VSCODE_TEST_VERSION = process.env.FAILSAFE_VSCODE_TEST_VERSION || '1.122.1';

async function resolveAppRoot() {
  const localTestDir = path.join(__dirname, '..', '.vscode-test');
  if (fs.existsSync(localTestDir)) {
    const entries = fs.readdirSync(localTestDir, { withFileTypes: true });
    // Only reuse a cache dir for the pinned version; a stale dir for a
    // different VS Code version would rebuild against the wrong Electron ABI.
    const vscodeDir = entries.find(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith('vscode-') &&
        entry.name.includes(VSCODE_TEST_VERSION)
    );
    if (vscodeDir) {
      const directRoot = path.join(localTestDir, vscodeDir.name, 'resources', 'app');
      if (fs.existsSync(path.join(directRoot, 'package.json'))) {
        return directRoot;
      }

      // VS Code archives may include a nested commit directory
      // (for example, vscode-.../<commit>/resources/app).
      const nestedEntries = fs.readdirSync(path.join(localTestDir, vscodeDir.name), { withFileTypes: true });
      for (const nested of nestedEntries) {
        if (!nested.isDirectory()) {
          continue;
        }
        const candidate = path.join(localTestDir, vscodeDir.name, nested.name, 'resources', 'app');
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
          return candidate;
        }
      }
    }
  }

  const vscodePath = await downloadAndUnzipVSCode(VSCODE_TEST_VERSION);
  const vscodeDir = path.dirname(vscodePath);
  return path.join(vscodeDir, 'resources', 'app');
}

function readElectronVersion(appRoot) {
  const packagePath = path.join(appRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`VS Code package.json not found at ${packagePath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (pkg.electron) {
    return pkg.electron;
  }

  const bootstrapPath = path.join(appRoot, 'out', 'bootstrap-fork.js');
  if (fs.existsSync(bootstrapPath)) {
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    const match = bootstrap.match(/\"electron\":\"([0-9.]+)\"/);
    if (match) {
      return match[1];
    }
  }

  throw new Error('Electron version not found in VS Code package.json or bootstrap-fork.js');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rebuildBetterSqlite3(electronVersion) {
  const npmExecPath = process.env.npm_execpath;
  const npmCmd = npmExecPath
    ? process.execPath
    : process.platform === 'win32'
      ? 'npm.cmd'
      : 'npm';
  const args = [
    'rebuild',
    'better-sqlite3',
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--dist-url=https://electronjs.org/headers'
  ];
  const npmArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const maxAttempts = Number.parseInt(process.env.FAILSAFE_REBUILD_RETRIES ?? '3', 10);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const waitMs = (attempt - 1) * 5000;
      console.warn(`Retrying better-sqlite3 rebuild (${attempt}/${maxAttempts}) after ${waitMs}ms...`);
      sleep(waitMs);
    }

    const result = spawnSync(npmCmd, npmArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        NPM_CONFIG_FETCH_RETRIES: process.env.NPM_CONFIG_FETCH_RETRIES ?? '5',
        NPM_CONFIG_FETCH_RETRY_MINTIMEOUT: process.env.NPM_CONFIG_FETCH_RETRY_MINTIMEOUT ?? '20000',
        NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT: process.env.NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT ?? '120000'
      }
    });

    if (result.error) {
      if (attempt === maxAttempts) {
        throw result.error;
      }
      continue;
    }

    if (result.status === 0) {
      return;
    }

    if (attempt === maxAttempts) {
      throw new Error(`better-sqlite3 rebuild failed with exit code ${result.status}`);
    }
  }
}

async function main() {
  const appRoot = await resolveAppRoot();
  const electronVersion = readElectronVersion(appRoot);
  rebuildBetterSqlite3(electronVersion);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
