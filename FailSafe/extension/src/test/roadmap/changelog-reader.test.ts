import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ChangelogReader,
  parseReleasesFromText,
} from '../../roadmap/services/ChangelogReader';

let tmpRoot: string;

const SAMPLE = `# Changelog

## [5.0.0] - 2026-04-25

Major release with qor-logic ingestion.

### Added

- New skill installer

## [4.9.9] - 2026-03-17

### Fixed

- Install Skills button works

## [4.9.8] - 2026-03-17

### Fixed

- Error budget excludes resolved verdicts.
`;

suite('ChangelogReader: parseReleasesFromText', () => {
  test('extracts version + date + first non-empty line preview', () => {
    const releases = parseReleasesFromText(SAMPLE, 10);
    assert.equal(releases.length, 3);
    assert.equal(releases[0].version, '5.0.0');
    assert.equal(releases[0].date, '2026-04-25');
    assert.match(releases[0].sectionPreview, /Major release/);
  });

  test('respects limit parameter', () => {
    const releases = parseReleasesFromText(SAMPLE, 2);
    assert.equal(releases.length, 2);
    assert.equal(releases[0].version, '5.0.0');
    assert.equal(releases[1].version, '4.9.9');
  });

  test('default limit when not specified is 5', () => {
    const releases = parseReleasesFromText(SAMPLE);
    // Only 3 in fixture, so all returned.
    assert.equal(releases.length, 3);
  });

  test('caps preview at 120 chars', () => {
    const longPreview = `## [9.9.9] - 2026-01-01\n\n${'x'.repeat(200)}\n`;
    const releases = parseReleasesFromText(longPreview);
    assert.ok(releases[0].sectionPreview.length <= 120);
  });

  test('returns empty for content with no version headings', () => {
    assert.deepEqual(parseReleasesFromText('# Just a title'), []);
  });
});

suite('ChangelogReader: recentReleases', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-reader-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('returns [] when CHANGELOG.md absent', () => {
    const reader = new ChangelogReader(tmpRoot);
    assert.deepEqual(reader.recentReleases(5), []);
  });

  test('reads and parses CHANGELOG.md from workspace root', () => {
    fs.writeFileSync(path.join(tmpRoot, 'CHANGELOG.md'), SAMPLE);
    const reader = new ChangelogReader(tmpRoot);
    const releases = reader.recentReleases(5);
    assert.equal(releases.length, 3);
    assert.equal(releases[0].version, '5.0.0');
  });
});
