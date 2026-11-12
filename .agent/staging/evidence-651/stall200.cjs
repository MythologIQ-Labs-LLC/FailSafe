const t = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
function burn(ms) { const f = t(), s = performance.now(); while (t() - f < ms + 16 || performance.now() - s < ms) {} }
const w = [], c = [];
for (let i = 0; i < 100; i += 1) {
  const e = performance.now() + Math.random() * 20; while (performance.now() < e) {} // random clock phase
  const s = performance.now(), cs = t(); burn(200); w.push(performance.now() - s); c.push(t() - cs);
}
w.sort((a, b) => a - b); c.sort((a, b) => a - b);
console.log(JSON.stringify({ wallMin: w[0].toFixed(1), wallMedian: w[50].toFixed(1), wallMax: w[99].toFixed(1), under200: w.filter((x) => x < 200).length, reportedCpuMin: c[0].toFixed(1) }));
