// v6.0.12 installed-host acceptance: audio vault (#465) and editor-save enforcement (#505).
// Real VS Code (stable build given by FS_CODE) with the candidate VSIX installed into a disposable profile.
// Usage: FS_CODE=<Code.exe> FS_INSTALL_VSIX=<vsix> node ehost-audio-save-acceptance.cjs <extDir-with-node_modules> <outDir>
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const ext = path.resolve(process.argv[2]); const outDir = path.resolve(process.argv[3]);
fs.mkdirSync(outDir, { recursive: true });
const pw = require(path.join(ext, 'node_modules', 'playwright-core'));
const CODE = process.env.FS_CODE; const VSIX = process.env.FS_INSTALL_VSIX;
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fs6012-audio-')));
for (const d of ['home', 'ud/User', 'exts', 'ws/src', 'outside']) fs.mkdirSync(path.join(root, d), { recursive: true });
const ws = path.join(root, 'ws'); const vault = path.join(ws, '.failsafe', 'audio');
fs.writeFileSync(path.join(root, 'ud/User/settings.json'), JSON.stringify({
  'window.dialogStyle': 'custom', 'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none',
  'update.mode': 'none', 'files.autoSave': 'off', 'extensions.autoUpdate': false }, null, 2));
const governed = path.join(ws, 'src', 'governed.txt');
fs.writeFileSync(governed, 'original line\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const log = [];
const note = (k, v) => { log.push({ at: new Date().toISOString(), k, v }); console.log('NOTE', k, JSON.stringify(v).slice(0, 300)); };
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail === undefined ? null : detail).slice(0, 260)); };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const env = { ...process.env, USERPROFILE: path.join(root, 'home'), HOME: path.join(root, 'home') };
delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_IPC_HOOK_CLI;

const cli = path.join(path.dirname(CODE), 'bin', 'code.cmd');
const inst = spawnSync(cli, ['--install-extension', VSIX, `--extensions-dir=${path.join(root, 'exts')}`, `--user-data-dir=${path.join(root, 'ud')}`, '--force'], { env, encoding: 'utf8', shell: true });
console.log('install', inst.status);
if (inst.status !== 0) process.exit(2);

let proc = null, browser = null;
async function launch() {
  proc = spawn(CODE, ['--remote-debugging-port=9336', `--user-data-dir=${path.join(root, 'ud')}`, `--extensions-dir=${path.join(root, 'exts')}`,
    '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window', ws], { env, stdio: 'ignore' });
  for (let i = 0; i < 120 && !browser; i++) { try { browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9336'); } catch { await sleep(1000); } }
  for (let i = 0; i < 240; i++) { for (const c of browser.contexts()) for (const p of c.pages()) if (p.url().includes('workbench')) return p; await sleep(500); }
  throw new Error('no workbench');
}
async function shutdown() {
  try { await browser?.close(); } catch { /* */ } browser = null;
  try { proc?.kill(); } catch { /* */ }
  for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:9336/json/version'); await sleep(500); } catch { break; } }
  await sleep(2500);
}
async function palette(pg, text) { await pg.keyboard.press('Escape'); await pg.keyboard.press('F1'); await sleep(700); await pg.keyboard.type(text); await sleep(1200); await pg.keyboard.press('Enter'); await sleep(2000); }
async function waitConsole(ms = 90000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch('http://127.0.0.1:9376/health'); if (r.ok) return true; } catch { /* */ } await sleep(1000); }
  return false;
}
function req(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: 9376, method, path: p, headers: { Host: '127.0.0.1:9376', ...headers }, setHost: false }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => {
        const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* */ }
        resolve({ status: res.statusCode, buf, json });
      });
    });
    r.on('error', (e) => resolve({ status: `ERR ${e.code}`, buf: Buffer.alloc(0), json: null }));
    if (body) r.write(body); r.end();
  });
}
async function answerDialog(pg, titleRe, button, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const box = pg.locator('.monaco-dialog-box');
    if (await box.count()) {
      const text = await box.first().innerText();
      if (titleRe.test(text)) {
        await shot(pg, `dialog-${button.replace(/\W+/g, '-').toLowerCase()}-${Date.now() % 100000}`);
        await box.first().getByRole('button', { name: button, exact: true }).click();
        return text;
      }
    }
    await sleep(300);
  }
  return null;
}
const vaultFiles = () => (fs.existsSync(vault) ? fs.readdirSync(vault).filter((f) => !f.startsWith('.capture')) : []);
async function shot(pg, name) { try { await pg.screenshot({ path: path.join(outDir, `${name}.png`) }); } catch { /* */ } }

(async () => {
  try {
    let pg = await launch(); await sleep(5000);
    await palette(pg, 'View: Show FailSafe');
    check('Console server is up in the installed host', await waitConsole(), null);
    await sleep(3000);

    // ---------------------------------------------------------------- #505 editor save in Enforce mode
    const before = fs.readFileSync(governed);
    await pg.keyboard.press('Control+P'); await sleep(800); await pg.keyboard.type('governed.txt'); await sleep(1200); await pg.keyboard.press('Enter'); await sleep(2500);
    await pg.keyboard.press('Control+End'); await pg.keyboard.type('edit made under Enforce mode with no active intent'); await sleep(500);
    await pg.keyboard.press('Control+S'); await sleep(5000);
    const after = fs.readFileSync(governed);
    const toasts = await pg.locator('.notifications-toasts, .notification-toast').allInnerTexts().catch(() => []);
    const toastText = toasts.join(' | ');
    await shot(pg, 'editor-save-enforce');
    note('editor-save.toasts', toastText.slice(0, 400));
    const denied = /policy denied (this edit|editor save)/i.test(toastText) && /(write not prevented|may still save)/i.test(toastText);
    check('#505 Enforce mode: policy denial is reported to the user', denied, { toast: toastText.slice(0, 200) });
    check('#505 the disk write is NOT prevented (observation only, as disclosed)', sha(after) !== sha(before) && after.toString().includes('edit made under Enforce mode'),
      { before: sha(before).slice(0, 12), after: sha(after).slice(0, 12) });

    // ---------------------------------------------------------------- #465 audio vault
    const A = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), crypto.randomBytes(4096)]);
    check('audio: a simple text/plain POST is not accepted as audio (no CORS-free path)', (await req('POST', '/api/v1/brainstorm/audio', { body: A, headers: { 'Content-Type': 'text/plain' } })).status === 415, null);
    // Decline
    let pending = req('POST', '/api/v1/brainstorm/audio', { body: A, headers: { 'Content-Type': 'audio/webm' } });
    const d1 = await answerDialog(pg, /Save this Mind Map audio recording/, 'Cancel');
    let r = await pending;
    check('audio: denied consent writes nothing', !!d1 && r.status !== 200 && vaultFiles().length === 0, { dialog: !!d1, status: r.status, files: vaultFiles() });
    // Approve
    pending = req('POST', '/api/v1/brainstorm/audio', { body: A, headers: { 'Content-Type': 'audio/webm' } });
    const d2 = await answerDialog(pg, /Save this Mind Map audio recording/, 'Save recording');
    r = await pending;
    const id = r.json && r.json.audioHash;
    check('audio: approved recording is stored once with its sidecar', !!d2 && r.status === 200 && /^[0-9a-f]{64}$/.test(String(id)) && fs.existsSync(path.join(vault, `${id}.webm`)),
      { status: r.status, id: String(id).slice(0, 12), files: vaultFiles() });
    check('audio: the stored id is a salted 64-hex id, not the bare content hash', /^[0-9a-f]{64}$/.test(String(id)) && id !== sha(A), { id: String(id).slice(0, 12), contentSha: sha(A).slice(0, 12) });
    const list = await req('GET', '/api/v1/brainstorm/audio');
    check('audio: inventory lists the recording with its size', list.status === 200 && list.json.recordings.some((x) => x.id === id && x.bytes === A.length), list.json);
    const got = await req('GET', `/api/v1/brainstorm/audio/${id}`);
    check('audio: fetch returns the exact bytes', got.status === 200 && sha(got.buf) === sha(A), { status: got.status });
    // Path escapes and malformed ids
    const esc = {};
    for (const [label, p] of [['dotdot', '/api/v1/brainstorm/audio/..%2F..%2F..%2Fsrc%2Fgoverned.txt'], ['uppercase', `/api/v1/brainstorm/audio/${id.toUpperCase()}`],
      ['short', '/api/v1/brainstorm/audio/abc'], ['backslash', '/api/v1/brainstorm/audio/..%5C..%5Csrc%5Cgoverned.txt'], ['missing', `/api/v1/brainstorm/audio/${'0'.repeat(64)}`]]) {
      esc[label] = (await req('GET', p)).status;
    }
    esc.deleteDotdot = (await req('DELETE', '/api/v1/brainstorm/audio/..%2F..%2Fsrc%2Fgoverned.txt')).status;
    check('audio: traversal and malformed ids are refused; nothing outside the vault is served', esc.dotdot >= 400 && esc.uppercase === 400 && esc.short === 400 && esc.backslash >= 400 && esc.missing === 404 && esc.deleteDotdot >= 400, esc);
    // Quota: a 255 MiB unknown file in the vault counts against the 256 MiB limit.
    const filler = path.join(vault, 'filler.bin');
    spawnSync('fsutil', ['file', 'createnew', filler, String(255 * 1024 * 1024)], { encoding: 'utf8' });
    const B = crypto.randomBytes(2 * 1024 * 1024);
    pending = req('POST', '/api/v1/brainstorm/audio', { body: B, headers: { 'Content-Type': 'audio/webm' } });
    await answerDialog(pg, /Save this Mind Map audio recording/, 'Save recording');
    r = await pending;
    check('audio: quota is enforced (507) and nothing is written over the limit', r.status === 507 && !fs.existsSync(path.join(vault, `${sha(B)}.webm`)), { status: r.status, body: r.json });
    fs.unlinkSync(filler);
    // Junction escape: the vault directory replaced by a junction to a folder outside the workspace.
    const outside = path.join(root, 'outside');
    fs.renameSync(vault, `${vault}.bak`);
    spawnSync('cmd', ['/c', 'mklink', '/J', vault, outside], { encoding: 'utf8' });
    const Cbytes = crypto.randomBytes(1024);
    pending = req('POST', '/api/v1/brainstorm/audio', { body: Cbytes, headers: { 'Content-Type': 'audio/webm' } });
    const d3 = await answerDialog(pg, /Save this Mind Map audio recording/, 'Save recording', 15000);
    r = await pending;
    check('audio: a junction redirecting the vault outside the workspace is refused; nothing written outside', r.status !== 200 && fs.readdirSync(outside).length === 0,
      { dialog: !!d3, status: r.status, outside: fs.readdirSync(outside) });
    fs.rmdirSync(vault); fs.renameSync(`${vault}.bak`, vault);
    // Delete: decline then approve.
    pending = req('DELETE', `/api/v1/brainstorm/audio/${id}`);
    await answerDialog(pg, /Permanently delete this Mind Map recording/, 'Cancel');
    r = await pending;
    check('audio: declining deletion leaves both files', r.status !== 200 && fs.existsSync(path.join(vault, `${id}.webm`)) && fs.existsSync(path.join(vault, `${id}.json`)), { status: r.status, files: vaultFiles() });

    // ---------------------------------------------------------------- persistence across a full restart
    await shutdown();
    pg = await launch(); await sleep(5000);
    await palette(pg, 'View: Show FailSafe');
    await waitConsole();
    const list2 = await req('GET', '/api/v1/brainstorm/audio');
    check('audio: the recording persists across a full VS Code restart', list2.status === 200 && list2.json.recordings.some((x) => x.id === id), list2.json);
    pending = req('DELETE', `/api/v1/brainstorm/audio/${id}`);
    await answerDialog(pg, /Permanently delete this Mind Map recording/, 'Delete recording');
    r = await pending;
    check('audio: approved deletion removes audio and metadata', r.status === 200 && vaultFiles().length === 0, { status: r.status, files: vaultFiles() });
    const after2 = fs.readFileSync(governed);
    check('#505 the saved edit is still on disk after restart (no silent rollback)', after2.toString().includes('edit made under Enforce mode'), null);
  } catch (e) {
    note('error', String((e && e.stack) || e));
    check('scenario completed without error', false, String(e && e.message));
  } finally {
    await shutdown();
    const summary = { code: CODE, vsix: VSIX, vsixSha256: sha(fs.readFileSync(VSIX)), passed: results.filter((x) => x.pass).length, failed: results.filter((x) => !x.pass).length, results, log };
    fs.writeFileSync(path.join(outDir, 'audio-save-acceptance.json'), JSON.stringify(summary, null, 2));
    console.log(`SUMMARY passed=${summary.passed} failed=${summary.failed}`);
    process.exit(0);
  }
})();
