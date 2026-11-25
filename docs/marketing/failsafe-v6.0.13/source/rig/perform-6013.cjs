// The recorded v6.0.13 Statewright take. Every step is an ordinary user action performed by script against the real,
// Marketplace-installed FailSafe 6.0.13: VS Code's Command Palette (typed through CDP key/text input), and trusted
// CDP mouse input on FailSafe's own Console controls. Nothing on screen is staged or injected. The Statewright page is
// whatever statewright.ai serves to a fresh, signed-out, disposable Chrome profile; it is never typed into or clicked.
//   node perform-6013.cjs <outDir>
// Writes vscode.mkv, chrome.mkv (whole Chrome window) and events.json (capture clock, pointer path in page CSS px).
const L = require('./lib.cjs'); const C = require('./capture.cjs'); const { stageChrome } = require('./stage.cjs');
const OUT = process.argv[2]; L.fs.mkdirSync(OUT, { recursive: true });
const hold = L.sleep; const mark = L.mark;
const pointer = []; // {t, x, y, down} in Console page CSS px
let cur = { x: 760, y: 560 };

async function typeInWorkbench(text, perChar = 70) {
  const tg = await L.target(L.T.page); const s = await L.session(tg.webSocketDebuggerUrl);
  try { for (const ch of text) { await s.send('Input.insertText', { text: ch }); await hold(perChar + Math.round(Math.random() * 40)); } } finally { s.close(); }
}
const quickPick = () => L.evalIn(L.T.page, `(() => { const q = document.querySelector('.quick-input-widget'); if (!q || q.style.display === 'none') return null;
  const f = q.querySelector('.monaco-list-row.focused'); return { input: q.querySelector('input')?.value, focused: f ? f.innerText.replace(/\\s+/g, ' ').trim() : null }; })()`);

async function moveTo(pg, x, y, ms = 700) {
  const n = Math.max(8, Math.round(ms / 25)); const a = { ...cur };
  for (let i = 1; i <= n; i++) {
    const k = i / n; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const p = { x: a.x + (x - a.x) * e, y: a.y + (y - a.y) * e };
    await pg.mouse.move(p.x, p.y); pointer.push({ t: +((Date.now() - T0) / 1000).toFixed(3), x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
    await hold(ms / n);
  }
  cur = { x, y };
}
async function click(pg, what) {
  const t = () => +((Date.now() - T0) / 1000).toFixed(3);
  await pg.mouse.down(); pointer.push({ t: t(), ...cur, down: true }); mark('click.down', { what, ...cur });
  await hold(110); await pg.mouse.up(); pointer.push({ t: t(), ...cur, down: false });
}
const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
let T0;

(async () => {
  C.hwnd('*tasklet*Visual Studio Code*', 'Code', { x: 3432, y: 0, w: 1936, h: 1088 });
  await L.exec('notifications.clearAll'); await L.exec('workbench.action.closeAllEditors'); await L.exec('workbench.view.explorer');
  await hold(1500);
  T0 = Date.now(); L.resetClock(); const t0us = T0 * 1000;
  const capV = C.start(OUT, t0us, ['vscode']);
  await hold(800); await L.mouse([{ type: 'mouseMoved', x: 900, y: 500 }]); await hold(100); await L.mouse([{ type: 'mouseMoved', x: 905, y: 505 }]);
  mark('take.start');
  await hold(2500);
  // FailSafe in VS Code: its activity-bar view (Monitor)
  await L.exec('failsafe.openSidebar'); mark('vscode.failsafeView'); await hold(3500);
  // Command Palette: FailSafe: Open Console (Browser Popout)
  await L.exec('workbench.action.showCommands'); mark('vscode.palette'); await hold(900);
  await typeInWorkbench('FailSafe: Open Console'); await hold(500);
  const qp = await quickPick(); mark('vscode.palette.typed', qp); await hold(1600);
  await L.key('Enter'); mark('vscode.palette.enter');
  // VS Code opens the Console in the external browser (workbench.externalBrowser -> isolated Chrome)
  const c = await L.chrome(); const pg = c.pg; mark('chrome.consolePage', { url: pg.url().replace(/workspace=[^&]+/, 'workspace=<demo>').replace(/fsThemeKey=[^&]+/, 'fsThemeKey=<redacted>') });
  await pg.waitForLoadState('load').catch(() => {});
  const st = await stageChrome(pg); mark('chrome.staged', { rect: st.console.rect, cropTop: st.console.cropTop });
  const capC = C.start(OUT, t0us, ['console']);
  await pg.mouse.move(cur.x, cur.y); await hold(300); await pg.mouse.move(cur.x + 2, cur.y + 2); cur = { x: cur.x + 2, y: cur.y + 2 };
  mark('chrome.capture.start');
  await hold(2500); mark('console.overview'); await hold(1500);
  // Integrations tab
  const tabI = pg.locator('.tab-btn[data-target="integrations"]'); let p = await center(tabI);
  await moveTo(pg, p.x, p.y, 900); await hold(350); await click(pg, 'Integrations'); mark('console.integrations'); await hold(1800);
  // Catalog sub-tab
  const pillC = pg.locator('#integrations .cc-pill[data-key="catalog"]'); p = await center(pillC);
  await moveTo(pg, p.x, p.y, 700); await hold(300); await click(pg, 'Catalog'); mark('console.catalog'); await hold(1500);
  // Statewright AI card: heading, then the Website handoff pill
  const card = pg.locator('section[data-id="statewright"]'); await card.scrollIntoViewIfNeeded();
  const head = await center(card.locator('.cc-intcat-head strong')); await moveTo(pg, head.x, head.y + 2, 800); mark('console.card', { text: (await card.innerText()).replace(/\s+/g, ' ') }); await hold(1500);
  const pill = await center(card.locator('.cc-intcat-pill')); await moveTo(pg, pill.x, pill.y, 600); mark('console.card.pill', { label: await card.locator('.cc-intcat-pill').innerText() }); await hold(2000);
  // Open Statewright Run History: hover, hold, real click
  const link = card.locator('a.cc-intcat-web-link'); p = await center(link);
  await moveTo(pg, p.x, p.y, 900); mark('console.link.hover', { label: await link.innerText(), href: await link.getAttribute('href') }); await hold(2600);
  const popup = pg.context().waitForEvent('page', { timeout: 20000 });
  await click(pg, 'Open Statewright Run History'); mark('console.link.click');
  const sw = await popup; mark('chrome.newTab', { url: sw.url() });
  await sw.waitForLoadState('load').catch(() => {}); mark('statewright.load', { url: sw.url() });
  await hold(4000);
  // page text is not logged (it can contain the account name); only whether the honest empty state / sign-in page shows
  mark('statewright.state', { url: sw.url(), title: await sw.title(), emptyState: await sw.evaluate(() => /No workflow runs yet/.test(document.body.innerText)), signInPage: /\/login/.test(sw.url()) });
  await hold(14000); mark('take.end');
  // stop: ffmpeg only sees 'q' on the next frame; repaint each window (after the end of the take)
  const okC = await capC.stop(async (i) => { await sw.mouse.move(80 + (i % 2) * 6, 700 + (i % 2) * 6); }); // empty margin, never the header or account menu
  const okV = await capV.stop(async (i) => { await L.mouse([{ type: 'mouseMoved', x: 30, y: 120 + (i % 2) * 54 }]); });
  L.fs.writeFileSync(OUT + '/events.json', JSON.stringify({ t0: new Date(T0).toISOString(), clean: { vscode: okV, chrome: okC }, stage: st, quickPick: qp, events: L.events, pointer }, null, 1));
  console.log('done', okV, okC);
  await c.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
