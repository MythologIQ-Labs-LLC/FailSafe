/**
 * process-tree — find and kill everything an agent run started (#475, LD4/LD5).
 *
 * win32: one long-lived PowerShell sampler takes line commands on stdin.
 * `SAMPLE <rootPid> <sinceFileTime>` returns the Win32_Process ParentProcessId
 * closure of the root among processes created after the run started (Windows
 * keeps a dead parent's id on its children, so orphans stay reachable).
 * `KILL <pid> <creationFileTime>` stops a process only if that PID still has
 * the recorded creation time, so a reused PID is never killed.
 *
 * POSIX: each sample lists the user's processes and tracks one when it carries
 * the run marker in its environment (linux only, /proc/<pid>/environ), when its
 * parent in the same sample is tracked, or when its process group is the
 * agent's (the agent is started as a group leader). Identity = pid + start
 * time (linux stat field 22, darwin lstart). killAll signals the agent's group
 * while any sampled process is still in it, then every tracked process whose
 * identity still matches, and re-samples until none is alive (bounded).
 * Zombies are dead and are left out of every sample.
 *
 * Not covered (disclosed): win32 — a process that leaves the tree through a
 * short-lived intermediate between samples; linux — a descendant that clears
 * its environment, leaves the agent's process group (setsid or setpgid) and
 * whose parent exits between samples; darwin (no marker) — a descendant that
 * leaves the process group and whose parent exits between samples; any
 * platform — a process started outside the tree (service, scheduler, WMI).
 */

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import { trustedExecutablePath, WINDOWS_POWERSHELL } from '../../shared/exec/trustedExecutable';

export interface TreeTracker {
  /** Record the agent's root process. */
  attach(pid: number): void;
  /** Take a sample of the descendant set. */
  sample(): Promise<void>;
  /** Kill every recorded process; returns PIDs that are still alive afterwards. */
  killAll(): Promise<number[]>;
  dispose(): void;
}

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::Out.WriteLine('READY')
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $p = $line.Split(' ')
  try {
    if ($p[0] -eq 'SAMPLE') {
      $root = [int]$p[1]; $since = [long]$p[2]
      $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)
      $set = @{ $root = $true }
      do { $added = $false
        foreach ($x in $all) {
          $id = [int]$x.ProcessId
          if (-not $set.ContainsKey($id) -and $set.ContainsKey([int]$x.ParentProcessId) -and $x.CreationDate.ToFileTimeUtc() -ge $since) { $set[$id] = $true; $added = $true }
        }
      } while ($added)
      $out = foreach ($x in $all) { if ($set.ContainsKey([int]$x.ProcessId)) { '' + $x.ProcessId + ':' + $x.CreationDate.ToFileTimeUtc() } }
      [Console]::Out.WriteLine('PIDS ' + ($out -join ','))
    } elseif ($p[0] -eq 'KILL') {
      $x = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$p[1])
      if ($x -and $x.CreationDate.ToFileTimeUtc() -eq [long]$p[2]) { Stop-Process -Id ([int]$p[1]) -Force -ErrorAction SilentlyContinue; [Console]::Out.WriteLine('KILLED') } else { [Console]::Out.WriteLine('GONE') }
    } elseif ($p[0] -eq 'ALIVE') {
      $x = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$p[1])
      [Console]::Out.WriteLine($(if ($x -and $x.CreationDate.ToFileTimeUtc() -eq [long]$p[2]) { 'YES' } else { 'NO' }))
    }
  } catch { [Console]::Out.WriteLine('ERR ' + $_.Exception.Message) }
}`;

/** Windows FILETIME (100 ns since 1601) for a JS epoch-ms timestamp. */
export const toFileTime = (ms: number): bigint => BigInt(ms) * 10000n + 116444736000000000n;

class WinSampler {
  private buf = '';
  private waiters: Array<(line: string) => void> = [];
  constructor(private readonly ps: ChildProcessWithoutNullStreams) {
    ps.stdout.on('data', (c: Buffer) => {
      this.buf += c.toString();
      let i: number;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.waiters.shift()?.(line);
      }
    });
  }
  next(timeoutMs = 15000): Promise<string> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('process sampler did not respond')), timeoutMs);
      this.waiters.push((line) => { clearTimeout(t); resolve(line); });
    });
  }
  async send(cmd: string): Promise<string> {
    const reply = this.next();
    this.ps.stdin.write(`${cmd}\n`);
    return reply;
  }
  close(): void { this.ps.stdin.end(); this.ps.kill(); }
}

async function startWin(sinceMs: number): Promise<TreeTracker> {
  // The script goes in -EncodedCommand so stdin stays free for the line protocol.
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
  // B211: the trusted Windows PowerShell, never one found in the process cwd.
  const ps = spawn(trustedExecutablePath(WINDOWS_POWERSHELL), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, shell: false }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute PowerShell path, argv array, no shell
  const sampler = new WinSampler(ps);
  const ready = sampler.next(20000);
  ps.on('error', () => { /* surfaced as a startup timeout */ });
  if ((await ready) !== 'READY') throw new Error('process sampler failed to start');
  const since = toFileTime(sinceMs).toString();
  let root = 0;
  const known = new Map<number, string>();
  const sample = async (): Promise<void> => {
    if (!root) return;
    const reply = await sampler.send(`SAMPLE ${root} ${since}`);
    if (!reply.startsWith('PIDS')) throw new Error(`process sampler: ${reply}`);
    for (const item of reply.slice(5).split(',').filter(Boolean)) {
      const [pid, ft] = item.split(':');
      known.set(Number(pid), ft);
    }
  };
  return {
    attach(pid) { root = pid; },
    sample,
    async killAll() {
      await sample();
      for (const [pid, ft] of known) await sampler.send(`KILL ${pid} ${ft}`);
      const survivors: number[] = [];
      for (const [pid, ft] of known) if ((await sampler.send(`ALIVE ${pid} ${ft}`)) === 'YES') survivors.push(pid);
      return survivors;
    },
    dispose() { sampler.close(); },
  };
}

/** One process as a POSIX sample sees it; `start` is the identity token. */
interface PosixProc { pid: number; ppid: number; pgid: number; start: string; marked: boolean }

/** /proc access (injectable for tests). Each call throws when the process is gone or unreadable. */
export interface ProcReader {
  /** Process ids under /proc owned by this user. */
  pids(): number[];
  /** Contents of /proc/<pid>/stat. */
  stat(pid: number): string;
  /** Contents of /proc/<pid>/environ (NUL-separated). */
  environ(pid: number): Buffer;
}

export interface TrackerOptions {
  /** Value of FAILSAFE_ISOLATED_RUN in the agent's environment (linux tracking). */
  marker: string;
  readProc?: ProcReader;
  /** Runs `ps -A -o pid=,ppid=,pgid=,stat=,lstart=` and returns its stdout (darwin and other POSIX). */
  runPs?: () => Promise<string>;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
}

const KILL_ROUNDS = 5;
const SETTLE_MS = 100;

const defaultProcReader: ProcReader = {
  pids: () => {
    const uid = process.getuid?.();
    return fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number).filter((pid) => {
      try { return fs.statSync(`/proc/${pid}`).uid === uid; } catch { return false; }
    });
  },
  stat: (pid) => fs.readFileSync(`/proc/${pid}/stat`, 'utf8'),
  environ: (pid) => fs.readFileSync(`/proc/${pid}/environ`),
};

function defaultRunPs(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,lstart='], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

/** linux: ppid (field 4), pgrp (5), starttime (22) from stat; the marker from environ. */
function listLinux(read: ProcReader, marker: string): PosixProc[] {
  const needle = Buffer.from(`\0FAILSAFE_ISOLATED_RUN=${marker}\0`);
  const nul = Buffer.from('\0');
  const out: PosixProc[] = [];
  for (const pid of read.pids()) {
    let stat: string;
    try { stat = read.stat(pid); } catch { continue; /* exited during the scan */ }
    // comm (field 2) may contain spaces and ')': fields 3.. follow the LAST ')'.
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (f[0] === 'Z') continue;
    let marked = false;
    try { marked = Buffer.concat([nul, read.environ(pid), nul]).includes(needle); } catch { /* unreadable */ }
    out.push({ pid, ppid: Number(f[1]), pgid: Number(f[2]), start: f[19], marked });
  }
  return out;
}

/** darwin: parent closure and process group only (another process's environment is not readable). */
function listPs(stdout: string): PosixProc[] {
  const out: PosixProc[] = [];
  for (const line of stdout.split('\n')) {
    const [pid, ppid, pgid, stat, ...start] = line.trim().split(/\s+/);
    if (!stat || stat.startsWith('Z')) continue;
    out.push({ pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), start: start.join(' '), marked: false });
  }
  return out;
}

async function startPosix(list: () => Promise<PosixProc[]>, kill: (pid: number, signal: NodeJS.Signals) => void): Promise<TreeTracker> {
  await list(); // fail closed here, before the agent starts, when processes cannot be listed
  let root = 0;
  const tracked = new Map<number, string>();
  let latest: PosixProc[] = [];
  const isTracked = (p: PosixProc): boolean => tracked.get(p.pid) === p.start;
  const alive = (): number[] => latest.filter(isTracked).map((p) => p.pid);
  const signal = (pid: number): void => { try { kill(pid, 'SIGKILL'); } catch { /* already gone */ } };
  const sample = async (): Promise<void> => {
    if (!root) return;
    latest = await list();
    const byPid = new Map(latest.map((p) => [p.pid, p]));
    let added = true;
    while (added) {
      added = false;
      for (const p of latest) {
        if (isTracked(p)) continue;
        const parent = byPid.get(p.ppid);
        if (p.marked || p.pgid === root || (parent !== undefined && isTracked(parent))) { tracked.set(p.pid, p.start); added = true; }
      }
    }
  };
  return {
    attach(pid) { root = pid; },
    sample,
    async killAll() {
      if (!root) return [];
      await sample();
      for (let round = 0; round < KILL_ROUNDS; round++) {
        // No pid is reused while a process group with that id has members, so
        // -root is still the agent's group even after the agent was reaped.
        if (latest.some((p) => p.pgid === root)) signal(-root);
        for (const pid of alive()) signal(pid);
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        await sample();
        if (!alive().length) return [];
      }
      return alive();
    },
    dispose() { /* nothing held */ },
  };
}

/** Start tracking before the agent is spawned. Rejects when tracking is unavailable. */
export async function startTreeTracker(sinceMs: number, platform: NodeJS.Platform, opts: TrackerOptions): Promise<TreeTracker> {
  if (platform === 'win32') return startWin(sinceMs);
  const kill = opts.kill ?? ((pid: number, sig: NodeJS.Signals) => { process.kill(pid, sig); });
  if (platform === 'linux') {
    const read = opts.readProc ?? defaultProcReader;
    return startPosix(async () => listLinux(read, opts.marker), kill);
  }
  const runPs = opts.runPs ?? defaultRunPs;
  return startPosix(async () => listPs(await runPs()), kill);
}
