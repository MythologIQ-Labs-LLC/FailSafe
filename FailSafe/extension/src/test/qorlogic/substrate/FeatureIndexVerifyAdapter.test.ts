import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FeatureIndexVerifyAdapter } from '../../../qorlogic/substrate/FeatureIndexVerifyAdapter';

/**
 * FX712 — FeatureIndexVerifyAdapter (TS-local, not subprocess)
 * 6 cases: missing file / well-formed 0 findings / unverified row → finding /
 * missing test-path cell → finding / malformed table tolerated / multi-section.
 *
 * FailSafe-canonical Status column header is `Status` (NOT upstream
 * "verification status"). DRIFT documented in plan §boundaries.
 */

function mkWs(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-feat-idx-')); }

function writeIndex(ws: string, body: string) {
  fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'docs', 'FEATURE_INDEX.md'), body);
}

const HEADER = '| ID | Feature | Doc | Code | Test | Status | Notes |\n|---|---|---|---|---|---|---|\n';

suite('FeatureIndexVerifyAdapter (FX712)', () => {
  test('missing FEATURE_INDEX.md → 0 findings + ok=true + warning note', async () => {
    const ws = mkWs();
    try {
      const adapter = new FeatureIndexVerifyAdapter(ws);
      const r = await adapter.run();
      assert.equal(r.ok, true);
      assert.equal(r.findings.length, 0);
      assert.match(r.summary.note ?? '', /not present/);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('well-formed index, all verified → 0 findings', async () => {
    const ws = mkWs();
    try {
      writeIndex(ws, HEADER + '| FX001 | f1 | F001 | C001 | tests/x.ts | verified | n |\n| FX002 | f2 | F002 | C002 | tests/y.ts | verified | n |\n');
      const r = await new FeatureIndexVerifyAdapter(ws).run();
      assert.equal(r.ok, true);
      assert.equal(r.findings.length, 0);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('row with status=unverified → exactly one finding tagged unverified', async () => {
    const ws = mkWs();
    try {
      writeIndex(ws, HEADER + '| FX100 | thing | F100 | C100 | tests/x.ts | unverified | needs test |\n');
      const r = await new FeatureIndexVerifyAdapter(ws).run();
      assert.equal(r.findings.length, 1);
      assert.equal(r.findings[0].rule, 'unverified-entry');
      assert.match(r.findings[0].message, /FX100/);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('row with empty test-path cell → finding tagged missing-test-path', async () => {
    const ws = mkWs();
    try {
      writeIndex(ws, HEADER + '| FX200 | thing | F200 | C200 |  | verified | n |\n');
      const r = await new FeatureIndexVerifyAdapter(ws).run();
      assert.equal(r.findings.length, 1);
      assert.equal(r.findings[0].rule, 'missing-test-path');
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('malformed table (too few columns) tolerated → row skipped, no throw', async () => {
    const ws = mkWs();
    try {
      writeIndex(ws, HEADER + '| FX300 | incomplete row |\n| FX301 | f | F301 | C301 | tests/z.ts | unverified | n |\n');
      const r = await new FeatureIndexVerifyAdapter(ws).run();
      // Only FX301 should produce a finding; FX300 silently skipped.
      assert.equal(r.findings.length, 1);
      assert.match(r.findings[0].message, /FX301/);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('multi-section index: parses both tables, aggregates findings', async () => {
    const ws = mkWs();
    try {
      const body = '## Section A\n\n' + HEADER + '| FX400 | a | F400 | C400 | tests/a.ts | unverified | n |\n\n## Section B\n\n' + HEADER + '| FX500 | b | F500 | C500 |  | verified | n |\n';
      writeIndex(ws, body);
      const r = await new FeatureIndexVerifyAdapter(ws).run();
      assert.equal(r.findings.length, 2);
      assert.equal(r.summary.count, 2);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
