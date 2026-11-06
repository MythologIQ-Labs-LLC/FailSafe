// #601 installed/extension-host acceptance: drive a real VS Code over CDP with an isolated profile.
// Usage: node ehost-601-acceptance.cjs <extensionDevPath> <outDir>
// Environment: FS_CODE = VS Code executable (default: the Insiders test build in the qual folder).
//
// Nothing here touches the real profile or opens the user's browser: HOME/USERPROFILE, user data and
// extensions are disposable, and workbench.externalBrowser points at a recorder script so the
// Console URL VS Code would open externally is captured and opened in a separate Chromium instead.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ext = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
fs.mkdirSync(outDir, { recursive: true });
const pw = require(path.join(ext, 'node_modules', 'playwright-core'));
const CODE = process.env.FS_CODE || 'C:/dev/mythologiq/FailSafe-6012-qual/vscode-test/vscode-win32-x64-archive-insiders/Code - Insiders.exe';
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fs601-accept-')));
for (const d of ['home', 'ud/User', 'exts', 'ws']) fs.mkdirSync(path.join(root, d), { recursive: true });
const urlLog = path.join(root, 'external-urls.txt');
const recorder = path.join(root, 'record-url.cmd');
fs.writeFileSync(recorder, `@echo %*>> "${urlLog}"\r\n`);
const settingsPath = path.join(root, 'ud', 'User', 'settings.json');
const writeSettings = (obj) => fs.writeFileSync(settingsPath, JSON.stringify(obj, null, 2));
const baseSettings = { 'workbench.externalBrowser': recorder, 'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none', 'update.mode': 'none' };
writeSettings(baseSettings);
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return null; } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const log = [];
const note = (k, v) => { log.push({ at: new Date().toISOString(), k, v }); console.log(k, JSON.stringify(v).slice(0, 400)); };
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)); };

// Installed mode: FS_INSTALL_VSIX=<path> installs that VSIX into the disposable extensions folder and
// runs VS Code without --extensionDevelopmentPath, i.e. the packaged extension as a user gets it.
const VSIX = process.env.FS_INSTALL_VSIX || '';
if (VSIX) {
  const cli = path.join(path.dirname(CODE), 'bin', path.basename(CODE).includes('Insiders') ? 'code-insiders.cmd' : 'code.cmd');
  const env = { ...process.env, USERPROFILE: path.join(root, 'home'), HOME: path.join(root, 'home') };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_IPC_HOOK_CLI;
  const r = require('child_process').spawnSync(cli, ['--install-extension', VSIX, `--extensions-dir=${path.join(root, 'exts')}`, `--user-data-dir=${path.join(root, 'ud')}`, '--force'],
    { env, encoding: 'utf8', shell: true });
  console.log('install', r.status, (r.stdout || '').trim().split(String.fromCharCode(10)).slice(-2).join(' | '), (r.stderr || '').trim().slice(0, 300));
  if (r.status !== 0) process.exit(2);
}

let proc = null; let browser = null;
async function launch() {
  const env = { ...process.env, USERPROFILE: path.join(root, 'home'), HOME: path.join(root, 'home') };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_IPC_HOOK_CLI;
  proc = spawn(CODE, ['--remote-debugging-port=9335', `--user-data-dir=${path.join(root, 'ud')}`, `--extensions-dir=${path.join(root, 'exts')}`,
    ...(VSIX ? [] : [`--extensionDevelopmentPath=${ext}`]), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window', path.join(root, 'ws')], { env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) { try { browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9335'); break; } catch { await sleep(1000); } }
  if (!browser) throw new Error('no CDP');
  for (let i = 0; i < 240; i++) { for (const c of browser.contexts()) for (const pg of c.pages()) if (pg.url().includes('workbench')) return pg; await sleep(500); }
  throw new Error('no workbench');
}
async function shutdown() {
  try { await browser?.close(); } catch { /* ignore */ }
  try { proc?.kill(); } catch { /* ignore */ }
  for (let i = 0; i < 40; i++) {
    try { await fetch('http://127.0.0.1:9335/json/version'); await sleep(500); } catch { break; }
  }
  await sleep(2000);
}
async function palette(pg, text) {
  await pg.keyboard.press('Escape'); await pg.keyboard.press('F1'); await sleep(700);
  await pg.keyboard.type(text); await sleep(1200); await pg.keyboard.press('Enter'); await sleep(2000);
}
async function findFrame(pg, pred, ms = 45000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const f = pg.frames().find((fr) => { try { return pred(fr.url()); } catch { return false; } }); if (f) return f; await sleep(500); }
  return null;
}
const isMonitor = (u) => /:9376\/\?ui=compact/.test(u);
const isSre = (u) => /:9376\/console\/sre/.test(u);
const theme = (f) => f.evaluate(() => document.documentElement.getAttribute('data-theme'));
async function sidebar(pg) {
  await palette(pg, 'View: Show FailSafe');
  let mon = await findFrame(pg, isMonitor, 30000);
  if (!mon) { await palette(pg, 'FailSafe Monitor: Focus on FailSafe Monitor View'); mon = await findFrame(pg, isMonitor); }
  if (!mon) throw new Error('Monitor iframe not found');
  await mon.waitForFunction(() => document.documentElement.getAttribute('data-theme') !== null, null, { timeout: 30000 });
  return { mon, chrome: mon.parentFrame() };
}
async function poll(fn, want, ms = 15000) {
  const t = Date.now(); let v;
  while (Date.now() - t < ms) { try { v = await fn(); } catch (e) { v = `ERR ${e.message}`; } if (v === want) return v; await sleep(300); }
  return v;
}
async function shot(pg, name) { try { await pg.screenshot({ path: path.join(outDir, `${name}.png`) }); } catch (e) { note('shot.err', String(e)); } }

(async () => {
  let ext2 = null;
  try {
    // ---------------------------------------------------------------- first launch
    let pg = await launch(); await sleep(5000);
    let { mon, chrome } = await sidebar(pg);
    check('fresh profile: chrome and Monitor both start on the default theme',
      (await theme(chrome)) === 'mythiq' && (await theme(mon)) === 'mythiq', { chrome: await theme(chrome), monitor: await theme(mon) });
    check('Monitor loads the shared theme script and tokens',
      await mon.evaluate(() => !!document.querySelector('script[src="/api/v1/ui/theme.js"]') && !!document.querySelector('link[href="/theme-tokens.css"]')), null);
    await shot(pg, '01-default-mythiq');

    // ---------------------------------------------------------------- external Console via the real openExternal path
    await palette(pg, 'FailSafe: Open Console (Browser Popout)');
    let consoleUrl = null;
    for (let i = 0; i < 30 && !consoleUrl; i++) { await sleep(500); if (fs.existsSync(urlLog)) consoleUrl = (fs.readFileSync(urlLog, 'utf8').match(/http:\/\/\S+/) || [null])[0]; }
    check('VS Code opened the Console externally with a theme key', !!consoleUrl && /[?&]fsThemeKey=/.test(consoleUrl), consoleUrl && consoleUrl.replace(/fsThemeKey=[^&#]+/, 'fsThemeKey=<redacted>'));
    if (!consoleUrl) throw new Error('external Console URL not captured');
    ext2 = await pw.chromium.launch({ headless: true });
    const xp = await (await ext2.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await xp.goto(consoleUrl.replace(/"/g, ''));
    check('external Console: key removed from the address bar', !/fsThemeKey/.test(xp.url()), null);
    await xp.locator('.tab-btn[data-target="settings"]').click();

    // ---------------------------------------------------------------- installed-host security probes
    if (process.env.FS_SECURITY_DIR) {
      const sec = process.env.FS_SECURITY_DIR; fs.mkdirSync(sec, { recursive: true });
      const runNode = (args, out) => { const r = require('child_process').spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000 }); fs.writeFileSync(path.join(sec, out), (r.stdout || '') + (r.stderr || '')); return r.status; };
      note('security.probe.127', runNode([path.join(ext, 'scripts', 'probe-console-websocket-rc.cjs'), '--port', '9376', '--host', '127.0.0.1'], 'probe-127.0.0.1.txt'));
      note('security.probe.localhost', runNode([path.join(ext, 'scripts', 'probe-console-websocket-rc.cjs'), '--port', '9376', '--host', 'localhost'], 'probe-localhost.txt'));
      note('security.adversarial', runNode(['C:/dev/mythologiq/FailSafe-rc611-qual/tools/adversarial-probe.cjs', '9376'], 'adversarial.txt'));
      // Theme write route with the REAL key (never printed): every guard still applies.
      const key = new URL(consoleUrl.replace(/"/g, '')).searchParams.get('fsThemeKey');
      const http = require('http');
      const post = (headers, body) => new Promise((res) => {
        const req = http.request({ host: '127.0.0.1', port: 9376, method: 'POST', path: '/api/v1/ui/theme', headers, setHost: false }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); });
        req.on('error', (e) => res(`ERR ${e.code}`)); req.end(body);
      });
      const H = '127.0.0.1:9376'; const body = '{"theme":"pegasus"}';
      const matrix = {
        foreignOrigin: await post({ Host: H, Origin: 'https://attacker.example', 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': key }, body),
        nullOrigin: await post({ Host: H, Origin: 'null', 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': key }, body),
        webviewOrigin: await post({ Host: H, Origin: 'vscode-webview://x', 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': key }, body),
        textPlain: await post({ Host: H, Origin: `http://${H}`, 'Content-Type': 'text/plain', 'X-FailSafe-Theme-Key': key }, body),
        rebindHost: await post({ Host: 'rebind.example:9376', Origin: 'http://rebind.example:9376', 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': key }, body),
        noKey: await post({ Host: H, Origin: `http://${H}`, 'Content-Type': 'application/json' }, body),
        wrongKey: await post({ Host: H, Origin: `http://${H}`, 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': `${key}x` }, body),
        injection: await post({ Host: H, Origin: `http://${H}`, 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': key }, '{"theme":"x\\"] body{display:none} [y=\\""}'),
      };
      fs.writeFileSync(path.join(sec, 'theme-route-matrix.json'), JSON.stringify(matrix, null, 2));
      const want = { foreignOrigin: 403, nullOrigin: 403, webviewOrigin: 403, textPlain: 415, rebindHost: 403, noKey: 401, wrongKey: 401, injection: 400 };
      check('installed security: theme route refuses every hostile variant even with the real key', Object.keys(want).every((k) => matrix[k] === want[k]), matrix);
      check('installed security: none of those requests changed the theme', (await theme(mon)) === 'mythiq' && (readSettings() || {})['failsafe.console.theme'] === undefined, await theme(mon));
      const svc = Object.fromEntries(['127', 'localhost'].map((h) => [h, fs.readFileSync(path.join(sec, `probe-${h === '127' ? '127.0.0.1' : 'localhost'}.txt`), 'utf8')]));
      note('security.probe.tail', Object.fromEntries(Object.entries(svc).map(([k, v]) => [k, v.trim().split(String.fromCharCode(10)).slice(-3).join(' | ')])));
    }

    // ---------------------------------------------------------------- storage partitioning (the question asked)
    await mon.evaluate(() => localStorage.setItem('fs601-partition-probe', 'webview'));
    const extSees = await xp.evaluate(() => localStorage.getItem('fs601-partition-probe'));
    check('storage: the external browser cannot see the VS Code webview Monitor\'s storage (separate browsers)', extSees === null, { extSees });
    await mon.evaluate(() => localStorage.removeItem('fs601-partition-probe'));

    // ---------------------------------------------------------------- all six themes, live, from the external Console
    for (const t of ['pegasus', 'midnight', 'aurora', 'crimson', 'atmosphere', 'mythiq']) {
      await xp.locator(`.cc-theme-select[data-theme="${t}"]`).click();
      const c = await poll(() => theme(chrome), t);
      const m = await poll(() => theme(mon), t);
      const s = readSettings();
      check(`live: external Console -> ${t} reaches sidebar chrome, Monitor and VS Code settings`,
        c === t && m === t && s && s['failsafe.console.theme'] === t, { chrome: c, monitor: m, setting: s && s['failsafe.console.theme'] });
      const tokensMatch = await mon.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim())
        === await xp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim());
      const chromeTokens = await chrome.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim());
      check(`tokens: ${t} --bg-panel identical in Console, Monitor and sidebar chrome`, tokensMatch && chromeTokens === await xp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim()), { chromeTokens });
      await shot(pg, `02-live-${t}`);
    }

    // ---------------------------------------------------------------- Settings change (another window / Settings UI path)
    writeSettings({ ...readSettings(), 'failsafe.console.theme': 'crimson' });
    const viaSettings = [await poll(() => theme(chrome), 'crimson'), await poll(() => theme(mon), 'crimson'), await poll(() => theme(xp.mainFrame()), 'crimson')];
    check('settings: editing failsafe.console.theme re-themes chrome, Monitor and external Console live', viaSettings.every((v) => v === 'crimson'), viaSettings);

    // ---------------------------------------------------------------- forged messages
    await mon.evaluate(() => {
      window.parent.postMessage({ type: 'failsafe.theme', theme: 'pegasus' }, '*');
      window.parent.postMessage({ type: 'failsafe.theme', theme: 'x"] body{display:none} [y="' }, '*');
    });
    await sleep(1000);
    check('forged: the embedded page cannot set the chrome theme by postMessage', (await theme(chrome)) === 'crimson', await theme(chrome));
    const forgedPost = await xp.evaluate(async () => (await fetch('/api/v1/ui/theme', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': 'guessed' }, body: JSON.stringify({ theme: 'pegasus' }) })).status);
    check('forged: a wrong theme key is refused (401) and nothing changes', forgedPost === 401 && (await theme(mon)) === 'crimson', { forgedPost });
    const noKey = await fetch('http://127.0.0.1:9376/api/v1/ui/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"theme":"pegasus"}' }).then((r) => r.status);
    check('forged: a bare local client without the key is refused (401)', noKey === 401, { noKey });

    // ---------------------------------------------------------------- SRE switching
    await chrome.locator('#btn-sre').click();
    const sre = await findFrame(pg, isSre, 15000);
    check('SRE: the SRE view opens in the shared theme', !!sre && (await poll(() => theme(sre), 'crimson')) === 'crimson', sre && await theme(sre));
    await shot(pg, '03-sre-crimson');
    await xp.locator('.cc-theme-select[data-theme="aurora"]').click();
    check('SRE: a live change reaches the SRE view', !!sre && (await poll(() => theme(sre), 'aurora')) === 'aurora', sre && await theme(sre));
    await shot(pg, '04-sre-aurora');
    await chrome.locator('#btn-monitor').click();
    mon = await findFrame(pg, (u) => isMonitor(u), 15000);
    check('SRE -> Monitor: the Monitor comes back in the current theme', !!mon && (await poll(() => theme(mon), 'aurora')) === 'aurora', mon && await theme(mon));

    // ---------------------------------------------------------------- sidebar reload button
    await chrome.locator('#reload').click(); await sleep(3000);
    ({ mon, chrome } = await sidebar(pg));
    check('reload: chrome is rendered in the current theme and the Monitor follows', (await theme(chrome)) === 'aurora' && (await theme(mon)) === 'aurora', { chrome: await theme(chrome), monitor: await theme(mon) });

    // ---------------------------------------------------------------- window reload
    await palette(pg, 'Developer: Reload Window'); await sleep(8000);
    pg = null;
    for (let i = 0; i < 60 && !pg; i++) { for (const c of browser.contexts()) for (const p of c.pages()) if (p.url().includes('workbench')) pg = p; if (!pg) await sleep(500); }
    await sleep(4000);
    ({ mon, chrome } = await sidebar(pg));
    check('window reload: theme kept', (await theme(chrome)) === 'aurora' && (await theme(mon)) === 'aurora', { chrome: await theme(chrome), monitor: await theme(mon) });

    // ---------------------------------------------------------------- high contrast
    writeSettings({ ...readSettings(), 'workbench.colorTheme': 'Default High Contrast' });
    await sleep(3000);
    const hc = await chrome.evaluate(() => ({ cls: document.body.className, btnBorder: getComputedStyle(document.querySelector('.btn')).borderTopColor, theme: document.documentElement.getAttribute('data-theme') }));
    check('high contrast: chrome uses VS Code contrast colors; FailSafe theme unchanged', /vscode-high-contrast/.test(hc.cls) && hc.theme === 'aurora', hc);
    await shot(pg, '05-high-contrast-aurora');
    writeSettings({ ...readSettings(), 'workbench.colorTheme': 'Default High Contrast Light' });
    await sleep(3000);
    await shot(pg, '06-high-contrast-light-aurora');
    const s = readSettings(); delete s['workbench.colorTheme']; writeSettings(s); await sleep(2000);

    // ---------------------------------------------------------------- restart
    await ext2.close(); ext2 = null;
    await shutdown();
    pg = await launch(); await sleep(5000);
    ({ mon, chrome } = await sidebar(pg));
    const bakedChrome = await chrome.evaluate(() => document.documentElement.outerHTML.slice(0, 200));
    check('restart: chrome is rendered by the host in the saved theme, Monitor follows', (await theme(chrome)) === 'aurora' && (await theme(mon)) === 'aurora' && /data-theme="aurora"/.test(bakedChrome), { chrome: await theme(chrome), monitor: await theme(mon) });
    await shot(pg, '07-after-restart-aurora');

    // ---------------------------------------------------------------- editor-tab Monitor (Simple Browser) and partitioning inside Electron
    await mon.evaluate(() => localStorage.setItem('fs601-partition-probe', 'sidebar'));
    await palette(pg, 'FailSafe: Open Console (Editor Tab)');
    const tab = await findFrame(pg, (u) => isMonitor(u) && u !== mon.url(), 20000)
      || await findFrame(pg, (u) => /:9376\//.test(u) && !/sre/.test(u) && pg.frames().filter((f) => isMonitor(f.url())).length > 1, 5000);
    const monitors = pg.frames().filter((f) => isMonitor(f.url()));
    note('editor-tab.frames', monitors.map((f) => f.url()));
    if (monitors.length > 1) {
      const other = monitors.find((f) => f !== mon);
      const seen = await other.evaluate(() => localStorage.getItem('fs601-partition-probe'));
      check('storage: two VS Code webviews embedding the same Console origin get partitioned storage', seen === null, { seenInEditorTab: seen });
      check('editor tab: the Monitor in an editor tab shows the shared theme', (await theme(other)) === 'aurora', await theme(other));
      await shot(pg, '08-editor-tab-aurora');
    } else {
      note('editor-tab', 'Simple Browser Monitor frame not found');
    }
    await mon.evaluate(() => localStorage.removeItem('fs601-partition-probe'));
    void tab;
  } catch (e) {
    note('error', String((e && e.stack) || e));
    check('scenario completed without error', false, String(e && e.message));
  } finally {
    try { await ext2?.close(); } catch { /* ignore */ }
    await shutdown();
    const summary = { root, code: CODE, vsix: VSIX || null, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results, log };
    fs.writeFileSync(path.join(outDir, 'acceptance.json'), JSON.stringify(summary, null, 2));
    console.log(`SUMMARY passed=${summary.passed} failed=${summary.failed}`);
    process.exit(0);
  }
})();
