'use strict';
// PR #653 mutation set 5. Each entry is [label, mutation]; the label and this text are the definition that was run.
// Usage: npm run compile && node set5.cjs <path to FailSafe/extension>   (restores every file; exits 1 if a mutant survives)
// The suites cannot reach the real provider: the jsdom harness stubs sockets and fetch, and the Playwright spec maps the provider host to 127.0.0.1.
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
  ['Z02 shared rule clamps paragraphs to one line', sub(R, RSTYLE, `${RSTYLE}.cc-intcat p { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }\n`)],
  ['Z03 shared rule caps paragraph height', sub(R, RSTYLE, `${RSTYLE}.cc-intcat p { max-height:1.3em; overflow:hidden; }\n`)],
  ['Z35 shared rule clamps paragraphs to two lines', sub(R, RSTYLE, `${RSTYLE}.cc-intcat p { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }\n`)],
  ['Z09 light colour-scheme repair lightens the card only', sub(R, RSTYLE, `${RSTYLE}@media (prefers-color-scheme: light) { .cc-intcat-card, .cc-intcat section { background:#f8fafc; } .cc-intcat-card { color:#0f172a; } }\n`)],
  ['Z34 light theme repair lightens the card only', sub(R, RSTYLE, `${RSTYLE}[data-theme="pegasus"] .cc-intcat-card, [data-theme="pegasus"] .cc-intcat section { background:#f8fafc; } [data-theme="pegasus"] .cc-intcat-card { color:#0f172a; }\n`)],
  ['Z14 shared rule truncates the address', sub(R, RSTYLE, `${RSTYLE}.cc-intcat-actions span { display:inline-block; max-width:8ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }\n`)],
  ['A08 shared rule makes paragraph text translucent', sub(R, RSTYLE, `${RSTYLE}.cc-intcat p { color:rgba(169,184,203,.15); }\n`)],
  ['Y48 hub event sets the pill to Connected', sub(R, '  onEvent() {}', "  onEvent() { const p = document.querySelector('.cc-intcat-statewright .cc-intcat-pill'); if (p) p.textContent = 'Connected'; }")],
  ['Y16 renderer style hides the disclaimer', sub(R, RSTYLE, `${RSTYLE}.cc-intcat section p { opacity:0; }\n`)],
  ['Y06 Configure click activates the Statewright link', sub(R, 'if (settingsTab) settingsTab.click();', "if (settingsTab) settingsTab.click(); document.querySelector('.cc-intcat-web-link').click();")],
];
const sh = (cmd) => spawnSync(cmd, { cwd: ext, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const restore = () => { for (const [f, s] of Object.entries(orig)) fs.writeFileSync(f, s); };
const run = () => {
  sh('node ./scripts/copy-ui-js.cjs');
  const src = sh('npx mocha --ui tdd --timeout 15000 out/test/roadmap/statewright-handoff-source.test.js');
  const j = sh('npx mocha --ui tdd --timeout 15000 out/test/roadmap/statewright-handoff.test.js out/test/roadmap/integration-catalog-renderer.test.js');
  const p = sh('npx playwright test src/test/ui/statewright-handoff.spec.ts');
  return { source: src.status === 0 ? 'pass' : 'FAIL', jsdom: j.status === 0 ? 'pass' : 'FAIL', playwright: p.status === 0 ? 'pass' : 'FAIL' };
};
let survived = 0;
try {
  const base = run();
  console.log('baseline', JSON.stringify(base));
  if (base.source !== 'pass' || base.jsdom !== 'pass' || base.playwright !== 'pass') throw new Error('baseline is not green');
  for (const [name, apply] of M) {
    restore(); apply();
    const r = run();
    const killed = r.source === 'FAIL' || r.jsdom === 'FAIL' || r.playwright === 'FAIL';
    if (!killed) survived += 1;
    console.log(`${name} | source ${r.source} | jsdom ${r.jsdom} | playwright ${r.playwright} | ${killed ? 'killed' : 'SURVIVED'}`);
  }
} finally { restore(); sh('node ./scripts/copy-ui-js.cjs'); }
process.exit(survived ? 1 : 0);
