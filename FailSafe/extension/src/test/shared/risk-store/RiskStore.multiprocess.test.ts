// #517 FX972: the risk store across real processes. Children are spawned with
// process.execPath + ELECTRON_RUN_AS_NODE (the process-tree.test.ts precedent)
// and run riskStoreChild.js. Every concurrency case asserts its own falsifier
// precondition: the children's write windows overlap, or the run is
// inconclusive instead of passing.

import { strict as assert } from 'assert';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskStore, RiskStoreError } from '../../../shared/risk-store';

const CHILD = path.join(__dirname, 'riskStoreChild.js');

interface ChildResult { tag: string; errors: number; firstError: string; startedAt: number; firstAt: number; lastAt: number }
interface Running { proc: ChildProcess; ready: Promise<void>; done: Promise<ChildResult | null>; exited: Promise<void> }

function startChild(args: string[]): Running {
  const proc = spawn(process.execPath, [CHILD, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { markReady = resolve; });
  proc.stdout!.on('data', (d) => { out += String(d); if (out.includes('ready\n')) markReady(); });
  const exited = new Promise<void>((resolve) => proc.on('exit', () => resolve()));
  const done = exited.then(() => {
    const line = out.split('\n').find((l) => l.startsWith('{'));
    return line ? (JSON.parse(line) as ChildResult) : null;
  });
  return { proc, ready, done, exited };
}

async function race(dir: string, children: string[][]): Promise<ChildResult[]> {
  const running = children.map(startChild);
  await Promise.all(running.map((r) => r.ready));
  fs.writeFileSync(path.join(dir, 'go'), '');
  const results = await Promise.all(running.map((r) => r.done));
  return results.map((r, i) => { assert.ok(r, `child ${i} reported no result`); return r!; });
}

/**
 * Contention precondition: every child was already trying to write before
 * any child finished, so their read-modify-writes really competed. (Write
 * windows need not overlap: under contention one hot writer can hold the
 * lock for its whole loop while the other waits.)
 */
function assertOverlap(windows: Array<{ startedAt: number; lastAt: number }>): void {
  assert.ok(windows.every((w) => w.startedAt > 0 && w.lastAt >= w.startedAt), 'inconclusive: a writer never wrote');
  const overlap = Math.min(...windows.map((w) => w.lastAt)) - Math.max(...windows.map((w) => w.startedAt));
  const shortest = Math.min(...windows.map((w) => w.lastAt - w.startedAt));
  const needed = Math.max(100, shortest / 2);
  assert.ok(overlap >= needed,
    `inconclusive: the write attempts overlapped ${overlap} ms; at least ${needed} ms is required`);
}

const risksFile = (dir: string): string => path.join(dir, '.failsafe', 'risks', 'risks.json');
const readRisks = (dir: string): Array<Record<string, unknown>> => JSON.parse(fs.readFileSync(risksFile(dir), 'utf8')).risks;
const leftovers = (dir: string): string[] => fs.readdirSync(path.dirname(risksFile(dir))).filter((f) => f !== 'risks.json');

function sleepSync(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function waitForFile(file: string, timeoutMs: number): string {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    sleepSync(10);
  }
  sleepSync(20);
  return fs.readFileSync(file, 'utf8');
}

function codeOf(fn: () => unknown): string {
  try { fn(); } catch (e) { return e instanceof RiskStoreError ? e.code : `other:${String(e)}`; }
  return 'none';
}

suite('RiskStore across processes (#517 FX972)', function () {
  this.timeout(60000);
  let dir = '';
  const live: ChildProcess[] = [];
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-store-mp-')); });
  teardown(() => {
    for (const p of live.splice(0)) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('T1 two processes appending 150 records each lose none', async () => {
    const results = await race(dir, [['store-mutate', dir, 'A', '150'], ['store-mutate', dir, 'B', '150']]);
    assertOverlap(results);
    assert.deepEqual(results.map((r) => r.errors), [0, 0], results.map((r) => r.firstError).join(' | '));
    const ids = new Set(readRisks(dir).map((r) => String(r.id)));
    assert.equal(ids.size, 300);
    for (const t of ['A', 'B']) for (let i = 0; i < 150; i++) assert.ok(ids.has(`${t}-${i}`), `${t}-${i} lost`);
    assert.deepEqual(leftovers(dir).filter((f) => !f.endsWith('.signal')), []);
  });

  test('T1b RiskManager and RiskRegisterManager in two processes lose nothing and keep projectId', async () => {
    fs.mkdirSync(path.dirname(risksFile(dir)), { recursive: true });
    fs.writeFileSync(risksFile(dir), JSON.stringify({ projectId: 'seeded-project', risks: [] }));
    const results = await race(dir, [['rm-create', dir, 'M', '100'], ['rrm-upsert', dir, 'R', '100']]);
    assertOverlap(results);
    assert.deepEqual(results.map((r) => r.errors), [0, 0], results.map((r) => r.firstError).join(' | '));
    const doc = JSON.parse(fs.readFileSync(risksFile(dir), 'utf8'));
    assert.equal(doc.risks.length, 200);
    assert.equal(doc.projectId, 'seeded-project');
    assert.equal(typeof doc.lastUpdated, 'string');
  });

  test('T2 a holder killed mid-mutation leaves the bytes unchanged and the lock recovers', async () => {
    const child = startChild(['hold-and-kill', dir, 'K', '0']);
    live.push(child.proc);
    await child.exited;
    const lockDir = `${risksFile(dir)}.lock`;
    const before = fs.readFileSync(risksFile(dir), 'utf8');
    assert.equal(JSON.parse(before).risks.length, 2, 'precondition: the child seeded 2 records');
    assert.ok(fs.existsSync(lockDir), 'precondition: the killed holder orphaned its lock');
    const waiter = new RiskStore(dir, { lockTimeoutMs: 300, staleMs: 60000 });
    let message = '';
    try { waiter.mutate((doc) => { doc.risks.push({ id: 'too-early' }); }); } catch (e) {
      assert.ok(e instanceof RiskStoreError); assert.equal(e.code, 'LOCK_TIMEOUT'); message = e.message;
    }
    assert.match(message, /\.failsafe\/risks\/risks\.json\.lock/);
    assert.equal(fs.readFileSync(risksFile(dir), 'utf8'), before);
    new RiskStore(dir, { lockTimeoutMs: 5000, staleMs: 2000 }).mutate((doc) => { doc.risks.push({ id: 'after-crash' }); });
    assert.deepEqual(readRisks(dir).map((r) => r.id), ['seed-1', 'seed-2', 'after-crash']);
    assert.equal(fs.existsSync(lockDir), false);
  });

  test('T11 a live holder makes a short-timeout mutate fail with LOCK_TIMEOUT', async () => {
    fs.mkdirSync(path.dirname(risksFile(dir)), { recursive: true });
    fs.writeFileSync(risksFile(dir), JSON.stringify({ risks: [{ id: 'kept' }] }));
    const before = fs.readFileSync(risksFile(dir), 'utf8');
    const child = startChild(['hold-forever', dir, 'H', '0', '5000']);
    live.push(child.proc);
    waitForFile(path.join(dir, 'held.signal'), 10000);
    const t0 = Date.now();
    assert.equal(codeOf(() => new RiskStore(dir, { lockTimeoutMs: 300 }).mutate((d) => { d.risks.push({ id: 'x' }); })), 'LOCK_TIMEOUT');
    assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
    assert.equal(fs.readFileSync(risksFile(dir), 'utf8'), before);
  });

  for (const mode of ['steal-and-hold', 'steal-write-and-hold'] as const) {
    test(`T18 ${mode === 'steal-and-hold' ? '(i)' : '(ii)'} a holder that outlives its lock writes nothing and keeps the thief's lock`, async () => {
      fs.mkdirSync(path.dirname(risksFile(dir)), { recursive: true });
      fs.writeFileSync(risksFile(dir), JSON.stringify({ risks: [{ id: 'base' }] }));
      const before = fs.readFileSync(risksFile(dir), 'utf8');
      const lockDir = `${risksFile(dir)}.lock`;
      const child = startChild([mode, dir, 'S', '0', '2000']);
      live.push(child.proc);
      let parentIno = '';
      let stolen: { ino: string } = { ino: '' };
      const code = codeOf(() => new RiskStore(dir, { staleMs: 2000 }).mutate((doc) => {
        parentIno = String(fs.lstatSync(lockDir, { bigint: true }).ino);
        doc.risks.push({ id: 'P' });
        stolen = JSON.parse(waitForFile(path.join(dir, 'stolen.signal'), 10000));
      }));
      assert.equal(code, 'LOCK_LOST');
      assert.ok(fs.existsSync(lockDir), 'the thief\'s lock directory must survive the release');
      assert.equal(String(fs.lstatSync(lockDir, { bigint: true }).ino), stolen.ino);
      assert.notEqual(stolen.ino, parentIno);
      const ids = readRisks(dir).map((r) => r.id);
      if (mode === 'steal-and-hold') assert.equal(fs.readFileSync(risksFile(dir), 'utf8'), before);
      else assert.deepEqual(ids, ['X']);
      assert.ok(!ids.includes('P'));
    });
  }
});
