// v6.0.8 lane C (#472 residual, LD-6/LD-7): the replay-nonce store across
// processes, under write faults, and against a holder that stalls past its
// lock budget. Children run replayGuardChild.js with process.execPath +
// ELECTRON_RUN_AS_NODE. Cross-process cases check their own falsifier
// precondition and fail as inconclusive, never pass, when it does not hold.
// Seams the v6.0.7 guard does not have are passed through `any`, so this file
// compiles against the v6.0.7 tree too.

import { strict as assert } from 'assert';
import { ChildProcess, execFileSync, spawn, spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityReplayGuard } from '../../governance/SecurityReplayGuard';

const CHILD = path.join(__dirname, 'replayGuardChild.js');

interface Running { proc: ChildProcess; ready: Promise<void>; lines: Promise<string[]> }

function startChild(args: string[]): Running {
  const proc = spawn(process.execPath, [CHILD, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  let markReady: () => void = () => undefined;
  const readyP = new Promise<void>((resolve) => { markReady = resolve; });
  proc.stdout!.on('data', (d) => { out += String(d); if (out.includes('ready\n')) markReady(); });
  proc.stderr!.on('data', (d) => { err += String(d); });
  const exited = new Promise<void>((resolve) => proc.on('exit', () => resolve()));
  const ready = Promise.race([readyP, exited.then(() => {
    if (!out.includes('ready\n')) throw new Error(`child ${args[0]} exited before ready: ${err.slice(0, 500)}`);
  })]);
  const lines = exited.then(() => out.split('\n').filter((l) => l.startsWith('{')));
  return { proc, ready, lines };
}

const storeDir = (root: string): string => path.join(root, '.failsafe', 'security');
const storeFile = (root: string): string => path.join(storeDir(root), 'nonces.json');
const tempFiles = (root: string): string[] => fs.readdirSync(storeDir(root)).filter((f) => f.endsWith('.tmp'));
const errno = (code: string): Error => Object.assign(new Error(`${code}: injected`), { code });

function makeReadOnly(dir: string): () => void {
  if (process.platform === 'win32') {
    // Deny creating, appending and deleting entries; generic W would also deny
    // SYNCHRONIZE, which breaks reads of the existing store file.
    const who = process.env.USERNAME ?? '';
    execFileSync('icacls', [dir, '/deny', `${who}:(OI)(CI)(WD,AD,DC)`], { stdio: 'ignore' });
    return () => execFileSync('icacls', [dir, '/remove:d', who], { stdio: 'ignore' });
  }
  fs.chmodSync(dir, 0o555);
  return () => fs.chmodSync(dir, 0o755);
}

function assertOverlap(windows: Array<{ startedAt: number; lastAt: number }>): void {
  const overlap = Math.min(...windows.map((w) => w.lastAt)) - Math.max(...windows.map((w) => w.startedAt));
  const shortest = Math.min(...windows.map((w) => w.lastAt - w.startedAt));
  const needed = Math.max(50, shortest / 2);
  assert.ok(overlap >= needed, `inconclusive: the issuing windows overlapped ${overlap} ms; at least ${needed} ms is required`);
}

suite('SecurityReplayGuard across processes and faults (v6.0.8 #472)', function () {
  this.timeout(60000);
  let root = '';
  const live: ChildProcess[] = [];
  const guards: SecurityReplayGuard[] = [];
  const guard = (options: Record<string, unknown> = {}): SecurityReplayGuard => {
    const g = new SecurityReplayGuard(root, { cleanupIntervalMs: 3_600_000, ...options } as any);
    guards.push(g);
    return g;
  };
  setup(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-mp-')); });
  teardown(() => {
    for (const g of guards.splice(0)) { try { g.dispose(); } catch { /* already disposed */ } }
    for (const p of live.splice(0)) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('N1 four processes consuming one nonce: exactly one is accepted', async () => {
    const nonce = guard().generateNonce({ action: 'audit' });
    const children = [0, 1, 2, 3].map(() => startChild(['consume', root, nonce]));
    live.push(...children.map((c) => c.proc));
    await Promise.all(children.map((c) => c.ready));
    fs.writeFileSync(path.join(root, 'go'), '');
    const outputs = await Promise.all(children.map((c) => c.lines));
    const pre = outputs.map((l) => JSON.parse(l[0]).pre);
    assert.deepEqual(pre, [true, true, true, true], 'precondition: every child saw the nonce unconsumed');
    const results = outputs.map((l) => JSON.parse(l[1]));
    assert.equal(results.filter((r) => r.valid).length, 1, JSON.stringify(results));
    assert.deepEqual(results.filter((r) => !r.valid).map((r) => r.reason), ['already_used', 'already_used', 'already_used']);
  });

  test('N2 two processes issuing 100 nonces each lose none', async () => {
    guard().generateNonce();
    const children = [startChild(['issue', root, '100']), startChild(['issue', root, '100'])];
    live.push(...children.map((c) => c.proc));
    await Promise.all(children.map((c) => c.ready));
    fs.writeFileSync(path.join(root, 'go'), '');
    const results = (await Promise.all(children.map((c) => c.lines))).map((l) => JSON.parse(l[0]));
    assertOverlap(results);
    assert.deepEqual(results.map((r) => r.errors), [0, 0]);
    const stored = new Set((JSON.parse(fs.readFileSync(storeFile(root), 'utf8')) as Array<{ nonce: string }>).map((r) => r.nonce));
    const issued: string[] = results.flatMap((r) => r.nonces);
    assert.equal(issued.length, 200);
    const lost = issued.filter((n) => !stored.has(n));
    assert.equal(lost.length, 0, `${lost.length} of 200 issued nonces are missing from the store`);
    const check = guard();
    assert.ok(issued.every((n) => check.validateNonce(n).valid));
  });

  test('N3 a read-only store directory fails closed, then recovers once writable', function () {
    if (process.platform === 'win32' && !process.env.USERNAME) throw new Error('USERNAME is not set; the read-only setup cannot run');
    const g = guard({ lockTimeoutMs: 300 });
    const nonce = g.generateNonce();
    const before = fs.readFileSync(storeFile(root));
    const restore = makeReadOnly(storeDir(root));
    try {
      let probeWritten = true;
      try { fs.writeFileSync(path.join(storeDir(root), 'probe.txt'), 'x'); } catch { probeWritten = false; }
      assert.equal(probeWritten, false, 'precondition: the store directory is not writable');
      const result = g.consumeNonce(nonce);
      assert.deepEqual([result.valid, result.reason], [false, 'persistence_error']);
      assert.throws(() => g.generateNonce(), /may be read-only/);
      assert.ok(fs.readFileSync(storeFile(root)).equals(before), 'the store bytes are unchanged');
    } finally { restore(); }
    assert.equal(g.consumeNonce(nonce).valid, true, 'once writable, the refused nonce is accepted once');
    assert.equal(g.consumeNonce(nonce).reason, 'already_used');
  });

  test('N4 an ENOSPC write fails closed, leaves the store and no temp file', () => {
    let fail = false;
    const writeSync = (fd: number, data: string) => { if (fail) throw errno('ENOSPC'); fs.writeFileSync(fd, data); };
    const g = guard({ seams: { writeSync } });
    const nonce = g.generateNonce();
    const before = fs.readFileSync(storeFile(root));
    fail = true;
    const result = g.consumeNonce(nonce);
    assert.deepEqual([result.valid, result.reason], [false, 'persistence_error']);
    assert.ok(fs.readFileSync(storeFile(root)).equals(before));
    assert.deepEqual(tempFiles(root), []);
    assert.throws(() => g.generateNonce(), /fail-closed persistence state/);
  });

  test('N5 the temp file is fsynced before the rename, and a failed fsync fails closed', () => {
    const events: string[] = [];
    let syncedIno: bigint | null = null;
    let failSync = false;
    const fsyncSync = (fd: number) => {
      if (failSync) throw errno('EIO');
      syncedIno = fs.fstatSync(fd, { bigint: true }).ino;
      events.push('fsync');
      fs.fsyncSync(fd);
    };
    const renameSync = (from: string, to: string) => { events.push('rename'); fs.renameSync(from, to); };
    const g = guard({ renameSync, seams: { fsyncSync } });
    const nonce = g.generateNonce();
    assert.deepEqual(events, ['fsync', 'rename']);
    assert.equal(syncedIno, fs.statSync(storeFile(root), { bigint: true }).ino, 'the fsynced descriptor is the file renamed into place');
    const before = fs.readFileSync(storeFile(root));
    failSync = true;
    assert.equal(g.consumeNonce(nonce).reason, 'persistence_error');
    assert.ok(fs.readFileSync(storeFile(root)).equals(before));
    assert.deepEqual(tempFiles(root), []);
  });

  test('N6 dispose never writes a stale map over another process\'s nonce', async () => {
    const a = guard();
    a.generateNonce();
    const child = startChild(['issue', root, '1']);
    live.push(child.proc);
    await child.ready;
    fs.writeFileSync(path.join(root, 'go'), '');
    const issued = JSON.parse((await child.lines)[0]).nonces[0];
    assert.equal(guard().validateNonce(issued).valid, true, 'precondition: the child\'s nonce is stored');
    a.dispose();
    assert.equal(guard().validateNonce(issued).valid, true, 'the child\'s nonce survives the other guard\'s dispose');
  });

  test('N7 a holder that outlives its lock budget, or finds the file changed, writes nothing', function () {
    this.timeout(30000);
    let offset = 0;
    let stall = false;
    let rewrite = false;
    const writeSync = (fd: number, data: string) => {
      if (stall) offset += 10000;
      if (rewrite) fs.writeFileSync(storeFile(root), '[]\n');
      fs.writeFileSync(fd, data);
    };
    const g = guard({ seams: { writeSync, now: () => performance.now() + offset }, lockTimeoutMs: 8000 });
    const nonce = g.generateNonce();
    stall = true;
    const stalled = g.consumeNonce(nonce);
    stall = false;
    assert.deepEqual([stalled.valid, stalled.reason], [false, 'persistence_error']);
    const onDisk = (JSON.parse(fs.readFileSync(storeFile(root), 'utf8')) as Array<{ nonce: string; consumedAt?: number }>).find((r) => r.nonce === nonce);
    assert.ok(onDisk && onDisk.consumedAt === undefined, 'the nonce is still unconsumed on disk');
    assert.deepEqual(tempFiles(root), []);
    assert.equal(g.consumeNonce(nonce).valid, true, 'the store was not marked unhealthy');

    const second = g.generateNonce();
    rewrite = true;
    const changed = g.consumeNonce(second);
    rewrite = false;
    assert.deepEqual([changed.valid, changed.reason], [false, 'persistence_error']);
    assert.equal(fs.readFileSync(storeFile(root), 'utf8'), '[]\n', 'the other writer\'s bytes are kept');
  });
});

// v6.0.8 review delta (LD-1..LD-8 of plan-v608-laneC-delta-review): consumption
// markers, the lock re-check before every rename attempt, busy reads, malformed
// records, the marker folder check and the internal seams.

const markerDir = (root: string): string => path.join(storeDir(root), 'nonces.consumed');
const markerFile = (root: string, nonce: string): string =>
  path.join(markerDir(root), crypto.createHash('sha256').update(nonce).digest('hex'));
const HOUR = 60 * 60 * 1000;

function consumeInChild(root: string, nonce: string): { valid: boolean; reason: string | null } {
  const res = spawnSync(process.execPath, [CHILD, 'consume-now', root, nonce], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 20000,
  });
  const line = String(res.stdout).split('\n').find((l) => l.startsWith('{'));
  if (!line) throw new Error(`consume-now child gave no result: ${String(res.stderr).slice(0, 500)}`);
  return JSON.parse(line);
}

function denyFileCreate(dir: string): () => void {
  const who = process.env.USERNAME ?? '';
  execFileSync('icacls', [dir, '/deny', `${who}:(WD)`], { stdio: 'ignore' });
  return () => execFileSync('icacls', [dir, '/remove:d', who], { stdio: 'ignore' });
}

suite('SecurityReplayGuard review delta (v6.0.8 #472)', function () {
  this.timeout(60000);
  let root = '';
  const guards: SecurityReplayGuard[] = [];
  const realReadFileSync = fs.readFileSync;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsModule = require('fs') as { readFileSync: typeof fs.readFileSync };
  const guard = (options: Record<string, unknown> = {}): SecurityReplayGuard => {
    const g = new SecurityReplayGuard(root, { cleanupIntervalMs: 3_600_000, ...options } as any);
    guards.push(g);
    return g;
  };
  setup(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-delta-')); });
  teardown(() => {
    fsModule.readFileSync = realReadFileSync;
    for (const g of guards.splice(0)) { try { g.dispose(); } catch { /* already disposed */ } }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('N8 a second holder that takes the lock inside the rename window cannot also accept the nonce', () => {
    let armed = false;
    const seen: { child: { valid: boolean; reason: string | null } | null } = { child: null };
    const renameSync = (from: string, to: string) => {
      if (armed && !seen.child) {
        // A second holder: it removes this holder's lock (as a stale takeover's rmdir would) and consumes.
        fs.rmSync(`${storeFile(root)}.lock`, { recursive: true, force: true });
        seen.child = consumeInChild(root, nonce);
      }
      fs.renameSync(from, to);
    };
    const a = guard({ renameSync });
    const nonce = a.generateNonce();
    armed = true;
    const mine = a.consumeNonce(nonce);
    const theirs = seen.child;
    assert.ok(theirs, 'precondition: the second holder ran inside the rename window');
    assert.ok(theirs.valid || theirs.reason === 'already_used', `precondition: the second holder reached a decision (${JSON.stringify(theirs)})`);
    const accepted = [mine.valid, theirs.valid].filter(Boolean).length;
    assert.equal(accepted, 1, `exactly one consumer may be accepted (mine ${JSON.stringify(mine)}, theirs ${JSON.stringify(theirs)})`);
  });

  test('N8b a consumption reverted in the store is still refused; markers are kept for an hour past expiry', () => {
    let t = Date.now();
    const g = guard({ seams: { clock: () => t } });
    const nonce = g.generateNonce(undefined, 60_000);
    assert.equal(g.consumeNonce(nonce).valid, true);
    const records = JSON.parse(fs.readFileSync(storeFile(root), 'utf8')) as Array<Record<string, unknown>>;
    const record = records.find((r) => r.nonce === nonce)!;
    delete record.consumedAt;
    fs.writeFileSync(storeFile(root), JSON.stringify(records, null, 2));
    assert.equal(g.validateNonce(nonce).reason, 'already_used', 'validate honours the marker');
    assert.equal(g.consumeNonce(nonce).reason, 'already_used', 'consume honours the marker');
    assert.ok(fs.existsSync(markerFile(root, nonce)), 'the marker exists before cleanup');
    const expiresAt = record.expiresAt as number;
    t = expiresAt + 30 * 60 * 1000;
    g.cleanup();
    assert.ok(fs.existsSync(markerFile(root, nonce)), 'kept at expiry + 30 min');
    t = expiresAt + HOUR + 60 * 1000;
    g.cleanup();
    assert.equal(fs.existsSync(markerFile(root, nonce)), false, 'removed after expiry + 1 h');
  });

  test('N9 records with a malformed or missing expiresAt are expired and cleaned up', () => {
    fs.mkdirSync(storeDir(root), { recursive: true });
    const n1 = crypto.randomBytes(32).toString('hex');
    const n2 = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(storeFile(root), JSON.stringify([
      { nonce: n1, createdAt: Date.now(), expiresAt: 'soon' },
      { nonce: n2, createdAt: Date.now() },
      'not a record',
    ]));
    const g = guard();
    assert.deepEqual([g.validateNonce(n1).reason, g.validateNonce(n2).reason], ['expired', 'expired']);
    assert.deepEqual([g.consumeNonce(n1).reason, g.consumeNonce(n2).reason], ['expired', 'expired']);
    g.cleanup();
    const left = (JSON.parse(fs.readFileSync(storeFile(root), 'utf8')) as Array<{ nonce?: string }>).map((r) => r.nonce);
    assert.ok(!left.includes(n1) && !left.includes(n2), `malformed records are removed (${JSON.stringify(left)})`);
  });

  test('N10 the lock is re-checked before a rename retry', () => {
    let offset = 0;
    let armed = false;
    let attempts = 0;
    const now = () => performance.now() + offset;
    const renameSync = (from: string, to: string) => {
      if (armed) {
        attempts++;
        if (attempts === 1) { offset += 10000; throw errno('EPERM'); }
      }
      fs.renameSync(from, to);
    };
    const g = guard({ renameSync, now, seams: { now } });
    const nonce = g.generateNonce();
    const before = fs.readFileSync(storeFile(root));
    armed = true;
    const result = g.consumeNonce(nonce);
    assert.deepEqual([result.valid, result.reason], [false, 'persistence_error']);
    assert.equal(attempts, 1, 'no rename attempt after the lock check failed');
    assert.ok(fs.readFileSync(storeFile(root)).equals(before));
  });

  test('N11 a transient read error refuses the call and never disables the guard', () => {
    const g = guard();
    const nonce = g.generateNonce();
    let busy = true;
    fsModule.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (busy && path.resolve(String(file)) === path.resolve(storeFile(root))) throw errno('EBUSY');
      return (realReadFileSync as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof fs.readFileSync;
    try {
      assert.doesNotThrow(() => g.getStats());
      assert.doesNotThrow(() => g.hasNonce(nonce));
      assert.equal(g.validateNonce(nonce).reason, 'persistence_error');
      assert.equal(g.consumeNonce(nonce).reason, 'persistence_error');
      assert.throws(() => g.generateNonce());
    } finally {
      busy = false;
      fsModule.readFileSync = realReadFileSync;
    }
    assert.equal(g.validateNonce(nonce).valid, true, 'the guard works again once the file can be read');
    assert.equal(g.consumeNonce(nonce).valid, true);
  });

  test('N3b a failure to create the temp file fails closed', function () {
    // Cross-platform: the internal openTemp seam.
    let failOpen = false;
    const openTemp = (p: string) => { if (failOpen) throw errno('EACCES'); return fs.openSync(p, 'wx', 0o600); };
    const g = guard({ seams: { openTemp } });
    const nonce = g.generateNonce();
    const before = fs.readFileSync(storeFile(root));
    failOpen = true;
    assert.equal(g.consumeNonce(nonce).reason, 'persistence_error');
    assert.ok(fs.readFileSync(storeFile(root)).equals(before));
    assert.deepEqual(tempFiles(root), []);
    assert.throws(() => g.generateNonce(), /fail-closed persistence state/);
    if (process.platform !== 'win32') return;

    // Windows: the store folder denies creating files but still allows mkdir (the lock).
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-delta-wd-'));
    const g2 = new SecurityReplayGuard(root2, { cleanupIntervalMs: 3_600_000 });
    guards.push(g2);
    try {
      assert.equal(g2.consumeNonce(g2.generateNonce()).valid, true);
      const second = g2.generateNonce();
      const before2 = fs.readFileSync(storeFile(root2));
      const restore = denyFileCreate(storeDir(root2));
      try {
        let probeDir = false;
        let probeFile = true;
        try { fs.mkdirSync(path.join(storeDir(root2), 'probe.d')); fs.rmdirSync(path.join(storeDir(root2), 'probe.d')); probeDir = true; } catch { /* precondition */ }
        try { fs.writeFileSync(path.join(storeDir(root2), 'probe.txt'), 'x', { flag: 'wx' }); } catch { probeFile = false; }
        assert.deepEqual([probeDir, probeFile], [true, false], 'precondition: mkdir works and creating a file fails');
        assert.equal(g2.consumeNonce(second).reason, 'persistence_error');
        assert.ok(fs.readFileSync(storeFile(root2)).equals(before2));
        assert.deepEqual(tempFiles(root2), []);
        assert.throws(() => g2.generateNonce(), /fail-closed persistence state/);
      } finally { restore(); }
    } finally { fs.rmSync(root2, { recursive: true, force: true }); }
  });

  test('N12 a link at nonces.consumed disables the guard and nothing is written through it', () => {
    const g = guard();
    const nonce = g.generateNonce();
    const target = path.join(root, 'elsewhere');
    fs.mkdirSync(target);
    fs.symlinkSync(target, markerDir(root), process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(fs.lstatSync(markerDir(root)).isSymbolicLink(), 'precondition: nonces.consumed is a link');
    // The consume runs on a fresh guard over the planted link, so it fails on the link
    // itself, not on a guard that an earlier call already disabled.
    const fresh = guard();
    const before = fs.readFileSync(storeFile(root));
    const consumed = fresh.consumeNonce(nonce);
    assert.deepEqual(fs.readdirSync(target), [], 'nothing was created through the link');
    assert.equal(consumed.reason, 'persistence_error');
    assert.ok(fs.readFileSync(storeFile(root)).equals(before), 'the store is unchanged');
    assert.equal(g.validateNonce(nonce).reason, 'persistence_error');
    assert.throws(() => g.generateNonce(), /nonces\.consumed/);
  });

  test('N14 a marker that another holder created first (EEXIST on the exclusive create) refuses the consume', () => {
    // The seam plants the marker after the earlier marker check, then lets the real wx open run.
    const openMarker = (p: string) => { fs.writeFileSync(p, JSON.stringify({ expiresAt: Date.now() + HOUR })); return fs.openSync(p, 'wx', 0o600); };
    const g = guard({ seams: { openMarker } });
    const nonce = g.generateNonce();
    const before = fs.readFileSync(storeFile(root));
    const result = g.consumeNonce(nonce);
    assert.deepEqual([result.valid, result.reason], [false, 'already_used']);
    assert.ok(fs.readFileSync(storeFile(root)).equals(before), 'no record written');
    assert.deepEqual(tempFiles(root), []);
    assert.doesNotThrow(() => g.generateNonce(), 'losing the marker race does not disable the guard');
  });

  test('N13 a marker that cannot be created writes no record; busy is retried, a hard error disables', () => {
    let markerError = '';
    const openMarker = (p: string) => { if (markerError) throw errno(markerError); return fs.openSync(p, 'wx', 0o600); };
    const g = guard({ seams: { openMarker } });
    const nonce = g.generateNonce();
    const before = fs.readFileSync(storeFile(root));
    markerError = 'EBUSY';
    assert.equal(g.consumeNonce(nonce).reason, 'persistence_error');
    assert.ok(fs.readFileSync(storeFile(root)).equals(before), 'no record written on a busy marker');
    markerError = '';
    assert.equal(g.consumeNonce(nonce).valid, true, 'a busy marker does not disable the guard');
    const other = g.generateNonce();
    const before2 = fs.readFileSync(storeFile(root));
    markerError = 'EIO';
    assert.equal(g.consumeNonce(other).reason, 'persistence_error');
    assert.ok(fs.readFileSync(storeFile(root)).equals(before2), 'no record written on a failed marker');
    assert.throws(() => g.generateNonce(), /fail-closed persistence state/);
  });

  test('A8 the fault hooks are not public guard options', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'governance', 'SecurityReplayGuard.ts'), 'utf8');
    const start = src.indexOf('export interface ReplayGuardOptions');
    assert.ok(start >= 0, 'precondition: ReplayGuardOptions is declared');
    const declaration = src.slice(start, src.indexOf('{', start));
    assert.ok(!/\bextends\b/.test(declaration), `ReplayGuardOptions must not extend a seams type: ${declaration}`);
    const block = src.slice(start, src.indexOf('\n}', start));
    const exposed = block.split('\n').filter((l) => /^\s*(writeSync|fsyncSync|openTemp|openMarker|now|clock|queueSeams)\??\s*:/.test(l));
    assert.deepEqual(exposed, []);
  });
});
