/**
 * Validator profiles for the architecture index core (#531 LD2).
 *
 *   failsafeRepoProfile()        this repository: docs/ARCHITECTURE_INDEX.md, README off-ramp,
 *                                Governance Index registration and the other policy checks on
 *   userRepoProfile(indexPath)   a workspace FailSafe governs: the index path is a setting and
 *                                every FailSafe-only policy check is off
 *
 * linkBase and the registry tail are derived from indexPath, never given separately.
 */
'use strict';

const path = require('node:path');
const { POLICY_CHECKS } = require('./architecture-index-core.cjs');

const USER_REPO_NORMATIVE_GLOBS = Object.freeze([
  'ARCHITECTURE*.md', 'docs/ARCHITECTURE*.md', 'docs/architecture/**/*.md', 'docs/design/**/*.md',
  'docs/adr/**/*.md', 'adr/**/*.md', 'docs/**/*ARCHITECTURE*.md', 'docs/**/*DESIGN*.md',
]);
const USER_REPO_LEGACY_GLOBS = Object.freeze(['docs/archive/**']);
const DEFAULT_INDEX_PATH = 'docs/ARCHITECTURE_INDEX.md';

function checksAll(value) {
  return Object.fromEntries(POLICY_CHECKS.map((k) => [k, value]));
}

function makeProfile({ indexPath, readmePath = 'README.md', governancePath = '', dualRegistrationPrefix = '',
  normativeGlobs, legacyGlobs, checks }) {
  return {
    indexPath,
    readmePath,
    governancePath,
    linkBase: path.posix.dirname(indexPath),
    registryTail: `existing: ${indexPath}#registry`,
    dualRegistrationPrefix,
    normativeGlobs: [...normativeGlobs],
    legacyGlobs: [...legacyGlobs],
    checks,
  };
}

/** This repository. Its normative and legacy lists live in the index itself, so the defaults are empty. */
function failsafeRepoProfile() {
  return makeProfile({
    indexPath: DEFAULT_INDEX_PATH,
    governancePath: 'docs/GOVERNANCE_INDEX.md',
    dualRegistrationPrefix: 'docs/',
    normativeGlobs: [],
    legacyGlobs: [],
    checks: checksAll(true),
  });
}

/** A workspace FailSafe governs. `indexPath` must already be a safe workspace-relative POSIX path. */
function userRepoProfile(indexPath = DEFAULT_INDEX_PATH) {
  return makeProfile({
    indexPath,
    normativeGlobs: USER_REPO_NORMATIVE_GLOBS,
    legacyGlobs: USER_REPO_LEGACY_GLOBS,
    checks: checksAll(false),
  });
}

module.exports = {
  DEFAULT_INDEX_PATH, USER_REPO_NORMATIVE_GLOBS, USER_REPO_LEGACY_GLOBS, makeProfile, failsafeRepoProfile, userRepoProfile,
};
