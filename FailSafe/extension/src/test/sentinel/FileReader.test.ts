// Functional tests for FileReader (FX355).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readFileContentSafe, MAX_FILE_SIZE } from '../../sentinel/utils/FileReader';

function tmpFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-'));
  const file = path.join(dir, 'data.txt');
  fs.writeFileSync(file, content);
  return file;
}

suite('FileReader (FX355)', () => {
  test('FX355 readFileContentSafe — reads small file content as utf-8', () => {
    const file = tmpFile('hello world');
    const r = readFileContentSafe(file);
    assert.equal(r.content, 'hello world');
    assert.equal(r.skippedReason, undefined);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('FX355 readFileContentSafe — empty file returns empty string', () => {
    const file = tmpFile('');
    const r = readFileContentSafe(file);
    assert.equal(r.content, '');
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('FX355 readFileContentSafe — UTF-8 multi-byte characters preserved', () => {
    const file = tmpFile('héllo 🌍');
    const r = readFileContentSafe(file);
    assert.equal(r.content, 'héllo 🌍');
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('FX355 readFileContentSafe — file over maxSize returns undefined + file_too_large', () => {
    const file = tmpFile('x'.repeat(2000));
    const r = readFileContentSafe(file, 1000);
    assert.equal(r.content, undefined);
    assert.equal(r.skippedReason, 'file_too_large');
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('FX355 readFileContentSafe — file at exactly maxSize is read', () => {
    const file = tmpFile('x'.repeat(1000));
    const r = readFileContentSafe(file, 1000);
    assert.equal(r.content?.length, 1000);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('FX355 readFileContentSafe — non-existent file returns undefined + read_error', () => {
    const r = readFileContentSafe('/nonexistent/path/to/nothing.txt');
    assert.equal(r.content, undefined);
    assert.equal(r.skippedReason, 'read_error');
  });

  test('FX355 readFileContentSafe — defaults to MAX_FILE_SIZE when maxSize not passed', () => {
    // Create file just under default 5MB cap
    const small = tmpFile('a'.repeat(100));
    const r = readFileContentSafe(small);
    assert.equal(r.content?.length, 100);
    fs.rmSync(path.dirname(small), { recursive: true, force: true });
  });

  test('FX355 MAX_FILE_SIZE — exported constant is 5MB', () => {
    assert.equal(MAX_FILE_SIZE, 5 * 1024 * 1024);
  });

  test('FX355 readFileContentSafe — directory path does not crash (graceful return)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-dir-'));
    // On some platforms fs.openSync(dir, 'r') succeeds; on others it throws.
    // Either way, the function must not throw.
    assert.doesNotThrow(() => readFileContentSafe(dir));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('FX355 readFileContentSafe — atomic fd-based read does not crash on quick deletion', () => {
    const file = tmpFile('initial content');
    // Read once successfully
    const r1 = readFileContentSafe(file);
    assert.equal(r1.content, 'initial content');
    // Delete file mid-flight equivalent: subsequent read should fail gracefully
    fs.rmSync(file);
    const r2 = readFileContentSafe(file);
    assert.equal(r2.content, undefined);
    assert.equal(r2.skippedReason, 'read_error');
    try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
