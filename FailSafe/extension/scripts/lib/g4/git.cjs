"use strict";
/**
 * G4 (#638): read committed blobs. `git cat-file blob <rev>:<path>` returns the blob
 * bytes without checkout filters, so CRLF conversion never changes a digest.
 */
const { spawnSync } = require("node:child_process");
const { refuse } = require("./bytes.cjs");

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
  const res = spawnSync("git", ["--no-replace-objects", "-C", repoRoot, ...args], {
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

module.exports = { git, showBlob, requireBlob, resolveCommit, isAncestor, commitsTouching };
