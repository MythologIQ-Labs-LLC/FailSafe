import { strict as assert } from 'assert';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startTreeTracker, type ProcReader } from '../../../integrations/agent-cli/process-tree';

// FX951 (#475 LD5): POSIX tracking follows the run marker (linux), the parent
// closure and the agent's process group; unrelated or identity-changed
// processes are never signalled. The injected-reader cases run on every host;
// the live cases need /proc and run on Linux CI only.

const MARKER = 'm-0123456789abcdef';
const ROOT = 500;

interface FakeProc { ppid: number; pgid: number; start: string; state?: string; marked?: boolean }
type Signal = [number, NodeJS.Signals];

/** A process table behind an injected /proc reader and kill. A signalled
 *  process dies (or turns zombie with `zombie`); `immortal` ignores signals. */
function fakeHost(procs: Record<number, FakeProc>, o: { zombie?: boolean; immortal?: boolean } = {}) {
  const table = new Map<number, FakeProc>(Object.entries(procs).map(([pid, p]) => [Number(pid), p]));
  const signals: Signal[] = [];
  const die = (pid: number): void => {
    if (o.immortal) return;
    if (o.zombie) { const p = table.get(pid); if (p) p.state = 'Z'; } else table.delete(pid);
  };
  const readProc: ProcReader = {
    pids: () => [...table.keys()],
    stat: (pid) => {
      const p = table.get(pid);
      if (!p) throw new Error('ENOENT');
      // comm with a space and ')' exercises the parse after the LAST ')'.
      return [`${pid} (node x) y)`, p.state ?? 'S', p.ppid, p.pgid, ...Array(16).fill('0'), p.start, '0', '0'].join(' ');
    },
    environ: (pid) => Buffer.from(`HOME=/h\0${table.get(pid)?.marked ? `FAILSAFE_ISOLATED_RUN=${MARKER}\0` : 'PATH=/bin\0'}`),
  };
  const kill = (pid: number, sig: NodeJS.Signals): void => {
    signals.push([pid, sig]);
    if (pid < 0) { for (const [id, p] of table) if (p.pgid === -pid && p.state !== 'Z') die(id); } else if (table.has(pid)) die(pid);
    else throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
  };
  return { table, signals, readProc, kill, signalled: (pid: number) => signals.some(([p]) => p === pid) };
}

suite('process-tree POSIX tracking, injected readers (#475 LD5 FX951)', () => {
  test('a marker-carrying process whose parent is gone (ppid 1) is tracked and killed', async () => {
    const h = fakeHost({ [ROOT]: { ppid: 1, pgid: ROOT, start: '100', marked: true } });
    const t = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: h.readProc, kill: h.kill });
    t.attach(ROOT);
    await t.sample();
    h.table.delete(ROOT); // the agent exited and was reaped
    h.table.set(700, { ppid: 1, pgid: 700, start: '300', marked: true }); // setsid orphan, never seen with its parent
    assert.deepEqual(await t.killAll(), []);
    assert.ok(h.signalled(700), JSON.stringify(h.signals));
    assert.equal(h.table.has(700), false);
  });

  test('a process with neither the marker, the group nor a tracked parent is never signalled', async () => {
    const h = fakeHost({
      [ROOT]: { ppid: 1, pgid: ROOT, start: '100', marked: true },
      900: { ppid: 1, pgid: 900, start: '50' },
      901: { ppid: 900, pgid: 900, start: '60' },
    });
    const t = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: h.readProc, kill: h.kill });
    t.attach(ROOT);
    await t.sample();
    assert.deepEqual(await t.killAll(), []);
    assert.ok(h.signalled(ROOT));
    assert.equal(h.signalled(900) || h.signalled(901) || h.signalled(-900), false, JSON.stringify(h.signals));
  });

  test('a tracked pid whose start time changed between sample and kill is not signalled', async () => {
    const h = fakeHost({
      [ROOT]: { ppid: 1, pgid: ROOT, start: '100', marked: true },
      600: { ppid: 1, pgid: 600, start: '200', marked: true },
    });
    const t = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: h.readProc, kill: h.kill });
    t.attach(ROOT);
    await t.sample();
    h.table.set(600, { ppid: 1, pgid: 600, start: '999' }); // pid reused by an unrelated process
    assert.deepEqual(await t.killAll(), []);
    assert.equal(h.signalled(600), false, JSON.stringify(h.signals));
    assert.ok(h.table.has(600));
  });

  test('the root already reaped, a live member still in its group: SIGKILL goes to -root', async () => {
    const h = fakeHost({
      [ROOT]: { ppid: 1, pgid: ROOT, start: '100', marked: true },
      501: { ppid: ROOT, pgid: ROOT, start: '110' },
    });
    const t = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: h.readProc, kill: h.kill });
    t.attach(ROOT);
    await t.sample();
    h.table.delete(ROOT);
    h.table.set(501, { ppid: 1, pgid: ROOT, start: '110' }); // orphaned, no marker, still in the group
    assert.deepEqual(await t.killAll(), []);
    assert.deepEqual(h.signals[0], [-ROOT, 'SIGKILL'], JSON.stringify(h.signals));
  });

  test('with no sampled process in the root group, -root is never signalled', async () => {
    const h = fakeHost({ [ROOT]: { ppid: 1, pgid: ROOT, start: '100', marked: true } });
    const t = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: h.readProc, kill: h.kill });
    t.attach(ROOT);
    await t.sample();
    h.table.delete(ROOT);
    h.table.set(700, { ppid: 1, pgid: 700, start: '300', marked: true });
    await t.killAll();
    assert.equal(h.signalled(-ROOT), false, JSON.stringify(h.signals));
  });

  test('a killed process left as a zombie is not reported as a survivor; one that ignores SIGKILL is', async () => {
    const procs = (): Record<number, FakeProc> => ({ [ROOT]: { ppid: 1, pgid: ROOT, start: '100', marked: true } });
    const z = fakeHost(procs(), { zombie: true });
    const tz = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: z.readProc, kill: z.kill });
    tz.attach(ROOT);
    assert.deepEqual(await tz.killAll(), []);
    assert.equal(z.table.get(ROOT)?.state, 'Z');
    const im = fakeHost(procs(), { immortal: true });
    const ti = await startTreeTracker(0, 'linux', { marker: MARKER, readProc: im.readProc, kill: im.kill });
    ti.attach(ROOT);
    assert.deepEqual(await ti.killAll(), [ROOT]);
  });

  test('darwin (ps): the parent closure from the root is tracked; unrelated and zombie rows are not signalled', async () => {
    const rows: Record<number, { ppid: number; pgid: number; stat: string }> = {
      [ROOT]: { ppid: 1, pgid: ROOT, stat: 'Ss' },
      510: { ppid: ROOT, pgid: 510, stat: 'S' }, // left the group with setpgid
      511: { ppid: 510, pgid: 511, stat: 'S+' }, // grandchild, own group
      512: { ppid: 511, pgid: 511, stat: 'Z' },
      900: { ppid: 1, pgid: 900, stat: 'S' },
    };
    const signals: number[] = [];
    const runPs = async (): Promise<string> => Object.entries(rows)
      .map(([pid, r]) => `  ${pid}  ${r.ppid} ${r.pgid} ${r.stat}   Wed Oct 14 23:01:0${Number(pid) % 10} 2026`).join('\n');
    const kill = (pid: number): void => { signals.push(pid); if (pid > 0) delete rows[pid]; else for (const id of Object.keys(rows)) if (rows[Number(id)].pgid === -pid) delete rows[Number(id)]; };
    const t = await startTreeTracker(0, 'darwin', { marker: MARKER, runPs, kill });
    t.attach(ROOT);
    await t.sample();
    assert.deepEqual(await t.killAll(), []);
    for (const pid of [510, 511]) assert.ok(signals.includes(pid), `${pid} killed: ${JSON.stringify(signals)}`);
    assert.equal(signals.includes(900) || signals.includes(512), false, JSON.stringify(signals));
    assert.ok(rows[900]);
  });
});

suite('process-tree POSIX tracking, live (Linux only) (#475 LD5 FX951)', function () {
  this.timeout(30000);
  const node = process.execPath;
  const waitFor = async (file: string): Promise<number> => {
    for (let i = 0; i < 100 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 50));
    return Number(fs.readFileSync(file, 'utf8'));
  };
  /** Running = listed in /proc and not a zombie (a killed orphan may still wait for its reaper). */
  const running = (pid: number): boolean => {
    try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return st.slice(st.lastIndexOf(')') + 2)[0] !== 'Z'; } catch { return false; }
  };
  const exited = (pid: number): Promise<void> => new Promise((resolve) => {
    const poll = (): void => { if (!running(pid)) resolve(); else setTimeout(poll, 50); };
    poll();
  });

  setup(function () { if (process.platform !== 'linux') this.skip(); });

  test('a setsid grandchild carrying the marker whose parent exited is dead after killAll', async () => {
    const marker = `live-${process.pid}-${Date.now()}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fspt-'));
    const gFile = path.join(dir, 'g'); const cFile = path.join(dir, 'c');
    const grandchild = `require('fs').writeFileSync(${JSON.stringify(gFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const child = `const cp = require('child_process'); require('fs').writeFileSync(${JSON.stringify(cFile)}, String(process.pid));
      cp.spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { detached: true, stdio: 'ignore' }).unref();
      const t = Date.now(); while (!require('fs').existsSync(${JSON.stringify(gFile)}) && Date.now() - t < 5000) { /* wait */ }`;
    const agent = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'ignore' }); setInterval(() => {}, 1000);`;
    const t = await startTreeTracker(Date.now(), 'linux', { marker });
    const root = spawn(node, ['-e', agent], { detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FAILSAFE_ISOLATED_RUN: marker } });
    try {
      t.attach(root.pid ?? 0);
      const g = await waitFor(gFile);
      await exited(await waitFor(cFile)); // no sample was taken while the parent lived
      assert.ok(running(g), 'grandchild running before killAll');
      assert.deepEqual(await t.killAll(), []);
      assert.equal(running(g), false, 'setsid grandchild killed');
    } finally { try { process.kill(-(root.pid ?? 0), 'SIGKILL'); } catch { /* gone */ } t.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('a child with no marker that stays in the agent group and outlives the agent is dead after killAll', async () => {
    const marker = `live-${process.pid}-${Date.now()}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fspt-'));
    const cFile = path.join(dir, 'c');
    const child = `require('fs').writeFileSync(${JSON.stringify(cFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    // Only ELECTRON_RUN_AS_NODE (so process.execPath runs as node inside the test host): no marker.
    const agent = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'ignore', env: { ELECTRON_RUN_AS_NODE: '1' } }).unref();
      const t = Date.now(); while (!require('fs').existsSync(${JSON.stringify(cFile)}) && Date.now() - t < 5000) { /* wait */ }`;
    const t = await startTreeTracker(Date.now(), 'linux', { marker });
    const root = spawn(node, ['-e', agent], { detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FAILSAFE_ISOLATED_RUN: marker } });
    const c = await waitFor(cFile);
    try {
      t.attach(root.pid ?? 0);
      await exited(root.pid ?? 0); // the agent is gone before any sample
      assert.ok(running(c), 'child outlived the agent');
      assert.deepEqual(await t.killAll(), []);
      assert.equal(running(c), false, 'group member killed');
    } finally { try { process.kill(c, 'SIGKILL'); } catch { /* gone */ } t.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
