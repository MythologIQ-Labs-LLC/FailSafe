import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// qor-debug Phase 2 finding: dual-host spawn is caused by ambient Code.exe
// processes racing against vscode-test's spawned host on the shared
// --user-data-dir. Mitigation: pin per-invocation unique user-data-dir under
// the OS temp directory so the test host runs in isolation from any
// operator editor windows holding the same workspace.
const isolatedUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-vscode-test-'));

// Release-gate determinism: pin the VS Code (Electron) version the test host
// runs against. Defaulting to 'stable' silently tracks VS Code's auto-update,
// and on 2026-06-03 the stable bump 1.122.1 -> 1.123.0 shipped a newer Electron
// (V8 13.x) whose removed APIs broke the better-sqlite3@12.6.2 native rebuild,
// turning two otherwise-ready releases (v5.4.0/v5.4.1) into dead tags. Pinning
// to the last-known-good stable decouples the release gate from editor
// auto-update. Keep this in lockstep with VSCODE_TEST_VERSION in
// scripts/rebuild-vscode-electron.cjs (both must target the same Electron).
const VSCODE_TEST_VERSION = '1.122.1';

export default defineConfig({
  version: VSCODE_TEST_VERSION,
  files: 'out/test/**/*.test.js',
  extensionDevelopmentPath: __dirname,
  workspaceFolder: path.join(__dirname, 'src', 'test', 'test-workspace'),
  launchArgs: [
    '--user-data-dir', isolatedUserDataDir,
  ],
  // @vscode/test-cli ignores --extensionTestsPath when this config exists, so
  // the custom out/test/suite/index runner (which sets 15s) never runs. Set
  // mocha defaults here too. 15s headroom covers Windows fs flake under
  // prepush concurrency + CI load.
  mocha: {
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
  },
});
