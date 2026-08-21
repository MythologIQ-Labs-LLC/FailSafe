/**
 * #404: one definition of "which runner owns which test file", shared by the
 * runner (`run-node-tests.cjs`) and the guard (`check-test-runner-coverage.cjs`).
 *
 * Two audits of this work found the same class of bug twice: a shell glob that
 * expanded on one platform and not another, and a guard whose fallthrough
 * returned a non-null value so 8 of the 12 test-file shapes it admitted were
 * silently treated as "fine". Both stemmed from the runner and the guard
 * disagreeing about what a test file is. They now share this module.
 */
const fs = require("fs");
const path = require("path");

const EXT_ROOT = path.resolve(__dirname, "..");
const TEST_ROOT = path.join(EXT_ROOT, "src", "test");

/** Every test-ish shape we recognise, so nothing slips past the pre-filter. */
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]s$/;

/**
 * Which runner executes this file, or null if nothing does.
 * Anything not explicitly claimed returns null — failing CLOSED is the whole
 * point of the guard.
 */
function runnerFor(relPath) {
  const rel = relPath.split(path.sep).join("/");
  if (rel.endsWith(".test.ts")) return "vscode-test";
  if (rel.endsWith(".test.cjs")) return "node --test (test:node)";
  if (rel.endsWith(".test.js")) return "vscode-test (mirrored by copy-ui-js)";
  if (rel.endsWith(".spec.ts")) return rel.startsWith("ui/") ? "playwright" : null;
  return null;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** All test files under src/test, as { abs, rel, runner }. */
function discoverTestFiles() {
  return walk(TEST_ROOT)
    .map((abs) => ({ abs, rel: path.relative(TEST_ROOT, abs) }))
    .filter((f) => TEST_FILE_RE.test(f.rel))
    .map((f) => ({ ...f, runner: runnerFor(f.rel) }));
}

module.exports = { EXT_ROOT, TEST_ROOT, TEST_FILE_RE, runnerFor, discoverTestFiles };
