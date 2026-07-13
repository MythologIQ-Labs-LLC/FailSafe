// TRUTH HEADER (plan-240 LD5): this is NOT the active runner when the
// .vscode-test.mjs config is present — @vscode/test-cli's config-mode shadows
// --extensionTestsPath and its built-in runner.cjs executes instead. Retained
// only for the package.json:729 --extensionTestsPath fallback flag.
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 15000
  });
  // Belt + suspenders: explicit setter overrides any nested suite that
  // accidentally inherits mocha's 2000ms built-in default.
  mocha.timeout(15000);

  const testsRoot = path.resolve(__dirname, '..');
  const testFiles = await glob('**/*.test.js', { cwd: testsRoot });

  for (const file of testFiles) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
