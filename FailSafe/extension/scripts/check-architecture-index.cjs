#!/usr/bin/env node
/**
 * Architecture index check (#530, FX1001).
 *
 *   node FailSafe/extension/scripts/check-architecture-index.cjs [--repo-root <dir>]
 *
 * Reads docs/ARCHITECTURE_INDEX.md (registry table, `architecture-normative` and
 * `architecture-legacy` fenced blocks), README.md and docs/GOVERNANCE_INDEX.md, takes
 * the tracked-file list from `git ls-files -z`, and prints one
 * `[architecture-index] <code>: <detail>` line per problem, then PASS or FAIL.
 * Exit 0 on PASS, 1 on FAIL. A git failure is a FAIL, never a silent pass.
 *
 * It compares strings only: metadata, links, tracked state, uniqueness and
 * registration. It cannot prove that two documents do not overlap in meaning.
 *
 * The checks live in `lib/architecture-index-core.cjs` (#531 LD2), shared with the
 * extension's managed index; this script passes the FailSafe-repo profile from
 * `lib/architecture-index-profiles.cjs` and re-exports the old entry points bound to
 * it, so existing requires keep working.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('./lib/architecture-index-core.cjs');
const { failsafeRepoProfile } = require('./lib/architecture-index-profiles.cjs');

const PROFILE = failsafeRepoProfile();
const INDEX_PATH = PROFILE.indexPath;
const README_PATH = PROFILE.readmePath;
const GOVERNANCE_PATH = PROFILE.governancePath;
const REGISTRY_TAIL = PROFILE.registryTail;

const validate = (input) => core.validate(input, PROFILE);
const parseRegistry = (indexText) => core.parseRegistry(indexText, PROFILE);
const pathValues = (cell) => core.pathValues(cell, PROFILE);
const suggestionText = (list) => core.suggestionText(list, PROFILE);

/** `git ls-files -z` at the repository root; throws unless git exits 0. */
function listTrackedFiles(repoRoot) {
  const res = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (res.error) throw new Error(`git ls-files could not run: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`git ls-files exited ${res.status}: ${String(res.stderr).trim()}`);
  return res.stdout.split('\0').filter(Boolean);
}

function readOrEmpty(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function loadRepoInputs(repoRoot) {
  return {
    indexText: readOrEmpty(path.join(repoRoot, INDEX_PATH)),
    readmeText: readOrEmpty(path.join(repoRoot, README_PATH)),
    governanceText: readOrEmpty(path.join(repoRoot, GOVERNANCE_PATH)),
    tracked: listTrackedFiles(repoRoot),
  };
}

function main(argv) {
  let repoRoot = path.resolve(__dirname, '..', '..', '..');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root' && argv[i + 1]) { repoRoot = path.resolve(argv[i + 1]); i += 1; }
    else {
      console.error(`[architecture-index] usage: check-architecture-index.cjs [--repo-root <dir>] (unknown argument ${argv[i]})`);
      return 1;
    }
  }
  let inputs;
  try { inputs = loadRepoInputs(repoRoot); } catch (err) {
    console.error(`[architecture-index] git-ls-files: ${err.message}`);
    console.error('[architecture-index] FAIL');
    return 1;
  }
  const result = validate(inputs);
  for (const p of result.problems) console.error(`[architecture-index] ${p.code}: ${p.detail}`);
  if (result.problems.length) {
    console.error(`[architecture-index] FAIL (${result.problems.length} problem(s))`);
    return 1;
  }
  console.log(`[architecture-index] PASS (${result.rows.length} registry rows, ${result.globs.length} normative globs, ` +
    `${result.normativeMatches.length} normative documents, ${result.legacy.length} legacy prefixes, ${inputs.tracked.length} tracked files)`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  COLUMNS: core.COLUMNS, STATUSES: core.STATUSES, REGISTRY_TAIL, PROFILE, globToRegExp: core.globToRegExp,
  matchesGlob: core.matchesGlob, tokens: core.tokens, resolveTarget: core.resolveTarget,
  isPathShapedToken: core.isPathShapedToken, pathValues, governanceRegistered: core.governanceRegistered, parseRegistry,
  suggestFor: core.suggestFor, suggestionText, validate, listTrackedFiles, loadRepoInputs, main,
};
