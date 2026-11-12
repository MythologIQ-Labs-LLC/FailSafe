'use strict';
// Probe: worst event-loop turn of the real describeAffectedArchitecture (5,000 rows + pathological cell),
// by wall clock and by main-thread CPU (process.threadCpuUsage). Usage: node probe.cjs <extRoot> <runs>
const fs = require('fs'), os = require('os'), path = require('path');
const ext = path.resolve(process.argv[2]);
const runs = Number(process.argv[3] || 10);
const affected = require(path.join(ext, 'out', 'governance', 'architecture', 'affectedArchitecture.js'));
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const row = (id, domain, link, status, contract) => `| ${id} | ${domain} | ${link} | ${status} | manual | - | - | - | ${contract || 'unknown'} | unknown | manual |`;
const rows = [row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical', '')];
for (let i = 0; i < 5000; i += 1) rows.push(row(`r${i}`, `domain ${i}`, `[D${i}](architecture/D${i}.md)`, 'canonical', `\`src/m${i}/index.ts\``));
rows.push(row('patho', 'patho', '[P](architecture/P.md)', 'canonical', '['.repeat(60000)));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe656-'));
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const text = ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...rows, '', '## Normative scope', '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '', '## Legacy', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');
fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), text);
const tcpu = (since) => { const u = process.threadCpuUsage(since); return (u.user + u.system) / 1000; };
(async () => {
  if (process.env.PRIO) { require('os').setPriority(0, require('os').constants.priority[process.env.PRIO]); console.log('priority', require('os').getPriority(0)); }
  const out = [];
  for (let k = 0; k < runs; k += 1) {
    let wall = 0, cpuAtWall = 0, cpu = 0, last = performance.now(), lastCpu = process.threadCpuUsage();
    const t = setInterval(() => {
      const w = performance.now() - last, c = tcpu(lastCpu);
      if (w > wall) { wall = w; cpuAtWall = c; }
      cpu = Math.max(cpu, c);
      last = performance.now(); lastCpu = process.threadCpuUsage();
    }, 10);
    last = performance.now(); lastCpu = process.threadCpuUsage();
    const d = await affected.describeAffectedArchitecture({ workspaceRoot: root, git: () => ({ kind: 'ok', stdout: '' }) }, ['src/m4999/index.ts']);
    await new Promise((r) => setTimeout(r, 30));
    clearInterval(t);
    out.push({ wall: +wall.toFixed(1), threadCpuInWorstWallTurn: +cpuAtWall.toFixed(1), worstThreadCpuTurn: +cpu.toFixed(1), state: d.state });
  }
  console.log(JSON.stringify(out));
  fs.rmSync(root, { recursive: true, force: true });
})();
