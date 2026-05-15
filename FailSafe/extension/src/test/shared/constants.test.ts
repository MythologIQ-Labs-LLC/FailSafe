import { strict as assert } from 'assert';
import {
  FAILSAFE_PRO_ABOUT_URL,
  FAILSAFE_PRO_DOWNLOAD_URL,
} from '../../shared/constants';

suite('shared/constants: FAILSAFE_PRO_ABOUT_URL', () => {
  test('is the exact canonical Pro learn-more URL', () => {
    // Drift guard. If the website route changes, fix the website redirect
    // and update this constant in lockstep — never scatter URLs across the codebase.
    assert.equal(FAILSAFE_PRO_ABOUT_URL, 'https://mythologiq.studio/products/failsafe-pro');
  });

  test('uses https scheme', () => {
    assert.ok(FAILSAFE_PRO_ABOUT_URL.startsWith('https://'));
  });
});

suite('shared/constants: FAILSAFE_PRO_DOWNLOAD_URL', () => {
  test('is the exact canonical Pro download URL', () => {
    assert.equal(FAILSAFE_PRO_DOWNLOAD_URL, 'https://mythologiq.studio/products/failsafe-download');
  });

  test('uses https scheme', () => {
    assert.ok(FAILSAFE_PRO_DOWNLOAD_URL.startsWith('https://'));
  });

  test('is distinct from the about URL', () => {
    // The two URLs serve different roles. About = learn-more (UI surfaces this).
    // Download = direct download action (extension UI does NOT link here directly;
    // the learn page hosts the Download button.)
    assert.notEqual(FAILSAFE_PRO_DOWNLOAD_URL, FAILSAFE_PRO_ABOUT_URL);
  });
});
