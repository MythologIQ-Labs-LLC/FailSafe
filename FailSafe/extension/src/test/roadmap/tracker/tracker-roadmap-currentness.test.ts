/** Validate the real, checked-in tracker manifest against the release record.
 * A forecast must never silently survive after its release is documented.
 * Future objectives are deliberately NOT scored by historical phase weights.
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { resolveTestRepoPath } from './test-repo-root';
import {
  buildTrackerModel, discoverReleases, validateManifest, type TrackerManifest,
} from '../../../roadmap/tracker/tracker-model';

suite('FailSafe live roadmap manifest (v6.1.0 #679)', () => {
  test('declared forecasts cannot contradict the shipped CHANGELOG', () => {
    const manifestPath = resolveTestRepoPath('docs', 'roadmap', 'programs.yaml');
    const logPath = resolveTestRepoPath('CHANGELOG.md');
    const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8')) as TrackerManifest;
    const discovered = discoverReleases(fs.readFileSync(logPath, 'utf8'));
    const shipped = new Set(discovered.map((r) => r.id));
    const latest = discovered[discovered.length - 1];
    assert.ok(latest, 'CHANGELOG must contain an actual release');

    const declared = manifest.rcs ?? [];
    const forecasts = declared.filter((rc) => rc.state === 'forecast');
    assert.ok(forecasts.length > 0, 'at least one forward release target is needed');
    for (const forecast of forecasts) {
      assert.ok(!shipped.has(forecast.id),
        `already-shipped ${forecast.id} must not remain declared forecast`);
      assert.ok(forecast.summary && forecast.ref,
        `future ${forecast.id} needs a truthful scope summary and evidence link`);
    }

    const currentLabel = manifest.meta?.metaRow?.find((r) => r.label === 'Released')?.value;
    assert.equal(currentLabel, latest.id,
      'the static masthead must agree with latest documented release');
    const upcoming = manifest.meta?.metaRow?.find((r) => r.label === 'In-flight')?.value ?? '';
    assert.ok(forecasts.some((r) => upcoming.includes(r.id)),
      'in-flight masthead must refer to a declared future release');

    const axis = buildTrackerModel(manifest, { discoveredReleases: discovered });
    for (const rc of discovered) {
      assert.equal(axis.rcs.find((x) => x.id === rc.id)?.state, 'prod',
        `documented release ${rc.id} must not render forecast`);
    }
    assert.deepEqual(
      validateManifest(manifest, axis.rcs.map((rc) => rc.id)).filter((x) => x.severity === 'abort'),
      [], 'roadmap must have no dangling phase/release/program references',
    );
  });

  test('unqualified v6.1.0 agentic goals remain visible but unscored', () => {
    const raw = fs.readFileSync(resolveTestRepoPath('docs', 'roadmap', 'programs.yaml'), 'utf8');
    const manifest = yaml.load(raw) as TrackerManifest;
    const roadmap = manifest.rcs?.find((r) => r.id === 'v6.1.0');
    assert.ok(roadmap, 'owner-selected v6.1.0 roadmap anchor must exist');
    assert.equal(roadmap.state, 'forecast', 'v6.1.0 has not shipped');
    assert.match(roadmap.summary ?? '', /agentic|Qortara Logic/i);
    assert.equal(roadmap.ref,
      'https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/679');

    const logText = fs.readFileSync(resolveTestRepoPath('CHANGELOG.md'), 'utf8');
    const rendered = buildTrackerModel(manifest, {
      discoveredReleases: discoverReleases(logText),
      now: new Date('2026-11-13T15:00:00Z'),
    });
    assert.equal(rendered.rcs.find((r) => r.id === 'v6.1.0')?.progressEligible, false,
      'planned v6.1.0 must show no weighted progress snapshot');

    const unverified = new Set((manifest.rcs ?? [])
      .filter((r) => r.state === 'forecast').map((r) => r.id));
    assert.ok(!(manifest.phases ?? []).some((p) => unverified.has(p.rc)),
      'historical-only weights must not award future agentic work completion');
    for (const program of manifest.programs ?? []) {
      const total = (manifest.phases ?? [])
        .filter((ph) => ph.prog === program.key).reduce((n, ph) => n + ph.w, 0);
      assert.equal(total, 100, `historical ${program.key} weighting must be preserved`);
    }

    const decisions = manifest.meta?.decisions ?? [];
    assert.ok(decisions.some((d) => d.evidence.includes('#668')),
      'Qor skill retirement gate must stay tied to owner decision #668');
    assert.ok(decisions.some((d) => d.evidence.includes('#679')),
      'agentic v6.1.0 scope must stay tied to the owner release charter');
  });
});
