// validate-vsix-size: 30 MB ceiling assertion (B195 acceptance criterion).
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 4.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertVsixUnderCeiling } = require('../../../scripts/validate-vsix.cjs');

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
