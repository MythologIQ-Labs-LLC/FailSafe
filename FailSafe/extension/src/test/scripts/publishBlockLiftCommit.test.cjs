/**
 * Regression tests for publish-block-lift-commit.cjs (v5.1.0 lift Phase 3).
 *
 * Runs standalone: node --test src/test/scripts/publishBlockLiftCommit.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lift = require(path.resolve(
  __dirname, '..', '..', '..', 'scripts', 'lib', 'publish-block-lift-commit.cjs',
));

function mkTempRepo(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePublishBlock(repoRoot, activeValue) {
  const dir = path.join(repoRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'PUBLISH_BLOCK.md'),
    `# Publish Block\n\n**Active**: ${activeValue}\n**Set**: 2026-05-06\n`,
    'utf8',
  );
}

function writeBrowserVerificationValid(repoRoot) {
  const dir = path.join(repoRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    '# FailSafe v5.1.0 — Browser Verification Evidence',
    '',
    '**Active**: no',
    '**Operator**: Test',
    '**Date**: 2026-05-14',
    '**Build SHA**: deadbeef',
    '',
    '## Playwright-covered pages',
    '',
    '- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: 2026-05-14T05:00:00Z, result: pass',
    '',
    '## Screenshot-covered pages (Playwright cannot reach)',
    '',
    '### FX202 Voice modal',
    '- Why Playwright cannot reach: requires MediaRecorder.',
    '- Screenshot: .failsafe/governance/screenshots/voice-modal-2026-05-14.png',
    '- Operator note: coherence verified visually.',
    '',
    '## Operator sign-off',
    '',
    'Signature: JD 2026-05-14',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'BROWSER_VERIFICATION.md'), body, 'utf8');
}

describe('publish-block-lift-commit prepareLiftCommit', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-lift-prepare-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('all conditions met → returns structured edit object with from/to + ledger draft', () => {
    writePublishBlock(tmp, 'yes');
    writeBrowserVerificationValid(tmp);
    const result = lift.prepareLiftCommit(tmp);
    assert.notEqual(result, null);
    const edit = result.filesToEdit[lift.PUBLISH_BLOCK_REL];
    assert.equal(edit.from, '**Active**: yes');
    assert.match(edit.to, /^\*\*Active\*\*:\s*no/m);
    assert.match(edit.to, /\*\*Lifted on\*\*:/);
    assert.match(edit.to, /\*\*Lift reference\*\*:/);
    assert.match(result.ledgerEntryDraft, /IMPLEMENTATION — v5\.1\.0 PUBLISH_BLOCK lift/);
    assert.match(result.ledgerEntryDraft, /Condition 1:.+sealed at #354/);
  });

  it('PUBLISH_BLOCK already Active=no → returns null (idempotent no-op)', () => {
    writePublishBlock(tmp, 'no');
    writeBrowserVerificationValid(tmp);
    const result = lift.prepareLiftCommit(tmp);
    assert.equal(result, null);
  });

  it('BROWSER_VERIFICATION schema fails → throws LiftSchemaError with condition', () => {
    writePublishBlock(tmp, 'yes');
    // Missing BROWSER_VERIFICATION.md → schema error condition 2.
    assert.throws(
      () => lift.prepareLiftCommit(tmp),
      (err) => err instanceof lift.LiftSchemaError && err.condition === 2,
    );
  });

  it('BROWSER_VERIFICATION Active=yes → throws LiftSchemaError condition 2', () => {
    writePublishBlock(tmp, 'yes');
    // Write a BROWSER_VERIFICATION.md that exists but with Active=yes (operator hasn't flipped).
    const dir = path.join(tmp, '.failsafe', 'governance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'BROWSER_VERIFICATION.md'),
      [
        '# x',
        '',
        '**Active**: yes',
        '',
        '## Playwright-covered pages',
        '',
        '- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: 2026-05-14T05:00:00Z, result: pass',
        '',
        '## Screenshot-covered pages',
        '',
        '### FX202',
        '- Screenshot: .failsafe/governance/screenshots/voice.png',
        '- Operator note: ok.',
        '',
        '## Operator sign-off',
        '',
        'Signature: JD',
        '',
      ].join('\n'),
      'utf8',
    );
    assert.throws(
      () => lift.prepareLiftCommit(tmp),
      (err) => err instanceof lift.LiftSchemaError && err.condition === 2 && /Active: no/.test(err.message),
    );
  });

  it('blank signature → throws LiftSchemaError condition 4', () => {
    writePublishBlock(tmp, 'yes');
    const dir = path.join(tmp, '.failsafe', 'governance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'BROWSER_VERIFICATION.md'),
      [
        '# x', '', '**Active**: no', '',
        '## Playwright-covered pages', '',
        '- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: 2026-05-14T05:00:00Z, result: pass',
        '',
        '## Screenshot-covered pages', '',
        '### FX202', '- Screenshot: x.png', '- Operator note: ok.',
        '',
        '## Operator sign-off', '',
        'Signature: ___________________________',
        '',
      ].join('\n'),
      'utf8',
    );
    assert.throws(
      () => lift.prepareLiftCommit(tmp),
      (err) => err instanceof lift.LiftSchemaError && err.condition === 4,
    );
  });

  it('PUBLISH_BLOCK.md missing → throws LiftSchemaError condition 0', () => {
    assert.throws(
      () => lift.prepareLiftCommit(tmp),
      (err) => err instanceof lift.LiftSchemaError && err.condition === 0,
    );
  });

  it('PUBLISH_BLOCK.md present but no Active flag → throws LiftSchemaError condition 0', () => {
    const dir = path.join(tmp, '.failsafe', 'governance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PUBLISH_BLOCK.md'), '# Publish Block\n\nNo flag here.\n', 'utf8');
    assert.throws(
      () => lift.prepareLiftCommit(tmp),
      (err) => err instanceof lift.LiftSchemaError && err.condition === 0,
    );
  });
});
