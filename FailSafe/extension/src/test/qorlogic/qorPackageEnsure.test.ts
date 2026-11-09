import { strict as assert } from 'assert';
import type {
  IQorLogicPackageInstaller, QorLogicInstallResult, QorLogicVersionStatus,
} from '../../qorlogic/QorLogicPackageInstaller';
import { FROZEN_QOR_LOGIC_VERSION, MIN_QOR_LOGIC_VERSION } from '../../qorlogic/hostLayouts';
import { checkFrozenQorPackage, ensureFrozenQorPackage } from '../../qorlogic/qorPackageEnsure';

function fakePackage(version: string | null, healthy: boolean) {
  let installed = version;
  let installCalls = 0;
  let healthCalls = 0;
  const packageApi: IQorLogicPackageInstaller = {
    isInstalled: async () => installed !== null,
    version: async () => installed,
    verifyInstalledVersion: async (): Promise<QorLogicVersionStatus> => ({
      installed, minimum: MIN_QOR_LOGIC_VERSION, meetsFloor: installed !== null,
      testedAgainst: '0.169.0', matchesTested: installed === '0.169.0',
    }),
    verifyInstalledDependencies: async () => {
      healthCalls++;
      return healthy ? { ok: true } : {
        ok: false, error: 'dependencies-unsatisfied',
        details: 'qor-logic requires PyYAML, which is not installed',
      };
    },
    install: async (): Promise<QorLogicInstallResult> => {
      installCalls++;
      installed = FROZEN_QOR_LOGIC_VERSION;
      return { ok: true, command: 'offline-verified-wheel' };
    },
  };
  return { packageApi, counts: () => ({ installCalls, healthCalls }) };
}

suite('#463: frozen package readiness is not version equality', () => {
  test('already-installed exact version with missing dependencies never succeeds', async () => {
    const fake = fakePackage(FROZEN_QOR_LOGIC_VERSION, false);
    const checked = await checkFrozenQorPackage(fake.packageApi);
    assert.deepEqual(checked, { ok: false, error: 'dependencies-unsatisfied' });
    const ensured = await ensureFrozenQorPackage(fake.packageApi);
    assert.equal(ensured.ok, false);
    if (!ensured.ok) assert.match(ensured.stderrTail ?? '', /PyYAML/);
    assert.deepEqual(fake.counts(), { installCalls: 0, healthCalls: 2 });
  });

  test('matching version and healthy dependencies remains read-only', async () => {
    const fake = fakePackage(FROZEN_QOR_LOGIC_VERSION, true);
    assert.deepEqual(await checkFrozenQorPackage(fake.packageApi), { ok: true });
    const ensured = await ensureFrozenQorPackage(fake.packageApi);
    assert.equal(ensured.ok, true);
    assert.deepEqual(fake.counts(), { installCalls: 0, healthCalls: 2 });
  });

  test('older and future versions fail without installation or dependency probes', async () => {
    for (const version of ['0.169.0', '0.177.0']) {
      const fake = fakePackage(version, true);
      assert.equal((await checkFrozenQorPackage(fake.packageApi)).ok, false);
      assert.equal((await ensureFrozenQorPackage(fake.packageApi, '/approved/wheel')).ok, false);
      assert.deepEqual(fake.counts(), { installCalls: 0, healthCalls: 0 });
    }
  });

  test('missing package without owner wheel remains absent and unmodified', async () => {
    const fake = fakePackage(null, true);
    const status = await ensureFrozenQorPackage(fake.packageApi);
    assert.deepEqual(status, { ok: false, error: 'verified-wheel-required' });
    assert.deepEqual(fake.counts(), { installCalls: 0, healthCalls: 0 });
  });

  test('failed post-install health check cannot be resurrected by retry', async () => {
    const fake = fakePackage(null, false);
    const first = await ensureFrozenQorPackage(fake.packageApi, '/approved/verified-wheel.whl');
    assert.equal(first.ok, false);
    if (!first.ok) assert.equal(first.error, 'dependencies-unsatisfied');
    const retry = await ensureFrozenQorPackage(fake.packageApi);
    assert.equal(retry.ok, false);
    assert.deepEqual(fake.counts(), { installCalls: 1, healthCalls: 2 });
  });
});
