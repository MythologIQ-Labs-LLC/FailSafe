// v6.0.8 lane C (#472 residual, LD-6/LD-7): the replay-nonce store across
// processes, under write faults, and against a holder that stalls past its
// lock budget. Children run replayGuardChild.js with process.execPath +
// ELECTRON_RUN_AS_NODE. Cross-process cases check their own falsifier
// precondition and fail as inconclusive, never pass, when it does not hold.
// Seams the v6.0.7 guard does not have are passed through `any`, so this file
// compiles against the v6.0.7 tree too.

import { strict as assert } from 'assert';
import { ChildProcess, execFileSync, spawn } from 'child_process';
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
      assert.throws(() => g.generateNonce());
      assert.ok(fs.readFileSync(storeFile(root)).equals(before), 'the store bytes are unchanged');
    } finally { restore(); }
    assert.equal(g.consumeNonce(nonce).valid, true, 'once writable, the refused nonce is accepted once');
    assert.equal(g.consumeNonce(nonce).reason, 'already_used');
  });

  test('N4 an ENOSPC write fails closed, leaves the store and no temp file', () => {
    let fail = false;
    const writeSync = (fd: number, data: string) => { if (fail) throw errno('ENOSPC'); fs.writeFileSync(fd, data); };
    const g = guard({ writeSync });
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
    const g = guard({ fsyncSync, renameSync });
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
    const g = guard({ writeSync, now: () => performance.now() + offset, lockTimeoutMs: 8000 });
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
