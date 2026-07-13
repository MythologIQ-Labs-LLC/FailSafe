// Test-run census (plan-test-harness-truthfulness-240 LD5). Required
// IN-PROCESS by @vscode/test-cli's built-in runner: runner.cjs:19-22
// require()s every mochaOpts.require entry BEFORE addFile/run, so this
// module shares the runner's hoisted mocha instance (runner.cjs:10) and can
// patch it. The census is written from BOTH the runner's EVENT_RUN_END
// (fires on failing runs too — runner.cjs:33-35 rejects on failures, so
// teardown alone would miss exactly the diagnostic runs) AND
// mochaGlobalTeardown (completeness backstop); the write is idempotent.
'use strict';

const fs = require('fs');
const path = require('path');
const Mocha = require('mocha');

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const OUT_TEST_DIR = path.join(EXTENSION_ROOT, 'out', 'test');
const CENSUS_PATH = path.join(EXTENSION_ROOT, 'out', 'test-run-census.json');

const executedFiles = new Set();
let summaryPrinted = false;

// Match runner.cjs normalizeCasing: lower-case Windows drive letters so the
// enumerated paths compare equal to the suite.file paths mocha reports.
function normalizeCase(p) {
  if (process.platform === 'win32' && /^[A-Z]:/.test(p)) {
    return p[0].toLowerCase() + p.slice(1);
  }
  return p;
}

// Fresh enumeration of the SAME pattern .vscode-test.mjs:29 declares
// (files: 'out/test/**/*.test.js'), resolved against the extension root.
function enumerateTestFiles() {
  if (!fs.existsSync(OUT_TEST_DIR)) return [];
  return fs.readdirSync(OUT_TEST_DIR, { recursive: true })
    .map((rel) => path.join(OUT_TEST_DIR, String(rel)))
    .filter((abs) => abs.endsWith('.test.js'))
    .map(normalizeCase)
    .sort();
}

function writeCensus() {
  const enumerated = enumerateTestFiles();
  const executed = Array.from(executedFiles).sort();
  const missing = enumerated.filter((f) => !executedFiles.has(f));
  fs.mkdirSync(path.dirname(CENSUS_PATH), { recursive: true });
  fs.writeFileSync(CENSUS_PATH, JSON.stringify({ enumerated, executed, missing }, null, 2));
  if (!summaryPrinted) {
    summaryPrinted = true;
    const ranOfEnumerated = enumerated.length - missing.length;
    process.stdout.write(`census: executed ${ranOfEnumerated}/${enumerated.length} (missing ${missing.length})\n`);
  }
}

const originalRun = Mocha.prototype.run;
Mocha.prototype.run = function censusRun(fn) {
  const runner = originalRun.call(this, fn);
  runner.on(Mocha.Runner.constants.EVENT_SUITE_BEGIN, (suite) => {
    if (suite.file) executedFiles.add(normalizeCase(suite.file));
  });
  runner.on(Mocha.Runner.constants.EVENT_RUN_END, writeCensus);
  return runner;
};

exports.mochaGlobalTeardown = writeCensus;
