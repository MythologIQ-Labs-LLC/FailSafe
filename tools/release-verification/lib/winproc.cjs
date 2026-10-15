/**
 * Wave 0 (#521): the only module that lists, spawns or signals Windows
 * processes. Never a shell, never a .cmd; powershell.exe and taskkill.exe are
 * run from %SystemRoot%\System32 by absolute path, never resolved through PATH,
 * and SystemRoot itself must be absolute with both tools present (a trusted
 * workspace's terminal.integrated.env.windows can set it). The CIM listing
 * command is a fixed string that never contains a caller-supplied path, and
 * selection happens in JS (lifecycle.selectOwnedProcesses). A listing that is
 * empty or does not contain this process is refused, never read as "nothing is
 * running". taskkill is used without /T so a child outside the disposable VS
 * Code is never signalled, and its result is reported, not assumed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const LIST_COMMAND = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{n='CreationDate';e={if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { '' }}} | ConvertTo-Json -Compress";

/** Absolute paths of powershell.exe and taskkill.exe under an absolute SystemRoot; throws otherwise. */
function systemTools(env = process.env, { exists = fs.existsSync } = {}) {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  if (!path.win32.isAbsolute(root) || !/^[a-z]:\\/i.test(root)) throw new Error(`SystemRoot ${root} is not an absolute drive path`);
  const sys = path.win32.join(root, "System32");
  const tools = { powershell: path.win32.join(sys, "WindowsPowerShell", "v1.0", "powershell.exe"), taskkill: path.win32.join(sys, "taskkill.exe") };
  for (const [name, p] of Object.entries(tools)) if (!exists(p)) throw new Error(`${name}.exe not found at ${p}`);
  return tools;
}

/** Parses the CIM JSON; refuses an empty listing or one that does not contain selfPid. */
function parseListing(stdout, selfPid) {
  if (!String(stdout ?? "").trim()) throw new Error("process listing is empty; refusing to read it as nothing running");
  const parsed = JSON.parse(stdout);
  const list = (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, exe: p.ExecutablePath || "", created: p.CreationDate || "" }));
  if (!list.some((p) => p.pid === selfPid)) throw new Error(`process listing does not contain this process (pid ${selfPid}); it is incomplete`);
  return list;
}

/** @returns {Promise<{ pid: number, ppid: number, exe: string, created: string }[]>} */
async function listProcesses({ env = process.env, exists = fs.existsSync, run = spawnSync, selfPid = process.pid } = {}) {
  const { powershell } = systemTools(env, { exists });
  const r = run(powershell, ["-NoProfile", "-NonInteractive", "-Command", LIST_COMMAND], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.error) throw new Error(`process listing failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`process listing failed: ${(r.stderr || "").trim() || `exit ${r.status}`}`);
  return parseListing(r.stdout, selfPid);
}

function killResult(r) {
  if (r.status === 0) return { ok: true, detail: "" };
  return { ok: false, detail: (r.error ? r.error.message : String(r.stderr || "").trim()) || `exit ${r.status}` };
}

/** @returns {Promise<{ ok: boolean, detail: string }>} */
async function kill(pid) {
  let taskkill;
  try {
    ({ taskkill } = systemTools());
  } catch (err) {
    return { ok: false, detail: err.message };
  }
  return killResult(spawnSync(taskkill, ["/F", "/PID", String(pid)], { windowsHide: true, encoding: "utf8" }));
}

/** @returns {{ pid: number, exited: Promise<number> }} */
function spawnProcess(file, args, { env }) {
  const child = spawn(file, args, { env, stdio: "ignore", windowsHide: true, shell: false });
  const exited = new Promise((resolve) => {
    child.once("exit", (code) => resolve(code ?? -1));
    child.once("error", () => resolve(-1));
  });
  return { pid: child.pid, exited };
}

module.exports = { LIST_COMMAND, systemTools, parseListing, listProcesses, killResult, kill, spawnProcess };
