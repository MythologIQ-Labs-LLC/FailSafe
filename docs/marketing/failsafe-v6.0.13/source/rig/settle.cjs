// Pre-roll (not recorded): settles first-run state with the product's own UI so no first-run picker opens mid-take.
//  1. FailSafe: Set Governance Mode -> the highlighted default, chosen explicitly.
//  2. Close the empty secondary side bar and any notifications.
const L = require('./lib.cjs'); const C = require('./capture.cjs');
const quickPick = () => L.evalIn(L.T.page, `(() => { const q = document.querySelector('.quick-input-widget'); return !!q && q.style.display !== 'none' ? (q.innerText || 'open').slice(0, 160) : '' })()`);
(async () => {
  C.hwnd('*tasklet*Visual Studio Code*', 'Code', { x: 3432, y: 0, w: 1936, h: 1088 });
  await L.sleep(1500);
  await L.exec('workbench.action.closeAuxiliaryBar');
  const pending = L.exec('failsafe.setGovernanceMode').catch((e) => console.log('setGovernanceMode:', String(e).slice(0, 120)));
  let qp = ''; for (let i = 0; i < 30 && !qp; i++) { await L.sleep(300); qp = await quickPick(); }
  console.log('mode picker:', JSON.stringify(qp));
  if (qp) { await L.shot(L.R + '/shots/settle-picker.png'); await L.key('Enter'); console.log('chose the highlighted default'); }
  await pending; await L.sleep(3000);
  qp = await quickPick(); if (qp) { console.log('picker still open, confirming:', JSON.stringify(qp)); await L.key('Enter'); await L.sleep(1500); }
  await L.exec('notifications.clearAll');
  await L.shot(L.R + '/shots/settled.png');
})().catch((e) => { console.error(e); process.exit(1); });
