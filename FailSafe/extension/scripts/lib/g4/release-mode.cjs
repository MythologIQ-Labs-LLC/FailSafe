"use strict";
/**
 * G4 (#638) release-mode preconditions. A release verification may PASS only
 * with every out-of-band trust input present, on a clean checkout of the exact
 * qualified commit, reading the repository's own checkpoints and TSA policy.
 * Anything missing is BLOCKED: it is never downgraded to a limitation.
 */
const fs = require("node:fs");
const path = require("node:path");
const { git, requireBlob } = require("./git.cjs");
const layout = require("./layout.cjs");
const { block, refuse } = require("./bytes.cjs");

const G4_DIR = "tools/g4";

const HEX64 = /^[0-9a-f]{64}$/;
const HEAD_REF = /^g4-\d{6}:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Required release inputs: option name, CLI flag and accepted shape. */
const REQUIRED = [
  ["trustFingerprint", "--trust-fingerprint", HEX64],
  ["trustedHead", "--trusted-head", HEAD_REF],
  ["repository", "--repository", REPOSITORY],
  ["expectedCommit", "--commit", COMMIT],
];

function assertInputs(o) {
  const missing = REQUIRED.filter(([key]) => !o[key]).map(([key, flag]) => `${key} (${flag})`);
  if (missing.length) throw block("RELEASE_INPUT_MISSING", `a release verification requires ${missing.join(", ")}`);
  const malformed = REQUIRED.filter(([key, , shape]) => !shape.test(o[key])).map(([key, flag]) => `${key} (${flag})`);
  if (malformed.length) throw block("RELEASE_INPUT_MALFORMED", `malformed release input: ${malformed.join(", ")}`);
}

function assertNoOverrides(o) {
  if (o.tsaCaFile) {
    throw block("TSA_OVERRIDE_NOT_RELEASE", "--tsa-ca bypasses the committed TSA root pin; a release verification must use tools/g4/tsa-policy.json");
  }
  if (o.checkpointsDir) {
    throw block("RELEASE_OVERRIDE_REFUSED", "--checkpoints is refused in a release verification; checkpoints are read from the repository");
  }
}

function porcelain(repoRoot, args) {
  const res = git(repoRoot, ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none", ...args]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git status failed for the release checkout");
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/** No modified or untracked file anywhere, and no ignored file under tools/g4. */
function assertCleanCheckout(repoRoot) {
  const dirty = [...porcelain(repoRoot, []), ...porcelain(repoRoot, ["--ignored", "--", G4_DIR])];
  if (dirty.length) {
    throw block("RELEASE_TREE_DIRTY", `the checkout is not clean (${dirty.length} path(s)); first: ${dirty[0].trim()}`);
  }
}

function readOrNull(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

/**
 * The verifier reads checkpoints and certificates from the checkout. `git
 * status` can be told to look away (skip-worktree, assume-unchanged, a
 * same-size swap with the mtime restored), so each such file is compared, byte
 * for byte, with its committed blob at HEAD.
 */
function assertEvidenceMatchesHead(repoRoot, head) {
  const res = git(repoRoot, ["ls-tree", "-r", "--name-only", "-z", head, "--", layout.CHECKPOINTS_DIR, layout.KEYS_DIR]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git ls-tree failed for the release checkout");
  for (const rel of res.stdout.split("\0").filter(Boolean)) {
    const disk = readOrNull(path.join(repoRoot, rel));
    if (!disk || !disk.equals(requireBlob(repoRoot, head, rel, "RELEASE_TREE_MISMATCH"))) {
      throw refuse("RELEASE_TREE_MISMATCH", `${rel} in the checkout is not the blob committed at ${head}`);
    }
  }
}

const EVIDENCE_FILES = Object.values(layout.FILES);
const EVIDENCE_DIR = new RegExp(`^${layout.CHECKPOINTS_DIR}/(g4-\\d{6})$`);
const EVIDENCE_PATH = new RegExp(`^${layout.CHECKPOINTS_DIR}/(g4-\\d{6})/([^/]+)$`);
const EVIDENCE_ROOTS = [layout.CHECKPOINTS_DIR, layout.KEYS_DIR];

/** One `git ls-tree -z` record as { mode, type, rel }. A path may itself contain a tab. */
function treeEntry(record) {
  const tab = record.indexOf("\t");
  if (tab < 0) throw block("REPO_UNREADABLE", "unparseable git ls-tree record");
  const [mode, type] = record.slice(0, tab).split(" ");
  return { mode, type, rel: record.slice(tab + 1) };
}

/** Every entry committed at `head`, directories included. */
function headTree(repoRoot, head) {
  const res = git(repoRoot, ["ls-tree", "-r", "-t", "-z", head]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git ls-tree failed for the release checkout");
  return res.stdout.split("\0").filter(Boolean).map(treeEntry);
}

const fold = (p) => p.normalize("NFKC").toLowerCase();
/** `p` is `dir` or inside it. */
const within = (p, dir) => p === dir || p.startsWith(`${dir}/`);

/**
 * On a case-insensitive or normalizing filesystem, `tools/g4/Checkpoints/x`
 * checks out into the real evidence directory while every exact-path Git check
 * looks elsewhere. No committed path may reach an evidence directory through a
 * spelling that differs only by letter case or Unicode form.
 */
function assertNoEvidenceAlias(entries, head) {
  for (const { rel } of entries) {
    const alias = EVIDENCE_ROOTS.find((dir) => within(fold(rel), dir) && !within(rel, dir));
    if (alias) throw refuse("RELEASE_EVIDENCE_LAYOUT", `${JSON.stringify(rel)} at ${head} differs from ${alias} only by case or Unicode form`);
  }
}

/**
 * The committed checkpoint tree must be exactly five regular files per
 * g4-NNNNNN directory: no extra, nested, stray or empty path, no symbolic
 * link, submodule or executable entry, and no missing file. The checks that
 * follow read only the files they expect, so anything else would go unseen.
 */
function assertEvidenceLayout(entries, head) {
  const seen = new Map();
  for (const { mode, type, rel } of entries.filter((e) => e.rel.startsWith(`${layout.CHECKPOINTS_DIR}/`))) {
    const m = type === "tree" ? EVIDENCE_DIR.exec(rel) : EVIDENCE_PATH.exec(rel);
    const regular = type === "tree" || (mode === "100644" && EVIDENCE_FILES.includes(m && m[2]));
    if (!m || !regular) {
      throw refuse("RELEASE_EVIDENCE_LAYOUT", `${mode} ${type} ${JSON.stringify(rel)} at ${head} is not a checkpoint directory or one of its five regular files`);
    }
    seen.set(m[1], (seen.get(m[1]) || []).concat(m[2] || []));
  }
  for (const [id, files] of seen) {
    const missing = EVIDENCE_FILES.filter((f) => !files.includes(f));
    if (missing.length) throw refuse("RELEASE_EVIDENCE_LAYOUT", `${id} at ${head} lacks ${missing.join(", ")}`);
  }
}

/**
 * Throws unless `o` and the checkout satisfy every release precondition.
 * @param {{release?:boolean}} o verifier options
 * @param {string} repoRoot
 * @param {string} head resolved HEAD commit
 */
function assertReleasePreconditions(o, repoRoot, head) {
  if (!o.release) return;
  assertNoOverrides(o);
  assertInputs(o);
  if (head !== o.expectedCommit) {
    throw refuse("RELEASE_COMMIT_MISMATCH", `checkout is at ${head}, but the qualified commit is ${o.expectedCommit}`);
  }
  const entries = headTree(repoRoot, head);
  assertNoEvidenceAlias(entries, head);
  assertEvidenceLayout(entries, head);
  assertCleanCheckout(repoRoot);
  assertEvidenceMatchesHead(repoRoot, head);
}

module.exports = { assertReleasePreconditions };
