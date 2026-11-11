'use strict';
// #652 installed-host acceptance. A real VS Code host (FS_CODE) with the candidate VSIX in a
// disposable profile serves the Console; a real, clean-profile Chromium loads the Integrations
// tab from that installed server and clicks the Statewright link with NO interception.
// Usage: FS_CODE=<Code.exe> FS_INSTALL_VSIX=<vsix> [FS_BROWSER_CHANNEL=chrome] node installed653.cjs <extDir> <outDir> [cdpPort]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const [ext, outDir] = process.argv.slice(2, 4).map((p) => path.resolve(p));
const PORT = Number(process.argv[4] || 9341);
fs.mkdirSync(outDir, { recursive: true });
const pw = require(path.join(ext, 'node_modules', 'playwright-core'));
const CODE = process.env.FS_CODE, VSIX = process.env.FS_INSTALL_VSIX;
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fs653inst-')));
for (const d of ['home', 'ud/User', 'exts', 'ws', 'chrome']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 'ud/User/settings.json'), JSON.stringify({
  'window.dialogStyle': 'custom', 'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none',
  'update.mode': 'none', 'extensions.autoUpdate': false }, null, 2));
fs.writeFileSync(path.join(root, 'ws', 'README.md'), 'base\n');
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? null).slice(0, 600)); };
const note = (name, detail) => { results.push({ name, note: true, detail }); console.log('NOTE', name, JSON.stringify(detail ?? null).slice(0, 900)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = (port) => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: '/api/roadmap', timeout: 800 }, (x) => { x.resume(); res(x.statusCode); }); r.on('error', () => res(0)); r.on('timeout', () => { r.destroy(); res(0); }); });
const scan = async () => { const up = []; for (let p = 9370; p <= 9400; p++) if (await probe(p)) up.push(p); return up; };
const env = { ...process.env, USERPROFILE: path.join(root, 'home'), HOME: path.join(root, 'home') };
delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_IPC_HOOK_CLI;

(async () => {
  const before = await scan();
  const cli = path.join(path.dirname(CODE), 'bin', fs.existsSync(path.join(path.dirname(CODE), 'bin', 'code.cmd')) ? 'code.cmd' : 'cursor.cmd');
  const inst = spawnSync(cli, ['--install-extension', VSIX, `--extensions-dir=${path.join(root, 'exts')}`, `--user-data-dir=${path.join(root, 'ud')}`, '--force'], { env, encoding: 'utf8', shell: true });
  check('VSIX installs into the disposable profile', inst.status === 0, { status: inst.status, out: (inst.stdout || '').slice(-200) });
  const installed = fs.readdirSync(path.join(root, 'exts')).filter((d) => /failsafe/i.test(d));
  const shipped = installed.length ? path.join(root, 'exts', installed[0]) : null;
  const find = (dir, name, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') find(p, name, acc); } else if (e.name === name) acc.push(p); } return acc; };
  const shippedRenderer = shipped ? [...find(shipped, 'integration-catalog-renderer.js'), ...find(shipped, 'statewright-handoff.js')] : [];
  const shippedText = shippedRenderer.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  check('installed extension ships the renderer and the fixed Statewright link', shippedRenderer.length > 0 && shippedText.includes('https://statewright.ai/runs') && shippedText.includes('target="_blank" rel="noopener noreferrer"'), { installed, files: shippedRenderer.map((f) => path.relative(shipped, f)) });

  const proc = spawn(CODE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(root, 'ud')}`, `--extensions-dir=${path.join(root, 'exts')}`,
    '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window', path.join(root, 'ws')], { env, stdio: 'ignore' });
  let host = null, wb = null;
  for (let i = 0; i < 120 && !host; i++) { try { host = await pw.chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(1000); } }
  for (let i = 0; i < 240 && !wb; i++) { for (const c of host.contexts()) for (const p of c.pages()) if (p.url().includes('workbench')) wb = p; if (!wb) await sleep(500); }
  if (!wb) { console.log('pages', host.contexts().flatMap((c) => c.pages().map((p) => p.url()))); }
  await sleep(15000);
  async function palette(text) {
    await wb.keyboard.press('Escape'); await wb.keyboard.press('F1'); await sleep(800); await wb.keyboard.type(text); await sleep(1500);
    const sel = await wb.evaluate(() => { const r = document.querySelector('.quick-input-widget .monaco-list-row.focused .label-name'); return r ? r.textContent.trim() : null; });
    if (sel !== text) { check(`palette selected exactly "${text}"`, false, { selected: sel }); await wb.keyboard.press('Escape'); return false; }
    await wb.keyboard.press('Enter'); await sleep(4000); return true;
  }
  await palette('FailSafe: Open Sidebar');
  let mine = [];
  for (let i = 0; i < 60 && !mine.length; i++) { mine = (await scan()).filter((p) => !before.includes(p)); if (!mine.length) await sleep(1000); }
  check('installed host started its own Console server', mine.length === 1, { before, mine });
  const base = `http://localhost:${mine[0]}`;
  const about = await wb.evaluate(() => document.title).catch(() => '');
  const pkg = shipped ? JSON.parse(fs.readFileSync(path.join(shipped, 'package.json'), 'utf8')) : {};
  note('host and extension identity', { hostTitle: about, code: CODE, extension: `${pkg.publisher}.${pkg.name}@${pkg.version}`, base });

  // Real browser, clean profile, no route interception anywhere.
  const launchOpts = { headless: false, args: ['--no-first-run', '--no-default-browser-check'] };
  if (process.env.FS_BROWSER_CHANNEL) launchOpts.channel = process.env.FS_BROWSER_CHANNEL;
  const pwFull = require(path.join(ext, 'node_modules', 'playwright'));
  const ctx = await pwFull.chromium.launchPersistentContext(path.join(root, 'chrome'), launchOpts);
  const all = [];
  ctx.on('request', (r) => all.push({ url: r.url(), method: r.method(), nav: r.isNavigationRequest(), headers: r.headers(), t: Date.now() }));
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${base}/command-center.html`, { waitUntil: 'load' });
  await page.locator('.tab-btn[data-target="integrations"]').click();
  const card = page.locator('.cc-intcat-statewright[data-id="statewright"]');
  await card.waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('.cc-intcat-card').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await sleep(5000); // idle: anything automatic would have fired by now
  const link = card.locator('a.cc-intcat-web-link');
  const attrs = await link.evaluate((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent.trim(), ping: a.getAttribute('ping'), download: a.getAttribute('download') }));
  check('card visible in the Console served by the installed extension, link attributes exact', attrs.href === 'https://statewright.ai/runs' && attrs.target === '_blank' && attrs.rel === 'noopener noreferrer' && !attrs.ping && !attrs.download, attrs);
  const nonLocal = all.filter((r) => !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(r.url) && !/^(data|blob|about|chrome|devtools):/.test(r.url));
  const toProvider = (r) => { try { return /(^|\.)statewright\.ai$/i.test(new URL(r.url).hostname); } catch { return false; } };
  check('before any click: zero requests to the statewright.ai host', all.filter(toProvider).length === 0, { totalRequests: all.length, urlsMentioningStatewright: all.filter((r) => /statewright/i.test(r.url)).map((r) => r.url) });
  note('before any click: non-local requests made by the Console page (pre-existing behaviour, any origin)', [...new Set(nonLocal.map((r) => new URL(r.url).origin))]);
  const pillText = await card.locator('.cc-intcat-pill').allTextContents();
  check('no connected/authenticated claim on the card', pillText.join('|') === 'Website handoff' && !/connected|authenticated|signed in|active/i.test(await card.innerText().then((t) => t.replace('Website handoff', ''))), { pillText, text: await card.innerText() });
  await page.screenshot({ path: path.join(outDir, 'console-integrations.png'), fullPage: false });

  // Keyboard reachability, then a real click.
  await link.focus();
  check('link is keyboard focusable', await link.evaluate((a) => document.activeElement === a), null);
  const mark = all.length;
  const [opened] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), link.click()]);
  await opened.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
  await opened.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(4000);
  const after = all.slice(mark);
  const firstNav = after.find((r) => r.nav && /statewright\.ai/.test(r.url));
  check('click opens a new tab whose first navigation is exactly https://statewright.ai/runs', !!firstNav && firstNav.url === 'https://statewright.ai/runs' && firstNav.method === 'GET', firstNav && { url: firstNav.url, method: firstNav.method });
  const h = (firstNav && firstNav.headers) || {};
  check('navigation request carries no Referer, Cookie, Authorization or Origin', !h.referer && !h.cookie && !h.authorization && !h.origin, { referer: h.referer || null, cookie: h.cookie || null, authorization: h.authorization || null, origin: h.origin || null });
  const leak = after.filter(toProvider).filter((r) => /localhost|127\.0\.0\.1|9376|fs653inst|workspace/i.test(r.url + JSON.stringify(r.headers)));
  check('no request to Statewright mentions the local Console origin, port, or workspace path', leak.length === 0, leak.slice(0, 3).map((r) => r.url));
  const opener = await opened.evaluate(() => window.opener === null).catch((e) => String(e));
  check('opened page has no window.opener', opener === true, opener);
  const dest = { finalUrl: opened.url(), title: await opened.title().catch(() => ''), text: (await opened.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700) };
  note('REAL destination as seen by a signed-out browser (no interception)', dest);
  const status = await opened.evaluate(() => performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].responseStatus).catch(() => null);
  check('real statewright.ai answered the navigation (HTTP 200 family)', new URL(opened.url()).origin === 'https://statewright.ai' && (!status || (status >= 200 && status < 400)), { status, finalUrl: opened.url() });
  await opened.screenshot({ path: path.join(outDir, 'statewright-destination.png') }).catch(() => {});
  check('Console tab did not navigate away (handoff is a separate tab)', page.url().startsWith(base), page.url());

  // Catalog unavailable: stop serving the catalog for this page only (local route, not the provider).
  const page2 = await ctx.newPage();
  await page2.route('**/api/v1/integrations/catalog', (r) => r.abort());
  await page2.goto(`${base}/command-center.html`, { waitUntil: 'load' });
  await page2.locator('.tab-btn[data-target="integrations"]').click();
  const card2 = page2.locator('.cc-intcat-statewright[data-id="statewright"] a.cc-intcat-web-link');
  await card2.waitFor({ state: 'visible', timeout: 20000 });
  await sleep(1500);
  check('catalog unavailable: error shown and the Statewright link is still present', /Could not load integrations/.test(await page2.locator('#integrations').innerText()) && (await card2.getAttribute('href')) === 'https://statewright.ai/runs', (await page2.locator('#integrations').innerText()).slice(0, 300));
  await page2.screenshot({ path: path.join(outDir, 'catalog-unavailable.png') });

  // Editor-tab surface (Simple Browser): is the Integrations tab reachable there?
  await palette('FailSafe: Open Console (Editor Tab)'); await sleep(6000);
  const frames = [];
  for (const c of host.contexts()) for (const p of c.pages()) for (const f of p.frames()) frames.push(f.url());
  note('editor-tab surface frames (to see which UI the in-editor tab serves)', frames.filter((u) => /localhost|127\.0\.0\.1/.test(u)));

  await ctx.close().catch(() => {});
  try { await host.close(); } catch { /* */ } try { proc.kill(); } catch { /* */ }
  fs.writeFileSync(path.join(outDir, 'installed653.json'), JSON.stringify({ when: new Date().toISOString(), code: CODE, vsix: VSIX, results }, null, 2));
  const failed = results.filter((r) => r.pass === false);
  console.log(`\n${results.filter((r) => r.pass).length} pass, ${failed.length} fail`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
