#!/usr/bin/env node
/**
 * #707: explicit, pinned browser Voice Pack re-vendoring.
 *
 * Downloads only the two original npm package archives; it does NOT install
 * their transitive dependencies or execute package lifecycle scripts.
 * SHA-512 pins are from the previously accepted extension package-lock.json.
 * The work is split across vendor-voice-source.cjs (pins, download, archive
 * members), vendor-voice-fs.cjs (filesystem guards), vendor-voice-transaction.cjs
 * (asset replacement) and vendor-voice-verify.cjs (read-only verification).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PACKAGES, assertPinnedDigest, downloadPinned, extractApprovedArchiveMembers, sanitizeWhisperBrowserBundle,
} = require('./vendor-voice-source.cjs');
const { assertVendorAncestry, assertVoiceVendorInventory, assertCommittedVoiceAssets } = require('./vendor-voice-fs.cjs');
const { commitOutputs } = require('./vendor-voice-transaction.cjs');
const { verifyPinnedVendorOutputs, verifyCommittedVendorOutputs } = require('./vendor-voice-verify.cjs');

/** Download each selected pinned archive into `tmp` and return the approved output bytes. */
async function collectPinnedOutputs(selected, tmp) {
  const outputs = new Map();
  for (const name of selected) {
    const pkg = PACKAGES[name];
    const bytes = await downloadPinned(pkg.url, pkg.integrity);
    const tarball = path.join(tmp, name + '.tgz');
    fs.writeFileSync(tarball, bytes, { flag: 'wx', mode: 0o600 });
    for (const [dest, contents] of extractApprovedArchiveMembers(tarball, pkg.outputs)) {
      if (outputs.has(dest)) throw new Error('duplicate voice vendor destination');
      outputs.set(dest, dest === 'whisper/transformers.min.js'
        ? sanitizeWhisperBrowserBundle(contents) : contents);
    }
  }
  return outputs;
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--piper-only', '--verify']);
  if (args.some(a => !allowed.has(a)) || new Set(args).size !== args.length) {
    throw new Error('usage: node vendor-voice.cjs [--piper-only] [--verify]');
  }
  const selected = args.includes('--piper-only') ? ['piper'] : ['piper', 'whisper'];
  const verifyOnly = args.includes('--verify');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-vendor-'));
  try {
    const outputs = await collectPinnedOutputs(selected, tmp);
    if (verifyOnly) {
      const verified = verifyPinnedVendorOutputs(outputs);
      verifyCommittedVendorOutputs(outputs);
      console.log('[vendor:voice] pinned upstream bytes match ' + verified + ' browser assets on disk and committed HEAD; no source files changed');
    } else {
      const warnings = commitOutputs(outputs);
      for (const warning of warnings) console.warn('[vendor:voice] ' + warning);
      console.log('[vendor:voice] pinned archives verified; updated ' + outputs.size + ' browser assets');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
module.exports = {
  PACKAGES, assertPinnedDigest, downloadPinned, extractApprovedArchiveMembers, sanitizeWhisperBrowserBundle,
  assertVendorAncestry, assertVoiceVendorInventory, assertCommittedVoiceAssets, commitOutputs,
  verifyPinnedVendorOutputs, verifyCommittedVendorOutputs,
};
if (require.main === module) main().catch(err => { console.error('[vendor:voice] ' + err.message); process.exitCode = 1; });
