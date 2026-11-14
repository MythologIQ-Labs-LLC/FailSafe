// Director helpers: connects to the isolated VS Code (CDP 9345) and, once VS Code has opened it, to the
// Console's Chrome window (CDP 9346). Editor/terminal actions go through the disposable driver extension's queue.
const fs = require('fs'), path = require('path');
const pw = require('C:/dev/mythologiq/FailSafe-6012md/FailSafe/extension/node_modules/playwright-core');
const R = 'C:/dev/mythologiq/failsafe/_work/v6013-demo/rig';
const CTL = R + '/iso/ctl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const events = [];
let T0 = Date.now();
function mark(name, extra) { const e = { t: +((Date.now() - T0) / 1000).toFixed(3), at: new Date().toISOString(), name, ...(extra || {}) }; events.push(e); console.log(e.t.toFixed(2), name, extra ? JSON.stringify(extra).slice(0, 200) : ''); return e; }
function resetClock() { T0 = Date.now(); events.length = 0; }
let seq = 0;
async function drive(action, timeout = 60000) {
  const name = `${Date.now()}${String(seq++).padStart(4, '0')}.json`;
  fs.writeFileSync(path.join(CTL, 'queue', name), JSON.stringify(action));
  const t = Date.now();
  while (Date.now() - t < timeout) { if (fs.existsSync(path.join(CTL, 'done', name))) break; await sleep(50); }
  // wait for the driver's log line for this action
  while (Date.now() - t < timeout) {
    const log = fs.readFileSync(path.join(CTL, 'driver.log'), 'utf8');
    const line = log.split('\n').find((l) => l.includes(name));
    if (line) { if (/ ERR /.test(line)) throw new Error(line); return line; }
    await sleep(50);
  }
  throw new Error('driver timeout ' + JSON.stringify(action));
}
const exec = (command, ...args) => drive({ type: 'exec', command, args });
async function vscode() {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9345');
  for (let i = 0; i < 60; i++) { for (const c of browser.contexts()) for (const pg of c.pages()) if (pg.url().includes('workbench')) return { browser, pg }; await sleep(500); }
  throw new Error('no workbench page');
}
async function chrome() {
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) { try { browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9346'); } catch { await sleep(500); } }
  if (!browser) throw new Error('no Chrome CDP');
  for (let i = 0; i < 60; i++) { for (const c of browser.contexts()) for (const pg of c.pages()) if (/:9376/.test(pg.url())) return { browser, pg }; await sleep(500); }
  throw new Error('no Console page');
}
async function findFrame(pg, pred, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const f = pg.frames().find((fr) => { try { return pred(fr.url()); } catch { return false; } }); if (f) return f; await sleep(300); }
  return null;
}
const isMonitor = (u) => /:9376\/\?ui=compact/.test(u);
const isSre = (u) => /:9376\/console\/sre/.test(u);
const themeOf = (f) => f.evaluate(() => document.documentElement.getAttribute('data-theme'));
module.exports = { pw, R, CTL, sleep, events, mark, resetClock, drive, exec, vscode, chrome, findFrame, isMonitor, isSre, themeOf, fs, path };

// ---- raw CDP for the VS Code window and its webview targets (Playwright's frame tree is unreliable on reconnect)
async function targets(port = 9345) { return (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); }
function session(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
      close: () => ws.close(),
    });
    ws.onerror = (e) => reject(new Error('ws error ' + wsUrl));
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  });
}
async function target(pred, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const hit = (await targets()).find(pred); if (hit) return hit; await sleep(300); }
  throw new Error('target not found');
}
async function evalIn(pred, expression, ms) {
  const tg = await target(pred, ms); const s = await session(tg.webSocketDebuggerUrl);
  try {
    const r = await s.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  } finally { s.close(); }
}
const T = {
  page: (t) => t.type === 'page' && /Visual Studio Code/.test(t.title),
  monitor: (t) => t.type === 'iframe' && /:9376\/\?ui=compact/.test(t.url),
  sre: (t) => t.type === 'iframe' && /:9376\/console\/sre/.test(t.url),
  anyMain: (t) => t.type === 'iframe' && /:9376\/(\?ui=compact|console\/sre)/.test(t.url),
  sidebarChrome: (t) => t.type === 'iframe' && /^vscode-webview:/.test(t.url) && /purpose=webviewView|extensionId=mythologiq/i.test(t.url),
  simpleBrowser: (t) => t.type === 'iframe' && /^vscode-webview:/.test(t.url) && /simple-browser|simpleBrowser/i.test(t.url),
};
// run JS inside the sidebar chrome document (the extension's own HTML lives in the webview's inner active-frame)
const inSidebar = (js) => evalIn(T.sidebarChrome, `(() => { const d = document.querySelector('iframe#active-frame')?.contentDocument || document; ${js} })()`);
async function shot(file, pred = T.page) {
  const tg = await target(pred); const s = await session(tg.webSocketDebuggerUrl);
  try { const r = await s.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); } finally { s.close(); }
}
Object.assign(module.exports, { targets, session, target, evalIn, T, inSidebar, shot });

const KEYS = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], ArrowDown: [40, 'ArrowDown'], ArrowUp: [38, 'ArrowUp'], Tab: [9, 'Tab'] };
async function key(name) {
  const [code, k, text] = KEYS[name]; const tg = await target(T.page); const s = await session(tg.webSocketDebuggerUrl);
  try {
    await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: code, key: k, code: k });
    if (text) await s.send('Input.dispatchKeyEvent', { type: 'char', text, key: k });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: code, key: k, code: k });
  } finally { s.close(); }
}
async function mouse(steps) { // [{type:'mouseMoved'|'mousePressed'|'mouseReleased', x, y}]
  const tg = await target(T.page); const s = await session(tg.webSocketDebuggerUrl);
  try { for (const st of steps) { await s.send('Input.dispatchMouseEvent', { button: st.type === 'mouseMoved' && !st.down ? 'none' : 'left', buttons: st.type === 'mouseReleased' ? 0 : (st.down || st.type === 'mousePressed' ? 1 : 0), clickCount: st.type === 'mouseMoved' ? 0 : 1, ...st }); await sleep(st.wait || 30); } } finally { s.close(); }
}
Object.assign(module.exports, { key, mouse });
