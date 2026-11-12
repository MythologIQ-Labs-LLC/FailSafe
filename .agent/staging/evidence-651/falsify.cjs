'use strict';
// #651 falsification: plant a violation at the top of the compiled describeAffectedArchitecture
// (and, for captured references, at module load), run the bounded-I/O main test N times, restore.
// Usage: node falsify.cjs <extDir> <runs> [variant ...]   Writes one JSON line per variant.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ext = path.resolve(process.argv[2]);
const runs = Number(process.argv[3] || 3);
const F = path.join(ext, 'out', 'governance', 'architecture', 'affectedArchitecture.js');
const TEST = path.join('src', 'test', 'governance', 'architecture', 'ArchitectureLinks.boundedIo.test.cjs');
const orig = fs.readFileSync(F, 'utf8');
const HEAD = 'async function describeAffectedArchitecture(ctx, paths, opts = {}) {';
const cpu = (ms) => `{ const __u = () => { const x = process.threadCpuUsage(); return (x.user + x.system) / 1000; }; const __f = __u(); while (__u() - __f < ${ms}) {} }`;
const sleepChild = 'setTimeout(()=>{},150)';
const V = {
  none: { load: '', body: '' },
  cpu150_always: { load: '', body: cpu(150) },
  cpu150_first: { load: 'let __n = 0;', body: `if (__n++ === 0) ${cpu(150)}` },
  cpu150_every5th: { load: 'let __n = 0;', body: `if (__n++ % 5 === 4) ${cpu(150)}` },
  cpu150_alternate: { load: 'let __n = 0;', body: `if (__n++ % 2 === 1) ${cpu(150)}` },
  cpu150_random50: { load: '', body: `if (Math.random() < 0.5) ${cpu(150)}` },
  cpu105: { load: '', body: cpu(105) },
  spawnSync_captured: { load: 'const __sp = require("child_process").spawnSync;', body: `__sp(process.execPath, ["-e", "${sleepChild}"], { windowsHide: true });` },
  execSync_destructured: { load: 'const { execSync: __ex } = require("node:child_process");', body: `__ex('"' + process.execPath + '" -e "${sleepChild}"', { windowsHide: true });` },
  atomics_captured: { load: 'const __w = Atomics.wait;', body: '__w(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);' },
  atomics_bound: { load: 'const __w = Atomics.wait.bind(Atomics);', body: '__w(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);' },
  binding_spawn_sync: { load: '', body: `try { process.binding("spawn_sync").spawn({ file: process.execPath, args: [process.execPath, "-e", "${sleepChild}"], stdio: [{ type: "pipe", readable: true }, { type: "pipe", writable: true }, { type: "pipe", writable: true }], envPairs: [], windowsHide: true }); } catch (e) { /* binding shape */ }` },
  statSync_live: { load: '', body: 'fs.statSync(ctx.workspaceRoot);' },
  readFileSync_destructured: { load: 'const { readFileSync: __rf } = require("fs");', body: '__rf(__filename);' },
  threadpool_async: { load: '', body: 'require("crypto").pbkdf2(\'x\', \'y\', 200000, 32, \'sha256\', () => {});' },
};
const names = process.argv.slice(4).length ? process.argv.slice(4) : Object.keys(V);

/** Plant one variant, run the main test `runs` times, and return its pass and fail counts. */
function runVariant(name) {
  const v = V[name];
  if (!orig.includes(HEAD)) throw new Error('anchor missing');
  fs.writeFileSync(F, orig.replace(HEAD, `${v.load}\n${HEAD}\n${v.body}`));
  let pass = 0, fail = 0;
  const msgs = [];
  for (let k = 0; k < runs; k += 1) {
    const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=bounded I/O - no git', TEST], { cwd: ext, encoding: 'utf8' });
    if (r.status === 0) pass += 1;
    else { fail += 1; msgs.push(firstReason(r)); }
    const diag = /# (wall-clock[^\n]*)/.exec(r.stdout);
    if (diag && k === 0) msgs.unshift('diag: ' + diag[1].slice(0, 150));
  }
  return { name, pass, fail, msgs: msgs.slice(0, 3) };
}

function firstReason(r) {
  const m = /(?:event loop held|blocking|git runner|AssertionError)[^\n]{0,180}/.exec(r.stdout + r.stderr);
  return m ? m[0] : 'exit ' + r.status;
}

try {
  for (const name of names) console.log(JSON.stringify(runVariant(name)));
} finally { fs.writeFileSync(F, orig); }
