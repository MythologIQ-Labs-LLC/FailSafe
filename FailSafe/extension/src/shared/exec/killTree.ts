/**
 * killTree — end a child process and everything it started (v6.0.8 lane A,
 * B213).
 *
 * A plain `child.kill()` is not enough on Windows: killing a process leaves
 * its children running (Git for Windows' cmd\git.exe launcher starts
 * mingw64\bin\git.exe, and a shell alias starts sh and its command). Windows
 * gets `taskkill /PID <pid> /T /F` by absolute path, built from SystemRoot,
 * then `child.kill()` once taskkill is done. POSIX callers spawn the child
 * `detached` (its own process group), and the group is sent SIGKILL.
 *
 * Disclosed: taskkill /T walks descendants by parent PID, so a PID reused
 * between the caller's live check and taskkill, or orphans of an earlier dead
 * process with the same PID, can be reached too.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

function fallback(child: ChildProcess, signal?: NodeJS.Signals): void {
  try { child.kill(signal); } catch { /* already gone */ }
}

/**
 * Kill `child` and its descendants if it is still running. Returns true only
 * when a kill was attempted: a child that has already exited (its descendants
 * may still hold its pipes) is not killed again. Never throws.
 */
export function killProcessTree(child: ChildProcess): boolean {
  if (child.exitCode !== null || child.signalCode !== null) return false;
  const pid = child.pid;
  if (pid === undefined) return false;
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    const taskkill = path.win32.join(root, 'System32', 'taskkill.exe');
    try {
      const k = spawn(taskkill, ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- absolute System32 taskkill path, numeric pid argument, no shell
      k.on('error', () => fallback(child));
      k.on('exit', () => fallback(child));
    } catch {
      fallback(child);
    }
    return true;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { fallback(child, 'SIGKILL'); }
  return true;
}
