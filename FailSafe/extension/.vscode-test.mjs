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

export default defineConfig({
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
  },
});
