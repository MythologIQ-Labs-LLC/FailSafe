/**
 * Wave 0 (#521) FX966: marketplace parity. Both marketplaces must publish
 * exactly the eight platform-targeted VSIXs, each byte-identical to the
 * approved checksum set; absence is inconclusive, never a pass.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const { runMarketplace, allowedHost, VSM_QUERY_URL } = require(fx.rv("lib/marketplace.cjs"));
const { parseSums } = require(fx.rv("lib/sums.cjs"));
const { exitFor } = require(fx.rv("lib/evidence.cjs"));
const { main } = require(fx.rv("rv.cjs"));

const V = "6.0.7";
const TARGETS = Object.keys(fx.NATIVE_TARGETS);
const OVSX = "https://open-vsx.org/api/MythologIQ/mythologiq-failsafe";
const ovsx606 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "openvsx-6.0.6.json"), "utf8"));
const vsm606 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "vsmarketplace-6.0.6.json"), "utf8"));

function reply(status, body, { url = "", headers = {} } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300, status, url, headers: new Headers(headers),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    json: async () => JSON.parse(buf.toString("utf8")),
  };
}

/**
 * A fake pair of marketplaces in the captured shapes.
 * opts.vsm / opts.ovsx: { targets: { t: Buffer }, universal, extra: [t], truncated, shaProp: { t: hex } }
 * opts.ovsxRoot: "list" (default) | 404 | "no-downloads" | string[] keys
 */
function fakeMarkets(opts = {}) {
  const set = opts.set ?? fx.makeTargetSet(V);
  const vsmTargets = opts.vsm?.targets ?? set;
  const ovsxTargets = opts.ovsx?.targets ?? set;
  const blobs = new Map();
  const calls = [];
  const vsmUrl = (t) => `https://mythologiq.gallerycdn.vsassets.io/extensions/mythologiq/mythologiq-failsafe/${V}/1792/${t}/Microsoft.VisualStudio.Services.VSIXPackage`;
  const ovsxUrl = (t) => `${OVSX}/${t}/${V}/file/MythologIQ.mythologiq-failsafe-${V}@${t}.vsix`;
  for (const [t, buf] of Object.entries(vsmTargets)) blobs.set(opts.vsmUrlFor?.(t) ?? vsmUrl(t), buf);
  for (const [t, buf] of Object.entries(ovsxTargets)) blobs.set(ovsxUrl(t), buf);
  const vsmVersions = Object.entries(vsmTargets).map(([t, buf]) => ({
    version: V, targetPlatform: t,
    files: [{ assetType: "Microsoft.VisualStudio.Services.VSIXPackage", source: opts.vsmUrlFor?.(t) ?? vsmUrl(t) }],
    properties: [{ key: "Microsoft.VisualStudio.Services.VsixSha256", value: opts.vsm?.shaProp?.[t] ?? fx.sha256(buf) }],
  }));
  if (opts.vsm?.universal) {
    const u = fx.makeVsix(null);
    blobs.set(vsmUrl("universal"), u);
    vsmVersions.push({ version: V, files: [{ assetType: "Microsoft.VisualStudio.Services.VSIXPackage", source: vsmUrl("universal") }], properties: [] });
  }
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === VSM_QUERY_URL) {
      if (opts.vsmResponse) return reply(200, opts.vsmResponse);
      return reply(200, { results: [{ extensions: [{ extensionName: "mythologiq-failsafe", versionsTruncated: Boolean(opts.vsm?.truncated), versions: vsmVersions }] }] });
    }
    if (opts.redirect?.[url]) return reply(200, blobs.get(url), { url: opts.redirect[url], headers: { "content-disposition": 'attachment; filename="evil.vsix"' } });
    if (blobs.has(url)) return reply(200, blobs.get(url), { url });
    if (url.startsWith(`${OVSX}/`)) {
      const rest = url.slice(OVSX.length + 1);
      if (rest === V) {
        const root = opts.ovsxRoot ?? "list";
        if (root === 404) return reply(404, { error: "not found" });
        if (root === "no-downloads") return reply(200, { version: V });
        const keys = Array.isArray(root) ? root : Object.keys(ovsxTargets).concat(opts.ovsx?.universal ? ["universal"] : []);
        return reply(200, { version: V, targetPlatform: keys[0], downloads: Object.fromEntries(keys.map((k) => [k, ovsxUrl(k)])) });
      }
      const [t, ver] = rest.split("/");
      if (ver === V && (ovsxTargets[t] || (t === "universal" && opts.ovsx?.universal))) {
        if (t === "universal") blobs.set(ovsxUrl("universal"), fx.makeVsix(null));
        return reply(200, { version: V, targetPlatform: t, files: { download: ovsxUrl(t) } });
      }
      return reply(404, { error: `Extension not found: MythologIQ.mythologiq-failsafe ${V} (${t})` });
    }
    throw new Error(`unexpected request ${url}`);
  };
  return { fetch, calls, set };
}

async function run(markets, extra = {}) {
  const set = markets.set;
  const approved = parseSums(fx.sumsText(V, set), extra.version ?? V);
  const downloadDir = fx.tmpDir("rv-dl");
  const smokeCalls = [];
  const runSmoke = extra.runSmoke ?? (async (file) => { smokeCalls.push(file); return { status: 0, output: "[PASS] fake smoke" }; });
  const r = await runMarketplace({ version: V, approved, downloadDir, markets: extra.markets ?? ["vscode-marketplace", "open-vsx"], fetch: markets.fetch, host: extra.host ?? "win32-x64", runSmoke });
  return { ...r, exit: exitFor(r.checks), downloadDir, smokeCalls };
}
const find = (r, scope, id, target = null) => r.checks.find((c) => c.scope === scope && c.id === id && c.target === target);

test("both marketplaces list exactly the eight targets and every download matches", async () => {
  const m = fakeMarkets();
  const r = await run(m);
  assert.equal(r.exit, 0, JSON.stringify(r.checks.filter((c) => c.status !== "pass"), null, 1));
  assert.equal(r.downloads.length, 16);
  for (const d of r.downloads) {
    assert.ok(d.apiUrl && d.finalUrl);
    const file = path.join(r.downloadDir, d.marketplace, fx.vsixName(V, d.target));
    assert.equal(fx.sha256(fs.readFileSync(file)), d.sha256);
  }
  assert.equal(find(r, "vscode-marketplace", "host-load", "win32-x64").status, "pass");
  assert.equal(r.smokeCalls.length, 1);
});

test("the recorded 6.0.6 responses (universal only) fail on both marketplaces with universal published", async () => {
  const universalBytes = fx.makeUniversal606();
  const set = fx.makeTargetSet("6.0.6");
  const fetch = async (url) => {
    if (url === VSM_QUERY_URL) return reply(200, vsm606);
    if (url === `${OVSX}/6.0.6`) return reply(200, ovsx606);
    if (url === `${OVSX}/universal/6.0.6`) return reply(200, ovsx606);
    if (url.startsWith(`${OVSX}/`)) return reply(404, { error: "not found" });
    return reply(200, universalBytes, { url });
  };
  const approved = parseSums(fx.sumsText("6.0.6", set), "6.0.6");
  const r = await runMarketplace({ version: "6.0.6", approved, downloadDir: fx.tmpDir("rv-dl"), markets: ["vscode-marketplace", "open-vsx"], fetch, host: "win32-x64", runSmoke: async () => ({ status: 0, output: "" }) });
  assert.equal(exitFor(r.checks), 1);
  for (const scope of ["vscode-marketplace", "open-vsx"]) {
    const set = find(r, scope, "target-set");
    assert.equal(set.status, "fail", scope);
    assert.match(set.detail, /universal published/, scope);
  }
});

test("Open VSX: a target missing from per-target and root fails; root-only extra fails; root-listed 404 is inconclusive", async () => {
  const set = fx.makeTargetSet(V);
  const ovsxTargets = { ...set };
  delete ovsxTargets["darwin-x64"];
  const a = await run(fakeMarkets({ set, ovsx: { targets: ovsxTargets } }));
  assert.equal(find(a, "open-vsx", "listed", "darwin-x64").status, "fail");
  assert.match(find(a, "open-vsx", "target-set").detail, /darwin-x64/);
  assert.equal(a.exit, 1);

  const b = await run(fakeMarkets({ set, ovsxRoot: [...TARGETS, "linux-armhf"] }));
  assert.equal(find(b, "open-vsx", "extra-targets").status, "fail");
  assert.match(find(b, "open-vsx", "extra-targets").detail, /linux-armhf/);

  const c = await run(fakeMarkets({ set, ovsx: { targets: ovsxTargets }, ovsxRoot: TARGETS }));
  assert.equal(find(c, "open-vsx", "listed", "darwin-x64").status, "inconclusive");
  assert.equal(c.exit, 3);

  const d = await run(fakeMarkets({ set, ovsxRoot: 404 }));
  assert.equal(find(d, "open-vsx", "extra-targets").status, "inconclusive");
  assert.equal(d.exit, 3);
});

test("VS Code Marketplace: extra universal entry fails; versionsTruncated is inconclusive; VsixSha256 mismatch fails; request shape", async () => {
  const a = await run(fakeMarkets({ vsm: { universal: true } }));
  assert.equal(find(a, "vscode-marketplace", "target-set").status, "fail");
  assert.match(find(a, "vscode-marketplace", "target-set").detail, /universal published/);

  const b = await run(fakeMarkets({ vsm: { truncated: true } }));
  assert.equal(find(b, "vscode-marketplace", "query").status, "inconclusive");
  assert.equal(b.exit, 3);

  const c = await run(fakeMarkets({ vsm: { shaProp: { "linux-x64": "0".repeat(64) } } }));
  assert.equal(find(c, "vscode-marketplace", "vsix-sha256-property", "linux-x64").status, "fail");
  assert.equal(find(c, "vscode-marketplace", "vsix-sha256-property", "win32-x64").status, "pass");

  const m = fakeMarkets();
  await run(m);
  const q = m.calls.find((x) => x.url === VSM_QUERY_URL);
  assert.equal(q.init.method, "POST");
  assert.equal(new Headers(q.init.headers).get("accept"), "application/json;api-version=7.2-preview.1");
  const body = JSON.parse(q.init.body);
  assert.equal(body.flags, 147);
  assert.deepEqual(body.filters[0].criteria, [{ filterType: 7, value: "MythologIQ.mythologiq-failsafe" }]);
});

test("a download URL outside the allowlist is never requested and fails that target", async () => {
  assert.equal(allowedHost("https://mythologiq.gallerycdn.vsassets.io/x"), true);
  assert.equal(allowedHost("https://open-vsx.org/api/x"), true);
  assert.equal(allowedHost("https://gallerycdn.vsassets.io.example.com/x"), false);
  assert.equal(allowedHost("https://github.com/x"), false);
  assert.equal(allowedHost("http://open-vsx.org/x"), false);
  for (const evil of ["https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download/x.vsix", "https://gallerycdn.vsassets.io.example.com/x.vsix"]) {
    const m = fakeMarkets({ vsmUrlFor: (t) => (t === "linux-x64" ? evil : `https://mythologiq.gallerycdn.vsassets.io/${t}.vsix`) });
    const r = await run(m);
    assert.equal(find(r, "vscode-marketplace", "download", "linux-x64").status, "fail");
    assert.equal(m.calls.filter((x) => x.url === evil).length, 0, `requested ${evil}`);
  }
});

test("one download whose bytes differ from the approved hash fails that target only and is never smoke-loaded", async () => {
  const set = fx.makeTargetSet(V);
  const tampered = Buffer.from(set["win32-x64"]);
  tampered[tampered.indexOf("module.exports")] ^= 0x01;
  const m = fakeMarkets({ set, vsm: { targets: { ...set, "win32-x64": tampered } } });
  const r = await run(m);
  assert.equal(find(r, "vscode-marketplace", "sha256", "win32-x64").status, "fail");
  assert.deepEqual(r.checks.filter((c) => c.id === "sha256" && c.status === "fail").map((c) => `${c.scope}/${c.target}`), ["vscode-marketplace/win32-x64"]);
  assert.equal(find(r, "vscode-marketplace", "host-load", "win32-x64").status, "not-run");
  assert.equal(r.smokeCalls.length, 0);
});

test("redirects are followed and recorded; the server's file name is ignored", async () => {
  const set = fx.makeTargetSet(V);
  const src = `${OVSX}/linux-x64/${V}/file/MythologIQ.mythologiq-failsafe-${V}@linux-x64.vsix`;
  const blob = "https://openvsxorg.blob.core.windows.net/resources/MythologIQ/mythologiq-failsafe/x.vsix";
  const r = await run(fakeMarkets({ set, redirect: { [src]: blob } }));
  const d = r.downloads.find((x) => x.marketplace === "open-vsx" && x.target === "linux-x64");
  assert.equal(d.apiUrl, src);
  assert.equal(d.finalUrl, blob);
  assert.ok(fs.existsSync(path.join(r.downloadDir, "open-vsx", fx.vsixName(V, "linux-x64"))));
  assert.ok(!fs.existsSync(path.join(r.downloadDir, "open-vsx", "evil.vsix")));
  assert.equal(r.exit, 0);
});

test("all Open VSX requests for V 404: inconclusive (exit 3), never pass", async () => {
  const r = await run(fakeMarkets({ ovsx: { targets: {} }, ovsxRoot: 404 }));
  assert.equal(find(r, "open-vsx", "target-set").status, "inconclusive");
  assert.ok(r.checks.filter((c) => c.scope === "open-vsx").every((c) => c.status !== "fail"));
  assert.equal(r.exit, 3);
});

test("a fail plus an inconclusive in the same run exits 1", async () => {
  const set = fx.makeTargetSet(V);
  const tampered = Buffer.from(set["linux-arm64"]);
  tampered[tampered.indexOf("module.exports")] ^= 0x01;
  const r = await run(fakeMarkets({ set, vsm: { targets: { ...set, "linux-arm64": tampered } }, ovsxRoot: 404 }));
  assert.ok(r.checks.some((c) => c.status === "inconclusive"));
  assert.ok(r.checks.some((c) => c.status === "fail"));
  assert.equal(r.exit, 1);
});

test("--sums-source local:PATH exits 2 before any fetch", async () => {
  const m = fakeMarkets();
  const dir = fx.writeTargetSet(V, m.set);
  const code = await main(["marketplace", "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "local:x", "--download-dir", path.join(dir, "dl"), "--json", path.join(dir, "m.json")], { fetch: m.fetch, ...fx.capture().io });
  assert.equal(code, 2);
  assert.equal(m.calls.length, 0);
});

test("rv marketplace writes schema-valid evidence with approved sums and sixteen downloads", async () => {
  const m = fakeMarkets();
  const dir = fx.writeTargetSet(V, m.set);
  const json = path.join(dir, "m.json");
  const code = await main(["marketplace", "--version", V, "--sums", path.join(dir, "SHA256SUMS.txt"), "--sums-source", "run-artifact:1", "--download-dir", path.join(dir, "dl"), "--json", json], { fetch: m.fetch, platform: "linux", arch: "x64", ...fx.capture().io });
  assert.equal(code, 0);
  const ev = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.equal(ev.kind, "marketplace");
  assert.equal(ev.downloads.length, 16);
  assert.equal(ev.inputs.approvedSums.source.verified, "attested");
  assert.equal(ev.checks.find((c) => c.id === "host-load").status, "not-run");
});
