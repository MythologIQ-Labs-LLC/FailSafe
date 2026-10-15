/**
 * Wave 0 (#521) FX966: artifact inventory of a Target VSIX set, independent of
 * the source tree, reusing the release packaging rule (native-targets.cjs).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const { inspectVsix } = require(fx.rv("lib/inventory.cjs"));
const { main, checkNode } = require(fx.rv("rv.cjs"));

const V = "6.0.7";

async function inventory(set, { sums = true, version = V, extra = {} } = {}) {
  const dir = fx.writeTargetSet(version, set, { sums: false });
  for (const [name, buf] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), buf);
  const args = ["inventory", "--dir", dir, "--version", version, "--json", path.join(dir, "inv.json")];
  if (sums) {
    fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), fx.sumsText(version, sums === true ? set : sums));
    args.push("--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "local:fixture");
  }
  const code = await main(args, fx.capture().io);
  const ev = fs.existsSync(path.join(dir, "inv.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "inv.json"), "utf8")) : null;
  return { code, ev, dir };
}
const find = (ev, id, target) => ev.checks.find((c) => c.id === id && c.target === target);
const failing = (ev) => ev.checks.filter((c) => c.status === "fail");

test("a complete eight-target set passes with every per-target check pass", async () => {
  const { code, ev } = await inventory(fx.makeTargetSet(V));
  assert.equal(code, 0);
  assert.deepEqual(failing(ev), []);
  for (const t of Object.keys(fx.NATIVE_TARGETS)) {
    for (const id of ["archive", "manifest", "version", "sqlite-declared", "native-binary", "sha256"]) {
      assert.equal(find(ev, id, t)?.status, "pass", `${id}/${t}`);
    }
  }
  assert.equal(find(ev, "target-set", null).status, "pass");
  assert.equal(ev.kind, "inventory");
  assert.equal(ev.version, V);
});

test("the published-6.0.6 shape (universal, ELF x64 build/Release binary) fails the native rule", () => {
  const r = inspectVsix(fx.makeUniversal606(), "6.0.6");
  const native = r.checks.find((c) => c.id === "native-binary");
  assert.equal(native.status, "fail");
  assert.match(native.detail, /must be platform-targeted/);
  assert.equal(r.target, null);
});

test("win32-x64 carrying an ELF x64 binary fails with the format/arch message", async () => {
  const bad = fx.makeVsix("win32-x64", { addons: [{ name: "extension/node_modules/better-sqlite3/prebuilds/win32-x64.node", format: "ELF", arch: "x64" }] });
  const { code, ev } = await inventory(fx.makeTargetSet(V, { "win32-x64": bad }));
  assert.equal(code, 1);
  assert.match(find(ev, "native-binary", "win32-x64").detail, /ELF\/x64; target win32-x64 needs PE\/x64/);
});

test("a package.json that does not declare better-sqlite3 fails even with no native addon", () => {
  const r = inspectVsix(fx.makeVsix("win32-x64", { sqlite: false, addons: [] }), V);
  assert.equal(r.checks.find((c) => c.id === "sqlite-declared").status, "fail");
  assert.match(r.checks.find((c) => c.id === "sqlite-declared").detail, /better-sqlite3 not declared/);
  // dependsOnSqlite is pinned true, so the missing binary is also a native-rule failure.
  assert.equal(r.checks.find((c) => c.id === "native-binary").status, "fail");
});

test("Identity Id, Publisher and PackageManifest Version are each checked", () => {
  for (const opts of [{ id: "other-ext" }, { publisher: "Someone" }, { manifestVersionAttr: "1.0.0" }]) {
    const r = inspectVsix(fx.makeVsix("linux-x64", opts), V);
    assert.equal(r.checks.find((c) => c.id === "manifest").status, "fail", JSON.stringify(opts));
  }
});

test("seven targets fails naming the missing one; an extra universal VSIX fails as extra", async () => {
  const seven = fx.makeTargetSet(V);
  delete seven["darwin-x64"];
  const a = await inventory(seven, { sums: false });
  assert.equal(a.code, 1);
  assert.match(find(a.ev, "target-set", null).detail, /missing: darwin-x64/);
  const b = await inventory(fx.makeTargetSet(V), { sums: false, extra: { "mythologiq-failsafe-6.0.7.vsix": fx.makeVsix(null) } });
  assert.equal(b.code, 1);
  assert.match(find(b.ev, "target-set", null).detail, /extra: universal/);
});

test("Identity Version, package.json version and --version must all agree", () => {
  const cases = [
    [{ manifestIdentityVersion: "6.0.6" }, V],
    [{ pkgVersion: "6.0.6" }, V],
    [{}, "6.0.8"],
  ];
  for (const [opts, expected] of cases) {
    const r = inspectVsix(fx.makeVsix("linux-arm64", opts), expected);
    assert.equal(r.checks.find((c) => c.id === "version").status, "fail", JSON.stringify(opts) + expected);
  }
});

test("one flipped byte in one VSIX fails that target's sha256 check only", async () => {
  const set = fx.makeTargetSet(V);
  const approved = { ...set };
  const flipped = Buffer.from(set["alpine-arm64"]);
  flipped[flipped.indexOf("module.exports")] ^= 0x01; // inside a stored file body: the archive stays valid

  const { code, ev } = await inventory({ ...set, "alpine-arm64": flipped }, { sums: approved });
  assert.equal(code, 1);
  assert.equal(find(ev, "sha256", "alpine-arm64").status, "fail");
  assert.deepEqual(ev.checks.filter((c) => c.id === "sha256" && c.status === "fail").map((c) => c.target), ["alpine-arm64"]);
});

test("a truncated zip is an archive failure, not a crash and not a pass", async () => {
  const set = fx.makeTargetSet(V);
  const { code, ev } = await inventory({ ...set, "linux-x64": set["linux-x64"].subarray(0, 200) }, { sums: false });
  assert.equal(code, 1);
  const archive = ev.checks.find((c) => c.id === "archive" && c.status === "fail");
  assert.ok(archive, "archive failure recorded");
});

test("--version 6.0 or v6.0.7 exits 2 before reading any file", async () => {
  for (const bad of ["6.0", "v6.0.7"]) {
    const code = await main(["inventory", "--dir", "Z:/does/not/exist", "--version", bad, "--json", "Z:/x.json"], fx.capture().io);
    assert.equal(code, 2, bad);
  }
});

test("Node below 22.13 exits 2 before any subcommand runs", async () => {
  assert.equal(checkNode("22.12.0"), false);
  assert.equal(checkNode("20.19.0"), false);
  assert.equal(checkNode("22.13.0"), true);
  assert.equal(checkNode("24.1.0"), true);
  const code = await main(["inventory", "--dir", "Z:/does/not/exist", "--version", V, "--json", "Z:/x.json"], { nodeVersion: "22.12.0", ...fx.capture().io });
  assert.equal(code, 2);
});

test("a zip with two entries of the same name is an archive failure", () => {
  const manifest = fx.manifestXml({ id: "mythologiq-failsafe", version: V, publisher: "MythologIQ", target: "linux-x64" });
  const zip = fx.makeZip([
    { name: "extension.vsixmanifest", data: manifest },
    { name: "extension/package.json", data: JSON.stringify({ version: V, optionalDependencies: { "better-sqlite3": "^13.0.3" } }) },
    { name: "extension/package.json", data: JSON.stringify({ version: "9.9.9" }) },
  ]);
  const r = inspectVsix(zip, V);
  assert.equal(r.checks[0].id, "archive");
  assert.equal(r.checks[0].status, "fail");
  assert.match(r.checks[0].detail, /duplicate entry extension\/package\.json/);
});
