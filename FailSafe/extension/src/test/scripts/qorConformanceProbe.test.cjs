/**
 * FX942 — the conformance probe can itself be shown to discriminate.
 *
 * This is the load-bearing suite. A probe that reports FALSIFIABLE for everything
 * is a vacuous control of exactly the kind it exists to find — and worse than
 * having no probe, because it manufactures confidence in the opposite direction.
 *
 * So assertion 2 below feeds the classifier a stub that exits 0 on BOTH fixtures
 * and requires NOT-FALSIFIABLE. If that ever passes trivially, the probe has
 * stopped working and the report it prints means nothing.
 *
 * Runs standalone: node --test src/test/scripts/qorConformanceProbe.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const probeMod = require('../../../scripts/qor-conformance-probe.cjs');
const {
  classify, probe, render, versionBoundary,
  FALSIFIABLE, NOT_FALSIFIABLE, INCONCLUSIVE, INAPPLICABLE,
  MATCH, UNTESTED,
} = probeMod;

/** A stub "control": a node script with a fixed exit code and output. */
function stubEntry({ id, cleanExit, defectExit, defectOut, signal }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `qor-stub-${id}-`));
  const script = path.join(dir, 'stub.cjs');
  // The stub reads a marker file the fixture builder plants, so clean and defect
  // runs are distinguishable without the harness telling it which is which.
  fs.writeFileSync(script, `
    const fs = require('fs');
    const path = require('path');
    const ws = process.argv[2];
    const isDefect = fs.existsSync(path.join(ws, 'DEFECT'));
    if (isDefect) { process.stdout.write(${JSON.stringify(defectOut || '')}); process.exit(${defectExit}); }
    process.exit(${cleanExit});
  `, 'utf8');
  return {
    id,
    expectDefectSignal: signal,
    buildClean: () => {},
    buildDefect: (ws) => { fs.writeFileSync(path.join(ws, 'DEFECT'), 'x', 'utf8'); },
    invoke: (ws) => [process.execPath, [script, ws]],
  };
}

describe('FX942 conformance probe classification', () => {
  it('classifies a control that fails only on its defect fixture as FALSIFIABLE', () => {
    const r = classify(stubEntry({
      id: 'good', cleanExit: 0, defectExit: 1,
      defectOut: 'planted defect detected', signal: 'planted defect',
    }));
    assert.equal(r.result, FALSIFIABLE, r.detail);
  });

  it('classifies a control that cannot be made to fail as NOT-FALSIFIABLE', () => {
    // THE PROBE'S OWN FALSIFIER. A stub that exits 0 no matter what it is given
    // is the shape of every vacuously-passing control found at ledger #602. If
    // the classifier cannot separate this from a working control, its report is
    // worthless.
    const r = classify(stubEntry({
      id: 'vacuous', cleanExit: 0, defectExit: 0, defectOut: '', signal: 'anything',
    }));
    assert.equal(r.result, NOT_FALSIFIABLE, r.detail);
  });

  it('classifies a control that fails on BOTH fixtures as INCONCLUSIVE', () => {
    // Fails clean too, so the fixture is suspect rather than the control.
    const r = classify(stubEntry({
      id: 'always-fails', cleanExit: 1, defectExit: 1,
      defectOut: 'boom', signal: 'boom',
    }));
    assert.equal(r.result, INCONCLUSIVE, r.detail);
    assert.match(r.detail, /clean fixture failed/);
  });

  it('classifies a defect failure WITHOUT the control signal as INCONCLUSIVE', () => {
    // The case that motivated expectDefectSignal: instruction_hygiene_lint exits
    // 2 on a usage error. Exit-code-only logic would score that FALSIFIABLE.
    const r = classify(stubEntry({
      id: 'usage-error', cleanExit: 0, defectExit: 2,
      defectOut: 'usage: --staged | --files PATH...', signal: 'instruction-hygiene finding',
    }));
    assert.equal(r.result, INCONCLUSIVE, r.detail);
    assert.match(r.detail, /without its signal/);
  });

  it('reports an inline-listed control as INAPPLICABLE without running it', () => {
    // Rooted at an empty dir so the repository's own permanent_skips
    // declarations cannot leak in and make this assertion about something else.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-probe-bare-'));
    const results = probe([], [
      { id: 'seal_artifacts', reason: 'wants a pytest collected-count', evidence: 'ledger #602' },
    ], bare);
    // Addressed by id, not by position or count: probe() also appends the
    // version-boundary row (FX944), and this assertion is about seal_artifacts.
    const row = results.find((r) => r.id === 'seal_artifacts');
    assert.ok(row, 'seal_artifacts must appear in the report');
    assert.equal(row.result, INAPPLICABLE);
    assert.match(row.detail, /ledger #602/);
    assert.equal(results.filter((r) => r.id === 'seal_artifacts').length, 1,
      'a declared control must be reported exactly once');
  });

  it('reports a config-declared control as INAPPLICABLE, and does not run it', () => {
    // #233 Scope C. The declaration in `.qorlogic/config.json` is the same one
    // `permanent_skips` reads to close the skip event, so a gate declared there
    // must never be probed: probing it would report NOT-FALSIFIABLE, which is
    // true and misleading.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-probe-cfg-'));
    fs.mkdirSync(path.join(root, '.qorlogic'));
    fs.writeFileSync(
      path.join(root, '.qorlogic', 'config.json'),
      JSON.stringify({ permanent_skips: { data_api_acl_lint: 'x'.repeat(60) } }),
      'utf8'
    );

    // If the probe runs this entry despite the declaration, the fixture builder
    // throws and the test fails loudly — "without being run" is asserted, not assumed.
    const trap = {
      id: 'data_api_acl_lint',
      expectDefectSignal: 'never',
      buildClean: () => { throw new Error('declared control was RUN'); },
      buildDefect: () => { throw new Error('declared control was RUN'); },
      invoke: () => { throw new Error('declared control was RUN'); },
    };

    const results = probe([trap], [], root);
    const row = results.find((r) => r.id === 'data_api_acl_lint');
    assert.ok(row, 'the declared control must appear in the report');
    assert.equal(row.result, INAPPLICABLE, row.detail);
    assert.match(row.detail, /permanent_skips/,
      'the report must say the declaration is where this came from');
  });

  it('exits 0 even when a control is NOT-FALSIFIABLE (report-only posture)', () => {
    const res = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', '..', '..', 'scripts', 'qor-conformance-probe.cjs'), '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, 'the probe must not gate; it reports');
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'probe emitted no results');
  });


  // ---- FX944: the version boundary, reported where a human will see it -------
  //
  // Audit V1 (iteration 1) VETOed reporting this only into ConsumerDiagnostics,
  // which nothing renders. These three assertions exist because a fact nobody
  // reads is a control that measures nothing (ledger #602, one level up).

  /** A fake compiled hostLayouts module, so the declared constant is injectable. */
  function fakeCompiled(declared, { srcNewer = false, missing = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-compiled-'));
    const outDir = path.join(dir, 'out', 'qorlogic');
    const srcDir = path.join(dir, 'src', 'qorlogic');
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'hostLayouts.ts');
    const outFile = path.join(outDir, 'hostLayouts.js');
    if (!missing) {
      fs.writeFileSync(outFile,
        `exports.TESTED_AGAINST_QOR_LOGIC_VERSION = ${JSON.stringify(declared)};
`, 'utf8');
    }
    fs.writeFileSync(srcFile, '// source', 'utf8');
    if (srcNewer) {
      // src edited after the last compile - the ORDINARY local state, since
      // `npm run test:node` does not compile. Audit V2 required its own check.
      const future = new Date(Date.now() + 60_000);
      fs.utimesSync(srcFile, future, future);
    } else if (!missing) {
      const future = new Date(Date.now() + 60_000);
      fs.utimesSync(outFile, future, future);
    }
    return dir;
  }

  it('reports UNTESTED when the installed version is not the declared tested-against one', () => {
    const row = versionBoundary({ installed: '0.170.0', extRoot: fakeCompiled('0.169.0') });
    assert.equal(row.id, 'version_boundary');
    assert.equal(row.result, UNTESTED, row.detail);
    assert.match(row.detail, /0\.170\.0/, 'the report must name the installed version');
    assert.match(row.detail, /0\.169\.0/, 'the report must name the declared version');
  });

  it('reports MATCH when the installed version is exactly the declared one', () => {
    const row = versionBoundary({ installed: '0.169.0', extRoot: fakeCompiled('0.169.0') });
    assert.equal(row.result, MATCH, row.detail);
  });

  it('renders the version-boundary row, so the fact reaches a human (audit V1)', () => {
    // THE V1 FALSIFIER, and it must bite on the REAL run, not on render() being
    // handed a row. Iteration 1 was VETOed for computing this fact into a
    // surface nothing renders; asserting that render() prints a row it was
    // given would restate that same mistake one level down. So: execute the
    // probe as an operator does, and require the fact in what they see.
    const res = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', '..', '..', 'scripts', 'qor-conformance-probe.cjs')],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, 'the probe must stay report-only');
    assert.match(res.stdout, /version_boundary/,
      'the version boundary must appear in the report an operator actually reads');
    assert.match(res.stdout, /MATCH|UNTESTED|INCONCLUSIVE/,
      'the row must carry a verdict, not just a label');
  });;

  it('reports INCONCLUSIVE, not MATCH, when the compiled constant is absent', () => {
    const row = versionBoundary({ installed: '0.169.0', extRoot: fakeCompiled('0.169.0', { missing: true }) });
    assert.equal(row.result, INCONCLUSIVE, row.detail);
    assert.notEqual(row.result, MATCH, 'a missing build must never report a match it did not verify');
    assert.match(row.detail, /not built|missing/i);
  });

  it('reports INCONCLUSIVE, not MATCH, when the compiled constant is STALE (audit V2)', () => {
    // The second half of the same claim, given its own check. `npm run test:node`
    // does not compile, so this branch is the one most likely to execute.
    const row = versionBoundary({ installed: '0.169.0', extRoot: fakeCompiled('0.168.0', { srcNewer: true }) });
    assert.equal(row.result, INCONCLUSIVE, row.detail);
    assert.match(row.detail, /stale/i, 'the report must say WHY it could not conclude');
  });

  it('names every unfalsifiable control in its rendered report', () => {
    const out = render([
      { id: 'alpha', result: NOT_FALSIFIABLE, detail: 'd' },
      { id: 'beta', result: FALSIFIABLE, detail: 'd' },
    ]);
    assert.match(out, /not measuring anything/);
    assert.match(out, /Review: alpha/);
    assert.ok(!/Review:.*beta/.test(out), 'a falsifiable control must not be listed for review');
  });
});
