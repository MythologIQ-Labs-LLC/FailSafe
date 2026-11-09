import { strict as assert } from 'assert';
import { parseQorHostInstallCount, qualifyQorHostExit } from '../../qorlogic/qorHostInstallOutput';
import type { InstallerRunResult } from '../../qorlogic/QorLogicPackageInstaller';

const output = { appendLine: (_line: string) => undefined };
const completed = (stdout: string): InstallerRunResult => ({
  stdout, stderr: '', code: 0, timedOut: false,
});

suite('#463: frozen Qor-logic positive host install confirmation', () => {
  test('frozen CLI confirmation binds exact host and positive count', () => {
    for (const host of ['claude', 'codex', 'kilo-code', 'gemini'] as const) {
      assert.equal(parseQorHostInstallCount(`Installed 17 files to ${host}\n`, host), 17);
    }
  });
  test('exit zero without actual install confirmation cannot claim writes', () => {
    for (const stdout of ['', 'No install record found.', 'Would install 3 files to claude',
      '[dry-run] Would install 3 files to claude', 'Installed 0 files to claude']) {
      assert.equal(parseQorHostInstallCount(stdout, 'claude'), null);
      assert.deepEqual(qualifyQorHostExit(completed(stdout), 'claude', output),
        { ok: false, error: 'install-confirmation-missing-or-invalid' });
    }
  });
  test('a result for another host cannot pass', () => {
    assert.equal(parseQorHostInstallCount('Installed 4 files to codex', 'claude'), null);
  });
  test('duplicate or conflicting confirmations cannot pass', () => {
    assert.equal(parseQorHostInstallCount(
      'Installed 4 files to claude\nInstalled 4 files to claude\n', 'claude'), null);
    assert.equal(parseQorHostInstallCount(
      'Installed 4 files to claude\nInstalled 1 files to codex\n', 'claude'), null);
  });
  test('count overflow and oversized stdout cannot pass', () => {
    assert.equal(parseQorHostInstallCount('Installed 2049 files to claude', 'claude'), null);
    assert.equal(parseQorHostInstallCount('Installed 999999 files to claude', 'claude'), null);
    assert.equal(parseQorHostInstallCount('x'.repeat(65537) + 'Installed 1 files to claude', 'claude'), null);
  });
  test('a valid confirmation returns the amount only after successful process exit', () => {
    assert.deepEqual(qualifyQorHostExit(completed('Installed 3 files to claude\n'), 'claude', output),
      { ok: true, installedCount: 3 });
    assert.equal(qualifyQorHostExit({ ...completed('Installed 3 files to claude'), code: 1 }, 'claude', output).ok, false);
    assert.equal(qualifyQorHostExit({ ...completed('Installed 3 files to claude'), timedOut: true }, 'claude', output).ok, false);
  });
});
