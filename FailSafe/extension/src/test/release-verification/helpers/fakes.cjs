/**
 * Wave 0 (#521): shared fakes for the release-verification suites — a pair of
 * marketplaces in the 2026-10-15 response shapes, and a VS Code world for the
 * lifecycle orchestrator (spawner, lister, killer and clock that record every
 * decision). Nothing here touches the network or real processes.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const fx = require("./fixtures.cjs");

const lc = require(fx.rv("lib/lifecycle.cjs"));
const { inspectVsix } = require(fx.rv("lib/inventory.cjs"));
const { VSM_QUERY_URL } = require(fx.rv("lib/marketplace.cjs"));

const OVSX = "https://open-vsx.org/api/MythologIQ/mythologiq-failsafe";
const OPERATOR = { pid: 10, ppid: 1, exe: "C:\\Users\\op\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", created: "op" };

function reply(status, body, { url = "", headers = {} } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300, status, url, headers: new Headers(headers),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    json: async () => JSON.parse(buf.toString("utf8")),
  };
}

/**
 * A fake pair of marketplaces for version V.
 * opts.set: { target: Buffer } published on both unless overridden
 * opts.vsm / opts.ovsx: { targets, universal, truncated, shaProp: { t: hex } }
 * opts.ovsxRoot: "list" (default) | 404 | "no-downloads" | string[] keys
 */
function fakeMarkets(opts = {}) {
  const V = opts.version ?? "6.0.7";
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
    blobs.set(vsmUrl("universal"), fx.makeVsix(null, { version: V }));
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
        if (t === "universal") blobs.set(ovsxUrl("universal"), fx.makeVsix(null, { version: V }));
        return reply(200, { version: V, targetPlatform: t, files: { download: ovsxUrl(t) } });
      }
      return reply(404, { error: `Extension not found: MythologIQ.mythologiq-failsafe ${V} (${t})` });
    }
    throw new Error(`unexpected request ${url}`);
  };
  return { fetch, calls, set };
}

/** A fake extracted VS Code 1.141.1 archive in the real layout. */
function fakeCodeDir() {
  const dir = fx.tmpDir("rv-code");
  fs.writeFileSync(path.join(dir, "Code.exe"), "");
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(path.join(dir, "bin", "code.cmd"), "");
  const app = path.join(dir, "7baac39ec3", "resources", "app");
  fs.mkdirSync(path.join(app, "out"), { recursive: true });
  fs.writeFileSync(path.join(app, "out", "cli.js"), "");
  fs.writeFileSync(path.join(app, "product.json"), JSON.stringify({ version: "1.141.1", commit: "7baac39ec3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
  return dir;
}

/** from = the published-6.0.6 shape; to = a win32-x64 target VSIX (or toPath if given). */
function vsixFiles({ toPath } = {}) {
  const dir = fx.tmpDir("rv-vsix");
  const fromBytes = fx.makeUniversal606();
  const fromPath = path.join(dir, "mythologiq-failsafe-6.0.6.vsix");
  fs.writeFileSync(fromPath, fromBytes);
  let toBytes;
  if (toPath) toBytes = fs.readFileSync(toPath);
  else {
    toBytes = fx.makeVsix("win32-x64");
    toPath = path.join(dir, "mythologiq-failsafe-6.0.7-win32-x64.vsix");
    fs.writeFileSync(toPath, toBytes);
  }
  const info = (p, b, v) => ({ path: path.resolve(p), sha256: fx.sha256(b), version: v, inspection: inspectVsix(b, v) });
  return { dir, fromPath, toPath, from: info(fromPath, fromBytes, "6.0.6"), to: info(toPath, toBytes, "6.0.7") };
}

/**
 * A fake VS Code world. Each launch starts a main and an exthost process in
 * DIR and (unless git is false) a git.exe child outside DIR, writes the
 * trigger's lines, and (unless registry is false) the server registry under
 * the spawned USERPROFILE. A healthy launch (the to VSIX installed) adds one
 * snapshot.created row.
 */
function fakeWorld({ code, root, v, registry = true, triggerWrites = true, git = true, onList, operatorRegistryPath, leakToOperator = false, stubborn = [], restartOnExthostKill = false }) {
  const w = { calls: [], kills: [], alive: [OPERATOR], clock: Date.parse("2026-10-15T10:00:00Z"), launchNo: 0, listInLaunch: 0, listCount: 0, installed: null, snap: 0, copyDirs: [], aliveInDirAtDbCheck: [], current: null };
  const inDir = (p) => p.exe.toLowerCase().startsWith(`${deps.code.dir.toLowerCase()}${path.sep}`);
  const deps = {
    root, code: lc.validateCodeDir(code), from: v.from, to: v.to, trigger: "C:\\rv\\trigger", env: { USERPROFILE: "C:\\Users\\op", VSCODE_PID: "1" }, host: "win32-x64",
    operatorRegistryPath,
    timeouts: { found: 5000, activated: 5000, commit: 5000, quit: 5000, poll: 500 },
    now: () => w.clock,
    sleep: async (ms) => { w.clock += ms; },
    spawn(file, args, { env }) {
      if (args.includes("--install-extension")) {
        const vsix = path.resolve(args[args.indexOf("--install-extension") + 1]);
        w.calls.push(vsix === v.from.path ? "install(from)" : vsix === v.to.path ? "install(to)" : `install(${vsix})`);
        w.installed = vsix;
        return { pid: 900 + w.calls.length, exited: Promise.resolve(0) };
      }
      w.calls.push("launch");
      w.launchNo += 1;
      w.listInLaunch = 0;
      const base = 1000 + w.launchNo * 10;
      const mainP = { pid: base, ppid: 1, exe: path.join(deps.code.dir, "Code.exe"), created: `m${w.launchNo}` };
      const ext = { pid: base + 1, ppid: base, exe: path.join(deps.code.dir, "Code.exe"), created: `e${w.launchNo}` };
      w.alive.push(mainP, ext);
      if (git) w.alive.push({ pid: base + 2, ppid: base + 1, exe: "C:\\Program Files\\Git\\cmd\\git.exe", created: `g${w.launchNo}` });
      w.current = { quitFile: `${env.FS_RV_OUT}.quit`, owned: [mainP.pid, ext.pid], ext: ext.pid, main: mainP.pid, out: env.FS_RV_OUT };
      if (triggerWrites) {
        fs.mkdirSync(path.dirname(env.FS_RV_OUT), { recursive: true });
        fs.appendFileSync(env.FS_RV_OUT, `${JSON.stringify({ event: "found", version: "x", extensionPath: "x", pid: ext.pid })}\n${JSON.stringify({ event: "activated", isActive: true, ms: 5 })}\n`);
      }
      if (registry) {
        const reg = path.join(env.USERPROFILE, ".failsafe", "servers.json");
        fs.mkdirSync(path.dirname(reg), { recursive: true });
        fs.writeFileSync(reg, JSON.stringify({ servers: [{ pid: ext.pid, port: 9376, workspacePath: lc.layout(root).ws, startedAt: new Date(w.clock + 1000).toISOString(), status: "active" }] }));
        if (w.installed === v.to.path) w.snap += 1;
      }
      if (leakToOperator) fs.writeFileSync(operatorRegistryPath, JSON.stringify({ servers: [{ pid: ext.pid, workspacePath: lc.layout(root).ws }] }));
      return { pid: mainP.pid, exited: new Promise(() => {}) };
    },
    async listProcesses() {
      w.listInLaunch += 1;
      w.listCount += 1;
      if (w.current && fs.existsSync(w.current.quitFile)) w.alive = w.alive.filter((p) => !w.current.owned.includes(p.pid));
      onList?.(w);
      return w.alive.map((p) => ({ ...p }));
    },
    async kill(pid) {
      const victim = w.alive.find((p) => p.pid === pid);
      w.kills.push({ pid, launch: w.launchNo, created: victim?.created ?? null, list: w.listCount });
      if (stubborn.includes(pid)) return { ok: false, detail: "Access is denied." };
      w.alive = w.alive.filter((p) => p.pid !== pid);
      // A main process that is still alive restarts a killed extension host, whose trigger reports again.
      const mainAlive = w.current && w.alive.some((p) => p.pid === w.current.main);
      if (restartOnExthostKill && w.current && pid === w.current.ext && mainAlive) {
        const again = { pid: pid + 4, ppid: w.current.main, exe: path.join(deps.code.dir, "Code.exe"), created: `r${w.launchNo}` };
        w.alive.push(again);
        w.current.owned.push(again.pid);
        fs.appendFileSync(w.current.out, `${JSON.stringify({ event: "found", version: "x", extensionPath: "x", pid: again.pid })}
`);
        w.snap += 1;
      }
      return { ok: true, detail: "" };
    },
    readInstalled: () => (w.installed === v.to.path ? { version: "6.0.7", targetPlatform: "win32-x64" } : { version: "6.0.6", targetPlatform: null }),
    scanLogs: () => (w.installed === v.from.path ? [{ kind: "degraded", id: "stub-mode", line: "Failed to initialize Ledger DB - running in stub mode", file: "exthost.log" }] : []),
    checkDbs: (ws, copyDir) => {
      w.copyDirs.push(copyDir);
      w.aliveInDirAtDbCheck.push(w.alive.filter(inDir).map((p) => p.pid));
      const r = (tables, snap = null) => ({ status: "pass", detail: "", exists: true, integrity: "ok", tables, snapshotCreated: snap });
      return { soa_ledger: r({ soa_ledger: 1, failsafe_checkpoints: w.snap }, w.snap), shadow_genome: r({ shadow_genome: 0 }), "sentinel-rag": r({ sentinel_observations: 0 }) };
    },
  };
  return { w, deps };
}

module.exports = { OVSX, OPERATOR, reply, fakeMarkets, fakeCodeDir, vsixFiles, fakeWorld };
