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
const { exitFor } = require(fx.rv("lib/evidence.cjs"));
const { main } = require(fx.rv("rv.cjs"));
const { OPERATOR, fakeCodeDir, vsixFiles, fakeWorld } = require("./helpers/fakes.cjs");

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
  assert.equal(w.kills[0].list, w.kills[1].list, "main is killed right after the exthost, with no process listing in between");
  assert.ok(w.aliveInDirAtDbCheck.every((pids) => pids.length === 0), "no process from DIR is alive when the databases are copied");
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

test("a PID whose CreationDate changed between listing and kill is not signalled on the stale identity; the operator's Code.exe never is", async () => {
  const { w, deps } = setup({
    onList: (world) => {
      // Launch 4: listing 1 is the snapshot; listing 2 is the kill round's re-check. Only CreationDate changes:
      // the ExecutablePath stays inside DIR, so only the CreationDate comparison can refuse it.
      if (world.launchNo === 4 && world.listInLaunch === 2) {
        world.alive = world.alive.map((p) => (p.pid === 1041 ? { ...p, created: "reused" } : p));
      }
    },
  });
  const r = await lc.runLifecycle(deps);
  const s4 = w.kills.filter((k) => k.launch === 4);
  assert.equal(s4[0].pid, 1040, "the stale exthost identity is skipped, so main is the first kill");
  assert.ok(s4.filter((k) => k.pid === 1041).every((k) => k.created === "reused" && k.list > s4[0].list), "1041 is only signalled after it was listed again under its new identity");
  assert.match(step(r, "S4").detail, /1041 not signalled/);
  assert.ok(w.kills.every((k) => k.pid !== OPERATOR.pid));
});

test("a process from DIR that appears after the snapshot is stopped before the databases are copied", async () => {
  const { w, deps } = setup({
    onList: (world) => {
      if (world.launchNo === 4 && world.listInLaunch === 2) world.alive.push({ pid: 1049, ppid: 1040, exe: path.join(deps.code.dir, "Code.exe"), created: "late" });
    },
  });
  const r = await lc.runLifecycle(deps);
  assert.ok(w.kills.some((k) => k.pid === 1049), "the late process is stopped");
  assert.ok(w.aliveInDirAtDbCheck.every((pids) => pids.length === 0), JSON.stringify(w.aliveInDirAtDbCheck));
  assert.equal(step(r, "S4").status, "pass", step(r, "S4").detail);
});

test("a child that exited with main before taskkill reached it is not reported as a taskkill failure", async () => {
  const { w, deps } = setup({ renderer: true });
  const r = await lc.runLifecycle(deps);
  assert.ok(w.kills.some((k) => k.launch === 4 && k.pid === 1043), "the renderer was in the kill round");
  assert.equal(step(r, "S4").status, "pass", step(r, "S4").detail);
  assert.doesNotMatch(step(r, "S4").detail, /taskkill/);
});

test("a quit timeout force-stops the step's processes, extension host first, and fails the step", async () => {
  const { w, deps } = setup({ ignoreQuitAt: [3] });
  const r = await lc.runLifecycle(deps);
  assert.equal(step(r, "S3").status, "fail");
  assert.match(step(r, "S3").detail, /quit timed out/);
  assert.deepEqual(w.kills.filter((k) => k.launch === 3).map((k) => k.pid), [1031, 1030], "exthost first on the quit-timeout path too");
  assert.equal(step(r, "S4").status, "pass", "the run continues once everything stopped");
});

test("a quit timeout whose processes never stop fails the step, skips its database copy and aborts the run", async () => {
  const { w, deps } = setup({ ignoreQuitAt: [3], stubborn: [1030] });
  const r = await lc.runLifecycle(deps);
  assert.equal(step(r, "S3").status, "fail");
  assert.match(step(r, "S3").detail, /still running.*1030/);
  assert.ok(!w.copyDirs.some((d) => d.endsWith(`${path.sep}S3`)), "S3's databases are not copied");
  assert.ok(["S4", "S5", "S6", "S7"].every((s) => step(r, s).status === "not-run"));
});

test("a launch failure signals every owned process, including one that appeared after the snapshot", async () => {
  const { w, deps } = setup({
    triggerWrites: false,
    onList: (world) => {
      if (world.launchNo === 1 && world.listInLaunch === 2) world.alive.push({ pid: 1019, ppid: 1010, exe: path.join(deps.code.dir, "Code.exe"), created: "late" });
    },
  });
  const r = await lc.runLifecycle(deps);
  const killed = w.kills.filter((k) => k.launch === 1).map((k) => k.pid);
  for (const pid of [1010, 1011, 1019]) assert.ok(killed.includes(pid), `${pid} signalled (got ${killed.join(", ")})`);
  assert.equal(step(r, "S1").status, "inconclusive");
});

test("a process listing that fails mid-run is inconclusive: the step is not judged, its databases are not copied, the run aborts", async () => {
  const { w, deps } = setup({ listFailAt: { launch: 4, n: 1 } });
  const r = await lc.runLifecycle(deps);
  assert.equal(step(r, "S4").status, "inconclusive");
  assert.match(step(r, "S4").detail, /process listing failed/);
  assert.ok(!w.copyDirs.some((d) => d.endsWith(`${path.sep}S4`)));
  assert.ok(["S5", "S6", "S7"].every((s) => step(r, s).status === "not-run"));
  assert.equal(exitFor(r.checks), 3);
});

test("when the owned set never empties (taskkill fails) the step fails and its databases are not copied", async () => {
  const { w, deps } = setup({ stubborn: [1040] });
  const r = await lc.runLifecycle(deps);
  assert.equal(step(r, "S4").status, "fail");
  assert.match(step(r, "S4").detail, /still running.*1040/);
  assert.match(step(r, "S4").detail, /taskkill 1040 failed/);
  assert.ok(!w.copyDirs.some((d) => d.endsWith(`${path.sep}S4`)), "S4's databases are not copied while a process from DIR is alive");
});

test("an extension host restarted during the S4 kill fails S4 even though the restarted session added a row", async () => {
  const { w, deps } = setup({ restartOnExthostKill: true });
  const r = await lc.runLifecycle(deps);
  assert.ok(w.kills.some((k) => k.pid === 1045), "the restarted extension host is stopped too");
  assert.equal(step(r, "S4").status, "fail");
  assert.match(step(r, "S4").detail, /2 found lines/);
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

test("an invalid SystemRoot makes the real process listing fail before any spawn: exit 3", async () => {
  const winproc = require(fx.rv("lib/winproc.cjs"));
  const code = fakeCodeDir();
  const v = vsixFiles();
  const calls = [];
  const lifecycleDeps = { spawn: () => { calls.push("spawn"); throw new Error("must not spawn"); }, listProcesses: () => winproc.listProcesses({ env: { SystemRoot: "Windows" } }), kill: async () => { calls.push("kill"); } };
  const root = path.join(fx.tmpDir("rv-root-parent"), "root");
  assert.equal(await main(lifecycleArgs({ code, root, from: v.fromPath, to: v.toPath }), { platform: "win32", arch: "x64", lifecycleDeps, ...fx.capture().io }), 3);
  assert.deepEqual(calls, []);
});
