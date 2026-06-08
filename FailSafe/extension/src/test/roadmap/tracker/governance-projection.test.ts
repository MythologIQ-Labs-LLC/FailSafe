// Functional tests for the GovernanceProjection reader (A.1, tracker-as-sidecar).
// Pure: governance docs (META_LEDGER + FEATURE_INDEX) → TrackerManifest. The
// governed-repo authoritative source; FX857 generator stays the ungoverned
// fallback. Backend logic (no visual surface) — render is covered elsewhere.

import { strict as assert } from 'assert';
import {
  parseLedgerEntries, parseFeatureIndex, projectTrackerManifest, parsePlans,
} from '../../../roadmap/tracker/governance-projection';

const LEDGER = `# META LEDGER

### Entry #424: DELIVER - v5.6.1 (Development Tracker for any repo)

**Date**: 2026-06-05
**Phase**: DELIVER
**Version**: 5.6.1
**Tag**: v5.6.1

## Decision

Release v5.6.1 delivered and published to both marketplaces.

## Content Hash

**Content Hash**: \`aaa\`

---

### Entry #425: SUBSTANTIATE - Tracker loading/freshness (#163)

**Date**: 2026-06-06
**Phase**: SUBSTANTIATE

## Decision

Reality=Promise PASS for the tracker loading + freshness work.

## Content Hash

**Content Hash**: \`bbb\`

---

### Entry #426: DELIVER - v5.6.2 (Tracker loading/freshness)

**Date**: 2026-06-06
**Phase**: DELIVER
**Version**: 5.6.2
**Tag**: v5.6.2

## Decision

Release v5.6.2 delivered.

## Content Hash

**Content Hash**: \`ccc\`
`;

const FEATURE_INDEX = `# Feature Index

| ID | Feature | Doc | Code | Test | Status | Notes |
|---|---|---|---|---|---|---|
| FX860 | Tracker loading/freshness | docs/x.md | roadmap/ui/tracker/tracker-dashboard.html (loadTracker) | test/ui/a.spec.ts | verified | loading skeleton |
| FX859 | Operator categorization | docs/x.md | roadmap/tracker/manifest-categorize.ts | test/b.ts | verified | keep/drop/rename |
| FX861 | PR linkage auditor | docs/y.md | integrations/github-checks/pr-linkage-audit.ts | test/c.ts | verified | closes-keyword footgun |
| FX001 | failsafe.openSidebar | F001 | C001 | test/legacy.ts | verified | legacy component-ID Code column |
`;

suite('roadmap/tracker governance-projection (A.1 — tracker sidecar)', () => {
  test('parseLedgerEntries: extracts n / phase / version / tag / decision per entry', () => {
    const entries = parseLedgerEntries(LEDGER);
    assert.equal(entries.length, 3);
    const e424 = entries.find((e) => e.n === 424)!;
    assert.equal(e424.phase, 'DELIVER');
    assert.equal(e424.version, '5.6.1');
    assert.equal(e424.tag, 'v5.6.1');
    assert.ok(/delivered/i.test(e424.decision || ''));
    const e425 = entries.find((e) => e.n === 425)!;
    assert.equal(e425.phase, 'SUBSTANTIATE');
    assert.equal(e425.version, undefined, 'non-DELIVER has no version');
  });

  test('rcs: built from DELIVER entries only, newest→state prod, id from tag', () => {
    const m = projectTrackerManifest({ metaLedger: LEDGER, featureIndex: '' });
    const ids = (m.rcs || []).map((r) => r.id);
    assert.deepEqual(ids.sort(), ['v5.6.1', 'v5.6.2']);
    assert.ok((m.rcs || []).every((r) => r.state === 'prod'));
    assert.ok((m.rcs || []).find((r) => r.id === 'v5.6.2')!.summary!.length > 0);
  });

  test('meta.decisions: one per ledger entry that carries a Decision, with phase + Entry evidence', () => {
    const m = projectTrackerManifest({ metaLedger: LEDGER, featureIndex: '' });
    const d = m.meta!.decisions!;
    assert.ok(d.length >= 3);
    const sub = d.find((x) => /loading/i.test(x.decision));
    assert.ok(sub, 'substantiate decision surfaced');
    assert.equal(sub!.drivenBy, 'SUBSTANTIATE');
    assert.ok(/Entry #425/.test(sub!.evidence));
  });

  test('parseFeatureIndex: parses the FX table rows (id / feature / code / status)', () => {
    const rows = parseFeatureIndex(FEATURE_INDEX);
    assert.equal(rows.length, 4, 'all FX rows parsed (incl. the legacy one)');
    assert.equal(rows[0].id, 'FX860');
    assert.ok(/tracker-dashboard\.html/.test(rows[0].code));
    assert.equal(rows[0].status, 'verified');
  });

  test('verticals: path-coded FX rows grouped by top-level area; legacy rows skipped', () => {
    const m = projectTrackerManifest({ metaLedger: '', featureIndex: FEATURE_INDEX });
    const v = m.verticals || [];
    // top-level areas: roadmap (×2 rows) + integrations (×1) → 2 verticals;
    // the legacy FX001 (Code = "C001", no path) is NOT a vertical.
    assert.equal(v.length, 2);
    assert.ok(!v.some((x) => x.key === 'C001'), 'legacy component-ID not a vertical');
    const integrations = v.find((x) => x.key === 'integrations')!;
    assert.ok(integrations, 'integrations vertical');
    assert.ok(integrations.functionality!.some((f) => /PR linkage/i.test(f)));
    assert.ok(integrations.backend!.some((b) => /pr-linkage-audit\.ts/.test(b)));
    const roadmap = v.find((x) => x.key === 'roadmap')!;
    assert.ok(roadmap, 'roadmap vertical groups both roadmap rows');
    assert.equal(roadmap.functionality!.length, 2);
  });

  test('degrade-safe: empty inputs → a valid (empty) manifest, no throw', () => {
    const m = projectTrackerManifest({ metaLedger: '', featureIndex: '' });
    assert.deepEqual(m.rcs, []);
    assert.deepEqual(m.verticals, []);
    assert.deepEqual(m.programs, []);
    assert.deepEqual(m.phases, []);
    assert.ok(m.meta, 'meta always present');
  });

  // --- A.1b (#195): plans → programs/phases ---

  test('parsePlans: extracts slug / title / theme / target version', () => {
    const docs = parsePlans([
      { slug: 'plan-qor-stale-cache.md', content: '# Plan: Stale Cache Remediation\n\n**Target Version**: v5.1.0\n' },
      { slug: 'plan-v5-round2-install-ux.md', content: '# Plan: v5 Install UX\n' },
    ]);
    assert.equal(docs[0].slug, 'qor-stale-cache');
    assert.equal(docs[0].title, 'Stale Cache Remediation');
    assert.equal(docs[0].theme, 'qor');
    assert.equal(docs[0].targetVersion, 'v5.1.0');
    assert.equal(docs[1].theme, 'v5', 'versioned prefix collapses to the major family');
    assert.equal(docs[1].targetVersion, undefined);
  });

  test('programs: theme buckets at >=2 plans, singletons fold to Other; phases: one per plan', () => {
    const plans = [
      { slug: 'plan-qor-a.md', content: '# Plan: Qor A\n' },
      { slug: 'plan-qor-b.md', content: '# Plan: Qor B\n' },
      { slug: 'plan-v5-a.md', content: '# Plan: V5 A\n' },
      { slug: 'plan-v5-b.md', content: '# Plan: V5 B\n' },
      { slug: 'plan-monitor-x.md', content: '# Plan: Monitor X\n' }, // singleton -> Other
    ];
    const m = projectTrackerManifest({ metaLedger: '', featureIndex: '', plans });
    const keys = m.programs!.map((p) => p.key).sort();
    assert.deepEqual(keys, ['other', 'qor', 'v5']);
    assert.equal(m.phases!.length, 5, 'one phase per plan');
    assert.equal(m.phases!.find((ph) => ph.key === 'monitor-x')!.prog, 'other', 'singleton -> Other program');
    assert.ok(m.phases!.every((ph) => ph.w >= 1), 'even integer weights');
  });

  test('A.2b: plan phases anchor to Target Version only when it is a known release', () => {
    const plans = [
      { slug: 'plan-qor-a.md', content: '# Plan: Qor A\n\n**Target Version**: v5.6.1\n' }, // real release
      { slug: 'plan-qor-b.md', content: '# Plan: Qor B\n\n**Target Version**: v4.9.3\n' }, // never shipped
      { slug: 'plan-qor-c.md', content: '# Plan: Qor C\n' },                               // no version
    ];
    const m = projectTrackerManifest({ metaLedger: '', featureIndex: '', plans, knownReleaseIds: ['v5.6.1', 'v5.6.2'] });
    const byKey = (k: string) => m.phases!.find((p) => p.key === k)!;
    assert.equal(byKey('qor-a').rc, 'v5.6.1', 'known release → anchored');
    assert.equal(byKey('qor-b').rc, '', 'unknown release (v4.9.3) → unanchored, not a dangling rc');
    assert.equal(byKey('qor-c').rc, '', 'no version → unanchored');
  });

  test('A.2b: without knownReleaseIds, every plan phase is unanchored', () => {
    const plans = [{ slug: 'plan-qor-a.md', content: '# Plan: Qor A\n\n**Target Version**: v5.6.1\n' }];
    const m = projectTrackerManifest({ metaLedger: '', featureIndex: '', plans });
    assert.equal(m.phases![0].rc, '', 'no axis supplied → unanchored');
  });

  test('#198: non-capability areas (test/.github) skipped; FailSafe/extension/src prefix normalized', () => {
    const fi = [
      '| ID | Feature | Doc | Code | Test | Status | Notes |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| FX1 | A | d | src/integrations/x.ts | t | verified | - |',
      '| FX2 | B | d | src/test/y.test.ts | t | verified | - |',          // test area -> skipped
      '| FX3 | C | d | .github/workflows/z.yml | t | verified | - |',     // .github -> skipped
      '| FX4 | D | d | FailSafe/extension/src/roadmap/w.ts | t | verified | - |', // prefix -> roadmap
    ].join('\n');
    const m = projectTrackerManifest({ metaLedger: '', featureIndex: fi });
    const keys = m.verticals!.map((v) => v.key).sort();
    assert.deepEqual(keys, ['integrations', 'roadmap'], 'test + .github dropped; FailSafe-prefixed row -> roadmap');
  });
});
