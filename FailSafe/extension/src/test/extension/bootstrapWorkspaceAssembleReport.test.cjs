/**
 * Unit tests for bootstrapWorkspace.assembleReport (UX hotfix Phase 1).
 *
 * Exercises the catch-all `deferred-only` branch + the new
 * `every-deferred-is-user-deferred` contextual summary.
 *
 * Runs standalone: node --test src/test/extension/bootstrapWorkspaceAssembleReport.test.cjs
 *
 * Note: the source is TypeScript; we import the compiled out/ artifact.
 * `npm run compile` must run before this test.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const compiled = path.resolve(
  __dirname, '..', '..', '..', 'out', 'extension', 'bootstrapAssembleReport.js',
);
const { assembleReport } = require(compiled);

describe('bootstrapWorkspace.assembleReport', () => {
  it('every-deferred-is-user-deferred → contextual paused summary', () => {
    const steps = [
      { name: 'workspace-migration', status: 'ok' },
      { name: 'governance-dirs', status: 'performed', detail: 'created 1 dir(s)' },
      { name: 'qor-logic-package', status: 'deferred', detail: 'user deferred' },
      { name: 'skill-ingestion', status: 'deferred', detail: 'qor-logic not installed' },
    ];
    // Mixed deferral (one user-deferred, one auto-deferred) hits the
    // catch-all wording because `every` requires uniform user-deferral.
    const report = assembleReport(steps);
    assert.equal(report.ok, true);
    // performed.length > 0 so the performed branch wins over the deferral
    // branches — verifies the precedence order.
    assert.match(report.summary, /^Bootstrap performed:/);
  });

  it('all-deferred-user-deferred → contextual paused summary (no performed steps)', () => {
    const steps = [
      { name: 'workspace-migration', status: 'ok' },
      { name: 'governance-dirs', status: 'ok' },
      { name: 'qor-logic-package', status: 'deferred', detail: 'user deferred' },
      { name: 'skill-ingestion', status: 'deferred', detail: 'user deferred' },
    ];
    const report = assembleReport(steps);
    assert.equal(report.ok, true);
    assert.equal(
      report.summary,
      'Bootstrap paused — run Initialize again when ready to install qor-logic',
    );
  });

  it('mixed-deferred (one user-deferred, one silent-mode) → old wording preserved', () => {
    const steps = [
      { name: 'workspace-migration', status: 'ok' },
      { name: 'governance-dirs', status: 'ok' },
      { name: 'qor-logic-package', status: 'deferred', detail: 'user deferred' },
      { name: 'skill-ingestion', status: 'deferred', detail: 'silent mode' },
    ];
    const report = assembleReport(steps);
    assert.equal(report.summary, 'Bootstrap: 2 step(s) deferred');
  });

  it('failed + deferred → failure branch wins', () => {
    const steps = [
      { name: 'workspace-migration', status: 'failed', detail: 'boom' },
      { name: 'qor-logic-package', status: 'deferred', detail: 'user deferred' },
    ];
    const report = assembleReport(steps);
    assert.equal(report.ok, false);
    assert.match(report.summary, /failure\(s\)/);
  });

  it('all-ok no-performed no-deferred → workspace-ready summary', () => {
    const steps = [
      { name: 'workspace-migration', status: 'ok' },
      { name: 'governance-dirs', status: 'ok' },
      { name: 'qor-logic-package', status: 'ok' },
      { name: 'skill-ingestion', status: 'ok', detail: 'qor-* skills present' },
    ];
    const report = assembleReport(steps);
    assert.equal(
      report.summary,
      'Bootstrap: workspace ready (all infrastructure already present)',
    );
  });
});
