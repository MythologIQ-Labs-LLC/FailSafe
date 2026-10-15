/**
 * Wave 0 (#521) FX966: the approved checksum set is parsed strictly, and its
 * provenance is recorded, verified where it can be, and never assumed.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const { parseSums, parseSumsSource, verifySumsSource } = require(fx.rv("lib/sums.cjs"));
const { main } = require(fx.rv("rv.cjs"));

const V = "6.0.7";
const set = fx.makeTargetSet(V);
const good = fx.sumsText(V, set);
const lines = good.slice(0, -1).split("\n");

test("eight LF lines with a trailing newline parse to one approved hash per target", () => {
  const parsed = parseSums(good, V);
  assert.equal(Object.keys(parsed.entries).length, 8);
  assert.equal(parsed.entries["win32-x64"].sha256, fx.sha256(set["win32-x64"]));
  assert.equal(parsed.entries["win32-x64"].file, fx.vsixName(V, "win32-x64"));
  assert.equal(parsed.sha256, fx.sha256(Buffer.from(good)));
});

const otherVersion = lines.map((l, i) => (i === 0 ? l.replace(V, "6.0.6") : l)).join("\n") + "\n";
const MALFORMED = {
  "missing final newline": good.slice(0, -1),
  "CRLF line endings": lines.join("\r\n") + "\r\n",
  "a blank trailing line": good + "\n",
  "nine lines": good + lines[0] + "\n",
  "seven lines": lines.slice(1).join("\n") + "\n",
  "uppercase hex": good.replace(/^[0-9a-f]{64}/, (h) => h.toUpperCase()),
  "one space": good.replace("  ", " "),
  "a name for another version": otherVersion,
  "a duplicate target": [lines[0], lines[0], ...lines.slice(2)].join("\n") + "\n",
};

for (const [label, text] of Object.entries(MALFORMED)) {
  test(`malformed sums (${label}): parseSums throws and both inventory and marketplace exit 2`, async () => {
    assert.throws(() => parseSums(text, V), /sums/i);
    const dir = fx.writeTargetSet(V, set, { sums: false });
    const sumsPath = path.join(dir, "SHA256SUMS.txt");
    fs.writeFileSync(sumsPath, text);
    const calls = [];
    const fetch = async (url) => { calls.push(url); throw new Error("no network in tests"); };
    const inv = await main(["inventory", "--dir", dir, "--version", V, "--sums", sumsPath, "--sums-source", "local:x", "--json", path.join(dir, "inv.json")], { fetch, ...fx.capture().io });
    const mkt = await main(["marketplace", "--version", V, "--sums", sumsPath, "--sums-source", "run-artifact:1", "--download-dir", path.join(dir, "dl"), "--json", path.join(dir, "mkt.json")], { fetch, ...fx.capture().io });
    assert.equal(inv, 2);
    assert.equal(mkt, 2);
    assert.equal(calls.length, 0);
  });
}

test("--sums-source release-asset with identical public bytes records fetched-equal", async () => {
  const fetch = async (url) => {
    assert.equal(url, "https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download/v6.0.7/SHA256SUMS.txt");
    return new Response(good, { status: 200 });
  };
  const r = await verifySumsSource(parseSumsSource("release-asset:v6.0.7"), Buffer.from(good), { fetch });
  assert.equal(r.status, "pass");
  assert.equal(r.verified, "fetched-equal");
});

test("--sums-source release-asset with different public bytes is a fail (exit 1 through inventory)", async () => {
  const fetch = async () => new Response(good.replace(/^./, "0"), { status: 200 });
  const r = await verifySumsSource(parseSumsSource("release-asset:v6.0.7"), Buffer.from(good), { fetch });
  assert.equal(r.status, "fail");
  const dir = fx.writeTargetSet(V, set);
  const code = await main(["inventory", "--dir", dir, "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "release-asset:v6.0.7", "--json", path.join(dir, "inv.json")], { fetch, ...fx.capture().io });
  assert.equal(code, 1);
});

test("--sums-source release-asset that 404s is inconclusive (exit 3)", async () => {
  const fetch = async () => new Response("Not Found", { status: 404 });
  const r = await verifySumsSource(parseSumsSource("release-asset:v6.0.7"), Buffer.from(good), { fetch });
  assert.equal(r.status, "inconclusive");
  const dir = fx.writeTargetSet(V, set);
  const code = await main(["inventory", "--dir", dir, "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "release-asset:v6.0.7", "--json", path.join(dir, "inv.json")], { fetch, ...fx.capture().io });
  assert.equal(code, 3);
});

test("run-artifact records attested and local records local, without any request", async () => {
  const fetch = async () => { throw new Error("must not fetch"); };
  const a = await verifySumsSource(parseSumsSource("run-artifact:38478430806"), Buffer.from(good), { fetch });
  assert.deepEqual([a.status, a.verified], ["pass", "attested"]);
  const l = await verifySumsSource(parseSumsSource("local:dist-vsix"), Buffer.from(good), { fetch });
  assert.deepEqual([l.status, l.verified], ["pass", "local"]);
  const dir = fx.writeTargetSet(V, set);
  const json = path.join(dir, "inv.json");
  assert.equal(await main(["inventory", "--dir", dir, "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "run-artifact:38478430806", "--json", json], { fetch, ...fx.capture().io }), 0);
  const ev = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.deepEqual(ev.inputs.approvedSums.source, { kind: "run-artifact", ref: "38478430806", verified: "attested" });
  assert.equal(ev.inputs.approvedSums.sha256, fx.sha256(Buffer.from(good)));
});

test("a missing or unknown --sums-source kind exits 2", async () => {
  assert.throws(() => parseSumsSource("gh-run:1"), /sums-source/);
  assert.throws(() => parseSumsSource("release-asset:"), /sums-source/);
  const dir = fx.writeTargetSet(V, set);
  const base = ["inventory", "--dir", dir, "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--json", path.join(dir, "inv.json")];
  assert.equal(await main(base, fx.capture().io), 2);
  assert.equal(await main([...base, "--sums-source", "gh-run:1"], fx.capture().io), 2);
});
