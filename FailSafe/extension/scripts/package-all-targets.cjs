#!/usr/bin/env node
/**
 * #502 (FX950): package and validate the Target VSIX set — one platform-targeted
 * VSIX per entry in native-targets.cjs. This is the only packaging path release.yml
 * and the native qualification rehearsal use.
 *
 *   node scripts/package-all-targets.cjs --out <dir> [--version <x.y.z>]
 *
 * Writes <dir>/mythologiq-failsafe-<version>-<target>.vsix for every target, then
 * <dir>/SHA256SUMS.txt and <dir>/targets.json. Exits non-zero, writing no manifest,
 * if any target fails to package or validate, or if the produced set differs from
 * NATIVE_TARGETS.
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { NATIVE_TARGETS } = require("./native-targets.cjs");

const root = path.resolve(__dirname, "..");

function vsixName(version, target) {
  return `mythologiq-failsafe-${version}-${target}.vsix`;
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { cwd: root, stdio: "inherit" });
  return result.status === 0;
}

const defaultPackageOne = (target, file) => runNode("package-target.cjs", [target, "--out", file]);
const defaultValidateOne = (file) => runNode("validate-vsix.cjs", [file]);

/**
 * @param {{ version: string, outDir: string, targets?: string[],
 *   packageOne?: (target: string, file: string) => boolean,
 *   validateOne?: (file: string, target: string) => boolean }} opts
 * @returns {{ manifest: object[], sums: string }}
 */
function packageAllTargets({ version, outDir, targets = Object.keys(NATIVE_TARGETS), packageOne = defaultPackageOne, validateOne = defaultValidateOne }) {
  if (!version) throw new Error("version is required");
  fs.mkdirSync(outDir, { recursive: true });
  // A failed run must never leave an earlier run's manifest describing this directory.
  for (const stale of ["SHA256SUMS.txt", "targets.json"]) fs.rmSync(path.join(outDir, stale), { force: true });
  const manifest = [];
  for (const target of targets) {
    const spec = NATIVE_TARGETS[target];
    if (!spec) throw new Error(`unknown target ${target}`);
    const file = path.join(outDir, vsixName(version, target));
    if (!packageOne(target, file) || !fs.existsSync(file)) throw new Error(`packaging failed for ${target}`);
    if (!validateOne(file, target)) throw new Error(`validation failed for ${target}`);
    const bytes = fs.readFileSync(file);
    manifest.push({
      target, file: path.basename(file), sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length, prebuild: spec.prebuild, format: spec.format, arch: spec.arch,
    });
  }
  const produced = manifest.map((m) => m.target).sort().join(",");
  const expected = Object.keys(NATIVE_TARGETS).sort().join(",");
  if (produced !== expected) throw new Error(`produced targets [${produced}] differ from NATIVE_TARGETS [${expected}]`);
  const sums = manifest.map((m) => `${m.sha256}  ${m.file}`).join("\n") + "\n";
  fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), sums);
  fs.writeFileSync(path.join(outDir, "targets.json"), `${JSON.stringify({ version, targets: manifest }, null, 2)}\n`);
  return { manifest, sums };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const outDir = path.resolve(arg("--out") ?? path.join(root, "dist-vsix"));
  const version = arg("--version") ?? require(path.join(root, "package.json")).version;
  try {
    const { manifest } = packageAllTargets({ version, outDir });
    for (const m of manifest) console.log(`[PASS] ${m.target} ${m.file} ${m.sha256}`);
    console.log(`[PASS] ${manifest.length} target VSIXs in ${outDir}`);
  } catch (err) {
    console.error(`[FAIL] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { packageAllTargets, vsixName };

if (require.main === module) main();
