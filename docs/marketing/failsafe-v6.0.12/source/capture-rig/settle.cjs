// Pre-roll (not recorded): settles the first-run state. Every step is the product's own UI.
//  1. FailSafe: Set Governance Mode -> Enforce (the default), chosen explicitly so the first-run mode picker
//     does not open in the middle of a recorded scene.
//  2. The Monitor's own "Console" button opens the Console in the browser (VS Code builds the keyed link).
const L = require('./lib.cjs');
const quickPick = () => L.evalIn(L.T.page, `(() => { const q = document.querySelector('.quick-input-widget'); return !!q && q.style.display !== 'none' ? (q.innerText || 'open').slice(0, 160) : '' })()`);
(async () => {
  await L.sleep(4000);
  await L.exec('workbench.action.closeAuxiliaryBar');
  await L.exec('failsafe.openSidebar'); await L.sleep(3000);
  const pending = L.exec('failsafe.setGovernanceMode').catch((e) => console.log('setGovernanceMode:', String(e).slice(0, 120)));
  let qp = ''; for (let i = 0; i < 30 && !qp; i++) { await L.sleep(300); qp = await quickPick(); }
  console.log('mode picker:', JSON.stringify(qp));
  if (qp) { await L.shot(L.R + '/shots/s2-picker.png'); await L.key('Enter'); console.log('chose the highlighted default'); }
  await pending; await L.sleep(4000);
  qp = await quickPick(); if (qp) { console.log('picker still open, confirming:', JSON.stringify(qp)); await L.key('Enter'); await L.sleep(1500); }
  await L.exec('notifications.clearAll');
  await L.inSidebar('d.getElementById("open-popout").click()');
  const c = await L.chrome(); await L.sleep(2000); console.log('console at', c.pg.url().replace(/workspace=[^&]+/, 'workspace=…')); await c.browser.close();
  await L.shot(L.R + '/shots/s3.png');
})().catch((e) => { console.error(e); process.exit(1); });
