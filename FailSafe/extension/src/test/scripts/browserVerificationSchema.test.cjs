/**
 * Regression tests for browser-verification-schema.cjs (v5.1.0 lift Phase 2).
 *
 * Runs standalone: node --test src/test/scripts/browserVerificationSchema.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const schema = require(path.resolve(
  __dirname, '..', '..', '..', 'scripts', 'lib', 'browser-verification-schema.cjs',
));

function mkTempRepo(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeBrowserVerification(repoRoot, overrides) {
  const dir = path.join(repoRoot, '.failsafe', 'governance');
  fs.mkdirSync(dir, { recursive: true });
  const defaults = {
    active: 'no',
    playwright: [
      '- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: 2026-05-14T05:00:00Z, result: pass',
      '- [x] Overview (`src/test/ui/command-center-overview.spec.ts`) — last run: 2026-05-14T05:01:00Z, result: pass',
    ],
    screenshots: [
      '### FX202 Voice modal',
      '- Why Playwright cannot reach: requires MediaRecorder.',
      '- Screenshot: .failsafe/governance/screenshots/voice-modal-2026-05-14.png',
      '- Operator note: coherence verified visually.',
    ],
    signature: 'Operator Initials JD',
  };
  const cfg = { ...defaults, ...overrides };
  const body = [
    '# FailSafe v5.1.0 — Browser Verification Evidence',
    '',
    `**Active**: ${cfg.active}`,
    '**Operator**: Test Op',
    '**Date**: 2026-05-14',
    '**Build SHA**: deadbeef',
    '',
    '## Playwright-covered pages',
    '',
    ...cfg.playwright,
    '',
    '## Screenshot-covered pages (Playwright cannot reach)',
    '',
    ...cfg.screenshots,
    '',
    '## Operator sign-off',
    '',
    `Signature: ${cfg.signature}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'BROWSER_VERIFICATION.md'), body, 'utf8');
}

describe('browser-verification-schema validate — happy path', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-schema-ok-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('fully populated file → valid=true, errors=[]', () => {
    writeBrowserVerification(tmp, {});
    const result = schema.validate(tmp);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
  });
});

describe('browser-verification-schema validate — Condition 2 errors', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-schema-c2-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('missing file → condition 2', () => {
    const result = schema.validate(tmp);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].condition, 2);
    assert.match(result.errors[0].message, /missing/);
  });

  it('Active: yes → condition 2', () => {
    writeBrowserVerification(tmp, { active: 'yes' });
    const result = schema.validate(tmp);
    assert.ok(result.errors.some((e) => e.condition === 2 && /Active: no/.test(e.message)));
  });

  it('placeholder timestamp → condition 2', () => {
    writeBrowserVerification(tmp, {
      playwright: ['- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: <timestamp>, result: pass'],
    });
    const result = schema.validate(tmp);
    assert.ok(result.errors.some((e) => e.condition === 2 && /placeholder/.test(e.message)));
  });

  it('result=fail → condition 2', () => {
    writeBrowserVerification(tmp, {
      playwright: ['- [x] Monitor (`src/test/ui/monitor.spec.ts`) — last run: 2026-05-14T05:00:00Z, result: fail'],
    });
    const result = schema.validate(tmp);
    assert.ok(result.errors.some((e) => e.condition === 2 && /must be "pass"/.test(e.message)));
  });
});

describe('browser-verification-schema validate — Condition 3 errors', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-schema-c3-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('screenshot row missing Screenshot: file → condition 3', () => {
    writeBrowserVerification(tmp, {
      screenshots: [
        '### FX202 Voice modal',
        '- Why Playwright cannot reach: requires MediaRecorder.',
        '- Operator note: coherence verified.',
      ],
    });
    const result = schema.validate(tmp);
    assert.ok(result.errors.some((e) => e.condition === 3 && /Screenshot:/.test(e.message)));
  });

  it('screenshot row with placeholder Operator note → condition 3', () => {
    writeBrowserVerification(tmp, {
      screenshots: [
        '### FX202 Voice modal',
        '- Why Playwright cannot reach: requires MediaRecorder.',
        '- Screenshot: .failsafe/governance/screenshots/voice-modal-2026-05-14.png',
        '- Operator note: <observed coherence yes/no + any concerns>',
      ],
    });
    const result = schema.validate(tmp);
    assert.ok(result.errors.some((e) => e.condition === 3 && /Operator note/.test(e.message)));
  });
});

describe('browser-verification-schema validate — Condition 4 errors', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-schema-c4-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('blank signature line → condition 4', () => {
    writeBrowserVerification(tmp, { signature: '___________________________' });
    const result = schema.validate(tmp);
    assert.ok(result.errors.some((e) => e.condition === 4 && /blank or unfilled/.test(e.message)));
  });
});

describe('browser-verification-schema validate — composite', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-schema-composite-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('multiple errors aggregate (Active=yes + blank signature)', () => {
    writeBrowserVerification(tmp, {
      active: 'yes',
      signature: '___________________________',
    });
    const result = schema.validate(tmp);
    assert.equal(result.valid, false);
    const conditions = new Set(result.errors.map((e) => e.condition));
    assert.ok(conditions.has(2));
    assert.ok(conditions.has(4));
  });
});
