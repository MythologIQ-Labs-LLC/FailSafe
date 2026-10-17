/**
 * #531 LD7: the vscode-test census counts each configuration on its own.
 *
 * With a second vscode-test configuration (label `architecture-index`, its own
 * temp git workspace), a single global census would report every file the
 * other configuration owns as "missing". The census now writes one file per
 * label and enumerates that label's files from disk with the label's own
 * patterns (src/test/vscodeTestConfigs.cjs, the same entries .vscode-test.mjs
 * turns into configurations).
 *
 * The census REPORTS; it does not fail a run. A file that was enumerated but
 * never executed is listed under `missing` and counted in the summary line;
 * the exit status is left to mocha. The last row pins that, so nobody reads
 * the census as a gate.
 *
 * Runs standalone: node --test src/test/censusCore.test.cjs
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { CONFIGS, LABEL_ENV, censusPathFor } = require('./vscodeTestConfigs.cjs');
const { enumerateFor, writeCensus } = require('./censusCore.cjs');
const { removeTempTree } = require('./shared/removeTempTree.cjs');

const made = [];
test.after(() => { for (const d of made) removeTempTree(d); });

/** A fake extension root with compiled test files in both configurations' folders. */
function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-census-'));
  made.push(root);
  for (const rel of ['out/test/top.test.js', 'out/test/governance/a.test.js', 'out/test/roadmap/deep/b.test.js',
    'out/test/extension-arch/architecture-index.extensionHost.test.js', 'out/test/governance/helper.js']) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), '');
  }
  return root;
}

const rel = (root, list) => list.map((f) => path.relative(root, f).split(path.sep).join('/')).sort();

test('two labelled configurations, each with patterns, and one census file per label', () => {
  assert.deepEqual(Object.keys(CONFIGS), ['default', 'architecture-index']);
  assert.equal(LABEL_ENV, 'FAILSAFE_TEST_CENSUS_LABEL');
  assert.notEqual(censusPathFor('default'), censusPathFor('architecture-index'));
  assert.match(censusPathFor('architecture-index'), /test-run-census\.architecture-index\.json$/);
});

test('each label enumerates only its own files; together they cover every test file exactly once', () => {
  const root = fakeRoot();
  const def = rel(root, enumerateFor('default', root));
  const arch = rel(root, enumerateFor('architecture-index', root));
  assert.deepEqual(def, ['out/test/governance/a.test.js', 'out/test/roadmap/deep/b.test.js', 'out/test/top.test.js']);
  assert.deepEqual(arch, ['out/test/extension-arch/architecture-index.extensionHost.test.js']);
  assert.equal(def.filter((f) => arch.includes(f)).length, 0, 'a file is claimed by both configurations');
});

test('an unknown label enumerates nothing rather than guessing a pattern', () => {
  assert.deepEqual(enumerateFor('no-such-label', fakeRoot()), []);
});

test('a file enumerated but not executed is reported as missing; the census does not fail the run', () => {
  const root = fakeRoot();
  const enumerated = enumerateFor('default', root);
  const executed = new Set(enumerated.slice(0, 2));
  const before = process.exitCode;
  const out = path.join(root, 'out', 'census.json');
  const summary = writeCensus({ label: 'default', enumerated, executed, censusPath: out });
  assert.equal(summary, 'census[default]: executed 2/3 (missing 1)');
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(written.label, 'default');
  assert.deepEqual(written.missing, [enumerated[2]]);
  assert.equal(written.executed.length, 2);
  assert.equal(process.exitCode, before, 'the census changed the exit code; it only reports');
});
