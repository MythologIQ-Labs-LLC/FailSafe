// The recorded performance. Two windows are recorded at once (VS Code, and the Console page in Chrome); every
// step is an ordinary user action performed by script (VS Code commands via the disposable driver, DOM clicks on
// FailSafe's own buttons). FailSafe's reactions (notifications, verdicts, audit entries, theme propagation, install
// progress, test output) are not scripted. events-<segment>.json records when each step happened on the capture clock.
//   node perform.cjs <outDir> [seg,seg,...]
const L = require('./lib.cjs'); const C = require('./capture.cjs');
const OUT = process.argv[2]; const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const NL = String.fromCharCode(10);
const lines = (...a) => a.join(NL);
const TEST_FIND = lines("  assert.throws(() => validateDueDate('2026-13-01'), ValidationError);", '});', '');
const TEST_WITH = TEST_FIND + lines('',
  "test('impossible calendar days are rejected, real leap days accepted (TASK-14)', () => {",
  "  assert.throws(() => validateDueDate('2026-02-30'), ValidationError);",
  "  assert.throws(() => validateDueDate('2026-04-31'), ValidationError);",
  "  assert.equal(validateDueDate('2028-02-29'), '2028-02-29');", '});', '');
const FIX_FIND = lines('  return parsed.toISOString().slice(0, 10);', '}');
const FIX_WITH = lines('  // TASK-14: Date rolls impossible days forward (2026-02-30 -> 2026-03-02); reject them instead.',
  '  const canonical = parsed.toISOString().slice(0, 10);',
  '  if (canonical !== dueDate) throw new ValidationError(`due date "${dueDate}" does not exist`);',
  '  return canonical;', '}');

(async () => {
  const c = await L.chrome(); const pg = c.pg;
  const tab = async (t) => { await pg.locator(`.tab-btn[data-target="${t}"]`).click(); };
  const pill = async (k) => { await pg.locator(`.cc-pill[data-key="${k}"]`).click(); };
  const theme = async (t) => { // click the chip; if the theme has not changed after 4 s, click once more (logged)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await pg.locator(`.cc-theme-select[data-theme="${t}"]`).click(); const t0 = Date.now();
      while (Date.now() - t0 < 4000) { if ((await pg.evaluate(() => document.documentElement.getAttribute('data-theme'))) === t) { mark('theme.applied', { theme: t, attempt, ms: Date.now() - t0 }); return; } await L.sleep(100); }
      mark('theme.notApplied', { theme: t, attempt });
    }
  };
  const themes = async () => ({ console: await pg.evaluate(() => document.documentElement.getAttribute('data-theme')),
    sidebar: await L.inSidebar('return d.documentElement.getAttribute("data-theme")'),
    frame: await L.evalIn(L.T.anyMain, 'document.documentElement.getAttribute("data-theme")') });
  const side = (id) => L.inSidebar(`d.getElementById("${id}").click()`);
  const hold = L.sleep; const mark = L.mark;
  const quiet = async () => { await L.exec('notifications.clearAll'); await L.exec('notifications.hideToasts'); };
  const park = async () => { await pg.mouse.move(1300, 840); await L.mouse([{ type: 'mouseMoved', x: 1180, y: 520 }]); };
  const smoothTo = (sel, block = 'center') => pg.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: b }), [sel, block]);
  const toTop = () => pg.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  const vsDialog = () => L.evalIn(L.T.page, `(() => { const d = document.querySelector('.monaco-dialog-box'); return d ? d.innerText.slice(0, 900) : null; })()`);
  const vsDialogClick = (label) => L.evalIn(L.T.page, `(() => { const b = [...document.querySelectorAll('.monaco-dialog-box .dialog-buttons .monaco-button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const banner = () => pg.evaluate(() => { const b = document.getElementById('bootstrap-banner'); return b ? getComputedStyle(b).display : 'absent'; });

  const SEG = {
    // Scene 1 (tail): a clean workspace with FailSafe visible
    async workspace() {
      await quiet(); await L.exec('workbench.action.closeAllEditors'); await L.exec('workbench.action.closePanel');
      await tab('overview'); await L.exec('workbench.view.explorer'); await hold(1500);
      mark('workspace.explorer'); await hold(3000);
      await L.drive({ type: 'open', file: 'README.md', line: 1 }); mark('workspace.readme'); await hold(3500);
      await L.exec('failsafe.openSidebar'); mark('workspace.monitor'); await hold(8000);
    },
    // Scene 2 (setup beat): first-run banner, then the real Install Qor-Logic Skills flow (Console > Config)
    async setup() {
      await quiet(); await tab('overview'); await hold(1000);
      mark('setup.banner', { banner: await banner() }); await hold(5000);
      await tab('settings'); await hold(1500);
      await smoothTo('[data-action="install-qorlogic-skills"]'); mark('setup.card'); await hold(3500);
      await pg.locator('[data-action="install-qorlogic-skills"]').click(); mark('setup.modal'); await hold(2500);
      for (const h of ['codex', 'kilo-code', 'gemini']) { await pg.locator(`.cc-modal-host[value="${h}"]:visible`).click(); await hold(450); }
      mark('setup.hosts.claudeOnly'); await hold(1800);
      await pg.locator('.cc-modal-confirm:visible').click(); mark('setup.modal.install');
      let d = null; for (let i = 0; i < 40 && !d; i++) { d = await vsDialog(); if (!d) await hold(250); }
      mark('setup.vscode.dialog', { dialog: d }); await hold(4500);
      mark('setup.vscode.approve', { clicked: await vsDialogClick('Install') });
      let done = false; for (let i = 0; i < 120 && !done; i++) { await hold(500); done = (await banner()) === 'none' && !(await pg.locator('button:visible', { hasText: /Installing/ }).count()); }
      mark('setup.installed', { done, banner: await banner(), card: (await pg.evaluate(() => document.querySelector('[data-action="install-qorlogic-skills"]')?.closest('.cc-card, section, div')?.parentElement?.innerText || '')).slice(0, 700) });
      await hold(5000);
      const close = pg.locator('.cc-skill-modal:visible button', { hasText: /Close|Done|OK/ }); if (await close.count()) { await close.first().click(); mark('setup.modal.closed'); await hold(1500); }
      await toTop(); await hold(1200); await tab('overview'); mark('setup.overview.noBanner', { banner: await banner() }); await hold(6000);
    },
    // Scene 2: Console and Monitor in the same workspace
    async overview() {
      await quiet(); await L.exec('workbench.action.closeAllEditors'); await L.exec('failsafe.openSidebar'); await tab('overview'); await hold(800);
      mark('overview.console'); await hold(6000);
      await L.exec('failsafe.openPlannerHubEditor'); mark('overview.consoleEditorTab'); await hold(9000);
    },
    // Scene 3: one theme everywhere. Theme chips are clicked in the Console that VS Code opened.
    async themes() {
      await quiet(); await L.exec('workbench.action.closeAllEditors'); await L.exec('failsafe.openSidebar'); await side('btn-monitor');
      await tab('settings'); await toTop(); await hold(1500); mark('themes.config', await themes()); await hold(4000);
      await theme('pegasus'); mark('themes.click.pegasus'); await hold(1500); mark('themes.pegasus', await themes()); await hold(4500);
      await side('btn-sre'); mark('themes.sre.pegasus'); await hold(2500); mark('themes.sre.state', await themes()); await hold(3500);
      await theme('aurora'); mark('themes.click.aurora'); await hold(1500); mark('themes.aurora', await themes()); await hold(3000);
      await theme('atmosphere'); mark('themes.click.atmosphere'); await hold(1500); mark('themes.atmosphere', await themes()); await hold(3000);
      await side('btn-monitor'); mark('themes.monitor.back'); await hold(3000);
      await theme('crimson'); mark('themes.click.crimson'); await hold(3500);
      await theme('midnight'); mark('themes.click.midnight'); await hold(3500);
      await theme('pegasus'); mark('themes.click.pegasus2'); await hold(3500);
      // persistence: the Monitor's own Reload button re-creates the view; the theme comes back from the VS Code setting
      await side('reload'); mark('themes.reload.monitor'); await hold(4000); mark('themes.afterReload', await themes()); await hold(1500);
      await theme('mythiq'); mark('themes.click.mythiq'); await hold(1500); mark('themes.mythiq', await themes()); await hold(4500);
      await tab('overview'); mark('themes.overview.mythiq'); await hold(4000);
    },
    // Scene 4: the issue, the regression test, the genuine failure
    async issue() {
      await quiet(); await L.exec('workbench.action.closeAllEditors'); await L.exec('workbench.action.closePanel'); await L.exec('failsafe.openSidebar');
      await L.drive({ type: 'open', file: 'ISSUES.md', line: 3 }); mark('issue.open'); await hold(6000);
      await L.drive({ type: 'open', file: 'test/validation.test.ts', line: 18 }); mark('issue.test.open'); await hold(2000);
      await L.drive({ type: 'replace', file: 'test/validation.test.ts', save: true, find: TEST_FIND, with: TEST_WITH }); mark('issue.test.saved'); await hold(6500);
      await L.drive({ type: 'terminal', name: 'tests', preserveFocus: true }); for (let i = 0; i < 4; i++) await L.exec('workbench.action.terminal.resizePaneUp'); await hold(1200);
      await L.drive({ type: 'terminal', name: 'tests', text: 'npm test', preserveFocus: true }); mark('issue.npmtest.fail'); await hold(8000);
    },
    // Scene 5: the bounded fix and FailSafe's real response
    async fix() {
      await quiet();
      await L.exec('workbench.action.closePanel'); await L.drive({ type: 'open', file: 'src/validation.ts', line: 26 }); mark('fix.open'); await hold(3000);
      await L.drive({ type: 'replace', file: 'src/validation.ts', save: true, find: FIX_FIND, with: FIX_WITH }); mark('fix.saved'); await hold(9000);
      await L.exec('workbench.action.closePanel'); mark('fix.panelClosed'); await hold(4000);
      await tab('settings'); await hold(800); await pg.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^GOVERNANCE MODE$/i.test(e.textContent.trim())); h?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      mark('fix.console.mode'); await hold(5000);
      await toTop(); await tab('governance'); await pill('audit'); mark('fix.console.audit'); await hold(6000);
    },
    // Scene 6: verify
    async verify() {
      await quiet();
      await L.drive({ type: 'terminal', name: 'tests', text: 'cls && npm test', preserveFocus: true }); mark('verify.npmtest.pass'); await hold(8000);
      await L.drive({ type: 'terminal', name: 'tests', text: 'cls && git --no-pager diff --stat && git --no-pager diff src/validation.ts', preserveFocus: true }); mark('verify.diff'); await hold(9000);
      await tab('governance'); await pill('audit'); mark('verify.console.audit'); await hold(7000);
    },
    // Scene 7: evidence and pending decisions
    async decision() {
      await quiet();
      await tab('governance'); await pill('risks'); mark('decision.risks'); await hold(5000);
      await pill('compliance'); mark('decision.compliance'); await hold(4000);
      await tab('workspace'); await pill('delivery'); mark('decision.delivery'); await hold(6000);
      await tab('overview'); mark('decision.overview'); await hold(6000);
    },
    // Scene 8: closing two-shot in VS Code
    async closing() {
      await quiet(); await L.exec('workbench.action.closeAllEditors'); await L.exec('workbench.action.closePanel'); await L.exec('failsafe.openSidebar'); await side('btn-monitor');
      await tab('overview'); await L.exec('failsafe.openPlannerHubEditor'); mark('closing.twoShot'); await hold(10000);
    },
  };

  const order = ONLY.length ? ONLY : Object.keys(SEG);
  for (const name of order) {
    await park();
    const t0 = Date.now(); L.resetClock();
    const cap = C.start(OUT, t0 * 1000, ['vscode', 'console'], '-' + name);
    await hold(1200); await pg.mouse.move(110, 300); await hold(150); await pg.mouse.move(1300, 840); await L.mouse([{ type: 'mouseMoved', x: 1190, y: 530 }]); // first frames
    mark('seg.start', { seg: name });
    let error = null; try { await SEG[name](); } catch (e) { error = String(e && e.stack || e); console.error(error); }
    mark('seg.end', { seg: name });
    const clean = await cap.stop(async (i) => { await pg.mouse.move(110, i % 2 ? 300 : 395); await L.mouse([{ type: 'mouseMoved', x: 30, y: 120 + (i % 2) * 54 }]); });
    await park();
    L.fs.writeFileSync(`${OUT}/events-${name}.json`, JSON.stringify({ seg: name, t0: new Date(t0).toISOString(), clean, error, rects: { vscode: cap.procs.vscode.rect, console: cap.procs.console.rect }, events: L.events }, null, 1));
    console.log('segment', name, 'clean stop', clean, error ? 'ERROR' : 'ok');
    if (error) break;
  }
  await c.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
