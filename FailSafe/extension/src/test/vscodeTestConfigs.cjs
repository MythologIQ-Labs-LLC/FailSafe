// vscode-test configurations by label (#531 LD7). One definition read by
// .vscode-test.mjs (which turns each entry into a test-cli configuration) and
// by the census (which enumerates each configuration's files from disk with
// the same patterns), so the two cannot drift apart.
//
// @vscode/test-cli has no per-configuration ignore, so the default
// configuration leaves out/test/extension-arch/ out by pattern: top-level
// files, plus every sub-folder except extension-arch (an extglob). Each test
// file therefore runs in exactly one configuration.
'use strict';

const path = require('path');

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');

/** The env var each configuration sets so the census knows which one it is counting. */
const LABEL_ENV = 'FAILSAFE_TEST_CENSUS_LABEL';

const CONFIGS = Object.freeze({
  default: Object.freeze({
    files: Object.freeze(['out/test/*.test.js', 'out/test/!(extension-arch)/**/*.test.js']),
  }),
  // FailSafe binds to workspaceFolders[0] at activation, and the default test
  // workspace's docs/ is gitignored, so the managed-architecture-index test
  // needs a workspace of its own: a temp git repository .vscode-test.mjs creates.
  'architecture-index': Object.freeze({
    files: Object.freeze(['out/test/extension-arch/**/*.test.js']),
  }),
});

function censusPathFor(label, root = EXTENSION_ROOT) {
  return path.join(root, 'out', `test-run-census.${label}.json`);
}

module.exports = { EXTENSION_ROOT, LABEL_ENV, CONFIGS, censusPathFor };
