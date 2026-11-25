// Trial (not recorded): open the Console through VS Code, go to Integrations > Catalog, screenshot the Statewright
// card, click the real link, and record what statewright.ai/runs shows in the isolated Chrome profile.
const L = require('./lib.cjs'); const C = require('./capture.cjs');
(async () => {
  await L.exec('failsafe.openPlannerHub');
  const c = await L.chrome(); const pg = c.pg; await L.sleep(3000);
  const w = C.hwnd('*FAILSAFE*', 'chrome');
  console.log('chrome window', JSON.stringify(w), JSON.stringify(await pg.evaluate(() => ({ ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, title: document.title }))));
  await pg.screenshot({ path: L.R + '/shots/p1-console.png' });
  await pg.locator('.tab-btn[data-target="integrations"]').click(); await L.sleep(1500);
  console.log('pills', JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('#integrations [data-key], #integrations .cc-pill')].map((e) => e.className + ':' + e.getAttribute('data-key') + ':' + e.textContent.trim()).slice(0, 12))));
  await pg.screenshot({ path: L.R + '/shots/p2-integrations.png' });
  const card = pg.locator('section[data-id="statewright"]');
  await card.scrollIntoViewIfNeeded(); await L.sleep(800);
  console.log('card text', JSON.stringify(await card.innerText()));
  console.log('card box', JSON.stringify(await card.boundingBox()));
  await pg.screenshot({ path: L.R + '/shots/p3-card.png' });
  const ctx = pg.context();
  const popup = ctx.waitForEvent('page', { timeout: 20000 });
  await pg.locator('a.cc-intcat-web-link').click();
  const sw = await popup; await sw.waitForLoadState('load').catch(() => {}); await L.sleep(8000);
  console.log('statewright url', sw.url(), 'title', await sw.title());
  console.log('statewright text', JSON.stringify((await sw.evaluate(() => document.body.innerText)).slice(0, 3000)));
  await sw.screenshot({ path: L.R + '/shots/p4-statewright.png' });
  await sw.screenshot({ path: L.R + '/shots/p4-statewright-full.png', fullPage: true });
  await c.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
