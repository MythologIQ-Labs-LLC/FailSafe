/**
 * process-tree — find and kill everything an agent run started (#475, LD4).
 *
 * win32: one long-lived PowerShell sampler takes line commands on stdin.
 * `SAMPLE <rootPid> <sinceFileTime>` returns the Win32_Process ParentProcessId
 * closure of the root among processes created after the run started (Windows
 * keeps a dead parent's id on its children, so orphans stay reachable).
 * `KILL <pid> <creationFileTime>` stops a process only if that PID still has
 * the recorded creation time, so a reused PID is never killed.
 * POSIX: the agent runs as its own process-group leader and the group is killed.
 *
 * Not covered (disclosed): a process that leaves the tree through a short-lived
 * intermediate between samples, or starts outside it (setsid, service, scheduler).
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

export interface TreeTracker {
  /** Record the agent's root process. */
  attach(pid: number): void;
  /** Take a sample of the descendant set (win32) — no-op on POSIX. */
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
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, shell: false });
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

function startPosix(): TreeTracker {
  let root = 0;
  const groupAlive = (): boolean => {
    try { process.kill(-root, 0); return true; } catch { return false; }
  };
  return {
    attach(pid) { root = pid; },
    async sample() { /* the process group is the tree */ },
    async killAll() {
      if (!root) return [];
      try { process.kill(-root, 'SIGKILL'); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 100));
      return groupAlive() ? [root] : [];
    },
    dispose() { /* nothing held */ },
  };
}

/** Start tracking before the agent is spawned. Rejects when tracking is unavailable. */
export async function startTreeTracker(sinceMs: number, platform: NodeJS.Platform = process.platform): Promise<TreeTracker> {
  return platform === 'win32' ? startWin(sinceMs) : startPosix();
}
