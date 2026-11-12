'use strict';
/**
 * #651: event-loop responsiveness oracle for the bounded describe path.
 *
 * A turn of the main thread is the gap between two 10 ms timer callbacks. Its "held" time is the
 * part of that gap in which the thread was running or blocked, and not waiting for a CPU:
 *
 *   held = wall-clock gap - run-queue wait of the main thread in that gap.
 *
 * On Linux the run-queue wait is the kernel's own accounting for the main thread
 * (/proc/self/task/<tid>/schedstat, second field). Time the thread spent blocked off the CPU (a
 * child process, Atomics.wait, a slow synchronous read) is not run-queue wait, so it is never
 * excused. Where the kernel does not expose that accounting (Windows, macOS) the run-queue wait is
 * taken as zero and the verdict is plain wall-clock time. To keep wall-clock time meaningful under
 * a loaded machine, the measurement raises this process to above-normal priority when the system
 * allows it, and restores the previous priority afterwards. Nothing is retried and no attempt is
 * discarded: every turn of every call counts.
 */
const fs = require('fs');
const os = require('os');
const childProcess = require('child_process');

const LAG_LIMIT_MS = 100;
const SAMPLE_MS = 10;
// Captured before any seam is installed, so the sampler's own reads are never counted as describe's.
const readFile = fs.readFileSync;
const SCHEDSTAT = process.platform === 'linux' ? `/proc/self/task/${process.pid}/schedstat` : null;

/** Main-thread run-queue wait so far, in ms, or null where the kernel does not report it. */
function runQueueMs() {
  if (!SCHEDSTAT) return null;
  try {
    const waitNs = Number(readFile(SCHEDSTAT, 'utf8').trim().split(/\s+/)[1]);
    return Number.isFinite(waitNs) ? waitNs / 1e6 : null;
  } catch {
    return null;
  }
}

function threadCpuMs() {
  if (typeof process.threadCpuUsage !== 'function') {
    throw new Error(`#651 needs process.threadCpuUsage (Node 22 or later); this is Node ${process.version}`);
  }
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
}

const now = () => ({ t: performance.now(), cpu: threadCpuMs(), queued: runQueueMs() });

/** Samples every turn; `worst` is the turn with the longest held time, with its wall, CPU and queue parts. */
function startSampler() {
  const s = { worst: { held: 0, wall: 0, cpu: 0, queued: 0 }, turns: 0, mode: runQueueMs() === null ? 'wall-clock' : 'wall-clock minus kernel run-queue wait' };
  let last = now();
  const mark = () => {
    const at = now();
    const wall = at.t - last.t;
    const queued = at.queued === null || last.queued === null ? 0 : Math.max(0, at.queued - last.queued);
    const held = wall - Math.min(queued, wall);
    s.turns += 1;
    if (held > s.worst.held) s.worst = { held, wall, cpu: at.cpu - last.cpu, queued };
    last = at;
  };
  const timer = setInterval(mark, SAMPLE_MS);
  return { stop: () => { clearInterval(timer); mark(); return s; } };
}

/** Raise this process to above-normal priority if the system allows it; returns the restore function. */
function raisePriority() {
  let before;
  try {
    before = os.getPriority(0);
    os.setPriority(0, os.constants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    return { raised: false, restore: () => undefined };
  }
  return { raised: true, restore: () => { try { os.setPriority(0, before); } catch { /* best effort */ } } };
}

/**
 * Count every call, during the measurement, of a synchronous fs function, any child_process
 * function, Atomics.wait, or a raw native binding. These see live references only. A reference
 * captured earlier is caught by the held-time verdict instead, but only when it holds the event loop
 * for the limit or longer; a short call through a captured reference is not seen at all.
 */
function installSeams() {
  const counts = new Map();
  const restore = [];
  const wrap = (obj, name, label) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = function (...a) { counts.set(label, (counts.get(label) ?? 0) + 1); return orig.apply(this, a); };
    for (const k of Object.keys(orig)) obj[name][k] = orig[k];
    restore.push(() => { obj[name] = orig; });
  };
  for (const name of Object.keys(fs)) if (name.endsWith('Sync')) wrap(fs, name, `fs.${name}`);
  wrap(fs.realpathSync, 'native', 'fs.realpathSync.native');
  for (const name of Object.keys(childProcess)) wrap(childProcess, name, `child_process.${name}`);
  wrap(Atomics, 'wait', 'Atomics.wait');
  wrap(process, 'binding', 'process.binding');
  wrap(process, '_linkedBinding', 'process._linkedBinding');
  return { counts, uninstall: () => { for (const r of restore.reverse()) r(); } };
}

/**
 * Run `call(i)` for i = 0..calls-1, one after another, under the sampler and the seams. Returns the
 * worst turn over all calls, the blocking calls seen, and the measurement mode.
 */
async function measure(call, { calls = 5 } = {}) {
  const priority = raisePriority();
  const seams = installSeams();
  const sampler = startSampler();
  const results = [];
  let s;
  try {
    for (let i = 0; i < calls; i += 1) results.push(await call(i));
    await new Promise((r) => setTimeout(r, 3 * SAMPLE_MS));
  } finally {
    s = sampler.stop();
    seams.uninstall();
    priority.restore();
  }
  const blocking = [...seams.counts.entries()].filter(([, n]) => n > 0);
  return { results, worst: s.worst, turns: s.turns, mode: s.mode, raised: priority.raised, blocking, responsive: s.worst.held < LAG_LIMIT_MS };
}

const describeTurn = (m) => `${m.mode}${m.raised ? ', above-normal priority' : ''}: worst turn held ${m.worst.held.toFixed(1)} ms ` +
  `(wall ${m.worst.wall.toFixed(1)}, main-thread CPU ${m.worst.cpu.toFixed(1)}, run-queue wait ${m.worst.queued.toFixed(1)}) over ${m.turns} turns`;

module.exports = { LAG_LIMIT_MS, SAMPLE_MS, measure, describeTurn, runQueueMs, threadCpuMs };
