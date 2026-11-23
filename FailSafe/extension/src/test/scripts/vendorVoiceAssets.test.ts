// #707: the committed-asset check every build runs before copying the UI tree.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { vendorTool, temporary } from './vendorVoiceTestSupport';

const ASSETS = [
  'piper/piper.min.js', 'piper/piper_phonemize.wasm', 'piper/piper_phonemize.data',
  'whisper/transformers.min.js', 'whisper/ort-wasm-simd.wasm', 'whisper/ort-wasm-simd-threaded.wasm',
];

/** A vendor tree with the six approved assets and both provenance notes. */
function seedVendor(root: string): string {
  const vendor = path.join(root, 'vendor');
  for (const rel of [...ASSETS, 'piper/VENDOR.md', 'whisper/VENDOR.md']) {
    fs.mkdirSync(path.dirname(path.join(vendor, rel)), { recursive: true });
    fs.writeFileSync(path.join(vendor, rel), 'APPROVED');
  }
  return vendor;
}

suite('voice vendor committed assets #707', () => {
  test('six approved assets and two notes pass', () => temporary(root => {
    const vendor = seedVendor(root);
    assert.doesNotThrow(() => vendorTool.assertCommittedVoiceAssets(vendor, fs, root));
  }));

  test('a missing asset asks for vendor:voice', () => temporary(root => {
    const vendor = seedVendor(root);
    fs.rmSync(path.join(vendor, 'whisper', 'ort-wasm-simd.wasm'));
    assert.throws(() => vendorTool.assertCommittedVoiceAssets(vendor, fs, root),
      /^Error: Missing browser voice asset: whisper\/ort-wasm-simd\.wasm\. Run npm run vendor:voice$/);
  }));

  test('an empty, oversized or directory asset must be removed before vendor:voice', () => temporary(root => {
    const vendor = seedVendor(root);
    const target = path.join(vendor, 'piper', 'piper.min.js');
    const expected = /^Error: Invalid browser voice asset: piper\/piper\.min\.js\. Remove it, then run npm run vendor:voice$/;
    fs.truncateSync(target, 0);
    assert.throws(() => vendorTool.assertCommittedVoiceAssets(vendor, fs, root), expected);
    fs.truncateSync(target, 75 * 1024 * 1024 + 1); // sparse file: no 75-MiB allocation
    assert.throws(() => vendorTool.assertCommittedVoiceAssets(vendor, fs, root), expected);
    fs.rmSync(target);
    fs.mkdirSync(target);
    assert.throws(() => vendorTool.assertCommittedVoiceAssets(vendor, fs, root), expected);
  }));

  test('a seventh unapproved file is refused by the inventory check', () => temporary(root => {
    const vendor = seedVendor(root);
    fs.writeFileSync(path.join(vendor, 'piper', 'extra.js'), 'UNREVIEWED');
    assert.throws(() => vendorTool.assertCommittedVoiceAssets(vendor, fs, root),
      /^Error: unexpected browser voice vendor entry: piper\/extra\.js$/);
  }));
});
