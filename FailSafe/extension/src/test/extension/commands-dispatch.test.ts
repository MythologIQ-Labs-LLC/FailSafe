// Functional tests for VS Code command dispatch (FX001-FX029 cluster, partial).
// Patches vscode.commands.executeCommand + vscode.env.openExternal + vscode.window.*
// to capture downstream calls; asserts each command invokes the expected dispatch chain.
//
// Coverage: commands whose observable behavior is downstream-command invocation, external
// URL opening, or vscode.window prompts. Service-bound commands (panicStop, resumeMonitoring,
// addRisk service path, etc.) are deferred — they require a commands.ts refactor exposing
// per-command handler factories. Surfaced as a follow-on backlog item.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

interface CapturedCall { name: string; args: unknown[]; }

function makeCapture() {
  const commands: CapturedCall[] = [];
  const externalUrls: string[] = [];
  const inputBoxes: Array<vscode.InputBoxOptions | undefined> = [];
  const quickPicks: Array<unknown> = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const errors: string[] = [];
  const saveDialogs: Array<vscode.SaveDialogOptions | undefined> = [];

  const originalExec = vscode.commands.executeCommand.bind(vscode.commands);
  const originalOpen = vscode.env.openExternal;
  const originalInput = vscode.window.showInputBox;
  const originalQuick = vscode.window.showQuickPick;
  const originalWarn = vscode.window.showWarningMessage;
  const originalInfo = vscode.window.showInformationMessage;
  const originalError = vscode.window.showErrorMessage;
  const originalSave = vscode.window.showSaveDialog;

  const inputQueue: Array<string | undefined> = [];
  const quickQueue: Array<unknown> = [];
  const warnQueue: Array<string | undefined> = [];

  // Patch executeCommand: pass `failsafe.*` and `simpleBrowser.show` through to real impl,
  // block everything else (returns Promise.resolve()) so workbench commands don't actually fire.
  (vscode.commands as { executeCommand: unknown }).executeCommand = (name: string, ...args: unknown[]) => {
    commands.push({ name, args });
    if (name.startsWith('failsafe.')) {
      return originalExec(name, ...args);
    }
    return Promise.resolve();
  };

  (vscode.env as { openExternal: unknown }).openExternal = async (uri: vscode.Uri) => {
    externalUrls.push(uri.toString());
    return true;
  };

  (vscode.window as { showInputBox: unknown }).showInputBox = async (opts?: vscode.InputBoxOptions) => {
    inputBoxes.push(opts);
    return inputQueue.shift();
  };

  (vscode.window as { showQuickPick: unknown }).showQuickPick = async (items: unknown) => {
    quickPicks.push(items);
    return quickQueue.shift();
  };

  (vscode.window as { showWarningMessage: unknown }).showWarningMessage = async (msg: string) => {
    warnings.push(msg);
    return warnQueue.shift();
  };

  (vscode.window as { showInformationMessage: unknown }).showInformationMessage = async (msg: string) => {
    infos.push(msg);
    return undefined;
  };

  (vscode.window as { showErrorMessage: unknown }).showErrorMessage = async (msg: string) => {
    errors.push(msg);
    return undefined;
  };

  (vscode.window as { showSaveDialog: unknown }).showSaveDialog = async (opts?: vscode.SaveDialogOptions) => {
    saveDialogs.push(opts);
    return undefined;
  };

  function restore(): void {
    (vscode.commands as { executeCommand: unknown }).executeCommand = originalExec;
    (vscode.env as { openExternal: unknown }).openExternal = originalOpen;
    (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
    (vscode.window as { showQuickPick: unknown }).showQuickPick = originalQuick;
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = originalInfo;
    (vscode.window as { showErrorMessage: unknown }).showErrorMessage = originalError;
    (vscode.window as { showSaveDialog: unknown }).showSaveDialog = originalSave;
  }

  return {
    commands, externalUrls, inputBoxes, quickPicks, warnings, infos, errors, saveDialogs,
    inputQueue, quickQueue, warnQueue,
    restore,
  };
}

suite('Command dispatch (FX001-FX029 cluster)', () => {
  let capture: ReturnType<typeof makeCapture>;

  let fixtureWorkspace: string;

  suiteSetup(async function () {
    this.timeout(60000);
    // Extension's bootstrapCore requires a workspace folder. Create a transient
    // fixture and attach it before activation; vscode-test launches without one.
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      fixtureWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-cmd-fixture-'));
      const added = vscode.workspace.updateWorkspaceFolders(0, 0, {
        uri: vscode.Uri.file(fixtureWorkspace),
      });
      if (!added) throw new Error('Failed to attach fixture workspace folder');
      // updateWorkspaceFolders is async-applied; wait one tick.
      await new Promise((r) => setTimeout(r, 200));
    }
    const ext = vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe');
    if (!ext) throw new Error('Extension not found in test host');
    if (!ext.isActive) await ext.activate();
  });

  suiteTeardown(() => {
    if (fixtureWorkspace && fs.existsSync(fixtureWorkspace)) {
      fs.rmSync(fixtureWorkspace, { recursive: true, force: true });
    }
  });

  setup(() => { capture = makeCapture(); });
  teardown(() => { capture.restore(); });

  test('FX001 failsafe.openSidebar — chains to workbench.view.extension.failsafe-sidebar-container', async () => {
    await vscode.commands.executeCommand('failsafe.openSidebar');
    const downstream = capture.commands.map((c) => c.name);
    assert.ok(
      downstream.includes('workbench.view.extension.failsafe-sidebar-container'),
      `Expected sidebar container command in chain; got: ${JSON.stringify(downstream)}`,
    );
  });

  test('FX002 failsafe.openFailSafeProAbout — opens about URL via env.openExternal', async () => {
    await vscode.commands.executeCommand('failsafe.openFailSafeProAbout');
    assert.equal(capture.externalUrls.length, 1);
    assert.match(capture.externalUrls[0], /failsafe-pro|mythologiq\.studio/);
  });

  test('FX014 failsafe.openRiskRegister — focuses sidebar container', async () => {
    await vscode.commands.executeCommand('failsafe.openRiskRegister');
    const downstream = capture.commands.map((c) => c.name);
    assert.ok(
      downstream.includes('workbench.view.extension.failsafe-sidebar-container'),
      `Expected sidebar container command; got: ${JSON.stringify(downstream)}`,
    );
  });

  test('FX007 failsafe.openRoadmap — chains to failsafe.openPlannerHub', async () => {
    await vscode.commands.executeCommand('failsafe.openRoadmap');
    const downstream = capture.commands.map((c) => c.name);
    assert.ok(
      downstream.includes('failsafe.openPlannerHub'),
      `Expected openPlannerHub in chain; got: ${JSON.stringify(downstream)}`,
    );
  });

  test('FX006 failsafe.openPlannerHub — opens external URL with ui=console + workspace + theme params', async () => {
    await vscode.commands.executeCommand('failsafe.openPlannerHub');
    // openRoadmapExternal calls env.openExternal with a URL containing query params.
    assert.equal(capture.externalUrls.length, 1, 'should call openExternal exactly once');
    const opened = decodeURIComponent(capture.externalUrls[0]);
    assert.match(opened, /ui=console/);
    assert.match(opened, /theme=(dark|light|high-contrast)/);
  });

  test('FX008 failsafe.openPlannerHubEditor — uses simpleBrowser.show with ui=compact', async () => {
    await vscode.commands.executeCommand('failsafe.openPlannerHubEditor');
    const simple = capture.commands.find((c) => c.name === 'simpleBrowser.show');
    assert.ok(simple, `Expected simpleBrowser.show in chain; got: ${JSON.stringify(capture.commands.map((c) => c.name))}`);
    const url = decodeURIComponent(String(simple!.args[0]));
    assert.match(url, /ui=compact/);
  });

  test('failsafe.openRoadmapTimeline — opens external URL with view=timeline', async () => {
    await vscode.commands.executeCommand('failsafe.openRoadmapTimeline');
    assert.equal(capture.externalUrls.length, 1);
    assert.match(decodeURIComponent(capture.externalUrls[0]), /view=timeline/);
  });

  test('failsafe.openRoadmapActiveSprint — opens external URL with view=current-sprint', async () => {
    await vscode.commands.executeCommand('failsafe.openRoadmapActiveSprint');
    assert.equal(capture.externalUrls.length, 1);
    assert.match(decodeURIComponent(capture.externalUrls[0]), /view=current-sprint/);
  });

  test('failsafe.openRoadmapLiveActivity — opens external URL with view=live-activity', async () => {
    await vscode.commands.executeCommand('failsafe.openRoadmapLiveActivity');
    assert.equal(capture.externalUrls.length, 1);
    assert.match(decodeURIComponent(capture.externalUrls[0]), /view=live-activity/);
  });

  test('FX011 failsafe.panicStop — aborts when user dismisses confirmation', async () => {
    capture.warnQueue.push(undefined); // user dismissed dialog
    await vscode.commands.executeCommand('failsafe.panicStop');
    assert.equal(capture.warnings.length, 1);
    assert.match(capture.warnings[0], /Panic Stop/);
    // Subsequent "executed" warning should NOT be shown
    const executedNotices = capture.warnings.filter((w) => /Sentinel daemon halted/.test(w));
    assert.equal(executedNotices.length, 0, 'No "halted" notice when user cancels');
  });

  test('FX011 failsafe.panicStop — confirmation prompt copy is unchanged', async () => {
    capture.warnQueue.push(undefined);
    await vscode.commands.executeCommand('failsafe.panicStop');
    assert.match(capture.warnings[0], /halt active FailSafe monitoring/);
    assert.match(capture.warnings[0], /Continue\?/);
  });

  test('FX018 failsafe.revertToCheckpoint — does nothing when input is empty', async () => {
    capture.inputQueue.push(undefined); // user cancelled input
    await vscode.commands.executeCommand('failsafe.revertToCheckpoint');
    assert.equal(capture.inputBoxes.length, 1);
    assert.match(String(capture.inputBoxes[0]?.prompt || ''), /Checkpoint ID/);
  });

  test('failsafe.exportFeedback — does nothing when user cancels save dialog', async () => {
    await vscode.commands.executeCommand('failsafe.exportFeedback');
    assert.equal(capture.saveDialogs.length, 1);
    const opts = capture.saveDialogs[0];
    assert.ok(opts);
    assert.deepEqual(opts!.filters, { 'JSON Files': ['json'] });
  });

  test('failsafe.showRoadmap — chains to failsafe.roadmap.focus', async () => {
    await vscode.commands.executeCommand('failsafe.showRoadmap');
    const downstream = capture.commands.map((c) => c.name);
    assert.ok(downstream.includes('failsafe.roadmap.focus'));
  });
});
