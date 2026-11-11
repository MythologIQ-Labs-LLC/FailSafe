'use strict';
// PR #653 mutation set 3. Each entry is [label, mutation]; the label and this text are the definition that was run.
// Usage: npm run compile && node set3.cjs <path to FailSafe/extension>   (restores every file; exits 1 if a mutant survives)
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
  ['M02 preconnect link', sub(H, '<div class="cc-intcat-actions">', '<link rel="preconnect" href="https://statewright.ai"><div class="cc-intcat-actions">')],
  ['M06 ping attribute', sub(H, LINK, LINK.replace('>', ' ping="https://statewright.ai/ping">'))],
  ['M11 extra Connected pill', sub(H, PILL, `${PILL}<span class="cc-intcat-pill cc-intcat-pill-observed">Connected</span>`)],
  ['M12 false copy', sub(H, 'FailSafe does not read', 'Signed in. Official Statewright partner: live run data is synced. FailSafe does not read')],
  ['M16 only when catalog non-empty', sub(R, '      STATEWRIGHT_HANDOFF +\n', "      (integrations.length ? STATEWRIGHT_HANDOFF : '') +\n")],
  ['M17 window.open on render', after("    window.open('https://statewright.ai/runs', '_blank');")],
  ['M18 auto-click after 3 s', after("    setTimeout(() => this.container.querySelector('.cc-intcat-web-link').click(), 3000);")],
  ['M19 Connect account button', sub(H, '<div class="cc-intcat-actions">', '<div class="cc-intcat-actions"><button type="button">Connect account</button>')],
  ['M20 tabindex -1 aria-hidden', sub(H, LINK, LINK.replace('>', ' tabindex="-1" aria-hidden="true">'))],
  ['M21 no handoff while loading', sub(R, 'Loading…</p>${STATEWRIGHT_HANDOFF}</div>', 'Loading…</p></div>')],
  ['A06 query string on the URL', sub(H, "'https://statewright.ai/runs'", "'https://statewright.ai/runs?src=failsafe'")],
  ['A07 visible URL differs from the link', sub(H, '<span class="cc-intcat-web-url">${STATEWRIGHT_RUNS_URL}</span>', '<span class="cc-intcat-web-url">https://statewright.example/runs</span>')],
  ['X09 mousedown rewrites the link', after("    this.container.querySelector('.cc-intcat-web-link').addEventListener('mousedown', (e) => { e.currentTarget.href += '?ws=' + encodeURIComponent(location.search); });")],
  ['X12 WebSocket to the provider', after("    try { new WebSocket('wss://statewright.ai/live?w=' + encodeURIComponent(location.search)); } catch { /* */ }")],
  ['X24 postTask navigation', after("    if (globalThis.scheduler) scheduler.postTask(() => { location.href = 'https://statewright.ai/runs'; }, { delay: 12000 });")],
  ['X26 hover opens the page', after("    this.container.addEventListener('mouseover', () => window.open('https://statewright.ai/runs'), { once: true });")],
  ['X17 Configure click also opens Statewright', sub(R, 'if (settingsTab) settingsTab.click();', "if (settingsTab) settingsTab.click(); window.open('https://statewright.ai/runs');")],
  ['X22 ::after Connected', sub(H, LAST_RULE, `${LAST_RULE}.cc-intcat-statewright .cc-intcat-pill::after { content:" - Connected"; }\n`)],
  ['X21 style hides the disclaimer', sub(H, LAST_RULE, `${LAST_RULE}.cc-intcat-statewright p { display:none; }\n`)],
  ['X29 status line claims connected', sub(R, '<p class="cc-intcat-sub">${esc(sub)}</p>', '<p class="cc-intcat-sub">${esc(sub)} Statewright: connected, run history synced.</p>')],
  ['X30 pill title and aria-label', sub(H, PILL, '<span class="cc-intcat-pill" title="Connected: signed in" aria-label="Connected">Website handoff</span>')],
  ['A01 keydown opens a second page', after("    this.container.addEventListener('keydown', () => window.open('https://statewright.ai/runs?k=1'));")],
  ['A02 queueMicrotask fetch to provider', after("    queueMicrotask(() => { fetch('https://statewright.ai/api/ping').catch(() => {}); });")],
  ['A03 status claim without the name', sub(R, '<p class="cc-intcat-sub">${esc(sub)}</p>', '<p class="cc-intcat-sub">${esc(sub)}</p><p class="cc-intcat-sub">Run history provider: connected.</p>')],
  ['A04 style overlays the link invisibly', sub(H, LAST_RULE, `${LAST_RULE}.cc-intcat-web-link { opacity:0; }\n`)],
  ['A05 handoff module runs code on import', sub(H, 'export const STATEWRIGHT_STYLES', "new Image().src = 'https://statewright.ai/px';\nexport const STATEWRIGHT_STYLES")],
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
