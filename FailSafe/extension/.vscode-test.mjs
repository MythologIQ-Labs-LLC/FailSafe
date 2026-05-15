import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  files: 'out/test/**/*.test.js',
  extensionDevelopmentPath: __dirname,
  workspaceFolder: path.join(__dirname, 'src', 'test', 'test-workspace'),
  // @vscode/test-cli ignores --extensionTestsPath when this config exists, so
  // the custom out/test/suite/index runner (which sets 15s) never runs. Set
  // mocha defaults here too. 15s headroom covers Windows fs flake under
  // prepush concurrency + CI load.
  mocha: {
    timeout: 15000,
    ui: 'bdd',
    color: true,
  },
});
