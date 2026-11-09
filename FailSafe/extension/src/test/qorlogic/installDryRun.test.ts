// #463: The frozen 0.176.1 CLI cannot preview its authoritative write set.
// A fixture claiming --json succeeded cannot authorize actual installation.
import { strict as assert } from 'assert';
import { previewInstall, type InstallDryRunDeps } from '../../qorlogic/installDryRun';

function fakeDeps(call: () => void): InstallDryRunDeps {
  return {
    runQorlogicCommand: async () => {
      call();
      return { code: 0, stdout: JSON.stringify({ would_write: [{ path: '/ws/secret' }] }), stderr: '' };
    },
    warn: () => undefined,
  };
}

suite('#463 frozen Qor-logic install preview refuses unsupported flags', () => {
  test('unfiltered preview refuses without any CLI execution', async () => {
    let calls = 0;
    const result = await previewInstall({} as never, 'claude', 'repo', undefined, fakeDeps(() => calls++));
    assert.deepEqual(result, {
      wouldWrite: [], degraded: true, reason: 'frozen-qor-logic-install-preview-unavailable',
    });
    assert.equal(calls, 0);
  });

  test('explicit named subset and empty subset cannot become unfiltered installs', async () => {
    for (const selected of [['qor-audit', 'qor-plan'], []]) {
      let calls = 0;
      const result = await previewInstall({} as never, 'codex', 'repo', selected, fakeDeps(() => calls++));
      assert.deepEqual(result, {
        wouldWrite: [], degraded: true, reason: 'selective-skill-preview-unavailable',
      });
      assert.equal(calls, 0);
    }
  });

  test('host, global scope and missing scope never bypass refusal', async () => {
    let calls = 0;
    const run = fakeDeps(() => calls++);
    for (const scope of ['repo', 'global', undefined] as const) {
      const result = await previewInstall({} as never, 'gemini', scope, undefined, run);
      assert.equal(result.degraded, true);
      assert.deepEqual(result.wouldWrite, []);
    }
    assert.equal(calls, 0);
  });
});
