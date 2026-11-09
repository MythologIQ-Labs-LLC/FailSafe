import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifyHostInstallReceipt } from '../../qorlogic/qorHostReceiptVerify';

suite('#463 frozen Qor-logic host receipt integrity', () => {
  let root: string;
  let hostDir: string;
  let file: string;
  let recordPath: string;
  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-receipt-'));
    hostDir = path.join(root, '.claude');
    file = path.join(hostDir, 'skills', 'qor-audit', 'SKILL.md');
    recordPath = path.join(hostDir, '.qorlogic-installed.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
  });
  teardown(() => { fs.rmSync(root, { recursive: true, force: true }); });
  function receipt(files: unknown[]): void {
    fs.writeFileSync(recordPath, JSON.stringify({ files }));
  }
  function goodRecord(): { path: string; sha256: string } {
    const content = Buffer.from('# Verified skill');
    fs.writeFileSync(file, content);
    return { path: file, sha256: createHash('sha256').update(content).digest('hex') };
  }
  test('genuine existing files with SHA256 pass with actual status', () => {
    receipt([goodRecord()]);
    const res = verifyHostInstallReceipt(root, 'claude');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.status.fileCount, 1);
      assert.deepEqual(res.status.destinations, [path.dirname(file).replaceAll('\\', '/') + '/']);
    }
  });
  test('zero-exit with absent, empty or malformed receipt is not success', () => {
    assert.deepEqual(verifyHostInstallReceipt(root, 'claude'),
      { ok: false, error: 'install-receipt-missing' });
    receipt([]);
    assert.deepEqual(verifyHostInstallReceipt(root, 'claude'),
      { ok: false, error: 'install-receipt-missing' });
    receipt([{ path: file, sha256: 'fake' }]);
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
  });
  test('existing record with modified bytes fails', () => {
    receipt([goodRecord()]);
    fs.writeFileSync(file, 'altered after installation');
    assert.deepEqual(verifyHostInstallReceipt(root, 'claude'),
      { ok: false, error: 'install-receipt-integrity-failed' });
  });
  test('fake path outside intended host and nonexistent paths fail', () => {
    const outside = path.join(root, 'other.txt');
    fs.writeFileSync(outside, 'outside host');
    const sha256 = createHash('sha256').update('outside host').digest('hex');
    receipt([{ path: outside, sha256 }]);
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
    receipt([{ path: path.join(hostDir, 'missing.md'), sha256 }]);
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
  });
  test('direct file and parent symlinks cannot redirect the verified bytes', function () {
    const original = goodRecord();
    const elsewhere = path.join(root, 'outside.md');
    fs.writeFileSync(elsewhere, '# Verified skill');
    fs.rmSync(file);
    try { fs.symlinkSync(elsewhere, file); }
    catch { this.skip(); return; }
    receipt([original]);
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
  });
  test('duplicate entries and unbounded receipt input fail closed', () => {
    const one = goodRecord();
    receipt([one, one]);
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
    fs.writeFileSync(recordPath, ' '.repeat(1024 * 1024 + 1));
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
  });
  test('record symlinks and oversized skill content cannot pass', function () {
    const one = goodRecord();
    receipt([one]);
    const linked = path.join(hostDir, 'record-real.json');
    fs.renameSync(recordPath, linked);
    try { fs.symlinkSync(linked, recordPath); }
    catch { this.skip(); return; }
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
    fs.rmSync(recordPath);
    fs.renameSync(linked, recordPath);
    fs.truncateSync(file, 8 * 1024 * 1024 + 1);
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, false);
  });
});
