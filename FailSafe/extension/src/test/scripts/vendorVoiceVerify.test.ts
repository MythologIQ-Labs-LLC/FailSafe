// #707: committed browser voice assets and their read-only verification.
import { strict as assert } from 'assert';
import * as path from 'path';
import * as childProcess from 'child_process';

const extensionRoot = path.join(__dirname, '..', '..', '..');

suite('voice vendor verification #707', () => {
  test('voice vendor files are never line-ending converted', () => {
    // A CRLF checkout changes the bytes verify:voice-pins compares (audit V2).
    const repoRoot = path.resolve(extensionRoot, '..', '..');
    const files = [
      'piper/VENDOR.md', 'piper/piper.min.js', 'piper/piper_phonemize.wasm', 'piper/piper_phonemize.data',
      'whisper/VENDOR.md', 'whisper/transformers.min.js', 'whisper/ort-wasm-simd.wasm',
      'whisper/ort-wasm-simd-threaded.wasm',
    ].map(rel => 'FailSafe/extension/src/roadmap/ui/vendor/' + rel);
    const result = childProcess.spawnSync('git', ['check-attr', 'text', '--', ...files], {
      cwd: repoRoot, encoding: 'utf8', shell: false,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), files.map(file => file + ': text: unset'));
  });
});
