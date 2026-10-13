import { strict as assert } from 'assert';
import { MARKETPLACE_INSTALLS_ENABLED, MarketplaceInstaller } from '../../roadmap/services/MarketplaceInstaller';

suite('Marketplace release safety gate (#468/#469)', () => {
  test('unsafe marketplace installation is disabled until isolation and scanning are verified', () => {
    assert.equal(MARKETPLACE_INSTALLS_ENABLED, false);
  });

  test('installer fails closed before any clone or setup runner invocation', async () => {
    let invoked = false;
    const installer = new MarketplaceInstaller({} as never, async () => {
      invoked = true;
      return { code: 0, stdout: '', stderr: '' };
    });
    const progress: unknown[] = [];
    const result = await installer.install({ id: 'untrusted-test', name: 'Untrusted test' } as never, { sandboxEnabled: true, runSecurityScan: true }, p => progress.push(p));
    assert.equal(result.success, false);
    assert.equal(invoked, false);
    assert.match(result.error ?? '', /disabled pending/i);
    assert.ok(progress.length > 0);
    const update = await installer.update({ id: 'untrusted-test', name: 'Untrusted test' } as never, () => {});
    assert.equal(update.success, false);
    assert.equal(invoked, false);
  });
});
