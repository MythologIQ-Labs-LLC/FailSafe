// Functional tests for the Bicameral-MCP manifest enrichment (GH #174, Layer 3).
// Pure — sample BicameralFeatureBrief[] in, augmented manifest out.

import { strict as assert } from 'assert';
import {
  enrichManifestWithBicameral, verticalsFromBriefs, decisionsFromBriefs,
} from '../../../roadmap/tracker/manifest-bicameral';
import type { TrackerManifest } from '../../../roadmap/tracker/tracker-model';
import type { BicameralFeatureBrief } from '../../../integrations/bicameral';

const BRIEFS: BicameralFeatureBrief[] = [
  {
    feature: 'Adapter Core',
    decisions: [
      { id: 'd1', title: 'Normalize at the producer', source: 'ADR-0008', status: 'in-sync', bindings: [{ filePath: 'adapter/core.ts' }] },
      { id: 'd2', title: 'Fail-closed sensitive screen', source: 'ADR-0008', status: 'drifted', bindings: [{ filePath: 'adapter/screen.ts' }] },
    ],
  },
  {
    feature: 'Runtime',
    decisions: [
      { id: 'd3', title: 'Operator-host boundary', source: 'ADR-0012', status: 'open-question', bindings: [{ filePath: 'runtime/seam.ts' }] },
    ],
  },
];

const BASE: TrackerManifest = {
  repo: 'acme/widgets',
  meta: { title: 'x', metaRow: [{ label: 'Merged PRs', value: '5' }] },
  programs: [{ key: 'a', name: 'A', accent: '#fff' }],
  phases: [],
  verticals: [{ key: 'old', name: 'Old (from CHANGELOG)', accent: '#000', summary: 'replaced' } as never],
};

suite('roadmap/tracker manifest-bicameral enrichment', () => {
  test('verticalsFromBriefs: one vertical per feature, decisions → functionality (status), bindings → backend', () => {
    const v = verticalsFromBriefs(BRIEFS);
    assert.equal(v.length, 2);
    assert.equal(v[0].name, 'Adapter Core');
    assert.equal(v[0].key, 'adapter-core');
    assert.ok(v[0].functionality!.some((f) => /In sync/.test(f) && /Normalize/.test(f)), 'status + title in functionality');
    assert.ok(v[0].functionality!.some((f) => /Drifted/.test(f)), 'drifted status surfaced');
    assert.deepEqual(v[0].backend, ['`adapter/core.ts`', '`adapter/screen.ts`'], 'code bindings → backend');
  });

  test('decisionsFromBriefs: deduped by id, carries feature + status, capped', () => {
    const d = decisionsFromBriefs(BRIEFS);
    assert.equal(d.length, 3);
    assert.equal(d[0].decision, 'Normalize at the producer');
    assert.ok(/Adapter Core/.test(d[0].drivenBy) && /In sync/.test(d[0].drivenBy));
    assert.equal(d[0].evidence, 'ADR-0008');
  });

  test('enrichManifestWithBicameral REPLACES verticals + decisions when briefs present', () => {
    const m = enrichManifestWithBicameral(BASE, BRIEFS);
    assert.equal(m.verticals!.length, 2, 'CHANGELOG verticals replaced by decision-aware ones');
    assert.ok(!m.verticals!.some((v) => v.key === 'old'));
    assert.equal(m.meta!.decisions!.length, 3);
    // a "Decisions" metaRow is upserted
    assert.equal(m.meta!.metaRow!.find((r) => r.label === 'Decisions')!.value, '3');
  });

  test('degrade-safe: empty briefs → base manifest unchanged', () => {
    const m = enrichManifestWithBicameral(BASE, []);
    assert.strictEqual(m, BASE, 'no briefs → identical reference, no mutation');
  });
});
