#!/usr/bin/env node
/**
 * #404 guard: fail when a test file exists that no runner executes.
 *
 * Twenty-two `*.test.cjs` suites (223 cases) sat in the tree executing in zero
 * CI gates — `.vscode-test.mjs` globs `out/test/**\/*.test.js`, tsconfig has no
 * `allowJs`, and nothing ran `node --test`. Authors believed they had coverage
 * and reviewers credited it; four PRs in one day cited those suites as their
 * evidence. Running them exposed five real defects, including a FEATURE_INDEX
 * header that had been wrong by 248 entries for three months.
 *
 * The first version of this guard had the bug it exists to prevent: its
 * fallthrough returned a non-null value, so `.test.mjs`, `.spec.cjs` and six
 * other shapes were admitted by the pre-filter and then silently treated as
 * claimed. It now fails CLOSED — anything `runnerFor()` does not explicitly
 * claim is an orphan. Runner ownership lives in test-file-discovery.cjs so the
 * runner and this guard cannot drift apart.
 */
const { discoverTestFiles } = require("./test-file-discovery.cjs");

function main() {
  const files = discoverTestFiles();
  if (files.length === 0) {
    console.error("[test-runner-coverage] FAIL — no test files discovered at all; check the test root.");
    process.exit(1);
  }
  const orphans = files.filter((f) => f.runner === null);
  if (orphans.length) {
    console.error(
      "[test-runner-coverage] FAIL — these test files match no runner, so CI never executes them:",
    );
    for (const o of orphans) console.error(`  - src/test/${o.rel.split("\\").join("/")}`);
    console.error(
      "\nEither move the file where a runner picks it up, or teach a runner about it in\n" +
        "scripts/test-file-discovery.cjs. A test nothing runs is worse than no test:\n" +
        "it reads as coverage in review. See #404.",
    );
    process.exit(1);
  }
  const byRunner = files.reduce((acc, f) => {
    acc[f.runner] = (acc[f.runner] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(byRunner)
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
  console.log(`[test-runner-coverage] PASS — ${files.length} test files, all claimed: ${summary}.`);
}

main();
