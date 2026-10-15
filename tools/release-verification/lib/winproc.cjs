/**
 * Wave 0 (#521): the only module that lists, spawns or signals Windows
 * processes. Never a shell, never a .cmd; powershell.exe and taskkill.exe are
 * run from %SystemRoot%\System32 by absolute path, never resolved through PATH.
 * The CIM listing command is a fixed string that never contains a
 * caller-supplied path, and selection happens in JS
 * (lifecycle.selectOwnedProcesses). taskkill is used without /T so a child
 * outside the disposable VS Code is never signalled, and its result is
 * reported, not assumed.
 */
"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const LIST_COMMAND = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{n='CreationDate';e={if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { '' }}} | ConvertTo-Json -Compress";

function systemTools(env = process.env) {
  const sys = path.win32.join(env.SystemRoot || env.SYSTEMROOT || "C:\\Windows", "System32");
  return { powershell: path.win32.join(sys, "WindowsPowerShell", "v1.0", "powershell.exe"), taskkill: path.win32.join(sys, "taskkill.exe") };
}

/** @returns {Promise<{ pid: number, ppid: number, exe: string, created: string }[]>} */
async function listProcesses() {
  const r = spawnSync(systemTools().powershell, ["-NoProfile", "-NonInteractive", "-Command", LIST_COMMAND], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`process listing failed: ${(r.stderr || "").trim() || `exit ${r.status}`}`);
  const parsed = JSON.parse(r.stdout || "[]");
  return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, exe: p.ExecutablePath || "", created: p.CreationDate || "" }));
}

function killResult(r) {
  if (r.status === 0) return { ok: true, detail: "" };
  return { ok: false, detail: (r.error ? r.error.message : String(r.stderr || "").trim()) || `exit ${r.status}` };
}

/** @returns {Promise<{ ok: boolean, detail: string }>} */
async function kill(pid) {
  return killResult(spawnSync(systemTools().taskkill, ["/F", "/PID", String(pid)], { windowsHide: true, encoding: "utf8" }));
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

module.exports = { LIST_COMMAND, systemTools, listProcesses, killResult, kill, spawnProcess };
