import { strict as assert } from 'assert';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  governanceSubviewForRoute,
  navigationHash,
  parseCommandCenterHash,
} = require('../../../src/roadmap/ui/modules/command-center-deeplink.js');

suite('command-center deep links', () => {
  test('legacy verdict hash routes governance to Audit', () => {
    const route = parseCommandCenterHash('#governance?verdict=2026-05-27T19%3A37%3A56.730Z');
    assert.equal(route.tab, 'governance');
    assert.equal(governanceSubviewForRoute(route), 'audit');
  });

  test('risk and L3 hashes route to their owning Governance subviews', () => {
    assert.equal(governanceSubviewForRoute(parseCommandCenterHash('#governance?severity=high')), 'risks');
    assert.equal(governanceSubviewForRoute(parseCommandCenterHash('#governance?section=l3-chain')), 'compliance');
  });

  test('explicit subview hash is preserved', () => {
    assert.equal(governanceSubviewForRoute(parseCommandCenterHash('#governance:risks?severity=high')), 'risks');
    assert.equal(navigationHash('governance:compliance?section=l3-chain'), '#governance:compliance?section=l3-chain');
  });
});
