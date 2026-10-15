/**
 * Wave 0 (#521) FX967: the pure decisions of the isolated lifecycle run —
 * which VS Code may be used, how it is spawned, which processes are ours, when
 * a checkpoint counts as committed, and what persistence means.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const lc = require(fx.rv("lib/lifecycle.cjs"));
const { inspectVsix } = require(fx.rv("lib/inventory.cjs"));

const HEX = "7baac39ec3";
const COMMIT = `${HEX}0123456789abcdef0123456789abcde`;

/** A fake extracted VS Code 1.141.1 archive in the real layout. */
function fakeCode({ version = "1.141.1", hexDirs = [HEX], commit = COMMIT, product = {}, omit = [] } = {}) {
  const dir = fx.tmpDir("rv-code");
  if (!omit.includes("Code.exe")) fs.writeFileSync(path.join(dir, "Code.exe"), "");
  if (!omit.includes("code.cmd")) {
    fs.mkdirSync(path.join(dir, "bin"));
    fs.writeFileSync(path.join(dir, "bin", "code.cmd"), "@echo off\n");
  }
  for (const h of hexDirs) {
    const app = path.join(dir, h, "resources", "app");
    fs.mkdirSync(path.join(app, "out"), { recursive: true });
    fs.writeFileSync(path.join(app, "out", "cli.js"), "");
    if (!omit.includes("product.json")) fs.writeFileSync(path.join(app, "product.json"), JSON.stringify({ version, commit, applicationName: "code", ...product }));
  }
  return dir;
}

test("validateCodeDir accepts the 1.141.1 layout and refuses every incomplete or inconsistent one", () => {
  const ok = lc.validateCodeDir(fakeCode());
  assert.equal(ok.product.version, "1.141.1");
  assert.equal(path.basename(ok.codeExe), "Code.exe");
  assert.match(ok.cliJs, /7baac39ec3[\\/]resources[\\/]app[\\/]out[\\/]cli\.js$/);
  for (const omit of ["Code.exe", "code.cmd", "product.json"]) {
    assert.throws(() => lc.validateCodeDir(fakeCode({ omit: [omit] })), /VS Code root/, omit);
  }
  assert.throws(() => lc.validateCodeDir(fakeCode({ hexDirs: [HEX, "0123456789"] })), /exactly one/);
  assert.throws(() => lc.validateCodeDir(fakeCode({ commit: "ffffffffff0000" })), /does not start/);
});

test("refuseUnsafe: engines floor, updater mutex, known installs, non-empty ROOT, running owned process", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\op\\AppData\\Local", ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" };
  const base = { root: path.join(fx.tmpDir("rv-root-parent"), "root"), env, engines: "^1.101.0", ownedRunning: 0 };
  lc.refuseUnsafe({ ...base, code: lc.validateCodeDir(fakeCode()) });
  assert.throws(() => lc.refuseUnsafe({ ...base, code: lc.validateCodeDir(fakeCode({ version: "1.100.0" })) }), /engines floor/);
  assert.throws(() => lc.refuseUnsafe({ ...base, code: lc.validateCodeDir(fakeCode({ product: { win32VersionedUpdate: true } })) }), /win32VersionedUpdate/);
  const code = lc.validateCodeDir(fakeCode());
  const installs = lc.knownInstallLocations(env);
  for (const loc of [
    "C:\\Users\\op\\AppData\\Local\\Programs\\Microsoft VS Code",
    "C:\\Users\\op\\AppData\\Local\\Programs\\Microsoft VS Code Insiders",
    "C:\\Program Files\\Microsoft VS Code",
    "C:\\Program Files\\Microsoft VS Code Insiders",
    "C:\\Program Files (x86)\\Microsoft VS Code",
    "C:\\Program Files (x86)\\Microsoft VS Code Insiders",
  ]) {
    assert.ok(installs.some((p) => p.toLowerCase() === loc.toLowerCase()), loc);
    for (const dir of [loc, `${loc}\\sub`, path.win32.dirname(loc)]) {
      assert.throws(() => lc.refuseUnsafe({ ...base, code: { ...code, dir } }), /install location/, dir);
    }
  }
  const nonEmpty = fx.tmpDir("rv-root");
  fs.writeFileSync(path.join(nonEmpty, "keep.txt"), "x");
  assert.throws(() => lc.refuseUnsafe({ ...base, root: nonEmpty, code }), /not empty/);
  const fileRoot = path.join(nonEmpty, "keep.txt");
  assert.throws(() => lc.refuseUnsafe({ ...base, root: fileRoot, code }), (err) => err.exitCode === 2 && /not a directory/.test(err.message));
  assert.throws(() => lc.refuseUnsafe({ ...base, code, ownedRunning: 1 }), /already running/);
});

test("buildSpawn: Code.exe with cli.js for installs, never a .cmd; launches carry the trigger and the workspace", () => {
  const code = lc.validateCodeDir(fakeCode());
  const root = "C:\\rv\\root";
  const L = lc.layout(root);
  const inst = lc.buildSpawn("install", { code, root, vsix: "C:\\v\\a.vsix" });
  assert.equal(inst.file, code.codeExe);
  assert.ok(!/\.cmd$/i.test(inst.file));
  assert.deepEqual(inst.args, [code.cliJs, "--user-data-dir", L.userData, "--extensions-dir", L.extensions, "--install-extension", "C:\\v\\a.vsix", "--force"]);
  const launch = lc.buildSpawn("launch", { code, root, trigger: "C:\\t" });
  assert.equal(launch.file, code.codeExe);
  assert.ok(launch.args.includes("--extensionDevelopmentPath=C:\\t"));
  assert.equal(launch.args[launch.args.length - 1], L.ws);
  assert.deepEqual(launch.args.slice(0, 4), ["--user-data-dir", L.userData, "--extensions-dir", L.extensions]);
  assert.ok(!launch.args.includes(code.cliJs));
});

test("buildEnv strips VSCODE_* and ELECTRON_RUN_AS_NODE, redirects the four home variables, sets ELECTRON_RUN_AS_NODE only for installs", () => {
  const parent = { USERPROFILE: "C:\\Users\\op", HOME: "C:\\Users\\op", APPDATA: "C:\\Users\\op\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\op\\AppData\\Local", VSCODE_PID: "1", vscode_ipc_hook: "x", VSCODE_IPC_HOOK: "y", ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "--require C:\\evil.js", Path: "C:\\Windows" };
  const root = "C:\\rv\\root";
  const L = lc.layout(root);
  const launch = lc.buildEnv(parent, root, { install: false, outFile: "C:\\rv\\root\\out\\S1.jsonl" });
  assert.deepEqual(Object.keys(launch).filter((k) => /^vscode_/i.test(k) || /^electron_run_as_node$/i.test(k)), []);
  assert.equal(launch.USERPROFILE, L.home);
  assert.equal(launch.HOME, L.home);
  assert.equal(launch.APPDATA, L.appData);
  assert.equal(launch.LOCALAPPDATA, L.localAppData);
  assert.equal(launch.FS_RV_OUT, "C:\\rv\\root\\out\\S1.jsonl");
  assert.equal(launch.Path, "C:\\Windows");
  const install = lc.buildEnv(parent, root, { install: true });
  assert.equal(install.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(install.NODE_OPTIONS, undefined, "NODE_OPTIONS never reaches an ELECTRON_RUN_AS_NODE install");
  assert.equal(launch.NODE_OPTIONS, undefined);
  assert.equal(install.USERPROFILE, L.home);
});

test("selectOwnedProcesses: only processes inside DIR are ours; outside descendants are residual", () => {
  const dir = "C:\\rv\\vscode";
  const procs = [
    { pid: 10, ppid: 1, exe: "C:\\Users\\op\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", created: "a" },
    { pid: 20, ppid: 1, exe: "C:\\rv\\vscode\\Code.exe", created: "b" },
    { pid: 21, ppid: 20, exe: "c:\\RV\\VSCODE\\7baac39ec3\\resources\\app\\node_modules\\helper.exe", created: "c" },
    { pid: 30, ppid: 1, exe: "C:\\rv\\vscode-other\\Code.exe", created: "d" },
    { pid: 40, ppid: 21, exe: "C:\\Program Files\\Git\\cmd\\git.exe", created: "e" },
    { pid: 50, ppid: 1, exe: "", created: "f" },
  ];
  const r = lc.selectOwnedProcesses(procs, dir);
  assert.deepEqual(r.owned.map((p) => p.pid), [20, 21]);
  assert.deepEqual(r.residual.map((p) => p.pid), [40]);
});

function commitInput(over = {}) {
  const root = "C:\\rv\\root";
  const L = lc.layout(root);
  const launchTime = Date.parse("2026-10-15T10:00:00Z");
  return {
    root, launchTime,
    events: [{ event: "found", pid: 4242 }, { event: "activated", isActive: true }],
    registryPath: path.win32.join(L.home, ".failsafe", "servers.json"),
    registry: { servers: [{ pid: 4242, workspacePath: L.ws, startedAt: "2026-10-15T10:00:05.000Z", port: 9376 }] },
    findings: [],
    ...over,
  };
}

test("commitObserved requires the activated line, the trigger's pid, ROOT\\home, ROOT\\ws, a fresh startedAt and no memory fallback", () => {
  assert.equal(lc.commitObserved(commitInput()).ok, true);
  const L = lc.layout("C:\\rv\\root");
  const variants = {
    "no activated line": { events: [{ event: "found", pid: 4242 }] },
    "pid differs": { events: [{ event: "found", pid: 1 }, { event: "activated", isActive: true }] },
    "startedAt before launch": { registry: { servers: [{ pid: 4242, workspacePath: L.ws, startedAt: "2026-10-15T09:59:00.000Z" }] } },
    "memory fallback logged": { findings: [{ kind: "degraded", id: "checkpoint-memory" }] },
    "registry outside ROOT\\home": { registryPath: "C:\\Users\\op\\.failsafe\\servers.json" },
    "workspacePath not ROOT\\ws": { registry: { servers: [{ pid: 4242, workspacePath: "C:\\rv\\root\\other", startedAt: "2026-10-15T10:00:05.000Z" }] } },
    "isActive false": { events: [{ event: "found", pid: 4242 }, { event: "activated", isActive: false }] },
  };
  for (const [label, over] of Object.entries(variants)) assert.equal(lc.commitObserved(commitInput(over)).ok, false, label);
  const driveCase = commitInput({ registry: { servers: [{ pid: 4242, workspacePath: L.ws.replace(/^C:/, "c:"), startedAt: "2026-10-15T10:00:05.000Z" }] } });
  assert.equal(lc.commitObserved(driveCase).ok, true, "drive-letter case alone does not matter on win32");
});

test("expectDegraded: true for the universal ELF x64 VSIX on win32-x64, false for the win32-x64 target VSIX", () => {
  assert.equal(lc.expectDegraded(inspectVsix(fx.makeUniversal606(), "6.0.6"), "win32-x64"), true);
  assert.equal(lc.expectDegraded(inspectVsix(fx.makeVsix("win32-x64"), "6.0.7"), "win32-x64"), false);
});

function stepInput(over = {}) {
  const passDb = { status: "pass", detail: "" };
  return {
    step: "S3", expectDegraded: false,
    expected: { version: "6.0.7", targetPlatform: "win32-x64" },
    installed: { version: "6.0.7", targetPlatform: "win32-x64" },
    launch: "ok", events: [{ event: "found", pid: 1 }, { event: "activated", isActive: true }],
    findings: [], dbs: { soa_ledger: passDb, shadow_genome: passDb, "sentinel-rag": passDb }, commit: { ok: true, reason: "" },
    ...over,
  };
}

test("assessStep: the detector must fire when degradation is expected and must stay silent otherwise", () => {
  assert.equal(lc.assessStep(stepInput()).status, "pass");
  assert.equal(lc.assessStep(stepInput({ findings: [{ kind: "degraded", id: "stub-mode", line: "x" }] })).status, "fail");
  assert.equal(lc.assessStep(stepInput({ expectDegraded: true, expected: { version: "6.0.6", targetPlatform: null }, installed: { version: "6.0.6", targetPlatform: null } })).status, "fail", "expected degraded but nothing logged");
  assert.equal(lc.assessStep(stepInput({ expectDegraded: true, expected: { version: "6.0.6", targetPlatform: null }, installed: { version: "6.0.6", targetPlatform: null }, findings: [{ kind: "degraded", id: "stub-mode", line: "x" }], commit: { ok: false } })).status, "pass");
  assert.equal(lc.assessStep(stepInput({ installed: { version: "6.0.6", targetPlatform: "win32-x64" } })).status, "fail");
  assert.equal(lc.assessStep(stepInput({ installed: { version: "6.0.7", targetPlatform: "linux-x64" } })).status, "fail");
  assert.equal(lc.assessStep(stepInput({ findings: [{ kind: "activation-failure", id: "duplicate-bootstrap", line: "x" }] })).status, "fail", "isActive true does not excuse a skipped bootstrap");
  assert.equal(lc.assessStep(stepInput({ launch: "launch-failure" })).status, "inconclusive");
  assert.equal(lc.assessStep(stepInput({ launch: "activation-timeout" })).status, "fail");
  assert.equal(lc.assessStep(stepInput({ commit: { ok: false, reason: "no registry entry" } })).status, "fail");
  assert.equal(lc.assessStep(stepInput({ dbs: { soa_ledger: { status: "fail", detail: "missing" } } })).status, "fail");
});

function rows(counts, { degraded = ["S1", "S6"], ledger } = {}) {
  return ["S1", "S2", "S3", "S4", "S5", "S6", "S7"].map((step, i) => ({
    step, expectDegraded: degraded.includes(step),
    counts: { snapshotCreated: counts[i], tables: { soa_ledger: { soa_ledger: ledger ? ledger[i] : 1, failsafe_checkpoints: counts[i] } } },
  }));
}

test("assessPersistence: each healthy session adds a snapshot.created row, including the killed one", () => {
  assert.equal(lc.assessPersistence(rows([0, 1, 2, 3, 4, 4, 5])).status, "pass");
  const killedWroteNothing = lc.assessPersistence(rows([0, 1, 2, 2, 3, 3, 4]));
  assert.equal(killedWroteNothing.status, "fail");
  assert.match(killedWroteNothing.detail, /S4/);
  assert.equal(lc.assessPersistence(rows([0, 1, 2, 3, 4, 4, 5])).status, "pass", "a degraded S6 may add nothing");
  assert.equal(lc.assessPersistence(rows([0, 1, 2, 3, 4, 3, 5])).status, "fail", "a degraded step must not lose rows");
  assert.equal(lc.assessPersistence(rows([0, 1, 2, 3, 4, 4, 5], { ledger: [0, 1, 1, 1, 0, 1, 1] })).status, "fail", "soa_ledger rows decreased");
  assert.equal(lc.assessPersistence(rows([0, 0, 1, 2, 3, 3, 4], { degraded: ["S1", "S2", "S6"] })).status, "fail", "C(S2) = 0");
});

test("winproc pins powershell.exe and taskkill.exe under %SystemRoot%\\System32 and reports taskkill's result", () => {
  const winproc = require(fx.rv("lib/winproc.cjs"));
  const exists = () => true;
  const tools = winproc.systemTools({ SystemRoot: "D:\\Win" }, { exists });
  assert.equal(tools.powershell, "D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(tools.taskkill, "D:\\Win\\System32\\taskkill.exe");
  assert.equal(winproc.systemTools({}, { exists }).taskkill, "C:\\Windows\\System32\\taskkill.exe");
  assert.deepEqual(winproc.killResult({ status: 0, stderr: "" }), { ok: true, detail: "" });
  assert.deepEqual(winproc.killResult({ status: 128, stderr: "ERROR: The process \"1040\" not found.\r\n" }), { ok: false, detail: "ERROR: The process \"1040\" not found." });
  assert.equal(winproc.killResult({ status: null, error: new Error("spawn EPERM") }).ok, false);
});

test("winproc refuses a relative SystemRoot or one without powershell.exe and taskkill.exe", () => {
  const winproc = require(fx.rv("lib/winproc.cjs"));
  assert.throws(() => winproc.systemTools({ SystemRoot: "Windows" }, { exists: () => true }), /absolute/);
  assert.throws(() => winproc.systemTools({ SystemRoot: "D:\\Win" }, { exists: (p) => !/taskkill/.test(p) }), /taskkill\.exe not found/);
  assert.throws(() => winproc.systemTools({ SystemRoot: "D:\\Win" }, { exists: (p) => !/powershell/.test(p) }), /powershell\.exe not found/);
});

test("winproc rejects an empty or partial process listing and reports a spawn error", async () => {
  const winproc = require(fx.rv("lib/winproc.cjs"));
  const self = 4242;
  assert.throws(() => winproc.parseListing("", self), /empty/);
  assert.throws(() => winproc.parseListing(JSON.stringify([{ ProcessId: 1, ParentProcessId: 0, ExecutablePath: "C:\\x.exe", CreationDate: "a" }]), self), /does not contain this process/);
  const one = winproc.parseListing(JSON.stringify({ ProcessId: self, ParentProcessId: 1, ExecutablePath: "C:\\node.exe", CreationDate: "b" }), self);
  assert.deepEqual(one, [{ pid: self, ppid: 1, exe: "C:\\node.exe", created: "b" }]);
  const env = { SystemRoot: "C:\\Windows" };
  await assert.rejects(winproc.listProcesses({ env, exists: () => true, run: () => ({ status: null, error: new Error("spawn EACCES"), stdout: "", stderr: "" }) }), /spawn EACCES/);
  await assert.rejects(winproc.listProcesses({ env, exists: () => true, run: () => ({ status: 0, stdout: "", stderr: "" }) }), /empty/);
});
