// v6.0.8 lane C (#528, LD-4): fair queuing for the cross-process file lock.
// Children run riskStoreChild.js with process.execPath + ELECTRON_RUN_AS_NODE
// (the RiskStore.multiprocess precedent). Every cross-process case checks its
// own falsifier precondition and fails as inconclusive, never passes, when the
// competing process was not actually competing.

import { strict as assert } from 'assert';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskStore } from '../../../shared/risk-store';
import { acquireFileLock, LockErrors } from '../../../shared/fileLock/crossProcessLock';
import { Logger } from '../../../shared/Logger';

const CHILD = path.join(__dirname, '..', 'risk-store', 'riskStoreChild.js');

interface Running { proc: ChildProcess; ready: Promise<void>; exited: Promise<void>; output: () => string }

function startChild(args: string[]): Running {
  const proc = spawn(process.execPath, [CHILD, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { markReady = resolve; });
  proc.stdout!.on('data', (d) => { out += String(d); if (out.includes('ready\n')) markReady(); });
  let err = '';
  proc.stderr!.on('data', (d) => { err += String(d); });
  const exited = new Promise<void>((resolve) => proc.on('exit', () => resolve()));
  // A child that dies before "ready" fails the test at once instead of hanging it.
  const readyOrDied = Promise.race([ready, exited.then(() => {
    if (!out.includes('ready\n')) throw new Error(`child ${args[0]} exited before ready: ${err.slice(0, 500)}`);
  })]);
  // Children that signal through files never print "ready"; callers that await this still see the rejection.
  readyOrDied.catch(() => undefined);
  return { proc, ready: readyOrDied, exited, output: () => out };
}

const risksFile = (dir: string): string => path.join(dir, '.failsafe', 'risks', 'risks.json');
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function sleepSync(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/** A lock-free display read; on Windows it can briefly fail while a writer renames over the file. */
function storedIds(store: RiskStore): string[] {
  for (let attempt = 1; ; attempt++) {
    const r = store.read();
    if (r.state === 'ok') return r.doc.risks.map((x) => String(x.id));
    if (attempt >= 50) throw new Error(`the register stayed ${r.state}: ${r.state === 'unreadable' ? r.reason : ''}`);
    sleepSync(5);
  }
}

function waitForFile(file: string, timeoutMs: number): string {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    sleepSync(2);
  }
  sleepSync(20);
  return fs.readFileSync(file, 'utf8');
}

const TEST_ERRORS: LockErrors = {
  timeout: (code) => Object.assign(new Error(`timeout ${code}`), { code: 'LOCK_TIMEOUT' }),
  blocked: (code) => Object.assign(new Error(`blocked ${code}`), { code: 'LOCK_BLOCKED' }),
  lost: () => Object.assign(new Error('lost'), { code: 'LOCK_LOST' }),
  reentrant: () => Object.assign(new Error('reentrant'), { code: 'REENTRANT' }),
};

/** Plant a ticket file with a chosen mtime (ms offset from now). */
function plantTicket(queueDir: string, name: string, offsetMs: number): string {
  fs.mkdirSync(queueDir, { recursive: true });
  const file = path.join(queueDir, name);
  fs.writeFileSync(file, '');
  const t = new Date(Date.now() + offsetMs);
  fs.utimesSync(file, t, t);
  return file;
}

/**
 * Record warnings through the Logger, not the console: the VS Code extension
 * host makes console.warn an accessor whose setter does nothing, so assigning
 * to it would silently capture nothing there (integration LD14).
 */
function captureWarnings(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = Logger.prototype.warn;
  Logger.prototype.warn = function (this: Logger, message: string, data?: unknown): void {
    lines.push(message);
    original.call(this, message, data);
  };
  return { lines, restore: () => { Logger.prototype.warn = original; } };
}

function seed(dir: string, n: number): void {
  fs.mkdirSync(path.dirname(risksFile(dir)), { recursive: true });
  const risks = Array.from({ length: n }, (_, i) => ({ id: `seed-${i}`, title: 'x'.repeat(100) }));
  fs.writeFileSync(risksFile(dir), JSON.stringify({ risks }));
}

suite('Cross-process lock queue (v6.0.8 #528 LD-4)', function () {
  this.timeout(90000);
  let dir = '';
  const live: ChildProcess[] = [];
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-queue-')); });
  teardown(() => {
    for (const p of live.splice(0)) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('R1 a single update waits for at most 3 of a hot writer\'s updates, in each of five rounds', async () => {
    seed(dir, 2000);
    const hot = startChild(['store-mutate', dir, 'A', '1000000']);
    live.push(hot.proc);
    await hot.ready;
    fs.writeFileSync(path.join(dir, 'go'), '');
    const store = new RiskStore(dir);
    const countA = (): number => storedIds(store).filter((id) => id.startsWith('A-')).length;
    await delay(300);
    const rounds: Array<{ before: number; after: number; overtaken: number }> = [];
    // B400: hotness is a count, not a fixed 500 ms wall-clock window. Each wait has a 4000 ms
    // deadline: 0.3 s + 5 rounds x (4 s + an 8 s worst-case waiter mutate + 4 s) = 80.3 s, under
    // the suite's 90 s timeout. At its deadline a wait throws "inconclusive", never a pass.
    const waitForCount = async (min: number, deadlineMs: number): Promise<number> => {
      const deadline = Date.now() + deadlineMs;
      for (;;) {
        const n = countA();
        if (n >= min) return n;
        if (Date.now() >= deadline) {
          throw new Error(`inconclusive: the hot writer stored fewer than 20 updates within ${deadlineMs} ms ${JSON.stringify(rounds)}`);
        }
        await delay(25);
      }
    };
    for (let k = 0; k < 5; k++) {
      const w0 = countA();
      const a0 = await waitForCount(w0 + 20, 4000);
      store.mutate((doc) => { doc.risks.push({ id: `B-${k}` }); });
      const landed = countA();
      const ids = storedIds(store);
      const aBeforeB = ids.slice(0, ids.indexOf(`B-${k}`)).filter((id) => id.startsWith('A-')).length;
      const after = (await waitForCount(landed + 20, 4000)) - landed;
      rounds.push({ before: a0 - w0, after, overtaken: aBeforeB - a0 });
    }
    const summary = JSON.stringify(rounds);
    console.log(`R1 rounds ${summary}`);
    // By construction every round has before >= 20 and after >= 20: waitForCount returns only
    // once the writer stored 20 more updates, and otherwise throws "inconclusive".
    for (const r of rounds) {
      assert.ok(r.overtaken <= 3, `the hot writer stored ${r.overtaken} updates after the waiter started waiting ${summary}`);
    }
  });

  test('R7 a queue path that is a regular file never blocks the lock, contended or not', async () => {
    seed(dir, 0);
    fs.writeFileSync(`${risksFile(dir)}.queue`, 'not a directory');
    const warn = captureWarnings();
    try {
      const store = new RiskStore(dir);
      store.mutate((doc) => { doc.risks.push({ id: 'one' }); });
      store.mutate((doc) => { doc.risks.push({ id: 'two' }); });
      const holder = startChild(['hold-for', dir, 'H', '400', '5000']);
      live.push(holder.proc);
      waitForFile(path.join(dir, 'held.signal'), 10000);
      store.mutate((doc) => { doc.risks.push({ id: 'three' }); });
      await holder.exited;
      const released = JSON.parse(fs.readFileSync(path.join(dir, 'released.signal'), 'utf8'));
      assert.ok(released.at > 0, 'precondition: the third update waited on a held lock');
      assert.deepEqual(storedIds(store), ['one', 'two', 'three']);
      assert.ok(warn.lines.some((l) => /lock queue unavailable/.test(l)), 'the queue failure is logged');
      assert.equal(fs.readFileSync(`${risksFile(dir)}.queue`, 'utf8'), 'not a directory');
    } finally { warn.restore(); }
  });

  test('R7b a link or junction at the queue path is a queue failure; nothing is written through it', async () => {
    seed(dir, 0);
    const target = path.join(dir, 'elsewhere');
    fs.mkdirSync(target);
    const queuePath = `${risksFile(dir)}.queue`;
    fs.symlinkSync(target, queuePath, process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(fs.lstatSync(queuePath).isSymbolicLink(), 'precondition: the queue path is a link');
    const holder = startChild(['hold-for', dir, 'H', '400', '5000']);
    live.push(holder.proc);
    waitForFile(path.join(dir, 'held.signal'), 10000);
    const store = new RiskStore(dir);
    store.mutate((doc) => { doc.risks.push({ id: 'after-hold' }); });
    await holder.exited;
    const released = JSON.parse(fs.readFileSync(path.join(dir, 'released.signal'), 'utf8'));
    assert.ok(released.at > 0, 'precondition: the parent waited on a held lock');
    assert.deepEqual(fs.readdirSync(target), [], 'no ticket was created through the link');
    assert.ok(fs.lstatSync(queuePath).isSymbolicLink(), 'the link itself is left alone');
    assert.deepEqual(storedIds(store), ['after-hold']);
  });

  test('R8 contention leaves no queue directory, and a stale ticket is removed by the next waiter', async () => {
    const queueDir = `${risksFile(dir)}.queue`;
    let sawQueue = false;
    const watch = setInterval(() => { if (fs.existsSync(queueDir)) sawQueue = true; }, 1);
    try {
      const a = startChild(['store-mutate', dir, 'A', '50']);
      const b = startChild(['store-mutate', dir, 'B', '50']);
      live.push(a.proc, b.proc);
      await Promise.all([a.ready, b.ready]);
      fs.writeFileSync(path.join(dir, 'go'), '');
      await Promise.all([a.exited, b.exited]);
    } finally { clearInterval(watch); }
    assert.ok(sawQueue, 'inconclusive: the two writers never queued');
    const left = fs.readdirSync(path.dirname(risksFile(dir))).filter((f) => f !== 'risks.json');
    assert.deepEqual(left, []);
    const stale = plantTicket(queueDir, '000000000000001-99999-deadbeef', -6000);
    new RiskStore(dir).mutate((doc) => { doc.risks.push({ id: 'after-stale' }); });
    assert.equal(fs.existsSync(stale), false, 'a ticket older than staleMs is deleted');
  });

  test('R9 dead tickets, a deleted own ticket and an own ticket that looks old never block the lock', async () => {
    seed(dir, 0);
    const file = risksFile(dir);
    const queueDir = `${file}.queue`;
    const opts = { timeoutMs: 6000, staleMs: 5000, errors: TEST_ERRORS, label: 'Test' };

    // (i) + (ii): a dead-but-not-stale oldest ticket and a future-dated ticket, uncontended.
    const dead = plantTicket(queueDir, '000000000000001-99999-aaaaaaaa', -2000);
    const future = plantTicket(queueDir, '000000000000002-99998-bbbbbbbb', 60000);
    let t0 = Date.now();
    acquireFileLock(file, opts).release();
    assert.ok(Date.now() - t0 < 300, `(i) uncontended acquire took ${Date.now() - t0} ms`);
    assert.equal(fs.existsSync(future), false, 'a future-dated ticket is deleted');
    assert.equal(fs.existsSync(dead), true, 'a dead but not stale ticket is left in place');
    fs.rmSync(queueDir, { recursive: true, force: true });

    // (iii): another process deletes this caller's ticket while it waits.
    const deleter = startChild(['delete-foreign-ticket', dir, 'D', '0']);
    live.push(deleter.proc);
    await deleter.ready;
    let holder = startChild(['hold-for', dir, 'H', '400', '5000']);
    live.push(holder.proc);
    waitForFile(path.join(dir, 'held.signal'), 10000);
    acquireFileLock(file, opts).release();
    let acquiredAt = Date.now();
    await Promise.all([holder.exited, deleter.exited]);
    const deleted = JSON.parse(fs.readFileSync(path.join(dir, 'deleted.signal'), 'utf8'));
    let released = JSON.parse(fs.readFileSync(path.join(dir, 'released.signal'), 'utf8'));
    assert.ok(deleted.at > 0 && deleted.at < released.at,
      `precondition: the ticket was deleted (${deleted.at}) before the release (${released.at})`);
    assert.ok(acquiredAt - released.at < 300, `(iii) acquired ${acquiredAt - released.at} ms after the release`);
    for (const f of ['held.signal', 'released.signal', 'deleted.signal']) fs.rmSync(path.join(dir, f), { force: true });

    // (iv): this caller's own ticket keeps looking 2000 ms old (between LIVE_MS and staleMs).
    holder = startChild(['hold-for', dir, 'H', '400', '5000']);
    live.push(holder.proc);
    waitForFile(path.join(dir, 'held.signal'), 10000);
    t0 = Date.now();
    acquireFileLock(file, { ...opts, queueSeams: { mtimeMs: (_p, real) => real - 2000 } }).release();
    acquiredAt = Date.now();
    await holder.exited;
    released = JSON.parse(fs.readFileSync(path.join(dir, 'released.signal'), 'utf8'));
    assert.ok(released.at >= t0, 'precondition: the caller waited on a held lock');
    assert.ok(acquiredAt - released.at < 300, `(iv) acquired ${acquiredAt - released.at} ms after the release`);
  });

  test('A4 the queue seam is not reachable from the risk store or the nonce guard options', () => {
    const root = path.resolve(__dirname, '..', '..', '..', '..', 'src');
    const files = ['shared/risk-store/riskStoreLock.ts', 'shared/risk-store/RiskStore.ts',
      'governance/SecurityReplayGuard.ts', 'governance/nonceStore.ts'];
    assert.ok(fs.existsSync(path.join(root, files[0])), 'precondition: the source tree is present');
    for (const rel of files) {
      const file = path.join(root, rel);
      if (!fs.existsSync(file)) continue;
      assert.ok(!/queueSeams/.test(fs.readFileSync(file, 'utf8')), `${rel} must not accept or forward queueSeams`);
    }
  });
});
