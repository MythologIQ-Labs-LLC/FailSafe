// #707: isolated, pinned voice-vendor tooling; no live npm/network required.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { extensionRoot, vendorTool, temporary } from './vendorVoiceTestSupport';

/** A Git checkout whose only commit adds FailSafe/extension/.../piper/piper.min.js = COMMITTED-PIN. */
function committedPiperFixture(root: string) {
  const extension = path.join(root, 'FailSafe', 'extension');
  const vendor = path.join(extension, 'src', 'roadmap', 'ui', 'vendor');
  const file = path.join(vendor, 'piper', 'piper.min.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'COMMITTED-PIN');
  const git = (...args: string[]) => {
    const run = childProcess.spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, `git ${args.join(' ')} failed: ${run.stderr}`);
  };
  git('init', '-q');
  const commitAsset = (message: string) => {
    git('add', 'FailSafe/extension/src/roadmap/ui/vendor/piper/piper.min.js');
    git('-c', 'user.name=FailSafe Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-q', '-m', message);
  };
  return { extension, vendor, file, commitAsset };
}

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

  test('recursive VSIX copy inventory admits only six voice assets and two vendor provenance notes', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const piper = path.join(vendor, 'piper');
    const whisper = path.join(vendor, 'whisper');
    fs.mkdirSync(piper, { recursive: true });
    fs.mkdirSync(whisper, { recursive: true });
    for (const name of ['VENDOR.md', 'piper.min.js', 'piper_phonemize.wasm', 'piper_phonemize.data']) {
      fs.writeFileSync(path.join(piper, name), 'APPROVED');
    }
    for (const name of ['VENDOR.md', 'transformers.min.js', 'ort-wasm-simd.wasm', 'ort-wasm-simd-threaded.wasm']) {
      fs.writeFileSync(path.join(whisper, name), 'APPROVED');
    }
    assert.doesNotThrow(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root));

    const foreign = path.join(piper, 'piper.min.js.new-orphan');
    fs.writeFileSync(foreign, 'UNTRUSTED');
    assert.throws(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root),
      /unexpected browser voice vendor entry: piper\/piper.min.js.new-orphan/);
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'UNTRUSTED', 'read-only guard must not delete foreign content');
    fs.rmSync(foreign);

    const extraDir = path.join(whisper, 'unexpected-nested');
    fs.mkdirSync(extraDir);
    assert.throws(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root),
      /unexpected browser voice vendor entry: whisper\/unexpected-nested/);
    fs.rmSync(extraDir, { recursive: true });
    assert.doesNotThrow(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root));
  }));

  test('recursive voice inventory refuses a symlinked approved file without following it', function () {
    if (process.platform === 'win32') this.skip(); // symlink privilege depends on host configuration.
    temporary(root => {
      const vendor = path.join(root, 'vendor');
      const piper = path.join(vendor, 'piper');
      const whisper = path.join(vendor, 'whisper');
      fs.mkdirSync(piper, { recursive: true });
      fs.mkdirSync(whisper, { recursive: true });
      const outside = path.join(root, 'outside.js');
      fs.writeFileSync(outside, 'UNTRUSTED');
      fs.symlinkSync(outside, path.join(piper, 'piper.min.js'), 'file');
      assert.throws(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root),
        /unexpected browser voice vendor entry: piper\/piper.min.js/);
      assert.equal(fs.readFileSync(outside, 'utf8'), 'UNTRUSTED');
      assert.equal(fs.lstatSync(path.join(piper, 'piper.min.js')).isSymbolicLink(), true);
    });
  });

  test('read-only pinned verification accepts byte-identical assets and preserves source metadata', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const assets = new Map([
      ['piper/piper.min.js', Buffer.from('PINNED-PIPER')],
      ['whisper/transformers.min.js', Buffer.from('PINNED-WHISPER')],
    ]);
    for (const [rel, data] of assets) {
      const file = path.join(vendor, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    }
    const before = [...assets.keys()].map(rel => {
      const file = path.join(vendor, rel);
      const stat = fs.statSync(file);
      return { rel, bytes: fs.readFileSync(file), mtimeMs: stat.mtimeMs };
    });
    assert.equal(vendorTool.verifyPinnedVendorOutputs(assets, vendor, fs, root), 2);
    for (const prior of before) {
      const file = path.join(vendor, prior.rel);
      assert.deepEqual(fs.readFileSync(file), prior.bytes);
      assert.equal(fs.statSync(file).mtimeMs, prior.mtimeMs, 'verification must not rewrite the vendor tree');
    }
  }));

  test('read-only pinned verification refuses changed bytes, then passes after exact repair', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const file = path.join(vendor, 'piper', 'piper.min.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'DIFFERENT');
    const expected = new Map([['piper/piper.min.js', Buffer.from('PINNED')]]);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /asset mismatch/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'DIFFERENT', 'failed verification is read-only');
    fs.writeFileSync(file, 'PINNED');
    assert.equal(vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), 1);
  }));

  test('read-only pinned verification refuses missing, empty and wrong-type files', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const file = path.join(vendor, 'piper', 'piper.min.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const expected = new Map([['piper/piper.min.js', Buffer.from('PINNED')]]);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /asset missing/);
    fs.writeFileSync(file, '');
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /invalid browser voice asset/);
    fs.rmSync(file);
    fs.mkdirSync(file);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /invalid browser voice asset/);
  }));

  test('read-only pinned verification refuses linked ancestor and never follows a source symlink', function () {
    if (process.platform === 'win32') this.skip();
    temporary(root => {
      const outside = path.join(root, 'outside');
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'piper.min.js'), 'PINNED');
      const vendor = path.join(root, 'vendor');
      fs.mkdirSync(vendor);
      fs.symlinkSync(outside, path.join(vendor, 'piper'), 'dir');
      const expected = new Map([['piper/piper.min.js', Buffer.from('PINNED')]]);
      assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /ancestor must be a real directory/);
      assert.equal(fs.readFileSync(path.join(outside, 'piper.min.js'), 'utf8'), 'PINNED');
    });
  });

  test('read-only pinned verification rejects unauthorized asset names and empty inventory', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    fs.mkdirSync(vendor);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(new Map(), vendor, fs, root), /approved asset map/);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(
      new Map([['../outside', Buffer.from('X')]]), vendor, fs, root), /invalid pinned voice verification asset/);
  }));

  test('upstream parity is checked against committed HEAD bytes, never just a dirty worktree', () => temporary(root => {
    const { extension, vendor, file, commitAsset } = committedPiperFixture(root);
    commitAsset('pinned fixture');
    const pinned = new Map([['piper/piper.min.js', Buffer.from('COMMITTED-PIN')]]);
    assert.equal(vendorTool.verifyPinnedVendorOutputs(pinned, vendor, fs, root), 1);
    assert.equal(vendorTool.verifyCommittedVendorOutputs(pinned, extension), 1);

    fs.writeFileSync(file, 'UNCOMMITTED-REPAIR');
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(pinned, vendor, fs, root), /asset mismatch/);
    assert.equal(vendorTool.verifyCommittedVendorOutputs(pinned, extension), 1,
      'Git snapshot remains original, independent of mutable worktree');

    const uncommitted = new Map([['piper/piper.min.js', Buffer.from('UNCOMMITTED-REPAIR')]]);
    assert.equal(vendorTool.verifyPinnedVendorOutputs(uncommitted, vendor, fs, root), 1);
    assert.throws(() => vendorTool.verifyCommittedVendorOutputs(uncommitted, extension),
      /pinned committed browser voice asset mismatch/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'UNCOMMITTED-REPAIR');
    assert.throws(() => vendorTool.verifyCommittedVendorOutputs(
      new Map([['whisper/transformers.min.js', Buffer.from('ANY')]]), extension),
    /committed browser voice asset is not a regular Git blob/);

    if (process.platform !== 'win32') {
      // A Git symlink blob whose target string exactly matches pinned bytes
      // must not masquerade as a normal browser asset.
      fs.rmSync(file);
      fs.symlinkSync('COMMITTED-PIN', file);
      commitAsset('symlink fixture');
      assert.throws(() => vendorTool.verifyCommittedVendorOutputs(pinned, extension),
        /not a regular Git blob/);
    }
  }));
});
