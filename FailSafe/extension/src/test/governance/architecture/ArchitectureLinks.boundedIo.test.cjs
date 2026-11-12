'use strict';
/**
 * #651: describeAffectedArchitecture over a 5,000-row index with a pathological cell does no git, no
 * synchronous fs, no child process and no Atomics.wait, and never holds the event loop for 100 ms.
 *
 * The verdict is in eventLoopOracle.cjs: every turn of every call counts, nothing is retried, and a
 * turn is excused only for the time the kernel reports the main thread waiting for a CPU (Linux).
 * Off-CPU blocking is never excused. Each negative control below plants one kind of violation and
 * requires the verdict to fail, including a stall on one call only and blocking functions captured
 * before the seams were installed, which only the time verdict can see.
 *
 * Runs standalone after `npm run compile`: node --test src/test/governance/architecture/ArchitectureLinks.boundedIo.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const childProcess = require('child_process');
const { affected, registerCleanup, row, SELF, workspace } = require('./architectureFixtures.cjs');
const { LAG_LIMIT_MS, SAMPLE_MS, measure, describeTurn, threadCpuMs } = require('./eventLoopOracle.cjs');

registerCleanup(test);

// Captured before any measurement, as a module that holds its own reference would be.
const capturedWait = Atomics.wait;
const capturedSpawnSync = childProcess.spawnSync;
const { execSync: capturedExecSync } = require('child_process');

const STALL_MS = 200; // twice the limit, as a literal: it must not move with LAG_LIMIT_MS
const JUST_OVER_MS = 120; // a stall just over the limit, which a loosened comparison would let through
const CPU_CLOCK_STEP_MS = 16; // Windows reports thread CPU time in steps of about 15.6 ms
const CHILD_SLEEP = `setTimeout(() => {}, ${STALL_MS})`;

let root;
function bigWorkspace() {
  if (root) return root;
  const rows = [SELF];
  for (let i = 0; i < 5000; i += 1) {
    rows.push(row(`r${i}`, `domain ${i}`, `[D${i}](architecture/D${i}.md)`, 'canonical', { contract: `\`src/m${i}/index.ts\`` }));
  }
  rows.push(row('patho', 'patho', '[P](architecture/P.md)', 'canonical', { contract: '['.repeat(60000) }));
  root = workspace(rows);
  return root;
}

/**
 * Burn main-thread CPU on the event loop for at least `ms`: until the thread's reported CPU time has
 * grown by `ms` plus one clock step (so the true CPU time is at least `ms` however coarse the clock)
 * and at least `ms` of wall-clock time has passed (audit VETO #951, V1).
 */
function burnMainThread(ms) {
  const from = threadCpuMs();
  const start = performance.now();
  while (threadCpuMs() - from < ms + CPU_CLOCK_STEP_MS || performance.now() - start < ms) { /* synchronous work on the event loop */ }
}

/** Measure `calls` describe calls; `plant(i)` runs inside call i before its real read. */
async function bounded({ calls = 5, plant } = {}) {
  const ws = bigWorkspace();
  let stubCalls = 0;
  const git = () => { stubCalls += 1; return { kind: 'ok', stdout: '' }; };
  const opts = (i) => (plant ? { budgetMs: 5000, readIndex: (r, rel) => { plant(i); return affected.readIndexAsync(r, rel); } } : {});
  const m = await measure((i) => affected.describeAffectedArchitecture({ workspaceRoot: ws, git }, ['src/m4999/index.ts', 'src/none.ts'], opts(i)), { calls });
  return { ...m, stubCalls };
}

const expectHeld = (m, why) => assert.ok(!m.responsive, `${why}: the verdict must fail; ${describeTurn(m)}`);

test('#651: the limit is the literal 100 ms, sampled every 10 ms, and the planted stall is twice that', () => {
  assert.equal(LAG_LIMIT_MS, 100);
  assert.equal(SAMPLE_MS, 10);
  assert.equal(STALL_MS, 2 * 100);
  assert.equal(typeof process.threadCpuUsage, 'function', `#651 needs Node 22 or later; this is Node ${process.version}`);
});

test('describe: bounded I/O - no git, no sync fs, no child process; the event loop stays responsive (5,000 rows, a pathological cell)', async (t) => {
  const m = await bounded();
  t.diagnostic(describeTurn(m));
  assert.equal(m.stubCalls, 0, 'the git runner is never called');
  assert.deepEqual(m.blocking, [], 'no sync fs, no child process, no Atomics.wait and no raw binding during describe');
  assert.ok(m.responsive, `event loop held for ${LAG_LIMIT_MS} ms or more in one turn: ${describeTurn(m)}`);
  for (const d of m.results) {
    assert.ok(d.lines.some((l) => l.startsWith('src/m4999/index.ts: r4999 ')), d.lines.join('\n'));
    assert.ok(d.lines.includes('1 registry cell(s) over 4 KiB not checked (cell too long).'), d.lines.join('\n'));
  }
});

test('#651 control: a 200 ms main-thread stall fails, on every call and on one call only', async (t) => {
  const every = await bounded({ calls: 3, plant: () => burnMainThread(STALL_MS) });
  t.diagnostic(`every call: ${describeTurn(every)}`);
  expectHeld(every, 'stall on every call');
  assert.ok(every.worst.held >= STALL_MS, `the stall held the loop for at least ${STALL_MS} ms: ${describeTurn(every)}`);
  assert.ok(every.worst.cpu >= STALL_MS - CPU_CLOCK_STEP_MS, `the stall was main-thread CPU: ${describeTurn(every)}`);
  assert.deepEqual(every.results.map((d) => d.state), ['ok', 'ok', 'ok']);
  for (const only of [0, 2]) {
    const m = await bounded({ plant: (i) => { if (i === only) burnMainThread(STALL_MS); } });
    t.diagnostic(`call ${only + 1} of 5 only: ${describeTurn(m)}`);
    expectHeld(m, `stall on call ${only + 1} of 5 only`);
    assert.ok(m.worst.held >= STALL_MS, `the stall held the loop for at least ${STALL_MS} ms: ${describeTurn(m)}`);
  }
  const near = await bounded({ calls: 2, plant: () => burnMainThread(JUST_OVER_MS) });
  t.diagnostic(`${JUST_OVER_MS} ms on every call: ${describeTurn(near)}`);
  expectHeld(near, `a ${JUST_OVER_MS} ms stall, just over the limit`);
});

test('#651 control: live synchronous fs, Atomics.wait and spawnSync are counted and held', async (t) => {
  const syncFs = await bounded({ calls: 2, plant: () => fs.statSync(bigWorkspace()) });
  assert.deepEqual(syncFs.blocking, [['fs.statSync', 2]]);
  const raw = await bounded({ calls: 1, plant: () => process.binding('spawn_sync') });
  assert.deepEqual(raw.blocking, [['process.binding', 1]], 'a raw native binding is counted');
  const parked = await bounded({ calls: 2, plant: () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, STALL_MS) });
  t.diagnostic(`live Atomics.wait: ${describeTurn(parked)}`);
  assert.deepEqual(parked.blocking, [['Atomics.wait', 2]]);
  expectHeld(parked, 'live Atomics.wait');
  const child = await bounded({ calls: 1, plant: () => childProcess.spawnSync(process.execPath, ['-e', CHILD_SLEEP], { windowsHide: true }) });
  t.diagnostic(`live spawnSync: ${describeTurn(child)}`);
  assert.deepEqual(child.blocking, [['child_process.spawnSync', 1]]);
  expectHeld(child, 'live spawnSync');
});

test('#651 control: captured Atomics.wait, spawnSync and execSync bypass the seams and are still held, not excused', async (t) => {
  const cases = {
    'captured Atomics.wait': () => capturedWait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, STALL_MS),
    'captured spawnSync': () => capturedSpawnSync(process.execPath, ['-e', CHILD_SLEEP], { windowsHide: true }),
    'destructured execSync': () => capturedExecSync(`"${process.execPath}" -e "${CHILD_SLEEP}"`, { windowsHide: true }),
  };
  for (const [name, plant] of Object.entries(cases)) {
    const m = await bounded({ calls: 1, plant });
    t.diagnostic(`${name}: ${describeTurn(m)}`);
    assert.deepEqual(m.blocking, [], `${name} must bypass the seams for this control to mean anything`);
    expectHeld(m, `${name} (off the CPU)`);
  }
});
