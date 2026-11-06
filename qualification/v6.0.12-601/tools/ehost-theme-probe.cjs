// #601 qualification: drive a real VS Code extension host over CDP and record Console/Monitor theme state.
// Usage: node ehost-theme-probe.cjs <extensionDevPath> <outJson> [--keep-profile DIR]
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ext = path.resolve(process.argv[2]); const out = process.argv[3];
const pw = require(path.join(ext, 'node_modules', 'playwright-core'));
const CODE = process.env.FS_CODE || 'C:/dev/mythologiq/FailSafe-6012-qual/vscode-test/vscode-win32-x64-archive-insiders/Code - Insiders.exe';
const keep = process.argv.indexOf('--keep-profile'); 
const root = keep > 0 ? process.argv[keep + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'fs601-ehost-'));
for (const d of ['home', 'ud', 'exts', 'ws']) fs.mkdirSync(path.join(root, d), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = []; const note = (k, v) => { log.push({ at: new Date().toISOString(), k, v }); console.log(k, JSON.stringify(v)); };
async function launch(port) {
  const env = { ...process.env, USERPROFILE: path.join(root, 'home'), HOME: path.join(root, 'home') };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_IPC_HOOK_CLI;
  const p = spawn(CODE, [`--remote-debugging-port=${port}`, `--user-data-dir=${path.join(root, 'ud')}`, `--extensions-dir=${path.join(root, 'exts')}`,
    `--extensionDevelopmentPath=${ext}`, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-telemetry', '--new-window', path.join(root, 'ws')], { env, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { return { p, b: await pw.chromium.connectOverCDP(`http://127.0.0.1:${port}`) }; } catch { await sleep(1000); } }
  throw new Error('no CDP');
}
async function workbench(b) {
  for (let i = 0; i < 240; i++) { for (const c of b.contexts()) for (const pg of c.pages()) if (pg.url().includes('workbench')) return pg; await sleep(500); }
  throw new Error('no workbench');
}
async function runCommand(pg, label) {
  await pg.keyboard.press('F1'); await sleep(600); await pg.keyboard.type('>' === label[0] ? label.slice(1) : label); await sleep(900); await pg.keyboard.press('Enter'); await sleep(1500);
}
function frames(pg) { return pg.frames().map((f) => f.url()); }
async function findFrame(pg, pred, ms = 40000) {
  const t = Date.now(); while (Date.now() - t < ms) { const f = pg.frames().find((fr) => pred(fr.url())); if (f) return f; await sleep(500); } return null;
}
async function frameState(f) {
  return f.evaluate(() => ({ url: location.href, dataTheme: document.documentElement.getAttribute('data-theme'),
    lsTheme: (() => { try { return localStorage.getItem('fs-theme'); } catch (e) { return 'ERR:' + e.name; } })(),
    themeTokensLinked: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')),
    bg: getComputedStyle(document.body).backgroundColor }));
}
(async () => {
  const { p, b } = await launch(9333);
  try {
    const pg = await workbench(b); await sleep(4000);
    await runCommand(pg, 'View: Show FailSafe');
    let mon = await findFrame(pg, (u) => u.includes(':9376/?ui=compact'));
    if (!mon) { await runCommand(pg, 'FailSafe Monitor: Focus on FailSafe Monitor View'); mon = await findFrame(pg, (u) => u.includes(':9376/?ui=compact')); }
    note('frames', frames(pg));
    if (!mon) { await sleep(20000); mon = await findFrame(pg, (u) => u.includes(':9376/?ui=compact'), 5000); }
    note('cdp.targets', await (await fetch('http://127.0.0.1:9333/json')).json().then((a) => a.map((t) => t.type + ' ' + t.url.slice(0, 120))));
    note('frames2', frames(pg));
    for (const fr of pg.frames().slice(1)) note('webview.iframes', await fr.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => ({ id: f.id, name: f.name, src: f.src }))).catch((e) => String(e)));
    note('console.http', await fetch('http://127.0.0.1:9376/?ui=compact').then((r) => r.status).catch((e) => String(e.cause || e)));
    if (!mon) throw new Error('Monitor iframe not found');
    await sleep(3000);
    note('monitor.initial', await frameState(mon));
    const chrome = mon.parentFrame(); note('chrome.url', chrome && chrome.url());
    note('chrome.initial', chrome && await chrome.evaluate(() => document.documentElement.getAttribute('data-theme')));
    // Same Electron browser, Console opened as a top-level page is not possible here; open the in-editor Console (Simple Browser) instead.
    await mon.evaluate(() => localStorage.setItem('fs-theme', 'crimson')).catch((e) => note('monitor.setls.err', String(e)));
    note('monitor.afterLsWrite', await frameState(mon));
    await runCommand(pg, 'FailSafe: Open Console (Editor Tab)');
    const sb = await findFrame(pg, (u) => u.includes(':9376/') && u.includes('ui=compact') && u !== mon.url(), 15000);
    note('simpleBrowser.frame', sb ? await frameState(sb) : null);
    // External browser: a separate Chromium profile, as vscode.env.openExternal would use.
    const ext2 = await pw.chromium.launch({ headless: true }); const xp = await ext2.newPage();
    await xp.goto('http://localhost:9376/?ui=console'); await sleep(2500);
    note('external.initial', await frameState(xp.mainFrame()));
    await xp.locator('.tab-btn[data-target="settings"]').click(); await xp.locator('.cc-theme-select[data-theme="aurora"]').first().click(); await sleep(1500);
    note('external.afterAurora', await frameState(xp.mainFrame()));
    note('monitor.afterExternalAurora', await frameState(mon));
    note('chrome.afterExternalAurora', chrome && await chrome.evaluate(() => document.documentElement.getAttribute('data-theme')));
    await ext2.close();
  } catch (e) { note('error', String(e && e.stack || e)); }
  fs.writeFileSync(out, JSON.stringify({ root, log }, null, 2));
  try { await b.close(); } catch {} p.kill(); setTimeout(() => process.exit(0), 3000);
})();
