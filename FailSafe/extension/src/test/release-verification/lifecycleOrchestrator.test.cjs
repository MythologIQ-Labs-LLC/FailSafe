/**
 * Wave 0 (#521) FX967: the lifecycle orchestrator against a fake VS Code. The
 * fake spawner, lister, killer and clock record every decision, so the tests
 * can assert the exact spawn sequence, that only our processes are signalled,
 * and that the S4 kill waits for commit-observed.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const lc = require(fx.rv("lib/lifecycle.cjs"));
const { inspectVsix } = require(fx.rv("lib/inventory.cjs"));
const { exitFor } = require(fx.rv("lib/evidence.cjs"));
const { main } = require(fx.rv("rv.cjs"));

const OPERATOR = { pid: 10, ppid: 1, exe: "C:\\Users\\op\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", created: "op" };

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

function vsixFiles() {
  const dir = fx.tmpDir("rv-vsix");
  const fromBytes = fx.makeUniversal606();
  const toBytes = fx.makeVsix("win32-x64");
  const fromPath = path.join(dir, "mythologiq-failsafe-6.0.6.vsix");
  const toPath = path.join(dir, "mythologiq-failsafe-6.0.7-win32-x64.vsix");
  fs.writeFileSync(fromPath, fromBytes);
  fs.writeFileSync(toPath, toBytes);
  const info = (p, b, v) => ({ path: p, sha256: fx.sha256(b), version: v, inspection: inspectVsix(b, v) });
  return { dir, fromPath, toPath, from: info(fromPath, fromBytes, "6.0.6"), to: info(toPath, toBytes, "6.0.7") };
}

/**
 * A fake VS Code world. Each launch starts a main and an exthost process in
 * DIR and a git.exe child outside DIR, writes the trigger's lines, and (unless
 * registry is false) the server registry under the spawned USERPROFILE.
 */
function fakeWorld({ code, root, v, registry = true, triggerWrites = true, git = true, onList, operatorRegistryPath, leakToOperator = false }) {
  const w = { calls: [], kills: [], alive: [OPERATOR], clock: Date.parse("2026-10-15T10:00:00Z"), launchNo: 0, listInLaunch: 0, installed: null, snap: 0, copyDirs: [], current: null };
  const deps = {
    root, code: lc.validateCodeDir(code), from: v.from, to: v.to, trigger: "C:\\rv\\trigger", env: { USERPROFILE: "C:\\Users\\op", VSCODE_PID: "1" }, host: "win32-x64",
    operatorRegistryPath,
    timeouts: { found: 5000, activated: 5000, commit: 5000, quit: 5000, poll: 500 },
    now: () => w.clock,
    sleep: async (ms) => { w.clock += ms; },
    spawn(file, args, { env }) {
      if (args.includes("--install-extension")) {
        const vsix = args[args.indexOf("--install-extension") + 1];
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
      w.current = { quitFile: `${env.FS_RV_OUT}.quit`, owned: [mainP.pid, ext.pid], ext: ext.pid, main: mainP.pid };
      if (triggerWrites) {
        fs.mkdirSync(path.dirname(env.FS_RV_OUT), { recursive: true });
        fs.appendFileSync(env.FS_RV_OUT, `${JSON.stringify({ event: "found", version: "x", extensionPath: "x", pid: ext.pid })}\n${JSON.stringify({ event: "activated", isActive: true, ms: 5 })}\n`);
      }
      const healthy = w.installed === v.to.path;
      if (registry) {
        const reg = path.join(env.USERPROFILE, ".failsafe", "servers.json");
        fs.mkdirSync(path.dirname(reg), { recursive: true });
        fs.writeFileSync(reg, JSON.stringify({ servers: [{ pid: ext.pid, port: 9376, workspacePath: lc.layout(root).ws, startedAt: new Date(w.clock + 1000).toISOString(), status: "active" }] }));
        if (healthy) w.snap += 1;
      }
      if (leakToOperator) fs.writeFileSync(operatorRegistryPath, JSON.stringify({ servers: [{ pid: ext.pid, workspacePath: lc.layout(root).ws }] }));
      return { pid: mainP.pid, exited: new Promise(() => {}) };
    },
    async listProcesses() {
      w.listInLaunch += 1;
      if (w.current && fs.existsSync(w.current.quitFile)) w.alive = w.alive.filter((p) => !w.current.owned.includes(p.pid));
      onList?.(w);
      return w.alive.map((p) => ({ ...p }));
    },
    async kill(pid) {
      w.kills.push({ pid, launch: w.launchNo });
      w.alive = w.alive.filter((p) => p.pid !== pid);
    },
    readInstalled: () => (w.installed === v.to.path ? { version: "6.0.7", targetPlatform: "win32-x64" } : { version: "6.0.6", targetPlatform: null }),
    scanLogs: () => (w.installed === v.from.path ? [{ kind: "degraded", id: "stub-mode", line: "Failed to initialize Ledger DB - running in stub mode", file: "exthost.log" }] : []),
    checkDbs: (ws, copyDir) => {
      w.copyDirs.push(copyDir);
      const r = (tables, snap = null) => ({ status: "pass", detail: "", exists: true, integrity: "ok", tables, snapshotCreated: snap });
      return { soa_ledger: r({ soa_ledger: 1, failsafe_checkpoints: w.snap }, w.snap), shadow_genome: r({ shadow_genome: 0 }), "sentinel-rag": r({ sentinel_observations: 0 }) };
    },
  };
  return { w, deps };
}

function setup(opts = {}) {
  const code = fakeCodeDir();
  const root = path.join(fx.tmpDir("rv-root-parent"), "root");
  const v = vsixFiles();
  const operatorRegistryPath = path.join(fx.tmpDir("rv-op"), "servers.json");
  fs.writeFileSync(operatorRegistryPath, JSON.stringify({ servers: [] }));
  const { w, deps } = fakeWorld({ code, root, v, operatorRegistryPath, ...opts });
  lc.prepareRoot(root);
  return { w, deps, root, v, code };
}

const step = (r, id) => r.checks.find((c) => c.scope === "lifecycle" && c.id === id);
const iso = (r, id) => r.checks.find((c) => c.scope === "isolation" && c.id === id);

/** Records every delete-shaped fs call during fn. */
async function noDeletes(fn) {
  const names = ["rmSync", "unlinkSync", "rmdirSync"];
  const saved = names.map((n) => fs[n]);
  const calls = [];
  names.forEach((n, i) => { fs[n] = (...a) => { calls.push(`${n}(${a[0]})`); return saved[i](...a); }; });
  try {
    await fn();
  } finally {
    names.forEach((n, i) => { fs[n] = saved[i]; });
  }
  return calls;
}

test("a full run issues exactly install, launch x7 in the S1-S7 order and kills only at S4, exthost first, after commit-observed", async () => {
  const { w, deps } = setup();
  let r;
  const deletes = await noDeletes(async () => { r = await lc.runLifecycle(deps); });
  assert.deepEqual(w.calls, ["install(from)", "launch", "install(to)", "launch", "launch", "launch", "launch", "install(from)", "launch", "install(to)", "launch"]);
  assert.deepEqual(w.kills.map((k) => k.launch), [4, 4]);
  assert.deepEqual(w.kills.map((k) => k.pid), [1041, 1040], "exthost first, then main");
  for (const s of ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]) assert.equal(step(r, s).status, "pass", `${s}: ${step(r, s).detail}`);
  assert.equal(step(r, "persistence").status, "pass", step(r, "persistence").detail);
  assert.equal(iso(r, "home-registry").status, "pass");
  assert.equal(exitFor(r.checks), 0);
  assert.deepEqual(deletes, []);
  assert.ok(w.kills.every((k) => k.pid !== OPERATOR.pid));
});

test("without the registry entry S4 never calls the killer and fails at the commit timeout", async () => {
  const { w, deps } = setup({ registry: false });
  const r = await lc.runLifecycle(deps);
  assert.equal(w.kills.filter((k) => k.launch === 4).length, 0);
  assert.equal(step(r, "S4").status, "fail");
  assert.match(step(r, "S4").detail, /commit/i);
});

test("a PID whose CreationDate changed between listing and kill is not signalled; the operator's Code.exe never is", async () => {
  const { w, deps } = setup({
    onList: (world) => {
      // Launch 4: listing 1 is the snapshot; listing 2 is the exthost re-check.
      if (world.launchNo === 4 && world.listInLaunch === 2) {
        world.alive = world.alive.map((p) => (p.pid === 1041 ? { pid: 1041, ppid: 1, exe: "C:\\Windows\\System32\\notepad.exe", created: "reused" } : p));
      }
    },
  });
  const r = await lc.runLifecycle(deps);
  assert.deepEqual(w.kills.filter((k) => k.launch === 4).map((k) => k.pid), [1040]);
  assert.match(step(r, "S4").detail, /1041/);
  assert.ok(w.kills.every((k) => k.pid !== OPERATOR.pid && k.pid !== 1041));
});

test("the trigger never writing found is a launch failure: inconclusive (exit 3), not a pass", async () => {
  const { deps } = setup({ triggerWrites: false });
  const r = await lc.runLifecycle(deps);
  assert.equal(step(r, "S1").status, "inconclusive");
  assert.ok(["S2", "S3", "S4", "S5", "S6", "S7"].every((s) => step(r, s).status === "not-run"));
  assert.equal(exitFor(r.checks), 3);
});

test("residual processes outside DIR are reported with a pass status and never signalled; DB copies stay under ROOT\\out", async () => {
  const { w, deps, root } = setup();
  const r = await lc.runLifecycle(deps);
  const residual = iso(r, "residual-processes");
  assert.equal(residual.status, "pass");
  assert.match(residual.detail, /git\.exe/);
  assert.ok(r.processes.residual.some((p) => /git\.exe$/i.test(p.exe)));
  assert.ok(w.kills.every((k) => k.pid % 10 !== 2), "git.exe children are never killed");
  const copies = path.join(lc.layout(root).out, "db-copies");
  assert.equal(w.copyDirs.length, 7);
  assert.ok(w.copyDirs.every((d) => d.startsWith(copies)), w.copyDirs.join(", "));
});

test("an entry with workspacePath inside ROOT appearing in the operator's servers.json fails isolation", async () => {
  const { deps } = setup({ leakToOperator: true });
  const r = await lc.runLifecycle(deps);
  assert.equal(iso(r, "operator-registry").status, "fail");
});

function lifecycleArgs({ code, root, from, to, extra = [] }) {
  return ["lifecycle", "--code", code, "--root", root, "--from", from, "--to", to, "--json", path.join(path.dirname(root), "lc.json"), ...extra];
}

function preflightDeps(calls) {
  return {
    spawn: () => { calls.push("spawn"); throw new Error("must not spawn"); },
    listProcesses: async () => [OPERATOR],
    kill: async () => { calls.push("kill"); },
  };
}

test("preflight refusals: non-empty ROOT exits 2; --to failing inventory exits 1; --to-sha256 mismatch exits 2; all with zero spawns", async () => {
  const code = fakeCodeDir();
  const v = vsixFiles();
  const calls = [];
  const io = { platform: "win32", arch: "x64", lifecycleDeps: preflightDeps(calls), ...fx.capture().io };

  const nonEmpty = fx.tmpDir("rv-root");
  fs.writeFileSync(path.join(nonEmpty, "keep.txt"), "x");
  assert.equal(await main(lifecycleArgs({ code, root: nonEmpty, from: v.fromPath, to: v.toPath }), io), 2);
  assert.ok(fs.existsSync(path.join(nonEmpty, "keep.txt")), "nothing in ROOT is deleted");

  const badTo = path.join(v.dir, "bad-to.vsix");
  fs.writeFileSync(badTo, fx.makeVsix("win32-x64", { addons: [{ name: "extension/node_modules/better-sqlite3/prebuilds/win32-x64.node", format: "ELF", arch: "x64" }] }));
  const root1 = path.join(fx.tmpDir("rv-root-parent"), "root");
  assert.equal(await main(lifecycleArgs({ code, root: root1, from: v.fromPath, to: badTo }), io), 1);

  const root2 = path.join(fx.tmpDir("rv-root-parent"), "root");
  assert.equal(await main(lifecycleArgs({ code, root: root2, from: v.fromPath, to: v.toPath, extra: ["--to-sha256", "0".repeat(64)] }), io), 2);
  assert.equal(await main(lifecycleArgs({ code, root: root2, from: v.fromPath, to: badTo, extra: ["--to-sha256", "0".repeat(64)] }), io), 2, "a hash mismatch outranks a failing inventory");

  assert.equal(await main(lifecycleArgs({ code, root: root2, from: v.fromPath, to: v.toPath }), { ...io, platform: "linux" }), 2, "win32-x64 only");
  assert.deepEqual(calls, []);
});
