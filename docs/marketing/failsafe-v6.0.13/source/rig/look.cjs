// Diagnostic (not recorded): place the VS Code window on the capture display and screenshot it.
//   node look.cjs <name> [js-to-eval-in-workbench]
const L = require('./lib.cjs'); const C = require('./capture.cjs');
(async () => {
  const name = process.argv[2] || 'look';
  C.hwnd('*tasklet*Visual Studio Code*', 'Code', { x: 3432, y: 0, w: 1936, h: 1088 });
  await L.sleep(600);
  if (process.argv[3]) console.log(JSON.stringify(await L.evalIn(L.T.page, process.argv[3])));
  await L.shot(L.R + '/shots/' + name + '.png');
  console.log(JSON.stringify(await L.evalIn(L.T.page, '[innerWidth, innerHeight, devicePixelRatio, document.title]')));
})().catch((e) => { console.error(e); process.exit(1); });
