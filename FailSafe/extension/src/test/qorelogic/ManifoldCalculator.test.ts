// Functional tests for ManifoldCalculator (FX316).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ManifoldCalculator } from '../../qorelogic/checkpoint/ManifoldCalculator';

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  return dir;
}

function mkfile(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

suite('ManifoldCalculator (FX316)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX316 calculateManifold — empty workspace returns null for each folder', async () => {
    const m = new ManifoldCalculator(dir);
    const r = await m.calculateManifold();
    assert.equal(r.src, null);
    assert.equal(r.docs, null);
    assert.equal(r['.agent'], null);
    assert.equal(r.FailSafe, null);
  });

  test('FX316 calculateManifold — populated src returns FolderManifold with file_count + total_bytes', async () => {
    mkfile(dir, 'src/a.ts', 'aaa');
    mkfile(dir, 'src/b.ts', 'bbbbbb');
    const m = new ManifoldCalculator(dir);
    const r = await m.calculateManifold();
    assert.equal(r.src!.file_count, 2);
    assert.equal(r.src!.total_bytes, 9);
    assert.match(r.src!.last_modified, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('FX316 getFolderStats — recurses into nested directories', () => {
    mkfile(dir, 'src/a.ts', 'a');
    mkfile(dir, 'src/sub/b.ts', 'bb');
    mkfile(dir, 'src/sub/deeper/c.ts', 'ccc');
    const m = new ManifoldCalculator(dir);
    const stats = m.getFolderStats(path.join(dir, 'src'));
    assert.equal(stats.file_count, 3);
    assert.equal(stats.total_bytes, 6);
  });

  test('FX316 getFolderStats — skips node_modules / out / dist directories', () => {
    mkfile(dir, 'src/a.ts', 'a');
    mkfile(dir, 'src/node_modules/lib.js', 'should be skipped');
    mkfile(dir, 'src/out/build.js', 'should be skipped');
    mkfile(dir, 'src/dist/bundle.js', 'should be skipped');
    const m = new ManifoldCalculator(dir);
    const stats = m.getFolderStats(path.join(dir, 'src'));
    assert.equal(stats.file_count, 1);
    assert.equal(stats.total_bytes, 1);
  });

  test('FX316 getFolderStats — skips dotfiles + dotdirs', () => {
    mkfile(dir, 'src/a.ts', 'a');
    mkfile(dir, 'src/.hidden', 'h');
    mkfile(dir, 'src/.dir/inside.ts', 'inside');
    const m = new ManifoldCalculator(dir);
    const stats = m.getFolderStats(path.join(dir, 'src'));
    assert.equal(stats.file_count, 1);
  });

  test('FX316 getFolderStats — empty folder produces zero counts', () => {
    fs.mkdirSync(path.join(dir, 'empty'));
    const m = new ManifoldCalculator(dir);
    const stats = m.getFolderStats(path.join(dir, 'empty'));
    assert.equal(stats.file_count, 0);
    assert.equal(stats.total_bytes, 0);
    // last_modified will be epoch 0 since no files
    assert.equal(stats.last_modified, '1970-01-01T00:00:00.000Z');
  });

  test('FX316 calculateManifold — handles partial population (only some folders exist)', async () => {
    mkfile(dir, 'docs/README.md', 'doc');
    const m = new ManifoldCalculator(dir);
    const r = await m.calculateManifold();
    assert.equal(r.src, null);
    assert.equal(r.docs!.file_count, 1);
    assert.equal(r['.agent'], null);
  });
});
