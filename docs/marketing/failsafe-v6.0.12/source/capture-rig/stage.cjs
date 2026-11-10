// Opens the Console popout from the Monitor's own "Console" button (if not open) and sizes both windows so the
// captured content is exactly 1920x1080. Writes stage.json (hwnds + crop) for capture.cjs.
const L = require('./lib.cjs'); const C = require('./capture.cjs');
(async () => {
  let open = false; try { await (await fetch('http://127.0.0.1:9346/json/version')).json(); open = true; } catch { /* not running */ }
  if (!open) { await L.exec('failsafe.openSidebar'); await L.sleep(1500); await L.inSidebar('d.getElementById("open-popout").click()'); }
  const c = await L.chrome(); await L.sleep(2500);
  let m = await c.pg.evaluate(() => ({ ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio }));
  let h = Math.round(m.oh * m.dpr);
  let w;
  for (let i = 0; i < 4; i++) {
    const delta = Math.round(m.ih * m.dpr) - 1080;
    h -= delta;
    w = C.hwnd('*FAILSAFE Console*', 'chrome', { x: 3431, y: 0, w: 1938, h });
    await L.sleep(800);
    m = await c.pg.evaluate(() => ({ ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio }));
    if (Math.round(m.ih * m.dpr) === 1080) break;
  }
  const top = h - 9 - 1080;
  const v = C.hwnd('*tasklet*Visual Studio Code*', 'Code', { x: 3432, y: 0, w: 1936, h: 1088 });
  const stage = { console: { ...w, cropTop: top, outerH: h, metrics: m }, vscode: { ...v, page: await L.evalIn(L.T.page, '[innerWidth, innerHeight, devicePixelRatio]') } };
  L.fs.writeFileSync(L.R + '/stage.json', JSON.stringify(stage, null, 1)); console.log(JSON.stringify(stage));
  await c.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
