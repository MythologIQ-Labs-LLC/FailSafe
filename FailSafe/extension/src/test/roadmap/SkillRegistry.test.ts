// Functional tests for SkillRegistry pure-logic exports (FX375).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getSkillRegistryDir,
  getLegacySkillRegistryPath,
  getAppSkillManifestPath,
  getPersonalSkillManifestPath,
  readRegistryEntries,
  getApprovedSkillFileSet,
  sanitizeRelativePath,
} from '../../roadmap/services/SkillRegistry';

function tmpWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sr-'));
}

suite('SkillRegistry (FX375)', () => {
  let ws: string;
  setup(() => { ws = tmpWs(); });
  teardown(() => { fs.rmSync(ws, { recursive: true, force: true }); });

  test('FX375 path helpers — derive correct subpaths from workspace root', () => {
    assert.equal(getSkillRegistryDir(ws), path.join(ws, '.failsafe', 'skill-registry'));
    assert.equal(getLegacySkillRegistryPath(ws), path.join(ws, '.failsafe', 'skill-registry', 'registry.json'));
    assert.equal(getAppSkillManifestPath(ws), path.join(ws, '.failsafe', 'skill-registry', 'app-manifest.json'));
    assert.equal(getPersonalSkillManifestPath(ws), path.join(ws, '.failsafe', 'skill-registry', 'personal-manifest.json'));
  });

  test('FX375 readRegistryEntries — missing files produce empty array', () => {
    assert.deepEqual(readRegistryEntries([path.join(ws, 'absent.json')]), []);
  });

  test('FX375 readRegistryEntries — empty file produces empty array', () => {
    const file = path.join(ws, 'empty.json');
    fs.writeFileSync(file, '');
    assert.deepEqual(readRegistryEntries([file]), []);
  });

  test('FX375 readRegistryEntries — single entry as object → wrapped to array', () => {
    const file = path.join(ws, 'single.json');
    fs.writeFileSync(file, JSON.stringify({ id: 'x', skillName: 'test' }));
    const entries = readRegistryEntries([file]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'x');
  });

  test('FX375 readRegistryEntries — array of entries returned as-is', () => {
    const file = path.join(ws, 'multi.json');
    fs.writeFileSync(file, JSON.stringify([{ id: 'a' }, { id: 'b' }]));
    const entries = readRegistryEntries([file]);
    assert.equal(entries.length, 2);
  });

  test('FX375 readRegistryEntries — invalid JSON skipped silently', () => {
    const f1 = path.join(ws, 'bad.json');
    const f2 = path.join(ws, 'good.json');
    fs.writeFileSync(f1, '{not-json');
    fs.writeFileSync(f2, JSON.stringify([{ id: 'g' }]));
    const entries = readRegistryEntries([f1, f2]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'g');
  });

  test('FX375 readRegistryEntries — concatenates entries from multiple files', () => {
    const f1 = path.join(ws, '1.json');
    const f2 = path.join(ws, '2.json');
    fs.writeFileSync(f1, JSON.stringify([{ id: 'a' }]));
    fs.writeFileSync(f2, JSON.stringify([{ id: 'b' }, { id: 'c' }]));
    const entries = readRegistryEntries([f1, f2]);
    assert.equal(entries.length, 3);
  });

  test('FX375 sanitizeRelativePath — removes drive letter prefix', () => {
    const result = sanitizeRelativePath('C:\\foo\\bar.ts');
    assert.match(result, /foo[\\/]bar\.ts$/);
  });

  test('FX375 sanitizeRelativePath — normalizes backslashes to forward slashes', () => {
    const result = sanitizeRelativePath('a\\b\\c');
    assert.match(result, /a[\\/]b[\\/]c$/);
  });

  test('FX375 sanitizeRelativePath — strips . and .. segments', () => {
    const result = sanitizeRelativePath('a/./b/../c');
    // . and .. removed; result is `a${sep}b${sep}c` (no traversal allowed)
    assert.match(result, /^a[\\/]b[\\/]c$/);
  });

  test('FX375 sanitizeRelativePath — empty/whitespace segments dropped', () => {
    const result = sanitizeRelativePath('   /   /a/   ');
    assert.match(result, /^a$/);
  });

  test('FX375 getApprovedSkillFileSet — empty workspace returns empty set', () => {
    const set = getApprovedSkillFileSet(ws, []);
    assert.equal(set.size, 0);
  });

  test('FX375 getApprovedSkillFileSet — verified+allowed entry from manifest is approved', () => {
    fs.mkdirSync(path.join(ws, '.failsafe', 'skill-registry'), { recursive: true });
    fs.mkdirSync(path.join(ws, 'skills', 'foo'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'skills', 'foo', 'SKILL.md'), '---\nname: foo\n---\n');
    fs.writeFileSync(getPersonalSkillManifestPath(ws), JSON.stringify([{
      skillName: 'foo', skillPath: 'skills/foo/SKILL.md',
      timestamp: '2026-05-07T00:00:00Z',
      trustTier: 'verified', runtimeEligibility: 'allowed',
    }]));
    const set = getApprovedSkillFileSet(ws, []);
    assert.equal(set.size, 1);
  });

  test('FX375 getApprovedSkillFileSet — quarantined or denied entry excluded', () => {
    fs.mkdirSync(path.join(ws, '.failsafe', 'skill-registry'), { recursive: true });
    fs.writeFileSync(getPersonalSkillManifestPath(ws), JSON.stringify([
      { skillName: 'a', skillPath: 'skills/a/SKILL.md', timestamp: '2026-05-07T00:00:00Z', trustTier: 'verified', runtimeEligibility: 'allowed' },
      { skillName: 'b', skillPath: 'skills/b/SKILL.md', timestamp: '2026-05-07T00:00:00Z', trustTier: 'quarantined', runtimeEligibility: 'allowed' },
      { skillName: 'c', skillPath: 'skills/c/SKILL.md', timestamp: '2026-05-07T00:00:00Z', trustTier: 'verified', runtimeEligibility: 'denied' },
    ]));
    const set = getApprovedSkillFileSet(ws, []);
    assert.equal(set.size, 1);
  });

  test('FX375 getApprovedSkillFileSet — newer timestamp wins over older for same path', () => {
    fs.mkdirSync(path.join(ws, '.failsafe', 'skill-registry'), { recursive: true });
    fs.writeFileSync(getPersonalSkillManifestPath(ws), JSON.stringify([
      { skillName: 'a', skillPath: 'skills/a/SKILL.md', timestamp: '2026-05-07T00:00:00Z', trustTier: 'verified', runtimeEligibility: 'allowed' },
      { skillName: 'a', skillPath: 'skills/a/SKILL.md', timestamp: '2026-05-08T00:00:00Z', trustTier: 'quarantined', runtimeEligibility: 'allowed' },
    ]));
    const set = getApprovedSkillFileSet(ws, []);
    // newer entry quarantined → not approved
    assert.equal(set.size, 0);
  });
});
