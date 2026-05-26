import * as vscode from "vscode";
import { decideSidebarClick } from "./sidebarInitializeLogic";

type SidebarMessage =
  | { command: "openPopout" }
  | { command: "openEditor" }
  | { command: "reload" }
  | { command: "sidebar.click"; currentLabel: string };

export class FailSafeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "failsafe.sidebarView";

  private view: vscode.WebviewView | undefined;
  private readonly baseUrl: string;

  constructor(port: number = 9376) {
    this.baseUrl = `http://localhost:${port}`;
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
      void this.handleMessage(message);
    });
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    switch (message.command) {
      case "openPopout":
        await vscode.commands.executeCommand("failsafe.openPlannerHub");
        break;
      case "openEditor":
        await vscode.commands.executeCommand("failsafe.openPlannerHubEditor");
        break;
      case "reload":
        this.refresh();
        break;
      case "sidebar.click": {
        const allCmds = new Set(await vscode.commands.getCommands(true));
        const decision = decideSidebarClick(message.currentLabel, allCmds);
        switch (decision.kind) {
          case "run-organize":
            if (allCmds.has("failsafe.organize")) {
              await vscode.commands.executeCommand("failsafe.organize");
            } else {
              vscode.window.showWarningMessage(
                "Organize command is not yet registered. The extension may still be activating — try again in a moment.",
              );
            }
            break;
          case "run-bootstrap":
            await vscode.commands.executeCommand("failsafe.bootstrap");
            this.view?.webview.postMessage(decision.postUpdate);
            break;
          case "bootstrap-not-ready":
            vscode.window.showWarningMessage(
              "Bootstrap command is not yet registered. The extension may still be activating — try again in a moment.",
            );
            break;
        }
        break;
      }
    }
  }

  private refresh(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const nonce = getNonce();
    const compactUrl = `${this.baseUrl}/?ui=compact`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view?.webview.cspSource ?? ""} data: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src ${this.baseUrl}; connect-src ${this.baseUrl};" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #071539; color: #f3f7ff; font-family: "Segoe UI", sans-serif; }
    .shell { display: grid; grid-template-rows: auto auto 1fr; height: 100%; }
    .toolbar { display: flex; gap: 6px; padding: 6px; border-bottom: 1px solid rgba(95, 150, 255, 0.35); background: #0a1f4a; align-items: center; }
    .btn { border: 1px solid #3568d8; color: #eaf1ff; background: #1f4ea8; padding: 5px 8px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 700; white-space: nowrap; line-height: 1.15; }
    .btn.secondary { background: #10357a; border-color: #2c5bb9; }
    .btn.init { margin-left: auto; background: #ffffff; color: #3d7dff; border-color: #ffffff; box-shadow: 0 0 8px rgba(0,0,0,0.25); }
    .btn.init:hover { background: #f0f4ff; box-shadow: 0 0 12px rgba(0,0,0,0.35); }
    .frame-wrap { position: relative; min-height: 0; }
    iframe { border: 0; width: 100%; height: 100%; display: block; background: #071539; }
    .sre-toggle { display:flex; gap:6px; padding:4px 8px; background:#0a1f4a; border-bottom:1px solid rgba(95,150,255,0.35); justify-content:flex-start; }
    .sre-toggle button { flex:0 0 auto; width:auto; padding:3px 12px; border:1px solid #3568d8; border-radius:6px; background:#10357a; font-size:10px; font-weight:600; cursor:pointer; color:#eaf1ff; line-height:1.2; }
    .sre-toggle button[aria-selected="true"] { background:#2c74f2; border-color:#2c74f2; }
    @media (max-width: 340px) {
      .toolbar { gap: 4px; padding: 5px; }
      .btn { font-size: 10px; padding: 4px 6px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button class="btn" id="open-popout" type="button">Console</button>
      <button class="btn secondary" id="reload" type="button">Reload</button>
      <button class="btn init" id="init-workspace" type="button" title="Initialize Workspace">Initialize</button>
    </div>
    <div class="sre-toggle" role="tablist" aria-label="View mode">
      <button id="btn-monitor" role="tab" aria-selected="true">Monitor</button>
      <button id="btn-sre"     role="tab" aria-selected="false">SRE</button>
    </div>
    <div class="frame-wrap">
      <iframe id="main-frame" title="FailSafe Monitor" src="${compactUrl}"></iframe>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initBtn = document.getElementById('init-workspace');

    // Restore label state; the host owns the decision logic.
    const state = vscode.getState() || { initDone: false };
    if (state.initDone && initBtn) {
        initBtn.textContent = 'Organize';
        initBtn.title = 'Organize Workspace Structure';
    }

    document.getElementById('open-popout')?.addEventListener('click', () => vscode.postMessage({ command: 'openPopout' }));
    document.getElementById('reload')?.addEventListener('click', () => vscode.postMessage({ command: 'reload' }));

    initBtn?.addEventListener('click', () => {
        // Send only the current label; host decides what happens next and
        // posts back a button.update message when DOM should mutate.
        vscode.postMessage({ command: 'sidebar.click', currentLabel: initBtn.textContent });
    });

    window.addEventListener('message', (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'failsafe.button.update' && initBtn) {
        initBtn.textContent = data.text;
        initBtn.title = data.title;
        if (data.persistState) {
            vscode.setState({ ...vscode.getState(), initDone: true });
        }
        return;
      }
      if (data.type === 'failsafe.openPopout') {
        vscode.postMessage({ command: 'openPopout' });
      }
    });

    const sreUrl = '${this.baseUrl}/console/sre';
    const compactUrl = '${compactUrl}';
    const mainFrame = document.getElementById('main-frame');
    const btnMonitor = document.getElementById('btn-monitor');
    const btnSre = document.getElementById('btn-sre');

    function switchView(isSre) {
      mainFrame.src = isSre ? sreUrl : compactUrl;
      btnMonitor.setAttribute('aria-selected', String(!isSre));
      btnSre.setAttribute('aria-selected', String(isSre));
      vscode.setState({ ...vscode.getState(), sreMode: isSre });
    }

    btnMonitor.addEventListener('click', () => switchView(false));
    btnSre.addEventListener('click', () => switchView(true));
    if (state.sreMode) { switchView(true); }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
