// Functional tests for the GovernanceProjection reader (A.1, tracker-as-sidecar).
// Pure: governance docs (META_LEDGER + FEATURE_INDEX) → TrackerManifest. The
// governed-repo authoritative source; FX857 generator stays the ungoverned
// fallback. Backend logic (no visual surface) — render is covered elsewhere.

import { strict as assert } from 'assert';
import {
  parseLedgerEntries, parseFeatureIndex, projectTrackerManifest,
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
    assert.ok(m.meta, 'meta always present');
  });
});
