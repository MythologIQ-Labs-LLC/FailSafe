"use strict";
/**
 * G4 (#638): read committed blobs. `git show <rev>:<path>` returns the blob
 * bytes without checkout filters, so CRLF conversion never changes a digest.
 */
const { spawnSync } = require("node:child_process");
const { refuse } = require("./bytes.cjs");

function git(repoRoot, args, opts = {}) {
  const res = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: opts.encoding === "buffer" ? "buffer" : "utf8",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  return res;
}

/** Blob bytes at `rev:path`, or null when the path or commit is absent. */
function showBlob(repoRoot, rev, filePath) {
  const res = git(repoRoot, ["show", `${rev}:${filePath}`], { encoding: "buffer" });
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
