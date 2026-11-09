// #591 follow-up (v6.0.12): the extension-host test run must never use the real
// user profile as os.homedir(). The ConsoleServer registry and the lifecycle
// tests write ~/.failsafe/servers.json there. src/test/testHomeGuard.cjs
// redirects a non-isolated home before tests load; this test fails the run when
// it had to, so a launch without the configured disposable home is reported.

import { strict as assert } from 'assert';
import * as os from 'os';
import * as path from 'path';

suite('test host home isolation (#591)', () => {
  test('os.homedir() is a disposable failsafe-vscode-test home under the OS temp folder', () => {
    const home = os.homedir();
    assert.match(path.basename(home), /^failsafe-vscode-test-(arch-)?home-/, `home is ${home}`);
    const rel = path.relative(os.tmpdir(), home);
    assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `home ${home} is under ${os.tmpdir()}`);
  });

  test('the configured env isolated the home, so the guard did not have to redirect it', () => {
    assert.equal(process.env.FAILSAFE_TEST_HOME_GUARD_FIRED, undefined,
      'the test host started with the real profile as home; testHomeGuard.cjs redirected it (check .vscode-test.mjs env)');
  });
});
