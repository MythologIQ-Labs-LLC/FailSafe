#!/usr/bin/env node
/**
 * #502 (FX950): native SQLite packaging contract.
 *
 * better-sqlite3 13.x is N-API and ships one prebuilt binary per platform under
 * `prebuilds/<platform>-<arch>.node`. A FailSafe VSIX that depends on it must be
 * platform-targeted and carry exactly the prebuild for its target; a universal
 * VSIX (or one with a foreign binary) would run SQLite-backed governance in stub
 * mode or crash the extension host. Used by package-target.cjs and validate-vsix.cjs.
 */

"use strict";

/** vsce --target -> prebuild name and the binary header it must carry. */
const NATIVE_TARGETS = Object.freeze({
  "win32-x64": { prebuild: "win32-x64", format: "PE", arch: "x64" },
  "win32-arm64": { prebuild: "win32-arm64", format: "PE", arch: "arm64" },
  "linux-x64": { prebuild: "linux-x64", format: "ELF", arch: "x64" },
  "linux-arm64": { prebuild: "linux-arm64", format: "ELF", arch: "arm64" },
  "alpine-x64": { prebuild: "linuxmusl-x64", format: "ELF", arch: "x64" },
  "alpine-arm64": { prebuild: "linuxmusl-arm64", format: "ELF", arch: "arm64" },
  "darwin-x64": { prebuild: "darwin-x64", format: "MachO", arch: "x64" },
  "darwin-arm64": { prebuild: "darwin-arm64", format: "MachO", arch: "arm64" },
});

const PE_MACHINE = { 0x8664: "x64", 0xaa64: "arm64" };
const ELF_MACHINE = { 0x3e: "x64", 0xb7: "arm64" };
const MACHO_CPU = { 0x01000007: "x64", 0x0100000c: "arm64" };

function describePe(buf) {
  if (buf.length < 0x40) return { format: "unknown", arch: "unknown" };
  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 6 > buf.length || buf.toString("latin1", peOffset, peOffset + 4) !== "PE\0\0") {
    return { format: "unknown", arch: "unknown" };
  }
  return { format: "PE", arch: PE_MACHINE[buf.readUInt16LE(peOffset + 4)] ?? "unknown" };
}

/** Identify a native binary from its first bytes (read at least 1024). */
function describeBinaryHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return { format: "unknown", arch: "unknown" };
  if (buf[0] === 0x4d && buf[1] === 0x5a) return describePe(buf);
  if (buf.readUInt32BE(0) === 0x7f454c46 && buf.length >= 0x14) {
    return { format: buf[4] === 2 ? "ELF" : "unknown", arch: ELF_MACHINE[buf.readUInt16LE(0x12)] ?? "unknown" };
  }
  if (buf.readUInt32LE(0) === 0xfeedfacf) return { format: "MachO", arch: MACHO_CPU[buf.readUInt32LE(4)] ?? "unknown" };
  if (buf.readUInt32BE(0) === 0xcafebabe) return { format: "MachO-fat", arch: "unknown" };
  return { format: "unknown", arch: "unknown" };
}

/** Native addons under extension/ in an `unzip -Z1` / `tar -tf` listing. */
function findNativeAddons(listText) {
  return String(listText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((entry) => entry.startsWith("extension/") && entry.endsWith(".node"));
}

/**
 * The packaging rule. Returns an error message, or null when the package is valid.
 * @param {{ target: string|null, dependsOnSqlite: boolean, addons: string[], readEntry: (e: string) => Buffer }} pkg
 */
function checkNativeBinary({ target, dependsOnSqlite, addons, readEntry }) {
  if (!dependsOnSqlite) {
    return addons.length === 0 ? null : `Native addons in a package that does not depend on better-sqlite3: ${addons.join(", ")}`;
  }
  const spec = target ? NATIVE_TARGETS[target] : undefined;
  if (!spec) {
    return `A VSIX that depends on better-sqlite3 must be platform-targeted (one of ${Object.keys(NATIVE_TARGETS).join(", ")}); got ${target ?? "universal"} (#502).`;
  }
  const expected = `extension/node_modules/better-sqlite3/prebuilds/${spec.prebuild}.node`;
  if (addons.length !== 1) {
    return `Target ${target} must carry exactly one native binary (${expected}); found ${addons.length}: ${addons.join(", ") || "none"}.`;
  }
  if (addons[0] !== expected) return `Target ${target} must carry ${expected}; found ${addons[0]}.`;
  const actual = describeBinaryHeader(readEntry(addons[0]));
  if (actual.format === "MachO-fat") return `${expected} is a fat/universal Mach-O; a single-architecture binary is required.`;
  if (actual.format !== spec.format || actual.arch !== spec.arch) {
    return `${expected} is ${actual.format}/${actual.arch}; target ${target} needs ${spec.format}/${spec.arch}.`;
  }
  return null;
}

module.exports = { NATIVE_TARGETS, describeBinaryHeader, findNativeAddons, checkNativeBinary };
