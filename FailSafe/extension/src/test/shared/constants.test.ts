import { strict as assert } from 'assert';
import { FAILSAFE_PRO_DOWNLOAD_URL } from '../../shared/constants';

suite('shared/constants: FAILSAFE_PRO_DOWNLOAD_URL', () => {
  test('is the exact canonical Pro download URL', () => {
    // Drift guard. If the website route changes, fix it via a redirect upstream
    // and update this constant in lockstep — never scatter URLs across the codebase.
    assert.equal(FAILSAFE_PRO_DOWNLOAD_URL, 'https://mythologiq.studio/failsafe-pro/download');
  });

  test('uses https scheme', () => {
    assert.ok(FAILSAFE_PRO_DOWNLOAD_URL.startsWith('https://'));
  });
});
