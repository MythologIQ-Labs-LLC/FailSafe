#!/usr/bin/env node
/**
 * #404: run every `*.test.cjs` suite under src/test via `node --test`.
 *
 * Why a script instead of a package.json one-liner: the shell form
 * `node --test $(find src/test -name '*.test.cjs')` runs zero tests on Windows
 * (cmd.exe does not perform `$(…)` substitution, so argv arrives literally and
 * node fails on a path called "src/test"), and the glob form
 * `node --test "src/test/**\/*.test.cjs"` is not honoured by Node 20, which CI
 * pins. Discovering the files in JS and passing them explicitly works on both.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { EXT_ROOT, discoverTestFiles } = require("./test-file-discovery.cjs");

const files = discoverTestFiles()
  .filter((f) => f.rel.endsWith(".test.cjs"))
  .map((f) => path.relative(EXT_ROOT, f.abs));

if (files.length === 0) {
  console.log("[test:node] no .test.cjs suites found — nothing to run.");
  process.exit(0);
}

console.log(`[test:node] running ${files.length} .cjs suite(s) via node --test`);
const res = spawnSync(process.execPath, ["--test", ...files], {
  cwd: EXT_ROOT,
  stdio: "inherit",
});
process.exit(res.status === null ? 1 : res.status);
