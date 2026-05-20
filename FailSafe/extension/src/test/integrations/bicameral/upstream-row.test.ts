// FX534 — Phase 4 of plan-qor-bicameral-cluster-high.
// renderUpstreamRow helper: emits the "Upstream" row + optional version-floor
// warning for the Bicameral Settings card based on snapshot + installedVersion.
import { strict as assert } from 'assert';
import { renderUpstreamRow } from '../../../integrations/bicameral/upstream-row';
import type { UpstreamSnapshot } from '../../../integrations/bicameral/types';

const baseOpts = (snapshot: UpstreamSnapshot | null, installedVersion: string | null) => ({
  snapshot,
  installedVersion,
  minVersion: '0.14.0',
  maxVersion: '0.16.0',
});

const goodSnapshot: UpstreamSnapshot = {
  latestVersion: '0.15.2',
  latestReleasedAt: '2026-04-01T00:00:00Z',
  openIssueCount: 7,
  openPrCount: null,
  fetchedAt: '2026-05-20T00:00:00Z',
};

suite('renderUpstreamRow (FX534)', () => {
  test('renders upstream row HTML when snapshot present', async () => {
    const out = renderUpstreamRow(baseOpts(goodSnapshot, '0.15.2'));
    assert.match(out.upstream, /data-bicameral-upstream/);
    assert.match(out.upstream, /v0\.15\.2/);
    assert.match(out.upstream, /2026-04-01/);
    assert.match(out.upstream, /7 open issues/);
    assert.equal(out.warning, '', 'no warning when installed is within range');
  });

  test('hides upstream row when snapshot is null', async () => {
    const out = renderUpstreamRow(baseOpts(null, '0.15.0'));
    assert.equal(out.upstream, '');
    assert.equal(out.warning, '');
  });

  test('renders floor warning when installed < minVersion', async () => {
    const out = renderUpstreamRow(baseOpts(goodSnapshot, '0.13.5'));
    assert.match(out.warning, /data-bicameral-floor-warning/);
    assert.match(out.warning, /below the floor/);
    assert.match(out.warning, /v0\.13\.5/);
    assert.match(out.warning, /v0\.14\.0/);
  });

  test('renders ceiling warning when installed >= maxVersion (exclusive)', async () => {
    const out = renderUpstreamRow(baseOpts(goodSnapshot, '0.16.0'));
    assert.match(out.warning, /data-bicameral-ceiling-warning/);
    assert.match(out.warning, /above the tested ceiling/);
    assert.match(out.warning, /v0\.16\.0/);
  });

  test('renders no warning when installed == minVersion (boundary inclusive)', async () => {
    const out = renderUpstreamRow(baseOpts(goodSnapshot, '0.14.0'));
    assert.equal(out.warning, '', 'minVersion is inclusive');
  });

  test('singular issue count: "1 open issue" not "1 open issues"', async () => {
    const snap = { ...goodSnapshot, openIssueCount: 1 };
    const out = renderUpstreamRow(baseOpts(snap, '0.15.0'));
    assert.match(out.upstream, /1 open issue<\/span>/);
  });
});
