// Test-run census (plan-test-harness-truthfulness-240 LD5). Required
// IN-PROCESS by @vscode/test-cli's built-in runner: runner.cjs:19-22
// require()s every mochaOpts.require entry BEFORE addFile/run, so this
// module shares the runner's hoisted mocha instance (runner.cjs:10) and can
// patch it. The census is written from BOTH the runner's EVENT_RUN_END
// (fires on failing runs too — runner.cjs:33-35 rejects on failures, so
// teardown alone would miss exactly the diagnostic runs) AND
// mochaGlobalTeardown (completeness backstop); the write is idempotent.
//
// #531 LD7: one census per vscode-test configuration. Each configuration sets
// FAILSAFE_TEST_CENSUS_LABEL (vscodeTestConfigs.cjs LABEL_ENV) through its
// `env`; the census enumerates that label's files from disk with the label's
// own patterns and writes out/test-run-census.<label>.json. It reports
// executed-of-enumerated and lists the missing files; it does not change the
// exit status (mocha's failures do that).
'use strict';

const fs = require('fs');
const Mocha = require('mocha');
const { LABEL_ENV, censusPathFor } = require('./vscodeTestConfigs.cjs');
const { normalizeCase, enumerateFor, writeCensus } = require('./censusCore.cjs');

const LABEL = process.env[LABEL_ENV] || 'unlabelled';
const CENSUS_PATH = censusPathFor(LABEL);

// R4: delete any stale census at require-time. This module is require()d before
// the run starts (runner.cjs:19-22). If a load-phase crash means run() never
// returns, write never fires; without this, a PRIOR run's census would
// masquerade as fresh. Removing it up front keeps absence-of-file a loud signal.
try { fs.rmSync(CENSUS_PATH, { force: true }); } catch { /* best-effort */ }

const executedFiles = new Set();
let summaryPrinted = false;

function write() {
  // An unknown or missing label enumerates nothing (censusCore), so the summary
  // reads executed N/0 and the label in the file name says why.
  const summary = writeCensus({ label: LABEL, enumerated: enumerateFor(LABEL), executed: executedFiles, censusPath: CENSUS_PATH });
  if (!summaryPrinted) {
    summaryPrinted = true;
    process.stdout.write(`${summary}
`);
  }
}

const originalRun = Mocha.prototype.run;
Mocha.prototype.run = function censusRun(fn) {
  const runner = originalRun.call(this, fn);
  runner.on(Mocha.Runner.constants.EVENT_SUITE_BEGIN, (suite) => {
    if (suite.file) executedFiles.add(normalizeCase(suite.file));
  });
  runner.on(Mocha.Runner.constants.EVENT_RUN_END, write);
  return runner;
};

exports.mochaGlobalTeardown = write;
