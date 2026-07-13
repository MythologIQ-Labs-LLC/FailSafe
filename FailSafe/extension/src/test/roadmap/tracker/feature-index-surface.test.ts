// FX871 — data-completeness gate for the FEATURE_INDEX Surface backfill (#206).
// Reads the REAL docs/FEATURE_INDEX.md and asserts every FX row carries a legal
// Surface tag, parsed by the same unit the tracker uses (parseFeatureIndex). If a
// future row is added without a Surface cell, this test fails — keeping the
// governed surface->feature mapping complete by construction.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import { parseFeatureIndex } from '../../../roadmap/tracker/tracker-parsers';
import { resolveTestRepoPath } from './test-repo-root';

const ALLOWED = new Set(['monitor', 'learn', 'agents', 'governance', 'workspace', 'integrations', 'config', 'platform']);

suite('FEATURE_INDEX Surface backfill completeness (FX871, #206)', () => {
  test('every FX row carries a legal Surface tag (0 null / 0 illegal)', () => {
    const text = fs.readFileSync(resolveTestRepoPath('docs', 'FEATURE_INDEX.md'), 'utf-8');
    const rows = parseFeatureIndex(text);
    assert.ok(rows.length > 600, `expected the full FX inventory, got ${rows.length}`);
    const untagged = rows.filter((r) => r.surface === null).map((r) => r.id);
    assert.deepEqual(untagged, [], `rows missing a Surface tag: ${untagged.join(', ')}`);
    const illegal = rows.filter((r) => r.surface !== null && !ALLOWED.has(r.surface!)).map((r) => `${r.id}:${r.surface}`);
    assert.deepEqual(illegal, [], `rows with an illegal Surface value: ${illegal.join(', ')}`);
    // All 7 user-facing surfaces are represented (not just platform) — proves the
    // backfill attributes real per-surface evidence, not a single catch-all bucket.
    const seen = new Set(rows.map((r) => r.surface));
    for (const s of ['monitor', 'learn', 'agents', 'governance', 'workspace', 'integrations', 'config']) {
      assert.ok(seen.has(s), `no FX row attributed to the '${s}' surface`);
    }
  });
});
