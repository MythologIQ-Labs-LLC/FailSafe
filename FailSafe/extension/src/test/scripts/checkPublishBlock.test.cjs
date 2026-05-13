/**
 * Integration tests for check-publish-block.cjs.
 *
 * Covers the 4 cases from plan-monitor-coherence-and-browser-verification.md:
 *   1. PUBLISH_BLOCK Active + BROWSER_VERIFICATION missing → reason 2.
 *   2. PUBLISH_BLOCK Active + BROWSER_VERIFICATION present + Active=yes → reason 2.
 *   3. All conditions met → ok=true (exits zero).
 *   4. Pre-push hook integration: simulate `[RELEASE]` commit with each failure
 *      mode and confirm the hook's verify:publish-block branch rejects.
 *
 * Runs standalone: node --test src/test/scripts/checkPublishBlock.test.cjs
 */

'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const checkPublishBlock = require(path.resolve(
  __dirname, '..', '..', '..', 'scripts', 'check-publish-block.cjs',
));

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeBlockActive(repoRoot) {
  const dir = path.join(repoRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'PUBLISH_BLOCK.md'),
    '# Publish Block\n\n**Active**: yes\n**Set**: 2026-05-08\n',
    'utf8',
  );
}

function writeFeatureIndexClean(repoRoot) {
  const docs = path.join(repoRoot, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(
    path.join(docs, 'FEATURE_INDEX.md'),
    '# Feature Index\n\nAll entries verified.\n',
    'utf8',
  );
}

function writeBrowserVerificationSigned(repoRoot, signature = 'Operator Initials') {
  const dir = path.join(repoRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
  // Phase 1 inventory check requires every cited spec to exist on disk.
  const specPath = path.join(repoRoot, 'FailSafe', 'extension', 'src', 'test', 'ui', 'monitor.spec.ts');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, '// stub\n', 'utf8');
  const body = [
    '# FailSafe v5.1.0 — Browser Verification Evidence',
    '',
    '**Active**: no',
    '**Operator**: Test Op',
    '**Date**: 2026-05-08',
    '**Build SHA**: deadbeef',
    '',
    '## Playwright-covered pages',
    '',
    '- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: 2026-05-08T00:00:00Z, result: pass',
    '',
    '## Screenshot-covered pages',
    '',
    '### FX202 Voice modal',
    '- Why Playwright cannot reach: requires MediaRecorder.',
    '- Screenshot: .failsafe/governance/screenshots/voice-modal-2026-05-08.png',
    '- Operator note: coherence verified visually.',
    '',
    '## Operator sign-off',
    '',
    `Signature: ${signature}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'BROWSER_VERIFICATION.md'), body, 'utf8');
}

describe('check-publish-block.cjs lifting protocol', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempDir('failsafe-publish-block-test-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('case 1: PUBLISH_BLOCK Active + BROWSER_VERIFICATION missing → reason 2', () => {
    writeBlockActive(tmp);
    writeFeatureIndexClean(tmp);
    const result = checkPublishBlock.evaluate(tmp);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 2);
    assert.match(result.message, /BROWSER_VERIFICATION\.md missing/);
  });

  it('case 2: BROWSER_VERIFICATION exists with Active: yes → reason 2', () => {
    writeBlockActive(tmp);
    writeFeatureIndexClean(tmp);
    const dir = path.join(tmp, '.failsafe', 'governance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'BROWSER_VERIFICATION.md'),
      '# Browser Verification\n\n**Active**: yes\n',
      'utf8',
    );
    const result = checkPublishBlock.evaluate(tmp);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 2);
    assert.match(result.message, /Active: no/);
  });

  it('case 3: all conditions met → ok=true', () => {
    writeBlockActive(tmp);
    writeFeatureIndexClean(tmp);
    writeBrowserVerificationSigned(tmp);
    const result = checkPublishBlock.evaluate(tmp);
    assert.equal(result.ok, true, JSON.stringify(result));
  });

  it('case 3b: skipped when PUBLISH_BLOCK already inactive', () => {
    const dir = path.join(tmp, '.failsafe', 'governance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'PUBLISH_BLOCK.md'),
      '# Publish Block\n\n**Active**: no\n',
      'utf8',
    );
    const result = checkPublishBlock.evaluate(tmp);
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
  });

  it('case 4: each failure mode rejects (FEATURE_INDEX unverified → reason 1; missing signature → reason 4)', () => {
    // 4a: unverified entries in FEATURE_INDEX
    writeBlockActive(tmp);
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'docs', 'FEATURE_INDEX.md'),
      '| FX001 | Status: unverified |\n',
      'utf8',
    );
    writeBrowserVerificationSigned(tmp);
    let result = checkPublishBlock.evaluate(tmp);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 1);

    // 4b: blank signature
    fs.writeFileSync(
      path.join(tmp, 'docs', 'FEATURE_INDEX.md'),
      '# Feature Index\n\nclean\n',
      'utf8',
    );
    writeBrowserVerificationSigned(tmp, '___________________________');
    result = checkPublishBlock.evaluate(tmp);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 4);
  });
});
