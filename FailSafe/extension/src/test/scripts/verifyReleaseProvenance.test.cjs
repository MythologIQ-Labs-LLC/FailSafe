"use strict";
// FX975: non-publishing provenance check. Network and git are injected; each
// result must say pass only when the published bytes equal the manifest, and
// inconclusive (never pass) when the source cannot answer.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "scripts");
const prov = require(path.join(SCRIPTS, "verify-release-provenance.cjs"));
const { NATIVE_TARGETS } = require(path.join(SCRIPTS, "native-targets.cjs"));

const V = "6.0.7";
const TAG = `v${V}`;
const TARGETS = Object.keys(NATIVE_TARGETS);
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const bytesFor = (t) => Buffer.from(`pkg-${t}`);
const name = (t) => `mythologiq-failsafe-${V}-${t}.vsix`;
const sumsText = TARGETS.map((t) => `${sha256(bytesFor(t))}  ${name(t)}`).join("\n") + "\n";

function writeSums() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
  const f = path.join(dir, "SHA256SUMS.txt");
  fs.writeFileSync(f, sumsText);
  return f;
}

const ok = (body) => ({ status: 200, body: Buffer.isBuffer(body) ? body : Buffer.from(body) });
const status = (code) => ({ status: code, body: Buffer.alloc(0) });

/** A fake web: both marketplaces serve exactly the manifest bytes unless overridden. */
function web(over = {}) {
  return async (url) => {
    if (over[url]) return over[url];
    const vsm = /vsextensions\/mythologiq-failsafe\/[^/]+\/vspackage\?targetPlatform=(.+)$/.exec(url);
    if (vsm) return ok(bytesFor(vsm[1]));
    const meta = /open-vsx\.org\/api\/MythologIQ\/mythologiq-failsafe\/([^/]+)\/([^/]+)$/.exec(url);
    if (meta) return ok(JSON.stringify({ targetPlatform: meta[1], version: meta[2], files: { download: `ovsx-file:${meta[1]}`, sha256: `ovsx-sha:${meta[1]}` } }));
    const file = /^ovsx-file:(.+)$/.exec(url);
    if (file) return ok(bytesFor(file[1]));
    const sha = /^ovsx-sha:(.+)$/.exec(url);
    if (sha) return ok(`${sha256(bytesFor(sha[1]))} ${name(sha[1])}\n`);
    const gh = /^gh-asset:(.+)$/.exec(url);
    if (gh) return gh[1] === "SHA256SUMS.txt" ? ok(sumsText) : ok(bytesFor(/-(\w+-\w+)\.vsix$/.exec(gh[1])[1]));
    return status(404);
  };
}

const release = (names = [...TARGETS.map(name), "SHA256SUMS.txt"]) => ({ draft: false, assets: names.map((n) => ({ name: n, browser_download_url: `gh-asset:${n}` })) });

function deps(over = {}) {
  return {
    get: web(over.web),
    git: over.git ?? (() => "a".repeat(40)),
    githubRelease: async () => (over.release === undefined ? release() : over.release),
    targetOf: (bytes) => /^pkg-(.+)$/.exec(bytes.toString())?.[1],
    now: over.now ?? (() => 0),
    sleep: over.sleep ?? (async () => {}),
    intervalMs: 1000,
  };
}

const run = (args, d) => prov.run(["--version", V, "--sums", writeSums(), ...args], d);
const statuses = (r) => [...new Set(r.results.map((x) => x.status))];

test("every target equal on both marketplaces and the release: pass, exit 0", async () => {
  const r = await run(["--tag", TAG, "--commit", "a".repeat(40), "--github", "--vscode", "--openvsx"], deps());
  assert.deepEqual(statuses(r), ["pass"]);
  assert.equal(r.code, 0);
  assert.equal(r.results.filter((x) => x.check === "vscode-marketplace").length, 8);
  assert.equal(r.results.filter((x) => x.check === "open-vsx").length, 8);
});

test("the tag resolving to another commit fails", async () => {
  const r = await run(["--tag", TAG, "--commit", "a".repeat(40)], deps({ git: () => "b".repeat(40) }));
  assert.equal(r.code, 1);
  assert.match(r.results[0].detail, /expected a{40}/);
});

test("the release missing one package fails; an extra attachment fails", async () => {
  const missing = await run(["--github"], deps({ release: release([...TARGETS.slice(1).map(name), "SHA256SUMS.txt"]) }));
  assert.ok(missing.results.some((x) => x.status === "fail" && x.detail === `${name(TARGETS[0])} is not attached`));
  const extra = await run(["--github"], deps({ release: release([...TARGETS.map(name), "SHA256SUMS.txt", "x.vsix"]) }));
  assert.ok(extra.results.some((x) => x.detail === "unexpected attachment x.vsix"));
});

test("an attached manifest differing from the reference fails", async () => {
  const r = await run(["--github"], deps({ web: { "gh-asset:SHA256SUMS.txt": ok("different\n") } }));
  assert.ok(r.results.some((x) => x.status === "fail" && x.detail === "SHA256SUMS.txt differs from the manifest"));
});

test("a marketplace serving different bytes fails (falsifier for the byte comparison)", async () => {
  const url = prov.vscodeUrl(V, "linux-x64");
  const r = await run(["--vscode"], deps({ web: { [url]: ok(Buffer.from("pkg-linux-x64-rebuilt")) } }));
  assert.equal(r.code, 1);
  assert.ok(r.results.some((x) => x.status === "fail" && /linux-x64/.test(x.detail)));
});

test("a marketplace serving another target's package is reported as wrong target", async () => {
  const url = prov.vscodeUrl(V, "win32-arm64");
  const r = await run(["--vscode"], deps({ web: { [url]: ok(bytesFor("win32-x64")) } }));
  assert.ok(r.results.some((x) => x.status === "fail" && /served a win32-x64 package \(wrong target\)/.test(x.detail)));
});

for (const code of [404, 429, 503, 0]) {
  test(`HTTP ${code || "network error"} is inconclusive, never pass (exit 3)`, async () => {
    const url = prov.vscodeUrl(V, "darwin-x64");
    const r = await run(["--vscode"], deps({ web: { [url]: status(code) } }));
    assert.equal(r.code, 3);
    assert.equal(r.results.find((x) => /darwin-x64/.test(x.detail)).status, "inconclusive");
  });
}

test("Open VSX's own sha256 disagreeing with its bytes fails", async () => {
  const r = await run(["--openvsx"], deps({ web: { "ovsx-sha:alpine-x64": ok(`${"0".repeat(64)} x\n`) } }));
  assert.ok(r.results.some((x) => x.status === "fail" && /alpine-x64: Open VSX's own sha256 disagrees/.test(x.detail)));
});

test("no published release is inconclusive, not pass", async () => {
  const r = await run(["--github"], deps({ release: null }));
  assert.deepEqual([r.code, statuses(r)], [3, ["inconclusive"]]);
});

test("summarize: any fail wins over inconclusive", () => {
  assert.equal(prov.summarize([{ status: "pass" }, { status: "inconclusive" }, { status: "fail" }]), 1);
  assert.equal(prov.summarize([{ status: "pass" }, { status: "inconclusive" }]), 3);
  assert.equal(prov.summarize([{ status: "pass" }]), 0);
});

test("--wait polls until a propagating target appears, without re-downloading targets that passed", async () => {
  const url = prov.vscodeUrl(V, "linux-arm64");
  let t = 0, calls = 0, served = false;
  const d = deps({ now: () => t, sleep: async (ms) => { t += ms; served = true; } });
  const base = d.get;
  d.get = async (u) => { if (/vspackage/.test(u)) calls++; if (u === url && !served) return status(404); return base(u); };
  const r = await run(["--vscode", "--wait", "60"], d);
  assert.equal(r.code, 0);
  assert.equal(calls, 9, "8 targets once, then only the propagating one");
});

test("--wait stops at once on a byte difference, and gives up at the deadline", async () => {
  const bad = prov.vscodeUrl(V, "linux-x64");
  let slept = 0;
  const r1 = await run(["--vscode", "--wait", "60"], deps({ web: { [bad]: ok("other") }, sleep: async () => { slept++; } }));
  assert.deepEqual([r1.code, slept], [1, 0]);
  let t = 0;
  const gone = prov.vscodeUrl(V, "darwin-arm64");
  const r2 = await run(["--vscode", "--wait", "5"], deps({ web: { [gone]: status(404) }, now: () => t, sleep: async (ms) => { t += ms; } }));
  assert.equal(r2.code, 3);
  assert.ok(t <= 5000);
});
