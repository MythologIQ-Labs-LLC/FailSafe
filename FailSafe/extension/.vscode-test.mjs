import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
// #531 LD7: the configurations (and their file patterns) are shared with the census.
const { CONFIGS, LABEL_ENV } = require('./src/test/vscodeTestConfigs.cjs');
const { removeTempTree } = require('./src/test/shared/removeTempTree.cjs');

// qor-debug Phase 2 finding: dual-host spawn is caused by ambient Code.exe
// processes racing against vscode-test's spawned host on the shared
// --user-data-dir. Mitigation: pin per-invocation unique user-data-dir under
// the OS temp directory so the test host runs in isolation from any
// operator editor windows holding the same workspace. Each configuration gets
// its own (#531), so the two hosts never share profile state.
const isolatedUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-vscode-test-'));
const architectureUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-vscode-test-arch-'));

// Release-gate determinism: pin the VS Code (Electron) version the test host
// runs against. Defaulting to 'stable' silently tracks VS Code's auto-update,
// and on 2026-06-03 the stable bump 1.122.1 -> 1.123.0 shipped a newer Electron
// (V8 13.x) whose removed APIs broke the better-sqlite3@12.6.2 native rebuild,
// turning two otherwise-ready releases (v5.4.0/v5.4.1) into dead tags. Pinning
// to the last-known-good stable decouples the release gate from editor
// auto-update. Since #502 better-sqlite3 13.x is N-API (no per-Electron rebuild);
// the pin stays for deterministic test runs.
const VSCODE_TEST_VERSION = '1.122.1';

/**
 * #531 LD7: a fresh git repository for the architecture-index configuration,
 * created synchronously when this config loads. FailSafe binds to
 * workspaceFolders[0] at activation and the default test workspace's docs/ is
 * gitignored, so the managed index needs a workspace of its own: one
 * architecture candidate document and one commit. CI runners have no global git
 * identity, so the commit passes its own; hooks and signing are off. The cwd is
 * the folder just created, so no planted git.exe can be picked up from it.
 */
function createArchitectureWorkspace() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-ws-')));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (r.error || r.status !== 0) {
      throw new Error(`architecture-index workspace: git ${args.join(' ')} failed: ${r.error?.message ?? r.stderr}`);
    }
  };
  git('init', '-q');
  fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME.md'), '# Runtime\n\nHow the runtime is composed.\n');
  git('add', 'docs/architecture/RUNTIME.md');
  git('-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '-m', 'seed architecture candidate');
  return root;
}

const architectureWorkspace = createArchitectureWorkspace();
// Junction-safe removal when the CLI exits; cleanup must never change the exit code.
process.on('exit', () => {
  try { removeTempTree(architectureWorkspace); } catch { /* best-effort */ }
});

// @vscode/test-cli ignores --extensionTestsPath when this config exists, so
// the custom out/test/suite/index runner (which sets 15s) never runs. Set
// mocha defaults here too. 15s headroom covers Windows fs flake under
// prepush concurrency + CI load. Both configurations use the same block (the
// test-cli default timeout would otherwise be 2000).
const mocha = {
  timeout: 15000,
  // Test files use mocha TDD interface (suite/test/setup/teardown/
  // suiteSetup/suiteTeardown). The custom out/test/suite/index runner
  // (when invoked via --extensionTestsPath) accidentally worked with
  // 'bdd' because its mocha instance happened to expose TDD globals;
  // when test-cli's built-in runner.cjs takes over after deleting the
  // shadowing .json config, we must declare 'tdd' explicitly.
  ui: 'tdd',
  color: true,
  // Test-run census (plan-240 LD5): test-cli's built-in runner.cjs:19-22
  // require()s every mochaOpts.require entry in-process before addFile/run.
  // Plain CJS from src/ — needs no compile step, patches the shared mocha.
  require: [path.join(__dirname, 'src', 'test', 'census.cjs')],
};

export default defineConfig([
  {
    label: 'default',
    version: VSCODE_TEST_VERSION,
    // Everything except out/test/extension-arch/ (test-cli has no per-config ignore).
    files: [...CONFIGS.default.files],
    extensionDevelopmentPath: __dirname,
    workspaceFolder: path.join(__dirname, 'src', 'test', 'test-workspace'),
    launchArgs: ['--user-data-dir', isolatedUserDataDir],
    env: { [LABEL_ENV]: 'default' },
    mocha,
  },
  {
    label: 'architecture-index',
    version: VSCODE_TEST_VERSION,
    files: [...CONFIGS['architecture-index'].files],
    extensionDevelopmentPath: __dirname,
    workspaceFolder: architectureWorkspace,
    launchArgs: ['--user-data-dir', architectureUserDataDir],
    env: { [LABEL_ENV]: 'architecture-index' },
    mocha,
  },
]);
