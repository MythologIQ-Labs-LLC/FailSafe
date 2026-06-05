// Functional tests for the tracker manifest generator (GH #174). Pure core —
// deterministic, no I/O. Verifies programs/phases/verticals/decisions derivation.

import { strict as assert } from 'assert';
import {
  parseConventional, programsFromPrs, phasesFromPrs, verticalsFromChangelog,
  generateTrackerManifest, type GeneratorPr,
} from '../../../roadmap/tracker/manifest-generator';

const PRS: GeneratorPr[] = [
  { number: 1, title: 'feat(connectors): GitHub connector', mergedAt: '2026-06-01' },
  { number: 2, title: 'feat(connectors): Linear connector', mergedAt: '2026-06-02' },
  { number: 3, title: 'feat(runtime): boundary layer', mergedAt: '2026-06-03' },
  { number: 4, title: 'feat(adapter): normalization seam', mergedAt: '2026-06-04' }, // singleton scope → other
  { number: 5, title: 'feat: scope-less feature', mergedAt: '2026-06-05' },          // no scope → other
  { number: 6, title: 'docs: readme polish', mergedAt: '2026-06-06' },               // not substantive → skipped
  { number: 7, title: 'ci: bump action', mergedAt: '2026-06-07' },                   // not substantive → skipped
];

suite('roadmap/tracker manifest-generator', () => {
  test('parseConventional extracts type + scope + subject (and degrades)', () => {
    assert.deepEqual(parseConventional('feat(connectors): add GitHub'), { type: 'feat', scope: 'connectors', subject: 'add GitHub' });
    assert.deepEqual(parseConventional('fix: a bug'), { type: 'fix', scope: undefined, subject: 'a bug' });
    assert.deepEqual(parseConventional('no convention here'), { type: 'other', subject: 'no convention here' });
  });

  test('programs come from scopes with >=2 substantive PRs; singletons + scope-less fold to "Other"', () => {
    const programs = programsFromPrs(PRS);
    const keys = programs.map((p) => p.key);
    assert.ok(keys.includes('connectors'), 'connectors (2 PRs) is a program');
    assert.ok(!keys.includes('runtime'), 'runtime (1 PR) folds');
    assert.ok(!keys.includes('adapter'), 'adapter (1 PR) folds');
    assert.ok(!keys.includes('feat'), 'a bare commit TYPE is never a program');
    assert.ok(keys.includes('other'), 'singletons + scope-less collected under Other');
    assert.ok(programs.every((p) => /^#[0-9a-f]{6}$/i.test(p.accent)), 'every program has a hex accent');
  });

  test('phases: one per substantive PR (docs/ci skipped), mapped to a known program or Other, anchored to pr-<N>', () => {
    const programs = programsFromPrs(PRS);
    const phases = phasesFromPrs(PRS, programs);
    assert.equal(phases.length, 5, 'PR 6 (docs) + 7 (ci) are not substantive');
    const p1 = phases.find((p) => p.rc === 'pr-1')!;
    assert.equal(p1.prog, 'connectors');
    assert.equal(p1.title, 'GitHub connector', 'title is the subject (prefix stripped)');
    const singleton = phases.find((p) => p.rc === 'pr-3')!; // runtime (1) → other
    assert.equal(singleton.prog, 'other');
    assert.ok(phases.every((p) => p.w >= 1), 'weights are positive integers');
  });

  test('verticals come from the latest CHANGELOG section bullets (bold lead names them)', () => {
    const cl = '# Changelog\n\n## Unreleased\n\n- **Adapter core**: normalization seam and screen.\n- **Connectors**: GitHub, Linear, Sentry.\n\n## [1.0.0]\n- old stuff\n';
    const v = verticalsFromChangelog(cl, []);
    assert.equal(v.length, 2, 'only the latest section, two bullets');
    assert.equal(v[0].name, 'Adapter core');
    assert.equal(v[1].name, 'Connectors');
    assert.ok(v[0].key === 'adapter-core', 'key is slugified from the name');
  });

  test('generateTrackerManifest assembles a complete, schema-shaped draft', () => {
    const cl = '## Unreleased\n\n- **Connectors** (ADR-0008): read-only sources.\n';
    const m = generateTrackerManifest({ repo: 'acme/widgets', prs: PRS, changelog: cl });
    assert.equal(m.repo, 'acme/widgets');
    assert.ok(m.programs!.length >= 2);
    assert.ok(m.phases!.length === 5);
    assert.ok(m.verticals!.length === 1);
    assert.equal(m.meta!.metaRow!.find((r) => r.label === 'Merged PRs')!.value, '7');
    assert.ok(m.meta!.decisions!.some((d) => d.decision.startsWith('ADR-0008')), 'ADR decision captured cleanly');
    assert.ok(m.meta!.title && m.meta!.footer, 'meta is populated');
  });
});
