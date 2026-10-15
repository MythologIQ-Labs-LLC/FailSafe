// #502 (FX950): the release packaging path — package-all-targets.cjs produces the
// Target VSIX set with a checksum manifest, or fails without one; and the
// dependency-free zip reader smoke-packaged-sqlite.cjs uses to load the packaged
// binary extracts exactly the requested entries.
// Plan: plan-v607-rc1.md LD2 / LD4.

import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { packageAllTargets, vsixName } = require('../../../scripts/package-all-targets.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractPrefix } = require('../../../scripts/smoke-packaged-sqlite.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NATIVE_TARGETS } = require('../../../scripts/native-targets.cjs');

const ALL_TARGETS: string[] = Object.keys(NATIVE_TARGETS);

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A packageOne stub that writes distinct known bytes per target. */
function writingPackager(written: Record<string, Buffer>) {
  return (target: string, file: string): boolean => {
    const bytes = Buffer.from(`vsix-bytes-for-${target}`);
    fs.writeFileSync(file, bytes);
    written[path.basename(file)] = bytes;
    return true;
  };
}

/** Minimal zip writer (stored or deflated entries) for exercising extractPrefix. */
function buildZip(entries: Array<{ name: string; data: Buffer; deflate: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const body = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

suite('package-all-targets (FX950, #502)', () => {
  test('all 8 targets succeed -> manifest and SHA256SUMS list every target with its real hash', () => {
    const dir = mkTempDir('fs-pat-ok-');
    try {
      const written: Record<string, Buffer> = {};
      const { manifest } = packageAllTargets({
        version: '9.9.9', outDir: dir, packageOne: writingPackager(written), validateOne: () => true,
      });
      assert.deepEqual(manifest.map((m: { target: string }) => m.target).sort(), [...ALL_TARGETS].sort());
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'targets.json'), 'utf8'));
      assert.equal(json.version, '9.9.9');
      assert.equal(json.targets.length, 8);
      const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
      assert.equal(sums.length, 8);
      for (const line of sums) {
        const [hash, file] = line.split(/\s+/);
        const expected = crypto.createHash('sha256').update(written[file]).digest('hex');
        assert.equal(hash, expected, `${file} hash`);
        assert.equal(json.targets.find((t: { file: string }) => t.file === file).sha256, expected);
      }
      for (const target of ALL_TARGETS) {
        assert.ok(fs.existsSync(path.join(dir, `mythologiq-failsafe-9.9.9-${target}.vsix`)), target);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a target that fails validation -> rejects naming it, and neither manifest is written', () => {
    const dir = mkTempDir('fs-pat-badval-');
    try {
      assert.throws(
        () => packageAllTargets({
          version: '9.9.9', outDir: dir, packageOne: writingPackager({}),
          validateOne: (_file: string, target: string) => target !== 'darwin-x64',
        }),
        /darwin-x64/,
      );
      assert.equal(fs.existsSync(path.join(dir, 'targets.json')), false);
      assert.equal(fs.existsSync(path.join(dir, 'SHA256SUMS.txt')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a produced set missing one target -> rejects (set differs from NATIVE_TARGETS)', () => {
    const dir = mkTempDir('fs-pat-missing-');
    try {
      assert.throws(
        () => packageAllTargets({
          version: '9.9.9', outDir: dir, targets: ALL_TARGETS.filter((t) => t !== 'win32-arm64'),
          packageOne: writingPackager({}), validateOne: () => true,
        }),
        /differ/,
      );
      assert.equal(fs.existsSync(path.join(dir, 'targets.json')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a packager that reports success but writes no file -> rejects', () => {
    const dir = mkTempDir('fs-pat-nofile-');
    try {
      assert.throws(
        () => packageAllTargets({ version: '9.9.9', outDir: dir, packageOne: () => true, validateOne: () => true }),
        /packaging failed for/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('file names follow mythologiq-failsafe-VERSION-TARGET.vsix', () => {
    assert.equal(vsixName('6.0.7', 'alpine-arm64'), 'mythologiq-failsafe-6.0.7-alpine-arm64.vsix');
  });
});

suite('smoke-packaged-sqlite extractPrefix (FX950, #502)', () => {
  test('extracts only entries under the prefix, stored and deflated, byte-identical', () => {
    const dir = mkTempDir('fs-zip-');
    try {
      const native = crypto.randomBytes(4096);
      const js = Buffer.from('module.exports = 1;\n'.repeat(50));
      const zip = buildZip([
        { name: 'extension/node_modules/better-sqlite3/prebuilds/win32-x64.node', data: native, deflate: false },
        { name: 'extension/node_modules/better-sqlite3/lib/index.js', data: js, deflate: true },
        { name: 'extension/package.json', data: Buffer.from('{}'), deflate: true },
      ]);
      const names = extractPrefix(zip, 'extension/node_modules/better-sqlite3/', dir);
      assert.deepEqual(names.sort(), [
        'extension/node_modules/better-sqlite3/lib/index.js',
        'extension/node_modules/better-sqlite3/prebuilds/win32-x64.node',
      ]);
      const out = (n: string) => fs.readFileSync(path.join(dir, ...n.split('/')));
      assert.ok(out('extension/node_modules/better-sqlite3/prebuilds/win32-x64.node').equals(native));
      assert.ok(out('extension/node_modules/better-sqlite3/lib/index.js').equals(js));
      assert.equal(fs.existsSync(path.join(dir, 'extension', 'package.json')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects an entry that climbs out of the extraction directory', () => {
    const dir = mkTempDir('fs-zip-evil-');
    try {
      const zip = buildZip([{ name: 'extension/node_modules/better-sqlite3/../../../evil.txt', data: Buffer.from('x'), deflate: false }]);
      assert.throws(() => extractPrefix(zip, 'extension/node_modules/better-sqlite3/', dir), /unsafe entry/);
      assert.equal(fs.existsSync(path.join(dir, '..', 'evil.txt')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
