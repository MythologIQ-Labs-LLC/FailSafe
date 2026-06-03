import { strict as assert } from 'assert';
import { TrackerEvidenceLintModule } from '../../../qorlogic/substrate/TrackerEvidenceLintModule';
import type { LintFinding, TrackerModel } from '../../../roadmap/tracker/tracker-core';

/**
 * Tracker v1.1 — TrackerEvidenceLintModule maps Development Tracker evidence-lint
 * findings to SubstrateFindings. Generator injected → deterministic, no artifacts.
 */

const EMPTY_MODEL = {} as TrackerModel; // module only reads `lint`
const gen = (lint: LintFinding[]) => () => Promise.resolve({ model: EMPTY_MODEL, lint });

suite('TrackerEvidenceLintModule (tracker-v1.1)', () => {
  test('clean model → 0 findings, ok, "fully evidence-cited" note', async () => {
    const r = await new TrackerEvidenceLintModule('/ws', gen([])).run();
    assert.equal(r.ok, true);
    assert.equal(r.findings.length, 0);
    assert.match(r.summary.note ?? '', /fully evidence-cited/);
  });

  test('ABORT-class lint → high-severity finding; WARN-class → warn; never blocks', async () => {
    const lint: LintFinding[] = [
      { rule: 'uncited-claim', severity: 'abort', message: 'basis: no evidence' },
      { rule: 'dangling-evidence', severity: 'abort', message: 'FX999 missing' },
      { rule: 'gate-ambiguity', severity: 'warn', message: 'reads done, no gate' },
    ];
    const r = await new TrackerEvidenceLintModule('/ws', gen(lint)).run();
    assert.equal(r.ok, true); // WARN-only: surfaces, never blocks
    assert.equal(r.findings.length, 3);
    assert.equal(r.summary.bySeverity.high, 2);
    assert.equal(r.summary.bySeverity.warn, 1);
    assert.equal(r.findings.find((f) => f.rule === 'uncited-claim')?.severity, 'high');
    assert.equal(r.findings.find((f) => f.rule === 'gate-ambiguity')?.severity, 'warn');
    assert.match(r.summary.note ?? '', /2 integrity .* 1 WARN/);
  });

  test('generator throws → ok=false + error captured, no findings, no throw', async () => {
    const r = await new TrackerEvidenceLintModule('/ws', () => Promise.reject(new Error('boom'))).run();
    assert.equal(r.ok, false);
    assert.equal(r.findings.length, 0);
    assert.equal(r.error?.message, 'boom');
  });
});
