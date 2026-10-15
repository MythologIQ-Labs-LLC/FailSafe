// validate-vsix-size: 30 MB ceiling assertion (B195 acceptance criterion).
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 4.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertVsixUnderCeiling } = require('../../../scripts/validate-vsix.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findNativeAddons, checkNativeBinary, describeBinaryHeader, NATIVE_TARGETS } = require('../../../scripts/native-targets.cjs');

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

suite('validate-vsix-size assertion', () => {

  test('passes for a synthesized small archive under the ceiling', () => {
    const dir = mkTempDir('failsafe-vsix-size-pass-');
    try {
      const vsixPath = path.join(dir, 'tiny.vsix');
      fs.writeFileSync(vsixPath, Buffer.alloc(1024)); // 1 KB
      assert.doesNotThrow(() => assertVsixUnderCeiling(vsixPath, 30 * 1024 * 1024));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails with descriptive error for an oversized archive', () => {
    const dir = mkTempDir('failsafe-vsix-size-fail-');
    try {
      const vsixPath = path.join(dir, 'big.vsix');
      fs.writeFileSync(vsixPath, Buffer.alloc(35 * 1024 * 1024)); // 35 MB > 30 MB ceiling
      assert.throws(
        () => assertVsixUnderCeiling(vsixPath, 30 * 1024 * 1024),
        /exceeds|over|ceiling|size/i,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// #502 (FX950): a VSIX that depends on better-sqlite3 must be platform-targeted and carry
// exactly the matching N-API prebuild. Headers are real 1024-byte prefixes (hex) of the
// better-sqlite3 13.0.3 prebuilds (src/test/fixtures/native-prebuild-headers.json).
const HEADERS: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'test', 'fixtures', 'native-prebuild-headers.json'), 'utf8'),
);
const header = (prebuild: string): Buffer => Buffer.from(HEADERS[prebuild], 'hex');
const entry = (prebuild: string): string => `extension/node_modules/better-sqlite3/prebuilds/${prebuild}.node`;
const reader = (map: Record<string, Buffer>) => (e: string): Buffer => map[e];

suite('native-addon platform packaging #502 (FX950)', () => {
  test('findNativeAddons reads a real unzip -Z1 listing with CRLF or LF line endings', () => {
    const lines = ['extension.vsixmanifest', 'extension/package.json', entry('win32-x64'), 'extension/dist/extension/main.js', 'extension/node_modules/x/build/Release/x.node'];
    for (const sep of ['\r\n', '\n']) {
      assert.deepEqual(findNativeAddons(lines.join(sep) + sep), [entry('win32-x64'), 'extension/node_modules/x/build/Release/x.node'], JSON.stringify(sep));
    }
  });

  test('describeBinaryHeader identifies every real 13.0.3 prebuild', () => {
    const expected: Record<string, [string, string]> = {
      'win32-x64': ['PE', 'x64'], 'win32-arm64': ['PE', 'arm64'], 'linux-x64': ['ELF', 'x64'], 'linux-arm64': ['ELF', 'arm64'],
      'linuxmusl-x64': ['ELF', 'x64'], 'darwin-x64': ['MachO', 'x64'], 'darwin-arm64': ['MachO', 'arm64'],
    };
    for (const [prebuild, [format, arch]] of Object.entries(expected)) {
      assert.deepEqual(describeBinaryHeader(header(prebuild)), { format, arch }, prebuild);
    }
  });

  test('every packaging target accepts exactly its own prebuild', () => {
    for (const [target, spec] of Object.entries(NATIVE_TARGETS as Record<string, { prebuild: string }>)) {
      if (!HEADERS[spec.prebuild]) continue; // linuxmusl-arm64 shares linux-arm64's header shape; covered by path tests
      const err = checkNativeBinary({ target, dependsOnSqlite: true, addons: [entry(spec.prebuild)], readEntry: reader({ [entry(spec.prebuild)]: header(spec.prebuild) }) });
      assert.equal(err, null, `${target}: ${err}`);
    }
  });

  test('a universal VSIX that depends on better-sqlite3 is refused, with or without a binary', () => {
    assert.match(checkNativeBinary({ target: null, dependsOnSqlite: true, addons: [], readEntry: reader({}) }), /platform-targeted/);
    assert.match(checkNativeBinary({ target: null, dependsOnSqlite: true, addons: [entry('linux-x64')], readEntry: reader({ [entry('linux-x64')]: header('linux-x64') }) }), /platform-targeted/);
  });

  test('a targeted VSIX with no binary is refused', () => {
    assert.match(checkNativeBinary({ target: 'win32-x64', dependsOnSqlite: true, addons: [], readEntry: reader({}) }), /exactly one/);
  });

  test('wrong architecture, wrong format, wrong path and extra binaries are refused', () => {
    const one = (target: string, prebuild: string, bytes: Buffer) =>
      checkNativeBinary({ target, dependsOnSqlite: true, addons: [entry(prebuild)], readEntry: reader({ [entry(prebuild)]: bytes }) });
    assert.match(one('win32-x64', 'win32-x64', header('win32-arm64')), /arm64/, 'arm64 bytes under the x64 name');
    assert.match(one('linux-x64', 'linux-x64', header('win32-x64')), /PE/, 'Windows bytes in a Linux package');
    assert.match(one('alpine-x64', 'linux-x64', header('linux-x64')), /linuxmusl-x64/, 'glibc build in an Alpine package');
    const legacy = 'extension/node_modules/better-sqlite3/build/Release/better_sqlite3.node';
    assert.match(checkNativeBinary({ target: 'win32-x64', dependsOnSqlite: true, addons: [legacy], readEntry: reader({ [legacy]: header('win32-x64') }) }), /prebuilds\/win32-x64\.node/);
    assert.match(checkNativeBinary({ target: 'win32-x64', dependsOnSqlite: true, addons: [entry('win32-x64'), entry('linux-x64')],
      readEntry: reader({ [entry('win32-x64')]: header('win32-x64'), [entry('linux-x64')]: header('linux-x64') }) }), /exactly one/);
  });

  test('a fat Mach-O and a truncated PE header are refused', () => {
    const fat = Buffer.alloc(64); fat.writeUInt32BE(0xcafebabe, 0);
    assert.equal(describeBinaryHeader(fat).format, 'MachO-fat');
    assert.match(checkNativeBinary({ target: 'darwin-arm64', dependsOnSqlite: true, addons: [entry('darwin-arm64')], readEntry: reader({ [entry('darwin-arm64')]: fat }) }), /fat|universal Mach-O/);
    const truncated = header('win32-x64').subarray(0, 128); // e_lfanew (264) points past the buffer
    assert.equal(describeBinaryHeader(truncated).format, 'unknown');
    // Signature present, Machine field cut off: must report unknown, not throw.
    const cut = header('win32-x64').subarray(0, 264 + 5);
    assert.deepEqual(describeBinaryHeader(cut), { format: 'unknown', arch: 'unknown' });
  });

  test('a package that does not depend on better-sqlite3 and ships no binary passes', () => {
    assert.equal(checkNativeBinary({ target: null, dependsOnSqlite: false, addons: [], readEntry: reader({}) }), null);
  });
});
