/**
 * Wave 0 (#521): the only module that lists, spawns or signals Windows
 * processes. Never a shell, never a .cmd; the CIM listing command is a fixed
 * string that never contains a caller-supplied path, and selection happens in
 * JS (lifecycle.selectOwnedProcesses). taskkill is used without /T so a child
 * outside the disposable VS Code is never signalled.
 */
"use strict";

const { spawn, spawnSync } = require("child_process");

const LIST_COMMAND = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{n='CreationDate';e={if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { '' }}} | ConvertTo-Json -Compress";

/** @returns {Promise<{ pid: number, ppid: number, exe: string, created: string }[]>} */
async function listProcesses() {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", LIST_COMMAND], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`process listing failed: ${(r.stderr || "").trim() || `exit ${r.status}`}`);
  const parsed = JSON.parse(r.stdout || "[]");
  return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, exe: p.ExecutablePath || "", created: p.CreationDate || "" }));
}

async function kill(pid) {
  spawnSync("taskkill", ["/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
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

module.exports = { LIST_COMMAND, listProcesses, kill, spawnProcess };
