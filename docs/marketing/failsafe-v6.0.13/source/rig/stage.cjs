// Sizes the isolated Chrome window (already opened by VS Code) so the page viewport is exactly 1920x1080 physical
// pixels, with the tab strip and toolbar above it. Writes stage.json (hwnd, cropTop) for capture.cjs.
//   node stage.cjs            (uses the Console page on CDP 9346)
const L = require('./lib.cjs'); const C = require('./capture.cjs');
async function stageChrome(pg) {
  await pg.bringToFront(); await L.sleep(500);
  let m = await pg.evaluate(() => ({ ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio }));
  let h = 1197, wpx = 1938, w;
  for (let i = 0; i < 6; i++) {
    w = C.hwnd('*FAILSAFE Console*', 'chrome', { x: 3431, y: 0, w: wpx, h });
    await L.sleep(700);
    m = await pg.evaluate(() => ({ ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio }));
    const dh = Math.round(m.ih * m.dpr) - 1080, dw = Math.round(m.iw * m.dpr) - 1920;
    if (!dh && Math.abs(dw) <= 2) break;
    h -= dh; wpx -= dw;
  }
  const stage = { console: { ...w, cropTop: h - 9 - 1080, outerH: h, outerW: wpx, metrics: m } };
  L.fs.writeFileSync(L.R + '/stage.json', JSON.stringify(stage, null, 1));
  return stage;
}
module.exports = { stageChrome };
if (require.main === module) (async () => {
  const c = await L.chrome(); console.log(JSON.stringify(await stageChrome(c.pg))); await c.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
