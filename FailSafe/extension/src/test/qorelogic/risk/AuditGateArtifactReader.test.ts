// Functional tests for AuditGateArtifactReader (FX417 — plan Phase 3).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditGateArtifactReader } from '../../../qorelogic/risk/AuditGateArtifactReader';

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agr-'));
}

suite('AuditGateArtifactReader (FX417)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX417 read returns null when artifact file is missing', () => {
    const r = new AuditGateArtifactReader(dir);
    assert.equal(r.read('any-session-id'), null);
  });

  test('FX417 read returns null for null/empty sessionId', () => {
    const r = new AuditGateArtifactReader(dir);
    assert.equal(r.read(null), null);
    assert.equal(r.read(''), null);
    assert.equal(r.read(undefined), null);
  });

  test('FX417 read rejects path-traversal sessionId', () => {
    const r = new AuditGateArtifactReader(dir);
    assert.equal(r.read('../../etc/passwd'), null);
    assert.equal(r.read('a/b'), null);
    assert.equal(r.read('with spaces'), null);
  });

  test('FX417 read parses a valid audit.json and returns findings_categories', () => {
    const sid = 'test-sid-001';
    const dest = path.join(dir, '.qor', 'gates', sid);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'audit.json'), JSON.stringify({
      ts: '2026-05-14T16:00:00Z',
      verdict: 'VETO',
      findings_categories: ['security-l3', 'owasp-violation'],
    }));
    const r = new AuditGateArtifactReader(dir);
    const result = r.read(sid);
    assert.ok(result, 'expected a parsed artifact');
    assert.equal(result!.verdict, 'VETO');
    assert.deepEqual(result!.findings_categories, ['security-l3', 'owasp-violation']);
  });

  test('FX417 read returns null on malformed JSON without throwing', () => {
    const sid = 'bad-json-sid';
    const dest = path.join(dir, '.qor', 'gates', sid);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'audit.json'), '{this is not json');
    const r = new AuditGateArtifactReader(dir);
    assert.equal(r.read(sid), null);
  });
});
