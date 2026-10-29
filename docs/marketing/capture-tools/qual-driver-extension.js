// Disposable qualification/demo driver (NOT part of FailSafe). Lives only in the isolated
// extensions directory. It activates the installed FailSafe and executes queued actions from
// ctl/queue/*.json in name order, logging each action and its result to ctl/driver.log.
// Every action it performs is an ordinary VS Code API call; nothing here fakes FailSafe output.
const vscode = require('vscode'); const fs = require('fs'); const path = require('path');
const ctl = process.env.FS_QUAL_CTL;
const queue = path.join(ctl, 'queue'); const done = path.join(ctl, 'done');
function log(m) { fs.appendFileSync(path.join(ctl, 'driver.log'), `${new Date().toISOString()} pid=${process.pid} ${m}\n`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let terminal;

async function run(a) {
  const uri = (p) => vscode.Uri.file(path.isAbsolute(p) ? p : path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, p));
  switch (a.type) {
    case 'exec': return vscode.commands.executeCommand(a.command, ...(a.args || []));
    case 'open': {
      const doc = await vscode.workspace.openTextDocument(uri(a.file));
      const ed = await vscode.window.showTextDocument(doc, { preview: false, viewColumn: a.column || vscode.ViewColumn.One });
      if (a.line) { const pos = new vscode.Position(a.line - 1, 0); ed.selection = new vscode.Selection(pos, pos); ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter); }
      return doc.fileName;
    }
    case 'replace': { // replace exact text in a file through the editor, optionally save
      const doc = await vscode.workspace.openTextDocument(uri(a.file));
      const ed = await vscode.window.showTextDocument(doc, { preview: false });
      const text = doc.getText(); const at = text.indexOf(a.find);
      if (at < 0 || text.indexOf(a.find, at + 1) >= 0) throw new Error(`replace: expected exactly one match in ${a.file}`);
      const range = new vscode.Range(doc.positionAt(at), doc.positionAt(at + a.find.length));
      await ed.edit((e) => e.replace(range, a.with));
      const end = doc.positionAt(at + a.with.length);
      ed.selection = new vscode.Selection(doc.positionAt(at), end); ed.revealRange(new vscode.Range(doc.positionAt(at), end), vscode.TextEditorRevealType.InCenter);
      if (a.save) await doc.save();
      return `replaced ${a.find.length} chars with ${a.with.length}`;
    }
    case 'terminal': {
      if (!terminal || terminal.exitStatus) terminal = vscode.window.createTerminal({ name: a.name || 'demo', cwd: vscode.workspace.workspaceFolders[0].uri.fsPath });
      terminal.show(a.preserveFocus ?? false);
      if (a.text) terminal.sendText(a.text, true);
      return 'sent';
    }
    case 'sleep': await sleep(a.ms); return 'slept';
    case 'quit': return vscode.commands.executeCommand('workbench.action.quit');
    case 'reload': return vscode.commands.executeCommand('workbench.action.reloadWindow');
    default: throw new Error(`unknown action ${a.type}`);
  }
}

exports.activate = async () => {
  fs.mkdirSync(queue, { recursive: true }); fs.mkdirSync(done, { recursive: true });
  log(`driver activated vscode=${vscode.version}`);
  const ext = vscode.extensions.getExtension('mythologiq.mythologiq-failsafe');
  log(`failsafe found=${!!ext} path=${ext && ext.extensionPath} version=${ext && ext.packageJSON.version}`);
  try { await ext.activate(); log('failsafe activated'); } catch (e) { log('failsafe activate error ' + e); }
  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    try {
      for (const name of fs.readdirSync(queue).filter((f) => f.endsWith('.json')).sort()) {
        const file = path.join(queue, name); const action = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.renameSync(file, path.join(done, name));
        try { const r = await run(action); log(`ok ${name} ${JSON.stringify(action).slice(0, 300)} -> ${JSON.stringify(r ?? null).slice(0, 300)}`); }
        catch (e) { log(`ERR ${name} ${JSON.stringify(action).slice(0, 300)} -> ${e && e.message}`); }
      }
      // Legacy single-command channel used by run-qual.sh.
      const legacy = path.join(ctl, 'cmd.txt');
      if (fs.existsSync(legacy)) { const cmd = fs.readFileSync(legacy, 'utf8').trim(); fs.unlinkSync(legacy); log('cmd ' + cmd);
        if (cmd === 'quit') await vscode.commands.executeCommand('workbench.action.quit');
        if (cmd === 'reload') await vscode.commands.executeCommand('workbench.action.reloadWindow'); }
    } finally { busy = false; }
  }, 300);
};
exports.deactivate = () => log('driver deactivate');
