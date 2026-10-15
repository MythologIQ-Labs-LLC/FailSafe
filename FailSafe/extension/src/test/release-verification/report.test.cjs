/**
 * Wave 0 (#521) FX966: the report decides mode from the evidence present, holds
 * a fixed required-check table per mode, binds evidence across files, and never
 * exits 0 with a required check missing or inconclusive. Inputs are produced by
 * the real rv subcommands over fake marketplaces and a fake VS Code.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");
const { fakeMarkets, fakeCodeDir, vsixFiles, fakeWorld } = require("./helpers/fakes.cjs");

const { buildReport, writeReport, requiredChecks, REQUIRED_MARKETS } = require(fx.rv("lib/report.cjs"));
const ev = require(fx.rv("lib/evidence.cjs"));
const { main } = require(fx.rv("rv.cjs"));

const V = "6.0.7";
const smoke = async () => ({ status: 0, output: "[PASS] fake smoke" });

async function inventoryEvidence(set = fx.makeTargetSet(V)) {
  const dir = fx.writeTargetSet(V, set);
  const json = path.join(dir, "inventory.json");
  assert.equal(await main(["inventory", "--dir", dir, "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", `local:${dir}`, "--json", json], fx.capture().io), 0);
  return { evidence: JSON.parse(fs.readFileSync(json, "utf8")), dir };
}

async function lifecycleEvidence(toPath) {
  const code = fakeCodeDir();
  const root = path.join(fx.tmpDir("rv-root-parent"), "root");
  const v = vsixFiles({ toPath });
  const operatorRegistryPath = path.join(fx.tmpDir("rv-op"), "servers.json");
  fs.writeFileSync(operatorRegistryPath, JSON.stringify({ servers: [] }));
  const { deps } = fakeWorld({ code, root, v, operatorRegistryPath });
  const json = path.join(path.dirname(root), "lifecycle.json");
  const exit = await main(["lifecycle", "--code", code, "--root", root, "--from", v.fromPath, "--to", v.toPath, "--json", json], { platform: "win32", arch: "x64", lifecycleDeps: deps, ...fx.capture().io });
  assert.equal(exit, 0);
  return JSON.parse(fs.readFileSync(json, "utf8"));
}

async function marketplaceEvidence({ market = "both", set = fx.makeTargetSet(V), opts = {} } = {}) {
  const m = fakeMarkets({ set, ...opts });
  const dir = fx.writeTargetSet(V, set);
  const dl = path.join(dir, "dl");
  const json = path.join(dir, `marketplace-${market}.json`);
  const exit = await main(["marketplace", "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "run-artifact:38478430806", "--market", market, "--download-dir", dl, "--json", json], { fetch: m.fetch, platform: "win32", arch: "x64", runSmoke: smoke, ...fx.capture().io });
  return { evidence: JSON.parse(fs.readFileSync(json, "utf8")), dl, exit };
}

const report = (evs) => buildReport(evs.map((e, i) => ({ file: `in${i}.json`, text: JSON.stringify(e), evidence: e })));
const clone = (x) => structuredClone(x);
const setStatus = (e, pred, status) => { const c = e.checks.find(pred); assert.ok(c, "check to mutate exists"); c.status = status; return e; };
const vsmWin = (dl) => path.join(dl, "vscode-marketplace", fx.vsixName(V, "win32-x64"));

let REHEARSAL;
async function rehearsal() {
  if (!REHEARSAL) {
    const inv = await inventoryEvidence();
    const life = await lifecycleEvidence(path.join(inv.dir, fx.vsixName(V, "win32-x64")));
    REHEARSAL = { inventory: inv.evidence, lifecycle: life };
  }
  return { inventory: clone(REHEARSAL.inventory), lifecycle: clone(REHEARSAL.lifecycle) };
}

// The publish build repackages from the tag, so published bytes differ from the RC rehearsal set.
const publishedSet = () => fx.makeTargetSet(V, { "win32-x64": fx.makeVsix("win32-x64", { engines: "^1.101.1" }) });

let MARKET;
async function marketplace() {
  if (!MARKET) {
    const mk = await marketplaceEvidence({ set: publishedSet() });
    assert.equal(mk.exit, 0);
    const life = await lifecycleEvidence(vsmWin(mk.dl));
    MARKET = { marketplace: mk.evidence, lifecycle: life, dl: mk.dl };
  }
  return { marketplace: clone(MARKET.marketplace), lifecycle: clone(MARKET.lifecycle), dl: MARKET.dl };
}

test("rehearsal with every required check passing: rehearsal-pass, exit 0, never marketplace-verified, banner first", async () => {
  const r = await rehearsal();
  const rep = report([r.inventory, r.lifecycle]);
  assert.equal(rep.mode, "pre-release-rehearsal");
  assert.equal(rep.status, "rehearsal-pass", JSON.stringify(rep.required.filter((x) => x.status !== "pass"), null, 1));
  assert.equal(rep.exitCode, 0);
  assert.equal(rep.claims.marketplaceVerified, false);
  const out = fx.tmpDir("rv-report");
  writeReport(out, rep);
  const md = fs.readFileSync(path.join(out, "report.md"), "utf8");
  assert.match(md.split("\n")[0], /PRE-RELEASE REHEARSAL - NOT A MARKETPLACE VERIFICATION/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8")).status, "rehearsal-pass");
});

test("rehearsal with inventory only, or one required check inconclusive, is incomplete (exit 3)", async () => {
  const r = await rehearsal();
  const only = report([r.inventory]);
  assert.equal(only.status, "incomplete");
  assert.equal(only.exitCode, 3);
  assert.ok(only.missing.some((k) => k.startsWith("lifecycle/")));
  const incon = report([setStatus(r.inventory, (c) => c.id === "native-binary" && c.target === "darwin-arm64", "inconclusive"), r.lifecycle]);
  assert.equal(incon.status, "incomplete");
  assert.equal(incon.exitCode, 3);
});

test("marketplace with every required check passing and the seven informational NOT-RUN checks: verified", async () => {
  const m = await marketplace();
  const rep = report([m.marketplace, m.lifecycle]);
  assert.equal(rep.mode, "marketplace-verification");
  assert.equal(rep.status, "verified", JSON.stringify(rep.required.filter((x) => x.status !== "pass"), null, 1));
  assert.equal(rep.exitCode, 0);
  assert.equal(rep.claims.marketplaceVerified, true);
  const info = rep.informational.filter((c) => c.status === "not-run");
  assert.equal(info.filter((c) => c.id === "host-load").length, 7);
  assert.equal(info.filter((c) => c.id === "lifecycle").length, 7);
  const residual = rep.checks.find((c) => c.id === "residual-processes");
  assert.equal(residual.status, "pass");
  assert.match(residual.detail, /git\.exe/, "residual processes are listed without affecting the status");
});

test("marketplace with one Open VSX target inconclusive is incomplete, never verified", async () => {
  const m = await marketplace();
  const rep = report([setStatus(m.marketplace, (c) => c.scope === "open-vsx" && c.id === "listed" && c.target === "darwin-x64", "inconclusive"), m.lifecycle]);
  assert.equal(rep.status, "incomplete");
  assert.equal(rep.exitCode, 3);
  assert.equal(rep.claims.marketplaceVerified, false);
});

test("marketplace without lifecycle is incomplete; a lifecycle on RC-built bytes fails", async () => {
  const m = await marketplace();
  const none = report([m.marketplace]);
  assert.equal(none.status, "incomplete");
  const r = await rehearsal();
  const rc = report([m.marketplace, r.lifecycle]);
  assert.equal(rc.status, "fail");
  assert.equal(rc.exitCode, 1);
  assert.match(rc.checks.find((c) => c.id === "lifecycle-binding").detail, /differs/);
});

test("marketplace with a lifecycle whose to version is not V fails (exit 1)", async () => {
  const m = await marketplace();
  const life = m.lifecycle;
  life.version = "6.0.6";
  life.inputs.vsix.to.version = "6.0.6";
  const rep = report([m.marketplace, life]);
  assert.equal(rep.status, "fail");
  assert.equal(rep.exitCode, 1);
  assert.match(rep.checks.find((c) => c.id === "lifecycle-binding").detail, /6\.0\.6/);
});

test("marketplace with one required check not-run (the host packaged-binary load) is incomplete", async () => {
  const m = await marketplace();
  const rep = report([setStatus(m.marketplace, (c) => c.id === "host-load", "not-run"), m.lifecycle]);
  assert.equal(rep.status, "incomplete");
  assert.equal(rep.exitCode, 3);
});

test("vscode-marketplace evidence only is incomplete: both marketplaces are required by name", async () => {
  assert.deepEqual(REQUIRED_MARKETS, ["vscode-marketplace", "open-vsx"]);
  const mk = await marketplaceEvidence({ market: "vscode" });
  assert.equal(mk.exit, 0);
  const life = await lifecycleEvidence(vsmWin(mk.dl));
  const rep = report([mk.evidence, life]);
  assert.equal(rep.status, "incomplete");
  assert.equal(rep.exitCode, 3);
  assert.ok(rep.missing.some((k) => k.startsWith("open-vsx/")));
});

test("two marketplace files with different approved sets exit 2 naming both; with the same set they verify", async () => {
  const vsm = await marketplaceEvidence({ market: "vscode" });
  // A re-run that repackaged: alpine-x64 differs (still a valid VSIX), so Open VSX got other bytes and another approved set.
  const repackaged = { ...fx.makeTargetSet(V), "alpine-x64": fx.makeVsix("alpine-x64", { engines: "^1.102.0" }) };
  const ovsxDifferent = await marketplaceEvidence({ market: "openvsx", set: repackaged });
  assert.equal(vsm.exit, 0);
  assert.equal(ovsxDifferent.exit, 0, "each file passes alone");
  const life = await lifecycleEvidence(vsmWin(vsm.dl));
  const a = vsm.evidence.inputs.approvedSums.sha256;
  const b = ovsxDifferent.evidence.inputs.approvedSums.sha256;
  assert.notEqual(a, b, "the two runs used different approved sets");
  assert.throws(() => report([vsm.evidence, ovsxDifferent.evidence, life]), (err) => err.exitCode === 2 && err.message.includes(a) && err.message.includes(b));
  const set = fx.makeTargetSet(V);
  const v1 = await marketplaceEvidence({ market: "vscode", set });
  const o1 = await marketplaceEvidence({ market: "openvsx", set });
  const life1 = await lifecycleEvidence(vsmWin(v1.dl));
  const ok = report([v1.evidence, o1.evidence, life1]);
  assert.equal(ok.status, "verified", JSON.stringify(ok.required.filter((x) => x.status !== "pass"), null, 1));
});

test("rehearsal with a lifecycle on bytes other than the inventoried win32-x64 VSIX fails", async () => {
  const r = await rehearsal();
  const m = await marketplace();
  const rep = report([r.inventory, m.lifecycle]);
  assert.equal(rep.status, "fail");
  assert.match(rep.checks.find((c) => c.id === "lifecycle-binding").detail, /differs/);
});

test("an informational check with status fail makes the status fail in either mode", async () => {
  const r = await rehearsal();
  const rep = report([r.inventory, setStatus(r.lifecycle, (c) => c.id === "operator-registry", "fail")]);
  assert.equal(rep.status, "fail");
  const m = await marketplace();
  const rep2 = report([m.marketplace, setStatus(m.lifecycle, (c) => c.id === "operator-registry", "fail")]);
  assert.equal(rep2.status, "fail");
});

test("fail plus inconclusive is fail (exit 1)", async () => {
  const m = await marketplace();
  setStatus(m.marketplace, (c) => c.scope === "open-vsx" && c.id === "listed" && c.target === "linux-x64", "inconclusive");
  setStatus(m.marketplace, (c) => c.scope === "vscode-marketplace" && c.id === "inventory" && c.target === "linux-arm64", "fail");
  const rep = report([m.marketplace, m.lifecycle]);
  assert.equal(rep.status, "fail");
  assert.equal(rep.exitCode, 1);
});

test("approved sums of kind local in marketplace evidence fail; a recorded sums sha256 not matching its file fails", async () => {
  const m = await marketplace();
  m.marketplace.inputs.approvedSums.source = { kind: "local", ref: "x", verified: "local" };
  assert.equal(report([m.marketplace, m.lifecycle]).status, "fail");
  const m2 = await marketplace();
  m2.marketplace.inputs.approvedSums.sha256 = "0".repeat(64);
  const rep = report([m2.marketplace, m2.lifecycle]);
  assert.equal(rep.status, "fail");
  assert.match(rep.checks.find((c) => c.id === "approved-sums-file").detail, /differs/);
});

test("a download record whose sha256 differs from the approved line fails even when the per-check sha256 says pass", async () => {
  const m = await marketplace();
  const d = m.marketplace.downloads.find((x) => x.marketplace === "open-vsx" && x.target === "linux-x64");
  d.sha256 = "1".repeat(64);
  assert.equal(m.marketplace.checks.find((c) => c.scope === "open-vsx" && c.id === "sha256" && c.target === "linux-x64").status, "pass");
  const rep = report([m.marketplace, m.lifecycle]);
  assert.equal(rep.status, "fail");
  assert.equal(rep.checks.find((c) => c.scope === "open-vsx" && c.id === "download-sha" && c.target === "linux-x64").status, "fail");
});

test("schema errors exit 2 naming the field: unknown fields, wrong enums, null approvedSums for marketplace, two versions", async () => {
  const m = await marketplace();
  const r = await rehearsal();
  const cases = [
    [Object.assign(clone(m.marketplace), { mode: "marketplace-verification" }), /\$\.mode/],
    [Object.assign(clone(m.marketplace), { claims: { marketplaceVerified: true } }), /\$\.claims/],
    [setStatus(clone(m.marketplace), (c) => c.id === "query", "ok"), /status/],
    [Object.assign(clone(m.marketplace), { inputs: { ...m.marketplace.inputs, approvedSums: null } }), /approvedSums/],
  ];
  for (const [bad, re] of cases) {
    assert.throws(() => report([bad, m.lifecycle]), (err) => err.exitCode === 2 && re.test(err.message), String(re));
  }
  const otherVersion = r.inventory;
  otherVersion.version = "6.0.8";
  assert.throws(() => report([otherVersion, m.marketplace]), (err) => err.exitCode === 2 && /version/.test(err.message));
  const dir = fx.tmpDir("rv-report-cli");
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, JSON.stringify(cases[0][0]));
  assert.equal(await main(["report", "--in", bad, "--out", path.join(dir, "out")], fx.capture().io), 2);
});

test("the report names the approved-sums source and its verification", async () => {
  const m = await marketplace();
  const rep = report([m.marketplace, m.lifecycle]);
  assert.deepEqual(rep.approvedSums.source, { kind: "run-artifact", ref: "38478430806", verified: "attested" });
  const out = fx.tmpDir("rv-report");
  writeReport(out, rep);
  const md = fs.readFileSync(path.join(out, "report.md"), "utf8");
  assert.match(md.split("\n")[0], /^# MARKETPLACE VERIFICATION/);
  assert.match(md, /run-artifact:38478430806 \(attested; approved-sums check: pass\)/);
  assert.equal(rep.approvedSumsCheck, "pass");
});

test("the required table lists both marketplaces' per-target checks and the lifecycle literally", () => {
  const req = requiredChecks("marketplace-verification", V);
  for (const market of ["vscode-marketplace", "open-vsx"]) {
    for (const t of Object.keys(fx.NATIVE_TARGETS)) {
      for (const id of ["listed", "download", "sha256", "inventory", "download-sha"]) assert.ok(req.includes(`${market}/${id}/${t}`), `${market}/${id}/${t}`);
    }
  }
  for (const k of ["vscode-marketplace/host-load/win32-x64", "lifecycle/S4/win32-x64", "lifecycle/persistence/win32-x64", "isolation/home-registry/-", "report/lifecycle-binding/-"]) assert.ok(req.includes(k), k);
});

test("evidence.schema.json documents the same enums the validator enforces", () => {
  const schema = JSON.parse(fs.readFileSync(fx.rv("evidence.schema.json"), "utf8"));
  const d = schema.$defs;
  assert.equal(schema.properties.schema.const, ev.SCHEMA);
  assert.deepEqual(schema.properties.kind.enum, ev.KINDS);
  assert.deepEqual(d.check.properties.scope.enum, ev.SCOPES);
  assert.deepEqual(d.check.properties.status.enum, ev.STATUSES);
  assert.deepEqual(d.artifactSource.properties.kind.enum, ev.ARTIFACT_KINDS);
  assert.deepEqual(d.approvedSums.properties.source.properties.kind.enum, ev.SUMS_KINDS);
  assert.deepEqual(d.approvedSums.properties.source.properties.verified.enum, ev.SUMS_VERIFIED);
  assert.deepEqual(d.download.properties.marketplace.enum, ev.MARKETS);
  assert.equal(schema.additionalProperties, false);
});

test("a release-asset fetch that differed is labelled with its failing check status, not just fetched-equal", async () => {
  const set = fx.makeTargetSet(V);
  const dir = fx.writeTargetSet(V, set);
  const json = path.join(dir, "inventory.json");
  const fetch = async () => new Response("different bytes\n", { status: 200 });
  assert.equal(await main(["inventory", "--dir", dir, "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "release-asset:v6.0.7", "--json", json], { fetch, ...fx.capture().io }), 1);
  const rep = buildReport([{ file: "inventory.json", text: fs.readFileSync(json, "utf8"), evidence: JSON.parse(fs.readFileSync(json, "utf8")) }]);
  assert.equal(rep.approvedSumsCheck, "fail");
  const out = fx.tmpDir("rv-report");
  writeReport(out, rep);
  assert.match(fs.readFileSync(path.join(out, "report.md"), "utf8"), /release-asset:v6\.0\.7 \(fetched-equal; approved-sums check: fail\)/);
});
