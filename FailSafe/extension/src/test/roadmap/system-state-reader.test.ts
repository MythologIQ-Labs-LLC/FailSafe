import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SystemStateReader, parseSystemStateFromText } from '../../roadmap/services/SystemStateReader';

let tmpRoot: string;

function writeFile(rel: string, content: string): void {
  const full = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

suite('SystemStateReader: parseSystemStateFromText', () => {
  test('extracts version and lastUpdated from metadata block', () => {
    const md = `# SYSTEM STATE

**Last Updated:** 2026-04-26
**Version:** v5.0.0 De-Theater Pass SUBSTANTIATED

---

## Some section
`;
    const snap = parseSystemStateFromText(md);
    assert.equal(snap.version, 'v5.0.0 De-Theater Pass SUBSTANTIATED');
    assert.equal(snap.lastUpdated, '2026-04-26');
  });

  test('returns nulls when metadata absent', () => {
    const snap = parseSystemStateFromText('# Title\n\nNo metadata here.');
    assert.equal(snap.version, null);
    assert.equal(snap.lastUpdated, null);
  });

  test('handles arbitrary whitespace', () => {
    const md = `**Version:**    v4.10.0\n**Last Updated:**\t2026-03-18\n`;
    const snap = parseSystemStateFromText(md);
    assert.equal(snap.version, 'v4.10.0');
    assert.equal(snap.lastUpdated, '2026-03-18');
  });
});

suite('SystemStateReader: read', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sysstate-reader-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('returns null-fields when SYSTEM_STATE.md absent', () => {
    const reader = new SystemStateReader(tmpRoot);
    const snap = reader.read();
    assert.equal(snap.version, null);
    assert.equal(snap.lastUpdated, null);
  });

  test('reads metadata when file exists', () => {
    writeFile('docs/SYSTEM_STATE.md', `**Version:** v5.0.0\n**Last Updated:** 2026-04-26\n`);
    const reader = new SystemStateReader(tmpRoot);
    const snap = reader.read();
    assert.equal(snap.version, 'v5.0.0');
    assert.equal(snap.lastUpdated, '2026-04-26');
  });

  test('reads chainStatus from META_LEDGER when present', () => {
    writeFile('docs/SYSTEM_STATE.md', `**Version:** v5.0.0\n`);
    writeFile('docs/META_LEDGER.md', `# META LEDGER\n\n## Chain Status: ACTIVE\n`);
    const reader = new SystemStateReader(tmpRoot);
    const snap = reader.read();
    assert.equal(snap.chainStatus, 'ACTIVE');
  });
});
