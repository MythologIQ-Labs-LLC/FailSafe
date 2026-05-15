// Functional tests for governance/fingerprint.ts (FX315 + computeContentFingerprint).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  computeContentFingerprint,
  computeFingerprintSimilarity,
  type ContentFingerprint,
} from '../../governance/fingerprint';

function mkfile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

suite('fingerprint (FX315)', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX315 computeContentFingerprint — produces hash + size + type from disk', async () => {
    const file = mkfile(dir, 'sample.ts', 'export const x = 42;\n');
    const fp = await computeContentFingerprint(file);
    assert.equal(fp.path, file);
    assert.equal(fp.type, 'ts');
    assert.equal(fp.size, fs.statSync(file).size);
    assert.equal(fp.hash.length, 64); // sha-256 hex
    assert.ok(typeof fp.timestamp === 'number' && fp.timestamp > 0);
  });

  test('FX315 computeContentFingerprint — supplied content overrides disk read', async () => {
    const file = mkfile(dir, 'a.txt', 'on-disk');
    const fp = await computeContentFingerprint(file, 'override-content');
    // Hash must reflect override content, not disk content
    const fpDisk = await computeContentFingerprint(file);
    assert.notEqual(fp.hash, fpDisk.hash);
  });

  test('FX315 computeContentFingerprint — identical content yields identical hash', async () => {
    const f1 = mkfile(dir, 'a.txt', 'same-content');
    const f2 = mkfile(dir, 'b.txt', 'same-content');
    const fp1 = await computeContentFingerprint(f1);
    const fp2 = await computeContentFingerprint(f2);
    assert.equal(fp1.hash, fp2.hash);
  });

  test('FX315 computeContentFingerprint — large content (>200KB) only hashes first 200KB', async () => {
    const small = 'A'.repeat(200 * 1024);
    const padded = small + 'B'.repeat(50 * 1024); // 50KB beyond cap
    const file = mkfile(dir, 'large.bin', 'placeholder'); // for stat
    const fp1 = await computeContentFingerprint(file, small);
    const fp2 = await computeContentFingerprint(file, padded);
    // Both hash inputs are identical first 200KB → identical hashes
    assert.equal(fp1.hash, fp2.hash);
  });

  test('FX315 computeFingerprintSimilarity — identical hashes return 1.0', () => {
    const fp1: ContentFingerprint = { hash: 'abc', size: 100, type: 'ts', path: 'a.ts', timestamp: 1 };
    const fp2: ContentFingerprint = { hash: 'abc', size: 999, type: 'js', path: 'b.js', timestamp: 2 };
    assert.equal(computeFingerprintSimilarity(fp1, fp2), 1.0);
  });

  test('FX315 computeFingerprintSimilarity — same type, different hash → 0.8', () => {
    const fp1: ContentFingerprint = { hash: 'aaa', size: 100, type: 'ts', path: 'a.ts', timestamp: 1 };
    const fp2: ContentFingerprint = { hash: 'bbb', size: 100, type: 'ts', path: 'b.ts', timestamp: 2 };
    assert.equal(computeFingerprintSimilarity(fp1, fp2), 0.8);
  });

  test('FX315 computeFingerprintSimilarity — different type, similar size (>0.8 ratio) → 0.5', () => {
    const fp1: ContentFingerprint = { hash: 'aaa', size: 100, type: 'ts', path: 'a.ts', timestamp: 1 };
    const fp2: ContentFingerprint = { hash: 'bbb', size: 90, type: 'js', path: 'b.js', timestamp: 2 };
    assert.equal(computeFingerprintSimilarity(fp1, fp2), 0.5);
  });

  test('FX315 computeFingerprintSimilarity — different type, dissimilar size → 0.0', () => {
    const fp1: ContentFingerprint = { hash: 'aaa', size: 100, type: 'ts', path: 'a.ts', timestamp: 1 };
    const fp2: ContentFingerprint = { hash: 'bbb', size: 1000, type: 'js', path: 'b.js', timestamp: 2 };
    assert.equal(computeFingerprintSimilarity(fp1, fp2), 0.0);
  });

  test('FX315 computeFingerprintSimilarity — empty type strings do NOT trigger same-type branch', () => {
    const fp1: ContentFingerprint = { hash: 'aaa', size: 100, type: '', path: 'a', timestamp: 1 };
    const fp2: ContentFingerprint = { hash: 'bbb', size: 100, type: '', path: 'b', timestamp: 2 };
    // Empty type should fall through size-ratio branch (1.0 ratio > 0.8 → 0.5)
    assert.equal(computeFingerprintSimilarity(fp1, fp2), 0.5);
  });

  test('FX315 computeFingerprintSimilarity — symmetric (a,b) === (b,a)', () => {
    const fp1: ContentFingerprint = { hash: 'aaa', size: 100, type: 'ts', path: 'a.ts', timestamp: 1 };
    const fp2: ContentFingerprint = { hash: 'bbb', size: 90, type: 'js', path: 'b.js', timestamp: 2 };
    assert.equal(computeFingerprintSimilarity(fp1, fp2), computeFingerprintSimilarity(fp2, fp1));
  });
});
