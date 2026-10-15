// FailSafe release verification (#521): qualification-only trigger extension.
// rv lifecycle loads it with --extensionDevelopmentPath. FailSafe declares no
// startup activation event, so this activates it and reports, as JSON lines
// appended to the file named by FS_RV_OUT:
//   found     { version, extensionPath, pid }   pid is this extension host's
//   activated { isActive, ms }                   written only after activate() resolves
//   error     { message }
//   quit-requested                               after FS_RV_OUT.quit appears
// When FS_RV_OUT.quit exists it runs workbench.action.quit (graceful stop).
"use strict";

const vscode = require("vscode");
const fs = require("fs");

const EXTENSION_ID = "MythologIQ.mythologiq-failsafe";

exports.activate = async () => {
  const out = process.env.FS_RV_OUT;
  if (!out) return;
  const log = (o) => fs.appendFileSync(out, `${JSON.stringify({ t: new Date().toISOString(), ...o })}\n`);
  const timer = setInterval(() => {
    if (fs.existsSync(`${out}.quit`)) {
      clearInterval(timer);
      log({ event: "quit-requested" });
      vscode.commands.executeCommand("workbench.action.quit");
    }
  }, 500);
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (!ext) {
    log({ event: "error", message: `${EXTENSION_ID} is not installed` });
    return;
  }
  log({ event: "found", version: ext.packageJSON.version, extensionPath: ext.extensionPath, pid: process.pid });
  try {
    const t0 = Date.now();
    await ext.activate();
    log({ event: "activated", isActive: ext.isActive, ms: Date.now() - t0 });
  } catch (err) {
    log({ event: "error", message: String((err && err.stack) || err) });
  }
};

exports.deactivate = () => {};
