import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readBoundedHostRecord, MAX_HOST_RECORD_BYTES, MAX_HOST_RECORD_FILES,
} from '../../qorlogic/boundedHostRecord';

suite('#463: bounded advisory Qor-logic receipt reads', () => {
  let root: string;
  let recordPath: string;
  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-record-read-'));
    recordPath = path.join(root, '.qorlogic-installed.json');
  });
  teardown(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('valid record remains readable, but is not file-integrity evidence', () => {
    const entry = { path: '/workspace/SKILL.md', sha256: 'legacy-test-digest' };
    fs.writeFileSync(recordPath, JSON.stringify({ files: [entry] }));
    assert.deepEqual(readBoundedHostRecord(recordPath), { files: [entry] });
  });

  test('absent, empty, non-array, malformed and empty-file records refuse', () => {
    assert.equal(readBoundedHostRecord(recordPath), null);
    for (const value of ['', '{}', '{', '{"files":[]}', '{"files":{}}', '{"files":[null]}']) {
      fs.writeFileSync(recordPath, value);
      assert.equal(readBoundedHostRecord(recordPath), null);
    }
  });

  test('sparse oversized record is rejected without allocating its full size', () => {
    fs.writeFileSync(recordPath, 'x');
    fs.truncateSync(recordPath, MAX_HOST_RECORD_BYTES + 1);
    assert.equal(readBoundedHostRecord(recordPath), null);
  });

  test('unbounded file count and invalid array entries refuse', () => {
    const entry = { path: '/workspace/SKILL.md', sha256: 'a' };
    fs.writeFileSync(recordPath, JSON.stringify({ files: Array(MAX_HOST_RECORD_FILES + 1).fill(entry) }));
    assert.equal(readBoundedHostRecord(recordPath), null);
    fs.writeFileSync(recordPath, JSON.stringify({ files: [{ path: 7, sha256: null }] }));
    assert.equal(readBoundedHostRecord(recordPath), null);
  });

  test('linked record file cannot be read as the workspace-owned record', function (this: { skip: () => void }) {
    const target = path.join(root, 'actual.json');
    fs.writeFileSync(target, JSON.stringify({ files: [{ path: '/workspace/SKILL.md', sha256: 'a' }] }));
    try { fs.symlinkSync(target, recordPath, 'file'); }
    catch { this.skip(); return; }
    assert.equal(readBoundedHostRecord(recordPath), null);
  });
});
