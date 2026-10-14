#!/usr/bin/env node
/**
 * #502 (FX950): package a platform-targeted VSIX carrying exactly that platform's
 * better-sqlite3 N-API prebuild.
 *
 *   node scripts/package-target.cjs <vsce-target> [--out <file.vsix>]
 *
 * The base .vscodeignore ships no native binary. This writes a temporary ignore
 * file that re-includes only `prebuilds/<prebuild>.node` for the target and runs
 * `vsce package --target <target> --ignoreFile <tmp>`. Validate the result with
 * `node scripts/validate-vsix.cjs <file.vsix>`.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { NATIVE_TARGETS } = require("./native-targets.cjs");

const root = path.resolve(__dirname, "..");

function die(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const target = argv[0];
  const outIndex = argv.indexOf("--out");
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  if (!target || !NATIVE_TARGETS[target]) {
    die(`usage: package-target.cjs <target> [--out file.vsix]; target is one of ${Object.keys(NATIVE_TARGETS).join(", ")}`);
  }
  return { target, out };
}

function main() {
  const { target, out } = parseArgs(process.argv.slice(2));
  const { prebuild } = NATIVE_TARGETS[target];
  const prebuildRel = `node_modules/better-sqlite3/prebuilds/${prebuild}.node`;
  if (!fs.existsSync(path.join(root, prebuildRel))) {
    die(`${prebuildRel} not found; run npm ci with better-sqlite3 >=13 first.`);
  }

  const base = fs.readFileSync(path.join(root, ".vscodeignore"), "utf8");
  const ignoreFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-vsix-")), ".vscodeignore");
  fs.writeFileSync(ignoreFile, `${base.trimEnd()}\n\n# package-target.cjs: ${target}\n!${prebuildRel}\n`);

  const vsceArgs = ["@vscode/vsce", "package", "--target", target, "--ignoreFile", ignoreFile];
  if (out) vsceArgs.push("--out", out);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, vsceArgs, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  fs.rmSync(path.dirname(ignoreFile), { recursive: true, force: true });
  if (result.status !== 0) die(`vsce package --target ${target} failed (exit ${result.status}).`);
}

main();
