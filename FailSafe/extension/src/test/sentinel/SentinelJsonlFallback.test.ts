// Functional tests for SentinelJsonlFallback (FX350).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ensureJsonlFile,
  appendJsonlRecord,
  purgeJsonlAfterTimestamp,
  sha256,
  stableStringify,
} from '../../sentinel/SentinelJsonlFallback';

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sjf-'));
  return path.join(dir, 'observations.jsonl');
}

suite('SentinelJsonlFallback (FX350)', () => {
  let file: string;
  setup(() => { file = tmpFile(); });
  teardown(() => {
    try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('FX350 ensureJsonlFile — creates empty file when absent', () => {
    assert.equal(fs.existsSync(file), false);
    ensureJsonlFile(file);
    assert.equal(fs.existsSync(file), true);
    assert.equal(fs.readFileSync(file, 'utf-8'), '');
  });

  test('FX350 ensureJsonlFile — leaves existing file content intact', () => {
    fs.writeFileSync(file, 'existing\n');
    ensureJsonlFile(file);
    assert.equal(fs.readFileSync(file, 'utf-8'), 'existing\n');
  });

  test('FX350 appendJsonlRecord — appends one record per line with newline terminator', () => {
    ensureJsonlFile(file);
    appendJsonlRecord(file, { id: 1, ts: '2026-05-07T00:00:00Z' });
    appendJsonlRecord(file, { id: 2, ts: '2026-05-07T01:00:00Z' });
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { id: 1, ts: '2026-05-07T00:00:00Z' });
    assert.deepEqual(JSON.parse(lines[1]), { id: 2, ts: '2026-05-07T01:00:00Z' });
  });

  test('FX350 purgeJsonlAfterTimestamp — missing file returns 0', () => {
    assert.equal(purgeJsonlAfterTimestamp(file, '2026-05-07T00:00:00Z'), 0);
  });

  test('FX350 purgeJsonlAfterTimestamp — keeps records with timestamp <= cutoff, removes newer', () => {
    ensureJsonlFile(file);
    appendJsonlRecord(file, { timestamp: '2026-01-01T00:00:00Z' });
    appendJsonlRecord(file, { timestamp: '2026-03-01T00:00:00Z' });
    appendJsonlRecord(file, { timestamp: '2026-06-01T00:00:00Z' });
    appendJsonlRecord(file, { timestamp: '2026-08-01T00:00:00Z' });
    const purged = purgeJsonlAfterTimestamp(file, '2026-04-01T00:00:00Z');
    assert.equal(purged, 2);
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).timestamp, '2026-01-01T00:00:00Z');
    assert.equal(JSON.parse(lines[1]).timestamp, '2026-03-01T00:00:00Z');
  });

  test('FX350 purgeJsonlAfterTimestamp — invalid JSON lines are kept', () => {
    ensureJsonlFile(file);
    fs.appendFileSync(file, 'not-json\n', 'utf-8');
    appendJsonlRecord(file, { timestamp: '2026-08-01T00:00:00Z' });
    const purged = purgeJsonlAfterTimestamp(file, '2026-04-01T00:00:00Z');
    assert.equal(purged, 1);
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    assert.deepEqual(lines, ['not-json']);
  });

  test('FX350 purgeJsonlAfterTimestamp — atomic write via .tmp.PID rename', () => {
    ensureJsonlFile(file);
    appendJsonlRecord(file, { timestamp: '2026-01-01T00:00:00Z' });
    purgeJsonlAfterTimestamp(file, '2026-04-01T00:00:00Z');
    // Verify no leftover .tmp.PID file
    const dir = path.dirname(file);
    const tmps = fs.readdirSync(dir).filter(f => f.includes('.tmp.'));
    assert.deepEqual(tmps, []);
  });

  test('FX350 sha256 — produces deterministic 64-char hex', () => {
    const h1 = sha256('abc');
    const h2 = sha256('abc');
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.notEqual(sha256('a'), sha256('b'));
  });

  test('FX350 stableStringify — sorts object keys alphabetically', () => {
    assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  });

  test('FX350 stableStringify — recurses into nested + array elements', () => {
    assert.equal(
      stableStringify({ z: { c: 1, a: 2 }, a: [{ q: 1, p: 2 }] }),
      '{"a":[{"p":2,"q":1}],"z":{"a":2,"c":1}}',
    );
  });

  test('FX350 stableStringify — primitive values pass through', () => {
    assert.equal(stableStringify('x'), '"x"');
    assert.equal(stableStringify(42), '42');
    assert.equal(stableStringify(null), 'null');
  });
});
