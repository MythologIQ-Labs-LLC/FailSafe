import { strict as assert } from 'assert';
import { buildTrackerModel, validateManifest, discoverReleases, isProgramEligible, type TrackerManifest, type TrackerRc } from '../../../roadmap/tracker/tracker-model';

const MANIFEST: TrackerManifest = {
  repo: 'acme/widget',
  meta: { title: 'X', footer: 'f' },
  rcs: [
    { id: 'v1.0', state: 'forecast', tag: 'planned' },
    { id: 'v1.1', state: 'forecast', tag: 'planned' },
  ],
  programs: [{ key: 'core', name: 'Core', accent: '#0f0' }],
  phases: [
    { prog: 'core', key: 'A', rc: 'v1.0', w: 60, title: 'A' },
    { prog: 'core', key: 'B', rc: 'v1.1', w: 40, title: 'B' },
  ],
  verticals: [{ key: 'core', name: 'Core', accent: '#0f0' }],
};

suite('tracker-model (B-INT-17)', () => {
  test('buildTrackerModel overlays shipped releases → prod, leaves others declared', () => {
    const model = buildTrackerModel(MANIFEST, { shippedReleaseIds: ['v1.0'] });
    assert.equal(model.rcs.find((r) => r.id === 'v1.0')!.state, 'prod', 'shipped → prod');
    assert.equal(model.rcs.find((r) => r.id === 'v1.1')!.state, 'forecast', 'unshipped stays declared');
  });

  test('buildTrackerModel with no live data leaves declared states intact', () => {
    const model = buildTrackerModel(MANIFEST);
    assert.deepEqual(model.rcs.map((r) => r.state), ['forecast', 'forecast']);
  });

  test('buildTrackerModel fills empty arrays + omits absent optional sections', () => {
    const model = buildTrackerModel({ repo: 'a/b' });
    assert.deepEqual(model.rcs, []);
    assert.deepEqual(model.programs, []);
    assert.equal('convergence' in model, false);
    assert.equal('promotion' in model, false);
  });

  test('validateManifest: clean weighted model → no findings', () => {
    assert.deepEqual(validateManifest(MANIFEST), []);
  });

  test('validateManifest: dangling rc reference → abort', () => {
    const bad = { ...MANIFEST, phases: [{ prog: 'core', key: 'A', rc: 'v9.9', w: 100, title: 'A' }] };
    const lint = validateManifest(bad);
    assert.ok(lint.some((f) => f.severity === 'abort' && f.code === 'phase-unknown-rc'));
  });

  test('validateManifest: unanchored phase (rc="") → warn not abort (A.2b #202)', () => {
    const unanchored = { ...MANIFEST, phases: [{ prog: 'core', key: 'A', rc: '', w: 100, title: 'A' }] };
    const lint = validateManifest(unanchored);
    assert.ok(lint.some((f) => f.severity === 'warn' && f.code === 'phase-unanchored'), 'empty rc → phase-unanchored warn');
    assert.ok(!lint.some((f) => f.severity === 'abort'), 'unanchored is never an abort');
  });

  test('validateManifest: phase referencing an undeclared program → abort', () => {
    const bad = { ...MANIFEST, phases: [{ prog: 'ghost', key: 'A', rc: 'v1.0', w: 100, title: 'A' }] };
    assert.ok(validateManifest(bad).some((f) => f.severity === 'abort' && f.code === 'phase-unknown-program'));
  });

  test('validateManifest: program weights not summing to 100 → warn (non-fatal)', () => {
    const bad = { ...MANIFEST, phases: [{ prog: 'core', key: 'A', rc: 'v1.0', w: 70, title: 'A' }] };
    const lint = validateManifest(bad);
    assert.ok(lint.some((f) => f.severity === 'warn' && f.code === 'program-weight-sum'));
    assert.ok(!lint.some((f) => f.severity === 'abort'), 'weight mismatch is warn, not abort');
  });

  // --- release-axis discovery from the CHANGELOG (complete history) ---

  const CHANGELOG = [
    '# Changelog', '',
    '## [5.4.2] - 2026-06-03', 'recent', '',
    '## [1.0.0] - 2026-01-22', 'first stable', '',
    '## [0.1.0] - 2026-01-22', 'genesis', '',
  ].join('\n');

  test('discoverReleases parses CHANGELOG headers into prod releases, sorted oldest→newest', () => {
    const rels = discoverReleases(CHANGELOG);
    assert.deepEqual(rels.map((r) => r.id), ['v0.1.0', 'v1.0.0', 'v5.4.2']);
    assert.ok(rels.every((r) => r.state === 'prod'), 'discovered releases are shipped → prod');
    assert.equal(rels[0].note, '2026-01-22', 'date captured as note');
  });

  test('discoverReleases dedupes + ignores non-version headings', () => {
    const rels = discoverReleases('## [1.0.0] - 2026-01-22\n## [1.0.0] - 2026-01-22\n## Unreleased\n');
    assert.deepEqual(rels.map((r) => r.id), ['v1.0.0']);
  });

  test('buildTrackerModel: discovered axis (prod, ascending) + manifest forecasts appended', () => {
    const manifest: TrackerManifest = {
      programs: [{ key: 'core', name: 'Core', accent: '#0f0' }],
      rcs: [{ id: 'v6.0', state: 'forecast', tag: 'planned' }],
      phases: [{ prog: 'core', key: 'A', rc: 'v5.4.2', w: 100, title: 'A' }],
    };
    const model = buildTrackerModel(manifest, { discoveredReleases: discoverReleases(CHANGELOG) });
    assert.deepEqual(model.rcs.map((r) => r.id), ['v0.1.0', 'v1.0.0', 'v5.4.2', 'v6.0']);
    assert.equal(model.rcs.find((r) => r.id === 'v6.0')!.state, 'forecast', 'forecast stays forecast');
    assert.equal(model.rcs.find((r) => r.id === 'v5.4.2')!.state, 'prod');
  });

  test('buildTrackerModel attaches traceability refs: tagged → release/tag, changelog-only → CHANGELOG, forecast → none', () => {
    const manifest: TrackerManifest = {
      repo: 'acme/widget',
      programs: [{ key: 'core', name: 'Core', accent: '#0f0' }],
      rcs: [{ id: 'v9.0', state: 'forecast', tag: 'planned' }],
      phases: [{ prog: 'core', key: 'A', rc: 'v1.0.0', w: 100, title: 'A' }],
    };
    const model = buildTrackerModel(manifest, {
      discoveredReleases: discoverReleases(CHANGELOG),
      shippedReleaseIds: ['v5.4.2'], // tagged
    });
    const by = Object.fromEntries(model.rcs.map((r) => [r.id, r]));
    assert.equal(by['v5.4.2'].ref, 'https://github.com/acme/widget/releases/tag/v5.4.2', 'tagged → release/tag');
    assert.equal(by['v1.0.0'].ref, 'https://github.com/acme/widget/blob/main/CHANGELOG.md', 'changelog-only → CHANGELOG');
    assert.equal(by['v9.0'].ref, undefined, 'forecast → no ref');
  });

  // --- Option A: per-release summary capture ---

  test('discoverReleases captures the entry summary (what shipped), skipping ### sub-headers', () => {
    const cl = [
      '## [2.0.0] - 2026-03-01',
      '### Added',
      '- Big new thing',
      '- Another thing',
      '',
      'tail ignored',
      '## [1.0.0] - 2026-01-01',
      'Just a paragraph.',
    ].join('\n');
    const rels = discoverReleases(cl);
    const by = Object.fromEntries(rels.map((r) => [r.id, r]));
    assert.match(by['v2.0.0'].summary || '', /Big new thing/);
    assert.equal(by['v2.0.0'].summary?.includes('Added'), false, '### Added sub-header skipped');
    assert.match(by['v1.0.0'].summary || '', /Just a paragraph/);
  });

  // --- tiered program-progress eligibility ---

  const NOW = new Date('2026-06-03T00:00:00Z');
  const rc = (id: string, note?: string, state: TrackerRc['state'] = 'prod'): TrackerRc => ({ id, state, note });

  test('isProgramEligible: majors are always eligible (full history)', () => {
    assert.equal(isProgramEligible(rc('v3.0.0', '2025-01-01'), { now: NOW, minorDays: 60, patchDays: 30 }), true);
  });

  test('isProgramEligible: minors eligible within window, not beyond', () => {
    assert.equal(isProgramEligible(rc('v5.4.0', '2026-05-20'), { now: NOW, minorDays: 60, patchDays: 30 }), true, 'recent minor');
    assert.equal(isProgramEligible(rc('v5.1.0', '2026-01-01'), { now: NOW, minorDays: 60, patchDays: 30 }), false, 'old minor (>60d)');
  });

  test('isProgramEligible: patches use the tighter window', () => {
    assert.equal(isProgramEligible(rc('v5.4.2', '2026-05-25'), { now: NOW, minorDays: 60, patchDays: 30 }), true, 'recent patch');
    assert.equal(isProgramEligible(rc('v5.4.1', '2026-04-15'), { now: NOW, minorDays: 60, patchDays: 30 }), false, 'patch >30d');
  });

  test('isProgramEligible: forecast / undated → eligible (shown)', () => {
    assert.equal(isProgramEligible(rc('v6.0.0', undefined, 'forecast'), { now: NOW, minorDays: 60, patchDays: 30 }), true);
    assert.equal(isProgramEligible(rc('v5.9.9', undefined), { now: NOW, minorDays: 60, patchDays: 30 }), true, 'undated → shown');
  });

  test('buildTrackerModel attaches progressEligible only when now is supplied', () => {
    const manifest: TrackerManifest = { programs: [{ key: 'c', name: 'C', accent: '#0f0' }], rcs: [] };
    const disc = discoverReleases('## [3.0.0] - 2026-05-01\nx\n## [3.1.0] - 2026-01-01\ny\n');
    const withNow = buildTrackerModel(manifest, { discoveredReleases: disc, now: NOW, minorDays: 60, patchDays: 30 });
    assert.equal(withNow.rcs.find((r) => r.id === 'v3.0.0')!.progressEligible, true, 'major eligible');
    assert.equal(withNow.rcs.find((r) => r.id === 'v3.1.0')!.progressEligible, false, 'old minor not eligible');
    const noNow = buildTrackerModel(manifest, { discoveredReleases: disc });
    assert.equal(noNow.rcs[0].progressEligible, undefined, 'no now → undefined (treated eligible by UI)');
  });

  test('validateManifest with resolved axis: a phase targeting a DISCOVERED release passes', () => {
    const manifest: TrackerManifest = {
      programs: [{ key: 'core', name: 'Core', accent: '#0f0' }],
      rcs: [],
      phases: [{ prog: 'core', key: 'A', rc: 'v5.4.2', w: 100, title: 'A' }],
    };
    // Without the resolved axis it would be flagged; with it, v5.4.2 is known.
    assert.ok(validateManifest(manifest).some((f) => f.code === 'phase-unknown-rc'));
    assert.ok(!validateManifest(manifest, ['v5.4.2']).some((f) => f.code === 'phase-unknown-rc'));
  });
});
