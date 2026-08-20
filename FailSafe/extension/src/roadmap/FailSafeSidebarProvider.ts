import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { decideSidebarClick, sanitizeConsoleRoute } from "./sidebarInitializeLogic";
import { resolveUiDir } from "./services/ConsoleServerSupport";

type SidebarMessage =
  | { command: "openPopout" }
  | { command: "openEditor" }
  | { command: "reload" }
  | { command: "openConsole"; route: string }
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
      case "openConsole":
        await this.openConsoleFromSidebar(message.route);
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

  /** Monitor-iframe deep link (FX916): sanitize the relayed route, then open
   *  the Console externally at that hash via the host command. Invalid routes
   *  are dropped fail-closed — no fallback open. */
  private async openConsoleFromSidebar(route: unknown): Promise<void> {
    const safe = sanitizeConsoleRoute(route);
    if (!safe) return;
    await vscode.commands.executeCommand("failsafe.openConsoleRoute", safe);
  }

  private refresh(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.getHtml();
  }

  /** The shared Console design tokens, read from disk so they can be inlined
   *  into the sidebar chrome. The provider runs in the Node extension host, so
   *  a direct file read avoids a cross-origin fetch to the Console server (the
   *  webview origin differs from the localhost server, and no CORS headers are
   *  served). Returns "" on any miss — the chrome's hardcoded var() fallbacks
   *  then apply, so the sidebar degrades to the default look. */
  private readThemeTokens(): string {
    try {
      const uiDir = resolveUiDir(__dirname);
      return fs.readFileSync(path.join(uiDir, "theme-tokens.css"), "utf8");
    } catch {
      return "";
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    const compactUrl = `${this.baseUrl}/?ui=compact`;
    const themeTokens = this.readThemeTokens();
    return `<!DOCTYPE html>
<html lang="en" data-theme="mythiq">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view?.webview.cspSource ?? ""} data: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src ${this.baseUrl};" />
  <style>${themeTokens}</style>
  <style>
    /* Chrome inherits the Console theme: the shared design tokens are inlined
       above (read from disk), and the embedded Console announces the active
       data-theme via postMessage (failsafe.theme). Hardcoded values are
       fallbacks for when the tokens cannot be read. */
    html, body { margin: 0; padding: 0; height: 100%; background: var(--bg-dark, #071539); color: var(--text-main, #f3f7ff); font-family: var(--font-body, "Segoe UI", sans-serif); }
    .shell { display: grid; grid-template-rows: auto auto 1fr; height: 100%; }
    .toolbar { display: flex; gap: 6px; padding: 6px; border-bottom: 1px solid var(--border-rim, rgba(95, 150, 255, 0.35)); background: var(--bg-panel, #0a1f4a); align-items: center; }
    .btn { border: 1px solid var(--glass-border, #3568d8); color: var(--text-main, #eaf1ff); background: var(--bg-deep, #1f4ea8); padding: 5px 8px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 700; white-space: nowrap; line-height: 1.15; }
    .btn:hover { border-color: var(--primary, #3568d8); }
    .btn.secondary { background: var(--bg-deep, #10357a); border-color: var(--border-rim, #2c5bb9); }
    .btn.init { margin-left: auto; background: var(--primary, #ffffff); color: #ffffff; border-color: var(--primary, #ffffff); box-shadow: 0 0 8px var(--primary-glow, rgba(0,0,0,0.25)); }
    .btn.init:hover { box-shadow: 0 0 12px var(--primary-glow, rgba(0,0,0,0.35)); filter: brightness(1.08); }
    .frame-wrap { position: relative; min-height: 0; }
    iframe { border: 0; width: 100%; height: 100%; display: block; background: var(--bg-dark, #071539); }
    .sre-toggle { display:flex; gap:6px; padding:4px 8px; background:var(--bg-panel, #0a1f4a); border-bottom:1px solid var(--border-rim, rgba(95,150,255,0.35)); justify-content:flex-start; }
    .sre-toggle button { flex:0 0 auto; width:auto; padding:3px 12px; border:1px solid var(--glass-border, #3568d8); border-radius:6px; background:var(--bg-deep, #10357a); font-size:10px; font-weight:600; cursor:pointer; color:var(--text-main, #eaf1ff); line-height:1.2; }
    .sre-toggle button[aria-selected="true"] { background:var(--primary, #2c74f2); border-color:var(--primary, #2c74f2); color:#fff; }
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
    const mainFrame = document.getElementById('main-frame');

    // Theme tokens are inlined in <head> (read from disk by the provider); the
    // chrome follows the data-theme the embedded Console announces via the
    // failsafe.theme postMessage handled below.

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
      if (data.type === 'failsafe.theme' && typeof data.theme === 'string') {
        document.documentElement.setAttribute('data-theme', data.theme);
        return;
      }
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
        return;
      }
      // FX916 deep-link relay: only the embedded Monitor iframe may drive it.
      if (data.type === 'failsafe.openConsole' && typeof data.route === 'string'
          && event.source === mainFrame.contentWindow) {
        vscode.postMessage({ command: 'openConsole', route: data.route });
      }
    });

    const sreUrl = '${this.baseUrl}/console/sre';
    const compactUrl = '${compactUrl}';
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
