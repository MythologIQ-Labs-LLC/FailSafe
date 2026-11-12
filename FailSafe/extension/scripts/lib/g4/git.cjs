"use strict";
/**
 * G4 (#638): read committed blobs. `git cat-file blob <rev>:<path>` returns the blob
 * bytes without checkout filters, so CRLF conversion never changes a digest.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { refuse, block } = require("./bytes.cjs");

/** Variables that point Git at another repository, index or object store. */
const REDIRECTS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_GRAFT_FILE", "GIT_SHALLOW_FILE", "GIT_REPLACE_REF_BASE"];

/** The environment for Git, without anything that would make `-C repoRoot` read elsewhere. */
function gitEnv() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (REDIRECTS.includes(name.toUpperCase())) delete env[name];
  }
  return env;
}

function git(repoRoot, args, opts = {}) {
  // --no-replace-objects: a replace ref must never substitute an object read here.
  // core.commitGraph=false: history is walked from the commit objects themselves, never from a
  // commit-graph file, which is unauthenticated and could rewire parents (audit VETO #962 V8).
  const res = spawnSync("git", ["--no-replace-objects", "-c", "core.commitGraph=false", "-C", repoRoot, ...args], {
    env: gitEnv(),
    encoding: opts.encoding === "buffer" ? "buffer" : "utf8",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  return res;
}

/** Blob bytes at `rev:path`, or null when the path or commit is absent. */
function showBlob(repoRoot, rev, filePath) {
  // cat-file never treats its argument as a working-tree path, so a long rev:path cannot hit
  // Windows MAX_PATH ("Filename too long") the way `git show` can; it also refuses non-blobs.
  const res = git(repoRoot, ["cat-file", "blob", `${rev}:${filePath}`], { encoding: "buffer" });
  if (res.status !== 0) return null;
  return res.stdout;
}

function requireBlob(repoRoot, rev, filePath, code) {
  const buf = showBlob(repoRoot, rev, filePath);
  if (buf === null) throw refuse(code, `${filePath} is not readable at ${rev}`);
  return buf;
}

/** Full commit SHA for `rev`, or null when the object is not a commit here. */
function resolveCommit(repoRoot, rev) {
  const res = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  if (res.status !== 0) return null;
  return res.stdout.trim();
}

function isAncestor(repoRoot, older, newer) {
  return git(repoRoot, ["merge-base", "--is-ancestor", older, newer]).status === 0;
}

/** Commits that touched `filePath`, oldest first. */
function commitsTouching(repoRoot, filePath) {
  const res = git(repoRoot, ["log", "--format=%H", "--reverse", "--", filePath]);
  if (res.status !== 0) return null;
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/**
 * The verifier's history checks (revocation registry, archived CRLs) are only
 * as complete, and only as genuine, as the objects they read.
 * - A shallow clone, or a planted .git/shallow or .git/info/grafts, hides
 *   commits while HEAD keeps its SHA: BLOCKED (audit VETO #961 V7).
 * - `git fsck --full` must pass, so every object re-hashes to its id and the
 *   history is connected; a loose or packed object substituted under the same
 *   id is BLOCKED REPO_INTEGRITY (audit VETO #962 V9).
 */
function assertCompleteHistory(repoRoot) {
  const res = git(repoRoot, ["rev-parse", "--is-shallow-repository"]);
  if (res.status !== 0) throw block("REPO_UNREADABLE", "git rev-parse failed");
  if (res.stdout.trim() !== "false") {
    throw block("REPO_INCOMPLETE_HISTORY", "the repository is a shallow clone; G4 verification needs a complete clone (git fetch --unshallow)");
  }
  for (const name of ["shallow", "info/grafts"]) {
    const rel = git(repoRoot, ["rev-parse", "--git-path", name]).stdout.trim();
    if (rel && fs.existsSync(path.resolve(repoRoot, rel))) {
      throw block("REPO_INCOMPLETE_HISTORY", `.git/${name} is present; G4 verification needs complete, ungrafted history`);
    }
  }
  const fsck = git(repoRoot, ["fsck", "--full", "--no-dangling", "--no-progress"]);
  if (fsck.status !== 0) {
    const first = `${fsck.stderr || ""}${fsck.stdout || ""}`.split(/\r?\n/).find(Boolean) || `exit ${fsck.status}`;
    throw block("REPO_INTEGRITY", `git fsck --full failed: ${first}`);
  }
}

module.exports = { git, showBlob, requireBlob, resolveCommit, isAncestor, commitsTouching, assertCompleteHistory };
