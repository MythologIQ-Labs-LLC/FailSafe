#!/usr/bin/env node
/**
 * #404 guard: fail when a test file exists that no runner executes.
 *
 * Twenty-two `*.test.cjs` suites (223 cases) sat in the tree executing in zero
 * CI gates — `.vscode-test.mjs` globs `out/test/**\/*.test.js`, tsconfig has no
 * `allowJs`, and nothing ran `node --test`. Authors believed they had coverage
 * and reviewers credited it; four PRs in one day cited those suites as their
 * evidence. Five of the cases had rotted, and the failures were real: a stale
 * 476-row snapshot, two malformed FEATURE_INDEX rows the parser silently
 * dropped, and two override citations pointing at tests that no longer exist.
 *
 * Runners in this repo:
 *   *.test.ts  under src/test/  -> compiled to out/ and run by vscode-test
 *   *.test.cjs under src/test/  -> run by `npm run test:node` (node --test)
 *   *.spec.ts  under src/test/ui -> run by playwright
 */
const fs = require("fs");
const path = require("path");

const EXT_ROOT = path.resolve(__dirname, "..");
const TEST_ROOT = path.join(EXT_ROOT, "src", "test");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function classify(rel) {
  if (rel.endsWith(".test.ts")) return "vscode-test";
  if (rel.endsWith(".test.cjs")) return "node --test (test:node)";
  if (rel.endsWith(".spec.ts")) return rel.startsWith("ui" + path.sep) ? "playwright" : null;
  return "not-a-test";
}

function main() {
  if (!fs.existsSync(TEST_ROOT)) {
    console.error(`[test-runner-coverage] test root missing: ${TEST_ROOT}`);
    process.exit(1);
  }
  const orphans = [];
  for (const abs of walk(TEST_ROOT)) {
    const rel = path.relative(TEST_ROOT, abs);
    if (!/\.(test|spec)\.[cm]?[jt]s$/.test(rel)) continue;
    if (classify(rel) === null) orphans.push(rel);
  }
  if (orphans.length) {
    console.error(
      "[test-runner-coverage] FAIL — these test files match no runner glob, so CI never executes them:",
    );
    for (const o of orphans) console.error(`  - src/test/${o.split(path.sep).join("/")}`);
    console.error(
      "\nEither move the file where a runner picks it up, or add a runner. A test nothing runs is worse\n" +
        "than no test: it reads as coverage in review. See #404.",
    );
    process.exit(1);
  }
  console.log("[test-runner-coverage] PASS — every test file is claimed by a runner.");
}

main();
