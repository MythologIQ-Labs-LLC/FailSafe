// Functional tests for the operator-categorization applier (GH #174).
// Pure — generated manifest + operator decisions in, re-categorized manifest out.

import { strict as assert } from 'assert';
import { applyCategoryDecisions } from '../../../roadmap/tracker/manifest-categorize';
import type { CategoryDecisions } from '../../../roadmap/tracker/manifest-categorize';
import type { TrackerManifest } from '../../../roadmap/tracker/tracker-model';

const BASE: TrackerManifest = {
  repo: 'acme/widgets',
  meta: { title: 'x', metaRow: [{ label: 'Merged PRs', value: '9' }, { label: 'Programs', value: '3' }] },
  programs: [
    { key: 'ci', name: 'Ci', accent: '#38d6c8' },
    { key: 'connectors', name: 'Connectors', accent: '#e7b04b' },
    { key: 'runtime', name: 'Runtime', accent: '#f0728f' },
  ],
  phases: [
    { prog: 'ci', key: 'PR1', rc: 'pr-1', w: 20, title: 'gate ecosystem' },
    { prog: 'connectors', key: 'PR2', rc: 'pr-2', w: 20, title: 'github connector' },
    { prog: 'runtime', key: 'PR3', rc: 'pr-3', w: 50, title: 'boundary layer' },
  ],
  verticals: [
    { key: 'adapter', name: 'Adapter core', accent: '#38d6c8', summary: 'norm seam', functionality: ['a'], backend: ['`x.ts`'] },
    { key: 'zendesk', name: 'Zendesk', accent: '#f0728f', summary: 'tickets' },
  ],
};

suite('roadmap/tracker manifest-categorize (operator decision)', () => {
  test('no-op: keep all, no folds/renames → programs + phases + verticals preserved', () => {
    const d: CategoryDecisions = {
      programs: [{ key: 'ci', name: 'Ci' }, { key: 'connectors', name: 'Connectors' }, { key: 'runtime', name: 'Runtime' }],
      folds: [],
      verticals: [{ key: 'adapter', name: 'Adapter core' }, { key: 'zendesk', name: 'Zendesk' }],
    };
    const m = applyCategoryDecisions(BASE, d);
    assert.equal(m.programs!.length, 3);
    assert.equal(m.phases!.length, 3);
    assert.equal(m.verticals!.length, 2);
    assert.equal(m.phases!.find((p) => p.key === 'PR1')!.prog, 'ci');
    assert.equal(m.meta!.metaRow!.find((r) => r.label === 'Programs')!.value, '3');
  });

  test('drop + fold: dropped program’s phases reassigned to a kept target', () => {
    const d: CategoryDecisions = {
      programs: [{ key: 'ci', name: 'CI/CD' }, { key: 'runtime', name: 'Runtime' }],
      folds: [{ from: 'connectors', into: 'runtime' }],
      verticals: [{ key: 'adapter', name: 'Adapter core' }, { key: 'zendesk', name: 'Zendesk' }],
    };
    const m = applyCategoryDecisions(BASE, d);
    assert.ok(!m.programs!.some((p) => p.key === 'connectors'), 'dropped program gone');
    assert.equal(m.phases!.find((p) => p.key === 'PR2')!.prog, 'runtime', 'phase folded into target');
    assert.equal(m.programs!.find((p) => p.key === 'ci')!.name, 'CI/CD', 'rename applied');
    assert.equal(m.programs!.find((p) => p.key === 'ci')!.accent, '#38d6c8', 'accent preserved on rename');
    assert.equal(m.meta!.metaRow!.find((r) => r.label === 'Programs')!.value, '2', 'count refreshed');
  });

  test('fold into Other: synthesizes an Other program when none kept', () => {
    const d: CategoryDecisions = {
      programs: [{ key: 'ci', name: 'Ci' }, { key: 'runtime', name: 'Runtime' }],
      folds: [{ from: 'connectors', into: 'other' }],
      verticals: [{ key: 'adapter', name: 'Adapter core' }, { key: 'zendesk', name: 'Zendesk' }],
    };
    const m = applyCategoryDecisions(BASE, d);
    const other = m.programs!.find((p) => p.key === 'other');
    assert.ok(other, 'Other program synthesized');
    assert.equal(other!.name, 'Other');
    assert.equal(m.phases!.find((p) => p.key === 'PR2')!.prog, 'other');
  });

  test('fold target itself dropped → phase degrades to Other (no orphan key)', () => {
    const d: CategoryDecisions = {
      // keep only ci; both connectors and runtime dropped, connectors folds into the (also-dropped) runtime
      programs: [{ key: 'ci', name: 'Ci' }],
      folds: [{ from: 'connectors', into: 'runtime' }, { from: 'runtime', into: 'other' }],
      verticals: [{ key: 'adapter', name: 'Adapter core' }],
    };
    const m = applyCategoryDecisions(BASE, d);
    assert.equal(m.phases!.find((p) => p.key === 'PR2')!.prog, 'other', 'connectors→runtime(dropped)→other');
    assert.equal(m.phases!.find((p) => p.key === 'PR3')!.prog, 'other', 'runtime→other');
    assert.ok(m.programs!.some((p) => p.key === 'other'));
    assert.ok(!m.programs!.some((p) => p.key === 'runtime'));
  });

  test('verticals: drop removes; rename keeps all other fields', () => {
    const d: CategoryDecisions = {
      programs: [{ key: 'ci', name: 'Ci' }, { key: 'connectors', name: 'Connectors' }, { key: 'runtime', name: 'Runtime' }],
      folds: [],
      verticals: [{ key: 'adapter', name: 'Universal adapter' }], // zendesk dropped, adapter renamed
    };
    const m = applyCategoryDecisions(BASE, d);
    assert.equal(m.verticals!.length, 1);
    assert.ok(!m.verticals!.some((v) => v.key === 'zendesk'), 'dropped vertical gone');
    const a = m.verticals!.find((v) => v.key === 'adapter')!;
    assert.equal(a.name, 'Universal adapter', 'rename applied');
    assert.equal(a.summary, 'norm seam', 'summary preserved');
    assert.deepEqual(a.functionality, ['a'], 'functionality preserved');
    assert.deepEqual(a.backend, ['`x.ts`'], 'backend preserved');
  });

  test('does not mutate the base manifest', () => {
    const d: CategoryDecisions = {
      programs: [{ key: 'ci', name: 'CI/CD' }],
      folds: [{ from: 'connectors', into: 'other' }, { from: 'runtime', into: 'other' }],
      verticals: [],
    };
    applyCategoryDecisions(BASE, d);
    assert.equal(BASE.programs!.length, 3, 'base programs untouched');
    assert.equal(BASE.programs!.find((p) => p.key === 'ci')!.name, 'Ci', 'base name untouched');
    assert.equal(BASE.phases!.find((p) => p.key === 'PR2')!.prog, 'connectors', 'base phase untouched');
    assert.equal(BASE.verticals!.length, 2, 'base verticals untouched');
  });

  // FX887 — agents follow the operator-confirmed taxonomy: dropped program folds,
  // unkept vertical refs clear, kept-program agents survive.
  test('agents: dropped program folds, unkept vertical ref clears, kept survives', () => {
    const withAgents: TrackerManifest = {
      ...BASE,
      agents: [
        { key: 'ci', name: 'CI', program: 'ci', vertical: 'adapter', patterns: ['ci'] },
        { key: 'connectors', name: 'Conn', program: 'connectors', vertical: 'zendesk' },
      ],
    };
    const d: CategoryDecisions = {
      programs: [{ key: 'ci', name: 'CI/CD' }],                       // keep ci, drop connectors + runtime
      folds: [{ from: 'connectors', into: 'ci' }, { from: 'runtime', into: 'other' }],
      verticals: [{ key: 'adapter', name: 'Adapter core' }],          // keep adapter, drop zendesk
    };
    const out = applyCategoryDecisions(withAgents, d);
    const ci = out.agents!.find((a) => a.key === 'ci')!;
    assert.equal(ci.program, 'ci', 'kept-program agent keeps its program');
    assert.equal(ci.vertical, 'adapter', 'kept vertical ref preserved');
    const conn = out.agents!.find((a) => a.key === 'connectors')!;
    assert.equal(conn.program, 'ci', 'dropped program agent folds to the fold target');
    assert.equal(conn.vertical, undefined, 'dropped vertical ref (zendesk) cleared');
  });
});
