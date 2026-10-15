/**
 * Wave 0 (#521): artifact inventory of FailSafe VSIXs, independent of the
 * source tree (validate-vsix.cjs compares against the tree's own version, so it
 * cannot judge a published artifact of any other version).
 *
 * The native packaging rule is the release one: checkNativeBinary from
 * FailSafe/extension/scripts/native-targets.cjs, called with dependsOnSqlite
 * pinned true. Whether the package declares better-sqlite3 is its own check, so
 * a package that drops the dependency fails instead of skipping the rule.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { check } = require("./evidence.cjs");
const { openArchive, readArchiveFile } = require("./vsix-archive.cjs");
const { sha256 } = require("./sums.cjs");

const { NATIVE_TARGETS, findNativeAddons, checkNativeBinary } = require(path.resolve(__dirname, "..", "..", "..", "FailSafe", "extension", "scripts", "native-targets.cjs"));

const EXTENSION_ID = "mythologiq-failsafe";
const PUBLISHER = "MythologIQ";
const PER_TARGET_CHECKS = ["archive", "manifest", "version", "sqlite-declared", "native-binary", "sha256"];

function parseManifest(xml) {
  const pm = /<PackageManifest\s+Version="([^"]*)"/.exec(xml);
  const idm = /<Identity\s([^>]*?)\/?>/.exec(xml);
  const attrs = {};
  if (idm) for (const m of idm[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return { manifestVersion: pm ? pm[1] : null, id: attrs.Id ?? null, publisher: attrs.Publisher ?? null, version: attrs.Version ?? null, targetPlatform: attrs.TargetPlatform ?? null };
}

/**
 * Inspect one VSIX. `checks` carry target = the manifest's TargetPlatform,
 * "universal" when it has none, or the label when the archive is unreadable.
 * @returns {{ target: string|null, label: string, sha256: string, identity: object|null, nativeError: string|null, checks: object[] }}
 */
function inspectVsix(buf, version, { label = "vsix", approved = null } = {}) {
  const digest = sha256(buf);
  let archive;
  try {
    archive = openArchive(buf);
    if (!archive.has("extension.vsixmanifest") || !archive.has("extension/package.json")) throw new Error("extension.vsixmanifest or extension/package.json missing");
  } catch (err) {
    return { target: null, label, sha256: digest, identity: null, nativeError: null, checks: [check("archive", "artifact", label, "fail", err.message, { sha256: digest })] };
  }
  let identity;
  let pkg;
  try {
    identity = parseManifest(archive.read("extension.vsixmanifest").toString("utf8"));
    pkg = JSON.parse(archive.read("extension/package.json").toString("utf8"));
  } catch (err) {
    return { target: null, label, sha256: digest, identity: null, nativeError: null, checks: [check("archive", "artifact", label, "fail", `unreadable manifest or package.json: ${err.message}`, { sha256: digest })] };
  }
  const target = identity.targetPlatform;
  const t = target ?? "universal";
  const checks = [check("archive", "artifact", t, "pass", `${archive.names.length} entries`, { sha256: digest, file: label })];

  const manifestProblems = [];
  if (identity.manifestVersion !== "2.0.0") manifestProblems.push(`PackageManifest Version is ${identity.manifestVersion}, expected 2.0.0`);
  if (identity.id !== EXTENSION_ID) manifestProblems.push(`Identity Id is ${identity.id}, expected ${EXTENSION_ID}`);
  if (identity.publisher !== PUBLISHER) manifestProblems.push(`Identity Publisher is ${identity.publisher}, expected ${PUBLISHER}`);
  checks.push(check("manifest", "artifact", t, manifestProblems.length ? "fail" : "pass", manifestProblems.join("; ") || `${PUBLISHER}.${EXTENSION_ID}`));

  const versions = { manifest: identity.version, packageJson: pkg.version, expected: version };
  const versionOk = identity.version === version && pkg.version === version;
  checks.push(check("version", "artifact", t, versionOk ? "pass" : "fail", `manifest ${identity.version}, package.json ${pkg.version}, expected ${version}`, versions));

  const declared = Boolean(pkg.dependencies?.["better-sqlite3"] || pkg.optionalDependencies?.["better-sqlite3"]);
  checks.push(check("sqlite-declared", "artifact", t, declared ? "pass" : "fail", declared ? "better-sqlite3 declared" : "better-sqlite3 not declared in dependencies or optionalDependencies"));

  const addons = findNativeAddons(archive.names.join("\n"));
  let nativeError;
  try {
    nativeError = checkNativeBinary({ target, dependsOnSqlite: true, addons, readEntry: (e) => archive.read(e) });
  } catch (err) {
    nativeError = `native binary unreadable: ${err.message}`;
  }
  checks.push(check("native-binary", "artifact", t, nativeError ? "fail" : "pass", nativeError ?? `one prebuild matching ${target}`, { addons }));

  if (approved) {
    const line = approved.entries[t];
    if (!line) checks.push(check("sha256", "artifact", t, "fail", `no approved line for ${t}`, { sha256: digest }));
    else checks.push(check("sha256", "artifact", t, line.sha256 === digest ? "pass" : "fail", line.sha256 === digest ? `equals approved line ${line.file}` : `sha256 ${digest} differs from approved ${line.sha256}`, { sha256: digest, approved: line.sha256 }));
  }
  return { target, label, sha256: digest, identity, nativeError, checks };
}

/** The set check over inspected VSIXs: the targets must equal NATIVE_TARGETS exactly. */
function targetSetCheck(inspected, scope = "artifact") {
  const seen = new Map();
  for (const r of inspected) {
    const t = r.identity ? (r.target ?? "universal") : null;
    if (t) seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  const expected = Object.keys(NATIVE_TARGETS);
  const missing = expected.filter((t) => !seen.has(t));
  const extra = [...seen.entries()].flatMap(([t, n]) => (!expected.includes(t) ? [t] : n > 1 ? [`${t} (duplicate)`] : []));
  const ok = missing.length === 0 && extra.length === 0;
  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
  if (extra.length) parts.push(`extra: ${extra.join(", ")}`);
  return check("target-set", scope, null, ok ? "pass" : "fail", ok ? `exactly the ${expected.length} NATIVE_TARGETS` : parts.join("; "), { found: [...seen.keys()] });
}

/** Inventory of every *.vsix in a directory. */
function inventoryDir(dir, version, approved) {
  const files = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".vsix")).sort();
  const inspected = files.map((name) => {
    try {
      return inspectVsix(readArchiveFile(path.join(dir, name)), version, { label: name, approved });
    } catch (err) {
      return { target: null, label: name, identity: null, checks: [check("archive", "artifact", name, "fail", err.message)] };
    }
  });
  return { inspected, checks: [...inspected.flatMap((r) => r.checks), targetSetCheck(inspected)] };
}

module.exports = { inspectVsix, inventoryDir, targetSetCheck, parseManifest, PER_TARGET_CHECKS, EXTENSION_ID, PUBLISHER };
