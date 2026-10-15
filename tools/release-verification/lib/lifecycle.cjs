/**
 * Wave 0 (#521): isolated install / upgrade / restart / forced kill / rollback /
 * re-upgrade of FailSafe in a disposable VS Code on win32-x64.
 *
 * Pure decisions (validateCodeDir, refuseUnsafe, layout, buildEnv, buildSpawn,
 * selectOwnedProcesses, commitObserved, expectDegraded, assessStep,
 * assessPersistence) are separated from the orchestrator runLifecycle(deps),
 * whose spawner, lister, killer, clock and readers are injected. winproc.cjs is
 * the only module that touches real processes.
 *
 * Safety: only processes whose ExecutablePath is inside the disposable VS Code
 * directory are ever signalled, each one re-checked (same ExecutablePath and
 * CreationDate) immediately before taskkill. Nothing is ever deleted. The
 * spawned VS Code gets USERPROFILE, HOME, APPDATA and LOCALAPPDATA inside ROOT,
 * so FailSafe's home-directory state (server registry, marketplace cache,
 * adapter config) never touches the operator's ~/.failsafe.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { check, makeEvidence, UsageError } = require("./evidence.cjs");
const { inspectVsix } = require("./inventory.cjs");
const { sha256 } = require("./sums.cjs");
const { selectSession, scanSession } = require("./logscan.cjs");

const EXTENSION_KEY = "mythologiq.mythologiq-failsafe";
const HOST_TARGET = "win32-x64";
const STEPS = Object.freeze([
  { id: "S1", install: "from", vsix: "from" },
  { id: "S2", install: "to", vsix: "to" },
  { id: "S3", vsix: "to" },
  { id: "S4", vsix: "to", kill: true },
  { id: "S5", vsix: "to" },
  { id: "S6", install: "from", vsix: "from" },
  { id: "S7", install: "to", vsix: "to" },
]);
const DEFAULT_TIMEOUTS = Object.freeze({ found: 120000, activated: 120000, commit: 120000, quit: 60000, poll: 500, settle: 3000 });
const SEEDED_SETTINGS = Object.freeze({
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
});

// ---- paths -----------------------------------------------------------------

function real(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}
/** Windows comparison form: realpath when it exists, resolved, lowercased. */
function norm(p) {
  return path.win32.resolve(String(real(p)).replace(/\//g, "\\")).toLowerCase();
}
const samePath = (a, b) => norm(a) === norm(b);
const isInside = (child, parent) => norm(child).startsWith(`${norm(parent).replace(/\\+$/, "")}\\`);

function layout(root) {
  const home = path.join(root, "home");
  return {
    root, home, appData: path.join(home, "AppData", "Roaming"), localAppData: path.join(home, "AppData", "Local"),
    userData: path.join(root, "user-data"), extensions: path.join(root, "extensions"), ws: path.join(root, "ws"), out: path.join(root, "out"),
  };
}

/** Creates ROOT's layout and seeds the isolated user settings. ROOT must be absent or empty. */
function prepareRoot(root) {
  const L = layout(root);
  for (const d of [L.home, L.appData, L.localAppData, path.join(L.userData, "User"), L.extensions, L.ws, L.out]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(L.userData, "User", "settings.json"), `${JSON.stringify(SEEDED_SETTINGS, null, 2)}\n`);
  return L;
}

// ---- refusals ----------------------------------------------------------------

function parseVersion(v) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? ""));
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function versionAtLeast(v, floor) {
  for (let i = 0; i < 3; i++) if (v[i] !== floor[i]) return v[i] > floor[i];
  return true;
}

/** A VS Code root: Code.exe, bin\code.cmd and exactly one HEX10\resources\app\product.json. */
function validateCodeDir(dirIn) {
  if (!fs.existsSync(dirIn)) throw new UsageError(`--code ${dirIn} does not exist`);
  const dir = real(dirIn);
  const notRoot = (why) => new UsageError(`--code ${dir} is not a VS Code root: ${why}`);
  if (!fs.existsSync(path.join(dir, "Code.exe"))) throw notRoot("Code.exe missing");
  if (!fs.existsSync(path.join(dir, "bin", "code.cmd"))) throw notRoot("bin\\code.cmd missing");
  const hexDirs = fs.readdirSync(dir).filter((n) => /^[0-9a-f]{10}$/.test(n) && fs.existsSync(path.join(dir, n, "resources", "app", "product.json")));
  if (hexDirs.length === 0) throw notRoot("no HEX10\\resources\\app\\product.json");
  if (hexDirs.length > 1) throw notRoot(`expected exactly one HEX10\\resources\\app\\product.json, found ${hexDirs.join(", ")}`);
  const hex = hexDirs[0];
  const productPath = path.join(dir, hex, "resources", "app", "product.json");
  let product;
  try {
    product = JSON.parse(fs.readFileSync(productPath, "utf8"));
  } catch (err) {
    throw notRoot(`product.json unreadable: ${err.message}`);
  }
  if (!String(product.commit ?? "").startsWith(hex)) throw notRoot(`product.json commit ${product.commit} does not start with ${hex}`);
  const cliJs = path.join(dir, hex, "resources", "app", "out", "cli.js");
  return { dir, hex, codeExe: path.join(dir, "Code.exe"), cliJs, productPath, product };
}

function knownInstallLocations(env) {
  const out = [];
  const add = (base, ...rest) => { if (base) for (const name of ["Microsoft VS Code", "Microsoft VS Code Insiders"]) out.push(path.win32.join(base, ...rest, name)); };
  add(env.LOCALAPPDATA, "Programs");
  add(env.ProgramFiles);
  add(env["ProgramFiles(x86)"]);
  return out;
}

/** Throws UsageError (exit 2) for any unsafe environment; called before any spawn. */
function refuseUnsafe({ code, root, env, engines, ownedRunning }) {
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) throw new UsageError(`--root ${root} exists and is not empty; rv never reuses or deletes a root`);
  const floor = parseVersion(engines);
  const have = parseVersion(code.product.version);
  if (!floor) throw new UsageError(`the --to VSIX declares no usable engines.vscode (${engines})`);
  if (!have || !versionAtLeast(have, floor)) throw new UsageError(`VS Code ${code.product.version} is below the --to VSIX's engines floor ${engines}`);
  if ("win32VersionedUpdate" in code.product) throw new UsageError(`${code.productPath} declares win32VersionedUpdate; remove it (the installed updater's vscode-updating mutex blocks launch)`);
  for (const loc of knownInstallLocations(env)) {
    if (samePath(code.dir, loc) || isInside(code.dir, loc) || isInside(loc, code.dir)) throw new UsageError(`--code ${code.dir} overlaps the install location ${loc}`);
  }
  if (ownedRunning > 0) throw new UsageError(`${ownedRunning} process(es) from ${code.dir} are already running`);
}

// ---- spawning -----------------------------------------------------------------

function buildEnv(parentEnv, root, { install = false, outFile } = {}) {
  const L = layout(root);
  const env = {};
  for (const [k, v] of Object.entries(parentEnv)) {
    if (/^vscode_/i.test(k) || /^electron_run_as_node$/i.test(k)) continue;
    if (/^(userprofile|home|appdata|localappdata|fs_rv_out)$/i.test(k)) continue;
    env[k] = v;
  }
  Object.assign(env, { USERPROFILE: L.home, HOME: L.home, APPDATA: L.appData, LOCALAPPDATA: L.localAppData });
  if (outFile) env.FS_RV_OUT = outFile;
  if (install) env.ELECTRON_RUN_AS_NODE = "1";
  return env;
}

function buildSpawn(kind, { code, root, vsix, trigger }) {
  const L = layout(root);
  const dirs = ["--user-data-dir", L.userData, "--extensions-dir", L.extensions];
  if (kind === "install") return { file: code.codeExe, args: [code.cliJs, ...dirs, "--install-extension", vsix, "--force"] };
  return { file: code.codeExe, args: [...dirs, `--extensionDevelopmentPath=${trigger}`, "--disable-workspace-trust", "--skip-welcome", "--new-window", L.ws] };
}

// ---- processes ----------------------------------------------------------------

/** owned: ExecutablePath inside DIR; residual: their descendants outside DIR. */
function selectOwnedProcesses(procs, dir) {
  const owned = procs.filter((p) => p.exe && isInside(p.exe, dir));
  const ownedPids = new Set(owned.map((p) => p.pid));
  const descendants = new Set(ownedPids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of procs) if (!descendants.has(p.pid) && descendants.has(p.ppid)) { descendants.add(p.pid); grew = true; }
  }
  const residual = procs.filter((p) => descendants.has(p.pid) && !ownedPids.has(p.pid));
  return { owned, residual };
}

// ---- judgements -----------------------------------------------------------------

/**
 * The S4 kill trigger and every healthy step's activation condition. Not the
 * proof of persistence: the post-kill count in assessPersistence is.
 */
function commitObserved({ root, launchTime, events, registryPath, registry, findings }) {
  const L = layout(root);
  const found = events.find((e) => e.event === "found");
  const activated = events.find((e) => e.event === "activated");
  if (!found) return { ok: false, reason: "the trigger reported no found line" };
  if (!activated || activated.isActive !== true) return { ok: false, reason: "the trigger reported no activated line with isActive true" };
  if (findings.some((f) => f.id === "checkpoint-memory")) return { ok: false, reason: "Checkpoint persistence failed (memory fallback) was logged" };
  if (!samePath(registryPath, path.join(L.home, ".failsafe", "servers.json"))) return { ok: false, reason: `registry ${registryPath} is not ROOT\\home\\.failsafe\\servers.json` };
  const servers = Array.isArray(registry?.servers) ? registry.servers : [];
  const entry = servers.find((s) => s.pid === found.pid && typeof s.workspacePath === "string" && samePath(s.workspacePath, L.ws) && Date.parse(s.startedAt) >= launchTime);
  if (!entry) return { ok: false, reason: `no registry entry for pid ${found.pid}, workspace ROOT\\ws, started after launch` };
  return { ok: true, reason: `registry entry pid ${entry.pid} port ${entry.port ?? "?"}` };
}

/** Expected degraded when the installed VSIX fails the native rule for the host target. */
function expectDegraded(inspection, hostTarget) {
  return Boolean(inspection.nativeError) || inspection.target !== hostTarget;
}

function assessStep(s) {
  const fail = (detail) => check(s.step, "lifecycle", HOST_TARGET, "fail", detail);
  if (s.launch === "launch-failure") return check(s.step, "lifecycle", HOST_TARGET, "inconclusive", "launch failure: the trigger never reported (environment, not FailSafe)");
  if (s.launch === "install-failure") return fail(s.detail ?? "install failed");
  if (s.launch === "activation-timeout") return fail("FailSafe never reported activated or error (activation timeout)");
  const err = s.events.find((e) => e.event === "error");
  if (err) return fail(`trigger error: ${err.message}`);
  if (!s.installed || s.installed.version !== s.expected.version || (s.installed.targetPlatform ?? null) !== (s.expected.targetPlatform ?? null)) {
    return fail(`installed ${JSON.stringify(s.installed)} is not the VSIX installed (${s.expected.version} ${s.expected.targetPlatform ?? "universal"})`);
  }
  const activationFailures = s.findings.filter((f) => f.kind === "activation-failure");
  if (activationFailures.length) return fail(`activation failure logged: ${activationFailures.map((f) => f.id).join(", ")} (isActive is not enough)`);
  const degraded = s.findings.filter((f) => f.kind === "degraded");
  if (s.expectDegraded) {
    if (degraded.length === 0) return fail("degraded mode was expected for this VSIX on this host and the detector did not fire");
  } else {
    if (degraded.length) return fail(`degraded mode logged: ${degraded.map((f) => f.id).join(", ")}`);
    const badDbs = Object.entries(s.dbs ?? {}).filter(([, r]) => r.status !== "pass");
    if (!s.dbs || Object.keys(s.dbs).length === 0 || badDbs.length) return fail(`databases: ${badDbs.map(([n, r]) => `${n} ${r.detail}`).join("; ") || "not checked"}`);
    if (!s.commit?.ok) return fail(`commit not observed: ${s.commit?.reason ?? "unknown"}`);
  }
  if (s.launch === "quit-timeout") return fail("graceful quit timed out; the step was force-stopped");
  return check(s.step, "lifecycle", HOST_TARGET, "pass", [s.expectDegraded ? `expected degradation detected (${degraded.map((f) => f.id).join(", ")})` : "healthy", s.note].filter(Boolean).join("; "));
}

/**
 * C(n) = snapshot.created rows in soa_ledger.db after step n. A step that is not
 * expected-degraded must add at least one (so must the killed S4); a degraded
 * step must not lose any; no table in any store may lose rows.
 */
function assessPersistence(rows) {
  const problems = [];
  rows.forEach((cur, i) => {
    const c = cur.counts.snapshotCreated ?? 0;
    if (cur.step === "S2" && c === 0) problems.push("C(S2) is 0");
    if (i === 0) return;
    const prev = rows[i - 1];
    const p = prev.counts.snapshotCreated ?? 0;
    if (!cur.expectDegraded && c < p + 1) problems.push(`C(${cur.step}) = ${c} < C(${prev.step}) + 1 = ${p + 1}`);
    if (cur.expectDegraded && c < p) problems.push(`C(${cur.step}) = ${c} < C(${prev.step}) = ${p}`);
    for (const [db, tables] of Object.entries(prev.counts.tables ?? {})) {
      for (const [t, n] of Object.entries(tables ?? {})) {
        const now = cur.counts.tables?.[db]?.[t] ?? 0;
        if (now < n) problems.push(`${db}.${t} went ${n} -> ${now} at ${cur.step}`);
      }
    }
  });
  const series = rows.map((r) => `${r.step}=${r.counts.snapshotCreated ?? 0}`).join(" ");
  return check("persistence", "lifecycle", HOST_TARGET, problems.length ? "fail" : "pass", problems.length ? `${problems.join("; ")} (${series})` : `snapshot.created ${series}`, { series: rows.map((r) => ({ step: r.step, snapshotCreated: r.counts.snapshotCreated ?? 0 })) });
}

// ---- orchestration --------------------------------------------------------------

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readInstalledExtension(extensionsDir) {
  const list = readJson(path.join(extensionsDir, "extensions.json"));
  const entry = Array.isArray(list) ? list.find((e) => String(e?.identifier?.id).toLowerCase() === EXTENSION_KEY) : null;
  if (!entry) return null;
  const dir = entry.relativeLocation ? path.join(extensionsDir, entry.relativeLocation) : entry.location?.fsPath;
  const manifest = dir && fs.existsSync(path.join(dir, ".vsixmanifest")) ? fs.readFileSync(path.join(dir, ".vsixmanifest"), "utf8") : "";
  const tp = /TargetPlatform="([^"]+)"/.exec(manifest);
  return { version: entry.version, targetPlatform: tp ? tp[1] : null };
}

async function waitFor(deps, timeout, probe) {
  const start = deps.now();
  for (;;) {
    const r = await probe();
    if (r) return r;
    if (deps.now() - start >= timeout) return null;
    await deps.sleep(deps.timeouts.poll);
  }
}

/** taskkill one process only if it is still the same process (ExecutablePath and CreationDate). */
async function safeKill(deps, expected) {
  const now = await deps.listProcesses();
  const p = now.find((x) => x.pid === expected.pid);
  if (!p) return { killed: false, why: `${expected.pid} already exited` };
  if (!p.exe || !samePath(p.exe, expected.exe) || p.created !== expected.created) return { killed: false, why: `${expected.pid} not signalled (ExecutablePath or CreationDate changed)` };
  if (!isInside(p.exe, deps.code.dir)) return { killed: false, why: `${expected.pid} not signalled (outside the disposable VS Code)` };
  await deps.kill(expected.pid);
  return { killed: true, why: "" };
}

async function stopOwned(deps, owned, firstPid) {
  const notes = [];
  const ordered = [...owned].sort((a, b) => (a.pid === firstPid ? -1 : b.pid === firstPid ? 1 : 0));
  for (const p of ordered) {
    const r = await safeKill(deps, p);
    if (!r.killed && !/already exited/.test(r.why)) notes.push(r.why);
  }
  return notes;
}

/**
 * Runs S1-S7. deps: root, code (validateCodeDir result), from, to ({ path,
 * sha256, version, inspection }), trigger, env, host, spawn, listProcesses, kill,
 * now, sleep, readInstalled, scanLogs, checkDbs, operatorRegistryPath, timeouts.
 * @returns {{ checks: object[], processes: { owned: object[], residual: object[] } }}
 */
async function runLifecycle(depsIn) {
  const deps = { readInstalled: readInstalledExtension, readJson, ...depsIn, timeouts: { ...DEFAULT_TIMEOUTS, ...depsIn.timeouts } };
  const L = layout(deps.root);
  const registryPath = path.join(L.home, ".failsafe", "servers.json");
  const operatorBefore = deps.readJson(deps.operatorRegistryPath);
  const checks = [];
  const persistenceRows = [];
  const ownedSeen = new Map();
  const residualSeen = new Map();
  const healthyCommits = [];
  let aborted = null;

  for (const step of STEPS) {
    if (aborted) {
      checks.push(check(step.id, "lifecycle", HOST_TARGET, "not-run", `not run: ${aborted}`));
      continue;
    }
    const vsix = deps[step.vsix];
    const degraded = expectDegraded(vsix.inspection, deps.host);
    const expected = { version: vsix.version, targetPlatform: vsix.inspection.target ?? null };
    if (step.install) {
      const s = buildSpawn("install", { code: deps.code, root: deps.root, vsix: deps[step.install].path });
      const code = await deps.spawn(s.file, s.args, { env: buildEnv(deps.env, deps.root, { install: true }) }).exited;
      if (code !== 0) {
        checks.push(assessStep({ step: step.id, launch: "install-failure", detail: `install of ${path.basename(deps[step.install].path)} exited ${code}`, events: [], findings: [] }));
        aborted = `${step.id} install failed`;
        continue;
      }
    }
    const outFile = path.join(L.out, `${step.id}.jsonl`);
    const launchTime = deps.now();
    const s = buildSpawn("launch", { code: deps.code, root: deps.root, trigger: deps.trigger });
    deps.spawn(s.file, s.args, { env: buildEnv(deps.env, deps.root, { outFile }) });

    let launch = "ok";
    const found = await waitFor(deps, deps.timeouts.found, async () => readEvents(outFile).find((e) => e.event === "found"));
    if (!found) launch = "launch-failure";
    else if (!(await waitFor(deps, deps.timeouts.activated, async () => readEvents(outFile).find((e) => e.event === "activated" || e.event === "error")))) launch = "activation-timeout";

    let commit = { ok: false, reason: "not evaluated" };
    if (launch === "ok") {
      if (degraded) {
        await waitFor(deps, deps.timeouts.commit, async () => deps.scanLogs(L.userData, launchTime).some((f) => f.kind === "degraded"));
      } else {
        await waitFor(deps, deps.timeouts.commit, async () => {
          commit = commitObserved({ root: deps.root, launchTime, events: readEvents(outFile), registryPath, registry: deps.readJson(registryPath), findings: deps.scanLogs(L.userData, launchTime) });
          return commit.ok;
        });
      }
      if (deps.timeouts.settle) await deps.sleep(deps.timeouts.settle);
    }

    const snapshot = selectOwnedProcesses(await deps.listProcesses(), deps.code.dir);
    for (const p of snapshot.owned) ownedSeen.set(`${p.pid}:${p.created}`, { pid: p.pid, exe: p.exe });
    const notes = [];
    if (step.kill && launch === "ok" && commit.ok) {
      notes.push(...(await stopOwned(deps, snapshot.owned, found.pid)));
      notes.unshift("force-killed after commit-observed");
    } else if (launch === "launch-failure") {
      notes.push(...(await stopOwned(deps, snapshot.owned, null)));
    } else {
      fs.writeFileSync(`${outFile}.quit`, "");
      const gone = await waitFor(deps, deps.timeouts.quit, async () => selectOwnedProcesses(await deps.listProcesses(), deps.code.dir).owned.length === 0);
      if (!gone) {
        if (launch === "ok") launch = "quit-timeout";
        notes.push(...(await stopOwned(deps, selectOwnedProcesses(await deps.listProcesses(), deps.code.dir).owned, null)));
      }
    }
    const after = await deps.listProcesses();
    for (const r of snapshot.residual) {
      if (after.some((p) => p.pid === r.pid && p.created === r.created)) residualSeen.set(`${r.pid}:${r.created}`, { pid: r.pid, exe: r.exe });
    }

    if (launch === "launch-failure") {
      checks.push(assessStep({ step: step.id, launch, events: [], findings: [] }));
      aborted = `${step.id} launch failure`;
      continue;
    }
    const findings = deps.scanLogs(L.userData, launchTime);
    const dbs = deps.checkDbs(L.ws, path.join(L.out, "db-copies", step.id));
    const events = readEvents(outFile);
    if (!degraded) healthyCommits.push({ step: step.id, ok: commit.ok });
    checks.push(assessStep({
      step: step.id, launch, expectDegraded: degraded, expected, installed: deps.readInstalled(L.extensions),
      events, findings, dbs, commit: degraded ? { ok: true, reason: "degraded step" } : commit, note: notes.join("; "),
    }));
    persistenceRows.push({
      step: step.id, expectDegraded: degraded,
      counts: { snapshotCreated: dbs.soa_ledger?.snapshotCreated ?? 0, tables: Object.fromEntries(Object.entries(dbs).map(([n, r]) => [n, r.tables ?? {}])) },
    });
  }

  if (aborted) {
    checks.push(check("persistence", "lifecycle", HOST_TARGET, "not-run", `not run: ${aborted}`));
    checks.push(check("home-registry", "isolation", null, "not-run", `not run: ${aborted}`));
  } else {
    checks.push(assessPersistence(persistenceRows));
    const missing = healthyCommits.filter((h) => !h.ok).map((h) => h.step);
    checks.push(check("home-registry", "isolation", null, missing.length ? "fail" : "pass",
      missing.length ? `no ROOT\\home registry entry observed at ${missing.join(", ")}` : `every healthy step registered in ${registryPath} (FailSafe's home resolved inside ROOT)`));
  }
  const operatorAfter = deps.readJson(deps.operatorRegistryPath);
  const leaked = (operatorAfter?.servers ?? []).filter((s) => typeof s.workspacePath === "string" && (samePath(s.workspacePath, deps.root) || isInside(s.workspacePath, deps.root)));
  checks.push(check("operator-registry", "isolation", null, leaked.length ? "fail" : "pass",
    leaked.length ? `the operator's ${deps.operatorRegistryPath} gained ${leaked.length} entr(ies) inside ROOT` : "informational: no ROOT entry in the operator's registry (a live FailSafe prunes and rewrites it, so absence proves little)",
    { before: Array.isArray(operatorBefore?.servers) ? operatorBefore.servers.length : null, after: Array.isArray(operatorAfter?.servers) ? operatorAfter.servers.length : null }));
  const residual = [...residualSeen.values()];
  checks.push(check("residual-processes", "isolation", null, "pass",
    residual.length ? `left running (reported, never signalled): ${residual.map((r) => `${r.pid} ${r.exe}`).join("; ")}` : "none", { residual }));
  return { checks, processes: { owned: [...ownedSeen.values()], residual } };
}

// ---- CLI ----------------------------------------------------------------------

function readVsixArg(file, flag) {
  try {
    return fs.readFileSync(file);
  } catch (err) {
    throw new UsageError(`cannot read ${flag} ${file}: ${err.message}`);
  }
}

function inspectByManifest(bytes, flag) {
  const first = inspectVsix(bytes, "0.0.0");
  const v = first.identity?.version;
  if (!first.identity || !/^\d+\.\d+\.\d+$/.test(String(v))) throw new UsageError(`${flag} is not a readable FailSafe VSIX (no x.y.z Identity Version)`);
  return { version: v, inspection: inspectVsix(bytes, v) };
}

function defaultDeps() {
  const winproc = require("./winproc.cjs");
  const { checkWorkspace } = require("./dbcheck.cjs");
  return {
    spawn: winproc.spawnProcess, listProcesses: winproc.listProcesses, kill: winproc.kill,
    now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    readInstalled: readInstalledExtension,
    scanLogs: (userData, launchTime) => { const s = selectSession(path.join(userData, "logs"), launchTime); return s ? scanSession(s) : []; },
    checkDbs: checkWorkspace,
    env: process.env, host: HOST_TARGET,
    trigger: path.resolve(__dirname, "..", "trigger"),
    operatorRegistryPath: path.join(process.env.USERPROFILE || os.homedir(), ".failsafe", "servers.json"),
  };
}

/** Preflight (all refusals before any spawn), then runLifecycle; returns v1 evidence. */
async function runLifecycleCli(args, io) {
  const deps = { ...defaultDeps(), ...(io.lifecycleDeps ?? {}) };
  const code = validateCodeDir(args.code);
  const fromBytes = readVsixArg(args.from, "--from");
  const toBytes = readVsixArg(args.to, "--to");
  const toSha = sha256(toBytes);
  if (args["to-sha256"] !== undefined && String(args["to-sha256"]).toLowerCase() !== toSha) {
    throw new UsageError(`--to sha256 ${toSha} differs from --to-sha256 ${args["to-sha256"]}`);
  }
  const to = { path: path.resolve(args.to), sha256: toSha, ...inspectByManifest(toBytes, "--to") };
  const from = { path: path.resolve(args.from), sha256: sha256(fromBytes), ...inspectByManifest(fromBytes, "--from") };
  const fromBad = from.inspection.checks.filter((c) => ["archive", "manifest", "version"].includes(c.id) && c.status !== "pass");
  if (fromBad.length) throw new UsageError(`--from fails identity or version checks: ${fromBad.map((c) => c.detail).join("; ")}`);
  const ownedRunning = selectOwnedProcesses(await deps.listProcesses(), code.dir).owned.length;
  refuseUnsafe({ code, root: args.root, env: deps.env, engines: to.inspection.engines, ownedRunning });
  const info = (x) => ({ path: x.path, sha256: x.sha256, version: x.version, targetPlatform: x.inspection.target ?? null });
  const evidence = (checks, processes = null) => makeEvidence({
    kind: "lifecycle", version: to.version, artifactSource: { kind: "local-dir", ref: path.dirname(to.path) },
    vsix: { from: info(from), to: info(to) }, checks, processes,
  });
  const toProblems = to.inspection.checks.filter((c) => c.status !== "pass");
  if (toProblems.length) {
    return evidence([check("to-inventory", "artifact", to.inspection.target ?? "universal", "fail", `--to fails inventory; nothing installed: ${toProblems.map((c) => `${c.id}: ${c.detail}`).join("; ")}`)]);
  }
  prepareRoot(args.root);
  const result = await runLifecycle({ ...deps, root: path.resolve(args.root), code, from, to });
  return evidence([check("to-inventory", "artifact", to.inspection.target, "pass", "inventory passed before install"), ...result.checks], result.processes);
}

module.exports = {
  STEPS, DEFAULT_TIMEOUTS, SEEDED_SETTINGS, HOST_TARGET,
  layout, prepareRoot, validateCodeDir, knownInstallLocations, refuseUnsafe, buildEnv, buildSpawn,
  selectOwnedProcesses, commitObserved, expectDegraded, assessStep, assessPersistence,
  readInstalledExtension, runLifecycle, runLifecycleCli, norm, samePath, isInside,
};
