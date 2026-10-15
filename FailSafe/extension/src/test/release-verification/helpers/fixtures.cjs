/**
 * Wave 0 (#521): in-memory VSIX fixtures for the release-verification suites.
 *
 * makeVsix builds a stored (uncompressed) zip with the real vsixmanifest
 * skeleton, an extension/package.json and, optionally, native addons whose
 * first bytes are a minimal PE, ELF or Mach-O header that describeBinaryHeader
 * classifies. Nothing here touches the network or the real extension.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const RV_ROOT = path.join(REPO_ROOT, "tools", "release-verification");
const rv = (rel) => path.join(RV_ROOT, rel);
const { NATIVE_TARGETS } = require(path.join(REPO_ROOT, "FailSafe", "extension", "scripts", "native-targets.cjs"));

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Stored zip from [{ name, data }]. */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/** Minimal native header bytes: format PE | ELF | MachO, arch x64 | arm64. */
function nativeHeader(format, arch) {
  const buf = Buffer.alloc(1024);
  if (format === "PE") {
    buf.write("MZ", 0, "latin1");
    buf.writeUInt32LE(0x80, 0x3c);
    buf.write("PE\0\0", 0x80, "latin1");
    buf.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, 0x84);
  } else if (format === "ELF") {
    buf.writeUInt32BE(0x7f454c46, 0);
    buf[4] = 2;
    buf.writeUInt16LE(arch === "arm64" ? 0xb7 : 0x3e, 0x12);
  } else if (format === "MachO") {
    buf.writeUInt32LE(0xfeedfacf, 0);
    buf.writeUInt32LE(arch === "arm64" ? 0x0100000c : 0x01000007, 4);
  }
  return buf;
}

function manifestXml({ id, version, publisher, target, manifestVersion = "2.0.0" }) {
  const tp = target ? ` TargetPlatform="${target}"` : "";
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `\t<PackageManifest Version="${manifestVersion}" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">`,
    "\t\t<Metadata>",
    `\t\t\t<Identity Language="en-US" Id="${id}" Version="${version}" Publisher="${publisher}"${tp}/>`,
    "\t\t\t<DisplayName>FailSafe (feat. Qor-Logic)</DisplayName>",
    "\t\t</Metadata>",
    "\t</PackageManifest>",
  ].join("\n");
}

/**
 * A FailSafe-shaped VSIX. By default a correct targeted package for `target`.
 * opts: version, pkgVersion, manifestVersionAttr, id, publisher, sqlite (bool),
 * addons ([{ name, format, arch }]) overrides the default single prebuild.
 */
function makeVsix(target, opts = {}) {
  const version = opts.version ?? "6.0.7";
  const spec = target ? NATIVE_TARGETS[target] : null;
  const addons = opts.addons ?? (spec ? [{ name: `extension/node_modules/better-sqlite3/prebuilds/${spec.prebuild}.node`, format: spec.format, arch: spec.arch }] : []);
  const pkg = { name: "mythologiq-failsafe", publisher: "MythologIQ", version: opts.pkgVersion ?? version, engines: { vscode: opts.engines ?? "^1.101.0" }, main: "./dist/extension/main.js" };
  if (opts.sqlite !== false) pkg.optionalDependencies = { "better-sqlite3": "^13.0.3" };
  const entries = [
    { name: "extension.vsixmanifest", data: manifestXml({ id: opts.id ?? "mythologiq-failsafe", version: opts.manifestIdentityVersion ?? version, publisher: opts.publisher ?? "MythologIQ", target, manifestVersion: opts.manifestVersionAttr }) },
    { name: "extension/package.json", data: JSON.stringify(pkg, null, 2) },
    { name: "extension/dist/extension/main.js", data: "module.exports = {};\n" },
    ...addons.map((a) => ({ name: a.name, data: nativeHeader(a.format, a.arch) })),
  ];
  return makeZip(entries);
}

/** The published-6.0.6 shape: universal, build/Release ELF x64 binaries. */
function makeUniversal606() {
  return makeVsix(null, {
    version: "6.0.6",
    addons: [
      { name: "extension/node_modules/better-sqlite3/build/Release/test_extension.node", format: "ELF", arch: "x64" },
      { name: "extension/node_modules/better-sqlite3/build/Release/better_sqlite3.node", format: "ELF", arch: "x64" },
    ],
  });
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const vsixName = (version, target) => `mythologiq-failsafe-${version}-${target}.vsix`;

/** { target: Buffer } for all eight targets. */
function makeTargetSet(version = "6.0.7", overrides = {}) {
  const set = {};
  for (const t of Object.keys(NATIVE_TARGETS)) set[t] = overrides[t] ?? makeVsix(t, { version });
  return set;
}

function sumsText(version, set) {
  return Object.keys(NATIVE_TARGETS).map((t) => `${sha256(set[t])}  ${vsixName(version, t)}`).join("\n") + "\n";
}

const created = [];
process.once("exit", () => {
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* a locked file on Windows; the OS cleans temp */ }
  }
});

/** A fresh temp directory, removed when the test process exits. */
function tmpDir(label = "rv") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  created.push(d);
  return d;
}

/** Write a target set (+ SHA256SUMS.txt) into a fresh directory. */
function writeTargetSet(version = "6.0.7", set = makeTargetSet(version), { sums = true } = {}) {
  const dir = tmpDir("rv-set");
  for (const [t, buf] of Object.entries(set)) fs.writeFileSync(path.join(dir, vsixName(version, t)), buf);
  if (sums) fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), sumsText(version, set));
  return dir;
}

/** Collects stdout/stderr for rv main(). */
function capture() {
  const out = [];
  return { out, io: { log: (s) => out.push(String(s)), error: (s) => out.push(String(s)) }, text: () => out.join("\n") };
}

module.exports = {
  REPO_ROOT, RV_ROOT, rv, NATIVE_TARGETS, crc32, makeZip, nativeHeader, manifestXml, makeVsix,
  makeUniversal606, makeTargetSet, sumsText, sha256, vsixName, tmpDir, writeTargetSet, capture,
};
