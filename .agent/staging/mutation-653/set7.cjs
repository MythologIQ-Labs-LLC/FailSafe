'use strict';
// PR #653 mutation set 7. Each entry is [label, mutation]; the label and this text are the definition that was run.
// Usage: npm run compile && node set7.cjs <path to FailSafe/extension>   (restores every file; exits 1 if a mutant survives)
// Network: every test process runs under no-network.cjs (loopback only); the Playwright spec also maps the provider host to 127.0.0.1.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ext = path.resolve(process.argv[2]);
const H = path.join(ext, 'src/roadmap/ui/modules/statewright-handoff.js');
const R = path.join(ext, 'src/roadmap/ui/modules/integration-catalog-renderer.js');
const orig = { [H]: fs.readFileSync(H, 'utf8'), [R]: fs.readFileSync(R, 'utf8') };
const sub = (file, f0, t0) => () => {
  const s = orig[file];
  const eol = (x) => (s.includes('\r\n') ? x.replace(/\n/g, '\r\n') : x);
  if (!s.includes(eol(f0))) throw new Error(`anchor missing: ${f0}`);
  fs.writeFileSync(file, s.replace(eol(f0), eol(t0)));
};
const LINK = '<a class="cc-intcat-web-link" href="${STATEWRIGHT_RUNS_URL}" target="_blank" rel="noopener noreferrer">';
const WIRE = '    this.wire();\n  }';
const after = (code) => sub(R, WIRE, `    this.wire();\n${code}\n  }`);
const PILL = '<span class="cc-intcat-pill">Website handoff</span>';
const LAST_RULE = '.cc-intcat-web-url { color:#7f8aa0; font-size:.8rem; user-select:all; }\n';
const RSTYLE = '.cc-intcat { display:flex; flex-direction:column; gap:12px; }' + String.fromCharCode(10);
const M = [
  ['V14 action row positioned outside the card (in the style sheet)', sub(R, RSTYLE, `${RSTYLE}.cc-intcat-actions { position:absolute; top:60px; }\n`)],
  ['W02 the same rule in a second constant, style sheet untouched', sub(R, 'el.textContent = STYLE + STATEWRIGHT_STYLES;', "el.textContent = STYLE + STATEWRIGHT_STYLES + '.cc-intcat-actions { position:absolute; top:60px; }';")],
  ['W01 wide-screen clamp in a second constant, style sheet untouched', sub(R, 'el.textContent = STYLE + STATEWRIGHT_STYLES;', "el.textContent = STYLE + STATEWRIGHT_STYLES + '@media (min-width:1400px) { .cc-intcat p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; max-width:60ch; } }';")],
  ['W03 a second style element with a hiding rule', sub(R, '    document.head.appendChild(el);', "    document.head.appendChild(el);\n    const extra = document.createElement('style'); extra.textContent = '.cc-intcat-statewright p { visibility:hidden; }'; document.head.appendChild(extra);")],
  ['V16 card height cap 120px, overflow hidden', sub(R, RSTYLE, `${RSTYLE}.cc-intcat > * { max-height:120px; overflow:hidden; }\n`)],
  ['X12w WebSocket to the provider through the jsdom window (audit #945)', sub(R, '    this.wire();\n  }', "    this.wire();\n    try { new window.WebSocket('wss://statewright.ai/live?w=' + encodeURIComponent(window.location.search)); } catch { /* */ }\n  }")],
  ['X12x XMLHttpRequest to the provider through the jsdom window', sub(R, '    this.wire();\n  }', "    this.wire();\n    try { const x = new window.XMLHttpRequest(); x.open('GET', 'https://statewright.ai/p?w=' + encodeURIComponent(window.location.search)); x.send(); } catch { /* */ }\n  }")],
  ['E01 wide-screen clamp appended to the style element text', sub(R, 'el.textContent = STYLE + STATEWRIGHT_STYLES;', "el.textContent = STYLE + STATEWRIGHT_STYLES; el.textContent += '@media (min-width:1400px) { .cc-intcat p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; } }';")],
  ['E02 wide-screen clamp appended to the style element as a node', sub(R, 'el.textContent = STYLE + STATEWRIGHT_STYLES;', "el.textContent = STYLE + STATEWRIGHT_STYLES; el.append('@media (min-width:1400px) { .cc-intcat p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; } }');")],
  ['X12 WebSocket to the provider on render', sub(R, '    this.wire();\n  }', "    this.wire();\n    try { new WebSocket('wss://statewright.ai/live?w=' + encodeURIComponent(location.search)); } catch { /* */ }\n  }")],
];
const restore = () => { for (const [f, s] of Object.entries(orig)) fs.writeFileSync(f, s); };
// Every test process runs under no-network.cjs (audit VETO #945): only loopback connections are allowed, and each
// refused attempt is counted, so the table shows whether a mutant tried to reach another host.
const GUARD = path.join(__dirname, 'no-network.cjs');
const NETLOG = path.join(require('os').tmpdir(), `no-network-${process.pid}.log`);
const guarded = { ...process.env, NO_NETWORK_LOG: NETLOG, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${GUARD.split(path.sep).join('/')}`.trim() };
const sh = (cmd) => spawnSync(cmd, { cwd: ext, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: guarded });
const run = () => {
  sh('node ./scripts/copy-ui-js.cjs');
  fs.rmSync(NETLOG, { force: true });
  const src = sh('npx mocha --ui tdd --timeout 15000 out/test/roadmap/statewright-handoff-source.test.js');
  const j = sh('npx mocha --ui tdd --timeout 15000 out/test/roadmap/statewright-handoff.test.js out/test/roadmap/integration-catalog-renderer.test.js');
  const p = sh('npx playwright test src/test/ui/statewright-handoff.spec.ts');
  const refused = fs.existsSync(NETLOG) ? fs.readFileSync(NETLOG, 'utf8').split('\n').filter(Boolean).length : 0;
  return { source: src.status === 0 ? 'pass' : 'FAIL', jsdom: j.status === 0 ? 'pass' : 'FAIL', playwright: p.status === 0 ? 'pass' : 'FAIL', refused };
};
let survived = 0;
try {
  const base = run();
  console.log('baseline', JSON.stringify(base));
  if (base.source !== 'pass' || base.jsdom !== 'pass' || base.playwright !== 'pass' || base.refused !== 0) throw new Error('baseline is not green');
  for (const [name, apply] of M) {
    restore(); apply();
    const r = run();
    const killed = r.source === 'FAIL' || r.jsdom === 'FAIL' || r.playwright === 'FAIL';
    if (!killed) survived += 1;
    console.log(`${name} | source ${r.source} | jsdom ${r.jsdom} | playwright ${r.playwright} | network attempts refused ${r.refused} | ${killed ? 'killed' : 'SURVIVED'}`);
  }
} finally { restore(); sh('node ./scripts/copy-ui-js.cjs'); }
process.exit(survived ? 1 : 0);
